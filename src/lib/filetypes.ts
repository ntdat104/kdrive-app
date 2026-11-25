import type { MessageKey } from '../i18n'
import { extOf } from './utils'

export type FileKind =
  | 'folder'
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'text'
  | 'code'
  | 'markdown'
  | 'archive'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'font'
  | 'executable'
  | 'other'

const KIND_BY_EXT: Record<string, FileKind> = {}
const register = (kind: FileKind, exts: string) => exts.split(' ').forEach((e) => (KIND_BY_EXT[e] = kind))

register('image', 'png jpg jpeg gif webp avif bmp svg ico heic heif tif tiff jfif')
register('video', 'mp4 webm mov mkv m4v ogv avi wmv flv 3gp ts')
register('audio', 'mp3 wav ogg oga flac m4a aac opus weba wma mid midi')
register('pdf', 'pdf')
register('markdown', 'md markdown mdx')
register('text', 'txt log csv tsv ini cfg conf env srt vtt rtf nfo')
register(
  'code',
  'js mjs cjs jsx ts tsx json jsonc json5 html htm css scss sass less xml yml yaml toml py rb go rs java kt kts swift c h cpp cc hpp cs php sh bash zsh fish ps1 bat sql graphql gql vue svelte astro lua dart r scala pl ex exs erl hs clj elm zig nim dockerfile makefile gradle properties tf proto',
)
register('archive', 'zip rar 7z tar gz tgz bz2 xz zst iso dmg cab lz')
register('document', 'doc docx odt pages epub')
register('spreadsheet', 'xls xlsx ods numbers')
register('presentation', 'ppt pptx odp key')
register('font', 'ttf otf woff woff2')
register('executable', 'exe msi apk app deb rpm appimage jar bin')

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  avif: 'image/avif', bmp: 'image/bmp', svg: 'image/svg+xml', ico: 'image/x-icon', tif: 'image/tiff', tiff: 'image/tiff',
  heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska', ogv: 'video/ogg',
  avi: 'video/x-msvideo', '3gp': 'video/3gpp',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac', m4a: 'audio/mp4',
  aac: 'audio/aac', opus: 'audio/opus', weba: 'audio/webm',
  pdf: 'application/pdf', json: 'application/json', zip: 'application/zip', txt: 'text/plain', md: 'text/markdown',
  html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', csv: 'text/csv',
  xml: 'application/xml', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf',
}

export function mimeFromName(name: string) {
  return MIME_BY_EXT[extOf(name)] ?? 'application/octet-stream'
}

export function kindOf(name: string, mime?: string): FileKind {
  const special = name.toLowerCase()
  if (special === 'dockerfile' || special === 'makefile') return 'code'
  if (special.startsWith('.') && !special.slice(1).includes('.')) return 'text'
  const byExt = KIND_BY_EXT[extOf(name)]
  if (byExt) return byExt
  if (mime?.startsWith('image/')) return 'image'
  if (mime?.startsWith('video/')) return 'video'
  if (mime?.startsWith('audio/')) return 'audio'
  if (mime?.startsWith('text/')) return 'text'
  return 'other'
}

/** Files we can preview in the browser, with a soft upper size bound for loading into memory. */
export function previewMode(name: string, mime?: string, size = 0): 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'markdown' | 'font' | null {
  const kind = kindOf(name, mime)
  const ext = extOf(name)
  switch (kind) {
    case 'image':
      return ['heic', 'heif', 'tif', 'tiff'].includes(ext) ? null : 'image'
    case 'video':
      // Browsers can't decode these containers; offer download instead.
      return ['avi', 'wmv', 'flv'].includes(ext) ? null : 'video'
    case 'audio':
      return 'audio'
    case 'pdf':
      return 'pdf'
    case 'markdown':
      return size < 8 * 1024 * 1024 ? 'markdown' : null
    case 'text':
    case 'code':
      return size < 8 * 1024 * 1024 ? 'text' : null
    case 'font':
      return 'font'
    default:
      return size > 0 && size < 512 * 1024 && !ext ? 'text' : null
  }
}

export function isEditable(name: string, size = 0) {
  const kind = kindOf(name)
  return (kind === 'text' || kind === 'code' || kind === 'markdown') && size < 5 * 1024 * 1024
}

/** Untranslated labels; render with `t(KIND_LABEL[kind])`. */
export const KIND_LABEL: Record<FileKind, MessageKey> = {
  folder: 'Folder',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  pdf: 'PDF',
  text: 'Text',
  code: 'Code',
  markdown: 'Markdown',
  archive: 'Archive',
  document: 'Document',
  spreadsheet: 'Spreadsheet',
  presentation: 'Presentation',
  font: 'Font',
  executable: 'Program',
  other: 'File',
}

/** Coarse buckets used for filters and the storage breakdown. */
export type KindGroup = 'images' | 'videos' | 'audio' | 'documents' | 'archives' | 'other'

export function groupOf(kind: FileKind): KindGroup {
  switch (kind) {
    case 'image':
      return 'images'
    case 'video':
      return 'videos'
    case 'audio':
      return 'audio'
    case 'pdf':
    case 'text':
    case 'code':
    case 'markdown':
    case 'document':
    case 'spreadsheet':
    case 'presentation':
      return 'documents'
    case 'archive':
      return 'archives'
    default:
      return 'other'
  }
}

export const GROUP_META: Record<KindGroup, { label: MessageKey; color: string }> = {
  images: { label: 'Images', color: '#f0b90b' },
  videos: { label: 'Videos', color: 'oklch(0.637 0.237 25.331)' },
  audio: { label: 'Audio', color: 'oklch(0.705 0.213 47.604)' },
  documents: { label: 'Documents', color: 'oklch(0.623 0.214 259.815)' },
  archives: { label: 'Archives', color: 'oklch(0.627 0.265 303.9)' },
  other: { label: 'Other', color: 'oklch(0.65 0.014 60)' },
}
