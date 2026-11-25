import { create } from 'zustand'

export type Dialog =
  | { type: 'newFolder'; parentId: string }
  | { type: 'newFile'; parentId: string }
  | { type: 'rename'; id: string }
  | { type: 'move'; ids: string[] }
  | { type: 'share'; id: string }
  /** Invite links for a folder, or the whole drive when `id` is the root. */
  | { type: 'shareFolder'; id: string }
  | { type: 'delete'; ids: string[] }
  | { type: 'emptyTrash' }
  | { type: 'settings'; tab?: string }
  | { type: 'shortcuts' }
  | null

interface UIState {
  selection: Set<string>
  anchor: string | null
  /** Item under keyboard focus. */
  cursor: string | null
  clipboard: { ids: string[]; mode: 'cut' } | null
  previewId: string | null
  editing: boolean
  dialog: Dialog
  commandOpen: boolean
  mobileNavOpen: boolean
  query: string
  dragIds: string[] | null

  select: (ids: string[], anchor?: string | null) => void
  toggle: (id: string) => void
  clearSelection: () => void
  setCursor: (id: string | null) => void
  setClipboard: (clip: UIState['clipboard']) => void
  openPreview: (id: string | null, editing?: boolean) => void
  setEditing: (editing: boolean) => void
  openDialog: (dialog: Dialog) => void
  setCommandOpen: (open: boolean) => void
  setMobileNavOpen: (open: boolean) => void
  setQuery: (q: string) => void
  setDragIds: (ids: string[] | null) => void
}

export const useUI = create<UIState>()((set) => ({
  selection: new Set(),
  anchor: null,
  cursor: null,
  clipboard: null,
  previewId: null,
  editing: false,
  dialog: null,
  commandOpen: false,
  mobileNavOpen: false,
  query: '',
  dragIds: null,

  select: (ids, anchor) => set((s) => ({ selection: new Set(ids), anchor: anchor === undefined ? s.anchor : anchor, cursor: ids.at(-1) ?? s.cursor })),
  toggle: (id) =>
    set((s) => {
      const next = new Set(s.selection)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { selection: next, anchor: id, cursor: id }
    }),
  clearSelection: () => set({ selection: new Set(), anchor: null }),
  setCursor: (cursor) => set({ cursor }),
  setClipboard: (clipboard) => set({ clipboard }),
  openPreview: (previewId, editing = false) => set({ previewId, editing }),
  setEditing: (editing) => set({ editing }),
  openDialog: (dialog) => set({ dialog }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  setQuery: (query) => set({ query }),
  setDragIds: (dragIds) => set({ dragIds }),
}))
