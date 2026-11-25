import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { openUrl } from '@tauri-apps/plugin-opener'
import { invoke } from '@tauri-apps/api/core'

/**
 * The desktop shell runs the web app unchanged. Browser APIs that webviews lack or restrict
 * (save picker, clipboard after an await, opening new tabs) are bridged to Tauri here, so the
 * shared code keeps calling the standard APIs.
 */

declare global {
  interface Window {
    /** Injected by src-tauri/src/lib.rs before the page loads. */
    __KDRIVE__?: { cdnProxy: string }
  }
}

export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** URL template of the app's loopback Discord CDN proxy. */
export const nativeCdnProxy = typeof window !== 'undefined' ? window.__KDRIVE__?.cdnProxy : undefined

type WriteData = BufferSource | Blob | string | { type: 'write'; data: BufferSource | Blob | string }

async function toBytes(data: WriteData): Promise<Uint8Array> {
  if (typeof data === 'string') return new TextEncoder().encode(data)
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer())
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (ArrayBuffer.isView(data)) {
    const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    // Tauri sends the whole underlying buffer, so hand it a tight copy when the view is partial.
    return view.byteLength === data.buffer.byteLength ? view : view.slice()
  }
  return toBytes(data.data)
}

/** Enough of FileSystemWritableFileStream for transfers.ts, SharePage and downloadBlob. */
function nativeWritable(id: number) {
  let chain = Promise.resolve()
  const enqueue = (fn: () => Promise<unknown>) => (chain = chain.then(() => fn().then(() => {})))
  return {
    write: (data: WriteData) => enqueue(async () => invoke('save_write', await toBytes(data), { headers: { 'x-save-id': String(id) } })),
    close: () => enqueue(() => invoke('save_close', { id })),
    abort: () => (chain = chain.catch(() => {}).then(() => invoke('save_abort', { id }))),
  }
}

async function showSaveFilePicker(options?: { suggestedName?: string }) {
  const name = options?.suggestedName || 'download'
  const id = await invoke<number | null>('save_begin', { name })
  if (id == null) throw new DOMException('The user aborted a request.', 'AbortError')
  return { kind: 'file', name, createWritable: async () => nativeWritable(id) }
}

/** Saves a blob through the native dialog. Resolves false when the user cancels. */
export async function saveBlob(blob: Blob, name: string) {
  let handle
  try {
    handle = await showSaveFilePicker({ suggestedName: name })
  } catch {
    return false
  }
  const writable = await handle.createWritable()
  try {
    await writable.write(blob)
    await writable.close()
  } catch (err) {
    await writable.abort()
    throw err
  }
  return true
}

function isExternal(href: string) {
  try {
    const url = new URL(href, location.href)
    return url.origin !== location.origin && /^(https?|mailto):$/.test(url.protocol)
  } catch {
    return false
  }
}

export function installDesktop() {
  if (!isDesktop) return
  document.documentElement.classList.add('desktop')

  Object.defineProperty(window, 'showSaveFilePicker', { value: showSaveFilePicker, configurable: true })

  // WebKit drops clipboard writes that happen after an await (the share dialogs do that).
  const clipboard = { writeText: (text: string) => writeText(text) }
  if (navigator.clipboard) Object.assign(navigator.clipboard, clipboard)
  else Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true })

  // Webviews ignore target=_blank; open external links in the default browser instead.
  document.addEventListener(
    'click',
    (e) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || !isExternal(a.href)) return
      e.preventDefault()
      void openUrl(a.href)
    },
    true,
  )
  const open = window.open.bind(window)
  window.open = (url?: string | URL, ...rest) => {
    if (url && isExternal(String(url))) {
      void openUrl(String(url))
      return null
    }
    return open(url, ...rest)
  }
}
