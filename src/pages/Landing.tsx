import {
  ArrowRight,
  Eye,
  FolderTree,
  Infinity as InfinityIcon,
  Link2,
  LinkIcon,
  LockKeyhole,
  Moon,
  MousePointerClick,
  ServerOff,
  Smartphone,
  Sun,
  Zap,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link } from 'react-router'
// The README screenshots double as the landing page gallery, so both stay in sync.
import shotDrive from '../../docs/screenshots/drive.png'
import shotDriveLight from '../../docs/screenshots/drive-list-light.png'
import shotJoin from '../../docs/screenshots/join.png'
import shotMobileDrive from '../../docs/screenshots/mobile-drive.png'
import shotMobileShare from '../../docs/screenshots/mobile-share.png'
import shotShareDrive from '../../docs/screenshots/share-drive.png'
import shotShareFolder from '../../docs/screenshots/share-folder.png'
import shotViewer from '../../docs/screenshots/shared-viewer.png'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { Wordmark } from '../components/Logo'
import type { MessageKey } from '../i18n'
import { Button } from '../components/ui/primitives'
import { resolvedTheme, useSettings } from '../store/settings'
import { useOpenLink } from '../platform/links'
import { t } from '../i18n'

const FEATURES: { icon: typeof Eye; title: MessageKey; text: MessageKey }[] = [
  { icon: InfinityIcon, title: 'Unlimited storage', text: 'Files are split into chunks and stored as Discord attachments. No quotas, any file size.' },
  { icon: LockKeyhole, title: 'End-to-end encryption', text: 'Optional AES-256-GCM encryption in your browser. Only your passphrase can unlock it.' },
  { icon: Eye, title: 'Preview everything', text: 'Images, video, audio, PDF, code, Markdown and fonts — right in the browser, with a gallery.' },
  { icon: FolderTree, title: 'A real file manager', text: 'Folders, drag & drop, move, rename, star, trash & restore, multi-select and keyboard shortcuts.' },
  { icon: Link2, title: 'Share files, folders & drives', text: 'Public download links for files, plus invite links to a folder or the whole drive with view or edit access.' },
  { icon: ServerOff, title: 'No backend', text: 'Your folder index lives in your own Discord channel. Nothing to sign up for, nothing to leak.' },
]

const GALLERY: { src: string; title: MessageKey; text: MessageKey }[] = [
  { src: shotShareFolder, title: 'Share a folder', text: 'One link per person or group, each with its own access: view or edit.' },
  { src: shotShareDrive, title: 'Share the whole drive', text: 'Open the entire drive to your team from the drive switcher, the toolbar or ⌘K.' },
  { src: shotJoin, title: 'Open an invite', text: 'Invitees see the folder and their access level before anything is added.' },
  { src: shotViewer, title: 'View-only access', text: 'Viewers only see the shared folder, and every editing action is hidden.' },
]

