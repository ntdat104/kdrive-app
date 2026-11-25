import { ChevronLeft, ChevronRight, Download, Info, Link2, LoaderCircle, MoreVertical, Pencil, Star, Trash2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Dialog, DropdownMenu } from 'radix-ui'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as actions from '../../actions'
import { loadBlob } from '../../lib/blob-cache'
import { isEditable, previewMode } from '../../lib/filetypes'
import type { DriveSession } from '../../lib/drive'
import { childrenOf, previewNodeOf, type DriveNode } from '../../lib/manifest'
import { createImagePreview, wantsPreview } from '../../lib/previews'
import { cn, errorMessage, formatSize } from '../../lib/utils'
import { canEdit, useCanEdit, useDrive, useNodes } from '../../store/drive'
import { useSettings } from '../../store/settings'
import { useUI } from '../../store/ui'
import { sortNodes } from '../explorer/useItems'
import { FileIcon, useThumb, VideoPoster } from '../FileIcon'
import { Button, menuContentClass, menuItemClass, Spinner, Tooltip } from '../ui/primitives'
import { AudioViewer, FontViewer, ImageViewer, PdfViewer, VideoViewer } from './Viewers'
import { t } from '../../i18n'

const TextViewer = lazy(() => import('./TextViewer'))

const LARGE = 512 * 1024 * 1024

