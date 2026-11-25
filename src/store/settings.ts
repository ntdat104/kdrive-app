import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import './migrate'
import { getLang, setLang, type Lang } from '../i18n'
import { applyAccent, type Accent } from '../lib/accents'
import { configureCdn, type CdnMode } from '../lib/cdn'

export type Theme = 'light' | 'dark' | 'system'
export type { Lang }
export type ViewMode = 'grid' | 'list'
export type SortKey = 'name' | 'size' | 'updatedAt' | 'type'

interface SettingsState {
  lang: Lang
  accent: Accent
  theme: Theme
  view: ViewMode
  sortBy: SortKey
  sortDir: 'asc' | 'desc'
  foldersFirst: boolean
  showDetails: boolean
  /** Chunk size in MiB. Discord allows 10 MiB per upload on unboosted servers. */
  chunkMB: number
  concurrency: number
  cdnMode: CdnMode
  /** Empty means the built-in proxy (its port changes on every launch, so it is never persisted). */
  cdnProxy: string
  /** Address of a hosted Kdrive web app; share and invite links point there instead of kdrive://. */
  webUrl: string
  confirmTrash: boolean
  /** Encode low-quality renditions of big images/videos at upload. */
  quickPreviews: boolean
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      lang: 'vi',
      accent: 'yellow',
      theme: 'system',
      view: 'grid',
      sortBy: 'name',
      sortDir: 'asc',
      foldersFirst: true,
      showDetails: false,
      chunkMB: 9.5,
      concurrency: 3,
      cdnMode: 'auto',
      cdnProxy: '',
      webUrl: import.meta.env.VITE_KDRIVE_WEB_URL ?? '',
      confirmTrash: false,
      quickPreviews: true,
      set: (patch) => set(patch),
    }),
    { name: 'kdrive:settings', version: 1 },
  ),
)

configureCdn({ mode: useSettings.getState().cdnMode, proxy: useSettings.getState().cdnProxy })
useSettings.subscribe((s) => configureCdn({ mode: s.cdnMode, proxy: s.cdnProxy }))

setLang(useSettings.getState().lang)
applyAccent(useSettings.getState().accent)
useSettings.subscribe((s, prev) => s.accent !== prev.accent && applyAccent(s.accent))
useSettings.subscribe((s) => s.lang !== getLang() && setLang(s.lang))

export function resolvedTheme(theme: Theme) {
  if (theme !== 'system') return theme
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', resolvedTheme(theme) === 'dark')
}
