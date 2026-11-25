import { kindOf } from './filetypes'

const MAX = 320

export interface MediaInfo {
  thumb?: string
  meta?: { w?: number; h?: number; dur?: number }
}

function canvasToDataUrl(source: CanvasImageSource, w: number, h: number) {
  const scale = Math.min(1, MAX / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  const url = canvas.toDataURL('image/webp', 0.72)
  // Keep the manifest lean: thumbnails above ~40KB are dropped.
  return url.length < 40_000 ? url : canvas.toDataURL('image/jpeg', 0.5)
}

/**
 * True when a frame is (almost) solid black: what a video gives when the browser can't
 * decode its codec, or when it opens on a black screen.
 */
function isBlankFrame(source: CanvasImageSource) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 16
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false
  ctx.drawImage(source, 0, 0, 16, 16)
  const data = ctx.getImageData(0, 0, 16, 16).data
  let max = 0
  for (let i = 0; i < data.length; i += 4) max = Math.max(max, 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2])
  return max < 16
}

const blankThumbs = new Map<string, Promise<boolean>>()

/** Checks a stored thumbnail once per session; older uploads may have saved a black frame. */
export function isBlankThumb(url: string) {
  let result = blankThumbs.get(url)
  if (!result) {
    result = new Promise<boolean>((resolve) => {
      const img = new Image()
      img.onload = () => {
        try {
          resolve(isBlankFrame(img))
        } catch {
          resolve(false)
        }
      }
      img.onerror = () => resolve(true)
      img.src = url
    })
    blankThumbs.set(url, result)
  }
  return result
}

async function imageInfo(file: Blob): Promise<MediaInfo> {
  const bitmap = await createImageBitmap(file)
  try {
    return { thumb: canvasToDataUrl(bitmap, bitmap.width, bitmap.height), meta: { w: bitmap.width, h: bitmap.height } }
  } finally {
    bitmap.close()
  }
}

function mediaInfo(file: Blob, video: boolean): Promise<MediaInfo> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const el = document.createElement(video ? 'video' : 'audio')
    el.preload = 'metadata'
    el.muted = true
    let done = false
    const finish = (info: MediaInfo) => {
      if (done) return
      done = true
      URL.revokeObjectURL(url)
      el.removeAttribute('src')
      resolve(info)
    }
    const timeout = setTimeout(() => finish({}), 8000)
    el.onerror = () => {
      clearTimeout(timeout)
      finish({})
    }
    el.onloadedmetadata = () => {
      const dur = Number.isFinite(el.duration) ? el.duration : undefined
      if (!video) {
        clearTimeout(timeout)
        return finish({ meta: { dur } })
      }
      const v = el as HTMLVideoElement
      // No decodable video track (e.g. a codec this browser lacks): no thumbnail rather than a black one.
      if (!v.videoWidth) {
        clearTimeout(timeout)
        return finish({ meta: { dur } })
      }
      const meta = { w: v.videoWidth, h: v.videoHeight, dur }
      // Try a few points in the video, since many clips open on a black frame.
      const times = dur ? [Math.min(1, dur / 4), dur / 2, (dur * 3) / 4] : [1]
      let attempt = 0
      v.onseeked = () => {
        try {
          if (!isBlankFrame(v)) {
            clearTimeout(timeout)
            return finish({ thumb: canvasToDataUrl(v, v.videoWidth, v.videoHeight), meta })
          }
        } catch {
          clearTimeout(timeout)
          return finish({ meta })
        }
        if (++attempt < times.length) v.currentTime = times[attempt]
        else {
          clearTimeout(timeout)
          finish({ meta })
        }
      }
      v.currentTime = times[0]
    }
    el.src = url
  })
}

/** Best-effort thumbnail + dimensions; never throws. */
export async function extractMediaInfo(file: Blob, name: string): Promise<MediaInfo> {
  try {
    const kind = kindOf(name, file.type)
    if (kind === 'image' && file.size < 60 * 1024 * 1024) return await imageInfo(file)
    if (kind === 'video') return await mediaInfo(file, true)
    if (kind === 'audio') return await mediaInfo(file, false)
  } catch {
    /* unsupported format */
  }
  return {}
}
