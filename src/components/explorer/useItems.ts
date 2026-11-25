import { useMemo } from 'react'
import { extOf } from '../../lib/utils'
import { groupOf, kindOf, type KindGroup } from '../../lib/filetypes'
import { childrenOf, isInTrash, isWithin, ROOT_ID, type DriveNode } from '../../lib/manifest'
import { useDrive, useNodes } from '../../store/drive'
import { useSettings, type SortKey } from '../../store/settings'

export type ExplorerView = 'folder' | 'recent' | 'starred' | 'trash' | 'search'

interface ParsedQuery {
  words: string[]
  type?: KindGroup | string
  ext?: string
  starred?: boolean
  minSize?: number
  maxSize?: number
}

const SIZE_RE = /^size([<>])(\d+(?:\.\d+)?)(kb|mb|gb)?$/i
const UNITS: Record<string, number> = { kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }

export function parseQuery(q: string): ParsedQuery {
  const out: ParsedQuery = { words: [] }
  for (const token of q.toLowerCase().split(/\s+/).filter(Boolean)) {
    const size = token.match(SIZE_RE)
    if (token.startsWith('type:')) out.type = token.slice(5)
    else if (token.startsWith('ext:')) out.ext = token.slice(4).replace(/^\./, '')
    else if (token === 'is:starred') out.starred = true
    else if (size) {
      const bytes = Number(size[2]) * (UNITS[size[3]?.toLowerCase() ?? 'mb'] ?? 1)
      if (size[1] === '>') out.minSize = bytes
      else out.maxSize = bytes
    } else out.words.push(token)
  }
  return out
}

function matches(node: DriveNode, q: ParsedQuery) {
  const name = node.name.toLowerCase()
  if (!q.words.every((w) => name.includes(w))) return false
  if (q.ext && (node.type !== 'file' || extOf(node.name) !== q.ext)) return false
  if (q.starred && !node.starred) return false
  if (q.type) {
    if (q.type === 'folder') return node.type === 'folder'
    if (node.type !== 'file') return false
    const kind = kindOf(node.name, node.mime)
    const group = groupOf(kind)
    const t = q.type.replace(/s$/, '')
    if (kind !== t && group.replace(/s$/, '') !== t) return false
  }
  if (q.minSize !== undefined && node.size <= q.minSize) return false
  if (q.maxSize !== undefined && node.size >= q.maxSize) return false
  return true
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function sortNodes(list: DriveNode[], by: SortKey, dir: 'asc' | 'desc', foldersFirst: boolean) {
  const sign = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    if (foldersFirst && a.type !== b.type) return a.type === 'folder' ? -1 : 1
    let cmp = 0
    if (by === 'size') cmp = a.size - b.size
    else if (by === 'updatedAt') cmp = a.updatedAt - b.updatedAt
    else if (by === 'type') cmp = collator.compare(extOf(a.name), extOf(b.name))
    if (cmp === 0) cmp = collator.compare(a.name, b.name)
    return cmp * sign
  })
}

/** Items to display for a view, already filtered and sorted. */
export function useExplorerItems(view: ExplorerView, folderId: string, query: string) {
  const nodes = useNodes()
  const sortBy = useSettings((s) => s.sortBy)
  const sortDir = useSettings((s) => s.sortDir)
  const foldersFirst = useSettings((s) => s.foldersFirst)
  const rootId = useDrive((s) => s.access.rootId)

  return useMemo(() => {
    // Invitees only see their shared folder; the folder itself is the top, not an item.
    const all = rootId === ROOT_ID ? Object.values(nodes) : Object.values(nodes).filter((n) => n.id !== rootId && isWithin(nodes, n.id, rootId))
    switch (view) {
      case 'folder':
        return sortNodes(childrenOf(nodes, folderId), sortBy, sortDir, foldersFirst)
      case 'recent':
        return all
          .filter((n) => n.type === 'file' && !isInTrash(nodes, n.id))
          .sort((a, b) => Math.max(b.openedAt ?? 0, b.updatedAt) - Math.max(a.openedAt ?? 0, a.updatedAt))
          .slice(0, 100)
      case 'starred':
        return sortNodes(
          all.filter((n) => n.starred && !isInTrash(nodes, n.id)),
          sortBy,
          sortDir,
          foldersFirst,
        )
      case 'trash':
        return all.filter((n) => n.trashedAt).sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0))
      case 'search': {
        const q = parseQuery(query)
        if (!q.words.length && !q.type && !q.ext && !q.starred && q.minSize === undefined && q.maxSize === undefined) return []
        return sortNodes(
          all.filter((n) => n.parentId !== null && matches(n, q) && !isInTrash(nodes, n.id)),
          sortBy,
          sortDir,
          foldersFirst,
        ).slice(0, 500)
      }
    }
  }, [nodes, view, folderId, query, sortBy, sortDir, foldersFirst, rootId])
}
