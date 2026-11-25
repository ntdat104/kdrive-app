import { Check, Lock, MoreVertical, Star, Upload } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { memo, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { move, upload } from '../../actions'
import { INTERNAL_DRAG, isFileDrag, isInternalDrag, itemsFromDataTransfer, readInternalDrag, setDragPreview } from '../../lib/dnd'
import { KIND_LABEL } from '../../lib/filetypes'
import { displayName, pathFrom, type DriveNode } from '../../lib/manifest'
import { cn, errorMessage, formatRelative, formatSize, splitName, validateName } from '../../lib/utils'
import { canEdit, useDrive, useNodes } from '../../store/drive'
import type { Transfer } from '../../store/transfers'
import { useUI } from '../../store/ui'
import { FileIcon, FileTile, nodeKind, useThumb } from '../FileIcon'
import { menuContentClass, ProgressBar } from '../ui/primitives'
import { DropdownEntries, itemMenu } from './menu'
import { t } from '../../i18n'

export interface ItemProps {
  node: DriveNode
  selected: boolean
  focused: boolean
  cut: boolean
  showLocation?: boolean
  onClick: (e: React.MouseEvent, node: DriveNode) => void
  onOpen: (node: DriveNode) => void
}

/** Shared drag-and-drop behavior: items are draggable, folders accept drops. */
function useItemDnd(node: DriveNode) {
  const [over, setOver] = useState(false)
  const writable = canEdit()
  const isFolder = node.type === 'folder' && !node.trashedAt && writable
  return {
    over,
    props: {
      draggable: !node.trashedAt && writable,
      onDragStart: (e: React.DragEvent) => {
        const ui = useUI.getState()
        let ids = [...ui.selection]
        if (!ui.selection.has(node.id)) {
          ids = [node.id]
          ui.select(ids, node.id)
        }
        e.dataTransfer.setData(INTERNAL_DRAG, JSON.stringify(ids))
        e.dataTransfer.effectAllowed = 'move'
        setDragPreview(e, ids.length > 1 ? `${ids.length} items` : node.name)
        ui.setDragIds(ids)
      },
      onDragEnd: () => useUI.getState().setDragIds(null),
      ...(isFolder && {
        onDragOver: (e: React.DragEvent) => {
          const dragging = useUI.getState().dragIds
          if (isInternalDrag(e) && dragging?.includes(node.id)) return
          if (!isInternalDrag(e) && !isFileDrag(e)) return
          e.preventDefault()
          e.stopPropagation()
          e.dataTransfer.dropEffect = isInternalDrag(e) ? 'move' : 'copy'
          setOver(true)
        },
        onDragLeave: () => setOver(false),
        onDrop: async (e: React.DragEvent) => {
          e.preventDefault()
          e.stopPropagation()
          setOver(false)
          if (isInternalDrag(e)) move(readInternalDrag(e), node.id)
          else upload(await itemsFromDataTransfer(e.dataTransfer), node.id)
        },
      }),
    },
  }
}

function MoreButton({ node, className }: { node: DriveNode; className?: string }) {
  return (
    <DropdownMenu.Root
      onOpenChange={(open) => {
        const ui = useUI.getState()
        if (open && !ui.selection.has(node.id)) ui.select([node.id], node.id)
      }}
    >
      <DropdownMenu.Trigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          className={cn('focus-ring grid size-8 place-items-center rounded-lg text-subtle transition hover:bg-line hover:text-fg', className)}
          aria-label={t('More actions')}
        >
          <MoreVertical className="size-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className={menuContentClass} onCloseAutoFocus={(e) => e.preventDefault()}>
          <MoreEntries node={node} />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function MoreEntries({ node }: { node: DriveNode }) {
  const selection = useUI((s) => s.selection)
  const ids = selection.has(node.id) ? [...selection] : [node.id]
  return <DropdownEntries entries={itemMenu(ids, { reveal: true })} />
}

export function InlineRename({ node, className }: { node: DriveNode; className?: string }) {
  const [value, setValue] = useState(node.name)
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  const mountedAt = useRef(Date.now())

  useEffect(() => {
    // Wait a frame so menus closing don't steal focus back.
    const timer = setTimeout(() => {
      const el = ref.current
      if (!el) return
      el.focus()
      const { base } = splitName(node.name)
      el.setSelectionRange(0, node.type === 'folder' ? node.name.length : base.length)
    }, 30)
    return () => clearTimeout(timer)
  }, [node])

  const finish = (commit: boolean) => {
    if (done.current) return
    done.current = true
    useUI.getState().openDialog(null)
    const name = value.trim()
    if (!commit || name === node.name) return
    const invalid = validateName(name)
    if (invalid) return void toast.error(invalid)
    try {
      useDrive.getState().rename(node.id, name)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        // Closing menus/dialogs may briefly restore focus elsewhere right after mount.
        if (Date.now() - mountedAt.current < 500) return void setTimeout(() => ref.current?.focus(), 0)
        if (document.hasFocus()) finish(true)
      }}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(true)
        if (e.key === 'Escape') finish(false)
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className={cn('w-full rounded-md border border-brand-500 bg-surface px-1.5 py-0.5 text-sm font-semibold ring-4 ring-brand-500/20 outline-none', className)}
    />
  )
}

function useRenaming(id: string) {
  return useUI((s) => s.dialog?.type === 'rename' && s.dialog.id === id)
}

function Location({ node }: { node: DriveNode }) {
  const nodes = useNodes()
  const rootId = useDrive((s) => s.access.rootId)
  const path = pathFrom(nodes, node.parentId ?? '', rootId)
  return <span className="truncate">{path.map(displayName).join(' / ') || '—'}</span>
}

/* --------------------------------- Grid --------------------------------- */

export const GridItem = memo(function GridItem({ node, selected, focused, cut, showLocation, onClick, onOpen }: ItemProps) {
  const dnd = useItemDnd(node)
  const renaming = useRenaming(node.id)
  const kind = nodeKind(node)
  return (
    <div
      data-id={node.id}
      {...dnd.props}
      onClick={(e) => onClick(e, node)}
      onDoubleClick={() => onOpen(node)}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border bg-surface transition-all duration-150 select-none mt-[4px]',
        selected ? 'border-brand-500 shadow-lg ring-4 shadow-brand-500/10 ring-brand-500/15' : 'border-line hover:border-line-strong hover:shadow-md',
        focused && !selected && 'ring-2 ring-brand-500/40',
        dnd.over && 'scale-[1.03] border-brand-500 bg-accent-soft ring-4 ring-brand-500/30',
        cut && 'opacity-45',
      )}
    >
      <div className={cn('relative aspect-[4/3] overflow-hidden', node.thumb ? 'bg-surface-2' : kind === 'folder' ? 'bg-brand-500/[0.04]' : 'bg-surface-2/60')}>
        <FileTile node={node} />
        <div
          className={cn(
            'absolute top-2 left-2 grid size-6 place-items-center rounded-lg border-2 transition',
            selected ? 'border-brand-500 bg-brand-500 text-accent-fg' : 'border-white/80 bg-black/10 text-transparent opacity-0 backdrop-blur group-hover:opacity-100',
          )}
          onClick={(e) => {
            e.stopPropagation()
            useUI.getState().toggle(node.id)
          }}
        >
          <Check className="size-3.5" strokeWidth={3} />
        </div>
        <div className="absolute top-2 right-2 flex gap-1">
          {node.enc && (
            <span className="grid size-6 place-items-center rounded-lg bg-black/40 text-white backdrop-blur" title={t('Encrypted')}>
              <Lock className="size-3" />
            </span>
          )}
          {node.starred && (
            <span className="grid size-6 place-items-center rounded-lg bg-black/40 text-amber-300 backdrop-blur">
              <Star className="size-3.5" fill="currentColor" />
            </span>
          )}
        </div>
      </div>
      <div className="relative flex items-center gap-2 px-3 py-2.5">
        <FileIcon node={node} className="size-7 rounded-lg" />
        <div className="min-w-0 flex-1">
          {renaming ? (
            <InlineRename node={node} />
          ) : (
            <div className="truncate text-[13px] font-semibold" title={node.name}>
              {node.name}
            </div>
          )}
          <div className="truncate text-[11px] text-subtle">
            {showLocation ? <Location node={node} /> : node.type === 'folder' ? formatRelative(node.updatedAt) : `${formatSize(node.size)} · ${formatRelative(node.updatedAt)}`}
          </div>
        </div>
        {/* Floats over the text on hover so the name and details get the full card width. */}
        <MoreButton
          node={node}
          className="absolute top-1/2 right-1.5 -translate-y-1/2 bg-surface opacity-0 shadow-sm ring-1 ring-line group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
        />
      </div>
    </div>
  )
})

