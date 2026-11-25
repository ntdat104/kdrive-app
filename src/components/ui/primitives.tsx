import { LoaderCircle, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Dialog as RDialog, Switch as RSwitch, Tooltip as RTooltip } from 'radix-ui'
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { t } from '../../i18n'

/* --------------------------------- Button -------------------------------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

const variants: Record<Variant, string> = {
  primary:
    'bg-brand-500 text-accent-fg shadow-[0_1px_0_0_rgb(255_255_255/0.35)_inset,0_6px_16px_-8px] shadow-brand-500/60 hover:bg-brand-400 active:bg-brand-600',
  secondary: 'bg-surface-2 text-fg hover:bg-line/70 border border-line',
  outline: 'border border-line-strong text-fg hover:bg-surface-2 hover:border-brand-400/60',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
  danger: 'bg-red-600 text-white hover:bg-red-500 shadow-lg shadow-red-600/20',
}
const sizes: Record<Size, string> = {
  sm: 'h-8 gap-1.5 rounded-lg px-3 text-[13px]',
  md: 'h-10 gap-2 rounded-xl px-4 text-sm',
  lg: 'h-12 gap-2.5 rounded-2xl px-6 text-[15px]',
  icon: 'size-10 rounded-xl',
  'icon-sm': 'size-8 rounded-lg',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', loading, className, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'focus-ring inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition-all duration-150 select-none active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" />}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'

/* --------------------------------- Input --------------------------------- */

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }>(
  ({ className, icon, ...props }, ref) => (
    <div className="relative w-full">
      {icon && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle [&_svg]:size-4">{icon}</span>}
      <input
        ref={ref}
        className={cn(
          'h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg transition outline-none placeholder:text-subtle hover:border-line-strong focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15',
          icon && 'pl-9',
          className,
        )}
        {...props}
      />
    </div>
  ),
)
Input.displayName = 'Input'

export function Label({ children, hint, className }: { children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-1.5 flex items-baseline justify-between gap-2', className)}>
      <span className="text-[13px] font-semibold text-fg">{children}</span>
      {hint && <span className="text-xs text-subtle">{hint}</span>}
    </div>
  )
}

/* -------------------------------- Tooltip -------------------------------- */

export function Tooltip({ content, children, side = 'bottom' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  if (!content) return <>{children}</>
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={6}
          className="z-[100] rounded-lg bg-stone-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-xl dark:bg-stone-100 dark:text-stone-900"
        >
          {content}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  )
}

export const TooltipProvider = RTooltip.Provider

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line bg-surface-2 px-1.5 font-sans text-[11px] font-semibold text-muted',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

/* --------------------------------- Dialog -------------------------------- */

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  icon,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  className?: string
  icon?: ReactNode
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RDialog.Portal forceMount>
            <RDialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-50 bg-stone-950/40 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </RDialog.Overlay>
            {/* minmax(0,1fr) keeps the column at viewport width, so long content wraps instead of widening the dialog. */}
            <div className="fixed inset-0 z-50 grid grid-cols-[minmax(0,1fr)] place-items-center overflow-y-auto p-4">
              <RDialog.Content asChild>
                <motion.div
                  initial={{ opacity: 0, y: 16, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
                  className={cn(
                    'relative w-full max-w-md rounded-3xl border border-line bg-elevated p-6 shadow-2xl shadow-stone-950/20 outline-none',
                    className,
                  )}
                >
                  <div className="flex items-start gap-4">
                    {icon && (
                      <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-brand-700 dark:text-brand-400 [&_svg]:size-5">
                        {icon}
                      </div>
                    )}
                    <div className="min-w-0 flex-1 pr-6">
                      <RDialog.Title className="text-lg font-bold tracking-tight [overflow-wrap:anywhere]">{title}</RDialog.Title>
                      {description ? (
                        <RDialog.Description className="mt-1 text-sm text-muted">{description}</RDialog.Description>
                      ) : (
                        <RDialog.Description className="sr-only">{title}</RDialog.Description>
                      )}
                    </div>
                  </div>
                  <RDialog.Close asChild>
                    <button aria-label={t('Close')} className="focus-ring absolute top-4 right-4 grid size-8 place-items-center rounded-lg text-subtle transition hover:bg-surface-2 hover:text-fg">
                      <X className="size-4" />
                    </button>
                  </RDialog.Close>
                  {children && <div className="mt-5">{children}</div>}
                  {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
                </motion.div>
              </RDialog.Content>
            </div>
          </RDialog.Portal>
        )}
      </AnimatePresence>
    </RDialog.Root>
  )
}

/* --------------------------------- Switch -------------------------------- */

export function Switch({ checked, onCheckedChange, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; id?: string }) {
  return (
    <RSwitch.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      className="focus-ring relative h-6 w-11 shrink-0 rounded-full bg-line-strong transition-colors data-[state=checked]:bg-brand-500"
    >
      <RSwitch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow-md transition-transform data-[state=checked]:translate-x-[22px]" />
    </RSwitch.Root>
  )
}

/* -------------------------------- Progress ------------------------------- */

export function ProgressBar({ value, className, tone = 'brand' }: { value: number; className?: string; tone?: 'brand' | 'green' | 'red' | 'muted' }) {
  const tones = {
    brand: 'from-brand-300 to-brand-500',
    green: 'from-emerald-400 to-emerald-600',
    red: 'from-red-400 to-red-600',
    muted: 'from-stone-400 to-stone-500',
  }
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-line', className)}>
      <div
        className={cn('h-full rounded-full bg-gradient-to-r transition-[width] duration-300 ease-out', tones[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }}
      />
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn('size-5 animate-spin text-brand-500', className)} />
}

/* ------------------------------ Menu styles ------------------------------ */

export const menuContentClass =
  'z-[80] min-w-52 overflow-hidden rounded-2xl border border-line bg-elevated/95 p-1.5 text-sm shadow-2xl shadow-stone-950/15 backdrop-blur-xl data-[state=open]:animate-[menu-in_120ms_ease-out]'
export const menuItemClass =
  'relative flex h-9 cursor-default items-center gap-2.5 rounded-xl px-2.5 font-medium text-fg outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent-soft data-[highlighted]:text-brand-800 dark:data-[highlighted]:text-brand-300 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted data-[highlighted]:[&_svg]:text-current'
export const menuDangerClass = 'text-red-600 dark:text-red-400 data-[highlighted]:bg-red-500/10 data-[highlighted]:text-red-600 [&_svg]:text-red-500'
export const menuSeparatorClass = 'my-1 h-px bg-line'
export const menuShortcutClass = 'ml-auto pl-4 text-[11px] font-semibold tracking-wide text-subtle'
