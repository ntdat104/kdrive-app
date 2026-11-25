import { Clock, CornerDownLeft, FolderPlus, HardDrive, Keyboard, LinkIcon, Moon, Search, Settings, Star, Trash2, Upload, Users, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Dialog } from 'radix-ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import * as actions from '../actions'
import { useCurrentFolderId } from '../hooks'
import { isInTrash, isWithin, pathString, ROOT_ID, type DriveNode } from '../lib/manifest'
import { cn, formatSize } from '../lib/utils'
import { useAccess, useNodes } from '../store/drive'
import { useOpenLink } from '../platform/links'
import { resolvedTheme, useSettings } from '../store/settings'
import { useUI } from '../store/ui'
import { FileIcon } from './FileIcon'
import { pickFiles } from './layout/UploadInputs'
import { Kbd } from './ui/primitives'
import { t } from '../i18n'

type Entry = { id: string; label: string; hint?: string; icon?: LucideIcon; node?: DriveNode; run: () => void }

/** Fuzzy score: consecutive and word-start matches rank higher. */
function score(text: string, q: string) {
  const t = text.toLowerCase()
  const direct = t.indexOf(q)
  if (direct >= 0) return 1000 - direct - (t.length - q.length) * 0.1 + (direct === 0 ? 200 : 0)
  let ti = 0
  let s = 0
  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found < 0) return -1
    s += found === ti ? 5 : 1
    ti = found + 1
  }
  return s
}

export function CommandPalette() {
  const open = useUI((s) => s.commandOpen)
  const setOpen = useUI((s) => s.setCommandOpen)
  const nodes = useNodes()
  const navigate = useNavigate()
  const folderId = useCurrentFolderId()
  const { rootId, perm } = useAccess()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setActive(0)
    }
  }, [open])

  const commands: Entry[] = useMemo(
    () => [
      ...(perm !== 'view'
        ? [
            { id: 'c:upload', label: t('Upload files'), icon: Upload, hint: 'U', run: () => pickFiles(folderId) },
            { id: 'c:folder', label: t('New folder'), icon: FolderPlus, hint: '⇧N', run: () => useUI.getState().openDialog({ type: 'newFolder', parentId: folderId }) },
          ]
        : []),
      { id: 'c:drive', label: t('Go to My Drive'), icon: HardDrive, run: () => navigate('/drive') },
      { id: 'c:recent', label: t('Go to Recent'), icon: Clock, run: () => navigate('/drive/recent') },
      { id: 'c:starred', label: t('Go to Starred'), icon: Star, run: () => navigate('/drive/starred') },
      ...(perm !== 'view' ? [{ id: 'c:trash', label: t('Go to Trash'), icon: Trash2, run: () => navigate('/drive/trash') }] : []),
      ...(perm === 'owner'
        ? [{ id: 'c:share', label: t('Share the whole drive…'), icon: Users, run: () => useUI.getState().openDialog({ type: 'shareFolder', id: ROOT_ID }) }]
        : []),
      { id: 'c:link', label: t('Open a Kdrive link…'), icon: LinkIcon, run: () => useOpenLink.getState().setOpen(true) },
      {
        id: 'c:theme',
        label: t('Toggle dark mode'),
        icon: Moon,
        run: () => useSettings.getState().set({ theme: resolvedTheme(useSettings.getState().theme) === 'dark' ? 'light' : 'dark' }),
      },
      { id: 'c:settings', label: t('Open settings'), icon: Settings, hint: ',', run: () => useUI.getState().openDialog({ type: 'settings' }) },
      { id: 'c:keys', label: t('Keyboard shortcuts'), icon: Keyboard, hint: '?', run: () => useUI.getState().openDialog({ type: 'shortcuts' }) },
    ],
    [folderId, navigate, perm],
  )

  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    const cmd = query ? commands.map((c) => ({ c, s: score(c.label, query) })).filter((x) => x.s > 0).map((x) => x.c) : commands.slice(0, 6)
    let files: Entry[] = []
    if (query) {
      files = Object.values(nodes)
        .filter((n) => n.parentId !== null)
        .map((n) => ({ n, s: score(n.name, query) }))
        .filter((x) => x.s > 0 && x.n.id !== rootId && isWithin(nodes, x.n.id, rootId) && !isInTrash(nodes, x.n.id))
        .sort((a, b) => b.s - a.s)
        .slice(0, 12)
        .map(({ n }) => ({
          id: n.id,
          label: n.name,
          node: n,
          hint: n.type === 'file' ? formatSize(n.size) : undefined,
          run: () => actions.openNode(n),
        }))
    }
    return { files, cmd, all: [...files, ...cmd] }
  }, [q, nodes, commands, rootId])

  const run = (entry: Entry | undefined) => {
    if (!entry) return
    setOpen(false)
    setTimeout(entry.run, 0)
  }

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  let index = -1
  const renderEntry = (e: Entry) => {
    index++
    const i = index
    return (
      <button
        key={e.id}
        data-index={i}
        onMouseMove={() => setActive(i)}
        onClick={() => run(e)}
        className={cn('flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm', active === i ? 'bg-accent-soft text-brand-800 dark:text-brand-300' : 'text-fg')}
      >
        {e.node ? <FileIcon node={e.node} className="size-8 rounded-lg" /> : e.icon && <e.icon className="size-[18px] text-muted" />}
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{e.label}</div>
          {e.node?.parentId && <div className="truncate text-xs text-subtle">{pathString(nodes, e.node.parentId, rootId)}</div>}
        </div>
        {e.hint && <span className="text-xs text-subtle">{e.hint}</span>}
        {active === i && <CornerDownLeft className="size-4 text-brand-500" />}
      </button>
    )
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div className="fixed inset-0 z-50 bg-stone-950/40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            </Dialog.Overlay>
            <Dialog.Content asChild aria-describedby={undefined}>
              <motion.div
                initial={{ opacity: 0, scale: 0.97, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="fixed top-[12vh] left-1/2 z-50 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-3xl border border-line bg-elevated shadow-2xl"
              >
                <Dialog.Title className="sr-only">{t('Command palette')}</Dialog.Title>
                <div className="flex items-center gap-3 border-b border-line px-5">
                  <Search className="size-5 text-brand-500" />
                  <input
                    autoFocus
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value)
                      setActive(0)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        setActive((a) => Math.min(a + 1, results.all.length - 1))
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        setActive((a) => Math.max(a - 1, 0))
                      } else if (e.key === 'Enter') run(results.all[active])
                    }}
                    placeholder={t('Jump to a file, folder or action…')}
                    className="h-16 flex-1 bg-transparent text-base outline-none placeholder:text-subtle"
                  />
                  <Kbd>Esc</Kbd>
                </div>
                <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
                  {results.files.length > 0 && <div className="px-3 pt-2 pb-1 text-[11px] font-bold tracking-wider text-subtle uppercase">{t('Files & folders')}</div>}
                  {results.files.map(renderEntry)}
                  {results.cmd.length > 0 && <div className="px-3 pt-2 pb-1 text-[11px] font-bold tracking-wider text-subtle uppercase">{t('Actions')}</div>}
                  {results.cmd.map(renderEntry)}
                  {!results.all.length && <div className="py-10 text-center text-sm text-subtle">{t('No matches')}</div>}
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
