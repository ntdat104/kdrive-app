import { cn } from '../lib/utils'

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('size-9 drop-shadow-[0_6px_14px_color-mix(in_srgb,var(--brand-500)_35%,transparent)]', className)} aria-hidden>
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--brand-300)' }} />
          <stop offset="0.5" style={{ stopColor: 'var(--brand-500)' }} />
          <stop offset="1" style={{ stopColor: 'var(--brand-600)' }} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#logo-g)" />
      <rect x="1.5" y="1.5" width="61" height="61" rx="16.5" fill="none" stroke="rgb(255 255 255 / 0.35)" strokeWidth="1.5" />
      {/* "K" monogram */}
      <path d="M22 16v32" fill="none" style={{ stroke: 'var(--on-brand)' }} strokeWidth="6.5" strokeLinecap="round" />
      <path d="M43 17 28.5 31.5 44 47" fill="none" style={{ stroke: 'var(--on-brand)' }} strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="47.5" cy="16.5" r="3.2" style={{ fill: 'var(--on-brand)' }} />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <Logo />
      <span className="text-[19px] font-extrabold tracking-tight">
        K<span className="text-brand-700 dark:text-brand-300">drive</span>
      </span>
    </div>
  )
}
