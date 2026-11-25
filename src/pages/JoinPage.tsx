import { Eye, FolderOpen, HardDrive, LinkIcon, LockKeyhole, PencilLine, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Button, Spinner } from '../components/ui/primitives'
import { importKey } from '../lib/crypto'
import { canonicalWebhookUrl, webhookAvatarUrl, type WebhookInfo } from '../lib/discord'
import { DriveSession } from '../lib/drive'
import { idb } from '../lib/idb'
import { ROOT_ID, type ShareGrant } from '../lib/manifest'
import { decodeInvite } from '../lib/share'
import { errorMessage } from '../lib/utils'
import { useDrive } from '../store/drive'
import { useDrives } from '../store/drives'
import { Shell } from './SharePage'
import { t } from '../i18n'

type Check =
  | { state: 'checking' }
  | { state: 'error'; message: string }
  /** `grant` is unknown when the drive is encrypted and the link has no key: it is checked after unlocking. */
  | { state: 'ready'; info: WebhookInfo; encrypted: boolean; grant: ShareGrant | null }

/** Landing page for folder/drive invite links: checks the grant, then adds the drive to this browser. */
export default function JoinPage() {
  const { hash } = useLocation()
  const invite = useMemo(() => decodeInvite(hash), [hash])
  const [check, setCheck] = useState<Check>({ state: 'checking' })
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (invite) document.title = `${invite.n} · Kdrive`
  }, [invite])

  useEffect(() => {
    if (!invite) return
    setCheck({ state: 'checking' })
    const controller = new AbortController()
    ;(async () => {
      const { info, remote } = await DriveSession.inspect(invite.w, controller.signal)
      if (!remote) throw new Error(t('No Kdrive manifest was found for this webhook. It may have been deleted or the webhook renamed.'))
      const encrypted = Boolean(remote.kdf)
      if (encrypted && !invite.k) return setCheck({ state: 'ready', info, encrypted, grant: null })
      const { manifest } = await DriveSession.unlock(invite.w, remote, invite.k ? await importKey(invite.k) : undefined)
      const grant = manifest.shares?.[invite.g]
      if (!grant || !manifest.nodes[grant.folderId]) throw new Error(t('This share link was revoked or the shared folder no longer exists. Ask the owner for a new link.'))
      setCheck({ state: 'ready', info, encrypted, grant })
    })().catch((err) => {
      if (!controller.signal.aborted) setCheck({ state: 'error', message: errorMessage(err) })
    })
    return () => controller.abort()
  }, [invite])

  if (!invite) {
    return (
      <Shell>
        <div className="text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-surface-2 text-subtle">
            <LinkIcon className="size-8" />
          </div>
          <h1 className="mt-4 text-xl font-bold">{t('Invalid share link')}</h1>
          <p className="mt-1 text-sm text-muted">{t('This link is incomplete or corrupted.')}</p>
        </div>
      </Shell>
    )
  }

  const open = async () => {
    if (check.state !== 'ready') return
    setBusy(true)
    try {
      const drives = useDrives.getState()
      // The owner opening their own link just jumps to the folder.
      const own = drives.profiles.find((p) => p.id === check.info.id)
      const id = own ? own.id : `${check.info.id}:${invite.g}`
      if (!own) {
        drives.upsert({
          id,
          name: invite.n,
          webhookUrl: canonicalWebhookUrl(invite.w),
          encrypted: check.encrypted,
          avatar: webhookAvatarUrl(check.info),
          addedAt: Date.now(),
          shareId: invite.g,
        })
        if (invite.k) await idb.set(`key:${id}`, invite.k)
      }
      useDrive.getState().close()
      drives.setActive(id)
      const folderId = own && check.grant && check.grant.folderId !== ROOT_ID ? check.grant.folderId : null
      navigate(folderId ? `/drive/f/${folderId}` : '/drive')
    } finally {
      setBusy(false)
    }
  }

  const isDrive = check.state === 'ready' && check.grant?.folderId === ROOT_ID
  const perm = check.state === 'ready' ? check.grant?.perm : undefined

  return (
    <Shell>
      <div className="flex items-center gap-4">
        <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-accent-fg shadow-lg shadow-brand-500/30">
          {isDrive ? <HardDrive className="size-8" /> : <FolderOpen className="size-8" />}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-wider text-subtle uppercase">{isDrive ? t('Shared drive') : t('Shared folder')}</p>
          <h1 className="line-clamp-2 text-xl font-bold [overflow-wrap:anywhere]" title={invite.n}>
            {invite.n}
          </h1>
        </div>
      </div>

      {check.state === 'checking' && (
        <div className="mt-6 flex items-center gap-3 text-sm text-muted">
          <Spinner /> {t('Checking the link…')}
        </div>
      )}

      {check.state === 'error' && (
        <p className="mt-6 flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {check.message}
        </p>
      )}

      {check.state === 'ready' && (
        <>
          <div className="mt-6 space-y-2">
            {perm && (
              <div className="flex items-start gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
                {perm === 'edit' ? <PencilLine className="mt-0.5 size-4 shrink-0 text-brand-500" /> : <Eye className="mt-0.5 size-4 shrink-0 text-brand-500" />}
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{perm === 'edit' ? t('Editor') : t('Viewer')}</div>
                  <div className="text-xs text-muted">{perm === 'edit' ? t('You can upload, rename, move and delete items.') : t('You can browse, preview and download.')}</div>
                </div>
              </div>
            )}
            {check.encrypted && !invite.k && (
              <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300">
                <LockKeyhole className="mt-0.5 size-4 shrink-0" />
                {t('This drive is end-to-end encrypted. Ask the owner for its passphrase — you will enter it next.')}
              </div>
            )}
          </div>
          <Button variant="primary" size="lg" className="mt-6 w-full" loading={busy} onClick={open}>
            <FolderOpen className="size-5" /> {t('Open in Kdrive')}
          </Button>
          <p className="mt-4 text-center text-xs text-subtle">{t('The drive is added to this browser only. You can remove it later from the drive switcher.')}</p>
        </>
      )}
    </Shell>
  )
}
