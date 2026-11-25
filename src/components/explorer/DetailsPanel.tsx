import { Check, Download, Eye, Layers, Link2, Lock, Pencil, Star, Users, X } from 'lucide-react'
import { useMemo } from 'react'
import * as actions from '../../actions'
import { KIND_LABEL, previewMode } from '../../lib/filetypes'
import { FOLDER_COLORS } from '../../lib/folderColors'
import { displayName, folderSize, pathString, type DriveNode } from '../../lib/manifest'
import { cn, formatDateTime, formatSize } from '../../lib/utils'
import { useAccess, useDrive, useNodes } from '../../store/drive'
import { useSettings } from '../../store/settings'
import { useUI } from '../../store/ui'
import { FileTile, nodeKind } from '../FileIcon'
import { Button } from '../ui/primitives'
import { t } from '../../i18n'

export function DetailsPanel({ folderId }: { folderId: string | null }) {
  const nodes = useNodes()
  const selection = useUI((s) => s.selection)
  const selected = [...selection].map((id) => nodes[id]).filter(Boolean)
  const close = () => useSettings.getState().set({ showDetails: false })

  let content: React.ReactNode
  if (selected.length === 1) content = <NodeDetails node={selected[0]} />
  else if (selected.length > 1) content = <MultiDetails nodes={selected} />
  else if (folderId && nodes[folderId]) content = <NodeDetails node={nodes[folderId]} />
  else
    content = (
      <div className="grid h-64 place-items-center px-8 text-center text-sm text-subtle">{t('Select a file or folder to see its details.')}</div>
    )

  return (
    <div className="flex h-full w-[340px] max-w-full flex-col">
      <div className="flex h-14 items-center justify-between border-b border-line px-5">
        <span className="text-sm font-bold">{t('Details')}</span>
        <Button variant="ghost" size="icon-sm" onClick={close} aria-label={t('Close details')}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{content}</div>
    </div>
  )
}

function FolderColorSwatches({ node }: { node: DriveNode }) {
  const accent = useSettings((s) => s.accent)
  const current = node.color ?? accent
  return (
    <div className="grid max-w-56 grid-cols-7 gap-1.5">
      {FOLDER_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          title={t(c.label)}
          aria-label={t(c.label)}
          aria-pressed={current === c.value}
          className="focus-ring grid aspect-square w-full place-items-center rounded-full transition hover:scale-110"
          style={{ backgroundColor: c.swatch, color: c.on }}
          onClick={() => actions.setFolderColor([node.id], c.value)}
        >
          {current === c.value && <Check className="size-3.5" strokeWidth={3} />}
        </button>
      ))}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3 py-2 text-[13px]">
      <dt className="text-subtle">{label}</dt>
      <dd className="min-w-0 font-medium break-words">{children}</dd>
    </div>
  )
}

