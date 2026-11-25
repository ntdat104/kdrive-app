import { CloudAlert, CloudCheck, CloudUpload, Command, Eye, Keyboard, Menu, Monitor, Moon, Search, Settings, Sun, X } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { useMediaQuery } from '../../hooks'
import { cn, modKey } from '../../lib/utils'
import { useDrive } from '../../store/drive'
import { useSettings, type Theme } from '../../store/settings'
import { useUI } from '../../store/ui'
import { LanguageSwitcher } from '../LanguageSwitcher'
import { AccentPicker } from '../dialogs/SettingsDialog'
import { Button, Kbd, menuContentClass, menuItemClass, menuSeparatorClass, Tooltip } from '../ui/primitives'
import { t } from '../../i18n'

export function Topbar() {
  const setMobileNavOpen = useUI((s) => s.setMobileNavOpen)
  const openDialog = useUI((s) => s.openDialog)
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-line bg-bg/80 px-3 backdrop-blur-xl sm:gap-3 sm:px-5">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileNavOpen(true)} aria-label={t('Open navigation')}>
        <Menu className="size-5" />
      </Button>
      <SearchBox />
      <div className="ml-auto flex items-center gap-1">
        <ViewOnlyBadge />
        <SaveIndicator />
        <LanguageSwitcher className="hidden sm:inline-flex" />
        <ThemeMenu />
        <Tooltip content={t('Keyboard shortcuts (?)')}>
          <Button variant="ghost" size="icon" className="hidden sm:inline-flex" onClick={() => openDialog({ type: 'shortcuts' })} aria-label={t('Keyboard shortcuts')}>
            <Keyboard className="size-[18px]" />
          </Button>
        </Tooltip>
        <Tooltip content={t('Settings')}>
          <Button variant="ghost" size="icon" onClick={() => openDialog({ type: 'settings' })} aria-label={t('Settings')}>
            <Settings className="size-[18px]" />
          </Button>
        </Tooltip>
      </div>
    </header>
  )
}

export const focusSearch = () => document.getElementById('drive-search')?.focus()

function SearchBox() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const onSearchPage = location.pathname.endsWith('/search')
  const q = onSearchPage ? (params.get('q') ?? '') : ''
  const ref = useRef<HTMLInputElement>(null)
  const setCommandOpen = useUI((s) => s.setCommandOpen)
  const narrow = useMediaQuery('(max-width: 640px)')
  const backTo = useRef('/drive')

  useEffect(() => {
    if (!onSearchPage) backTo.current = location.pathname
  }, [onSearchPage, location.pathname])

  const update = (value: string) => {
    if (!value) navigate(backTo.current, { replace: true })
    else navigate(`/drive/search?q=${encodeURIComponent(value)}`, { replace: onSearchPage })
  }

  return (
    <div className="group relative max-w-xl flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-subtle transition group-focus-within:text-brand-500" />
      <input
        id="drive-search"
        ref={ref}
        value={q}
        onChange={(e) => update(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            update('')
            ref.current?.blur()
          }
        }}
        placeholder={narrow ? t('Search your drive') : t('Search files, folders, type:image, ext:pdf…')}
        className="h-11 w-full rounded-2xl border border-transparent bg-surface-2 pr-10 pl-11 sm:pr-24 text-sm transition outline-none placeholder:text-subtle hover:border-line focus:border-brand-500 focus:bg-surface focus:ring-4 focus:ring-brand-500/15"
      />
      <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
        {q ? (
          <button className="grid size-7 place-items-center rounded-lg text-subtle hover:bg-line hover:text-fg" onClick={() => update('')} aria-label={t('Clear search')}>
            <X className="size-4" />
          </button>
        ) : (
          <button onClick={() => setCommandOpen(true)} className="hidden items-center gap-1 rounded-lg px-1.5 py-1 text-subtle hover:bg-line sm:flex" aria-label={t('Command palette')}>
            <Kbd>{modKey() === '⌘' ? <Command className="size-3" /> : 'Ctrl'}</Kbd>
            <Kbd>K</Kbd>
          </button>
        )}
      </div>
    </div>
  )
}

