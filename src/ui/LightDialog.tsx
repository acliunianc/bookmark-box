import { useEffect, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from './cn'
import { IconClose } from './icons'

export interface LightDialogProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  width?: number
  closeOnBackdrop?: boolean
}

/**
 * 轻量对话框：不用 HeroUI/React Aria Modal。
 * 打开时不做整页 aria-hidden / FocusScope，避免管理页这种大树上一卡半秒。
 */
export function LightDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 480,
  closeOnBackdrop = true,
}: LightDialogProps) {
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        aria-label="关闭对话框"
        className="absolute inset-0 cursor-default border-0 bg-black/40"
        disabled={!closeOnBackdrop}
        onClick={() => {
          if (closeOnBackdrop) onClose()
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        className={cn(
          'relative z-10 flex w-full max-h-[min(90vh,720px)] flex-col',
          'rounded-[min(32px,var(--radius-3xl,1.5rem))] bg-[var(--overlay)] text-[var(--overlay-foreground)]',
          'shadow-[0_8px_40px_rgba(0,0,0,0.18)] outline-none',
        )}
        style={{ maxWidth: width }}
      >
        <button
          type="button"
          aria-label="关闭"
          className="absolute end-3 top-3 inline-flex size-8 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--default)] hover:text-[var(--foreground)]"
          onClick={onClose}
        >
          <IconClose />
        </button>

        {title ? (
          <header className="shrink-0 px-6 pb-1 pt-6 pe-12">
            <h2 id={titleId} className="text-base font-semibold leading-snug">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-1 text-xs text-[var(--muted)]">
                {description}
              </p>
            ) : null}
          </header>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>

        {footer ? (
          <footer className="flex shrink-0 items-center justify-end gap-2 px-6 pb-5 pt-1">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
