import { ArrowLeft, ArrowRight, Check, CircleCheck, ExternalLink, Eye, EyeOff, History, KeyRound, LinkIcon, LockKeyhole, ShieldCheck, Sparkles, Webhook } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { Wordmark } from '../components/Logo'
import { Button, Input, Label, Switch } from '../components/ui/primitives'
import { deriveKey, exportKey, newKdfParams } from '../lib/crypto'
import { canonicalWebhookUrl, DiscordError, parseWebhookUrl, webhookAvatarUrl, type WebhookInfo } from '../lib/discord'
import { DriveSession, type RemoteManifest } from '../lib/drive'
import { idb } from '../lib/idb'
import { convertLegacyTree, fetchLegacyTree } from '../lib/legacy'
import { emptyManifest, ROOT_ID } from '../lib/manifest'
import { cn, errorMessage } from '../lib/utils'
import { useDrive } from '../store/drive'
import { useDrives } from '../store/drives'
import { useOpenLink } from '../platform/links'
import { t } from '../i18n'

type Step = 'webhook' | 'create'

export default function Connect() {
  const [step, setStep] = useState<Step>('webhook')
  const [url, setUrl] = useState('')
  const [info, setInfo] = useState<WebhookInfo | null>(null)
  const hasDrives = useDrives((s) => s.profiles.length > 0)

  return (
    <div className="relative min-h-full overflow-hidden bg-bg">
      <div className="pointer-events-none absolute -top-48 -right-40 size-[560px] rounded-full bg-brand-500/20 blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-48 -left-40 size-[480px] rounded-full bg-brand-300/15 blur-[140px]" />
      <header className="relative mx-auto flex h-20 max-w-6xl items-center justify-between px-6">
        <Link to={hasDrives ? '/drive' : '/'}>
          <Wordmark />
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => useOpenLink.getState().setOpen(true)}>
            <LinkIcon className="size-4" /> <span className="hidden sm:inline">{t('Open a Kdrive link…')}</span>
          </Button>
          <LanguageSwitcher />
          {hasDrives && (
            <Link to="/drive" className="text-sm font-semibold text-muted hover:text-fg">
              {t('Back to drive →')}
            </Link>
          )}
        </div>
      </header>
      <main className="relative mx-auto grid max-w-6xl gap-10 px-6 pt-6 pb-20 lg:grid-cols-[1fr_440px] lg:gap-16">
        <Guide />
        <div className="lg:pt-4">
          <div className="rounded-3xl border border-line bg-surface/90 p-6 shadow-2xl shadow-stone-950/5 backdrop-blur-xl sm:p-8">
            <AnimatePresence mode="wait">
              {step === 'webhook' ? (
                <motion.div key="w" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <WebhookStep
                    url={url}
                    setUrl={setUrl}
                    onNew={(i) => {
                      setInfo(i)
                      setStep('create')
                    }}
                  />
                </motion.div>
              ) : (
                <motion.div key="c" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                  <CreateStep url={url} info={info!} onBack={() => setStep('webhook')} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <p className="mt-4 flex items-start gap-2 px-2 text-xs text-subtle">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
            {t('Your webhook URL stays in this browser. Kdrive has no backend: files and the folder index live in your own Discord channel.')}
          </p>
        </div>
      </main>
    </div>
  )
}

function Guide() {
  const steps = [
    { title: t('Create a private server'), text: t('In Discord, click “+” → Create My Own. Keep it just for you.') },
    { title: t('Open channel settings'), text: t('Hover a text channel → ⚙ Edit Channel → Integrations → Webhooks.') },
    { title: t('Create a webhook'), text: t('Click “New Webhook”, then “Copy Webhook URL”.') },
    { title: t('Paste it here'), text: t('That URL is your key to the drive — treat it like a password.') },
  ]
  return (
    <div>
      <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-accent-soft px-3 py-1 text-xs font-bold text-brand-800 dark:text-brand-300">
        <Sparkles className="size-3.5" /> {t('2-minute setup')}
      </div>
      <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
        {t('Connect your')} <span className="bg-gradient-to-r from-brand-500 to-brand-700 bg-clip-text text-transparent dark:from-brand-300 dark:to-brand-500">Discord</span> {t('drive')}
      </h1>
      <p className="mt-4 max-w-lg text-lg text-muted">{t('One webhook = one drive. Create as many as you like and switch between them anytime.')}</p>
      <ol className="mt-10 space-y-5">
        {steps.map((s, i) => (
          <motion.li key={s.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.08 }} className="flex gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-extrabold text-accent-fg shadow-lg shadow-brand-500/30">
              {i + 1}
            </span>
            <div>
              <div className="font-bold">{s.title}</div>
              <div className="text-sm text-muted">{s.text}</div>
            </div>
          </motion.li>
        ))}
      </ol>
      <a
        href="https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks"
        target="_blank"
        rel="noreferrer"
        className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-400"
      >
        {t('Discord’s guide to webhooks')} <ExternalLink className="size-3.5" />
      </a>
    </div>
  )
}

