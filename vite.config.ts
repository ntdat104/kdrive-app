import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Tauri expects a fixed dev-server port; TAURI_DEV_HOST is set when developing on a device.
const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Keep Rust compiler errors visible in the terminal.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    // WebView2 (Windows) is Chromium; macOS and Linux run WebKit (Safari 16+ engine).
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome111' : 'safari16',
    chunkSizeWarningLimit: 900,
  },
})