/* --------------------------------- List --------------------------------- */

export const ListRow = memo(function ListRow({ node, selected, focused, cut, showLocation, onClick, onOpen }: ItemProps) {
  const dnd = useItemDnd(node)
  const renaming = useRenaming(node.id)
  const kind = nodeKind(node)
  const thumb = useThumb(node)
  return (
    <div
      data-id={node.id}
      {...dnd.props}
      onClick={(e) => onClick(e, node)}
      onDoubleClick={() => onOpen(node)}
      className={cn(
        'group grid h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border px-3 transition select-none md:grid-cols-[auto_minmax(0,1fr)_150px_100px_120px_auto]',
        selected ? 'border-brand-500/50 bg-accent-soft' : 'border-transparent hover:bg-surface-2',
        focused && !selected && 'ring-2 ring-brand-500/40',
        dnd.over && 'border-brand-500 bg-accent-soft ring-4 ring-brand-500/25',
        cut && 'opacity-45',
      )}
    >
      <div className="relative">
        {thumb ? (
          <img src={thumb} alt="" className="size-9 rounded-xl object-cover" draggable={false} />
        ) : (
          <FileIcon node={node} />
        )}
        {selected && (
          <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-brand-500 text-accent-fg ring-2 ring-surface">
            <Check className="size-2.5" strokeWidth={3.5} />
          </span>
        )}
      </div>
      <div className="min-w-0">
        {renaming ? (
          <InlineRename node={node} />
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold" title={node.name}>
              {node.name}
            </span>
            {node.starred && <Star className="size-3.5 shrink-0 text-amber-400" fill="currentColor" />}
            {node.enc && <Lock className="size-3 shrink-0 text-subtle" />}
          </div>
        )}
        <div className="truncate text-xs text-subtle md:hidden">
          {node.type === 'file' ? `${formatSize(node.size)} · ` : ''}
          {formatRelative(node.updatedAt)}
        </div>
        {showLocation && (
          <div className="hidden truncate text-xs text-subtle md:block">
            <Location node={node} />
          </div>
        )}
      </div>
      <div className="hidden truncate text-[13px] text-muted md:block">{node.trashedAt ? t('Trashed {time}', { time: formatRelative(node.trashedAt) }) : formatRelative(node.updatedAt)}</div>
      <div className="hidden text-[13px] text-muted tabular-nums md:block">{node.type === 'file' ? formatSize(node.size) : '—'}</div>
      <div className="hidden truncate text-[13px] text-muted md:block">{t(KIND_LABEL[kind])}</div>
      <MoreButton node={node} className="opacity-60 group-hover:opacity-100 md:opacity-0" />
    </div>
  )
})

