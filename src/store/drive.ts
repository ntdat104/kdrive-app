import { toast } from 'sonner'
import { create } from 'zustand'
import { deriveKey, exportKey, importKey } from '../lib/crypto'
import { webhookAvatarUrl, type WebhookInfo } from '../lib/discord'
import { ConflictError, DriveSession, type RemoteManifest } from '../lib/drive'
import { idb } from '../lib/idb'
import {
  childrenOf,
  descendants,
  findChildByName,
  isDescendantOf,
  invalidateIndex,
  isInTrash,
  isWithin,
  messageIdsOf,
  ROOT_ID,
  uniqueName,
  WrongPassphraseError,
  type DriveNode,
  type Manifest,
  type ShareGrant,
  type SharePerm,
} from '../lib/manifest'
import { pickFolderColor, type FolderColor } from '../lib/folderColors'
import { errorMessage, mapLimit, uid } from '../lib/utils'
import { useDrives, type DriveProfile } from './drives'
import { useTransfers } from './transfers'
import { t } from '../i18n'

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict'
type Nodes = Record<string, DriveNode>

/** What the open profile may do: owners see everything, invitees only their shared folder. */
export interface Access {
  /** Top of the visible tree: the drive root, or the shared folder. */
  rootId: string
  perm: 'owner' | SharePerm
}

const OWNER: Access = { rootId: ROOT_ID, perm: 'owner' }

export class ShareRevokedError extends Error {
  constructor() {
    super(t('This share link was revoked or the shared folder no longer exists. Ask the owner for a new link.'))
  }
}

function resolveAccess(profile: DriveProfile, manifest: Manifest): Access {
  if (!profile.shareId) return OWNER
  const grant = manifest.shares?.[profile.shareId]
  const folder = grant && manifest.nodes[grant.folderId]
  if (!grant || !folder || folder.type !== 'folder' || isInTrash(manifest.nodes, folder.id)) throw new ShareRevokedError()
  return { rootId: grant.folderId, perm: grant.perm }
}

/** Invitees with edit access may only touch nodes below their shared folder, never the folder itself. */
function assertInScope(before: Nodes, after: Nodes, rootId: string) {
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[id] === after[id]) continue
    const ok = id !== rootId && (!before[id] || isWithin(before, id, rootId)) && (!after[id] || isWithin(after, id, rootId))
    if (!ok) throw new Error(t('You can only change items inside the shared folder'))
  }
}

interface DriveState {
  status: 'idle' | 'loading' | 'locked' | 'ready' | 'error'
  error: string | null
  profile: DriveProfile | null
  info: WebhookInfo | null
  session: DriveSession | null
  manifest: Manifest | null
  access: Access
  /** Encrypted manifest waiting for a passphrase. */
  pending: RemoteManifest | null
  saveState: SaveState
  saveError: string | null

  open: (profile: DriveProfile) => Promise<void>
  unlock: (passphrase: string, remember: boolean) => Promise<void>
  close: () => void
  reload: () => Promise<void>
  resolveConflict: (mode: 'reload' | 'overwrite') => Promise<void>
  flush: () => Promise<void>

  mutate: (fn: (nodes: Nodes) => void) => void
  createFolder: (parentId: string, name: string) => string
  ensureFolderPath: (parentId: string, segments: string[]) => string
  addNode: (node: DriveNode) => DriveNode
  rename: (id: string, name: string) => void
  move: (ids: string[], targetId: string) => number
  trash: (ids: string[]) => void
  restore: (ids: string[]) => void
  deleteForever: (ids: string[]) => Promise<void>
  emptyTrash: () => Promise<void>
  toggleStar: (ids: string[], value?: boolean) => void
  /** `undefined` resets to the default (app accent) color. */
  setFolderColor: (ids: string[], color: FolderColor | undefined) => void
  touch: (id: string) => void
  patchNode: (id: string, patch: Partial<DriveNode>) => void

