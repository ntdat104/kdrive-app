import { create } from 'zustand'
import { useSettings } from '../store/settings'
import { isDesktop } from './desktop'

export type LinkKind = 'share' | 'join'

/**
 * Share and invite links carry everything in the fragment, so the origin only decides who can
 * open them: the web app's address works for anyone with a browser, `kdrive://` opens this app.
 */
export function kdriveLink(kind: LinkKind, packed: string) {
  const web = useSettings.getState().webUrl.trim().replace(/\/+$/, '')
  if (web) return `${web}/${kind}#${packed}`
  if (isDesktop) return `kdrive://${kind}#${packed}`
  return `${location.origin}${import.meta.env.BASE_URL}${kind}#${packed}`
}

const LINK_RE = /(?:^|[/:])(share|join)\/?#([\w-]{8,})\s*$/

/** Turns any Kdrive share/invite link (web or kdrive://) into an in-app route, or null. */
export function linkRoute(text: string) {
  const match = text.trim().match(LINK_RE)
  return match ? `/${match[1]}#${match[2]}` : null
}

/** State of the "Open a Kdrive link" dialog (mounted once by DesktopBridge). */
export const useOpenLink = create<{ open: boolean; setOpen: (open: boolean) => void }>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))
