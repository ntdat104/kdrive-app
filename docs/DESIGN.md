# Kdrive: design notes

This document covers the brainstorming, analysis, and design behind the rewrite.

## 1. Problems with v1

| Area | v1 | Problem |
|---|---|---|
| Metadata | Third-party server (`disbox-server.fly.dev`) keyed by `sha256(webhook)` | Single point of failure. If it goes down, every file becomes unreachable. Nobody can self-host it. |
| Chunk size | 25 MB | Discord lowered the free upload limit to 10 MB, so new uploads fail. |
| Attachment URLs | Stored or shared forever | Discord now signs CDN links (`ex`, `is`, `hm`) and they expire after about 24 hours. |
| Downloads | allorigins.win proxy or extension | Public proxy is slow, unreliable, and sees your data. |
| UX | MUI DataGrid plus Bootstrap, `alert()`/`confirm()` | No previews, move, folder upload, recursive delete, mobile layout, or context menu. |
| Tech | CRA, React 17, plain JS | CRA is deprecated. No types. |

## 2. Goals

1. **No backend.** A webhook URL alone should be enough to restore a drive from any device.
2. Any file type at any size, with resumable-feeling transfers (progress, speed, ETA, cancel, retry).
3. A real file manager: folders, move, rename, trash/restore, star, search, keyboard shortcuts, drag and drop (including whole folders), and multi-select with a marquee.
4. Rich in-browser previews (image, video, audio, PDF, code, Markdown, fonts) and in-place text editing.
5. Optional end-to-end encryption.
6. A polished UI with light/dark/system themes, a Binance-style yellow palette, and layouts that work from mobile up to desktop.

## 3. Key design decisions

### 3.1 The manifest lives on Discord

```
Webhook name:   "My Drive [1234567890123456789]"   ← pointer to the manifest message
Message 1234…:  content "📦 Kdrive manifest · rev 42 …"
                attachment kdrive-manifest.dbx = <header json>\n<gzip(JSON) | AES-GCM(gzip(JSON))>
Other messages: one attachment each = one file chunk (random name, no metadata leak)
```

- Discord lets a webhook rename itself (`PATCH /webhooks/{id}/{token}`), so the webhook's **name** stores the manifest message id. Any device can locate the drive from the URL alone.
- Saves **edit the same message** (`PATCH …/messages/{id}`) with a fresh attachment, so the pointer never changes.
- **Optimistic concurrency:** the revision is written in the message content. Before saving, the client reads the current revision. If it changed, the client raises a `ConflictError` and the UI offers "Load latest" or "Keep mine".
- Saves are debounced (700 ms) and serialized. If a save fails, it retries with backoff, and edits stay in memory. `beforeunload` warns about unsaved changes or active transfers.
- The header line stays plaintext so the client can read the KDF salt before it asks for a passphrase.

### 3.2 Data model

The tree is a flat map, `Record<id, DriveNode>`, with `parentId` links:

- Rename and move are O(1) and never rewrite subtrees.
- `trashedAt` is set only on the top-most trashed node. Its descendants count as trashed implicitly, so restoring is O(1).
- A children index is cached per `nodes` object identity and invalidated after each mutation.
- Each node carries `chunks: {m: messageId, s: size}[]`, an `enc` flag (per file, so legacy and plaintext files can sit in an encrypted drive), an optional webp `thumb` (≤40 KB), and `meta` (dimensions or duration).

### 3.3 Transfers

- Files are sliced (`Blob.slice`, so nothing is fully read into memory) into chunks of 9.5 MiB by default. Chunks can be 49.5 or 99.5 MiB for boosted servers.
- A global semaphore caps parallel chunk uploads (setting, default 3). A second semaphore caps parallel files.
- Uploads use `XMLHttpRequest` for upload progress. Progress events are buffered and flushed to React at about 8 fps.
- Per-route rate limits are tracked from `X-RateLimit-*`. A 429 waits for `retry_after` (global or per route). 5xx and network errors use exponential backoff.
- Cancel aborts in-flight requests and best-effort deletes chunks that were already posted. Retry re-runs with the same `File`.
- Downloads stream chunks in order with a three-chunk prefetch window. On Chromium they stream to `showSaveFilePicker`; elsewhere they assemble a Blob. Folders and multi-selects download as a streamed ZIP (fflate `ZipPassThrough`, no recompression).

### 3.4 Quick previews (low quality first, original after)

