import { Check, ChevronRight, Copy, Eye, FilePlus2, FolderInput, FolderPlus, HardDrive, Keyboard, Link2, Pencil, PencilLine, Plus, Trash2, TriangleAlert, Users } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import * as actions from '../../actions'
import type { MessageKey } from '../../i18n'
import { childrenOf, displayName, isDescendantOf, isWithin, pathFrom, ROOT_ID, type ShareGrant, type SharePerm } from '../../lib/manifest'
import { cn, errorMessage, formatDateTime, formatRelative, modKey, splitName, validateName } from '../../lib/utils'
import { useAccess, useDrive, useNodes } from '../../store/drive'
import { useUI } from '../../store/ui'
import { Button, Dialog, Input, Kbd, Spinner, Switch, Tooltip } from '../ui/primitives'
import { SettingsDialog } from './SettingsDialog'
import { t } from '../../i18n'

export function Dialogs() {
  const dialog = useUI((s) => s.dialog)
  const close = () => useUI.getState().openDialog(null)
  const onOpenChange = (open: boolean) => !open && close()

  return (
    <>
      <NameDialog
        open={dialog?.type === 'newFolder'}
        onOpenChange={onOpenChange}
        title={t('New folder')}
        icon={<FolderPlus />}
        initial={t('Untitled folder')}
        submitLabel={t('Create')}
        onSubmit={(name) => {
          if (dialog?.type !== 'newFolder') return
          useDrive.getState().createFolder(dialog.parentId, name)
          toast.success(t('Created “{name}”', { name }))
        }}
      />
      <NameDialog
        open={dialog?.type === 'newFile'}
        onOpenChange={onOpenChange}
        title={t('New text file')}
        description={t('Creates an empty file you can edit right away. Use any extension — .md, .txt, .json, .py…')}
        icon={<FilePlus2 />}
        initial={t('Untitled.md')}
        submitLabel={t('Create & edit')}
        onSubmit={(name) => {
          if (dialog?.type !== 'newFile') return
          const file = new File([''], name, { type: 'text/plain' })
          actions.upload([{ file }], dialog.parentId)
          toast(t('Creating file…'), { description: t('It opens in the editor once it is saved to Discord.') })
          const unsub = useDrive.subscribe((s) => {
            const created = Object.values(s.manifest?.nodes ?? {}).find((n) => n.parentId === dialog.parentId && n.name === name && n.size === 0)
            if (created) {
              unsub()
              useUI.getState().openPreview(created.id, true)
            }
          })
          setTimeout(unsub, 30_000)
        }}
      />
      <RenameFallback />
      <MoveDialog />
      <ShareDialog />
      <ShareFolderDialog />
      <ConfirmDelete />
      <SettingsDialog open={dialog?.type === 'settings'} onOpenChange={onOpenChange} initialTab={dialog?.type === 'settings' ? dialog.tab : undefined} />
      <ShortcutsDialog open={dialog?.type === 'shortcuts'} onOpenChange={onOpenChange} />
    </>
  )
}

function NameDialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  initial,
  submitLabel,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  icon: React.ReactNode
  initial: string
  submitLabel: string
  onSubmit: (name: string) => void
}) {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setValue(initial)
      setError(null)
    }
  }, [open, initial])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const invalid = validateName(value)
    if (invalid) return setError(invalid)
    try {
      onSubmit(value.trim())
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description} icon={icon}>
      <form onSubmit={submit} className="space-y-4">
        <Input
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          onFocus={(e) => e.target.setSelectionRange(0, splitName(e.target.value).base.length)}
        />
        {error && <p className="text-sm font-medium text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button variant="primary">{submitLabel}</Button>
        </div>
      </form>
    </Dialog>
  )
}

/** Inline rename handles visible items; this dialog covers items not on screen (e.g. the open folder). */
function RenameFallback() {
  const dialog = useUI((s) => s.dialog)
  const nodes = useNodes()
  const id = dialog?.type === 'rename' ? dialog.id : null
  const [inline, setInline] = useState(true)
  useEffect(() => {
    if (id) setInline(Boolean(document.querySelector(`[data-id="${id}"]`)))
  }, [id])
  const node = id ? nodes[id] : null
  return (
    <NameDialog
      open={Boolean(node) && !inline}
      onOpenChange={(open) => !open && useUI.getState().openDialog(null)}
      title={t('Rename')}
      icon={<Pencil />}
      initial={node?.name ?? ''}
      submitLabel={t('Rename')}
      onSubmit={(name) => node && useDrive.getState().rename(node.id, name)}
    />
  )
}