export function PreviewModal() {
  const previewId = useUI((s) => s.previewId)
  const nodes = useNodes()
  const node = previewId ? nodes[previewId] : null
  const close = () => useUI.getState().openPreview(null)

  return (
    <Dialog.Root open={Boolean(node)} onOpenChange={(o) => !o && close()}>
      <AnimatePresence>
        {node && (
          <Dialog.Portal forceMount>
            <Dialog.Content asChild aria-describedby={undefined} onEscapeKeyDown={(e) => useUI.getState().editing && e.preventDefault()}>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-50 flex flex-col bg-stone-950/95 text-white backdrop-blur-xl outline-none"
              >
                <Dialog.Title className="sr-only">{node.name}</Dialog.Title>
                <Preview node={node} onClose={close} />
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}

function Preview({ node, onClose }: { node: DriveNode; onClose: () => void }) {
  const nodes = useNodes()
  const writable = useCanEdit()
  const editing = useUI((s) => s.editing) && writable
  const sortBy = useSettings((s) => s.sortBy)
  const sortDir = useSettings((s) => s.sortDir)
  const mode = previewMode(node.name, node.mime, node.size)

  // Siblings that can be previewed, for ← → navigation.
  const siblings = useMemo(() => {
    if (!node.parentId) return [node]
    return sortNodes(childrenOf(nodes, node.parentId), sortBy, sortDir, true).filter((n) => n.type === 'file' && previewMode(n.name, n.mime, n.size))
  }, [nodes, node, sortBy, sortDir])
  const index = siblings.findIndex((n) => n.id === node.id)
  const go = useCallback(
    (delta: number) => {
      const next = siblings[index + delta]
      if (next) useUI.getState().openPreview(next.id)
    },
    [siblings, index],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useUI.getState().editing) return
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  const headerActions: { label: string; icon: React.ReactNode; onClick: () => void; primary?: boolean }[] = [
    ...(writable && isEditable(node.name, node.size) && !editing
      ? [{ label: t('Edit (E)'), icon: <Pencil className="size-[18px]" />, onClick: () => useUI.getState().setEditing(true) }]
      : []),
    { label: t('Download'), icon: <Download className="size-[18px]" />, onClick: () => void actions.download([node.id]), primary: true },
    ...(!node.enc
      ? [{ label: t('Share link'), icon: <Link2 className="size-[18px]" />, onClick: () => useUI.getState().openDialog({ type: 'share', id: node.id }) }]
      : []),
    ...(writable
      ? [
          {
            label: node.starred ? t('Remove star') : t('Star'),
            icon: <Star className={cn('size-[18px]', node.starred && 'text-amber-400')} fill={node.starred ? 'currentColor' : 'none'} />,
            onClick: () => actions.toggleStar([node.id]),
          },
        ]
      : []),
    {
      label: t('Details'),
      icon: <Info className="size-[18px]" />,
      onClick: () => {
        onClose()
        useUI.getState().select([node.id], node.id)
        useSettings.getState().set({ showDetails: true })
      },
    },
    ...(writable
      ? [
          {
            label: t('Move to trash'),
            icon: <Trash2 className="size-[18px]" />,
            onClick: () => {
              onClose()
              actions.trash([node.id])
            },
          },
        ]
      : []),
  ]

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 px-2 sm:gap-3 sm:px-5">
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white/70 hover:bg-white/10 hover:text-white" aria-label={t('Close preview')}>
          <X className="size-5" />
        </Button>
        <FileIcon node={node} className="hidden size-8 rounded-lg min-[400px]:grid" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{node.name}</div>
          <div className="truncate text-xs text-white/50">
            {formatSize(node.size)}
            {siblings.length > 1 && index >= 0 && ` · ${t('{index} of {total}', { index: index + 1, total: siblings.length })}`}
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {headerActions.map((a) => (
            <HeaderButton key={a.label} label={a.label} onClick={a.onClick} className={a.primary ? undefined : 'hidden sm:grid'}>
              {a.icon}
            </HeaderButton>
          ))}
          {/* Phones: keep Download visible, fold the rest into a menu so the file name stays readable. */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button aria-label={t('More actions')} className="grid size-10 place-items-center rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white sm:hidden">
                <MoreVertical className="size-[18px]" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={6} className={cn(menuContentClass, 'z-[60]')}>
                {headerActions
                  .filter((a) => !a.primary)
                  .map((a) => (
                    <DropdownMenu.Item key={a.label} className={menuItemClass} onSelect={a.onClick}>
                      {a.icon} {a.label}
                    </DropdownMenu.Item>
                  ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <Body key={node.id + (node.chunks?.[0]?.m ?? '')} node={node} mode={mode} editing={editing} />
        {!editing && index > 0 && <NavArrow side="left" onClick={() => go(-1)} />}
        {!editing && index >= 0 && index < siblings.length - 1 && <NavArrow side="right" onClick={() => go(1)} />}
      </div>
    </>
  )
}

function HeaderButton({ label, onClick, children, className }: { label: string; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <Tooltip content={label}>
      <button onClick={onClick} aria-label={label} className={cn('grid size-10 place-items-center rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white', className)}>
        {children}
      </button>
    </Tooltip>
  )
}

function NavArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <button
      onClick={onClick}
      className={cn(
        'absolute top-1/2 z-10 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition hover:scale-105 hover:bg-white/20',
        side === 'left' ? 'left-4' : 'right-4',
      )}
      aria-label={side === 'left' ? t('Previous') : t('Next')}
    >
      <Icon className="size-6" />
    </button>
  )
}

function Body({ node, mode, editing }: { node: DriveNode; mode: ReturnType<typeof previewMode>; editing: boolean }) {
  const session = useDrive((s) => s.session)
  const thumb = useThumb(node)
  const download = () => void actions.download([node.id])
  const [state, setState] = useState<{ url: string; blob: Blob } | null>(null)
  const [loaded, setLoaded] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const progressive = mode === 'image' || mode === 'video'
  const previewNode = progressive ? previewNodeOf(node) : null
  // Big files with a quick preview don't auto-load the original; others ask first.
  const [confirmed, setConfirmed] = useState(node.size < LARGE)
  const [low, setLow] = useState<string | null>(mode === 'image' && !previewNode ? (node.thumb ?? null) : null)
  // Re-run loads only when the content changes, not on metadata edits (star, preview backfill…).
  const contentKey = `${node.id}:${node.chunks?.[0]?.m ?? ''}`
  const nodeRef = useRef(node)
  nodeRef.current = node

  useEffect(() => {
    if (!session || !previewNode) return
    let alive = true
    loadBlob(session, previewNode).then(
      (entry) => alive && setLow(entry.url),
      () => {}, // fall back to waiting for the original
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, previewNode?.chunks?.[0]?.m])

  useEffect(() => {
    if (!session || !mode || !confirmed) return
    let alive = true
    loadBlob(session, nodeRef.current, (l) => alive && setLoaded(l)).then(
      (entry) => {
        if (!alive) return
        setState({ url: entry.url, blob: entry.blob })
        void backfillImagePreview(session, nodeRef.current, entry.blob)
      },
      (err) => alive && setError(errorMessage(err)),
    )
    return () => {
      alive = false
    }
  }, [session, contentKey, mode, confirmed])

  if (progressive && (low || state) && !error) {
    const url = state?.url ?? low!
    return (
      <div className="relative h-full">
        {mode === 'image' ? (
          <ImageViewer url={url} name={node.name} width={node.meta?.w} height={node.meta?.h} />
        ) : (
          <VideoViewer url={url} poster={thumb} onDownload={download} />
        )}
        <QualityBadge
          hd={Boolean(state)}
          progress={node.size ? loaded / node.size : 0}
          waiting={!confirmed}
          size={node.size}
          onLoadOriginal={() => setConfirmed(true)}
        />
      </div>
    )
  }

  if (!mode && !editing) {
    return (
      <Center>
        <FileIcon node={node} className="size-24 rounded-3xl" />
        <p className="mt-5 text-lg font-bold">{t('No preview available')}</p>
        <p className="mt-1 text-sm text-white/50">{t('This file type can’t be shown in the browser.')}</p>
        <Button variant="primary" className="mt-6" onClick={() => void actions.download([node.id])}>
          <Download className="size-4" /> {t('Download {size}', { size: formatSize(node.size) })}
        </Button>
      </Center>
    )
  }
  if (!confirmed) {
    return (
      <Center>
        <FileIcon node={node} className="size-20 rounded-3xl" />
        <p className="mt-5 text-lg font-bold">{t('Large file · {size}', { size: formatSize(node.size) })}</p>
        <p className="mt-1 max-w-sm text-center text-sm text-white/50">{t('Previewing loads the whole file into memory. Downloading may be better.')}</p>
        <div className="mt-6 flex gap-2">
          <Button variant="primary" onClick={() => setConfirmed(true)}>
            {t('Preview anyway')}
          </Button>
          <Button className="border-white/10 bg-white/10 text-white hover:bg-white/20" onClick={() => void actions.download([node.id])}>
            {t('Download')}
          </Button>
        </div>
      </Center>
    )
  }
  if (error) {
    return (
      <Center>
        <p className="text-lg font-bold">{t('Couldn’t load preview')}</p>
        <p className="mt-2 max-w-md text-center text-sm text-white/60">{error}</p>
      </Center>
    )
  }
  if (!state) {
    const pct = node.size ? loaded / node.size : 0
    return (
      <Center>
        {thumb ? (
          <img src={thumb} alt="" className="max-h-[50vh] max-w-[80vw] rounded-2xl opacity-60" />
        ) : mode === 'video' ? (
          <VideoPoster className="aspect-video h-auto w-[min(80vw,640px)] rounded-2xl opacity-80" iconClassName="size-16" />
        ) : (
          <Spinner className="size-10" />
        )}
        <div className="mt-6 w-64">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-300 to-brand-500 transition-[width]" style={{ width: `${pct * 100}%` }} />
          </div>
          <p className="mt-2 text-center text-xs text-white/50 tabular-nums">
            {t('Fetching from Discord · {loaded} / {total}', { loaded: formatSize(loaded), total: formatSize(node.size) })}
          </p>
        </div>
      </Center>
    )
  }

  if (editing || mode === 'text' || mode === 'markdown') {
    return (
      <Suspense fallback={<Center><Spinner className="size-8" /></Center>}>
        <TextViewer node={node} blob={state.blob} markdown={mode === 'markdown'} editing={editing} />
      </Suspense>
    )
  }
  switch (mode) {
    case 'image':
      return <ImageViewer url={state.url} name={node.name} />
    case 'video':
      return <VideoViewer url={state.url} poster={thumb} onDownload={download} />
    case 'audio':
      return <AudioViewer url={state.url} node={node} />
    case 'pdf':
      return <PdfViewer url={state.url} name={node.name} />
    case 'font':
      return <FontViewer url={state.url} name={node.name} />
    default:
      return null
  }
}

/** Shows whether the viewer is on the quick preview or the original. */
function QualityBadge({ hd, progress, waiting, size, onLoadOriginal }: { hd: boolean; progress: number; waiting: boolean; size: number; onLoadOriginal: () => void }) {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    if (!hd) return setHidden(false)
    const t = setTimeout(() => setHidden(true), 2200)
    return () => clearTimeout(t)
  }, [hd])
  return (
    <AnimatePresence>
      {!hidden && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2"
        >
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-black/60 py-1.5 pr-3 pl-1.5 text-xs font-semibold text-white shadow-xl backdrop-blur-xl">
            {hd ? (
              <>
                <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-extrabold tracking-wider">HD</span>
                {t('Original quality')}
              </>
            ) : waiting ? (
              <>
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-extrabold tracking-wider">SD</span>
                {t('Quick preview')}
                <button onClick={onLoadOriginal} className="ml-1 rounded-full bg-brand-500 px-2.5 py-0.5 text-[11px] font-bold text-accent-fg hover:bg-brand-400">
                  {t('Load original · {size}', { size: formatSize(size) })}
                </button>
              </>
            ) : (
              <>
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-extrabold tracking-wider">SD</span>
                <LoaderCircle className="size-3.5 animate-spin text-brand-400" />
                {t('Loading original · {pct}%', { pct: Math.round(progress * 100) })}
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Older images get a quick preview the first time someone opens them. */
async function backfillImagePreview(session: DriveSession, node: DriveNode, blob: Blob) {
  if (node.preview || !useSettings.getState().quickPreviews || !canEdit()) return
  if (wantsPreview(node.name, node.size, node.mime) !== 'image') return
  try {
    const rendition = await createImagePreview(blob)
    if (!rendition) return
    const m = await session.uploadChunk(rendition.blob, {})
    const current = useDrive.getState().manifest?.nodes[node.id]
    if (!current || current.preview) return void session.deleteMessage(m).catch(() => {})
    useDrive.getState().patchNode(node.id, {
      preview: {
        chunks: [{ m, s: rendition.blob.size }],
        size: rendition.blob.size,
        mime: rendition.blob.type,
        enc: session.encrypted || undefined,
        w: rendition.w,
        h: rendition.h,
      },
    })
  } catch {
    /* best effort */
  }
}

export function Center({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex h-full flex-col items-center justify-center p-6', className)}>{children}</div>
}
