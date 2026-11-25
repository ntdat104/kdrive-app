# Releasing

## Every push: test builds

`.github/workflows/build.yml` runs on every push and pull request. It type-checks and lints, then
builds macOS (universal), Linux and Windows. Download the installers from the run's **Artifacts**
section (Actions → Build → the run). Artifacts are kept for 90 days by default.

## Versioned release

1. Bump the version in `package.json` (`"version"`). `src-tauri/tauri.conf.json` reads it from there;
   keep `src-tauri/Cargo.toml` in sync for tidiness.
2. Commit, tag and push:
   ```bash
   git commit -am "chore: release v2.0.1"
   git tag v2.0.1
   git push origin main v2.0.1
   ```
3. `.github/workflows/release.yml` builds every OS and creates a **draft** release named
   `Kdrive v2.0.1` with all installers attached.
4. Open **Releases**, check the assets (`.dmg`, `.AppImage`, `.deb`, `.rpm`, `.exe`, `.msi`), write
   the notes, and click **Publish release**.

| Platform | Files |
|---|---|
| macOS | `Kdrive_<version>_universal.dmg` |
| Linux | `Kdrive_<version>_amd64.AppImage`, `Kdrive_<version>_amd64.deb`, `Kdrive-<version>-1.x86_64.rpm` |
| Windows | `Kdrive_<version>_x64-setup.exe` (NSIS), `Kdrive_<version>_x64_en-US.msi` |

## Share links pointing at the web app

By default the desktop app creates `kdrive://` links, which only open in the app. If you host the
Kdrive web app, set the repository variable **`KDRIVE_WEB_URL`** (e.g. `https://kdrive.example.com`)
under Settings → Secrets and variables → Actions → Variables. Both workflows pass it to the build,
so links open in any browser. Users can still change it in Settings → Network.

## Optional: code signing

Unsigned builds work but show first-launch warnings (see README). To sign:

- **macOS:** add the secrets `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
  `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` and uncomment them in
  `release.yml`.
- **Windows:** configure a certificate as described in the Tauri docs.

See <https://tauri.app/distribute/>.

## Building locally

You can only build for the OS you are on:

```bash
npm install
npm run tauri build      # output in src-tauri/target/release/bundle/
```
