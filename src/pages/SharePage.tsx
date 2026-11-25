import { Clock, Download, Eye, LinkIcon, ShieldCheck } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { FileIcon } from '../components/FileIcon'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { Wordmark } from '../components/Logo'
import { Button, ProgressBar } from '../components/ui/primitives'
import { fetchAttachment } from '../lib/cdn'
import { previewMode } from '../lib/filetypes'
import { decodeShare, shareExpiry } from '../lib/share'
import { downloadBlob, errorMessage, formatRelative, formatSize, isAbortError } from '../lib/utils'
import '../store/settings'
import { t } from '../i18n'

export default function SharePage() {
  const { hash } = useLocation()
  const payload = useMemo(() => decodeShare(hash), [hash])
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (payload) document.title = `${payload.n} · Kdrive`
  }, [payload])

  if (!payload) {
    return (
      <Shell>
        <div className="text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-surface-2 text-subtle">
            <LinkIcon className="size-8" />
          </div>
          <h1 className="mt-4 text-xl font-bold">{t('Invalid share link')}</h1>
          <p className="mt-1 text-sm text-muted">{t('This link is incomplete or corrupted.')}</p>
        </div>
      </Shell>
    )
  }

  const expires = shareExpiry(payload)
  const expired = expires < Date.now()
  const mode = previewMode(payload.n, payload.t, payload.s)
  const canPreview = (mode === 'image' || mode === 'video' || mode === 'audio' || mode === 'pdf') && payload.s < 200 * 1024 * 1024

  const fetchAll = async (onBytes: (d: number) => void, write?: (b: Uint8Array) => Promise<void>) => {
    const parts: BlobPart[] = []
    for (const url of payload.u) {
      const bytes = await fetchAttachment(url, { onBytes })
      if (write) await write(bytes)
      else parts.push(bytes as BlobPart)
    }
    return new Blob(parts, { type: payload.t })
  }

  const download = async () => {
    setError(null)
    let writable: FileSystemWritableFileStream | null = null
    const picker = (window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker
    if (picker) {
      try {
        writable = await (await picker({ suggestedName: payload.n })).createWritable()
      } catch (err) {
        if (isAbortError(err)) return
      }
    }
    let loaded = 0
    setProgress(0)
    try {
      const blob = await fetchAll(
        (d) => setProgress((loaded += d) / Math.max(payload.s, 1)),
        writable ? (b) => writable!.write(b as FileSystemWriteChunkType) : undefined,
      )
      if (writable) await writable.close()
      else downloadBlob(blob, payload.n)
      setProgress(1)
    } catch (err) {
      await writable?.abort().catch(() => {})
      setError(errorMessage(err))
      setProgress(null)
    }
  }

  const showPreview = async () => {
    setError(null)
    let loaded = 0
    setProgress(0)
    try {
      const blob = await fetchAll((d) => setProgress((loaded += d) / Math.max(payload.s, 1)))
      setPreview(URL.createObjectURL(blob))
      setProgress(null)
    } catch (err) {
      setError(errorMessage(err))
      setProgress(null)
    }
  }

  const node = { type: 'file' as const, name: payload.n, mime: payload.t }
  return (
    <Shell wide={Boolean(preview)}>
      {preview && (
        <div className="mb-6 overflow-hidden rounded-2xl bg-stone-950">
          {mode === 'image' && <img src={preview} alt={payload.n} className="mx-auto max-h-[60vh]" />}
          {mode === 'video' && <video src={preview} controls autoPlay className="mx-auto max-h-[60vh] w-full" />}
          {mode === 'audio' && <audio src={preview} controls autoPlay className="w-full p-4" />}
          {mode === 'pdf' && <iframe src={preview} title={payload.n} className="h-[60vh] w-full bg-white" />}
        </div>
      )}
      <div className="flex items-center gap-4">
        <FileIcon node={node} className="size-16 rounded-2xl" />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold" title={payload.n}>
            {payload.n}
          </h1>
          <p className="text-sm text-muted">
            {formatSize(payload.s)} · {t('shared via Kdrive')}
          </p>
        </div>
      </div>
      <div className={`mt-5 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${expired ? 'bg-red-500/10 text-red-600' : 'bg-surface-2 text-muted'}`}>
        <Clock className="size-4" />
        {expired ? t('This link has expired — ask the owner for a new one.') : t('Link expires {when}', { when: formatRelative(expires) })}
      </div>
      {progress !== null && progress < 1 && (
        <div className="mt-5">
          <ProgressBar value={progress} />
          <p className="mt-1.5 text-xs text-muted tabular-nums">{Math.round(progress * 100)}%</p>
        </div>
      )}
      {error && <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <Button variant="primary" size="lg" onClick={download} disabled={expired || (progress !== null && progress < 1)} className={canPreview && !preview ? '' : 'sm:col-span-2'}>
          <Download className="size-5" /> {progress === 1 ? t('Downloaded ✓') : t('Download')}
        </Button>
        {canPreview && !preview && (
          <Button variant="outline" size="lg" onClick={showPreview} disabled={expired || (progress !== null && progress < 1)}>
            <Eye className="size-5" /> {t('Preview')}
          </Button>
        )}
      </div>
      <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-subtle">
        <ShieldCheck className="size-4 text-emerald-500" /> {t('Downloaded straight from Discord’s CDN')}
      </p>
    </Shell>
  )
}

export function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="relative grid min-h-full grid-cols-[minmax(0,1fr)] place-items-center overflow-hidden bg-bg p-4">
      <div className="pointer-events-none absolute -top-40 left-1/2 size-[600px] -translate-x-1/2 rounded-full bg-brand-500/20 blur-[130px]" />
      <div className="relative w-full" style={{ maxWidth: wide ? 900 : 460 }}>
        <div className="mb-6 flex items-center justify-center gap-2">
          <Link to="/">
            <Wordmark />
          </Link>
          <LanguageSwitcher />
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-line bg-surface/90 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          {children}
        </motion.div>
      </div>
    </div>
  )
}
