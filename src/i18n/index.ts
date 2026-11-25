import { setFormatLocale } from '../lib/utils'
import { en } from './en'
import { vi } from './vi'

/**
 * Gettext-style i18n: the English text is the key, `vi` translates every key
 * (so a missing translation is a type error), and `en` only overrides plurals.
 */

export type Lang = 'vi' | 'en'
export type MessageKey = keyof typeof vi
export type Plural = { one: string; other: string }
type Params = Record<string, string | number>

export const LANGS: { value: Lang; label: string; flag: string }[] = [
  { value: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { value: 'en', label: 'English', flag: '🇬🇧' },
]

const LOCALES: Record<Lang, string> = { vi: 'vi-VN', en: 'en-US' }

let current: Lang = 'vi'

export function setLang(lang: Lang) {
  current = lang
  document.documentElement.lang = lang
  setFormatLocale(LOCALES[lang])
}

export function getLang() {
  return current
}

export function t(key: MessageKey, params?: Params): string {
  const msg: string | Plural = current === 'vi' ? vi[key] : (en[key] ?? key)
  const text = typeof msg === 'string' ? msg : Number(params?.n) === 1 ? msg.one : msg.other
  return params ? text.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`)) : text
}
