import { canonicalWebhookUrl } from './discord'
import { mimeFromName } from './filetypes'
import type { ChunkRef, DriveNode } from './manifest'
import { sha256Hex, uid } from './utils'

/** Read-only importer for the original Disbox metadata server. */

const LEGACY_SERVER = 'https://disbox-server.fly.dev'
const LEGACY_CHUNK = 25 * 1024 * 1023

interface LegacyNode {
  id: number
  name: string
  type: 'file' | 'directory'
  size?: number
  content?: string | null
  created_at?: string
  updated_at?: string
  children?: Record<string, LegacyNode>
}

export async function fetchLegacyTree(webhookUrl: string): Promise<LegacyNode | null> {
  const canonical = canonicalWebhookUrl(webhookUrl)
  let best: LegacyNode | null = null
  // The legacy client hashed whichever hostname the user pasted.
  for (const host of ['discord.com', 'discordapp.com']) {
    const url = canonical.replace('discord.com', host)
    const res = await fetch(`${LEGACY_SERVER}/files/get/${await sha256Hex(url)}`)
    if (res.status !== 200) continue
    const tree = (await res.json()) as LegacyNode
    if (!best || Object.keys(tree.children ?? {}).length > Object.keys(best.children ?? {}).length) best = tree
  }
  return best && Object.keys(best.children ?? {}).length ? best : null
}

function chunkSizes(total: number, count: number) {
  return Array.from({ length: count }, (_, i) => (i < count - 1 ? LEGACY_CHUNK : total - LEGACY_CHUNK * (count - 1)))
}

/** Converts the legacy tree into Kdrive nodes placed under `parentId`. */
export function convertLegacyTree(tree: LegacyNode, parentId: string) {
  const nodes: DriveNode[] = []
  const walk = (children: Record<string, LegacyNode>, parent: string) => {
    for (const child of Object.values(children)) {
      const created = child.created_at ? Date.parse(child.created_at) : Date.now()
      const updated = child.updated_at ? Date.parse(child.updated_at) : created
      const id = uid()
      if (child.type === 'directory') {
        nodes.push({ id, parentId: parent, name: child.name, type: 'folder', size: 0, createdAt: created, updatedAt: updated, legacy: true })
        walk(child.children ?? {}, id)
        continue
      }
      let ids: string[] = []
      try {
        ids = child.content ? (JSON.parse(child.content) as (string | number)[]).map(String) : []
      } catch {
        ids = []
      }
      const size = child.size ?? 0
      const sizes = chunkSizes(size, ids.length)
      const chunks: ChunkRef[] = ids.map((m, i) => ({ m, s: sizes[i] }))
      nodes.push({
        id,
        parentId: parent,
        name: child.name,
        type: 'file',
        size,
        mime: mimeFromName(child.name),
        chunks,
        createdAt: created,
        updatedAt: updated,
        legacy: true,
      })
    }
  }
  walk(tree.children ?? {}, parentId)
  return nodes
}
