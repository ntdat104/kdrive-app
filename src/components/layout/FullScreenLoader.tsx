import { Logo } from '../Logo'

export function FullScreenLoader({ label }: { label?: string }) {
  return (
    <div className="grid h-full place-items-center bg-bg">
      <div className="flex flex-col items-center gap-5">
        <div className="relative">
          <div className="absolute inset-0 animate-ping rounded-2xl bg-brand-500/30" />
          <Logo className="relative size-14" />
        </div>
        {label && <p className="text-sm font-medium text-muted">{label}</p>}
      </div>
    </div>
  )
}
