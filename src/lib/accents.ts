import type { MessageKey } from '../i18n'

/** Accent palettes; the full ramps live in index.css under `:root[data-accent=…]`. */
export const ACCENTS = [
  { value: 'yellow', label: 'Yellow', swatch: '#f0b90b', light: '#fcd535', on: '#181a20' },
  { value: 'orange', label: 'Orange', swatch: '#f97316', light: '#fdba74', on: '#1c1008' },
  { value: 'green', label: 'Green', swatch: '#22c55e', light: '#86efac', on: '#052e16' },
  { value: 'blue', label: 'Blue', swatch: '#2563eb', light: '#60a5fa', on: '#ffffff' },
  { value: 'red', label: 'Red', swatch: '#dc2626', light: '#f87171', on: '#ffffff' },
  { value: 'purple', label: 'Purple', swatch: '#9333ea', light: '#c084fc', on: '#ffffff' },
  { value: 'indigo', label: 'Indigo', swatch: '#4f46e5', light: '#818cf8', on: '#ffffff' },
] as const satisfies readonly { value: string; label: MessageKey; swatch: string; light: string; on: string }[]

export type Accent = (typeof ACCENTS)[number]['value']

function faviconSvg(a: (typeof ACCENTS)[number]) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a.light}"/><stop offset="1" stop-color="${a.swatch}"/></linearGradient></defs><rect width="64" height="64" rx="18" fill="url(#g)"/><path d="M22 16v32" fill="none" stroke="${a.on}" stroke-width="6.5" stroke-linecap="round"/><path d="M43 17 28.5 31.5 44 47" fill="none" stroke="${a.on}" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="47.5" cy="16.5" r="3.2" fill="${a.on}"/></svg>`
}

/** Applies the accent to the document, favicon and mobile browser chrome. */
export function applyAccent(accent: Accent) {
  const a = ACCENTS.find((x) => x.value === accent) ?? ACCENTS[0]
  document.documentElement.dataset.accent = a.value
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', a.swatch)
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (icon) icon.href = `data:image/svg+xml,${encodeURIComponent(faviconSvg(a))}`
}
