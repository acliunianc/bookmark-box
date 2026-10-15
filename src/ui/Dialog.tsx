import type { ReactNode } from 'react'
import { Modal } from '@heroui/react'
import { cn } from './cn'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  width?: number
  /** 点遮罩是否关闭（批量操作进行中可设为 false） */
  closeOnBackdrop?: boolean
}

/**
 * 统一对话框外壳：底层直接用 HeroUI 的 Modal 组件族，
 * 这样所有业务对话框都自动获得 HeroUI 的遮罩、动画、焦点管理。
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 520,
  closeOnBackdrop = true,
}: DialogProps) {
  return (
    <Modal>
      <Modal.Backdrop
        isOpen={open}
        onOpenChange={(next) => (next ? undefined : onClose())}
        isDismissable={closeOnBackdrop}
      >
        <Modal.Container placement="center" scroll="inside">
          <Modal.Dialog style={{ maxWidth: width }}>
            <Modal.CloseTrigger />
            {title ? (
              <Modal.Header>
                <Modal.Heading>{title}</Modal.Heading>
                {description ? (
                  <p className="mt-1 text-xs text-[var(--muted)]">{description}</p>
                ) : null}
              </Modal.Header>
            ) : null}
            <Modal.Body>{children}</Modal.Body>
            {footer ? <Modal.Footer>{footer}</Modal.Footer> : null}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="text-xs font-medium text-[var(--muted)]">{label}</span>
      {children}
      {hint ? <span className="text-xs text-[var(--muted)]">{hint}</span> : null}
    </div>
  )
}
