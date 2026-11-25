import type { DriveSession } from './drive'
import type { DriveNode } from './manifest'

/**
 * In-memory LRU of decoded file blobs for previews, keyed by node id + content
 * version. Concurrent requests for the same file share one download.
 */

const MAX_BYTES = 400 * 1024 * 1024

interface Entry {
  blob: Blob
  url: string
  used: number
}

const cache = new Map<string, Entry>()
const inflight = new Map<string, { promise: Promise<Entry>; listeners: Set<(loaded: number) => void>; loaded: number }>()

const keyOf = (node: DriveNode) => `${node.id}:${node.chunks?.[0]?.m ?? ''}:${node.size}`

function evict() {
  let total = [...cache.values()].reduce((a, e) => a + e.blob.size, 0)
  const byAge = [...cache.entries()].sort((a, b) => a[1].used - b[1].used)
  for (const [key, entry] of byAge) {
    if (total <= MAX_BYTES) break
    URL.revokeObjectURL(entry.url)
    cache.delete(key)
    total -= entry.blob.size
  }
}

export function cachedBlob(node: DriveNode) {
  const entry = cache.get(keyOf(node))
  if (entry) entry.used = Date.now()
  return entry ?? null
}

export async function loadBlob(session: DriveSession, node: DriveNode, onProgress?: (loaded: number) => void) {
  const key = keyOf(node)
  const hit = cachedBlob(node)
  if (hit) return hit
  let job = inflight.get(key)
  if (!job) {
    const listeners = new Set<(loaded: number) => void>()
    const state = { loaded: 0 }
    const promise = session
      .readBlob(node, {
        onBytes: (d) => {
          state.loaded += d
          job!.loaded = state.loaded
          listeners.forEach((l) => l(state.loaded))
        },
      })
      .then((blob) => {
        const entry: Entry = { blob, url: URL.createObjectURL(blob), used: Date.now() }
        cache.set(key, entry)
        evict()
        return entry
      })
      .finally(() => inflight.delete(key))
    job = { promise, listeners, loaded: 0 }
    inflight.set(key, job)
  }
  if (onProgress) {
    job.listeners.add(onProgress)
    onProgress(job.loaded)
  }
  try {
    return await job.promise
  } finally {
    if (onProgress) job.listeners.delete(onProgress)
  }
}

export function invalidateBlob(node: DriveNode) {
  const key = keyOf(node)
  const entry = cache.get(key)
  if (entry) URL.revokeObjectURL(entry.url)
  cache.delete(key)
}