function NodeDetails({ node }: { node: DriveNode }) {
  const nodes = useNodes()
  const kind = nodeKind(node)
  const stats = useMemo(() => (node.type === 'folder' ? folderSize(nodes, node.id) : null), [nodes, node])
  const canPreview = node.type === 'file' && previewMode(node.name, node.mime, node.size)
  const openDialog = useUI((s) => s.openDialog)
  const { rootId, perm } = useAccess()
  const writable = perm !== 'view' && node.id !== rootId
  const links = useDrive((s) => Object.values(s.manifest?.shares ?? {}).filter((g) => g.folderId === node.id).length)

  return (
    <div className="p-5">
      <div className={cn('group overflow-hidden rounded-2xl border border-line', node.thumb || kind === 'video' ? 'aspect-video bg-surface-2' : 'h-40 bg-surface-2/60')}>
        <FileTile node={node} />
      </div>
      <h2 className="mt-4 text-base font-bold break-words">{displayName(node)}</h2>
      <p className="mt-0.5 text-xs text-subtle">{t(KIND_LABEL[kind])}</p>

      {!node.trashedAt && node.parentId !== null && node.id !== rootId && (
        <div className="mt-4 flex flex-wrap gap-2">
          {canPreview && (
            <Button size="sm" variant="primary" onClick={() => actions.openNode(node)}>
              <Eye className="size-4" /> {t('Open')}
            </Button>
          )}
          <Button size="sm" onClick={() => void actions.download([node.id])}>
            <Download className="size-4" />
          </Button>
          {node.type === 'file' && !node.enc && (
            <Button size="sm" onClick={() => openDialog({ type: 'share', id: node.id })}>
              <Link2 className="size-4" />
            </Button>
          )}
          {node.type === 'folder' && perm === 'owner' && (
            <Button size="sm" onClick={() => openDialog({ type: 'shareFolder', id: node.id })}>
              <Users className="size-4" />
            </Button>
          )}
          {writable && (
            <>
              <Button size="sm" onClick={() => openDialog({ type: 'rename', id: node.id })}>
                <Pencil className="size-4" />
              </Button>
              <Button size="sm" onClick={() => actions.toggleStar([node.id])} className={cn(node.starred && 'text-amber-500')}>
                <Star className="size-4" fill={node.starred ? 'currentColor' : 'none'} />
              </Button>
            </>
          )}
        </div>
      )}

      <dl className="mt-5 divide-y divide-line border-t border-line">
        {stats ? (
          <>
            {writable && !node.trashedAt && node.parentId !== null && node.id !== rootId && (
              <Row label={t('Color')}>
                <FolderColorSwatches node={node} />
              </Row>
            )}
            <Row label={t('Size')}>{formatSize(stats.size)}</Row>
            <Row label={t('Contents')}>
              {t('{n} files', { n: stats.files })}, {t('{n} folders', { n: stats.folders })}
            </Row>
          </>
        ) : (
          <>
            <Row label={t('Size')}>
              {formatSize(node.size)} <span className="text-subtle">({node.size.toLocaleString()} bytes)</span>
            </Row>
            {node.meta?.w && (
              <Row label={t('Dimensions')}>
                {node.meta.w} × {node.meta.h}
              </Row>
            )}
            {node.meta?.dur !== undefined && <Row label={t('Duration')}>{Math.round(node.meta.dur)}s</Row>}
            <Row label={t('Storage')}>
              <span className="inline-flex items-center gap-1.5">
                <Layers className="size-3.5 text-subtle" />
                {t('{n} Discord messages', { n: node.chunks?.length ?? 0 })}
              </span>
            </Row>
            {node.preview && (
              <Row label={t('Quick preview')}>
                {node.preview.w && `${node.preview.w} × ${node.preview.h} · `}
                {formatSize(node.preview.size)}
              </Row>
            )}
            <Row label={t('Encryption')}>
              {node.enc ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <Lock className="size-3.5" /> AES-256-GCM
                </span>
              ) : (
                t('None')
              )}
            </Row>
          </>
        )}
        {node.parentId !== null && node.id !== rootId && <Row label={t('Location')}>{pathString(nodes, node.parentId, rootId)}</Row>}
        {node.type === 'folder' && perm === 'owner' && !node.trashedAt && (
          <Row label={t('Sharing')}>
            <button className="font-semibold text-brand-700 hover:underline dark:text-brand-400" onClick={() => openDialog({ type: 'shareFolder', id: node.id })}>
              {links ? t('{n} active links', { n: links }) : t('Not shared')}
            </button>
          </Row>
        )}
        <Row label={t('Modified')}>{formatDateTime(node.updatedAt)}</Row>
        <Row label={t('Created')}>{formatDateTime(node.createdAt)}</Row>
        {node.openedAt && <Row label={t('Opened')}>{formatDateTime(node.openedAt)}</Row>}
        {node.trashedAt && <Row label={t('Trashed')}>{formatDateTime(node.trashedAt)}</Row>}
        {node.legacy && <Row label={t('Origin')}>{t('Imported from Disbox v1')}</Row>}
      </dl>
    </div>
  )
}

function MultiDetails({ nodes }: { nodes: DriveNode[] }) {
  const all = useNodes()
  const { size, files, folders } = useMemo(() => {
    let size = 0
    let files = 0
    let folders = 0
    for (const n of nodes) {
      if (n.type === 'file') {
        size += n.size
        files++
      } else {
        folders++
        size += folderSize(all, n.id).size
      }
    }
    return { size, files, folders }
  }, [nodes, all])
  return (
    <div className="p-5">
      <div className="relative h-40">
        {nodes.slice(0, 3).map((n, i) => (
          <div
            key={n.id}
            className="absolute inset-x-6 top-4 h-28 overflow-hidden rounded-2xl border border-line bg-surface-2 shadow-lg"
            style={{ transform: `rotate(${(i - 1) * 6}deg) translateY(${i * 4}px)`, zIndex: 3 - i }}
          >
            <FileTile node={n} />
          </div>
        ))}
      </div>
      <h2 className="mt-2 text-base font-bold">{t('{n} items selected', { n: nodes.length })}</h2>
      <dl className="mt-4 divide-y divide-line border-t border-line">
        <Row label={t('Total size')}>{formatSize(size)}</Row>
        <Row label={t('Files')}>{files}</Row>
        <Row label={t('Folders')}>{folders}</Row>
      </dl>
      <Button className="mt-5 w-full" variant="primary" onClick={() => void actions.download(nodes.map((n) => n.id))}>
        <Download className="size-4" /> {t('Download as ZIP')}
      </Button>
    </div>
  )
}
