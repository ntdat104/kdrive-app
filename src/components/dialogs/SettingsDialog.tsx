import { Archive, Check, CloudDownload, Gauge, HardDrive, Monitor, Moon, Network, Palette, Sun, Upload, Users } from 'lucide-react'
import { Tabs } from 'radix-ui'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { LANGS, type MessageKey } from '../../i18n'
import { ACCENTS } from '../../lib/accents'
import { type CdnMode } from '../../lib/cdn'
import { DriveSession } from '../../lib/drive'
import { convertLegacyTree, fetchLegacyTree } from '../../lib/legacy'
import { allFiles, ROOT_ID, uniqueName, type Manifest } from '../../lib/manifest'
import { cn, downloadBlob, errorMessage, formatDateTime, formatSize, uid } from '../../lib/utils'
import { useDrive } from '../../store/drive'
import { useSettings, type Theme } from '../../store/settings'
import { Button, Dialog, Input, Label, Switch, Tooltip } from '../ui/primitives'
import { t } from '../../i18n'

const TABS: { id: string; label: MessageKey; icon: typeof Palette }[] = [
  { id: 'general', label: 'Appearance', icon: Palette },
  { id: 'transfers', label: 'Transfers', icon: Gauge },
  { id: 'network', label: 'Network', icon: Network },
  { id: 'drive', label: 'Drive & backup', icon: HardDrive },
]

