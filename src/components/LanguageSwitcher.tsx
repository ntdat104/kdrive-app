import { Check, Languages } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { getLang, LANGS, t } from '../i18n'
import { cn } from '../lib/utils'
import { useSettings } from '../store/settings'
import { Button, menuContentClass, menuItemClass, Tooltip } from './ui/primitives'

export function LanguageSwitcher({ className }: { className?: string }) {
  const set = useSettings((s) => s.set)
  const current = getLang()
  return (
    <DropdownMenu.Root>
      <Tooltip content={t('Language')}>
        <DropdownMenu.Trigger asChild>
          <Button variant="ghost" size="icon" className={className} aria-label={t('Language')}>
            <Languages className="size-[18px]" />
          </Button>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className={cn(menuContentClass, 'min-w-44')}>
          {LANGS.map((l) => (
            <DropdownMenu.Item key={l.value} className={menuItemClass} onSelect={() => set({ lang: l.value })}>
              <span className="text-base">{l.flag}</span> {l.label}
              {current === l.value && <Check className="ml-auto !text-brand-500" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
