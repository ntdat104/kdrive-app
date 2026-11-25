import { getCurrentWindow } from '@tauri-apps/api/window'
import { ask } from '@tauri-apps/plugin-dialog'
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link'
import { LinkIcon } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Button, Dialog, Input } from '../components/ui/primitives'
import { router } from '../router'
import { useDrive } from '../store/drive'
import { useTransfers } from '../store/transfers'
import { t } from '../i18n'
import { isDesktop } from './desktop'
import { linkRoute, useOpenLink } from './links'

function openRoute(route: string) {
  useOpenLink.getState().setOpen(false)
  void router.navigate(route)
}

function openUrls(urls: string[] | null) {
  const route = urls?.map(linkRoute).find(Boolean)
  if (route) openRoute(route)
}

function isEditable(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return Boolean(el && (el.isContentEditable || el.closest('input, textarea, select, [contenteditable="true"], .cm-editor')))
}

/** Desktop-only glue: kdrive:// deep links, pasted links, the open-link dialog and the close guard. */
export function DesktopBridge() {
  useEffect(() => {
    if (!isDesktop) return
    let disposed = false
    const unlisten: (() => void)[] = []
    const keep = (fn: () => void) => (disposed ? fn() : unlisten.push(fn))

    void getCurrent().then(openUrls).catch(() => {})
    void onOpenUrl(openUrls).then(keep).catch(() => {})

    // Same rule as the web app's beforeunload: never lose unsaved edits or running transfers.
    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        const busy = useTransfers.getState().transfers.some((x) => x.status === 'running' || x.status === 'queued')
        if (!busy && useDrive.getState().saveState === 'dirty') await useDrive.getState().flush().catch(() => {})
        const unsaved = ['dirty', 'saving'].includes(useDrive.getState().saveState)
        if (!busy && !unsaved) return
        const quit = await ask(busy ? t('Transfers are still running. Quit and cancel them?') : t('Some changes are not saved to Discord yet. Quit anyway?'), {
          title: 'Kdrive',
          kind: 'warning',
          okLabel: t('Quit'),
          cancelLabel: t('Cancel'),
        })
        if (!quit) event.preventDefault()
      })
      .then(keep)

    // Pasting a share or invite link anywhere outside a text field opens it.
    const onPaste = (e: ClipboardEvent) => {
      if (isEditable(e.target)) return
      const route = linkRoute(e.clipboardData?.getData('text') ?? '')
      if (!route) return
      e.preventDefault()
      openRoute(route)
    }
    document.addEventListener('paste', onPaste)

    return () => {
      disposed = true
      unlisten.forEach((fn) => fn())
      document.removeEventListener('paste', onPaste)
    }
  }, [])

  return <OpenLinkDialog />
}

function OpenLinkDialog() {
  const open = useOpenLink((s) => s.open)
  const setOpen = useOpenLink((s) => s.setOpen)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setValue('')
    setError(null)
  }, [open])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const route = linkRoute(value)
    if (!route) return setError(t('This is not a Kdrive share or invite link.'))
    openRoute(route)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={t('Open a Kdrive link')}
      description={t('Paste a file share link or a folder/drive invite link someone sent you.')}
      icon={<LinkIcon />}
      className="max-w-lg"
    >
      <form onSubmit={submit} className="space-y-3">
        <Input
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          placeholder="https://…/join#…  ·  kdrive://share#…"
          className="font-mono text-xs"
        />
        {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t('Cancel')}
          </Button>
          <Button variant="primary" disabled={!value.trim()}>
            {t('Open')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
