import { decryptBytes, encryptBytes, type KdfParams } from './crypto'
import { splitName } from './utils'
import { t } from '../i18n'

export const ROOT_ID = 'root'

export interface ChunkRef {
  /** Discord message id holding the chunk attachment. */
  m: string
  /** Plaintext size of this chunk in bytes. */
  s: number
}

export interface PreviewRef {
  chunks: ChunkRef[]
  size: number
  mime: string
  /** Encrypted independently of the original (legacy plaintext files can get encrypted previews). */
  enc?: boolean
  w?: number
  h?: number
}

export interface DriveNode {
  id: string
  parentId: string | null
  name: string
  type: 'file' | 'folder'
  size: number
  mime?: string
  chunks?: ChunkRef[]
  /** Chunks are AES-GCM encrypted with the drive key. */
  enc?: boolean
  createdAt: number
  updatedAt: number
  /** Last time the file was opened/previewed from this drive. */
  openedAt?: number
  starred?: boolean
  /** Folder color (an accent palette value); unset follows the app accent. */
  color?: string
  /** Set on the top-most trashed node only; descendants inherit it. */
  trashedAt?: number
  /** Low-quality rendition (big images/videos) shown instantly while the original loads. */
  preview?: PreviewRef
  /** Small webp data URL for grid thumbnails. */
  thumb?: string
  /** Image/video dimensions, video/audio duration. */
  meta?: { w?: number; h?: number; dur?: number }
  /** Imported from the legacy Disbox v1 server. */
  legacy?: boolean
}

export type SharePerm = 'view' | 'edit'

/**
 * A folder (or the whole drive, when `folderId` is the root) shared by invite link.
 * The link only carries the grant id, so the owner can change `perm` or revoke it later.
 */
export interface ShareGrant {
  id: string
  folderId: string
  perm: SharePerm
  createdAt: number
  updatedAt?: number
}

export interface Manifest {
  version: 2
  rev: number
  createdAt: number
  updatedAt: number
  nodes: Record<string, DriveNode>
  /** Invite links to folders or the whole drive, keyed by grant id. */
  shares?: Record<string, ShareGrant>
}

export function emptyManifest(): Manifest {
  const now = Date.now()
  return {
    version: 2,
    rev: 0,
    createdAt: now,
    updatedAt: now,
    nodes: {
      [ROOT_ID]: { id: ROOT_ID, parentId: null, name: 'My Drive', type: 'folder', size: 0, createdAt: now, updatedAt: now },
    },
  }
}

/* ------------------------------------------------------------------ */
/* Serialization: `<header json>\n<payload>` where payload is gzip(JSON), */
/* optionally AES-GCM encrypted. The header stays readable so a client  */
/* can learn the KDF salt before asking for a passphrase.               */
/* ------------------------------------------------------------------ */

export interface ManifestHeader {
  /** `disbox-manifest` is accepted for drives created before the Kdrive rename. */
  format: 'kdrive-manifest' | 'disbox-manifest'
  v: 2
  enc?: KdfParams
}

async function gzip(data: Uint8Array) {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function gunzip(data: Uint8Array) {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function encodeManifest(manifest: Manifest, enc?: { key: CryptoKey; params: KdfParams }) {
  const header: ManifestHeader = { format: 'kdrive-manifest', v: 2, ...(enc ? { enc: enc.params } : {}) }
  let payload = await gzip(new TextEncoder().encode(JSON.stringify(manifest)))
  if (enc) payload = await encryptBytes(enc.key, payload)
  return new Blob([JSON.stringify(header) + '\n', payload as BlobPart], { type: 'application/octet-stream' })
}

export function readManifestHeader(bytes: Uint8Array): { header: ManifestHeader; payload: Uint8Array } {
  const nl = bytes.indexOf(10)
  if (nl < 0) throw new Error(t('Not a Kdrive manifest'))
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(0, nl))) as ManifestHeader
  if (header.format !== 'kdrive-manifest' && header.format !== 'disbox-manifest') throw new Error(t('Not a Kdrive manifest'))
  return { header, payload: bytes.subarray(nl + 1) }
}

export async function decodeManifestPayload(payload: Uint8Array, key?: CryptoKey): Promise<Manifest> {
  let data = payload
  if (key) {
    try {
      data = await decryptBytes(key, payload)
    } catch {
      throw new WrongPassphraseError()
    }
  }
  const manifest = JSON.parse(new TextDecoder().decode(await gunzip(data))) as Manifest
  if (!manifest.nodes?.[ROOT_ID]) throw new Error(t('Manifest is corrupted (missing root)'))
  return manifest
}

export class WrongPassphraseError extends Error {
  constructor() {
    super(t('Wrong passphrase'))
  }
}

