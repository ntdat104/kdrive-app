import { abortError, sleep } from './utils'
import { t } from '../i18n'

export interface DiscordAttachment {
  id: string
  filename: string
  size: number
  url: string
  proxy_url: string
  content_type?: string
}

export interface DiscordMessage {
  id: string
  content: string
  channel_id: string
  timestamp: string
  attachments: DiscordAttachment[]
}

export interface WebhookInfo {
  id: string
  name: string | null
  avatar: string | null
  channel_id: string
  guild_id?: string
  application_id: string | null
}

export class DiscordError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const WEBHOOK_RE = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/(\d+)\/([\w-]+)\/?$/

export function parseWebhookUrl(url: string) {
  const match = url.trim().match(WEBHOOK_RE)
  if (!match) return null
  return { id: match[1], token: match[2] }
}

/** The canonical form used for hashing (legacy import) and dedupe. */
export function canonicalWebhookUrl(url: string) {
  const parsed = parseWebhookUrl(url)
  if (!parsed) throw new Error(t('Invalid webhook URL'))
  return `https://discord.com/api/webhooks/${parsed.id}/${parsed.token}`
}

interface RequestOptions {
  method?: string
  body?: BodyInit
  json?: unknown
  signal?: AbortSignal
  onUploadProgress?: (loaded: number, total: number) => void
}

interface RawResponse {
  status: number
  header(name: string): string | null
  text: string
}

const MAX_RETRIES = 6

/**
 * Discord webhook client with per-route rate limit tracking.
 *
 * Every request is retried on 429, 5xx and network errors. Uploads go through
 * XMLHttpRequest because fetch() cannot report upload progress.
 */
export class WebhookClient {
  readonly id: string
  readonly token: string
  private readonly base: string
  private buckets = new Map<string, number>() // route key -> unix ms when it frees up
  private globalUntil = 0

  constructor(webhookUrl: string) {
    const parsed = parseWebhookUrl(webhookUrl)
    if (!parsed) throw new Error(t('Invalid webhook URL'))
    this.id = parsed.id
    this.token = parsed.token
    this.base = `https://discord.com/api/v10/webhooks/${parsed.id}/${parsed.token}`
  }

  private async waitForBucket(key: string, signal?: AbortSignal) {
    for (;;) {
      const until = Math.max(this.buckets.get(key) ?? 0, this.globalUntil)
      const wait = until - Date.now()
      if (wait <= 0) return
      await sleep(wait + 50, signal)
    }
  }

  private send(path: string, opts: RequestOptions): Promise<RawResponse> {
    return new Promise((resolve, reject) => {
      if (opts.signal?.aborted) return reject(abortError())
      const xhr = new XMLHttpRequest()
      xhr.open(opts.method ?? 'GET', `${this.base}${path}`)
      let body: XMLHttpRequestBodyInit | null = (opts.body as XMLHttpRequestBodyInit) ?? null
      if (opts.json !== undefined) {
        xhr.setRequestHeader('Content-Type', 'application/json')
        body = JSON.stringify(opts.json)
      }
      if (opts.onUploadProgress) {
        const cb = opts.onUploadProgress
        xhr.upload.onprogress = (e) => cb(e.loaded, e.total)
      }
      const onAbort = () => xhr.abort()
      opts.signal?.addEventListener('abort', onAbort, { once: true })
      const cleanup = () => opts.signal?.removeEventListener('abort', onAbort)
      xhr.onload = () => {
        cleanup()
        resolve({ status: xhr.status, header: (n) => xhr.getResponseHeader(n), text: xhr.responseText })
      }
      xhr.onerror = () => {
        cleanup()
        reject(new TypeError(t('Network error')))
      }
      xhr.onabort = () => {
        cleanup()
        reject(abortError())
      }
      xhr.send(body)
    })
  }

