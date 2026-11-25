import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
import { TooltipProvider } from './components/ui/primitives'
import './index.css'
import { DesktopBridge } from './platform/DesktopBridge'
import { installDesktop } from './platform/desktop'
import { router } from './router'
import { applyTheme, resolvedTheme, useSettings } from './store/settings'

installDesktop()

function App() {
  const theme = useSettings((s) => s.theme)
  // Remount on language change so every `t()` call re-evaluates.
  const lang = useSettings((s) => s.lang)
  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  return (
    <TooltipProvider delayDuration={350}>
      <RouterProvider key={lang} router={router} />
      <DesktopBridge key={`bridge-${lang}`} />
      <Toaster
        theme={resolvedTheme(theme)}
        position="bottom-center"
        richColors
        closeButton
        toastOptions={{ classNames: { toast: '!rounded-2xl !font-sans !shadow-2xl', actionButton: '!bg-brand-500 !text-accent-fg !font-semibold' } }}
      />
    </TooltipProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.DEV) {
  // Handy for debugging from the console.
  void Promise.all([import('./store/drive'), import('./store/drives'), import('./store/ui'), import('./store/transfers')]).then(([d, p, u, t]) => {
    Object.assign(window, { __kdrive: { useDrive: d.useDrive, useDrives: p.useDrives, useUI: u.useUI, useTransfers: t.useTransfers } })
  })
}
