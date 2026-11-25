import {
  Check,
  ChevronRight,
  ChevronsUpDown,
  Clock,
  FilePlus2,
  FolderPlus,
  FolderUp,
  HardDrive,
  LinkIcon,
  Lock,
  LogOut,
  Plus,
  Settings,
  Star,
  Trash2,
  Upload,
  Users,
} from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { useMemo, useState, type ReactNode } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router'
import { folderUrl, move, upload } from '../../actions'
import { useCurrentFolderId } from '../../hooks'
import { isFileDrag, isInternalDrag, itemsFromDataTransfer, readInternalDrag } from '../../lib/dnd'
import { groupOf, GROUP_META, kindOf, type KindGroup } from '../../lib/filetypes'
import { childrenOf, isInTrash, isWithin, pathTo, ROOT_ID } from '../../lib/manifest'
import { folderSwatch } from '../../lib/folderColors'
import { cn, formatSize } from '../../lib/utils'
import { useAccess, useDrive, useNodes } from '../../store/drive'
import { useDrives } from '../../store/drives'
import { useOpenLink } from '../../platform/links'
import { useUI } from '../../store/ui'
import { Wordmark } from '../Logo'
import { Button, menuContentClass, menuItemClass, menuSeparatorClass, menuShortcutClass } from '../ui/primitives'
import { pickFiles, pickFolder } from './UploadInputs'
import { t } from '../../i18n'

export function Sidebar() {
  const folderId = useCurrentFolderId()
  const openDialog = useUI((s) => s.openDialog)
  const nodes = useNodes()
  const { rootId, perm } = useAccess()
  const writable = perm !== 'view'
  const rootName = useDrive((s) => (perm === 'owner' ? t('My Drive') : (s.profile?.name ?? '')))
  const counts = useMemo(() => {
    let starred = 0
    let trash = 0
    for (const n of Object.values(nodes)) {
      if (rootId !== ROOT_ID && (n.id === rootId || !isWithin(nodes, n.id, rootId))) continue
      if (n.trashedAt) trash++
      else if (n.starred) starred++
    }
    return { starred, trash }
  }, [nodes, rootId])

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Wordmark />
      </div>

      {writable && (
        <div className="px-4 pb-3">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="primary" size="lg" className="w-full justify-start rounded-2xl">
                <Plus className="size-5" strokeWidth={2.5} /> {t('New')}
                <span className="ml-auto rounded-md border border-current/35 px-1.5 text-[11px]">N</span>
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="start" sideOffset={8} className={cn(menuContentClass, 'w-60')}>
                <DropdownMenu.Item className={menuItemClass} onSelect={() => pickFiles(folderId)}>
                  <Upload /> {t('Upload files')} <span className={menuShortcutClass}>U</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item className={menuItemClass} onSelect={() => pickFolder(folderId)}>
                  <FolderUp /> {t('Upload folder')}
                </DropdownMenu.Item>
                <DropdownMenu.Separator className={menuSeparatorClass} />
                <DropdownMenu.Item className={menuItemClass} onSelect={() => openDialog({ type: 'newFolder', parentId: folderId })}>
                  <FolderPlus /> {t('New folder')} <span className={menuShortcutClass}>⇧N</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item className={menuItemClass} onSelect={() => openDialog({ type: 'newFile', parentId: folderId })}>
                  <FilePlus2 /> {t('New text file')}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      )}

      {perm !== 'owner' && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-xs font-semibold text-brand-800 dark:text-brand-300">
          <Users className="size-4 shrink-0" />
          <span className="min-w-0 truncate">{perm === 'edit' ? t('Shared with you · Editor') : t('Shared with you · Viewer')}</span>
        </div>
      )}

      <nav className="space-y-0.5 px-3">
        <NavItem to="/drive" end icon={perm === 'owner' ? <HardDrive /> : <Users />} label={rootName} dropTarget={writable ? rootId : undefined} />
        <NavItem to="/drive/recent" icon={<Clock />} label={t('Recent')} />
        <NavItem to="/drive/starred" icon={<Star />} label={t('Starred')} count={counts.starred} />
        {writable && <NavItem to="/drive/trash" icon={<Trash2 />} label={t('Trash')} count={counts.trash} />}
      </nav>

      <div className="mt-5 flex min-h-0 flex-1 flex-col">
        <div className="px-6 pb-1.5 text-[11px] font-bold tracking-wider text-subtle uppercase">{t('Folders')}</div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <FolderTree parentId={rootId} depth={0} />
        </div>
      </div>

      <StorageCard />
      <DriveSwitcher />
    </div>
  )
}

function useDropTarget(targetId: string | undefined) {
  const [over, setOver] = useState(false)
  if (!targetId) return { over: false, props: {} }
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => {
        if (!isInternalDrag(e) && !isFileDrag(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = isInternalDrag(e) ? 'move' : 'copy'
        setOver(true)
      },
      onDragLeave: () => setOver(false),
      onDrop: async (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setOver(false)
        if (isInternalDrag(e)) move(readInternalDrag(e), targetId)
        else if (isFileDrag(e)) upload(await itemsFromDataTransfer(e.dataTransfer), targetId)
      },
    },
  }
}

