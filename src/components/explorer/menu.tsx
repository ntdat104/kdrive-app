import {
  Check,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Download,
  Eye,
  FilePlus2,
  FolderInput,
  FolderOpen,
  FolderPlus,
  FolderUp,
  Info,
  Link2,
  Palette,
  Pencil,
  RotateCcw,
  Scissors,
  SquareCheckBig,
  Star,
  StarOff,
  Trash2,
  Upload,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { ContextMenu, DropdownMenu } from 'radix-ui'
import * as actions from '../../actions'
import { isEditable, previewMode } from '../../lib/filetypes'
import { wantsPreview } from '../../lib/previews'
import { ROOT_ID, type DriveNode } from '../../lib/manifest'
import { FOLDER_COLORS } from '../../lib/folderColors'
import { cn } from '../../lib/utils'
import { useDrive } from '../../store/drive'
import { useSettings } from '../../store/settings'
import { useUI } from '../../store/ui'
import { pickFiles, pickFolder } from '../layout/UploadInputs'
import { menuContentClass, menuDangerClass, menuItemClass, menuSeparatorClass, menuShortcutClass } from '../ui/primitives'
import { t } from '../../i18n'

export type MenuEntry =
  | { label: string; icon: LucideIcon; onSelect: () => void; shortcut?: string; danger?: boolean; disabled?: boolean }
  | { folderColor: { ids: string[]; value: string | undefined } }
  | 'separator'

/** Actions for the given selection; also used by the "more" button and the selection bar. */
export function itemMenu(ids: string[], opts: { reveal?: boolean } = {}): MenuEntry[] {
  const nodes = useDrive.getState().manifest?.nodes ?? {}
  const items = ids.map((id) => nodes[id]).filter(Boolean) as DriveNode[]
  if (!items.length) return []
  const ui = useUI.getState()
  const single = items.length === 1 ? items[0] : null
  const inTrash = items.some((n) => n.trashedAt)
  const { perm } = useDrive.getState().access
  const writable = perm !== 'view'

  if (inTrash) {
    if (!writable) return []
    return [
      { label: t('Restore'), icon: RotateCcw, onSelect: () => actions.restore(ids) },
      'separator',
      { label: t('Delete forever'), icon: Trash2, danger: true, onSelect: () => ui.openDialog({ type: 'delete', ids }) },
    ]
  }

  const allStarred = items.every((n) => n.starred)
  const entries: MenuEntry[] = []
  if (single?.type === 'folder') entries.push({ label: t('Open'), icon: FolderOpen, shortcut: '↵', onSelect: () => actions.openNode(single) })
  if (single?.type === 'file' && previewMode(single.name, single.mime, single.size)) {
    entries.push({ label: t('Preview'), icon: Eye, shortcut: 'Space', onSelect: () => actions.openNode(single) })
  }
  if (writable && single?.type === 'file' && isEditable(single.name, single.size)) {
    entries.push({ label: t('Edit'), icon: Pencil, shortcut: 'E', onSelect: () => ui.openPreview(single.id, true) })
  }
  entries.push({ label: items.length > 1 || single?.type === 'folder' ? t('Download as ZIP') : t('Download'), icon: Download, shortcut: 'D', onSelect: () => void actions.download(ids) })
  if (single?.type === 'file') {
    entries.push({ label: t('Share link'), icon: Link2, disabled: Boolean(single.enc), onSelect: () => ui.openDialog({ type: 'share', id: single.id }) })
  }
  if (single?.type === 'folder' && perm === 'owner') {
    entries.push({ label: t('Share folder…'), icon: Users, onSelect: () => ui.openDialog({ type: 'shareFolder', id: single.id }) })
  }
  const details: MenuEntry = {
    label: t('Details'),
    icon: Info,
    shortcut: 'I',
    onSelect: () => {
      ui.select(ids)
      useSettings.getState().set({ showDetails: true })
    },
  }
  if (!writable) {
    entries.push('separator')
    if (single && opts.reveal) entries.push({ label: t('Show in folder'), icon: FolderOpen, onSelect: () => actions.revealNode(single) })
    entries.push(details)
    return entries
  }
  entries.push('separator')
  if (single) entries.push({ label: t('Rename'), icon: Pencil, shortcut: 'F2', onSelect: () => ui.openDialog({ type: 'rename', id: single.id }) })
  entries.push({ label: t('Move to…'), icon: FolderInput, shortcut: 'M', onSelect: () => ui.openDialog({ type: 'move', ids }) })
  entries.push({ label: t('Cut'), icon: Scissors, shortcut: 'Ctrl X', onSelect: () => actions.cut(ids) })
  if (single?.type === 'file') entries.push({ label: t('Make a copy'), icon: Copy, onSelect: () => void actions.duplicate(single.id) })
  if (single?.type === 'file' && !single.preview && wantsPreview(single.name, single.size, single.mime)) {
    entries.push({ label: t('Create quick preview'), icon: Zap, onSelect: () => void actions.createQuickPreview(single.id) })
  }
  const folders = items.filter((n) => n.type === 'folder')
  if (folders.length === items.length) {
    const value = folders.every((n) => n.color === folders[0].color) ? folders[0].color : 'mixed'
    entries.push({ folderColor: { ids, value } })
  }
  entries.push({ label: allStarred ? t('Remove star') : t('Add star'), icon: allStarred ? StarOff : Star, shortcut: 'S', onSelect: () => actions.toggleStar(ids) })
  if (single && opts.reveal) {
    entries.push({ label: t('Show in folder'), icon: FolderOpen, onSelect: () => actions.revealNode(single) })
  }
  entries.push(details)
  entries.push('separator')
  entries.push({ label: t('Move to trash'), icon: Trash2, shortcut: 'Del', danger: true, onSelect: () => actions.trash(ids) })
  return entries
}

/** Menu for right-clicking empty space in a folder. */
export function backgroundMenu(folderId: string, canWrite: boolean): MenuEntry[] {
  const ui = useUI.getState()
  const { perm, rootId } = useDrive.getState().access
  const share: MenuEntry[] =
    perm === 'owner'
      ? [
          'separator',
          {
            label: folderId === ROOT_ID ? t('Share the whole drive…') : t('Share folder…'),
            icon: Users,
            onSelect: () => ui.openDialog({ type: 'shareFolder', id: folderId }),
          },
        ]
      : []
  if (!canWrite) return [{ label: t('Select all'), icon: SquareCheckBig, shortcut: 'Ctrl A', onSelect: () => document.dispatchEvent(new CustomEvent('kdrive:select-all')) }]
  return [
    { label: t('New folder'), icon: FolderPlus, shortcut: '⇧N', onSelect: () => ui.openDialog({ type: 'newFolder', parentId: folderId }) },
    { label: t('New text file'), icon: FilePlus2, onSelect: () => ui.openDialog({ type: 'newFile', parentId: folderId }) },
    'separator',
    { label: t('Upload files'), icon: Upload, shortcut: 'U', onSelect: () => pickFiles(folderId) },
    { label: t('Upload folder'), icon: FolderUp, onSelect: () => pickFolder(folderId) },
    'separator',
    { label: t('Paste'), icon: ClipboardPaste, shortcut: 'Ctrl V', disabled: !ui.clipboard, onSelect: () => actions.paste(folderId) },
    { label: t('Select all'), icon: SquareCheckBig, shortcut: 'Ctrl A', onSelect: () => document.dispatchEvent(new CustomEvent('kdrive:select-all')) },
    ...share,
    ...(folderId !== rootId
      ? ([
          'separator',
          {
            label: t('Folder details'),
            icon: Info,
            onSelect: () => {
              ui.clearSelection()
              useSettings.getState().set({ showDetails: true })
            },
          },
        ] as MenuEntry[])
      : []),
  ]
}

export function ContextMenuEntries({ entries }: { entries: MenuEntry[] }) {
  return (
    <>
      {entries.map((e, i) =>
        e === 'separator' ? (
          <ContextMenu.Separator key={i} className={menuSeparatorClass} />
        ) : 'folderColor' in e ? (
          <ContextMenu.Sub key="folderColor">
            <ContextMenu.SubTrigger className={cn(menuItemClass, 'data-[state=open]:bg-accent-soft')}>
              <Palette /> {t('Folder color')}
              <ChevronRight className="ml-auto" />
            </ContextMenu.SubTrigger>
            <ContextMenu.Portal>
              <ContextMenu.SubContent sideOffset={6} className={cn(menuContentClass, 'min-w-0')}>
                <FolderColorItems {...e.folderColor} Item={ContextMenu.Item} />
              </ContextMenu.SubContent>
            </ContextMenu.Portal>
          </ContextMenu.Sub>
        ) : (
          <ContextMenu.Item key={e.label} disabled={e.disabled} onSelect={e.onSelect} className={cn(menuItemClass, e.danger && menuDangerClass)}>
            <e.icon /> {e.label}
            {e.shortcut && <span className={menuShortcutClass}>{e.shortcut}</span>}
          </ContextMenu.Item>
        ),
      )}
    </>
  )
}

export function DropdownEntries({ entries }: { entries: MenuEntry[] }) {
  return (
    <>
      {entries.map((e, i) =>
        e === 'separator' ? (
          <DropdownMenu.Separator key={i} className={menuSeparatorClass} />
        ) : 'folderColor' in e ? (
          <DropdownMenu.Sub key="folderColor">
            <DropdownMenu.SubTrigger className={cn(menuItemClass, 'data-[state=open]:bg-accent-soft')}>
              <Palette /> {t('Folder color')}
              <ChevronRight className="ml-auto" />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent sideOffset={6} collisionPadding={8} className={cn(menuContentClass, 'min-w-0')}>
                <FolderColorItems {...e.folderColor} Item={DropdownMenu.Item} />
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
        ) : (
          <DropdownMenu.Item key={e.label} disabled={e.disabled} onSelect={e.onSelect} className={cn(menuItemClass, e.danger && menuDangerClass)}>
            <e.icon /> {e.label}
            {e.shortcut && <span className={menuShortcutClass}>{e.shortcut}</span>}
          </DropdownMenu.Item>
        ),
      )}
    </>
  )
}

/** Swatch grid inside the "Folder color" submenu. A folder without a color shows the current accent as checked. */
function FolderColorItems({ ids, value, Item }: { ids: string[]; value: string | undefined; Item: typeof ContextMenu.Item | typeof DropdownMenu.Item }) {
  // Mixed selections show no check; uncolored folders follow the app accent.
  const current = value === 'mixed' ? null : (value ?? useSettings.getState().accent)
  return (
    <div className="grid grid-cols-4 gap-2 p-1.5">
      {FOLDER_COLORS.map((c) => (
        <Item
          key={c.value}
          aria-label={t(c.label)}
          title={t(c.label)}
          className="grid size-8 cursor-default place-items-center rounded-full ring-offset-2 ring-offset-elevated outline-none data-[highlighted]:ring-2 data-[highlighted]:ring-line-strong"
          style={{ backgroundColor: c.swatch, color: c.on }}
          onSelect={() => actions.setFolderColor(ids, c.value)}
        >
          {current === c.value && <Check className="size-4" strokeWidth={3} />}
        </Item>
      ))}
    </div>
  )
}
