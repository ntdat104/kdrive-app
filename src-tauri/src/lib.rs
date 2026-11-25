mod cdn_proxy;
mod saves;

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // WebKitGTK's DMA-BUF renderer shows a blank window on many GPU/driver combos (and in AppImages).
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    // Discord's CDN sends no CORS headers; the web build ships a proxy at /__cdn, the app runs its own.
    let cdn_proxy = cdn_proxy::start().expect("failed to start the Discord CDN proxy");

    let mut builder = tauri::Builder::default();
    // Must be the first plugin: a second launch (e.g. from a kdrive:// link) focuses this window instead.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .manage(saves::Saves::default())
        .invoke_handler(tauri::generate_handler![
            saves::save_begin,
            saves::save_write,
            saves::save_close,
            saves::save_abort,
        ])
        .setup(move |app| {
            // macOS registers the scheme from Info.plist; Linux (AppImage) and Windows dev builds need it at runtime.
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register_all();
            }

            let config = serde_json::json!({ "cdnProxy": cdn_proxy });
            WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("Kdrive")
                .inner_size(1280.0, 820.0)
                .min_inner_size(400.0, 560.0)
                .center()
                // Let the page receive OS file drops as HTML5 drag & drop, exactly like the web app.
                .disable_drag_drop_handler()
                .initialization_script(&format!("window.__KDRIVE__ = Object.freeze({config});"))
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Kdrive");
}
