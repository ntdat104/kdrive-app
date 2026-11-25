import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { useCurrentFolderId } from '../../hooks'
import { useCanEdit } from '../../store/drive'
import { useUI } from '../../store/ui'
import { focusSearch } from './Topbar'
import { pickFiles } from './UploadInputs'

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.closest('.cm-editor')))
}

/** App-wide shortcuts that work on every drive page. */
export function GlobalShortcuts() {
  const folderId = useCurrentFolderId()
  const { pathname } = useLocation()
  const canEdit = useCanEdit()
  const inFolder = (pathname === '/drive' || pathname.startsWith('/drive/f/')) && canEdit

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUI.getState()
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        ui.setCommandOpen(!ui.commandOpen)
        return
      }
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey || ui.dialog || ui.previewId || ui.commandOpen) return
      if (e.key === '/') {
        e.preventDefault()
        focusSearch()
      } else if (e.key === '?') ui.openDialog({ type: 'shortcuts' })
      else if (e.key === ',') ui.openDialog({ type: 'settings' })
      else if (e.key === 'u' && inFolder) pickFiles(folderId)
      else if ((e.key === 'N' || e.key === 'n') && inFolder) {
        e.preventDefault()
        ui.openDialog({ type: 'newFolder', parentId: folderId })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [folderId, inFolder])

  return null
}
