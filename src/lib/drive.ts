import { fetchAttachment } from './cdn'
import { decryptBytes, encryptBytes, type KdfParams } from './crypto'
import { attachmentExpiry, DiscordError, WebhookClient, type WebhookInfo } from './discord'
import { idb } from './idb'
import {
  decodeManifestPayload,
  emptyManifest,
  encodeManifest,
  readManifestHeader,
  type DriveNode,
  type Manifest,
} from './manifest'
import { uid } from './utils'
import { t } from '../i18n'

/**
 * A drive is one Discord webhook. File chunks are webhook messages with a single
 * attachment. The manifest (the whole folder tree) is a gzip'd JSON attachment on
 * one dedicated message, whose id is stored in the webhook's own name as
 * `<drive name> [<message id>]`, so any device can find it from the webhook URL alone.
 */

const POINTER_RE = /\[(\d{15,25})\]/
const MANIFEST_FILENAME = 'kdrive-manifest.bin'

export function pointerFromName(name: string | null) {
  return name?.match(POINTER_RE)?.[1] ?? null
}

function manifestContent(rev: number) {
  return `📦 **Kdrive manifest** · rev ${rev} · ${new Date().toISOString()}\n-# Do not delete this message — it indexes every file in this drive.`
}

function revFromContent(content: string) {
  const m = content.match(/rev (\d+)/)
  return m ? Number(m[1]) : -1
}

export class ConflictError extends Error {
  constructor() {
    super(t('This drive was changed from another device'))
  }
}

export interface RemoteManifest {
  messageId: string
  rev: number
  kdf?: KdfParams
  payload: Uint8Array
}

export class DriveSession {
  readonly client: WebhookClient
  readonly webhookUrl: string
  manifestId: string
  baseRev: number
  key?: CryptoKey
  kdf?: KdfParams
  private urlCache = new Map<string, { url: string; expires: number }>()

  constructor(webhookUrl: string, manifestId: string, baseRev: number, enc?: { key: CryptoKey; kdf: KdfParams }) {
    this.webhookUrl = webhookUrl
    this.client = new WebhookClient(webhookUrl)
    this.manifestId = manifestId
    this.baseRev = baseRev
    this.key = enc?.key
    this.kdf = enc?.kdf
  }

  get encrypted() {
    return Boolean(this.key)
  }

  /* ----------------------------- Discovery ----------------------------- */

  static async inspect(webhookUrl: string, signal?: AbortSignal): Promise<{ info: WebhookInfo; remote: RemoteManifest | null }> {
    const client = new WebhookClient(webhookUrl)
    const info = await client.getInfo(signal)
    const pointer = pointerFromName(info.name)
    if (!pointer) return { info, remote: null }
    const remote = await DriveSession.fetchRemote(client, pointer, signal).catch((err) => {
      if (err instanceof DiscordError && err.status === 404) return null
      throw err
    })
    return { info, remote }
  }

  static async fetchRemote(client: WebhookClient, messageId: string, signal?: AbortSignal): Promise<RemoteManifest> {
    const message = await client.getMessage(messageId, signal)
    const attachment = message.attachments[0]
    if (!attachment) throw new Error(t('Manifest message has no attachment'))
    const bytes = await fetchAttachment(attachment.url, { signal })
    const { header, payload } = readManifestHeader(bytes)
    return { messageId, rev: revFromContent(message.content), kdf: header.enc, payload }
  }

  /** Creates a brand-new drive on an unused webhook. */
  static async create(webhookUrl: string, opts: { enc?: { key: CryptoKey; kdf: KdfParams }; seed?: Manifest; driveName?: string }) {
    const client = new WebhookClient(webhookUrl)
    const enc = opts.enc
    const manifest = opts.seed ?? emptyManifest()
    manifest.rev = 1
    const blob = await encodeManifest(manifest, enc && { key: enc.key, params: enc.kdf })
    const message = await client.sendFile(MANIFEST_FILENAME, blob, { content: manifestContent(1) })
    await client.rename(`${(opts.driveName || 'Kdrive').slice(0, 50)} [${message.id}]`)
    const session = new DriveSession(webhookUrl, message.id, 1, enc)
    return { session, manifest }
  }

  static async unlock(webhookUrl: string, remote: RemoteManifest, key?: CryptoKey) {
    let enc: { key: CryptoKey; kdf: KdfParams } | undefined
    if (remote.kdf) {
      if (!key) throw new Error(t('This drive is encrypted — a passphrase is required'))
      enc = { key, kdf: remote.kdf }
    }
    const manifest = await decodeManifestPayload(remote.payload, enc?.key)
    manifest.rev = Math.max(manifest.rev, remote.rev)
    return { session: new DriveSession(webhookUrl, remote.messageId, manifest.rev, enc), manifest }
  }

  /* ----------------------------- Manifest ------------------------------ */

