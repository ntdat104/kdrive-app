import { ArrowDownToLine, ArrowUpFromLine, ChevronDown, CircleCheck, CircleX, LoaderCircle, PencilLine, RotateCcw, Trash2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { cn, formatDuration, formatSize, formatSpeed } from '../lib/utils'
import { useTransfers, type Transfer } from '../store/transfers'
import { Button, ProgressBar, Tooltip } from './ui/primitives'
import { t } from '../i18n'

export function TransferPanel() {
  const transfers = useTransfers((s) => s.transfers)
  const open = useTransfers((s) => s.panelOpen)
  const setOpen = useTransfers((s) => s.setPanelOpen)
  const clear = useTransfers((s) => s.clearFinished)
  const [, tick] = useState(0)

  const active = transfers.filter((t) => t.status === 'running' || t.status === 'queued')
  useEffect(() => {
    if (!active.length) return
    const id = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [active.length])

  if (!transfers.length) return null
  const total = active.reduce((a, t) => a + t.total, 0)
  const loaded = active.reduce((a, t) => a + t.loaded, 0)
  const errors = transfers.filter((t) => t.status === 'error').length
  const title = active.length
    ? active.some((x) => x.kind === 'upload')
      ? t('Uploading {n} items', { n: active.length })
      : t('Transferring {n} items', { n: active.length })
    : errors
      ? t('{n} transfers failed', { n: errors })
      : t('All transfers complete')

  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 w-[min(400px,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-line bg-elevated/95 shadow-2xl shadow-stone-950/20 backdrop-blur-xl"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className={cn(
            'grid size-9 place-items-center rounded-xl',
            active.length ? 'bg-accent-soft text-brand-500' : errors ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500',
          )}
        >
          {active.length ? <LoaderCircle className="size-5 animate-spin" /> : errors ? <CircleX className="size-5" /> : <CircleCheck className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{title}</div>
          {active.length > 0 && (
            <div className="text-xs text-muted tabular-nums">
              {t('{loaded} of {total}', { loaded: formatSize(loaded), total: formatSize(total) })}
            </div>
          )}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => setOpen(!open)} aria-label={open ? t('Collapse') : t('Expand')}>
          <ChevronDown className={cn('size-4 transition-transform', !open && 'rotate-180')} />
        </Button>
        {!active.length && (
          <Button variant="ghost" size="icon-sm" onClick={clear} aria-label={t('Close')}>
            <X className="size-4" />
          </Button>
        )}
      </div>
      {/* Inset from the edges: a full-bleed bar gets clipped by the rounded corners. */}
      {active.length > 0 && !open && <ProgressBar value={total ? loaded / total : 0} className="mx-4 mb-3 h-1 w-auto" />}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="max-h-80 overflow-y-auto border-t border-line p-2">
              {[...transfers].reverse().map((tr) => (
                <TransferRow key={tr.id} item={tr} />
              ))}
            </div>
            {transfers.length > active.length && (
              <div className="border-t border-line px-4 py-2 text-right">
                <button onClick={clear} className="text-xs font-semibold text-muted hover:text-fg">
                  {t('Clear finished')}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

const KIND_ICON = { upload: ArrowUpFromLine, download: ArrowDownToLine, delete: Trash2, update: PencilLine }

function TransferRow({ item }: { item: Transfer }) {
  const cancel = useTransfers((s) => s.cancel)
  const pct = item.total ? item.loaded / item.total : 0
  const elapsed = ((item.finishedAt ?? Date.now()) - item.startedAt) / 1000
  const speed = item.kind === 'delete' ? 0 : item.loaded / Math.max(elapsed, 0.5)
  const eta = speed > 0 ? (item.total - item.loaded) / speed : Infinity
  const Icon = KIND_ICON[item.kind]
  const running = item.status === 'running' || item.status === 'queued'

  let status: React.ReactNode
  if (item.status === 'queued') status = t('Waiting…')
  else if (item.status === 'running') {
    status =
      item.kind === 'delete'
        ? t('{done} / {total} chunks', { done: item.loaded, total: item.total })
        : t('{pct}% · {speed} · {eta} left', { pct: Math.round(pct * 100), speed: formatSpeed(speed), eta: formatDuration(eta) })
  } else if (item.status === 'done') status = item.kind === 'delete' ? t('Deleted') : t('Done · {size} in {time}', { size: formatSize(item.total), time: formatDuration(elapsed) })
  else if (item.status === 'canceled') status = t('Canceled')
  else status = <span className="text-red-500">{item.error ?? t('Failed')}</span>

  return (
    <div className="group flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-surface-2">
      <div className={cn('grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted', item.status === 'done' && 'text-emerald-500', item.status === 'error' && 'text-red-500')}>
        {item.status === 'done' ? <CircleCheck className="size-4" /> : <Icon className="size-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold">{item.name}</div>
        <div className="line-clamp-2 text-[11px] break-words text-muted tabular-nums" title={item.status === 'error' ? item.error : undefined}>
          {status}
        </div>
        {running && item.phase && <div className="truncate text-[11px] font-semibold text-brand-700 tabular-nums dark:text-brand-400">{item.phase}</div>}
        {running && <ProgressBar value={pct} className="mt-1.5 h-1" />}
      </div>
      {running && item.controller && (
        <Tooltip content={t('Cancel')}>
          <button
            onClick={() => cancel(item.id)}
            className="grid size-7 shrink-0 place-items-center rounded-lg text-subtle opacity-0 group-hover:opacity-100 hover:bg-line hover:text-fg focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
            aria-label={t('Cancel')}
          >
            <X className="size-4" />
          </button>
        </Tooltip>
      )}
      {(item.status === 'error' || item.status === 'canceled') && item.retry && (
        <Tooltip content={t('Retry')}>
          <button onClick={item.retry} className="grid size-7 shrink-0 place-items-center rounded-lg text-subtle hover:bg-line hover:text-fg" aria-label={t('Retry')}>
            <RotateCcw className="size-4" />
          </button>
        </Tooltip>
      )}
    </div>
  )
}
