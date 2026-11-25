import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { toast } from 'sonner'
import { t } from '../i18n'
import { isDesktop, saveBlob } from '../platform/desktop'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(abortError())
      },
      { once: true },
    )
  })
}

export function abortError() {
  return new DOMException('The operation was aborted.', 'AbortError')
}

export function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError'
}

export function errorMessage(err: unknown) {
  if (err instanceof Error) return err.message
  return String(err)
}

export function uid(size = 12) {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'
  const bytes = crypto.getRandomValues(new Uint8Array(size))
  let out = ''
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return out
}

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

export function formatSize(bytes: number | undefined, decimals = 1) {
  if (bytes === undefined || Number.isNaN(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), SIZE_UNITS.length - 1)
  const value = bytes / 1024 ** i
  return `${value.toFixed(value >= 100 ? 0 : decimals)} ${SIZE_UNITS[i]}`
}

export function formatSpeed(bytesPerSecond: number) {
  return `${formatSize(bytesPerSecond)}/s`
}

export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  if (seconds < 60) return `${Math.ceil(seconds)}s`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m ${Math.round(seconds % 60)}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

let relative = new Intl.RelativeTimeFormat('vi-VN', { numeric: 'auto' })
let dateFmt = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' })
let dateTimeFmt = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' })

export function setFormatLocale(locale: string) {
  relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' })
  dateTimeFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatRelative(ts: number) {
  const diff = (ts - Date.now()) / 1000
  const abs = Math.abs(diff)
  if (abs < 45) return relative.format(0, 'second')
  if (abs < 3600) return relative.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return relative.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 7) return relative.format(Math.round(diff / 86400), 'day')
  return dateFmt.format(ts)
}

export function formatDateTime(ts: number) {
  return dateTimeFmt.format(ts)
}

export function splitName(name: string) {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return { base: name, ext: '' }
  return { base: name.slice(0, dot), ext: name.slice(dot + 1) }
}

export function extOf(name: string) {
  return splitName(name).ext.toLowerCase()
}

export function validateName(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return t('Name cannot be empty')
  if (trimmed.includes('/')) return t('Name cannot contain "/"')
  if (trimmed === '.' || trimmed === '..') return t('Invalid name')
  if (trimmed.length > 255) return t('Name is too long')
  return null
}

export function toBase64Url(bytes: Uint8Array) {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(input: string) {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Runs `worker` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>) {
  const results: R[] = Array.from({ length: items.length })
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

/** Counting semaphore shared across transfers, so total parallel requests stay bounded. */
export class Semaphore {
  private queue: (() => void)[] = []
  private active = 0
  limit: number
  constructor(limit: number) {
    this.limit = limit
  }

  async acquire(signal?: AbortSignal) {
    if (this.active < this.limit) {
      this.active++
      return
    }
    await new Promise<void>((resolve, reject) => {
      const grant = () => {
        signal?.removeEventListener('abort', onAbort)
        this.active++
        resolve()
      }
      const onAbort = () => {
        this.queue = this.queue.filter((g) => g !== grant)
        reject(abortError())
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      this.queue.push(grant)
    })
  }

  release() {
    this.active--
    while (this.active < this.limit && this.queue.length) this.queue.shift()!()
  }

  async run<T>(fn: () => Promise<T>, signal?: AbortSignal) {
    await this.acquire(signal)
    try {
      return await fn()
    } finally {
      this.release()
    }
  }
}

export function downloadBlob(blob: Blob, name: string) {
  if (isDesktop) return void saveBlob(blob, name).catch((err) => toast.error(errorMessage(err)))
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function isMac() {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
}

export const modKey = () => (isMac() ? '⌘' : 'Ctrl')
