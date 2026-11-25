import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import './migrate'

/** Drives (webhooks) known to this browser. The webhook URL is the credential. */
export interface DriveProfile {
  id: string
  name: string
  webhookUrl: string
  encrypted: boolean
  avatar: string | null
  addedAt: number
  lastOpenedAt?: number
  /** Set when this drive was opened from an invite link: the grant id in the owner's manifest. */
  shareId?: string
}

interface DrivesState {
  profiles: DriveProfile[]
  activeId: string | null
  upsert: (profile: DriveProfile) => void
  remove: (id: string) => void
  setActive: (id: string | null) => void
  update: (id: string, patch: Partial<DriveProfile>) => void
}

export const useDrives = create<DrivesState>()(
  persist(
    (set) => ({
      profiles: [],
      activeId: null,
      upsert: (profile) =>
        set((s) => ({
          profiles: [...s.profiles.filter((p) => p.id !== profile.id), profile],
        })),
      remove: (id) =>
        set((s) => ({
          profiles: s.profiles.filter((p) => p.id !== id),
          activeId: s.activeId === id ? (s.profiles.find((p) => p.id !== id)?.id ?? null) : s.activeId,
        })),
      setActive: (id) => set({ activeId: id }),
      update: (id, patch) => set((s) => ({ profiles: s.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
    }),
    { name: 'kdrive:drives', version: 1 },
  ),
)

export function activeProfile() {
  const { profiles, activeId } = useDrives.getState()
  return profiles.find((p) => p.id === activeId) ?? null
}
