import type { UploadItem } from '../store/transfers'

/** MIME type used for dragging drive items between folders inside the app. */
export const INTERNAL_DRAG = 'application/x-kdrive-ids'

export function isInternalDrag(e: { dataTransfer: DataTransfer | null }) {
  return Boolean(e.dataTransfer?.types.includes(INTERNAL_DRAG))
}

export function isFileDrag(e: { dataTransfer: DataTransfer | null }) {
  return Boolean(e.dataTransfer?.types.includes('Files')) && !isInternalDrag(e)
}

export function readInternalDrag(e: { dataTransfer: DataTransfer | null }): string[] {
  try {
    return JSON.parse(e.dataTransfer?.getData(INTERNAL_DRAG) || '[]')
  } catch {
    return []
  }
}

function readEntries(reader: FileSystemDirectoryReader) {
  return new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
}

async function walk(entry: FileSystemEntry, dirs: string[], out: UploadItem[]) {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
    out.push({ file, dirs })
    return
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    const next = [...dirs, entry.name]
    // readEntries returns results in batches; keep reading until empty.
    for (;;) {
      const batch = await readEntries(reader)
      if (!batch.length) break
      for (const child of batch) await walk(child, next, out)
    }
  }
}

/** Expands a drop (files and whole folders) into upload items with relative folder paths. */
export async function itemsFromDataTransfer(dt: DataTransfer): Promise<UploadItem[]> {
  const entries = [...dt.items]
    .filter((i) => i.kind === 'file')
    .map((i) => i.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => Boolean(e))
  if (!entries.length) return [...dt.files].map((file) => ({ file }))
  const out: UploadItem[] = []
  for (const entry of entries) await walk(entry, [], out)
  return out
}

/** Items from an <input type=file webkitdirectory>. */
export function itemsFromFileList(files: FileList | File[]): UploadItem[] {
  return [...files].map((file) => {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath
    const dirs = rel ? rel.split('/').slice(0, -1) : []
    return { file, dirs: dirs.length ? dirs : undefined }
  })
}

/** A small floating label used as the drag image when moving items. */
export function setDragPreview(e: DragEvent | React.DragEvent, label: string) {
  const el = document.createElement('div')
  el.textContent = label
  el.style.cssText =
    'position:fixed;top:-100px;left:-100px;padding:8px 14px;border-radius:12px;background:var(--brand-500);color:var(--on-brand);font:600 13px system-ui;box-shadow:0 8px 24px rgba(0,0,0,.25);white-space:nowrap'
  document.body.appendChild(el)
  e.dataTransfer?.setDragImage(el, 12, 12)
  setTimeout(() => el.remove(), 0)
}
