import {
  AppWindow,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  File as FileGeneric,
  Folder,
  Play,
  Presentation,
  VideoOff,
  ScrollText,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { kindOf, type FileKind } from '../lib/filetypes'
import { folderToneStyle } from '../lib/folderColors'
import type { DriveNode } from '../lib/manifest'
import { isBlankThumb } from '../lib/thumbnails'
import { cn, extOf } from '../lib/utils'

const ICONS: Record<FileKind, { icon: LucideIcon; tone: string }> = {
  folder: { icon: Folder, tone: 'text-brand-500 bg-brand-500/12' },
  image: { icon: FileImage, tone: 'text-pink-500 bg-pink-500/12' },
  video: { icon: FileVideo, tone: 'text-red-500 bg-red-500/12' },
  audio: { icon: FileAudio, tone: 'text-amber-500 bg-amber-500/12' },
  pdf: { icon: FileText, tone: 'text-rose-600 bg-rose-600/12' },
  text: { icon: ScrollText, tone: 'text-stone-500 bg-stone-500/12' },
  markdown: { icon: FileText, tone: 'text-sky-500 bg-sky-500/12' },
  code: { icon: FileCode, tone: 'text-emerald-500 bg-emerald-500/12' },
  archive: { icon: FileArchive, tone: 'text-violet-500 bg-violet-500/12' },
  document: { icon: FileText, tone: 'text-blue-500 bg-blue-500/12' },
  spreadsheet: { icon: FileSpreadsheet, tone: 'text-green-600 bg-green-600/12' },
  presentation: { icon: Presentation, tone: 'text-orange-600 bg-orange-600/12' },
  font: { icon: FileType, tone: 'text-indigo-500 bg-indigo-500/12' },
  executable: { icon: AppWindow, tone: 'text-slate-500 bg-slate-500/12' },
  other: { icon: FileGeneric, tone: 'text-stone-500 bg-stone-500/12' },
}

export function nodeKind(node: Pick<DriveNode, 'type' | 'name' | 'mime'>): FileKind {
  return node.type === 'folder' ? 'folder' : kindOf(node.name, node.mime)
}

export function FileIcon({ node, className, iconClassName }: { node: Pick<DriveNode, 'type' | 'name' | 'mime' | 'color'>; className?: string; iconClassName?: string }) {
  const { icon: Icon, tone } = ICONS[nodeKind(node)]
  return (
    <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', tone, className)} style={node.type === 'folder' ? folderToneStyle(node.color) : undefined}>
      <Icon className={cn('size-[55%]', iconClassName)} strokeWidth={1.9} />
    </span>
  )
}

/**
 * The node's thumbnail, or undefined when it has none. Video thumbnails that turn out to be a
 * black frame (codec the uploader's browser couldn't decode) are dropped so a default poster shows.
 */
export function useThumb(node: Pick<DriveNode, 'type' | 'name' | 'mime' | 'thumb'>) {
  const thumb = node.thumb
  const check = Boolean(thumb) && nodeKind(node) === 'video'
  const [verdict, setVerdict] = useState<{ url: string; blank: boolean } | null>(null)
  useEffect(() => {
    if (!check || !thumb) return
    let alive = true
    void isBlankThumb(thumb).then((blank) => alive && setVerdict({ url: thumb, blank }))
    return () => {
      alive = false
    }
  }, [check, thumb])
  if (!thumb || !check) return thumb
  return verdict?.url === thumb && !verdict.blank ? thumb : undefined
}

/** Default artwork for videos without a usable thumbnail. */
export function VideoPoster({ className, iconClassName, unplayable }: { className?: string; iconClassName?: string; unplayable?: boolean }) {
  return (
    <div className={cn('relative grid h-full w-full place-items-center overflow-hidden bg-gradient-to-br from-red-500/35 via-stone-900 to-stone-950', className)}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgb(255_255_255/0.08),transparent_55%)]" />
      <span className={cn('relative grid size-14 place-items-center rounded-full bg-white/15 ring-1 ring-white/25 backdrop-blur', iconClassName)}>
        {unplayable ? <VideoOff className="size-[45%] text-white/80" strokeWidth={1.6} /> : <Play className="ml-[8%] size-[45%] fill-white text-white" strokeWidth={1.5} />}
      </span>
    </div>
  )
}

/** Large tile used in grid view: thumbnail when available, otherwise a big icon with the extension. */
export function FileTile({ node }: { node: DriveNode }) {
  const kind = nodeKind(node)
  const { icon: Icon, tone } = ICONS[kind]
  const thumb = useThumb(node)
  if (thumb || kind === 'video') {
    return (
      <div className="relative h-full w-full overflow-hidden">
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]" draggable={false} />
        ) : (
          <VideoPoster className="transition duration-300 group-hover:scale-[1.04]" />
        )}
        {kind === 'video' && (
          <span className="absolute right-2 bottom-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur">
            {node.meta?.dur ? formatDur(node.meta.dur) : 'VIDEO'}
          </span>
        )}
      </div>
    )
  }
  const ext = extOf(node.name)
  return (
    <div className="grid h-full w-full place-items-center">
      <div
        className={cn('relative grid size-16 place-items-center rounded-2xl transition duration-300 group-hover:scale-105', tone)}
        style={kind === 'folder' ? folderToneStyle(node.color) : undefined}
      >
        <Icon className="size-8" strokeWidth={1.6} fill={kind === 'folder' ? 'currentColor' : 'none'} fillOpacity={kind === 'folder' ? 0.18 : 0} />
        {kind !== 'folder' && ext && ext.length <= 5 && (
          <span className="absolute -bottom-2 rounded-md bg-surface px-1.5 py-px text-[9px] font-extrabold tracking-wider text-muted uppercase shadow-sm ring-1 ring-line">
            {ext}
          </span>
        )}
      </div>
    </div>
  )
}

function formatDur(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}
