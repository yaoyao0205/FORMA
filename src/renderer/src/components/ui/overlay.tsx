import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu'
import { cn } from '@renderer/lib/cn'

// ---------------- Dialog ----------------

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({
  children,
  title,
  description,
  className
}: {
  children: React.ReactNode
  title: string
  description?: string
  className?: string
}): React.JSX.Element {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in" />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/10',
          'bg-base-850 p-5 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.9)] focus:outline-none',
          className
        )}
      >
        <DialogPrimitive.Title className="text-[14px] font-semibold text-ink-100">
          {title}
        </DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="mt-1 text-[11.5px] leading-relaxed text-ink-400">
            {description}
          </DialogPrimitive.Description>
        ) : null}
        <div className="mt-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

// ---------------- Dropdown ----------------

export const Dropdown = DropdownMenuPrimitive.Root
export const DropdownTrigger = DropdownMenuPrimitive.Trigger

export function DropdownContent({
  children,
  className,
  align = 'end'
}: {
  children: React.ReactNode
  className?: string
  align?: 'start' | 'center' | 'end'
}): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align={align}
        sideOffset={6}
        className={cn(
          'z-50 min-w-[180px] overflow-hidden rounded-lg border border-overlay/[0.09] bg-base-800/95 p-1',
          'shadow-[0_16px_48px_-8px_rgba(0,0,0,0.85)] backdrop-blur-xl',
          className
        )}
      >
        {children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  )
}

export function DropdownItem({
  children,
  onSelect,
  danger,
  disabled
}: {
  children: React.ReactNode
  onSelect?: () => void
  danger?: boolean
  disabled?: boolean
}): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex cursor-default select-none items-center gap-2 rounded-md px-2 py-[6px] text-[12px] outline-none',
        'text-ink-200 data-[highlighted]:bg-overlay/[0.07] data-[highlighted]:text-ink-100',
        danger && 'text-danger/90 data-[highlighted]:bg-danger/10 data-[highlighted]:text-danger',
        disabled && 'opacity-40'
      )}
    >
      {children}
    </DropdownMenuPrimitive.Item>
  )
}

export function DropdownSeparator(): React.JSX.Element {
  return <DropdownMenuPrimitive.Separator className="my-1 h-px bg-overlay/[0.06]" />
}

export function DropdownLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <DropdownMenuPrimitive.Label className="px-2 pb-1 pt-1.5 text-[10px] uppercase tracking-wider text-ink-500">
      {children}
    </DropdownMenuPrimitive.Label>
  )
}

// ---------------- Context menu ----------------

export const ContextMenu = ContextMenuPrimitive.Root
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger

export function ContextMenuContent({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        className={cn(
          'z-50 min-w-[200px] overflow-hidden rounded-lg border border-overlay/[0.09] bg-base-800/95 p-1',
          'shadow-[0_16px_48px_-8px_rgba(0,0,0,0.85)] backdrop-blur-xl'
        )}
      >
        {children}
      </ContextMenuPrimitive.Content>
    </ContextMenuPrimitive.Portal>
  )
}

export function ContextMenuItem({
  children,
  onSelect,
  danger,
  disabled
}: {
  children: React.ReactNode
  onSelect?: () => void
  danger?: boolean
  disabled?: boolean
}): React.JSX.Element {
  return (
    <ContextMenuPrimitive.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex cursor-default select-none items-center gap-2 rounded-md px-2 py-[6px] text-[12px] outline-none',
        'text-ink-200 data-[highlighted]:bg-overlay/[0.07] data-[highlighted]:text-ink-100',
        danger && 'text-danger/90 data-[highlighted]:bg-danger/10 data-[highlighted]:text-danger',
        disabled && 'opacity-40'
      )}
    >
      {children}
    </ContextMenuPrimitive.Item>
  )
}

export function ContextMenuSeparator(): React.JSX.Element {
  return <ContextMenuPrimitive.Separator className="my-1 h-px bg-overlay/[0.06]" />
}

export const ContextMenuLabel = ContextMenuPrimitive.Label
