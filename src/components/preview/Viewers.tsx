import { Download, Maximize, Minus, Music, Plus, RotateCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { DriveNode } from '../../lib/manifest'
import { cn } from '../../lib/utils'
import { VideoPoster } from '../FileIcon'
import { Button } from '../ui/primitives'
import { t } from '../../i18n'

export function ImageViewer({ url, name, width, height }: { url: string; name: string; width?: number; height?: number }) {
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const reset = () => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }
  const zoomBy = (factor: number) => setZoom((z) => Math.min(12, Math.max(0.2, z * factor)))

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') zoomBy(1.25)
      if (e.key === '-') zoomBy(0.8)
      if (e.key === '0') reset()
      if (e.key === 'r') setRotation((r) => r + 90)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      ref={ref}
      className={cn('relative h-full overflow-hidden', zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in')}
      onDoubleClick={() => (zoom === 1 ? setZoom(2.5) : reset())}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
        ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!drag.current || zoom <= 1) return
        setOffset({ x: drag.current.ox + e.clientX - drag.current.x, y: drag.current.oy + e.clientY - drag.current.y })
      }}
      onPointerUp={() => (drag.current = null)}
    >
      <div className="flex h-full items-center justify-center p-4 sm:p-10">
        {/* Intrinsic size from metadata keeps the layout stable when a low-res preview is swapped for the original. */}
        <img
          src={url}
          alt={name}
          width={width}
          height={height}
          draggable={false}
          className={cn('max-h-full max-w-full rounded-lg object-contain shadow-2xl transition-transform duration-150 select-none', width && 'h-auto')}
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotation}deg)` }}
        />
      </div>
      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-white/10 bg-black/50 p-1 backdrop-blur-xl" onPointerDown={(e) => e.stopPropagation()}>
        <ToolButton onClick={() => zoomBy(0.8)} label={t('Zoom out')}>
          <Minus className="size-4" />
        </ToolButton>
        <button onClick={reset} className="w-14 text-center text-xs font-bold text-white/80 tabular-nums hover:text-white">
          {Math.round(zoom * 100)}%
        </button>
        <ToolButton onClick={() => zoomBy(1.25)} label={t('Zoom in')}>
          <Plus className="size-4" />
        </ToolButton>
        <div className="mx-1 h-5 w-px bg-white/15" />
        <ToolButton onClick={() => setRotation((r) => r + 90)} label={t('Rotate')}>
          <RotateCw className="size-4" />
        </ToolButton>
        <ToolButton onClick={reset} label={t('Fit')}>
          <Maximize className="size-4" />
        </ToolButton>
      </div>
    </div>
  )
}

function ToolButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} className="grid size-9 place-items-center rounded-xl text-white/80 transition hover:bg-white/10 hover:text-white">
      {children}
    </button>
  )
}

type VideoStatus = 'loading' | 'ready' | 'audio-only' | 'error'

export function VideoViewer({ url, poster, onDownload }: { url: string; poster?: string; onDownload: () => void }) {
  const ref = useRef<HTMLVideoElement>(null)
  const playback = useRef({ time: 0, playing: true, url })
  // Until a real frame is decoded the default poster shows, instead of an empty black player.
  const [status, setStatus] = useState<VideoStatus>('loading')
  useEffect(() => setStatus((s) => (s === 'ready' ? s : 'loading')), [url])

  // When the source switches (quick preview → original), continue where playback was.
  const onLoadedMetadata = () => {
    const video = ref.current
    if (!video || playback.current.url === url) return
    playback.current.url = url
    video.currentTime = playback.current.time
    if (playback.current.playing) void video.play().catch(() => {})
  }

  const fallback = status !== 'ready'
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-4 sm:p-10">
      {fallback && (
        <div className="relative aspect-video w-full max-w-3xl overflow-hidden rounded-xl shadow-2xl">
          {poster ? <img src={poster} alt="" className="h-full w-full object-cover" /> : <VideoPoster iconClassName="size-20" unplayable={status === 'error'} />}
          {status !== 'loading' && (
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-3 bg-gradient-to-t from-black/85 to-transparent px-5 pt-10 pb-4">
              <p className="min-w-0 flex-1 text-sm font-medium text-white/85">
                {status === 'error' ? t('This video can’t be played in the browser.') : t('The video picture can’t be shown in this browser — playing the sound only.')}
              </p>
              <Button size="sm" className="border-white/15 bg-white/15 text-white hover:bg-white/25" onClick={onDownload}>
                <Download className="size-4" /> {t('Download')}
              </Button>
            </div>
          )}
        </div>
      )}
      <video
        ref={ref}
        src={url}
        poster={poster}
        controls
        autoPlay
        playsInline
        onLoadedMetadata={(e) => {
          onLoadedMetadata()
          // Audio decodes but the picture doesn't (unsupported video codec): keep the controls, show the poster.
          if (!e.currentTarget.videoWidth) setStatus('audio-only')
        }}
        onLoadedData={(e) => e.currentTarget.videoWidth && setStatus('ready')}
        onError={() => setStatus('error')}
        onTimeUpdate={(e) => {
          if (playback.current.url === url) playback.current.time = e.currentTarget.currentTime
        }}
        onPlay={() => playback.current.url === url && (playback.current.playing = true)}
        onPause={(e) => playback.current.url === url && !e.currentTarget.ended && (playback.current.playing = false)}
        className={cn(
          'rounded-xl',
          status === 'ready' && 'max-h-full max-w-full bg-black shadow-2xl',
          status === 'audio-only' && 'h-12 w-full max-w-3xl',
          (status === 'loading' || status === 'error') && 'hidden',
        )}
      />
    </div>
  )
}

export function AudioViewer({ url, node }: { url: string; node: DriveNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.03] p-8 text-center shadow-2xl">
        <div className="relative mx-auto mb-6 grid size-48 place-items-center overflow-hidden rounded-3xl bg-gradient-to-br from-brand-300 via-brand-500 to-brand-700 shadow-xl shadow-brand-500/30">
          {node.thumb ? <img src={node.thumb} alt="" className="h-full w-full object-cover" /> : <Music className="size-20 text-accent-fg/85" strokeWidth={1.4} />}
        </div>
        <div className="truncate text-lg font-bold">{node.name}</div>
        <audio src={url} controls autoPlay className="mt-6 w-full" />
      </div>
    </div>
  )
}

export function PdfViewer({ url, name }: { url: string; name: string }) {
  return (
    <div className="h-full px-2 pb-2 sm:px-6 sm:pb-6">
      <iframe src={url} title={name} className="h-full w-full rounded-xl bg-white" />
    </div>
  )
}

export function FontViewer({ url, name }: { url: string; name: string }) {
  const [family, setFamily] = useState<string | null>(null)
  useEffect(() => {
    const fam = `preview-${Math.random().toString(36).slice(2)}`
    const face = new FontFace(fam, `url(${url})`)
    face.load().then(() => {
      document.fonts.add(face)
      setFamily(fam)
    })
    return () => {
      document.fonts.delete(face)
    }
  }, [url])
  return (
    <div className="h-full overflow-y-auto p-6 sm:p-12">
      <div className="mx-auto max-w-4xl rounded-3xl bg-white p-8 text-stone-900 shadow-2xl sm:p-12" style={{ fontFamily: family ?? undefined }}>
        <div className="mb-6 font-sans text-xs font-bold tracking-widest text-stone-400 uppercase">{name}</div>
        <div className="text-6xl leading-tight">Aa Bb Cc</div>
        <div className="mt-6 text-3xl">The quick brown fox jumps over the lazy dog</div>
        <div className="mt-4 text-xl">ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 !@#$%&*</div>
        <div className="mt-4 text-base">Tiếng Việt: Chữ đẹp như mơ, bay bổng giữa trời xanh.</div>
      </div>
    </div>
  )
}