function MoveDialog() {
  const dialog = useUI((s) => s.dialog)
  const nodes = useNodes()
  const ids = useMemo(() => (dialog?.type === 'move' ? dialog.ids : []), [dialog])
  const open = dialog?.type === 'move'
  const { rootId } = useAccess()
  const [current, setCurrent] = useState(rootId)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    if (open) {
      setCurrent(nodes[ids[0]]?.parentId ?? rootId)
      setCreating(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const folders = childrenOf(nodes, current)
    .filter((n) => n.type === 'folder')
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  const blocked = (folderId: string) => ids.some((id) => id === folderId || (nodes[id]?.type === 'folder' && isDescendantOf(nodes, folderId, id)))
  const sameParent = ids.every((id) => nodes[id]?.parentId === current)
  const close = () => useUI.getState().openDialog(null)
  const path = pathFrom(nodes, current, rootId)

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title={ids.length === 1 ? t('Move “{name}”', { name: nodes[ids[0]]?.name ?? '' }) : t('Move {n} items', { n: ids.length })}
      icon={<FolderInput />}
      className="max-w-lg"
    >
      <div className="flex flex-wrap items-center gap-0.5 text-sm">
        {path.map((p, i) => (
          <div key={p.id} className="flex min-w-0 items-center">
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-subtle" />}
            <button
              onClick={() => setCurrent(p.id)}
              title={displayName(p)}
              className={cn('max-w-56 truncate rounded-md px-1.5 py-0.5 font-semibold hover:bg-surface-2', i === path.length - 1 ? 'text-fg' : 'text-muted')}
            >
              {p.id === ROOT_ID && <HardDrive className="mr-1 inline size-4 -translate-y-px text-brand-500" />}
              {displayName(p)}
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 h-72 overflow-y-auto rounded-2xl border border-line bg-surface-2/40 p-1.5">
        {folders.length === 0 && !creating && <div className="grid h-full place-items-center text-sm text-subtle">{t('No subfolders')}</div>}
        {folders.map((f) => {
          const disabled = blocked(f.id)
          return (
            <button
              key={f.id}
              disabled={disabled}
              onDoubleClick={() => setCurrent(f.id)}
              onClick={() => setCurrent(f.id)}
              className="flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-medium transition hover:bg-surface disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-brand-400" fill="currentColor">
                <path d="M3 6.75A2.75 2.75 0 0 1 5.75 4h3.6c.73 0 1.43.29 1.94.8l1.06 1.06c.23.24.55.37.88.37h5.02A2.75 2.75 0 0 1 21 8.98v8.27A2.75 2.75 0 0 1 18.25 20H5.75A2.75 2.75 0 0 1 3 17.25z" />
              </svg>
              <span className="truncate">{f.name}</span>
              <ChevronRight className="ml-auto size-4 text-subtle" />
            </button>
          )
        })}
        {creating && (
          <form
            className="flex gap-2 p-1"
            onSubmit={(e) => {
              e.preventDefault()
              const invalid = validateName(newName)
              if (invalid) return void toast.error(invalid)
              const id = useDrive.getState().createFolder(current, newName)
              setCreating(false)
              setNewName('')
              setCurrent(id)
            }}
          >
            <Input autoFocus placeholder={t('Folder name')} value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Button variant="primary">{t('Create')}</Button>
          </form>
        )}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={() => setCreating(true)}>
          <FolderPlus className="size-4" /> {t('New folder')}
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={close}>
            {t('Cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={sameParent || blocked(current)}
            onClick={() => {
              actions.move(ids, current)
              close()
            }}
          >
            {t('Move here')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function ShareDialog() {
  const dialog = useUI((s) => s.dialog)
  const id = dialog?.type === 'share' ? dialog.id : null
  const node = useNodes()[id ?? '']
  const [share, setShare] = useState<{ url: string; expiresAt: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const link = share?.url ?? null

  useEffect(() => {
    if (!id) return
    setShare(null)
    setError(null)
    setCopied(false)
    actions.share(id).then(setShare, (err) => setError(errorMessage(err)))
  }, [id])

  const copy = async () => {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
    toast.success(t('Link copied to clipboard'))
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog
      open={Boolean(id)}
      onOpenChange={(o) => !o && useUI.getState().openDialog(null)}
      title={t('Share “{name}”', { name: node?.name ?? '' })}
      description={t('Anyone with this link can download the file. The link holds signed Discord URLs — nothing is uploaded to a third party.')}
      icon={<Link2 />}
      className="max-w-lg"
    >
      {error ? (
        <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : !link ? (
        <div className="flex items-center gap-3 text-sm text-muted">
          <Spinner /> {t('Generating link…')}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input readOnly value={link} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
            <Button variant="primary" onClick={copy}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? t('Copied') : t('Copy')}
            </Button>
          </div>
          <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {t('Discord signs attachment links for about 24 hours, so this link stops working {when}. Generate a new one any time.', {
              when: share ? formatRelative(share.expiresAt) : t('soon'),
            })}
          </p>
          {'share' in navigator && (
            <Button variant="outline" className="w-full" onClick={() => navigator.share({ title: node?.name, url: link }).catch(() => {})}>
              {t('Share via…')}
            </Button>
          )}
        </div>
      )}
    </Dialog>
  )
}

const PERMS: { value: SharePerm; label: MessageKey; icon: typeof Eye }[] = [
  { value: 'view', label: 'Can view', icon: Eye },
  { value: 'edit', label: 'Can edit', icon: PencilLine },
]

function PermToggle({ value, onChange, className }: { value: SharePerm; onChange: (perm: SharePerm) => void; className?: string }) {
  return (
    <div className={cn('flex shrink-0 rounded-xl bg-surface-2 p-0.5', className)} role="radiogroup">
      {PERMS.map((p) => (
        <button
          key={p.value}
          role="radio"
          aria-checked={value === p.value}
          onClick={() => value !== p.value && onChange(p.value)}
          className={cn(
            'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-semibold whitespace-nowrap transition',
            value === p.value ? 'bg-surface text-brand-700 shadow-sm dark:text-brand-400' : 'text-subtle hover:text-fg',
          )}
        >
          <p.icon className="size-3.5" /> {t(p.label)}
        </button>
      ))}
    </div>
  )
}

/** Invite links for a folder or the whole drive. Permissions live in the manifest, so they can change after sending. */
function ShareFolderDialog() {
  const dialog = useUI((s) => s.dialog)
  const id = dialog?.type === 'shareFolder' ? dialog.id : null
  const nodes = useNodes()
  const shares = useDrive((s) => s.manifest?.shares)
  const encrypted = useDrive((s) => Boolean(s.session?.encrypted))
  const driveName = useDrive((s) => s.profile?.name ?? '')
  const [perm, setPerm] = useState<SharePerm>('view')
  const [includeKey, setIncludeKey] = useState(true)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const grants = useMemo(
    () => Object.values(shares ?? {}).filter((g) => g.folderId === id).sort((a, b) => b.createdAt - a.createdAt),
    [shares, id],
  )
  const isDrive = id === ROOT_ID
  const name = isDrive ? driveName : (nodes[id ?? '']?.name ?? '')

  useEffect(() => {
    if (!id) return
    setPerm('view')
    setCopied(null)
  }, [id])

  const copy = async (grant: ShareGrant) => {
    try {
      const link = await actions.inviteLink(grant.id, includeKey)
      await navigator.clipboard.writeText(link)
      setCopied(grant.id)
      toast.success(t('Link copied to clipboard'))
      setTimeout(() => setCopied((c) => (c === grant.id ? null : c)), 2000)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const create = async () => {
    if (!id) return
    setBusy(true)
    try {
      const grant = useDrive.getState().createShare(id, perm)
      // The link is useless until the grant is on Discord, so save right away.
      await useDrive.getState().flush()
      await copy(grant)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={Boolean(id)}
      onOpenChange={(o) => !o && useUI.getState().openDialog(null)}
      title={isDrive ? t('Share the whole drive') : t('Share “{name}”', { name })}
      description={
        isDrive
          ? t('People with a link open the entire drive in Kdrive. Change their access or revoke a link at any time.')
          : t('People with a link open this folder and everything inside it. Change their access or revoke a link at any time.')
      }
      icon={isDrive ? <HardDrive /> : <Users />}
      className="max-w-lg"
    >
      <div className="space-y-5">
        {/* One row on wider screens; on phones the toggle and button each take a full line. */}
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface-2/40 p-3 sm:flex-row sm:items-center sm:gap-3">
          <span className="min-w-0 truncate text-sm font-semibold sm:flex-1">{t('New link')}</span>
          <PermToggle value={perm} onChange={setPerm} />
          <Button variant="primary" size="sm" className="h-9" loading={busy} onClick={create}>
            {!busy && <Plus className="size-4" />} {t('Create & copy')}
          </Button>
        </div>

        {encrypted && (
          <label className="flex items-start justify-between gap-4 text-sm">
            <span>
              <span className="font-semibold">{t('Include the decryption key')}</span>
              <span className="block text-xs text-muted">{t('Otherwise people also need the drive passphrase to open the link.')}</span>
            </span>
            <Switch checked={includeKey} onCheckedChange={setIncludeKey} />
          </label>
        )}

        <div>
          <div className="mb-2 text-[11px] font-bold tracking-wider text-subtle uppercase">{t('Active links')}</div>
          {grants.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-subtle">{t('No links yet. Create one above.')}</p>
          ) : (
            <ul className="space-y-1.5">
              {grants.map((g, i) => (
                <li key={g.id} className="flex flex-col gap-2 rounded-2xl border border-line px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <Link2 className="size-4 shrink-0 text-brand-500" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{t('Link {n}', { n: grants.length - i })}</div>
                      <div className="truncate text-xs text-subtle" title={formatDateTime(g.createdAt)}>
                        {formatRelative(g.createdAt)}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <PermToggle
                      className="flex-1 sm:flex-none"
                      value={g.perm}
                      onChange={(next) => {
                        useDrive.getState().updateShare(g.id, next)
                        toast.success(next === 'edit' ? t('Link changed to Editor') : t('Link changed to Viewer'))
                      }}
                    />
                    <Tooltip content={t('Copy link')}>
                      <Button variant="ghost" size="icon-sm" onClick={() => void copy(g)} aria-label={t('Copy link')}>
                        {copied === g.id ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
                      </Button>
                    </Tooltip>
                    <Tooltip content={t('Revoke link')}>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400"
                        aria-label={t('Revoke link')}
                        onClick={() => {
                          useDrive.getState().revokeShare(g.id)
                          toast(t('Link revoked'), { action: { label: t('Undo'), onClick: () => useDrive.getState().restoreShare(g) } })
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </Tooltip>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {t('Kdrive has no server, so every link contains this drive’s webhook. Viewer and folder limits are enforced by the Kdrive app, not by Discord — only share with people you trust.')}
        </p>
      </div>
    </Dialog>
  )
}

function ConfirmDelete() {
  const dialog = useUI((s) => s.dialog)
  const nodes = useNodes()
  const [busy, setBusy] = useState(false)
  const rootId = useAccess().rootId
  const ids =
    dialog?.type === 'delete'
      ? dialog.ids
      : dialog?.type === 'emptyTrash'
        ? Object.values(nodes)
            .filter((n) => n.trashedAt && isWithin(nodes, n.id, rootId))
            .map((n) => n.id)
        : []
  const open = dialog?.type === 'delete' || dialog?.type === 'emptyTrash'
  const close = () => useUI.getState().openDialog(null)
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title={
        dialog?.type === 'emptyTrash'
          ? t('Empty trash?')
          : ids.length === 1
            ? t('Delete “{name}” forever?', { name: nodes[ids[0]]?.name ?? '' })
            : t('Delete {n} items forever?', { n: ids.length })
      }
      description={t('The files will be deleted from Discord. This can’t be undone.')}
      icon={<Trash2 className="text-red-500" />}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('Cancel')}
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={async () => {
              setBusy(true)
              close()
              await actions.deleteForever(ids)
              setBusy(false)
            }}
          >
            {t('Delete forever')}
          </Button>
        </>
      }
    />
  )
}

const SHORTCUTS: [MessageKey, string[]][] = [
  ['Search', ['/']],
  ['Command palette', [modKey(), 'K']],
  ['Upload files', ['U']],
  ['New folder', ['⇧', 'N']],
  ['Open / preview', ['↵']],
  ['Quick look', ['Space']],
  ['Go to parent folder', ['⌫']],
  ['Select all', [modKey(), 'A']],
  ['Extend selection', ['⇧', '↑↓←→']],
  ['Rename', ['F2']],
  ['Move to…', ['M']],
  ['Cut / paste (move)', [modKey(), 'X / V']],
  ['Download', ['D']],
  ['Star', ['S']],
  ['Edit text file', ['E']],
  ['Move to trash', ['Del']],
  ['Toggle details', ['I']],
  ['Toggle grid / list', ['V']],
  ['Settings', [',']],
]

function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('Keyboard shortcuts')} icon={<Keyboard />} className="max-w-xl">
      <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
        {SHORTCUTS.map(([label, keys]) => (
          <div key={label} className="flex items-center justify-between border-b border-line py-2 text-sm">
            <span className="text-muted">{t(label)}</span>
            <span className="flex gap-1">
              {keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
    </Dialog>
  )
}
