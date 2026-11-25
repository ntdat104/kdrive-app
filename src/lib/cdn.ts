import { abortError } from './utils'
import { t } from '../i18n'
import { nativeCdnProxy } from '../platform/desktop'

/**
 * Discord's attachment CDN does not send CORS headers, so the browser needs a
 * helper to read file bytes. Strategies, in the order `auto` tries them:
 *  - proxy:     a CORS proxy (the desktop app's built-in loopback proxy, /__cdn on the web, a Cloudflare Worker, ...)
 *  - direct:    plain fetch, works if Discord ever enables CORS or via a CORS-unblocking extension
 *  - extension: the legacy Disbox v1 browser extension
 */
export type CdnMode = 'auto' | 'proxy' | 'direct' | 'extension'

export const DEFAULT_PROXY = nativeCdnProxy ?? '/__cdn?url={url}'
const EXTENSION_ID = 'jklpfhklkhbfgeencifbmkoiaokeieah'

let config: { mode: CdnMode; proxy: string } = { mode: 'auto', proxy: DEFAULT_PROXY }
let workingStrategy: Exclude<CdnMode, 'auto'> | null = null

export function configureCdn(next: { mode: CdnMode; proxy: string }) {
  if (next.mode !== config.mode || next.proxy !== config.proxy) workingStrategy = null
  config = { mode: next.mode, proxy: next.proxy || DEFAULT_PROXY }
}

export class CdnError extends Error {}

function proxied(url: string) {
  const template = config.proxy
  return template.includes('{url}') ? template.replace('{url}', encodeURIComponent(url)) : template + encodeURIComponent(url)
}

declare const chrome: { runtime?: { sendMessage: (id: string, msg: unknown, cb: (r: unknown) => void) => void } } | undefined

async function viaExtension(url: string): Promise<Response> {
  const runtime = typeof chrome !== 'undefined' ? chrome?.runtime : undefined
  if (!runtime?.sendMessage) throw new CdnError(t('Disbox extension not installed'))
  const data = await new Promise<string | null>((resolve) => {
    try {
      runtime.sendMessage(EXTENSION_ID, { message: { url } }, (response) => {
        const r = response as { data?: string } | undefined
        resolve(r && 'data' in r && r.data ? r.data : null)
      })
    } catch {
      resolve(null)
    }
  })
  if (!data) throw new CdnError(t('Disbox extension did not respond'))
  return fetch(data)
}

async function attempt(strategy: Exclude<CdnMode, 'auto'>, url: string, signal?: AbortSignal) {
  if (strategy === 'extension') return viaExtension(url)
  const res = await fetch(strategy === 'proxy' ? proxied(url) : url, { signal })
  // A static host without the proxy answers with index.html; treat as "proxy unavailable".
  if (strategy === 'proxy' && (res.headers.get('content-type') ?? '').includes('text/html') && !res.headers.get('x-kdrive-proxy')) {
    throw new CdnError(t('CDN proxy is not available on this host'))
  }
  return res
}

async function openStream(url: string, signal?: AbortSignal): Promise<Response> {
  const order: Exclude<CdnMode, 'auto'>[] =
    config.mode !== 'auto' ? [config.mode] : workingStrategy ? [workingStrategy] : ['proxy', 'direct', 'extension']
  let lastError: unknown = null
  for (const strategy of order) {
    try {
      const res = await attempt(strategy, url, signal)
      if (!res.ok) throw new CdnError(t('CDN responded with {status}', { status: res.status }))
      if (config.mode === 'auto') workingStrategy = strategy
      return res
    } catch (err) {
      if (signal?.aborted) throw abortError()
      lastError = err
    }
  }
  if (config.mode === 'auto' && workingStrategy) {
    // The remembered strategy stopped working; forget it and retry the full chain once.
    workingStrategy = null
    return openStream(url, signal)
  }
  throw new CdnError(
    t('Could not download from Discord CDN ({reason}). Configure a CDN proxy in Settings → Network.', {
      reason: lastError instanceof Error ? lastError.message : t('blocked by CORS'),
    }),
  )
}

/** Downloads an attachment, reporting incremental bytes received. */
export async function fetchAttachment(url: string, opts: { signal?: AbortSignal; onBytes?: (delta: number) => void } = {}) {
  const res = await openStream(url, opts.signal)
  if (!res.body || !opts.onBytes) {
    const buf = await res.arrayBuffer()
    opts.onBytes?.(buf.byteLength)
    return new Uint8Array(buf)
  }
  const reader = res.body.getReader()
  const parts: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
    total += value.byteLength
    opts.onBytes(value.byteLength)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.byteLength
  }
  return out
}
