import { fromBase64Url, toBase64Url } from './utils'

/** Client-side end-to-end encryption: PBKDF2-SHA256 → AES-256-GCM. Each blob is `iv (12 bytes) || ciphertext`. */

export const KDF_ITERATIONS = 600_000

export interface KdfParams {
  salt: string // base64url
  iterations: number
}

export function newKdfParams(): KdfParams {
  return { salt: toBase64Url(crypto.getRandomValues(new Uint8Array(16))), iterations: KDF_ITERATIONS }
}

export async function deriveKey(passphrase: string, params: KdfParams, extractable = true) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64Url(params.salt), iterations: params.iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptBytes(key: CryptoKey, data: BufferSource) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data))
  const out = new Uint8Array(iv.byteLength + ct.byteLength)
  out.set(iv)
  out.set(ct, iv.byteLength)
  return out
}

export async function decryptBytes(key: CryptoKey, data: Uint8Array) {
  const iv = data.slice(0, 12)
  const ct = data.subarray(12) as Uint8Array<ArrayBuffer>
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct))
}

export async function exportKey(key: CryptoKey) {
  return toBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', key)))
}

/** Keys stay extractable so the owner can put them in an invite link. */
export async function importKey(raw: string) {
  return crypto.subtle.importKey('raw', fromBase64Url(raw), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt'])
}

/** AES-GCM adds a 16 byte tag plus our 12 byte IV per chunk. */
export const ENCRYPTION_OVERHEAD = 28
