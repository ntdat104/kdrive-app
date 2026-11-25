//! Loopback CORS proxy for Discord attachment CDNs, the desktop twin of the web build's
//! `server/cdn-proxy.mjs`. Bodies are streamed so the UI sees download progress per packet.
//! It listens on a random 127.0.0.1 port behind a random path token, and only forwards
//! HTTPS requests to Discord-owned CDN hosts.

use std::{io, thread, time::Duration};

use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

const ALLOWED_HOSTS: [&str; 3] = ["cdn.discordapp.com", "media.discordapp.net", "cdn.discord.com"];
const FORWARDED_HEADERS: [&str; 4] = ["content-type", "content-length", "content-range", "accept-ranges"];

/// Starts the proxy and returns its URL template (`{url}` is replaced by the encoded CDN link).
pub fn start() -> io::Result<String> {
    let server = Server::http("127.0.0.1:0").map_err(|e| io::Error::other(e.to_string()))?;
    let port = server
        .server_addr()
        .to_ip()
        .map(|addr| addr.port())
        .ok_or_else(|| io::Error::other("proxy is not bound to an IP address"))?;
    let token = uuid::Uuid::new_v4().simple().to_string();
    let path = format!("/{token}");
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(20))
        .timeout_read(Duration::from_secs(60))
        .redirects(0)
        .build();

    thread::Builder::new().name("kdrive-cdn-proxy".into()).spawn(move || {
        for request in server.incoming_requests() {
            let agent = agent.clone();
            let path = path.clone();
            let _ = thread::Builder::new()
                .name("kdrive-cdn-request".into())
                .spawn(move || handle(request, &agent, &path));
        }
    })?;

    Ok(format!("http://127.0.0.1:{port}/{token}?url={{url}}"))
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("valid header")
}

fn cors_headers() -> Vec<Header> {
    vec![
        header("access-control-allow-origin", "*"),
        header("access-control-allow-methods", "GET, HEAD, OPTIONS"),
        header("access-control-allow-headers", "range"),
        header("access-control-allow-private-network", "true"),
        header("access-control-expose-headers", "content-length, content-range, content-type, x-kdrive-proxy"),
    ]
}

fn text(status: u16, body: &str) -> Response<io::Cursor<Vec<u8>>> {
    let mut response = Response::from_string(body).with_status_code(StatusCode(status));
    for h in cors_headers() {
        response.add_header(h);
    }
    response
}

fn target_url(raw_url: &str, path: &str) -> Option<String> {
    let (req_path, query) = raw_url.split_once('?').unwrap_or((raw_url, ""));
    if req_path != path {
        return None;
    }
    let target = url::form_urlencoded::parse(query.as_bytes()).find(|(k, _)| k == "url")?.1.into_owned();
    let parsed = url::Url::parse(&target).ok()?;
    let allowed = parsed.scheme() == "https" && parsed.host_str().is_some_and(|h| ALLOWED_HOSTS.contains(&h));
    allowed.then_some(target)
}

fn handle(request: Request, agent: &ureq::Agent, path: &str) {
    if *request.method() == Method::Options {
        let _ = request.respond(text(204, ""));
        return;
    }
    let Some(target) = target_url(request.url(), path) else {
        let _ = request.respond(text(400, "Only Discord CDN URLs are allowed"));
        return;
    };

    let mut upstream = agent.request(request.method().as_str(), &target);
    if let Some(range) = request.headers().iter().find(|h| h.field.equiv("range")) {
        upstream = upstream.set("range", range.value.as_str());
    }
    let response = match upstream.call() {
        Ok(response) | Err(ureq::Error::Status(_, response)) => response,
        Err(err) => {
            let _ = request.respond(text(502, &format!("Proxy error: {err}")));
            return;
        }
    };

    let status = response.status();
    let mut headers = cors_headers();
    headers.push(header("x-kdrive-proxy", "1"));
    for name in FORWARDED_HEADERS {
        if let Some(value) = response.header(name) {
            headers.push(header(name, value));
        }
    }
    let length = response.header("content-length").and_then(|v| v.parse().ok());
    let body = Response::new(StatusCode(status), headers, response.into_reader(), length, None);
    // Fails when the page aborts the download; dropping the reader closes the upstream connection.
    let _ = request.respond(body);
}