/* ------------------------------------------------------------------ */
/* Tree queries. A children index is cached per `nodes` object identity. */
/* ------------------------------------------------------------------ */

type Nodes = Record<string, DriveNode>
const indexCache = new WeakMap<Nodes, Map<string, DriveNode[]>>()

export function childIndex(nodes: Nodes) {
  let index = indexCache.get(nodes)
  if (!index) {
    index = new Map()
    for (const node of Object.values(nodes)) {
      if (node.parentId === null) continue
      const list = index.get(node.parentId)
      if (list) list.push(node)
      else index.set(node.parentId, [node])
    }
    indexCache.set(nodes, index)
  }
  return index
}

/** Must be called after mutating a `nodes` object in place, since the index is keyed by identity. */
export function invalidateIndex(nodes: Nodes) {
  indexCache.delete(nodes)
}

export function childrenOf(nodes: Nodes, parentId: string, includeTrashed = false) {
  const list = childIndex(nodes).get(parentId) ?? []
  return includeTrashed ? list : list.filter((n) => !n.trashedAt)
}

export function pathTo(nodes: Nodes, id: string) {
  const path: DriveNode[] = []
  let cur: DriveNode | undefined = nodes[id]
  const seen = new Set<string>()
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    path.unshift(cur)
    cur = cur.parentId ? nodes[cur.parentId] : undefined
  }
  return path
}

/** Display name; the root's stored name is translated. */
export function displayName(node: Pick<DriveNode, 'id' | 'name'>) {
  return node.id === ROOT_ID ? t('My Drive') : node.name
}

/** Like `pathTo`, but starting at `rootId` (the top an invitee can see). */
export function pathFrom(nodes: Nodes, id: string, rootId: string) {
  const path = pathTo(nodes, id)
  return path.slice(Math.max(0, path.findIndex((n) => n.id === rootId)))
}

export function pathString(nodes: Nodes, id: string, rootId = ROOT_ID) {
  return '/' + pathFrom(nodes, id, rootId).slice(1).map((n) => n.name).join('/')
}

/** True if the node or one of its ancestors is in the trash. */
export function isInTrash(nodes: Nodes, id: string) {
  return pathTo(nodes, id).some((n) => n.trashedAt)
}

export function isDescendantOf(nodes: Nodes, id: string, ancestorId: string) {
  return pathTo(nodes, id).some((n) => n.id === ancestorId)
}

/** True if `id` is `rootId` itself or lies somewhere below it. */
export function isWithin(nodes: Nodes, id: string, rootId: string) {
  return rootId === ROOT_ID ? Boolean(nodes[id]) : isDescendantOf(nodes, id, rootId)
}

export function descendants(nodes: Nodes, id: string): DriveNode[] {
  const out: DriveNode[] = []
  const stack = [id]
  const index = childIndex(nodes)
  while (stack.length) {
    const cur = stack.pop()!
    for (const child of index.get(cur) ?? []) {
      out.push(child)
      if (child.type === 'folder') stack.push(child.id)
    }
  }
  return out
}

export function folderSize(nodes: Nodes, id: string) {
  let size = 0
  let files = 0
  let folders = 0
  for (const n of descendants(nodes, id)) {
    if (n.type === 'file') {
      size += n.size
      files++
    } else folders++
  }
  return { size, files, folders }
}

export function findChildByName(nodes: Nodes, parentId: string, name: string) {
  const lower = name.toLowerCase()
  return childrenOf(nodes, parentId, true).find((n) => n.name.toLowerCase() === lower)
}

/** Returns `name`, or `name (2).ext`, ... so it does not clash with a sibling. */
export function uniqueName(nodes: Nodes, parentId: string, name: string, ignoreId?: string) {
  const taken = new Set(
    childrenOf(nodes, parentId, true)
      .filter((n) => n.id !== ignoreId)
      .map((n) => n.name.toLowerCase()),
  )
  if (!taken.has(name.toLowerCase())) return name
  const { base, ext } = splitName(name)
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})${ext ? `.${ext}` : ''}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

/** Every Discord message backing a file: content chunks plus its preview. */
export function messageIdsOf(node: DriveNode) {
  if (node.type !== 'file') return []
  return [...(node.chunks ?? []), ...(node.preview?.chunks ?? [])].map((c) => c.m)
}

/** A pseudo-node addressing a file's preview rendition, so it can be read like any file. */
export function previewNodeOf(node: DriveNode): DriveNode | null {
  if (!node.preview) return null
  const { chunks, size, mime, enc } = node.preview
  return { ...node, id: `${node.id}:preview`, chunks, size, mime, enc, preview: undefined }
}

export function allFiles(nodes: Nodes, includeTrashed = false) {
  return Object.values(nodes).filter((n) => n.type === 'file' && (includeTrashed || !isInTrash(nodes, n.id)))
}
