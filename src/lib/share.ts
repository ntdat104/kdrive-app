import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate'
import { kdriveLink } from '../platform/links'
import { attachmentExpiry } from './discord'
import { fromBase64Url, toBase64Url } from './utils'

/** Share links carry the signed attachment URLs in the hash, so nothing is sent to any server. */
export interface SharePayload {
  n: string // name
  s: number // size
  t?: string // mime
  u: string[] // attachment urls
}

export function encodeShare(payload: SharePayload) {
  const packed = toBase64Url(deflateSync(strToU8(JSON.stringify(payload)), { level: 9 }))
  return kdriveLink('share', packed)
}

export function decodeShare(hash: string): SharePayload | null {
  try {
    const raw = hash.replace(/^#/, '')
    if (!raw) return null
    const payload = JSON.parse(strFromU8(inflateSync(fromBase64Url(raw)))) as SharePayload
    return Array.isArray(payload.u) && payload.n ? payload : null
  } catch {
    return null
  }
}

export function shareExpiry(payload: SharePayload) {
  return Math.min(...payload.u.map(attachmentExpiry))
}

/**
 * Invite links open a shared folder (or the whole drive) inside Kdrive. Without a backend the
 * link has to carry the webhook URL, so the grant id is looked up in the manifest on every open:
 * that is what lets the owner switch view/edit or revoke a link after sending it.
 */
export interface InvitePayload {
  v: 1
  w: string // webhook url
  g: string // share grant id
  n: string // folder or drive name, shown before the drive is opened
  k?: string // raw AES key (base64url) for encrypted drives, if the owner chose to include it
}

export function encodeInvite(payload: Omit<InvitePayload, 'v'>) {
  const packed = toBase64Url(deflateSync(strToU8(JSON.stringify({ v: 1, ...payload })), { level: 9 }))
  return kdriveLink('join', packed)
}

export function decodeInvite(hash: string): InvitePayload | null {
  try {
    const raw = hash.replace(/^#/, '')
    if (!raw) return null
    const payload = JSON.parse(strFromU8(inflateSync(fromBase64Url(raw)))) as InvitePayload
    return payload.v === 1 && typeof payload.w === 'string' && typeof payload.g === 'string' ? payload : null
  } catch {
    return null
  }
}
