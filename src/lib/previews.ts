import { kindOf } from './filetypes'
import { extOf } from './utils'

/**
 * Low-quality renditions shown instantly when opening big images and videos,
 * while the original downloads in the background.
 */

export interface PreviewRendition {
  blob: Blob
  w?: number
  h?: number
}

const IMAGE_MAX = 1600
const IMAGE_MIN_BYTES = 400 * 1024
const VIDEO_MIN_BYTES = 12 * 1024 * 1024
const VIDEO_MAX_WIDTH = 854 // 480p for 16:9
/** Not worth storing a preview that isn't much smaller than the original. */
const MAX_RATIO = 0.6

export function wantsPreview(name: string, size: number, mime?: string): 'image' | 'video' | null {
  const kind = kindOf(name, mime)
  const ext = extOf(name)
  if (kind === 'image' && size >= IMAGE_MIN_BYTES && !['gif', 'svg', 'ico', 'heic', 'heif', 'tif', 'tiff'].includes(ext)) return 'image'
  if (kind === 'video' && size >= VIDEO_MIN_BYTES && typeof VideoEncoder !== 'undefined') return 'video'
  return null
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
}

export async function createImagePreview(file: Blob): Promise<PreviewRendition | null> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, IMAGE_MAX / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    let blob = await canvasBlob(canvas, 'image/webp', 0.8)
    // Safari can't encode webp and silently returns png.
    if (!blob || blob.type !== 'image/webp') blob = await canvasBlob(canvas, 'image/jpeg', 0.8)
    if (!blob || blob.size > file.size * MAX_RATIO) return null
    return { blob, w: canvas.width, h: canvas.height }
  } finally {
    bitmap.close()
  }
}

export async function createVideoPreview(file: Blob, opts: { signal?: AbortSignal; onProgress?: (p: number) => void } = {}): Promise<PreviewRendition | null> {
  // Loaded on demand: the media toolkit is large and only needed for videos.
  const { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, QUALITY_LOW, QUALITY_VERY_LOW } = await import('mediabunny')
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) })
  const target = new BufferTarget()
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target })
  let size: { w?: number; h?: number } = {}
  const conversion = await Conversion.init({
    input,
    output,
    tracks: 'primary',
    showWarnings: false,
    video: (track) => {
      const width = track.displayWidth
      const scale = width > VIDEO_MAX_WIDTH ? VIDEO_MAX_WIDTH / width : 1
      // Encoders need even dimensions.
      const w = Math.round((width * scale) / 2) * 2
      size = { w, h: Math.round((track.displayHeight * scale) / 2) * 2 }
      return { width: w, quality: QUALITY_LOW, frameRate: 30, keyFrameInterval: 2, forceTranscode: true }
    },
    audio: { quality: QUALITY_VERY_LOW, numberOfChannels: 2 },
  })
  if (!conversion.isValid || !conversion.utilizedTracks.some((t) => t.isVideoTrack())) return null
  const onAbort = () => void conversion.cancel()
  opts.signal?.addEventListener('abort', onAbort, { once: true })
  if (opts.onProgress) conversion.onProgress = (p) => opts.onProgress!(p)
  try {
    await conversion.execute()
  } finally {
    opts.signal?.removeEventListener('abort', onAbort)
  }
  const buffer = target.buffer
  if (!buffer || buffer.byteLength > file.size * MAX_RATIO) return null
  return { blob: new Blob([buffer], { type: 'video/mp4' }), ...size }
}

/** Best-effort; returns null on any failure or unsupported input. */
export async function createPreview(file: Blob, name: string, opts: { signal?: AbortSignal; onProgress?: (p: number) => void } = {}) {
  const kind = wantsPreview(name, file.size, file.type)
  try {
    if (kind === 'image') return await createImagePreview(file)
    if (kind === 'video') return await createVideoPreview(file, opts)
  } catch (err) {
    if (opts.signal?.aborted) throw err
    console.warn('[kdrive] preview generation failed', err)
  }
  return null
}