function NavItem({ to, icon, label, count, end, dropTarget }: { to: string; icon: ReactNode; label: string; count?: number; end?: boolean; dropTarget?: string }) {
  const drop = useDropTarget(dropTarget)
  return (
    <NavLink
      to={to}
      end={end}
      {...drop.props}
      className={({ isActive }) =>
        cn(
          'focus-ring group flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition [&_svg]:size-[18px]',
          isActive ? 'bg-accent-soft text-brand-800 dark:text-brand-300' : 'text-muted hover:bg-surface-2 hover:text-fg',
          drop.over && 'bg-brand-500/15 ring-2 ring-brand-500',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span className={cn('shrink-0', isActive ? 'text-brand-500' : 'text-subtle group-hover:text-muted')}>{icon}</span>
          <span className="min-w-0 truncate" title={label}>
            {label}
          </span>
          {!!count && <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-muted">{count}</span>}
        </>
      )}
    </NavLink>
  )
}

function FolderTree({ parentId, depth }: { parentId: string; depth: number }) {
  const nodes = useNodes()
  const folders = useMemo(
    () => childrenOf(nodes, parentId).filter((n) => n.type === 'folder').sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    [nodes, parentId],
  )
  if (!folders.length) {
    return depth === 0 ? <p className="px-3 py-2 text-xs text-subtle">{t('No folders yet')}</p> : null
  }
  return (
    <ul>
      {folders.map((f) => (
        <FolderTreeItem key={f.id} id={f.id} name={f.name} depth={depth} />
      ))}
    </ul>
  )
}

function FolderTreeItem({ id, name, depth }: { id: string; name: string; depth: number }) {
  const nodes = useNodes()
  const { folderId } = useParams()
  const active = folderId === id
  const inPath = useMemo(() => (folderId ? pathTo(nodes, folderId).some((n) => n.id === id) : false), [nodes, folderId, id])
  const [open, setOpen] = useState<boolean | null>(null)
  const expanded = open ?? (inPath && !active ? true : false)
  const hasChildren = useMemo(() => childrenOf(nodes, id).some((n) => n.type === 'folder'), [nodes, id])
  const writable = useAccess().perm !== 'view'
  const drop = useDropTarget(writable ? id : undefined)
  const navigate = useNavigate()

  return (
    <li>
      <div
        {...drop.props}
        role="button"
        tabIndex={0}
        onClick={() => navigate(folderUrl(id))}
        onKeyDown={(e) => e.key === 'Enter' && navigate(folderUrl(id))}
        className={cn(
          'focus-ring group flex h-8 items-center gap-1 rounded-lg pr-2 text-[13px] font-medium transition',
          active ? 'bg-accent-soft text-brand-800 dark:text-brand-300' : 'text-muted hover:bg-surface-2 hover:text-fg',
          drop.over && 'bg-brand-500/15 ring-2 ring-brand-500',
        )}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        <button
          className={cn('grid size-5 place-items-center rounded text-subtle hover:text-fg', !hasChildren && 'invisible')}
          onClick={(e) => {
            e.stopPropagation()
            setOpen(!expanded)
          }}
          aria-label={expanded ? t('Collapse') : t('Expand')}
        >
          <ChevronRight className={cn('size-3.5 transition-transform', expanded && 'rotate-90')} />
        </button>
        <svg viewBox="0 0 24 24" className={cn('size-4 shrink-0', active ? 'text-brand-500' : 'text-brand-400/80')} style={{ color: folderSwatch(nodes[id]?.color) }} fill="currentColor">
          <path d="M3 6.75A2.75 2.75 0 0 1 5.75 4h3.6c.73 0 1.43.29 1.94.8l1.06 1.06c.23.24.55.37.88.37h5.02A2.75 2.75 0 0 1 21 8.98v8.27A2.75 2.75 0 0 1 18.25 20H5.75A2.75 2.75 0 0 1 3 17.25z" />
        </svg>
        <span className="ml-1 truncate">{name}</span>
      </div>
      {expanded && <FolderTree parentId={id} depth={depth + 1} />}
    </li>
  )
}

function StorageCard() {
  const nodes = useNodes()
  const encrypted = useDrive((s) => s.session?.encrypted)
  const rootId = useAccess().rootId
  const stats = useMemo(() => {
    const groups = new Map<KindGroup, number>()
    let total = 0
    let files = 0
    for (const n of Object.values(nodes)) {
      if (n.type !== 'file' || isInTrash(nodes, n.id) || !isWithin(nodes, n.id, rootId)) continue
      total += n.size
      files++
      const g = groupOf(kindOf(n.name, n.mime))
      groups.set(g, (groups.get(g) ?? 0) + n.size)
    }
    return { total, files, groups: [...groups.entries()].sort((a, b) => b[1] - a[1]) }
  }, [nodes, rootId])

  return (
    <div className="mx-3 mb-2 rounded-2xl border border-line bg-surface-2/60 p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-muted">{t('Storage')}</span>
        {encrypted && (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
            <Lock className="size-3" /> E2EE
          </span>
        )}
      </div>
      <div className="mt-1 text-lg font-extrabold tracking-tight">
        {formatSize(stats.total)} <span className="text-xs font-semibold text-subtle">· {t('{n} files', { n: stats.files })}</span>
      </div>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-line">
        {stats.groups.map(([g, size]) => (
          <div key={g} style={{ width: `${(size / Math.max(stats.total, 1)) * 100}%`, background: GROUP_META[g].color }} title={t(GROUP_META[g].label)} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {stats.groups.slice(0, 4).map(([g]) => (
          <span key={g} className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
            <span className="size-2 rounded-full" style={{ background: GROUP_META[g].color }} />
            {t(GROUP_META[g].label)}
          </span>
        ))}
        {!stats.groups.length && <span className="text-[11px] text-subtle">{t('Unlimited space on Discord ✨')}</span>}
      </div>
    </div>
  )
}

function DriveSwitcher() {
  const profiles = useDrives((s) => s.profiles)
  const activeId = useDrives((s) => s.activeId)
  const setActive = useDrives((s) => s.setActive)
  const remove = useDrives((s) => s.remove)
  const close = useDrive((s) => s.close)
  const flush = useDrive((s) => s.flush)
  const openDialog = useUI((s) => s.openDialog)
  const navigate = useNavigate()
  const active = profiles.find((p) => p.id === activeId)
  const { perm } = useAccess()

  const switchTo = async (id: string) => {
    await flush()
    close()
    setActive(id)
    navigate('/drive')
  }

  return (
    <div className="border-t border-line p-3">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="focus-ring flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-surface-2">
            <DriveAvatar name={active?.name ?? '?'} avatar={active?.avatar} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{active?.name}</div>
              <div className="truncate text-xs text-subtle">
                {perm === 'owner' ? t('Discord webhook drive') : perm === 'edit' ? t('Shared with you · Editor') : t('Shared with you · Viewer')}
              </div>
            </div>
            <ChevronsUpDown className="size-4 text-subtle" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content side="top" align="start" sideOffset={8} className={cn(menuContentClass, 'w-64')}>
            <DropdownMenu.Label className="px-2.5 py-1.5 text-[11px] font-bold tracking-wider text-subtle uppercase">{t('Drives')}</DropdownMenu.Label>
            {profiles.map((p) => (
              <DropdownMenu.Item key={p.id} className={menuItemClass} onSelect={() => p.id !== activeId && void switchTo(p.id)}>
                <DriveAvatar name={p.name} avatar={p.avatar} small />
                <span className="truncate">{p.name}</span>
                {p.shareId && <Users className="!size-3" />}
                {p.encrypted && <Lock className="!size-3" />}
                {p.id === activeId && <Check className="ml-auto !text-brand-500" />}
              </DropdownMenu.Item>
            ))}
            <DropdownMenu.Item className={menuItemClass} onSelect={() => navigate('/connect')}>
              <Plus /> {t('Connect another drive')}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={menuItemClass} onSelect={() => useOpenLink.getState().setOpen(true)}>
              <LinkIcon /> {t('Open a Kdrive link…')}
            </DropdownMenu.Item>
            <DropdownMenu.Separator className={menuSeparatorClass} />
            {perm === 'owner' && (
              <DropdownMenu.Item className={menuItemClass} onSelect={() => openDialog({ type: 'shareFolder', id: ROOT_ID })}>
                <Users /> {t('Share the whole drive…')}
              </DropdownMenu.Item>
            )}
            <DropdownMenu.Item className={menuItemClass} onSelect={() => openDialog({ type: 'settings' })}>
              <Settings /> {t('Settings')} <span className={menuShortcutClass}>,</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={menuItemClass}
              onSelect={async () => {
                if (!active) return
                await flush()
                close()
                remove(active.id)
                navigate(profiles.length > 1 ? '/drive' : '/')
              }}
            >
              <LogOut /> {t('Disconnect this drive')}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  )
}

export function DriveAvatar({ name, avatar, small }: { name: string; avatar?: string | null; small?: boolean }) {
  const size = small ? 'size-6 rounded-md text-[10px]' : 'size-9 rounded-xl text-sm'
  if (avatar) return <img src={avatar} alt="" className={cn(size, 'shrink-0 object-cover')} />
  return (
    <span className={cn(size, 'grid shrink-0 place-items-center bg-gradient-to-br from-brand-400 to-brand-600 font-extrabold text-accent-fg')}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}