  async request<T = unknown>(route: string, path: string, opts: RequestOptions = {}): Promise<T> {
    let attempt = 0
    for (;;) {
      await this.waitForBucket(route, opts.signal)
      let res: RawResponse
      try {
        res = await this.send(path, opts)
      } catch (err) {
        if (opts.signal?.aborted || attempt >= MAX_RETRIES) throw err
        attempt++
        await sleep(Math.min(1000 * 2 ** attempt, 15_000), opts.signal)
        continue
      }

      const remaining = res.header('X-RateLimit-Remaining')
      const resetAfter = Number(res.header('X-RateLimit-Reset-After') ?? 0)
      if (remaining === '0' && resetAfter > 0) this.buckets.set(route, Date.now() + resetAfter * 1000)

      if (res.status === 429) {
        let retryAfter = 1
        let global = false
        try {
          const data = JSON.parse(res.text)
          retryAfter = Number(data.retry_after ?? 1)
          global = Boolean(data.global)
        } catch {
          retryAfter = Number(res.header('Retry-After') ?? 1)
        }
        const until = Date.now() + retryAfter * 1000
        if (global) this.globalUntil = until
        else this.buckets.set(route, until)
        if (attempt++ >= MAX_RETRIES * 2) throw new DiscordError(t('Rate limited by Discord, try again later'), 429)
        continue
      }
      if (res.status >= 500 && attempt < MAX_RETRIES) {
        attempt++
        await sleep(Math.min(1000 * 2 ** attempt, 15_000), opts.signal)
        continue
      }
      if (res.status >= 400) {
        let message = t('Discord responded with {status}', { status: res.status })
        try {
          const data = JSON.parse(res.text)
          if (data.message) message = `${data.message} (${res.status})`
        } catch {
          /* keep default */
        }
        throw new DiscordError(message, res.status)
      }
      if (res.status === 204 || !res.text) return undefined as T
      return JSON.parse(res.text) as T
    }
  }

  getInfo(signal?: AbortSignal) {
    return this.request<WebhookInfo>('webhook', '', { signal })
  }

  rename(name: string) {
    return this.request<WebhookInfo>('webhook:patch', '', { method: 'PATCH', json: { name } })
  }

  getMessage(id: string, signal?: AbortSignal) {
    return this.request<DiscordMessage>('message:get', `/messages/${id}`, { signal })
  }

  deleteMessage(id: string) {
    return this.request<void>('message:delete', `/messages/${id}`, { method: 'DELETE' })
  }

  /** Posts a message carrying a single attachment. */
  sendFile(
    filename: string,
    blob: Blob,
    opts: { content?: string; signal?: AbortSignal; onProgress?: (loaded: number, total: number) => void } = {},
  ) {
    const form = new FormData()
    form.append('payload_json', JSON.stringify({ content: opts.content ?? '', attachments: [{ id: 0, filename }] }))
    form.append('files[0]', blob, filename)
    return this.request<DiscordMessage>('message:post', '?wait=true', {
      method: 'POST',
      body: form,
      signal: opts.signal,
      onUploadProgress: opts.onProgress,
    })
  }

  /** Replaces the content and attachment of an existing webhook message. */
  editFile(messageId: string, filename: string, blob: Blob, content: string) {
    const form = new FormData()
    form.append('payload_json', JSON.stringify({ content, attachments: [{ id: 0, filename }] }))
    form.append('files[0]', blob, filename)
    return this.request<DiscordMessage>('message:patch', `/messages/${messageId}`, { method: 'PATCH', body: form })
  }
}

/** Attachment URLs are signed and expire; `ex` is a hex unix timestamp. */
export function attachmentExpiry(url: string) {
  try {
    const ex = new URL(url).searchParams.get('ex')
    return ex ? parseInt(ex, 16) * 1000 : Date.now() + 12 * 3600_000
  } catch {
    return Date.now()
  }
}

export function webhookAvatarUrl(info: Pick<WebhookInfo, 'id' | 'avatar'>) {
  return info.avatar ? `https://cdn.discordapp.com/avatars/${info.id}/${info.avatar}.png?size=128` : null
}