Big images (≥400 KB) and videos (≥12 MB) get a second, low-quality rendition at upload. It's stored as its own chunk(s) in `node.preview` with an independent `enc` flag:

- **Images:** resized to ≤1600 px and encoded as WebP q0.8 (JPEG on Safari). For example, a 6.8 MB 4000×3000 PNG becomes 209 KB.
- **Videos:** transcoded in the browser with WebCodecs via [mediabunny](https://mediabunny.dev) (lazy-loaded) to ≤854 px (480p), low bitrate, 30 fps, and a keyframe every 2 s, with fast-start MP4. For example, a 6 MB 720p clip becomes 1 MB. Encoding runs on the CPU while the original uploads over the network. The transfer panel shows "Creating quick preview · n%".
- A rendition that isn't below 60% of the original is dropped. Browsers without `VideoEncoder` skip video previews.

The viewer shows the rendition first (or the grid thumbnail for images without one) with an **SD** badge, downloads the original in the background, then swaps to it (**HD**). Image zoom is kept, and the `<img>` keeps its intrinsic size from metadata. Video resumes at the same time and play state. For originals over 512 MB, it waits for an explicit "Load original". Older images get a rendition automatically the first time they are opened. Videos can get one through *Create quick preview* in the item menu. Renditions are deleted along with the file.

### 3.5 Reading from the Discord CDN (CORS)

`cdn.discordapp.com` sends no CORS headers. `lib/cdn.ts` tries the following strategies:

1. **Proxy** (default `/__cdn?url=…`). A roughly 60-line handler, `server/cdn-proxy.mjs`, that **only** forwards Discord CDN hosts. The same code runs in Vite dev/preview, the Node production server (`server/index.mjs`), and a Cloudflare Worker (`server/worker.mjs`) for static hosting.
2. **Direct**, for when a CORS-unblocking extension is installed.
3. **The legacy Disbox extension.**

The strategy that works is remembered. Signed URLs are cached per message until shortly before their `ex` expiry.

### 3.6 Encryption

PBKDF2-SHA256 (600k iterations) derives an AES-256-GCM key. Each chunk is stored as `iv(12) ‖ ciphertext ‖ tag(16)`. The manifest is encrypted the same way, so names and the folder structure stay private. A wrong passphrase shows up as a GCM tag failure. "Remember on this device" stores the raw key in IndexedDB. Encrypted manifests are never cached in plaintext. Share links are disabled for encrypted files.

### 3.7 Share links

`/share#<base64url(deflate(JSON{name,size,mime,urls}))>`. Everything is in the URL fragment, so no server ever sees it. Links live as long as Discord's signed URLs (about 24 hours), and the UI says so.

### 3.8 Folder and drive sharing

Invite links (`/join#<base64url(deflate(JSON{w,g,n,k?}))>`) let other people open a folder, or the whole drive, inside Kdrive:

- The owner's manifest holds `shares: Record<id, {folderId, perm: 'view' | 'edit'}>`. A link carries only the webhook URL (`w`), the grant id (`g`), a display name and, for encrypted drives, optionally the raw AES key (`k`). Because the permission is looked up in the manifest each time the drive opens, the owner can switch a link between view and edit, or revoke it, after sending it. Deleting a shared folder also removes its links.
- Opening a link adds a drive profile with `shareId` to this browser. `resolveAccess()` turns the grant into `access = {rootId, perm}`. Every view (folder tree, recent, starred, trash, search, breadcrumbs, storage, command palette) is limited to `rootId`'s subtree.
- **View:** all write UI is hidden and `mutate()` throws, so the manifest is never saved. **Edit:** `mutate()` checks that every changed node lies below the shared folder (and is not the folder itself); uploads are checked before any chunk is posted. Invitees can't manage shares or "keep mine" on a conflict, so they can't resurrect a revoked link.
- **Limitation:** there is no backend, so the link has to contain the webhook URL, which Discord treats as full write access. View-only and folder scoping are enforced by the Kdrive app, not by Discord. Revoking stops Kdrive from opening the link; to cut off someone completely, move the files to a new webhook. The share dialog says so.

### 3.9 Migration from v1

`lib/legacy.ts` reads the old tree from the v1 server (read-only), converts message-id lists to chunk references (computing sizes from the old 25 MB chunking), and imports it, either during setup or later from Settings.

## 4. UX design

- **Layout:** a sidebar (New menu, nav with counts, live folder tree with drop targets, storage breakdown, drive switcher), a top bar (search with filter syntax, save-state cloud, theme, settings), the main listing, and an optional details panel. On mobile, the sidebar becomes a drawer and details becomes a sheet.
- **Selection model** like a desktop OS: click, Ctrl/⌘-click, Shift-range, marquee drag, arrow keys with geometric up/down movement in the grid, and Shift+arrows to extend. A floating selection bar appears with contextual actions.
- **One action model** (`actions.ts` plus `menu.tsx`) feeds the right-click menu, the ⋯ menu, the selection bar, the command palette, and keyboard shortcuts, so they never drift apart.
- **Reversible by default:** trash and move show an **Undo** toast. Permanent deletion needs a confirm dialog.
- **Feedback:** uploads appear as ghost tiles with progress rings in the folder they target. The transfer panel shows speed and ETA.
- **Previews:** a full-screen viewer with ←/→ gallery navigation. Images support zoom (wheel, buttons, double-click), pan, and rotate. Large files ask before loading. Previews come from an in-memory LRU cache (400 MB).
- **Theme:** semantic tokens (`bg`, `surface`, `line`, `fg`, `muted`, …) are swapped by `.dark`. Surfaces are neutral charcoal in dark mode (`#0B0E11 → #2B3139`). The **accent** (yellow by default, plus orange, green, blue, red, purple, indigo) is a separate axis, set by `<html data-accent>`. Each accent defines a full `--brand-50…950` ramp plus `--on-brand`, and Tailwind's `brand-*` utilities resolve through these variables, so no component knows the actual color. Light accents (yellow, orange, green) put dark text on solid fills. Dark accents use their 600 tone as the solid so white text passes AA. Text on light surfaces uses 700/800, and text on dark surfaces uses 300/400. The logo, favicon and `theme-color` follow the accent. A pre-paint script applies theme, accent and language before React loads. Contrast was checked for all 7 accents in both themes.

## 5. Internationalization

- `t('English text', params)` uses gettext-style keys. `src/i18n/vi.ts` translates every key, and `MessageKey = keyof typeof vi`, so a string with no translation is a **type error**. `en.ts` only adds plural forms (`{ one, other }` picked by `params.n`).
- The language lives in the settings store (default `vi`). Changing it sets `<html lang>` and the `Intl` locale for dates, and remounts the router tree (`key={lang}`) so every `t()` call re-evaluates. No hook is needed, and stores, actions and errors can call `t()` directly.
- Module-level constants keep untranslated keys (`MessageKey`) and translate at render time.
- Data stays language-neutral: the root folder is stored as "My Drive" and shown through `displayName()`.

## 6. Known limitations

- Last-writer-wins is detected but not merged automatically. The user picks a version.
- The original video still downloads fully before it replaces the quick preview (no Range streaming via Service Worker yet).
- Share links expire with Discord's signed URLs.
- Discord can delete content that violates its ToS. Kdrive is not a backup of last resort.

## 7. Desktop app (Tauri)

The desktop app runs the web app's React code unchanged inside the OS webview (WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux). The shell only supplies what a browser tab gets from its host:

- **CDN reads:** `src-tauri/src/cdn_proxy.rs` is the Rust twin of `server/cdn-proxy.mjs`. It listens on `127.0.0.1:<random port>/<random token>`, forwards only HTTPS requests to Discord CDN hosts, and streams the body so download progress stays smooth. Its URL is injected as `window.__KDRIVE__.cdnProxy` before the page loads and becomes `DEFAULT_PROXY`. The port changes every launch, so the setting stores an empty string for "built-in".
- **Saving files:** `src/platform/desktop.ts` installs `window.showSaveFilePicker`, backed by `saves.rs`: the native dialog picks the path (the page never passes one), and each `write()` sends raw bytes over IPC to an append-only file. The download code in `transfers.ts` and `SharePage` is the web code. Cancelling deletes the partial file.
- **Links:** without a web origin, share and invite links use `kdrive://share#…` / `kdrive://join#…`, registered with `tauri-plugin-deep-link`; `tauri-plugin-single-instance` forwards them to the running window. `linkRoute()` accepts web and `kdrive://` links alike, from deep links, paste, or the "Open a Kdrive link" dialog. Setting a web app address makes links point there instead.
- **Webview gaps:** clipboard writes after an `await` go through `tauri-plugin-clipboard-manager`; `target=_blank` links open in the default browser; OS file drops reach the page as HTML5 drag and drop (`disable_drag_drop_handler`); the `beforeunload` guard becomes a close-requested handler that flushes pending saves and asks before cancelling transfers.
