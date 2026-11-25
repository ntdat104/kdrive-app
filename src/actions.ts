import { toast } from 'sonner'
import { loadBlob } from './lib/blob-cache'
import { exportKey } from './lib/crypto'
import type { FolderColor } from './lib/folderColors'
import { previewMode } from './lib/filetypes'
import { displayName, isInTrash, ROOT_ID, type DriveNode } from './lib/manifest'
import { encodeInvite, encodeShare, shareExpiry } from './lib/share'
import { errorMessage } from './lib/utils'
import { router } from './router'
import { accessRoot, useDrive } from './store/drive'
import { useTransfers, type UploadItem } from './store/transfers'
import { useUI } from './store/ui'
import { t } from './i18n'

/** User-level operations shared by menus, toolbars and keyboard shortcuts. */

const nodes = () => useDrive.getState().manifest?.nodes ?? {}

export function folderUrl(id: string) {
  return id === accessRoot() ? '/drive' : `/drive/f/${id}`
}

export function openNode(node: DriveNode) {
  if (node.trashedAt || isInTrash(nodes(), node.id)) {
    toast(t('This item is in the trash'), { description: t('Restore it to open it.'), action: { label: t('Restore'), onClick: () => restore([node.id]) } })
    return
  }
  if (node.type === 'folder') {
    useUI.getState().clearSelection()
    void router.navigate(folderUrl(node.id))
    return
  }
  useDrive.getState().touch(node.id)
  if (previewMode(node.name, node.mime, node.size)) useUI.getState().openPreview(node.id)
  else void download([node.id])
}

export function revealNode(node: DriveNode) {
  if (!node.parentId) return
  void router.navigate(folderUrl(node.parentId))
  setTimeout(() => useUI.getState().select([node.id], node.id), 50)
}

export const download = (ids: string[]) => useTransfers.getState().download(ids)

export function upload(items: UploadItem[], parentId: string) {
  if (!items.length) return
  useTransfers.getState().upload(items, parentId)
}

export function trash(ids: string[]) {
  if (!ids.length) return
  const drive = useDrive.getState()
  drive.trash(ids)
  useUI.getState().clearSelection()
  const first = nodes()[ids[0]]
  toast(ids.length === 1 ? t('Moved “{name}” to trash', { name: first?.name ?? '' }) : t('Moved {n} items to trash', { n: ids.length }), {
    action: { label: t('Undo'), onClick: () => useDrive.getState().restore(ids) },
  })
}

export function restore(ids: string[]) {
  useDrive.getState().restore(ids)
  useUI.getState().clearSelection()
  toast.success(t('Restored {n} items', { n: ids.length }))
}

export async function deleteForever(ids: string[]) {
  useUI.getState().clearSelection()
  await useDrive.getState().deleteForever(ids)
}

export function move(ids: string[], targetId: string) {
  const before = new Map(ids.map((id) => [id, nodes()[id]?.parentId ?? null]))
  try {
    const moved = useDrive.getState().move(ids, targetId)
    if (!moved) return
    const target = nodes()[targetId]
    useUI.getState().clearSelection()
    toast.success(t('Moved {n} items to “{target}”', { n: moved, target: target ? displayName(target) : '' }), {
      action: {
        label: t('Undo'),
        onClick: () => {
          for (const [id, parent] of before) if (parent) useDrive.getState().move([id], parent)
        },
      },
    })
  } catch (err) {
    toast.error(errorMessage(err))
  }
}

export function toggleStar(ids: string[]) {
  const all = ids.every((id) => nodes()[id]?.starred)
  useDrive.getState().toggleStar(ids, !all)
  toast(all ? t('Removed from starred') : t('Added to starred'))
}

export function setFolderColor(ids: string[], color: FolderColor | undefined) {
  try {
    useDrive.getState().setFolderColor(ids, color)
  } catch (err) {
    toast.error(errorMessage(err))
  }
}

export function cut(ids: string[]) {
  if (!ids.length) return
  useUI.getState().setClipboard({ ids, mode: 'cut' })
  toast(t('{n} items ready to move', { n: ids.length }), { description: t('Open a folder and press Paste (Ctrl/⌘+V).') })
}

export function paste(targetId: string) {
  const clip = useUI.getState().clipboard
  if (!clip) return
  move(clip.ids, targetId)
  useUI.getState().setClipboard(null)
}

export async function duplicate(id: string) {
  const { session } = useDrive.getState()
  const node = nodes()[id]
  if (!session || !node || node.type !== 'file' || !node.parentId) return
  const toastId = toast.loading(t('Copying {name}…', { name: node.name }))
  try {
    const entry = await loadBlob(session, node)
    const file = new File([entry.blob], node.name, { type: node.mime })
    toast.dismiss(toastId)
    upload([{ file }], node.parentId)
  } catch (err) {
    toast.error(t('Copy failed'), { id: toastId, description: errorMessage(err) })
  }
}

export async function share(id: string) {
  const { session } = useDrive.getState()
  const node = nodes()[id]
  if (!session || !node || node.type !== 'file') return null
  if (node.enc) throw new Error(t('Encrypted files can’t be shared as public links'))
  const urls = await session.shareUrls(node)
  const payload = { n: node.name, s: node.size, t: node.mime, u: urls }
  return { url: encodeShare(payload), expiresAt: shareExpiry(payload) }
}

/** Invite link for a folder/drive share grant. Encrypted drives can embed the key so invitees skip the passphrase. */
export async function inviteLink(grantId: string, includeKey: boolean) {
  const { session, manifest, profile } = useDrive.getState()
  const grant = manifest?.shares?.[grantId]
  if (!session || !manifest || !grant) throw new Error(t('This share link no longer exists'))
  const name = grant.folderId === ROOT_ID ? (profile?.name ?? 'Kdrive') : (manifest.nodes[grant.folderId]?.name ?? '')
  let k: string | undefined
  if (includeKey && session.key) {
    try {
      k = await exportKey(session.key)
    } catch {
      throw new Error(t('Lock and unlock the drive again to include the key in links'))
    }
  }
  return encodeInvite({ w: session.webhookUrl, g: grant.id, n: name, k })
}

export async function createQuickPreview(id: string) {
  try {
    await useTransfers.getState().createQuickPreview(id)
    toast.success(t('Quick preview created'), { description: t('It now opens instantly, then switches to full quality.') })
  } catch (err) {
    toast.error(t('Couldn’t create a quick preview'), { description: errorMessage(err) })
  }
}

export function selectedIds() {
  return [...useUI.getState().selection]
}
