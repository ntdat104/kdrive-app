import { KeyRound, LockKeyhole, RefreshCw, TriangleAlert, Unplug } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import { WrongPassphraseError } from '../../lib/manifest'
import { cn, errorMessage } from '../../lib/utils'
import { useDrive } from '../../store/drive'
import { useDrives } from '../../store/drives'
import { useUI } from '../../store/ui'
import { CommandPalette } from '../CommandPalette'
import { Dialogs } from '../dialogs/Dialogs'
import { PreviewModal } from '../preview/PreviewModal'
import { TransferPanel } from '../TransferPanel'
import { Logo } from '../Logo'
import { Button, Input } from '../ui/primitives'
import { FullScreenLoader } from './FullScreenLoader'
import { GlobalShortcuts } from './GlobalShortcuts'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { UploadInputs } from './UploadInputs'
import { t } from '../../i18n'

export function DriveLayout() {
  const profile = useDrives((s) => s.profiles.find((p) => p.id === s.activeId) ?? s.profiles[0] ?? null)
  const setActive = useDrives((s) => s.setActive)
  const status = useDrive((s) => s.status)
  const openDrive = useDrive((s) => s.open)
  const loadedId = useDrive((s) => s.profile?.id)

  useEffect(() => {
    if (!profile) return
    setActive(profile.id)
    if (loadedId !== profile.id) void openDrive(profile)
  }, [profile, loadedId, openDrive, setActive])

  if (!profile) return <Navigate to="/connect" replace />
  if (status === 'locked') return <UnlockScreen name={profile.name} />
  if (status === 'error') return <ErrorScreen />
  if (status !== 'ready') return <FullScreenLoader label={t('Opening {name}…', { name: profile.name })} />
  return <Shell />
}

function Shell() {
  const mobileNavOpen = useUI((s) => s.mobileNavOpen)
  const setMobileNavOpen = useUI((s) => s.setMobileNavOpen)
  const location = useLocation()

  useEffect(() => setMobileNavOpen(false), [location.pathname, setMobileNavOpen])

  return (
    <div className="flex h-full overflow-hidden">
      <aside className="hidden w-[272px] shrink-0 border-r border-line bg-surface/60 lg:block">
        <Sidebar />
      </aside>
      <AnimatePresence>
        {mobileNavOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-stone-950/40 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileNavOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-[284px] border-r border-line bg-surface shadow-2xl lg:hidden"
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', bounce: 0.1, duration: 0.4 }}
            >
              <Sidebar />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="relative min-h-0 flex-1">
          <Outlet />
        </main>
      </div>
      <TransferPanel />
      <PreviewModal />
      <CommandPalette />
      <Dialogs />
      <UploadInputs />
      <GlobalShortcuts />
    </div>
  )
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-full grid-cols-[minmax(0,1fr)] place-items-center overflow-hidden bg-bg p-4">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-brand-500/20 blur-[120px]" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md rounded-3xl border border-line bg-surface/90 p-8 shadow-2xl backdrop-blur-xl"
      >
        {children}
      </motion.div>
    </div>
  )
}

function UnlockScreen({ name }: { name: string }) {
  const unlock = useDrive((s) => s.unlock)
  const [passphrase, setPassphrase] = useState('')
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(0)
  const navigate = useNavigate()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await unlock(passphrase, remember)
    } catch (err) {
      setError(err instanceof WrongPassphraseError ? t('That passphrase is not correct.') : errorMessage(err))
      setShake((s) => s + 1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <CenteredCard>
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="relative mb-4">
          <Logo className="size-14" />
          <span className="absolute -right-2 -bottom-2 grid size-7 place-items-center rounded-full border-2 border-surface bg-stone-900 text-white dark:bg-white dark:text-stone-900">
            <LockKeyhole className="size-3.5" />
          </span>
        </div>
        <h1 className="text-xl font-bold tracking-tight">{t('Unlock “{name}”', { name })}</h1>
        <p className="mt-1 text-sm text-muted">{t('This drive is end-to-end encrypted. Enter its passphrase to decrypt it in your browser.')}</p>
      </div>
      <motion.form key={shake} animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : {}} transition={{ duration: 0.4 }} onSubmit={submit} className="space-y-4">
        <Input
          type="password"
          autoFocus
          placeholder={t('Passphrase')}
          icon={<KeyRound />}
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          className={cn(error && 'border-red-500 focus:border-red-500 focus:ring-red-500/15')}
        />
        {error && <p className="text-sm font-medium text-red-500">{error}</p>}
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 accent-brand-500" />
          {t('Remember on this device')}
        </label>
        <Button variant="primary" size="lg" className="w-full" loading={busy} disabled={!passphrase}>
          {t('Unlock drive')}
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={() => navigate('/connect')}>
          {t('Use another drive')}
        </Button>
      </motion.form>
    </CenteredCard>
  )
}

function ErrorScreen() {
  const error = useDrive((s) => s.error)
  const profile = useDrive((s) => s.profile)
  const open = useDrive((s) => s.open)
  const close = useDrive((s) => s.close)
  const remove = useDrives((s) => s.remove)
  const navigate = useNavigate()
  return (
    <CenteredCard>
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-red-500/10 text-red-500">
          <TriangleAlert className="size-7" />
        </div>
        <h1 className="text-xl font-bold tracking-tight">{t('Couldn’t open this drive')}</h1>
        <p className="mt-2 text-sm break-words text-muted">{error}</p>
      </div>
      <div className="mt-6 grid gap-2">
        <Button
          variant="primary"
          onClick={() => {
            if (!profile) return
            close()
            void open(profile)
          }}
        >
          <RefreshCw className="size-4" /> {t('Try again')}
        </Button>
        <Button
          variant="ghost"
          className="h-auto min-h-10 py-2 whitespace-normal"
          onClick={() => {
            if (profile) remove(profile.id)
            close()
            navigate('/connect')
          }}
        >
          <Unplug className="size-4" /> {t('Disconnect and use another webhook')}
        </Button>
      </div>
    </CenteredCard>
  )
}
