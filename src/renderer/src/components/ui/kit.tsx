import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@renderer/lib/cn'

// ---------------- Button ----------------

const buttonVariants = cva(
  'no-drag inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[12px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40 disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        default: 'bg-base-700 text-ink-100 hover:bg-base-650 active:bg-base-600',
        ghost: 'text-ink-300 hover:bg-white/[0.06] hover:text-ink-100',
        outline:
          'border border-white/[0.09] bg-transparent text-ink-200 hover:border-white/20 hover:bg-white/[0.04]',
        accent: 'bg-accent text-base-950 hover:bg-accent/90 active:bg-accent/80',
        subtle: 'bg-white/[0.04] text-ink-300 hover:bg-white/[0.08] hover:text-ink-100',
        danger: 'text-danger/90 hover:bg-danger/10 hover:text-danger'
      },
      size: {
        sm: 'h-6 px-2 text-[11px]',
        md: 'h-7 px-2.5',
        lg: 'h-8 px-3.5',
        icon: 'h-7 w-7 px-0'
      }
    },
    defaultVariants: { variant: 'default', size: 'md' }
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
)
Button.displayName = 'Button'

// ---------------- IconButton ----------------

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode
  label?: string
  active?: boolean
  size?: 'sm' | 'md'
}

export function IconButton({ icon, label, active, size = 'md', className, ...props }: IconButtonProps): React.JSX.Element {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        className={cn(
          'no-drag inline-flex items-center justify-center rounded-md text-ink-400 transition-colors',
          'hover:bg-white/[0.07] hover:text-ink-100',
          size === 'sm' ? 'h-6 w-6' : 'h-7 w-7',
          active && 'bg-white/[0.07] text-accent',
          className
        )}
        {...props}
      >
        {icon}
      </button>
    </Tooltip>
  )
}

// ---------------- Input ----------------

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-7 w-full rounded-md border border-white/[0.07] bg-base-850 px-2.5 text-[12px] text-ink-100',
        'placeholder:text-ink-500 focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20',
        'transition-colors',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full resize-none rounded-md border border-white/[0.07] bg-base-850 px-2.5 py-2 text-[12px] leading-relaxed text-ink-200',
        'placeholder:text-ink-500 focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20',
        className
      )}
      {...props}
    />
  )
)
Textarea.displayName = 'Textarea'

// ---------------- Tooltip ----------------

export function TooltipProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <TooltipPrimitive.Provider delayDuration={500} skipDelayDuration={300}>
      {children}
    </TooltipPrimitive.Provider>
  )
}

export function Tooltip({
  content,
  children,
  side = 'bottom'
}: {
  content?: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
}): React.JSX.Element {
  if (!content) return <>{children}</>
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-[260px] rounded-md border border-white/10 bg-base-750 px-2 py-1 text-[11px] text-ink-200 shadow-xl"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

// ---------------- Badge ----------------

export function Badge({
  children,
  className,
  tone = 'neutral'
}: {
  children: React.ReactNode
  className?: string
  tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'info'
}): React.JSX.Element {
  const tones: Record<string, string> = {
    neutral: 'bg-white/[0.06] text-ink-300',
    accent: 'bg-accent/12 text-accent',
    ok: 'bg-ok/12 text-ok',
    warn: 'bg-warn/12 text-warn',
    danger: 'bg-danger/12 text-danger',
    info: 'bg-info/12 text-info'
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-[2px] text-[10px] font-medium tracking-wide',
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

// ---------------- Segmented ----------------

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className
}: {
  value: T
  options: { value: T; label: React.ReactNode; title?: string }[]
  onChange: (v: T) => void
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('inline-flex items-center rounded-md bg-base-850 p-0.5', className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.title}
          onClick={() => onChange(opt.value)}
          className={cn(
            'no-drag inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] transition-colors',
            value === opt.value
              ? 'bg-base-700 text-ink-100'
              : 'text-ink-400 hover:text-ink-200'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ---------------- Slider ----------------

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  className
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  className?: string
}): React.JSX.Element {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn(
        'no-drag h-1 w-full cursor-pointer appearance-none rounded-full bg-white/10',
        '[&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:appearance-none',
        '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent/90',
        '[&::-webkit-slider-thumb]:shadow-[0_0_0_3px_rgba(184,198,255,0.14)]',
        className
      )}
    />
  )
}

// ---------------- Switch ----------------

export function Switch({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="no-drag flex items-center gap-2 text-[11.5px] text-ink-300"
    >
      <span
        className={cn(
          'relative h-4 w-7 rounded-full transition-colors',
          checked ? 'bg-accent/80' : 'bg-white/10'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-3 w-3 rounded-full bg-white/90 transition-transform',
            checked ? 'translate-x-3.5' : 'translate-x-0.5'
          )}
        />
      </span>
      {label}
    </button>
  )
}

// ---------------- Separator ----------------

export function Separator({ className }: { className?: string }): React.JSX.Element {
  return <div className={cn('h-px w-full bg-white/[0.06]', className)} />
}
