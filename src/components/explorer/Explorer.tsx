import {
  ArrowDownAZ,
  ArrowUpAZ,
  Check,
  ChevronRight,
  Download,
  FolderInput,
  HardDrive,
  LayoutGrid,
  Link2,
  List,
  PanelRight,
  Pencil,
  RotateCcw,
  Star,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { ContextMenu, DropdownMenu } from 'radix-ui'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import * as actions from '../../actions'
import { useMediaQuery } from '../../hooks'
import { isFileDrag, isInternalDrag, itemsFromDataTransfer, readInternalDrag } from '../../lib/dnd'
import type { MessageKey } from '../../i18n'
import { displayName, isWithin, pathFrom, ROOT_ID, type DriveNode } from '../../lib/manifest'
import { cn, formatSize } from '../../lib/utils'
import { canEdit as canEditNow, useAccess, useDrive, useNodes } from '../../store/drive'
import { useSettings, type SortKey } from '../../store/settings'
import { activeUploadsIn, useTransfers } from '../../store/transfers'
import { useUI } from '../../store/ui'
import { Button, menuContentClass, menuItemClass, menuSeparatorClass, Tooltip } from '../ui/primitives'
import { DetailsPanel } from './DetailsPanel'
import { EmptyState } from './EmptyState'
import { GridItem, ListRow, UploadGhost } from './Items'
import { backgroundMenu, ContextMenuEntries, itemMenu, type MenuEntry } from './menu'
import { useExplorerItems, type ExplorerView } from './useItems'
import { t } from '../../i18n'

const TITLES: Record<Exclude<ExplorerView, 'folder'>, MessageKey> = {
  recent: 'Recent',
  starred: 'Starred',
  trash: 'Trash',
  search: 'Search results',
}

export function Explorer({ view }: { view: ExplorerView }) {
  const { folderId: param } = useParams()
  const [params] = useSearchParams()
  const nodes = useNodes()
  const navigate = useNavigate()
  const access = useAccess()
  const writable = access.perm !== 'view'
  const folderId = view === 'folder' ? (param ?? access.rootId) : access.rootId
  const folder = nodes[folderId]
  const query = params.get('q') ?? ''
  const items = useExplorerItems(view, folderId, query)
  const viewMode = useSettings((s) => s.view)
  const showDetails = useSettings((s) => s.showDetails)
  const selection = useUI((s) => s.selection)
  const cursor = useUI((s) => s.cursor)
  const clipboard = useUI((s) => s.clipboard)
  const transfers = useTransfers((s) => s.transfers)
  const ghosts = view === 'folder' ? activeUploadsIn(transfers, folderId) : []
  const canWrite = view === 'folder' && writable
  const isWide = useMediaQuery('(min-width: 1280px)')

  // Leave a folder that was deleted or trashed from elsewhere, or that lies outside a shared folder.
  useEffect(() => {
    if (view === 'folder' && param && (!folder || folder.trashedAt || !isWithin(nodes, param, access.rootId))) navigate('/drive', { replace: true })
  }, [view, param, folder, nodes, access.rootId, navigate])

  // Reset selection when the listing changes context.
  useEffect(() => {
    useUI.getState().clearSelection()
    useUI.getState().setCursor(null)
  }, [view, folderId])

  // Drop selected ids that disappeared (moved, deleted).
  useEffect(() => {
    const { selection: sel, select } = useUI.getState()
    const visible = new Set(items.map((i) => i.id))
    if ([...sel].some((id) => !visible.has(id))) select([...sel].filter((id) => visible.has(id)))
  }, [items])

  const onItemClick = useCallback(
    (e: React.MouseEvent, node: DriveNode) => {
      const ui = useUI.getState()
      if (e.shiftKey && ui.anchor) {
        const a = items.findIndex((i) => i.id === ui.anchor)
        const b = items.findIndex((i) => i.id === node.id)
        if (a >= 0 && b >= 0) {
          const range = items.slice(Math.min(a, b), Math.max(a, b) + 1).map((i) => i.id)
          ui.select(e.metaKey || e.ctrlKey ? [...new Set([...ui.selection, ...range])] : range)
          ui.setCursor(node.id)
          return
        }
      }
      if (e.metaKey || e.ctrlKey) return ui.toggle(node.id)
      ui.select([node.id], node.id)
    },
    [items],
  )

  const onOpen = useCallback((node: DriveNode) => actions.openNode(node), [])

  useExplorerKeyboard(items, view, folderId)

  const title = view === 'folder' ? null : t(TITLES[view])
  const selectedNodes = [...selection].map((id) => nodes[id]).filter(Boolean)
  const cutIds = useMemo(() => new Set(clipboard?.ids ?? []), [clipboard])

  return (
    <div className="flex h-full">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 px-4 pt-5 pb-3 sm:px-6">
          {view === 'folder' ? <Breadcrumbs folderId={folderId} /> : <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>}
          {view === 'search' && (
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted">
              {t('{n} results', { n: items.length })}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {view === 'folder' && access.perm === 'owner' && (
              <Tooltip content={folderId === ROOT_ID ? t('Share the whole drive…') : t('Share folder…')}>
                <Button variant="ghost" size="sm" className="text-muted" onClick={() => useUI.getState().openDialog({ type: 'shareFolder', id: folderId })}>
                  <Users className="size-4" />
                  <span className="hidden sm:inline">{t('Share')}</span>
                </Button>
              </Tooltip>
            )}
            {view === 'trash' && writable && items.length > 0 && (
              <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-500/10 dark:text-red-400" onClick={() => useUI.getState().openDialog({ type: 'emptyTrash' })}>
                <Trash2 className="size-4" /> {t('Empty trash')}
              </Button>
            )}
            {view !== 'recent' && view !== 'trash' && <SortMenu />}
            <ViewToggle />
            <Tooltip content={t('Details (I)')}>
              <Button
                variant="ghost"
                size="icon-sm"
                className={cn(showDetails && 'bg-accent-soft text-brand-700 dark:text-brand-400')}
                onClick={() => useSettings.getState().set({ showDetails: !showDetails })}
                aria-label={t('Toggle details')}
              >
                <PanelRight className="size-4" />
              </Button>
            </Tooltip>
          </div>
        </div>

        <SelectionBar nodes={selectedNodes} view={view} />

        <Listing view={view} folderId={folderId} canWrite={canWrite}>
          {items.length === 0 && ghosts.length === 0 ? (
            <EmptyState view={view} folderId={folderId} query={query} />
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] sm:gap-4">
              {ghosts.map((t) => (
                <UploadGhost key={t.id} transfer={t} view="grid" />
              ))}
              {items.map((node) => (
                <GridItem
                  key={node.id}
                  node={node}
                  selected={selection.has(node.id)}
                  focused={cursor === node.id}
                  cut={cutIds.has(node.id)}
                  showLocation={view === 'search' || view === 'starred' || view === 'recent'}
                  onClick={onItemClick}
                  onOpen={onOpen}
                />
              ))}
            </div>
          ) : (
            <div>
              <div className="sticky top-0 z-10 mb-1 hidden grid-cols-[auto_minmax(0,1fr)_150px_100px_120px_auto] gap-3 border-b border-line bg-bg/90 px-3 py-2 text-xs font-bold tracking-wide text-subtle uppercase backdrop-blur md:grid">
                <span className="w-9" />
                <SortHeader label={t('Name')} sortKey="name" />
                <SortHeader label={view === 'trash' ? t('Trashed') : t('Modified')} sortKey="updatedAt" />
                <SortHeader label={t('Size')} sortKey="size" />
                <SortHeader label={t('Type')} sortKey="type" />
                <span className="w-8" />
              </div>
              <div className="space-y-0.5">
                {ghosts.map((t) => (
                  <UploadGhost key={t.id} transfer={t} view="list" />
                ))}
                {items.map((node) => (
                  <ListRow
                    key={node.id}
                    node={node}
                    selected={selection.has(node.id)}
                    focused={cursor === node.id}
                    cut={cutIds.has(node.id)}
                    showLocation={view === 'search' || view === 'starred' || view === 'recent'}
                    onClick={onItemClick}
                    onOpen={onOpen}
                  />
                ))}
              </div>
            </div>
          )}
        </Listing>
      </div>

      <AnimatePresence initial={false}>
        {showDetails && (
          <motion.aside
            key="details"
            initial={isWide ? { width: 0, opacity: 0 } : { x: 360 }}
            animate={isWide ? { width: 340, opacity: 1 } : { x: 0 }}
            exit={isWide ? { width: 0, opacity: 0 } : { x: 360 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
            className={cn(
              'shrink-0 overflow-hidden border-l border-line bg-surface',
              isWide ? 'relative' : 'fixed inset-y-0 right-0 z-40 w-[340px] max-w-[90vw] shadow-2xl',
            )}
          >
            <DetailsPanel folderId={view === 'folder' ? folderId : null} />
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------- Listing -------------------------------- */

/** Scroll area with file drop, marquee selection and context menus. */
function Listing({ view, folderId, canWrite, children }: { view: ExplorerView; folderId: string; canWrite: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [dropping, setDropping] = useState(false)
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [menu, setMenu] = useState<MenuEntry[]>([])
  const depth = useRef(0)

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-id],button,input,a')) return
    const container = ref.current!
    const box = container.getBoundingClientRect()
    const startX = e.clientX - box.left + container.scrollLeft
    const startY = e.clientY - box.top + container.scrollTop
    const additive = e.shiftKey || e.metaKey || e.ctrlKey
    const base = additive ? new Set(useUI.getState().selection) : new Set<string>()
    if (!additive) useUI.getState().clearSelection()
    let frame = 0
    let moved = false

    const onMove = (ev: MouseEvent) => {
      const x = ev.clientX - box.left + container.scrollLeft
      const y = ev.clientY - box.top + container.scrollTop
      if (!moved && Math.hypot(x - startX, y - startY) < 5) return
      moved = true
      const rect = { x: Math.min(x, startX), y: Math.min(y, startY), w: Math.abs(x - startX), h: Math.abs(y - startY) }
      setMarquee(rect)
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const hit = new Set(base)
        container.querySelectorAll<HTMLElement>('[data-id]').forEach((el) => {
          const r = el.getBoundingClientRect()
          const ex = r.left - box.left + container.scrollLeft
          const ey = r.top - box.top + container.scrollTop
          if (ex < rect.x + rect.w && ex + r.width > rect.x && ey < rect.y + rect.h && ey + r.height > rect.y) hit.add(el.dataset.id!)
        })
        useUI.getState().select([...hit])
      })
    }
    const onUp = () => {
      cancelAnimationFrame(frame)
      setMarquee(null)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const onContextMenu = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')
    const ui = useUI.getState()
    if (el) {
      const id = el.dataset.id!
      if (!ui.selection.has(id)) ui.select([id], id)
      const ids = ui.selection.has(id) ? [...useUI.getState().selection] : [id]
      setMenu(itemMenu(ids, { reveal: view !== 'folder' }))
    } else {
      ui.clearSelection()
      setMenu(backgroundMenu(folderId, canWrite))
    }
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          ref={ref}
          onMouseDown={onMouseDown}
          onContextMenu={onContextMenu}
          onDragEnter={(e) => {
            if (!canWrite || !isFileDrag(e)) return
            depth.current++
            setDropping(true)
          }}
          onDragLeave={(e) => {
            if (!canWrite || !isFileDrag(e)) return
            if (--depth.current <= 0) setDropping(false)
          }}
          onDragOver={(e) => {
            if (canWrite && (isFileDrag(e) || isInternalDrag(e))) e.preventDefault()
          }}
          onDrop={async (e) => {
            e.preventDefault()
            depth.current = 0
            setDropping(false)
            if (!canWrite) return
            if (isInternalDrag(e)) actions.move(readInternalDrag(e), folderId)
            else if (isFileDrag(e)) actions.upload(await itemsFromDataTransfer(e.dataTransfer), folderId)
          }}
          className="relative min-h-0 flex-1 overflow-y-auto px-4 pb-28 sm:px-6"
        >
          {children}
          {marquee && (
            <div
              className="pointer-events-none absolute z-20 rounded-md border border-brand-500 bg-brand-500/10"
              style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
            />
          )}
          <AnimatePresence>
            {dropping && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="pointer-events-none fixed inset-x-4 top-20 bottom-4 z-30 grid place-items-center rounded-3xl border-2 border-dashed border-brand-500 bg-brand-500/10 backdrop-blur-[2px] lg:left-[288px]"
              >
                <motion.div initial={{ scale: 0.9, y: 10 }} animate={{ scale: 1, y: 0 }} className="flex flex-col items-center gap-3 rounded-3xl bg-surface px-10 py-8 shadow-2xl">
                  <div className="grid size-16 animate-float place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-accent-fg shadow-lg shadow-brand-500/40">
                    <Download className="size-8 rotate-180" />
                  </div>
                  <div className="text-lg font-bold">{t('Drop to upload')}</div>
                  <div className="text-sm text-muted">{t('Files and whole folders are supported')}</div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={menuContentClass} onCloseAutoFocus={(e) => e.preventDefault()}>
          <ContextMenuEntries entries={menu} />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}

/* ----------------------------- Breadcrumbs ------------------------------ */

function Breadcrumbs({ folderId }: { folderId: string }) {
  const nodes = useNodes()
  const navigate = useNavigate()
  const { rootId, perm } = useAccess()
  const shared = perm !== 'owner'
  const profileName = useDrive((s) => s.profile?.name ?? '')
  const path = pathFrom(nodes, folderId, rootId)
  const [over, setOver] = useState<string | null>(null)
  const collapsed = path.length > 4
  const visible = collapsed ? [path[0], ...path.slice(-2)] : path

  return (
    <nav className="flex min-w-0 items-center gap-0.5 text-xl font-extrabold tracking-tight sm:text-2xl" aria-label={t('Breadcrumb')}>
      {visible.map((node, i) => {
        const last = i === visible.length - 1
        return (
          <div key={node.id} className="flex min-w-0 items-center gap-0.5">
            {i > 0 && <ChevronRight className="size-5 shrink-0 text-subtle" />}
            {collapsed && i === 1 && (
              <>
                <span className="px-1 text-subtle">…</span>
                <ChevronRight className="size-5 shrink-0 text-subtle" />
              </>
            )}
            <button
              onClick={() => !last && navigate(actions.folderUrl(node.id))}
              onDragOver={(e) => {
                if (last || perm === 'view' || !isInternalDrag(e)) return
                e.preventDefault()
                setOver(node.id)
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault()
                setOver(null)
                actions.move(readInternalDrag(e), node.id)
              }}
              className={cn(
                'focus-ring flex min-w-0 items-center gap-2 truncate rounded-xl px-2 py-1 transition',
                last ? 'cursor-default text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
                over === node.id && 'bg-brand-500/15 ring-2 ring-brand-500',
              )}
            >
              {node.id === rootId && (shared ? <Users className="size-5 shrink-0 text-brand-500" /> : <HardDrive className="size-5 shrink-0 text-brand-500" />)}
              <span className="truncate">{shared && node.id === rootId ? profileName : displayName(node)}</span>
            </button>
          </div>
        )
      })}
    </nav>
  )
}

/* ------------------------------ Toolbar bits ----------------------------- */

const SORTS: { key: SortKey; label: MessageKey }[] = [
  { key: 'name', label: 'Name' },
  { key: 'updatedAt', label: 'Last modified' },
  { key: 'size', label: 'Size' },
  { key: 'type', label: 'Type' },
]

function SortMenu() {
  const { sortBy, sortDir, foldersFirst, set } = useSettings()
  const DirIcon = sortDir === 'asc' ? ArrowUpAZ : ArrowDownAZ
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="sm" className="text-muted">
          <DirIcon className="size-4" />
          <span className="hidden sm:inline">{t(SORTS.find((s) => s.key === sortBy)?.label ?? 'Name')}</span>
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={menuContentClass}>
          {SORTS.map((s) => (
            <DropdownMenu.Item key={s.key} className={menuItemClass} onSelect={() => set({ sortBy: s.key })}>
              {t(s.label)}
              {sortBy === s.key && <Check className="ml-auto !text-brand-500" />}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className={menuSeparatorClass} />
          <DropdownMenu.Item className={menuItemClass} onSelect={() => set({ sortDir: 'asc' })}>
            <ArrowUpAZ /> {t('Ascending')} {sortDir === 'asc' && <Check className="ml-auto !text-brand-500" />}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={menuItemClass} onSelect={() => set({ sortDir: 'desc' })}>
            <ArrowDownAZ /> {t('Descending')} {sortDir === 'desc' && <Check className="ml-auto !text-brand-500" />}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className={menuSeparatorClass} />
          <DropdownMenu.CheckboxItem className={menuItemClass} checked={foldersFirst} onCheckedChange={(v) => set({ foldersFirst: v })}>
            {t('Folders first')} {foldersFirst && <Check className="ml-auto !text-brand-500" />}
          </DropdownMenu.CheckboxItem>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function SortHeader({ label, sortKey }: { label: string; sortKey: SortKey }) {
  const { sortBy, sortDir, set } = useSettings()
  const active = sortBy === sortKey
  return (
    <button
      className={cn('flex items-center gap-1 text-left uppercase transition hover:text-fg', active && 'text-fg')}
      onClick={() => set(active ? { sortDir: sortDir === 'asc' ? 'desc' : 'asc' } : { sortBy: sortKey, sortDir: 'asc' })}
    >
      {label}
      {active && <ChevronRight className={cn('size-3 transition', sortDir === 'asc' ? '-rotate-90' : 'rotate-90')} />}
    </button>
  )
}

function ViewToggle() {
  const view = useSettings((s) => s.view)
  const set = useSettings((s) => s.set)
  return (
    <div className="flex rounded-xl bg-surface-2 p-0.5">
      {(['grid', 'list'] as const).map((v) => (
        <Tooltip key={v} content={v === 'grid' ? t('Grid view (V)') : t('List view (V)')}>
          <button
            onClick={() => set({ view: v })}
            className={cn('grid size-8 place-items-center rounded-[10px] transition', view === v ? 'bg-surface text-brand-700 shadow-sm dark:text-brand-400' : 'text-subtle hover:text-fg')}
            aria-label={v === 'grid' ? t('Grid view (V)') : t('List view (V)')}
          >
            {v === 'grid' ? <LayoutGrid className="size-4" /> : <List className="size-4" />}
          </button>
        </Tooltip>
      ))}
    </div>
  )
}

function SelectionBar({ nodes, view }: { nodes: DriveNode[]; view: ExplorerView }) {
  const clear = useUI((s) => s.clearSelection)
  const openDialog = useUI((s) => s.openDialog)
  const ids = nodes.map((n) => n.id)
  const size = nodes.reduce((a, n) => a + (n.type === 'file' ? n.size : 0), 0)
  const single = nodes.length === 1 ? nodes[0] : null
  const trash = view === 'trash'
  const { perm } = useAccess()
  const writable = perm !== 'view'
  const slotRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)

  type BarAction = { icon: typeof X; label: string; onClick: () => void; danger?: boolean }
  const download: BarAction = { icon: Download, label: t('Download'), onClick: () => void actions.download(ids) }
  const shareFile: BarAction[] = single?.type === 'file' && !single.enc ? [{ icon: Link2, label: t('Share'), onClick: () => openDialog({ type: 'share', id: single.id }) }] : []
  const actionsList: BarAction[] = !writable
    ? [download, ...shareFile]
    : trash
      ? [
          { icon: RotateCcw, label: t('Restore'), onClick: () => actions.restore(ids) },
          { icon: Trash2, label: t('Delete forever'), danger: true, onClick: () => openDialog({ type: 'delete', ids }) },
        ]
      : [
          download,
          ...shareFile,
          ...(single?.type === 'folder' && perm === 'owner' ? [{ icon: Users, label: t('Share'), onClick: () => openDialog({ type: 'shareFolder', id: single.id }) }] : []),
          { icon: FolderInput, label: t('Move'), onClick: () => openDialog({ type: 'move', ids }) },
          ...(single ? [{ icon: Pencil, label: t('Rename'), onClick: () => openDialog({ type: 'rename', id: single.id }) }] : []),
          { icon: Star, label: t('Star'), onClick: () => actions.toggleStar(ids) },
          { icon: Trash2, label: t('Trash'), danger: true, onClick: () => actions.trash(ids) },
        ]
  const layoutKey = actionsList.map((a) => a.label).join('|') + nodes.length + size

  // Labels show only when the full bar fits the column; otherwise icons only (with tooltips).
  useLayoutEffect(() => {
    const slot = slotRef.current
    if (!slot) return
    const check = () => setCompact((measureRef.current?.offsetWidth ?? 0) > slot.clientWidth)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(slot)
    return () => observer.disconnect()
  }, [layoutKey, nodes.length > 0])

  const bar = (full: boolean) => (
    <div className="flex items-center gap-1 rounded-2xl border border-line bg-elevated/95 px-2 py-1.5 shadow-2xl shadow-stone-950/25 ring-1 ring-brand-500/20 backdrop-blur-xl">
      <Button variant="ghost" size="icon-sm" onClick={clear} aria-label={t('Clear selection')} tabIndex={full ? -1 : undefined}>
        <X className="size-4" />
      </Button>
      {full || !compact ? (
        <span className="mr-1 text-sm font-bold whitespace-nowrap text-brand-800 dark:text-brand-300">
          {t('{n} selected', { n: nodes.length })}
          {size > 0 && <span className="font-medium text-muted"> · {formatSize(size)}</span>}
        </span>
      ) : (
        <Tooltip content={t('{n} selected', { n: nodes.length })}>
          <span className="mr-1 grid h-6 min-w-6 place-items-center rounded-full bg-brand-500 px-1.5 text-xs font-bold text-accent-fg tabular-nums">{nodes.length}</span>
        </Tooltip>
      )}
      <div className="ml-auto flex items-center gap-0.5">
        {actionsList.map((a) => (
          <BarButton key={a.label} {...a} showLabel={full || !compact} />
        ))}
      </div>
    </div>
  )

  return (
    <div ref={slotRef} className="pointer-events-none absolute inset-x-4 bottom-6 z-30 flex justify-center">
      {/* Invisible copy with every label, used only to measure the width it needs. */}
      {nodes.length > 0 && (
        <div aria-hidden className="invisible absolute size-0 overflow-hidden">
          <div ref={measureRef} className="w-max">
            {bar(true)}
          </div>
        </div>
      )}
      <AnimatePresence>
        {nodes.length > 0 && (
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0.2, duration: 0.3 }}
            className="pointer-events-auto max-w-full"
          >
            {bar(false)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function BarButton({ icon: Icon, label, onClick, danger, showLabel }: { icon: typeof X; label: string; onClick: () => void; danger?: boolean; showLabel: boolean }) {
  return (
    <Tooltip content={showLabel ? null : label}>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClick}
        aria-label={label}
        className={cn('px-2.5', danger && 'text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400')}
      >
        <Icon className="size-4" />
        {showLabel && <span>{label}</span>}
      </Button>
    </Tooltip>
  )
}

/* ------------------------------- Keyboard -------------------------------- */

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || Boolean(el.closest('.cm-editor'))
}

function useExplorerKeyboard(items: DriveNode[], view: ExplorerView, folderId: string) {
  const navigate = useNavigate()
  useEffect(() => {
    const selectAll = () => useUI.getState().select(items.map((i) => i.id))
    document.addEventListener('kdrive:select-all', selectAll)

    const moveCursor = (key: string, extend: boolean) => {
      const ui = useUI.getState()
      if (!items.length) return
      const currentId = ui.cursor && items.some((i) => i.id === ui.cursor) ? ui.cursor : null
      let next: string
      if (!currentId) next = items[0].id
      else {
        const els = items.map((i) => document.querySelector<HTMLElement>(`[data-id="${i.id}"]`))
        const index = items.findIndex((i) => i.id === currentId)
        const cur = els[index]?.getBoundingClientRect()
        if (key === 'ArrowRight' || key === 'ArrowLeft' || !cur) {
          const delta = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1
          next = items[Math.max(0, Math.min(items.length - 1, index + delta))].id
        } else {
          // Vertical: closest item in the next row, by horizontal distance.
          const down = key === 'ArrowDown'
          let best = -1
          let bestScore = Infinity
          els.forEach((el, i) => {
            if (!el) return
            const r = el.getBoundingClientRect()
            const dy = down ? r.top - cur.top : cur.top - r.top
            if (dy <= 4) return
            const score = dy * 1000 + Math.abs(r.left - cur.left)
            if (score < bestScore) {
              bestScore = score
              best = i
            }
          })
          if (best < 0) return
          next = items[best].id
        }
      }
      if (extend && ui.anchor) {
        const a = items.findIndex((i) => i.id === ui.anchor)
        const b = items.findIndex((i) => i.id === next)
        ui.select(items.slice(Math.min(a, b), Math.max(a, b) + 1).map((i) => i.id))
        ui.setCursor(next)
      } else ui.select([next], next)
      document.querySelector(`[data-id="${next}"]`)?.scrollIntoView({ block: 'nearest' })
    }

    const onKey = (e: KeyboardEvent) => {
      const ui = useUI.getState()
      if (isTyping(e) || ui.previewId || ui.dialog || ui.commandOpen) return
      const mod = e.metaKey || e.ctrlKey
      const selected = [...ui.selection]
      const target = selected.length ? selected : ui.cursor ? [ui.cursor] : []
      const first = items.find((i) => i.id === target[0])
      const key = e.key

      if (mod && key.toLowerCase() === 'a') return (e.preventDefault(), selectAll())
      const writable = canEditNow()
      if (mod && key.toLowerCase() === 'x' && writable && target.length && view !== 'trash') return (e.preventDefault(), actions.cut(target))
      if (mod && key.toLowerCase() === 'v' && writable && view === 'folder') return (e.preventDefault(), actions.paste(folderId))
      if (mod) return
      const goUp = () => {
        const { access, manifest } = useDrive.getState()
        if (view !== 'folder' || folderId === access.rootId) return
        navigate(actions.folderUrl(manifest?.nodes[folderId]?.parentId ?? access.rootId))
      }
      if (key.startsWith('Arrow')) {
        e.preventDefault()
        if (e.altKey && key === 'ArrowUp') return goUp()
        return moveCursor(key, e.shiftKey)
      }
      switch (key) {
        case 'Escape':
          ui.clearSelection()
          ui.setClipboard(null)
          break
        case 'Enter':
          if (first) actions.openNode(first)
          break
        case ' ':
          if (first) {
            e.preventDefault()
            actions.openNode(first)
          }
          break
        case 'Delete':
          if (!target.length || !writable) break
          if (view === 'trash') ui.openDialog({ type: 'delete', ids: target })
          else actions.trash(target)
          break
        case 'Backspace':
          goUp()
          break
        case 'F2':
          if (first && writable && view !== 'trash') {
            e.preventDefault()
            ui.openDialog({ type: 'rename', id: first.id })
          }
          break
        case 'd':
          if (target.length && view !== 'trash') void actions.download(target)
          break
        case 's':
          if (target.length && writable && view !== 'trash') actions.toggleStar(target)
          break
        case 'm':
          if (target.length && writable && view !== 'trash') ui.openDialog({ type: 'move', ids: target })
          break
        case 'e':
          if (first?.type === 'file' && writable) ui.openPreview(first.id, true)
          break
        case 'i':
          useSettings.getState().set({ showDetails: !useSettings.getState().showDetails })
          break
        case 'v':
          useSettings.getState().set({ view: useSettings.getState().view === 'grid' ? 'list' : 'grid' })
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('kdrive:select-all', selectAll)
    }
  }, [items, view, folderId, navigate])
}
