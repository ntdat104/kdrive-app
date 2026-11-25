import { Zip, ZipPassThrough } from 'fflate'
import { toast } from 'sonner'
import { create } from 'zustand'
import { ENCRYPTION_OVERHEAD } from '../lib/crypto'
import { mimeFromName } from '../lib/filetypes'
import { loadBlob } from '../lib/blob-cache'
import type { DriveSession } from '../lib/drive'
import { descendants, isWithin, messageIdsOf, pathTo, type ChunkRef, type DriveNode, type PreviewRef } from '../lib/manifest'
import { createPreview, wantsPreview } from '../lib/previews'
import { extractMediaInfo } from '../lib/thumbnails'
import { downloadBlob, errorMessage, isAbortError, mapLimit, Semaphore, uid } from '../lib/utils'
import { useDrive } from './drive'
import { useSettings } from './settings'
import { t } from '../i18n'

/** Checked before posting anything to Discord, so invitees never leave orphaned chunks behind. */
function assertWritable(targetId: string) {
  const { access, manifest } = useDrive.getState()
  if (access.perm === 'view') throw new Error(t('You only have view access'))
  if (manifest && !isWithin(manifest.nodes, targetId, access.rootId)) {
    throw new Error(t('You can only change items inside the shared folder'))
  }
}

export type TransferKind = 'upload' | 'download' | 'delete' | 'update'
export type TransferStatus = 'queued' | 'running' | 'done' | 'error' | 'canceled'

export interface Transfer {
  id: string
  kind: TransferKind
  name: string
  total: number
  loaded: number
  status: TransferStatus
  error?: string
  startedAt: number
  finishedAt?: number
  /** Upload destination, so the explorer can show in-progress ghosts. */
  parentId?: string
  nodeId?: string
  controller?: AbortController
  retry?: () => void
  /** Extra status shown while waiting on non-byte work (e.g. encoding a preview). */
  phase?: string
}

export interface UploadItem {
  file: File
  /** Folder segments relative to the drop target (folder uploads). */
  dirs?: string[]
}

interface TransfersState {
  transfers: Transfer[]
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
  startTask: (t: { kind: TransferKind; name: string; total: number; parentId?: string; controller?: AbortController }) => string
  progress: (id: string, loaded: number) => void
  finish: (id: string) => void
  fail: (id: string, error: string) => void
  cancel: (id: string) => void
  clearFinished: () => void
  upload: (items: UploadItem[], parentId: string) => void
  replaceContent: (nodeId: string, blob: Blob) => Promise<void>
  createQuickPreview: (nodeId: string) => Promise<void>
  download: (ids: string[]) => Promise<void>
}

const chunkSemaphore = new Semaphore(3)
const fileSemaphore = new Semaphore(4)
useSettings.subscribe((s) => (chunkSemaphore.limit = s.concurrency))
chunkSemaphore.limit = useSettings.getState().concurrency

// Progress events are very frequent; buffer them and flush to React at ~8fps.
const pendingProgress = new Map<string, number>()
let flushTimer: ReturnType<typeof setTimeout> | null = null