export default function Landing() {
  const theme = useSettings((s) => s.theme)
  const set = useSettings((s) => s.set)
  const dark = resolvedTheme(theme) === 'dark'

  return (
    <div className="relative min-h-full overflow-x-hidden bg-bg">
      <div className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-[900px] opacity-50 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className="pointer-events-none absolute -top-60 left-1/2 h-[700px] w-[1100px] -translate-x-1/2 rounded-full bg-gradient-to-b from-brand-500/30 via-brand-300/10 to-transparent blur-[100px]" />

      <header className="relative mx-auto flex h-20 max-w-6xl items-center justify-between px-6">
        <Wordmark />
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => useOpenLink.getState().setOpen(true)} aria-label={t('Open a Kdrive link…')}>
            <LinkIcon className="size-5" />
          </Button>
          <LanguageSwitcher />
          <Button variant="ghost" size="icon" onClick={() => set({ theme: dark ? 'light' : 'dark' })} aria-label={t('Toggle dark mode')}>
            {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </Button>
          <Link to="/connect">
            <Button variant="primary">{t('Open Kdrive')}</Button>
          </Link>
        </div>
      </header>

      <section className="relative mx-auto max-w-6xl px-6 pt-16 pb-24 text-center sm:pt-24">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-surface/80 px-4 py-1.5 text-xs font-bold text-brand-700 shadow-sm backdrop-blur dark:text-brand-300">
            <Zap className="size-3.5 fill-current" /> {t('Kdrive — your Discord-powered cloud')}
          </span>
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mx-auto mt-6 max-w-4xl text-5xl leading-[1.05] font-extrabold tracking-tight sm:text-7xl"
        >
          {t('Your cloud drive,')}
          <br />
          <span className="bg-gradient-to-r from-brand-500 via-brand-600 to-brand-700 bg-clip-text text-transparent dark:from-brand-300 dark:via-brand-500 dark:to-brand-400">{t('powered by Discord.')}</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mx-auto mt-6 max-w-2xl text-lg text-muted sm:text-xl"
        >
          {t('Upload anything, preview everything, organize it all. Unlimited, private, and free — your files live in your own Discord server.')}
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-10 flex flex-wrap justify-center gap-3">
          <Link to="/connect">
            <Button variant="primary" size="lg" className="h-14 rounded-2xl px-8 text-base">
              {t('Get started — it’s free')} <ArrowRight className="size-5" />
            </Button>
          </Link>
          <a href="#features">
            <Button variant="outline" size="lg" className="h-14 rounded-2xl px-8 text-base">
              {t('See features')}
            </Button>
          </a>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, type: 'spring', bounce: 0.2 }} className="relative mx-auto mt-20 max-w-5xl">
          <div className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-b from-brand-500/30 to-transparent blur-2xl" />
          <AppShot dark={dark} />
        </motion.div>
      </section>

      <section id="features" className="relative mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-extrabold tracking-tight sm:text-4xl">{t('Everything a drive should do')}</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-muted">{t('Built with React, TypeScript and Tailwind — fast, keyboard-friendly, and beautiful in light and dark.')}</p>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="group rounded-3xl border border-line bg-surface p-6 transition hover:-translate-y-1 hover:border-brand-500/40 hover:shadow-xl hover:shadow-brand-500/5"
            >
              <div className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-accent-fg shadow-lg shadow-brand-500/30 transition group-hover:scale-110">
                <f.icon className="size-6" />
              </div>
              <h3 className="mt-5 text-lg font-bold">{t(f.title)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{t(f.text)}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <Gallery />
      <MobileShowcase />

      <section className="relative mx-auto max-w-6xl px-6 py-20">
        <div className="overflow-hidden rounded-[2rem] relative bg-[#181a20] p-10 text-[#eaecef] shadow-2xl shadow-stone-950/30 ring-1 ring-white/5 sm:p-14">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                <span className="text-brand-300">{t('How it works')}</span>
              </h2>
              <p className="mt-3 text-[#b7bdc6]">{t('A Discord webhook is all Kdrive needs. Files are chunked to fit Discord’s upload limit and the folder index is a compressed manifest stored in the same channel.')}</p>
              <Link to="/connect">
                <Button variant="primary" className="mt-8 h-12 rounded-2xl px-6">
                  {t('Connect a webhook')} <ArrowRight className="size-4" />
                </Button>
              </Link>
            </div>
            <ol className="space-y-4">
              {[
                [t('Create a webhook'), t('In any channel of a private Discord server.')],
                [t('Paste the URL'), t('Optionally set a passphrase for end-to-end encryption.')],
                [t('Drop your files'), t('Kdrive splits, uploads, indexes and previews them for you.')],
              ].map(([title, d], i) => (
                <li key={title} className="flex gap-4 rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500 text-sm font-extrabold text-accent-fg">{i + 1}</span>
                  <div>
                    <div className="font-bold">{title}</div>
                    <div className="text-sm text-[#848e9c]">{d}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-10 text-sm text-subtle">
        <Wordmark className="opacity-80" />
        <p className="flex items-center gap-1.5">
          <MousePointerClick className="size-4" /> {t('Not affiliated with Discord. Use responsibly and respect Discord’s Terms of Service.')}
        </p>
      </footer>
    </div>
  )
}

/** Window chrome around a real screenshot; follows the page theme. */
function AppShot({ dark }: { dark: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-[1.25rem] border border-line bg-surface text-left shadow-2xl sm:rounded-[2rem]">
      <div className="flex h-9 items-center gap-2 border-b border-line bg-surface-2/60 px-4 sm:h-11">
        <span className="size-2.5 rounded-full bg-red-400 sm:size-3" />
        <span className="size-2.5 rounded-full bg-amber-400 sm:size-3" />
        <span className="size-2.5 rounded-full bg-emerald-400 sm:size-3" />
        <div className="mx-auto h-5 w-40 rounded-lg bg-line/60 sm:h-6 sm:w-60" />
      </div>
      <img
        src={dark ? shotDrive : shotDriveLight}
        alt={t('Kdrive file manager')}
        width={1440}
        height={900}
        className="block h-auto w-full"
        fetchPriority="high"
      />
    </div>
  )
}

/** Screenshots of the sharing flow, one at a time with tabs. */
function Gallery() {
  const [active, setActive] = useState(0)
  const shot = GALLERY[active]
  return (
    <section className="relative mx-auto max-w-6xl px-6 py-20">
      <h2 className="text-center text-3xl font-extrabold tracking-tight sm:text-4xl">{t('Share with your team')}</h2>
      <p className="mx-auto mt-3 max-w-xl text-center text-muted">{t('Invite links open a folder or the whole drive inside Kdrive. You decide who can view and who can edit.')}</p>
      <div className="mt-10 grid grid-cols-2 gap-2 lg:grid-cols-4" role="tablist">
        {GALLERY.map((g, i) => (
          <button
            key={g.title}
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={`focus-ring rounded-2xl border p-3 text-left transition sm:p-4 ${
              i === active ? 'border-brand-500/60 bg-accent-soft shadow-lg shadow-brand-500/10' : 'border-line bg-surface hover:border-line-strong'
            }`}
          >
            <div className={`text-sm font-bold ${i === active ? 'text-brand-800 dark:text-brand-300' : ''}`}>{t(g.title)}</div>
            {/* Phones show only the titles here; the active description sits under the screenshot. */}
            <div className="mt-1 hidden text-xs leading-relaxed text-muted sm:block">{t(g.text)}</div>
          </button>
        ))}
      </div>
      <motion.div
        key={shot.src}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="relative mt-6 overflow-hidden rounded-[1.25rem] border border-line shadow-2xl sm:rounded-[2rem]"
      >
        <img src={shot.src} alt={t(shot.title)} width={1440} height={900} loading="lazy" className="block h-auto w-full" />
      </motion.div>
      <p className="mt-3 text-center text-sm text-muted sm:hidden">{t(shot.text)}</p>
    </section>
  )
}

function MobileShowcase() {
  return (
    <section className="relative mx-auto max-w-6xl px-6 py-20">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_auto]">
        <div className="text-center lg:text-left">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-accent-fg shadow-lg shadow-brand-500/30 lg:mx-0">
            <Smartphone className="size-6" />
          </div>
          <h2 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl">{t('Made for your phone too')}</h2>
          <p className="mx-auto mt-3 max-w-md text-muted lg:mx-0">{t('Upload from your camera roll, browse, preview and share — the whole drive works on small screens.')}</p>
        </div>
        <div className="flex justify-center gap-4 sm:gap-6">
          {[shotMobileDrive, shotMobileShare].map((src, i) => (
            <motion.div
              key={src}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={`w-36 overflow-hidden rounded-[1.75rem] border-[5px] border-stone-800 bg-stone-900 shadow-2xl sm:w-56 sm:rounded-[2.25rem] sm:border-[7px] ${i === 1 ? 'mt-10' : ''}`}
            >
              <img src={src} alt="" width={780} height={1688} loading="lazy" className="block h-auto w-full" />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