function WebhookStep({ url, setUrl, onNew }: { url: string; setUrl: (u: string) => void; onNew: (info: WebhookInfo) => void }) {
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [found, setFound] = useState<{ info: WebhookInfo; remote: RemoteManifest } | null>(null)
  const upsert = useDrives((s) => s.upsert)
  const setActive = useDrives((s) => s.setActive)
  const close = useDrive((s) => s.close)
  const navigate = useNavigate()
  const valid = Boolean(parseWebhookUrl(url))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!valid) return setError(t('That doesn’t look like a Discord webhook URL.'))
    setBusy(true)
    try {
      const { info, remote } = await DriveSession.inspect(url)
      if (remote) setFound({ info, remote })
      else onNew(info)
    } catch (err) {
      const status = err instanceof DiscordError ? err.status : 0
      setError(
        status === 404 || status === 401
          ? t('This webhook doesn’t exist or its token is wrong. Copy the URL again from Discord.')
          : errorMessage(err),
      )
    } finally {
      setBusy(false)
    }
  }

  const openExisting = () => {
    if (!found) return
    const id = found.info.id
    upsert({
      id,
      name: found.info.name?.replace(/\s*\[\d+\]$/, '') || 'Kdrive',
      webhookUrl: canonicalWebhookUrl(url),
      encrypted: Boolean(found.remote.kdf),
      avatar: webhookAvatarUrl(found.info),
      addedAt: Date.now(),
    })
    close()
    setActive(id)
    navigate('/drive')
  }

  if (found) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-500">
          <CircleCheck className="size-8" />
        </div>
        <h2 className="text-xl font-bold">{t('Existing drive found')}</h2>
        <p className="mt-1 text-sm text-muted">
          {t('“{name}” already has a Kdrive drive.', { name: found.info.name?.replace(/\s*\[\d+\]$/, '') ?? '' })}{' '}
          {found.remote.kdf && t('It is end-to-end encrypted — you’ll need its passphrase.')}
        </p>
        <Button variant="primary" size="lg" className="mt-6 w-full" onClick={openExisting}>
          {t('Open drive')} <ArrowRight className="size-4" />
        </Button>
        <Button variant="ghost" className="mt-2 w-full" onClick={() => setFound(null)}>
          {t('Use a different webhook')}
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit}>
      <div className="mb-6 flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-brand-500">
          <Webhook className="size-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold">{t('Webhook URL')}</h2>
          <p className="text-sm text-muted">{t('Paste the URL you copied from Discord')}</p>
        </div>
      </div>
      <div className="relative">
        <Input
          autoFocus
          type={show ? 'text' : 'password'}
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            setError(null)
          }}
          placeholder="https://discord.com/api/webhooks/…"
          className={cn('h-12 pr-20 font-mono text-xs', error && 'border-red-500')}
          autoComplete="off"
          spellCheck={false}
        />
        <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
          {valid && <Check className="size-4 text-emerald-500" />}
          <button type="button" onClick={() => setShow(!show)} className="grid size-8 place-items-center rounded-lg text-subtle hover:bg-surface-2" aria-label={t('Toggle visibility')}>
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-sm font-medium text-red-500">{error}</p>}
      <Button variant="primary" size="lg" className="mt-5 w-full" loading={busy} disabled={!url}>
        {t('Continue')} <ArrowRight className="size-4" />
      </Button>
    </form>
  )
}

function strength(p: string) {
  let s = 0
  if (p.length >= 8) s++
  if (p.length >= 14) s++
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++
  return s
}