export const useTransfers = create<TransfersState>()((set, get) => {
  const patch = (id: string, p: Partial<Transfer>) =>
    set((s) => ({ transfers: s.transfers.map((t) => (t.id === id ? { ...t, ...p } : t)) }))

  const flush = () => {
    flushTimer = null
    if (!pendingProgress.size) return
    const updates = new Map(pendingProgress)
    pendingProgress.clear()
    set((s) => ({ transfers: s.transfers.map((t) => (updates.has(t.id) ? { ...t, loaded: updates.get(t.id)! } : t)) }))
  }

  const chunkBytes = () => {
    const encrypted = useDrive.getState().session?.encrypted
    return Math.floor(useSettings.getState().chunkMB * 1024 * 1024) - (encrypted ? ENCRYPTION_OVERHEAD : 0)
  }

  /** Splits a blob into chunks and posts them (bounded by the global semaphore). Posted ids go to `posted` for cleanup. */
  async function uploadBlob(
    session: DriveSession,
    blob: Blob,
    opts: { signal?: AbortSignal; onLoaded?: (bytes: number) => void; posted?: string[] },
  ): Promise<ChunkRef[]> {
    const size = chunkBytes()
    const count = Math.max(1, Math.ceil(blob.size / size))
    const loaded = Array.from({ length: count }, () => 0)
    const report = () => opts.onLoaded?.(loaded.reduce((a, b) => a + b, 0))
    return mapLimit(
      Array.from({ length: count }, (_, i) => i),
      Math.max(1, useSettings.getState().concurrency),
      async (i) => {
        const part = blob.slice(i * size, Math.min(blob.size, (i + 1) * size))
        const m = await chunkSemaphore.run(
          () =>
            session.uploadChunk(part, {
              signal: opts.signal,
              onProgress: (l) => {
                loaded[i] = l
                report()
              },
            }),
          opts.signal,
        )
        opts.posted?.push(m)
        loaded[i] = part.size
        report()
        return { m, s: part.size }
      },
    )
  }

  /** Encodes and uploads the low-quality rendition. Resolves undefined when not applicable or on failure. */
  async function uploadPreview(
    session: DriveSession,
    id: string,
    file: Blob,
    name: string,
    opts: { signal: AbortSignal; onLoaded: (bytes: number) => void; posted: string[]; baseTotal: number },
  ): Promise<PreviewRef | undefined> {
    let lastPct = -1
    const rendition = await createPreview(file, name, {
      signal: opts.signal,
      onProgress: (p) => {
        const pct = Math.floor(p * 100)
        if (pct !== lastPct) patch(id, { phase: t('Creating quick preview · {pct}%', { pct: (lastPct = pct) }) })
      },
    })
    patch(id, { phase: undefined })
    if (!rendition) return undefined
    patch(id, { total: opts.baseTotal + rendition.blob.size })
    const chunks = await uploadBlob(session, rendition.blob, opts)
    return { chunks, size: rendition.blob.size, mime: rendition.blob.type, enc: session.encrypted || undefined, w: rendition.w, h: rendition.h }
  }

  async function uploadOne(id: string, item: UploadItem, parentId: string, controller: AbortController) {
    const session = useDrive.getState().session
    if (!session) throw new Error(t('No drive is open'))
    const { file } = item
    const signal = controller.signal
    const posted: string[] = []
    let mainLoaded = 0
    let previewLoaded = 0
    const report = () => get().progress(id, mainLoaded + previewLoaded)

    await fileSemaphore.acquire(signal)
    patch(id, { status: 'running', startedAt: Date.now() })
    try {
      const mediaPromise = extractMediaInfo(file, file.name)
      // The preview is encoded on the CPU while the original goes over the network.
      const previewPromise =
        useSettings.getState().quickPreviews && wantsPreview(file.name, file.size, file.type)
          ? uploadPreview(session, id, file, file.name, {
              signal,
              posted,
              baseTotal: file.size,
              onLoaded: (b) => ((previewLoaded = b), report()),
            }).catch((err) => {
              if (signal.aborted) throw err
              console.warn('[kdrive] preview upload failed', err)
              return undefined
            })
          : Promise.resolve(undefined)
      previewPromise.catch(() => {}) // awaited below; avoid unhandled rejection if the main upload fails first
      const chunks = await uploadBlob(session, file, { signal, posted, onLoaded: (b) => ((mainLoaded = b), report()) })
      const [media, preview] = await Promise.all([mediaPromise, previewPromise])
      const now = Date.now()
      const dest = item.dirs?.length ? useDrive.getState().ensureFolderPath(parentId, item.dirs) : parentId
      const node = useDrive.getState().addNode({
        id: uid(),
        parentId: dest,
        name: file.name,
        type: 'file',
        size: file.size,
        mime: file.type || mimeFromName(file.name),
        chunks,
        enc: session.encrypted || undefined,
        createdAt: now,
        updatedAt: now,
        thumb: media.thumb,
        meta: media.meta,
        preview,
      })
      patch(id, { nodeId: node.id, phase: undefined })
    } catch (err) {
      // Best-effort cleanup of chunks already posted.
      void mapLimit(posted, 2, (m) => session.deleteMessage(m).catch(() => {}))
      throw err
    } finally {
      fileSemaphore.release()
    }
  }

  return {
    transfers: [],
    panelOpen: true,
    setPanelOpen: (open) => set({ panelOpen: open }),

    startTask: ({ kind, name, total, parentId, controller }) => {
      const id = uid()
      set((s) => ({
        panelOpen: true,
        transfers: [...s.transfers, { id, kind, name, total, loaded: 0, status: 'running', startedAt: Date.now(), parentId, controller }],
      }))
      return id
    },

    progress: (id, loaded) => {
      pendingProgress.set(id, loaded)
      flushTimer ??= setTimeout(flush, 120)
    },

    finish: (id) => {
      pendingProgress.delete(id)
      set((s) => ({
        transfers: s.transfers.map((t) => (t.id === id ? { ...t, status: 'done', loaded: t.total, finishedAt: Date.now() } : t)),
      }))
    },

    fail: (id, error) => {
      pendingProgress.delete(id)
      patch(id, { status: 'error', error, finishedAt: Date.now() })
    },

    cancel: (id) => {
      const t = get().transfers.find((x) => x.id === id)
      t?.controller?.abort()
      patch(id, { status: 'canceled', finishedAt: Date.now() })
    },

    clearFinished: () => set((s) => ({ transfers: s.transfers.filter((t) => t.status === 'running' || t.status === 'queued') })),

    upload: (items, parentId) => {
      if (!items.length) return
      try {
        assertWritable(parentId)
      } catch (err) {
        toast.error(errorMessage(err))
        return
      }
      const queued: Transfer[] = items.map((item) => {
        const controller = new AbortController()
        const id = uid()
        const transfer: Transfer = {
          id,
          kind: 'upload',
          name: item.file.name,
          total: item.file.size,
          loaded: 0,
          status: 'queued',
          startedAt: Date.now(),
          parentId: item.dirs?.length ? undefined : parentId,
          controller,
        }
        const run = (ctrl: AbortController) =>
          uploadOne(id, item, parentId, ctrl).then(
            () => get().finish(id),
            (err) => {
              if (isAbortError(err)) return patch(id, { status: 'canceled', finishedAt: Date.now() })
              get().fail(id, errorMessage(err))
              toast.error(t('Upload failed: {name}', { name: item.file.name }), { description: errorMessage(err) })
            },
          )
        transfer.retry = () => {
          const ctrl = new AbortController()
          patch(id, { status: 'queued', error: undefined, loaded: 0, controller: ctrl, finishedAt: undefined })
          void run(ctrl)
        }
        queueMicrotask(() => void run(controller))
        return transfer
      })
      set((s) => ({ panelOpen: true, transfers: [...s.transfers, ...queued] }))
    },

    replaceContent: async (nodeId, blob) => {
      const drive = useDrive.getState()
      const session = drive.session
      const node = drive.manifest?.nodes[nodeId]
      if (!session || !node) throw new Error(t('File not found'))
      assertWritable(nodeId)
      const controller = new AbortController()
      const id = get().startTask({ kind: 'update', name: t('Saving {name}', { name: node.name }), total: blob.size, controller })
      try {
        const chunks = await uploadBlob(session, blob, { signal: controller.signal, onLoaded: (b) => get().progress(id, b) })
        const old = messageIdsOf(node)
        useDrive.getState().patchNode(nodeId, {
          chunks,
          size: blob.size,
          enc: session.encrypted || undefined,
          updatedAt: Date.now(),
          legacy: undefined,
          preview: undefined,
        })
        get().finish(id)
        void mapLimit(old, 2, (m) => session.deleteMessage(m).catch(() => {}))
      } catch (err) {
        get().fail(id, errorMessage(err))
        throw err
      }
    },

    createQuickPreview: async (nodeId) => {
      const { session, manifest } = useDrive.getState()
      const node = manifest?.nodes[nodeId]
      if (!session || !node || node.type !== 'file' || node.preview) return
      assertWritable(nodeId)
      if (!wantsPreview(node.name, node.size, node.mime)) throw new Error(t('This file is too small or not supported for quick previews'))
      const controller = new AbortController()
      const id = get().startTask({ kind: 'update', name: t('Quick preview · {name}', { name: node.name }), total: node.size, controller })
      const posted: string[] = []
      try {
        const original = await loadBlob(session, node, (l) => get().progress(id, l))
        const preview = await uploadPreview(session, id, original.blob, node.name, {
          signal: controller.signal,
          posted,
          baseTotal: node.size,
          onLoaded: (b) => get().progress(id, node.size + b),
        })
        if (!preview) throw new Error(t('A smaller preview could not be made for this file'))
        if (!useDrive.getState().manifest?.nodes[nodeId]) throw new Error(t('File was deleted'))
        useDrive.getState().patchNode(nodeId, { preview })
        get().finish(id)
      } catch (err) {
        void mapLimit(posted, 2, (m) => session.deleteMessage(m).catch(() => {}))
        if (isAbortError(err)) return
        get().fail(id, errorMessage(err))
        throw err
      }
    },

    download: async (ids) => {
      const { session, manifest } = useDrive.getState()
      if (!session || !manifest) return
      const nodes = manifest.nodes
      const picked = ids.map((i) => nodes[i]).filter(Boolean)
      if (!picked.length) return

      const single = picked.length === 1 && picked[0].type === 'file' ? picked[0] : null
      const zipName =
        picked.length === 1 ? `${picked[0].name}.zip` : `Kdrive-${new Date().toISOString().slice(0, 10)}-${picked.length}-items.zip`
      const fileName = single ? single.name : zipName

      // Ask for the destination first: the picker needs the user gesture.
      let writable: FileSystemWritableFileStream | null = null
      const picker = (window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker
      if (picker) {
        try {
          const handle = await picker({ suggestedName: fileName })
          writable = await handle.createWritable()
        } catch (err) {
          if (isAbortError(err)) return
          writable = null
        }
      }

      // Collect entries: [node, path inside zip]
      const entries: [DriveNode, string][] = []
      for (const node of picked) {
        if (node.type === 'file') entries.push([node, node.name])
        else {
          const base = pathTo(nodes, node.id).length
          for (const d of descendants(nodes, node.id)) {
            if (d.type !== 'file' || d.trashedAt) continue
            const rel = pathTo(nodes, d.id).slice(base - 1).map((p) => p.name).join('/')
            entries.push([d, rel])
          }
        }
      }
      const total = entries.reduce((a, [n]) => a + n.size, 0)
      const controller = new AbortController()
      const id = get().startTask({ kind: 'download', name: fileName, total, controller })
      let received = 0
      const onBytes = (delta: number) => get().progress(id, (received += delta))
      const parts: BlobPart[] = []
      let writeChain = Promise.resolve()
      const write = (data: Uint8Array) => {
        if (writable) {
          const w = writable
          writeChain = writeChain.then(() => w.write(data as FileSystemWriteChunkType))
        } else parts.push(data as BlobPart)
      }

      try {
        if (single) {
          for await (const bytes of session.readFile(single, { signal: controller.signal, onBytes })) write(bytes)
        } else {
          let zipError: Error | null = null
          const zip = new Zip((err, data) => {
            if (err) zipError = err
            else write(data)
          })
          for (const [node, path] of entries) {
            const entry = new ZipPassThrough(path)
            entry.mtime = node.updatedAt
            zip.add(entry)
            for await (const bytes of session.readFile(node, { signal: controller.signal, onBytes })) entry.push(bytes)
            entry.push(new Uint8Array(0), true)
            await writeChain
            if (zipError) throw zipError
          }
          zip.end()
        }
        await writeChain
        if (writable) await writable.close()
        else downloadBlob(new Blob(parts, { type: single?.mime }), fileName)
        get().finish(id)
        for (const node of picked) useDrive.getState().touch(node.id)
      } catch (err) {
        await writable?.abort().catch(() => {})
        if (isAbortError(err)) return
        get().fail(id, errorMessage(err))
        toast.error(t('Download failed: {name}', { name: fileName }), { description: errorMessage(err) })
      }
    },
  }
})

export function activeUploadsIn(transfers: Transfer[], parentId: string) {
  return transfers.filter((t) => t.kind === 'upload' && t.parentId === parentId && (t.status === 'running' || t.status === 'queued'))
}