function ViewOnlyBadge() {
  const viewOnly = useDrive((s) => s.access.perm === 'view')
  if (!viewOnly) return null
  return (
    <Tooltip content={t('You can browse, preview and download.')}>
      <span className="hidden h-8 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-xs font-bold whitespace-nowrap text-muted sm:flex">
        <Eye className="size-3.5" /> {t('View only')}
      </span>
    </Tooltip>
  )
}

function SaveIndicator() {
  const state = useDrive((s) => s.saveState)
  const owner = useDrive((s) => s.access.perm === 'owner')
  const error = useDrive((s) => s.saveError)
  const resolve = useDrive((s) => s.resolveConflict)
  const flush = useDrive((s) => s.flush)

  if (state === 'conflict') {
    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button size="sm" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
            <CloudAlert className="size-4" /> <span className="hidden sm:inline">{t('Changed elsewhere')}</span>
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={8} className={cn(menuContentClass, 'w-72')}>
            <p className="px-2.5 py-2 text-xs text-muted">{t('This drive was modified from another device or tab. Choose which version to keep.')}</p>
            <DropdownMenu.Item className={menuItemClass} onSelect={() => void resolve('reload')}>
              {t('Load latest (discard my unsaved changes)')}
            </DropdownMenu.Item>
            {owner && (
              <DropdownMenu.Item className={menuItemClass} onSelect={() => void resolve('overwrite')}>
                {t('Keep mine (overwrite remote)')}
              </DropdownMenu.Item>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    )
  }

  const meta = {
    saved: { icon: CloudCheck, label: t('All changes saved'), cls: 'text-emerald-600 dark:text-emerald-400' },
    dirty: { icon: CloudUpload, label: t('Unsaved changes'), cls: 'text-subtle' },
    saving: { icon: CloudUpload, label: t('Saving to Discord…'), cls: 'text-brand-500 animate-pulse' },
    error: { icon: CloudAlert, label: `${t('Save failed — retrying.')} ${error ?? ''}`, cls: 'text-red-500' },
  }[state]
  const Icon = meta.icon
  return (
    <Tooltip content={meta.label}>
      <Button variant="ghost" size="icon" onClick={() => void flush()} aria-label={meta.label}>
        <Icon className={cn('size-[18px]', meta.cls)} />
      </Button>
    </Tooltip>
  )
}

function ThemeMenu() {
  const theme = useSettings((s) => s.theme)
  const set = useSettings((s) => s.set)
  const options: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: t('Light'), icon: Sun },
    { value: 'dark', label: t('Dark'), icon: Moon },
    { value: 'system', label: t('System'), icon: Monitor },
  ]
  return (
    <DropdownMenu.Root>
      <Tooltip content={t('Theme')}>
        <DropdownMenu.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('Theme')}>
            <Sun className="size-[18px] dark:hidden" />
            <Moon className="hidden size-[18px] dark:block" />
          </Button>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className={cn(menuContentClass, 'min-w-64')}>
          {options.map((o) => (
            <DropdownMenu.Item key={o.value} className={cn(menuItemClass, theme === o.value && 'text-brand-700 dark:text-brand-400')} onSelect={() => set({ theme: o.value })}>
              <o.icon /> {o.label}
              {theme === o.value && <span className="ml-auto size-1.5 rounded-full bg-brand-500" />}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className={menuSeparatorClass} />
          <DropdownMenu.Label className="px-2.5 pt-1 pb-2 text-[11px] font-bold tracking-wider text-subtle uppercase">{t('Accent color')}</DropdownMenu.Label>
          <div className="px-2 pb-1.5">
            <AccentPicker compact />
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