function CreateStep({ url, info, onBack }: { url: string; info: WebhookInfo; onBack: () => void }) {
  const [name, setName] = useState(info.name && info.name !== 'Spidey Bot' && info.name !== 'Captain Hook' ? info.name : t('My Drive'))
  const [encrypt, setEncrypt] = useState(false)
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [remember, setRemember] = useState(true)
  const [legacy, setLegacy] = useState<{ count: number; tree: Awaited<ReturnType<typeof fetchLegacyTree>> } | null>(null)
  const [importLegacy, setImportLegacy] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const upsert = useDrives((s) => s.upsert)
  const setActive = useDrives((s) => s.setActive)
  const navigate = useNavigate()

  useEffect(() => {
    fetchLegacyTree(url)
      .then((tree) => {
        if (!tree) return
        const count = convertLegacyTree(tree, ROOT_ID).filter((n) => n.type === 'file').length
        if (count) setLegacy({ count, tree })
      })
      .catch(() => {})
  }, [url])

  const score = strength(pass)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (encrypt && pass.length < 8) return setError(t('Use at least 8 characters for the passphrase.'))
    if (encrypt && pass !== pass2) return setError(t('Passphrases don’t match.'))
    setBusy(true)
    try {
      const seed = emptyManifest()
      seed.nodes[ROOT_ID].name = 'My Drive'
      if (legacy?.tree && importLegacy) for (const n of convertLegacyTree(legacy.tree, ROOT_ID)) seed.nodes[n.id] = n
      let enc: { key: CryptoKey; kdf: ReturnType<typeof newKdfParams> } | undefined
      if (encrypt) {
        const kdf = newKdfParams()
        enc = { key: await deriveKey(pass, kdf), kdf }
      }
      const { session, manifest } = await DriveSession.create(url, { enc, seed, driveName: name })
      const profile = {
        id: session.client.id,
        name: name.trim() || t('My Drive'),
        webhookUrl: canonicalWebhookUrl(url),
        encrypted: encrypt,
        avatar: webhookAvatarUrl(info),
        addedAt: Date.now(),
        lastOpenedAt: Date.now(),
      }
      if (enc && remember) await idb.set(`key:${profile.id}`, await exportKey(enc.key))
      upsert(profile)
      setActive(profile.id)
      useDrive.setState({ status: 'ready', profile, info, session, manifest, access: { rootId: ROOT_ID, perm: 'owner' }, pending: null, error: null, saveState: 'saved' })
      navigate('/drive')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Back
      </button>
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2/60 p-3">
        {webhookAvatarUrl(info) ? (
          <img src={webhookAvatarUrl(info)!} alt="" className="size-10 rounded-xl" />
        ) : (
          <div className="grid size-10 place-items-center rounded-xl bg-[#5865F2] text-white">
            <Webhook className="size-5" />
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">{info.name}</div>
          <div className="text-xs text-emerald-600 dark:text-emerald-400">{t('✓ Webhook verified · new drive')}</div>
        </div>
      </div>

      <div>
        <Label>{t('Drive name')}</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
      </div>

      <div className={cn('rounded-2xl border-2 p-4 transition', encrypt ? 'border-brand-500/60 bg-accent-soft' : 'border-line')}>
        <label className="flex cursor-pointer items-center gap-3">
          <LockKeyhole className={cn('size-5', encrypt ? 'text-brand-500' : 'text-subtle')} />
          <div className="flex-1">
            <div className="text-sm font-bold">{t('End-to-end encryption')}</div>
            <div className="text-xs text-muted">{t('AES-256-GCM in your browser. Not even Discord can read your files.')}</div>
          </div>
          <Switch checked={encrypt} onCheckedChange={setEncrypt} />
        </label>
        <AnimatePresence>
          {encrypt && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="space-y-3 pt-4">
                <Input type="password" icon={<KeyRound />} placeholder={t('Passphrase')} value={pass} onChange={(e) => setPass(e.target.value)} />
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={cn('h-1 flex-1 rounded-full', i < score ? (score <= 1 ? 'bg-red-500' : score === 2 ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-line')}
                    />
                  ))}
                </div>
                <Input type="password" icon={<KeyRound />} placeholder={t('Confirm passphrase')} value={pass2} onChange={(e) => setPass2(e.target.value)} />
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-brand-500" />
                  {t('Remember on this device')}
                </label>
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{t('⚠ There is no way to recover files if you forget the passphrase.')}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {legacy && (
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-line p-4">
          <History className="size-5 text-brand-500" />
          <div className="flex-1">
            <div className="text-sm font-bold">{t('Import {n} files from Disbox v1', { n: legacy.count })}</div>
            <div className="text-xs text-muted">{t('We found files uploaded with the original Disbox app.')}</div>
          </div>
          <Switch checked={importLegacy} onCheckedChange={setImportLegacy} />
        </label>
      )}

      {error && <p className="text-sm font-medium text-red-500">{error}</p>}
      <Button variant="primary" size="lg" className="w-full" loading={busy}>
        {t('Create drive')} <Sparkles className="size-4" />
      </Button>
    </form>
  )
}