/* ------------------------------ Upload ghost ----------------------------- */

export function UploadGhost({ transfer, view }: { transfer: Transfer; view: 'grid' | 'list' }) {
  const pct = transfer.total ? transfer.loaded / transfer.total : 0
  const node = { type: 'file' as const, name: transfer.name }
  if (view === 'list') {
    return (
      <div className="grid h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-dashed border-brand-500/40 bg-accent-soft/50 px-3">
        <FileIcon node={node} className="animate-pulse" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{transfer.name}</div>
          <ProgressBar value={pct} className="mt-1.5 max-w-sm" />
        </div>
        <span className="text-xs font-bold text-brand-700 tabular-nums dark:text-brand-400">{Math.round(pct * 100)}%</span>
      </div>
    )
  }
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-dashed border-brand-500/50 bg-accent-soft/40">
      {/*
        Centred with absolute positioning: iOS Safari doesn't stretch a grid row to a height that
        comes from aspect-ratio, so `grid place-items-center` left the ring stuck to the top edge.
        The arc starts at 12 o'clock via an SVG transform (CSS `rotate` is missing on older iOS Safari).
      */}
      <div className="relative aspect-[4/3]">
        <div className="absolute inset-0 m-auto flex size-20 items-center justify-center">
          <svg className="absolute inset-0 size-full" viewBox="0 0 36 36" aria-hidden>
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" className="text-line" />
            {/* Nothing to draw at 0%: an empty arc still leaves a stray mark. */}
            {pct > 0 && (
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                transform="rotate(-90 18 18)"
                pathLength={100}
                strokeDasharray={100}
                strokeDashoffset={100 * (1 - pct)}
                className="text-brand-500 transition-[stroke-dashoffset] duration-300"
              />
            )}
          </svg>
          <div className="relative flex flex-col items-center leading-none">
            <Upload className="size-4 text-brand-500" />
            <span className="mt-1 text-xs font-bold tabular-nums">{Math.round(pct * 100)}%</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <FileIcon node={node} className="size-7 rounded-lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">{transfer.name}</div>
          <div className="truncate text-[11px] text-subtle">{transfer.status === 'queued' ? t('Waiting…') : t('Uploading · {size}', { size: formatSize(transfer.total) })}</div>
        </div>
      </div>
    </div>
  )
}