  async reloadManifest() {
    const remote = await DriveSession.fetchRemote(this.client, this.manifestId)
    const manifest = await decodeManifestPayload(remote.payload, this.key)
    manifest.rev = Math.max(manifest.rev, remote.rev)
    this.baseRev = manifest.rev
    return manifest
  }

  async remoteRev() {
    return revFromContent((await this.client.getMessage(this.manifestId)).content)
  }

  /** Persists the manifest. Throws ConflictError if someone else saved in between, unless `force`. */
  async saveManifest(manifest: Manifest, force = false) {
    if (!force) {
      const remote = await this.remoteRev()
      if (remote !== -1 && remote !== this.baseRev) throw new ConflictError()
    }
    const rev = (force ? Math.max(this.baseRev, await this.remoteRev()) : this.baseRev) + 1
    const next: Manifest = { ...manifest, rev, updatedAt: Date.now() }
    const blob = await encodeManifest(next, this.key && this.kdf ? { key: this.key, params: this.kdf } : undefined)
    await this.client.editFile(this.manifestId, MANIFEST_FILENAME, blob, manifestContent(rev))
    this.baseRev = rev
    return rev
  }

  cacheKey() {
    return `manifest:${this.client.id}`
  }

  async cacheLocally(manifest: Manifest) {
    // Encrypted drives are never cached in plaintext.
    if (!this.encrypted) await idb.set(this.cacheKey(), manifest)
  }

  /* ------------------------------ Content ------------------------------ */

  /** Uploads one chunk as a new message and returns its id. */
  async uploadChunk(data: Blob, opts: { signal?: AbortSignal; onProgress?: (loaded: number) => void }) {
    let body: Blob = data
    if (this.key) body = new Blob([(await encryptBytes(this.key, await data.arrayBuffer())) as BlobPart])
    const overhead = body.size - data.size
    const message = await this.client.sendFile(`${uid(16)}.bin`, body, {
      signal: opts.signal,
      // Multipart overhead is small; clamp so progress never exceeds the chunk size.
      onProgress: (loaded) => opts.onProgress?.(Math.min(data.size, Math.max(0, loaded - overhead - 400))),
    })
    if (message.attachments[0]) this.rememberUrl(message.id, message.attachments[0].url)
    return message.id
  }

  private rememberUrl(messageId: string, url: string) {
    this.urlCache.set(messageId, { url, expires: attachmentExpiry(url) - 5 * 60_000 })
  }

  /** Fresh (signed) CDN URL for a chunk. */
  async chunkUrl(messageId: string, signal?: AbortSignal) {
    const cached = this.urlCache.get(messageId)
    if (cached && cached.expires > Date.now()) return cached.url
    const message = await this.client.getMessage(messageId, signal)
    const attachment = message.attachments[0]
    if (!attachment) throw new Error(t('A chunk of this file is missing on Discord'))
    this.rememberUrl(messageId, attachment.url)
    return attachment.url
  }

  async readChunk(node: DriveNode, index: number, opts: { signal?: AbortSignal; onBytes?: (delta: number) => void } = {}) {
    const chunk = node.chunks![index]
    const url = await this.chunkUrl(chunk.m, opts.signal)
    let bytes = await fetchAttachment(url, opts)
    if (node.enc) {
      if (!this.key) throw new Error(t('This file is encrypted and the drive is locked'))
      bytes = await decryptBytes(this.key, bytes)
    }
    return bytes
  }

  /** Streams a file's plaintext chunks in order, prefetching up to `parallel` chunks ahead. */
  async *readFile(node: DriveNode, opts: { signal?: AbortSignal; onBytes?: (delta: number) => void; parallel?: number } = {}) {
    const chunks = node.chunks ?? []
    const parallel = Math.max(1, opts.parallel ?? 3)
    const pending: Promise<Uint8Array>[] = []
    let next = 0
    const pump = () => {
      while (pending.length < parallel && next < chunks.length) {
        const p = this.readChunk(node, next++, opts)
        p.catch(() => {}) // surfaced when awaited
        pending.push(p)
      }
    }
    pump()
    while (pending.length) {
      const bytes = await pending.shift()!
      pump()
      yield bytes
    }
  }

  async readBlob(node: DriveNode, opts: { signal?: AbortSignal; onBytes?: (delta: number) => void } = {}) {
    const parts: BlobPart[] = []
    for await (const bytes of this.readFile(node, opts)) parts.push(bytes as BlobPart)
    return new Blob(parts, { type: node.mime || 'application/octet-stream' })
  }

  /** Signed attachment URLs for sharing (unencrypted files only). */
  async shareUrls(node: DriveNode) {
    const urls: string[] = []
    for (const chunk of node.chunks ?? []) urls.push(await this.chunkUrl(chunk.m))
    return urls
  }

  async deleteMessage(id: string) {
    try {
      await this.client.deleteMessage(id)
    } catch (err) {
      if (err instanceof DiscordError && err.status === 404) return
      throw err
    }
  }
}
