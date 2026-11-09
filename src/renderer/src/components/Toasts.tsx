import type { ReactElement } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useApp } from '@renderer/store/useApp'
import { cn } from '@renderer/lib/cn'

export function Toasts(): ReactElement {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismissToast)

  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-1.5">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex max-w-[520px] items-center gap-2 rounded-lg border px-3 py-2 text-[11.5px] shadow-2xl backdrop-blur-xl',
            t.kind === 'error'
              ? 'border-danger/25 bg-danger/[0.12] text-danger'
              : t.kind === 'success'
                ? 'border-ok/25 bg-ok/[0.10] text-ok'
                : 'border-white/10 bg-base-800/95 text-ink-200'
          )}
        >
          {t.kind === 'error' ? <AlertCircle size={13} /> : t.kind === 'success' ? <CheckCircle2 size={13} /> : <Info size={13} />}
          <span className="flex-1">{t.text}</span>
          <button type="button" onClick={() => dismiss(t.id)} className="opacity-50 hover:opacity-90">
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  )
}