  createShare: (folderId: string, perm: SharePerm) => ShareGrant
  updateShare: (id: string, perm: SharePerm) => void
  revokeShare: (id: string) => void
  restoreShare: (grant: ShareGrant) => void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let saving: Promise<void> | null = null
let dirtyWhileSaving = false

const rememberedKeyId = (id: string) => `key:${id}`

export const useDrive = create<DriveState>()((set, get) => {
  const scheduleSave = () => {
    set({ saveState: get().saveState === 'conflict' ? 'conflict' : 'dirty' })
    if (get().saveState === 'conflict') return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void runSave(), 700)
  }

  const runSave = async (force = false): Promise<void> => {
    saveTimer = null
    if (saving) {
      dirtyWhileSaving = true
      return saving
    }
    const { session, manifest } = get()
    if (!session || !manifest) return
    set({ saveState: 'saving', saveError: null })
    saving = (async () => {
      try {
        const rev = await session.saveManifest(manifest, force)
        const current = get().manifest
        if (current) {
          const next = { ...current, rev }
          set({ manifest: next })
          void session.cacheLocally(next)
        }
        set({ saveState: dirtyWhileSaving ? 'dirty' : 'saved' })
      } catch (err) {
        if (err instanceof ConflictError) {
          set({ saveState: 'conflict', saveError: err.message })
        } else {
          set({ saveState: 'error', saveError: errorMessage(err) })
          // Retry later; edits are kept in memory.
          saveTimer = setTimeout(() => void runSave(), 8000)
        }
      } finally {
        saving = null
      }
    })()
    await saving
    if (dirtyWhileSaving && get().saveState === 'dirty') {
      dirtyWhileSaving = false
      return runSave()
    }
    dirtyWhileSaving = false
  }

  const mutate = (fn: (nodes: Nodes) => void) => {
    const { manifest, access } = get()
    if (!manifest) throw new Error(t('No drive is open'))
    if (access.perm === 'view') throw new Error(t('You only have view access'))
    const nodes = { ...manifest.nodes }
    fn(nodes)
    invalidateIndex(nodes)
    if (access.rootId !== ROOT_ID) assertInScope(manifest.nodes, nodes, access.rootId)
    set({ manifest: { ...manifest, nodes, updatedAt: Date.now() } })
    scheduleSave()
  }

  const mutateShares = (fn: (shares: Record<string, ShareGrant>) => void) => {
    const { manifest, access } = get()
    if (!manifest) throw new Error(t('No drive is open'))
    if (access.perm !== 'owner') throw new Error(t('Only the drive owner can manage sharing'))
    const shares = { ...manifest.shares }
    fn(shares)
    set({ manifest: { ...manifest, shares, updatedAt: Date.now() } })
    scheduleSave()
  }

  const nodes = () => get().manifest?.nodes ?? {}

  const finishOpen = (session: DriveSession, manifest: Manifest, profile: DriveProfile) => {
    const access = resolveAccess(profile, manifest)
    set({ session, manifest, access, status: 'ready', pending: null, error: null, saveState: 'saved' })
    useDrives.getState().update(profile.id, { lastOpenedAt: Date.now(), encrypted: session.encrypted })
    void session.cacheLocally(manifest)
  }

  return {
    status: 'idle',
    error: null,
    profile: null,
    info: null,
    session: null,
    manifest: null,
    access: OWNER,
    pending: null,
    saveState: 'saved',
    saveError: null,

    open: async (profile) => {
      if (get().profile?.id === profile.id && get().status === 'ready') return
      set({ status: 'loading', error: null, profile, manifest: null, session: null, pending: null, info: null, access: OWNER })
      try {
        const { info, remote } = await DriveSession.inspect(profile.webhookUrl)
        if (get().profile?.id !== profile.id) return
        set({ info })
        useDrives.getState().update(profile.id, { avatar: webhookAvatarUrl(info) })
        if (!remote) throw new Error(t('No Kdrive manifest was found for this webhook. It may have been deleted or the webhook renamed.'))
        if (remote.kdf) {
          const raw = await idb.get<string>(rememberedKeyId(profile.id))
          if (raw) {
            try {
              const { session, manifest } = await DriveSession.unlock(profile.webhookUrl, remote, await importKey(raw))
              return finishOpen(session, manifest, profile)
            } catch {
              await idb.del(rememberedKeyId(profile.id))
            }
          }
          set({ status: 'locked', pending: remote })
          return
        }
        const { session, manifest } = await DriveSession.unlock(profile.webhookUrl, remote)
        finishOpen(session, manifest, profile)
      } catch (err) {
        if (get().profile?.id === profile.id) set({ status: 'error', error: errorMessage(err) })
      }
    },

    unlock: async (passphrase, remember) => {
      const { pending, profile } = get()
      if (!pending?.kdf || !profile) return
      try {
        const key = await deriveKey(passphrase, pending.kdf)
        const { session, manifest } = await DriveSession.unlock(profile.webhookUrl, pending, key)
        if (remember) await idb.set(rememberedKeyId(profile.id), await exportKey(key))
        finishOpen(session, manifest, profile)
      } catch (err) {
        if (err instanceof WrongPassphraseError) throw err
        throw new Error(errorMessage(err))
      }
    },

    close: () => {
      if (saveTimer) clearTimeout(saveTimer)
      set({ status: 'idle', profile: null, session: null, manifest: null, pending: null, info: null, access: OWNER, saveState: 'saved' })
    },

    reload: async () => {
      const { session, profile } = get()
      if (!session || !profile) return
      const manifest = await session.reloadManifest()
      let access: Access
      try {
        access = resolveAccess(profile, manifest)
      } catch (err) {
        set({ status: 'error', error: errorMessage(err), manifest: null })
        return
      }
      set({ manifest, access, saveState: 'saved', saveError: null })
      void session.cacheLocally(manifest)
    },

    resolveConflict: async (mode) => {
      if (mode === 'reload') {
        await get().reload()
        toast.success(t('Loaded the latest version of your drive'))
      } else {
        // Invitees must not overwrite the owner's changes (that could resurrect a revoked link).
        if (get().access.perm !== 'owner') throw new Error(t('Only the drive owner can overwrite remote changes'))
        await runSave(true)
        toast.success(t('Your version was saved'))
      }
    },

    flush: async () => {
      if (saveTimer) {
        clearTimeout(saveTimer)
        await runSave()
      } else if (saving) await saving
    },

    mutate,

    createFolder: (parentId, name) => {
      const id = uid()
      mutate((n) => {
        const now = Date.now()
        const color = pickFolderColor(childrenOf(n, parentId).filter((c) => c.type === 'folder').map((c) => c.color))
        n[id] = { id, parentId, name: uniqueName(n, parentId, name.trim()), type: 'folder', size: 0, color, createdAt: now, updatedAt: now }
      })
      return id
    },

    ensureFolderPath: (parentId, segments) => {
      let current = parentId
      for (const segment of segments) {
        const existing = findChildByName(nodes(), current, segment)
        if (existing && existing.type === 'folder' && !existing.trashedAt) current = existing.id
        else current = get().createFolder(current, segment)
      }
      return current
    },

    addNode: (node) => {
      let added = node
      mutate((n) => {
        const parentId = n[node.parentId ?? ROOT_ID] ? node.parentId! : ROOT_ID
        added = { ...node, parentId, name: uniqueName(n, parentId, node.name) }
        n[node.id] = added
      })
      return added
    },

    rename: (id, name) =>
      mutate((n) => {
        const node = n[id]
        if (!node || !node.parentId) return
        const clash = findChildByName(n, node.parentId, name.trim())
        if (clash && clash.id !== id) throw new Error(t('“{name}” already exists in this folder', { name }))
        n[id] = { ...node, name: name.trim(), updatedAt: Date.now() }
      }),

    move: (ids, targetId) => {
      let moved = 0
      mutate((n) => {
        const target = n[targetId]
        if (!target || target.type !== 'folder') throw new Error(t('Destination is not a folder'))
        for (const id of ids) {
          const node = n[id]
          if (!node || node.parentId === targetId || id === ROOT_ID) continue
          if (node.type === 'folder' && isDescendantOf(n, targetId, id)) {
            throw new Error(t('Can’t move “{name}” into itself', { name: node.name }))
          }
          n[id] = { ...node, parentId: targetId, name: uniqueName(n, targetId, node.name, id), updatedAt: Date.now() }
          moved++
        }
      })
      return moved
    },

    trash: (ids) =>
      mutate((n) => {
        const now = Date.now()
        for (const id of ids) if (n[id] && id !== ROOT_ID) n[id] = { ...n[id], trashedAt: now }
      }),

    restore: (ids) =>
      mutate((n) => {
        const rootId = get().access.rootId
        for (const id of ids) {
          const node = n[id]
          if (!node) continue
          const parentId =
            node.parentId && n[node.parentId] && !isInTrash(n, node.parentId) && isWithin(n, node.parentId, rootId) ? node.parentId : rootId
          const restored: DriveNode = { ...node, parentId }
          delete restored.trashedAt
          restored.name = uniqueName(n, parentId, node.name, id)
          n[id] = restored
        }
      }),

    deleteForever: async (ids) => {
      const all = nodes()
      const doomed = new Map<string, DriveNode>()
      for (const id of ids) {
        if (!all[id] || id === ROOT_ID) continue
        doomed.set(id, all[id])
        for (const d of descendants(all, id)) doomed.set(d.id, d)
      }
      const messageIds = [...doomed.values()].flatMap(messageIdsOf)
      mutate((n) => {
        for (const id of doomed.keys()) delete n[id]
      })
      // Links to folders that no longer exist are dead; drop them from the manifest too.
      const stale = Object.values(get().manifest?.shares ?? {}).filter((g) => doomed.has(g.folderId))
      if (stale.length && get().access.perm === 'owner') {
        mutateShares((s) => {
          for (const g of stale) delete s[g.id]
        })
      }
      const session = get().session
      if (!session || !messageIds.length) return
      // Remove the chunk messages from Discord in the background.
      const transfers = useTransfers.getState()
      const tid = transfers.startTask({ kind: 'delete', name: t('Deleting {n} items', { n: doomed.size }), total: messageIds.length })
      let done = 0
      try {
        await mapLimit(messageIds, 2, async (m) => {
          await session.deleteMessage(m)
          transfers.progress(tid, ++done)
        })
        transfers.finish(tid)
      } catch (err) {
        transfers.fail(tid, errorMessage(err))
      }
    },

    emptyTrash: async () => {
      const all = nodes()
      const rootId = get().access.rootId
      const trashed = Object.values(all)
        .filter((n) => n.trashedAt && isWithin(all, n.id, rootId))
        .map((n) => n.id)
      await get().deleteForever(trashed)
    },

    setFolderColor: (ids, color) =>
      mutate((n) => {
        for (const id of ids) if (n[id]?.type === 'folder') n[id] = { ...n[id], color }
      }),

    toggleStar: (ids, value) =>
      mutate((n) => {
        const target = value ?? !ids.every((id) => n[id]?.starred)
        for (const id of ids) if (n[id]) n[id] = { ...n[id], starred: target || undefined }
      }),

    touch: (id) => {
      const { manifest } = get()
      if (!manifest?.nodes[id]) return
      // Recent list is local-only bookkeeping, saved with the next real change.
      const nodesCopy = { ...manifest.nodes, [id]: { ...manifest.nodes[id], openedAt: Date.now() } }
      set({ manifest: { ...manifest, nodes: nodesCopy } })
    },

    patchNode: (id, patch) =>
      mutate((n) => {
        if (n[id]) n[id] = { ...n[id], ...patch }
      }),

    createShare: (folderId, perm) => {
      const grant: ShareGrant = { id: uid(16), folderId, perm, createdAt: Date.now() }
      mutateShares((s) => {
        s[grant.id] = grant
      })
      return grant
    },

    updateShare: (id, perm) =>
      mutateShares((s) => {
        if (s[id]) s[id] = { ...s[id], perm, updatedAt: Date.now() }
      }),

    revokeShare: (id) =>
      mutateShares((s) => {
        delete s[id]
      }),

    restoreShare: (grant) =>
      mutateShares((s) => {
        s[grant.id] = grant
      }),
  }
})

/* Access helpers for components and actions. */
export const useAccess = () => useDrive((s) => s.access)
export const useCanEdit = () => useDrive((s) => s.access.perm !== 'view')
export const canEdit = () => useDrive.getState().access.perm !== 'view'
export const accessRoot = () => useDrive.getState().access.rootId
export const isOwner = () => useDrive.getState().access.perm === 'owner'

export function useNodes() {
  return useDrive((s) => s.manifest?.nodes) ?? EMPTY
}
const EMPTY: Nodes = {}

export function visibleChildren(nodes: Nodes, parentId: string) {
  return childrenOf(nodes, parentId)
}

window.addEventListener('beforeunload', (e) => {
  const { saveState } = useDrive.getState()
  const busy = useTransfers.getState().transfers.some((t) => t.status === 'running' || t.status === 'queued')
  if (saveState === 'dirty' || saveState === 'saving' || busy) e.preventDefault()
})
