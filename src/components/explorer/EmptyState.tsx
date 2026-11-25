import { Clock, FolderOpen, FolderPlus, SearchX, Star, Trash2, Upload } from 'lucide-react'
import { motion } from 'motion/react'
import { ROOT_ID } from '../../lib/manifest'
import { useCanEdit } from '../../store/drive'
import { useUI } from '../../store/ui'
import { pickFiles } from '../layout/UploadInputs'
import { Button, Kbd } from '../ui/primitives'
import type { ExplorerView } from './useItems'
import { t } from '../../i18n'

export function EmptyState({ view, folderId, query }: { view: ExplorerView; folderId: string; query: string }) {
  const openDialog = useUI((s) => s.openDialog)
  const canEdit = useCanEdit()

  if (view === 'folder' && !canEdit) {
    return (
      <Wrapper>
        <div className="mb-5 grid size-20 place-items-center rounded-3xl bg-surface-2 text-subtle">
          <FolderOpen className="size-9" strokeWidth={1.6} />
        </div>
        <h2 className="text-lg font-bold">{t('This folder is empty')}</h2>
        <p className="mt-1.5 max-w-sm text-sm text-muted">{t('You have view-only access, so you can’t add files here.')}</p>
      </Wrapper>
    )
  }

  if (view === 'folder') {
    return (
      <Wrapper>
        <div className="relative mb-6">
          <div className="absolute inset-0 rounded-full bg-brand-500/25 blur-3xl" />
          <div className="relative grid size-28 animate-float place-items-center rounded-[2rem] border border-brand-500/20 bg-gradient-to-br from-brand-100 to-brand-200 shadow-xl shadow-brand-500/20 dark:from-brand-500/20 dark:to-brand-700/20">
            <Upload className="size-12 text-brand-700 dark:text-brand-400" strokeWidth={1.6} />
          </div>
        </div>
        <h2 className="text-xl font-extrabold tracking-tight">{folderId === ROOT_ID ? t('Your drive is ready') : t('This folder is empty')}</h2>
        <p className="mt-2 max-w-sm text-sm text-muted">{t('Drag & drop files or whole folders anywhere here, or use the buttons below. Any file type, any size.')}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={() => pickFiles(folderId)}>
            <Upload className="size-4" /> {t('Upload files')}
          </Button>
          <Button variant="outline" onClick={() => openDialog({ type: 'newFolder', parentId: folderId })}>
            <FolderPlus className="size-4" /> {t('New folder')}
          </Button>
        </div>
        <p className="mt-6 flex items-center gap-1.5 text-xs text-subtle">
          {t('Tip: press')} <Kbd>U</Kbd> {t('to upload,')} <Kbd>⇧</Kbd>
          <Kbd>N</Kbd> {t('for a new folder')}
        </p>
      </Wrapper>
    )
  }

  const meta = {
    recent: { icon: Clock, title: t('Nothing here yet'), text: t('Files you upload or open will show up here.') },
    starred: { icon: Star, title: t('No starred items'), text: t('Star files and folders to find them quickly. Select an item and press S.') },
    trash: { icon: Trash2, title: t('Trash is empty'), text: t('Items you delete stay here until you remove them forever.') },
    search: {
      icon: SearchX,
      title: query ? t('No results for “{query}”', { query }) : t('Search your drive'),
      text: t('Try filters like type:image, type:video, ext:pdf, is:starred, size>100mb'),
    },
  }[view]
  const Icon = meta.icon
  return (
    <Wrapper>
      <div className="mb-5 grid size-20 place-items-center rounded-3xl bg-surface-2 text-subtle">
        <Icon className="size-9" strokeWidth={1.6} />
      </div>
      <h2 className="text-lg font-bold">{meta.title}</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted">{meta.text}</p>
    </Wrapper>
  )
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex min-h-[60vh] flex-col items-center justify-center py-12 text-center"
    >
      {children}
    </motion.div>
  )
}