export function SettingsDialog({ open, onOpenChange, initialTab }: { open: boolean; onOpenChange: (o: boolean) => void; initialTab?: string }) {
  const [tab, setTab] = useState(initialTab ?? 'general')
  useEffect(() => {
    if (open) setTab(initialTab ?? 'general')
  }, [open, initialTab])

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('Settings')} className="max-w-3xl p-0 [&>div:first-child]:px-6 [&>div:first-child]:pt-6">
      <Tabs.Root value={tab} onValueChange={setTab} orientation="vertical" className="flex flex-col border-t border-line sm:flex-row">
        <Tabs.List className="grid shrink-0 grid-cols-2 gap-1 border-b border-line p-3 sm:flex sm:w-52 sm:flex-col sm:border-r sm:border-b-0">
          {TABS.map((tab) => (
            <Tabs.Trigger
              key={tab.id}
              value={tab.id}
              className="flex h-10 min-w-0 items-center gap-2.5 rounded-xl px-3 text-left text-sm font-semibold text-muted transition hover:bg-surface-2 hover:text-fg data-[state=active]:bg-accent-soft data-[state=active]:text-brand-800 dark:data-[state=active]:text-brand-300"
            >
              <tab.icon className="size-4 shrink-0" /> <span className="truncate">{t(tab.label)}</span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <div className="max-h-[65vh] min-h-[420px] flex-1 overflow-y-auto p-6">
          <Tabs.Content value="general">
            <GeneralTab />
          </Tabs.Content>
          <Tabs.Content value="transfers">
            <TransfersTab />
          </Tabs.Content>
          <Tabs.Content value="network">
            <NetworkTab />
          </Tabs.Content>
          <Tabs.Content value="drive">
            <DriveTab />
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </Dialog>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h3 className="text-sm font-bold">{title}</h3>
      {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl py-2">
      <div>
        <div className="text-sm font-semibold">{label}</div>
        {description && <div className="text-xs text-muted">{description}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  )
}

function GeneralTab() {
  const s = useSettings()
  const themes: { value: Theme; label: string; icon: typeof Sun; preview: string }[] = [
    { value: 'light', label: t('Light'), icon: Sun, preview: 'bg-stone-50' },
    { value: 'dark', label: t('Dark'), icon: Moon, preview: 'bg-stone-900' },
    { value: 'system', label: t('System'), icon: Monitor, preview: 'bg-gradient-to-r from-stone-50 from-50% to-stone-900 to-50%' },
  ]
  return (
    <>
      <Section title={t('Language')}>
        <div className="grid grid-cols-2 gap-3">
          {LANGS.map((l) => (
            <button
              key={l.value}
              onClick={() => s.set({ lang: l.value })}
              className={cn(
                'flex min-w-0 items-center gap-2.5 rounded-2xl border-2 px-3 py-3 text-left text-sm font-semibold whitespace-nowrap transition sm:px-4',
                s.lang === l.value ? 'border-brand-500 bg-accent-soft ring-4 ring-brand-500/15' : 'border-line hover:border-line-strong',
              )}
            >
              <span className="text-xl">{l.flag}</span>
              <span className="truncate">{l.label}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title={t('Accent color')}>
        <AccentPicker />
      </Section>
      <Section title={t('Theme')}>
        <div className="grid grid-cols-3 gap-3">
          {themes.map((th) => (
            <button
              key={th.value}
              onClick={() => s.set({ theme: th.value })}
              className={cn(
                'rounded-2xl border-2 p-2 text-left transition',
                s.theme === th.value ? 'border-brand-500 ring-4 ring-brand-500/15' : 'border-line hover:border-line-strong',
              )}
            >
              <div className={cn('relative h-16 overflow-hidden rounded-xl border border-line', th.preview)}>
                <div className="absolute top-2 left-2 h-2 w-8 rounded-full bg-brand-500" />
                <div className="absolute top-6 left-2 h-1.5 w-12 rounded-full bg-stone-400/50" />
                <div className="absolute top-9 left-2 h-1.5 w-10 rounded-full bg-stone-400/30" />
              </div>
              <div className="mt-2 flex items-center gap-1.5 px-1 text-sm font-semibold">
                <th.icon className="hidden size-4 shrink-0 text-muted sm:block" />
                <span className="leading-tight">{th.label}</span>
              </div>
            </button>
          ))}
        </div>
      </Section>
      <Section title={t('Browsing')}>
        <ToggleRow label={t('Folders first')} description={t('Keep folders above files when sorting')} checked={s.foldersFirst} onChange={(v) => s.set({ foldersFirst: v })} />
        <ToggleRow label={t('Grid view')} description={t('Show thumbnails in a grid instead of a list')} checked={s.view === 'grid'} onChange={(v) => s.set({ view: v ? 'grid' : 'list' })} />
      </Section>
    </>
  )
}

export function AccentPicker({ compact }: { compact?: boolean }) {
  const accent = useSettings((s) => s.accent)
  const set = useSettings((s) => s.set)
  return (
    <div className={cn('flex flex-wrap', compact ? 'gap-1.5' : 'gap-2')} role="radiogroup" aria-label={t('Accent color')}>
      {ACCENTS.map((a) => {
        const active = accent === a.value
        return (
          <Tooltip key={a.value} content={t(a.label)}>
            <button
              role="radio"
              aria-checked={active}
              aria-label={t(a.label)}
              onClick={() => set({ accent: a.value })}
              className={cn(
                'focus-ring grid place-items-center rounded-full ring-offset-2 ring-offset-elevated transition hover:scale-110',
                compact ? 'size-7' : 'size-9',
                active ? 'ring-2' : 'ring-0',
              )}
              style={{ background: `linear-gradient(135deg, ${a.light}, ${a.swatch})`, ['--tw-ring-color' as string]: a.swatch }}
            >
              {active && <Check className={compact ? 'size-3.5' : 'size-4'} style={{ color: a.on }} strokeWidth={3} />}
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}

function TransfersTab() {
  const s = useSettings()
  const presets = [
    { mb: 9.5, label: '10 MB', hint: t('Any server') },
    { mb: 49.5, label: '50 MB', hint: t('Boost level 2') },
    { mb: 99.5, label: '100 MB', hint: t('Boost level 3') },
  ]
  return (
    <>
      <Section
        title={t('Chunk size')}
        description={t('Files are split into chunks that fit Discord’s upload limit. Larger chunks mean fewer messages, but only work on boosted servers.')}
      >
        <div className="grid grid-cols-3 gap-2">
          {presets.map((p) => (
            <button
              key={p.mb}
              onClick={() => s.set({ chunkMB: p.mb })}
              className={cn(
                'rounded-2xl border-2 px-3 py-3 text-left transition',
                s.chunkMB === p.mb ? 'border-brand-500 bg-accent-soft' : 'border-line hover:border-line-strong',
              )}
            >
              <div className="text-sm font-bold">{p.label}</div>
              <div className="text-xs text-muted">{p.hint}</div>
            </button>
          ))}
        </div>
      </Section>
      <Section title={t('Quick previews')}>
        <ToggleRow
          label={t('Create quick previews for images & videos')}
          description={t('Uploads a small, low-quality copy (≤1600px images, 480p video) that opens instantly while the original loads.')}
          checked={s.quickPreviews}
          onChange={(v) => s.set({ quickPreviews: v })}
        />
      </Section>
      <Section title={t('Parallel uploads')} description={t('How many chunks transfer at the same time. Discord rate limits are handled automatically.')}>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={1}
            max={8}
            value={s.concurrency}
            onChange={(e) => s.set({ concurrency: Number(e.target.value) })}
            className="flex-1 accent-brand-500"
          />
          <span className="w-8 text-center text-lg font-extrabold text-brand-700 tabular-nums dark:text-brand-400">{s.concurrency}</span>
        </div>
      </Section>
    </>
  )
}

function NetworkTab() {
  const s = useSettings()
  const session = useDrive((st) => st.session)
  const [testing, setTesting] = useState(false)
  const modes: { value: CdnMode; label: string; description: string }[] = [
    { value: 'auto', label: t('Automatic'), description: t('Try the proxy, then a direct request, then the Disbox extension.') },
    { value: 'proxy', label: t('CORS proxy'), description: t('Route downloads through the proxy below.') },
    { value: 'direct', label: t('Direct'), description: t('Fetch Discord CDN directly (needs a CORS-unblocking extension).') },
    { value: 'extension', label: t('Disbox extension'), description: t('Use the legacy Disbox browser extension.') },
  ]
  const test = async () => {
    if (!session) return
    setTesting(true)
    try {
      await DriveSession.fetchRemote(session.client, session.manifestId)
      toast.success(t('Download path works 🎉'))
    } catch (err) {
      toast.error(t('Download test failed'), { description: errorMessage(err) })
    } finally {
      setTesting(false)
    }
  }
  return (
    <>
      <Section
        title={t('Downloading from Discord')}
        description={t('Discord’s CDN doesn’t let apps read files from other sites (CORS). The desktop app runs a tiny built-in proxy on this computer that only forwards Discord CDN links.')}
      >
        <div className="space-y-2">
          {modes.map((m) => (
            <label
              key={m.value}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3 transition',
                s.cdnMode === m.value ? 'border-brand-500 bg-accent-soft' : 'border-line hover:border-line-strong',
              )}
            >
              <input type="radio" name="cdn" checked={s.cdnMode === m.value} onChange={() => s.set({ cdnMode: m.value })} className="mt-1 accent-brand-500" />
              <div>
                <div className="text-sm font-bold">{m.label}</div>
                <div className="text-xs text-muted">{m.description}</div>
              </div>
            </label>
          ))}
        </div>
      </Section>
      <Section title={t('Proxy URL')} description={t('Leave empty to use the built-in proxy. For a custom one, use {url} where the encoded Discord link goes.')}>
        <div className="flex gap-2">
          <Input value={s.cdnProxy} onChange={(e) => s.set({ cdnProxy: e.target.value })} className="font-mono text-xs" placeholder={t('Built-in proxy')} />
          <Button variant="ghost" onClick={() => s.set({ cdnProxy: '' })}>
            {t('Reset')}
          </Button>
        </div>
        <Button className="mt-3" variant="outline" loading={testing} onClick={test}>
          {t('Test download path')}
        </Button>
      </Section>
      <Section
        title={t('Share links')}
        description={t('Address of a hosted Kdrive web app. Share and invite links point there so anyone can open them in a browser. Leave empty to create kdrive:// links that open this app.')}
      >
        <Input
          value={s.webUrl}
          onChange={(e) => s.set({ webUrl: e.target.value })}
          onBlur={(e) => {
            const v = e.target.value.trim()
            if (v && !/^https?:\/\//.test(v)) s.set({ webUrl: `https://${v}` })
          }}
          className="font-mono text-xs"
          placeholder="https://kdrive.example.com"
          inputMode="url"
        />
      </Section>
    </>
  )
}

function DriveTab() {
  const manifest = useDrive((s) => s.manifest)
  const session = useDrive((s) => s.session)
  const info = useDrive((s) => s.info)
  const mutate = useDrive((s) => s.mutate)
  const perm = useDrive((s) => s.access.perm)
  const fileInput = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  if (!manifest || !session) return null
  if (perm !== 'owner') {
    return (
      <Section title={t('Shared with you')} description={t('You opened this drive from an invite link. Backups, imports and sharing are managed by its owner.')}>
        <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface-2/50 p-3">
          <Users className="mt-0.5 size-4 shrink-0 text-brand-500" />
          <div className="min-w-0">
            <div className="text-sm font-semibold">{perm === 'edit' ? t('Editor') : t('Viewer')}</div>
            <div className="text-xs text-muted">{perm === 'edit' ? t('You can upload, rename, move and delete items.') : t('You can browse, preview and download.')}</div>
          </div>
        </div>
      </Section>
    )
  }
  const files = allFiles(manifest.nodes)
  const total = files.reduce((a, f) => a + f.size, 0)
  const messages = files.reduce((a, f) => a + (f.chunks?.length ?? 0), 0)

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })
    downloadBlob(blob, `kdrive-backup-${new Date().toISOString().slice(0, 10)}.json`)
    toast.success(t('Backup downloaded'), { description: session.encrypted ? t('Keep it safe — files still need your passphrase.') : undefined })
  }

  const importBackup = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as Manifest
      if (!data.nodes?.[ROOT_ID]) throw new Error(t('This is not a Kdrive backup'))
      toast(t('Replace the current file tree with this backup?'), {
        description: t('{n} items from {date}', { n: Object.keys(data.nodes).length, date: formatDateTime(data.updatedAt) }),
        duration: 15_000,
        action: {
          label: t('Replace'),
          onClick: () => {
            mutate((n) => {
              for (const key of Object.keys(n)) delete n[key]
              Object.assign(n, data.nodes)
            })
            toast.success(t('Backup restored'))
          },
        },
      })
    } catch (err) {
      toast.error(t('Restore failed'), { description: errorMessage(err) })
    }
  }

  const importLegacy = async () => {
    setImporting(true)
    try {
      const tree = await fetchLegacyTree(session.webhookUrl)
      if (!tree) {
        toast(t('No Disbox v1 files found for this webhook'))
        return
      }
      const folderId = uid()
      const now = Date.now()
      const nodes = convertLegacyTree(tree, folderId)
      mutate((n) => {
        n[folderId] = { id: folderId, parentId: ROOT_ID, name: uniqueName(n, ROOT_ID, t('Imported from Disbox v1')), type: 'folder', size: 0, createdAt: now, updatedAt: now }
        for (const node of nodes) n[node.id] = node
      })
      toast.success(t('Imported {n} files from Disbox v1', { n: nodes.filter((x) => x.type === 'file').length }))
    } catch (err) {
      toast.error(t('Import failed'), { description: errorMessage(err) })
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <Section title={t('This drive')}>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            [t('Files'), files.length.toLocaleString()],
            [t('Used'), formatSize(total)],
            [t('Messages'), messages.toLocaleString()],
            [t('Revision'), `#${manifest.rev}`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-line bg-surface-2/50 p-3">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="mt-0.5 text-lg font-extrabold tracking-tight">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 space-y-1 text-[13px] text-muted">
          <div>
            Webhook: <span className="font-semibold text-fg">{info?.name}</span> · {t('channel')} <code className="font-mono text-xs">{info?.channel_id}</code>
          </div>
          <div>
            {t('Encryption')}:{' '}
            {session.encrypted ? <span className="font-semibold text-emerald-600 dark:text-emerald-400">{t('AES-256-GCM, end-to-end')}</span> : t('Off')}
          </div>
        </div>
      </Section>
      <Section title={t('Backup')} description={t('The file index lives in one Discord message. Keep an offline copy in case it is deleted.')}>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportBackup}>
            <CloudDownload className="size-4" /> {t('Export backup')}
          </Button>
          <Button variant="outline" onClick={() => fileInput.current?.click()}>
            <Upload className="size-4" /> {t('Restore from backup')}
          </Button>
          <input ref={fileInput} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && void importBackup(e.target.files[0])} />
        </div>
      </Section>
      <Section title={t('Disbox v1')} description={t('Bring over files uploaded with the original Disbox web app (metadata server at disbox-server.fly.dev).')}>
        <Button variant="outline" loading={importing} onClick={importLegacy}>
          <Archive className="size-4" /> {t('Import Disbox v1 files')}
        </Button>
      </Section>
      <Label hint={t('Do not delete the manifest message in your Discord channel.')}>{t('Manifest message')}</Label>
      <code className="block rounded-xl bg-surface-2 px-3 py-2 font-mono text-xs">{session.manifestId}</code>
    </>
  )
}
