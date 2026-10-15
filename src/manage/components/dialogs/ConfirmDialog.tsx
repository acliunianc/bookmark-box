import { Button } from '@heroui/react'
import { Dialog } from '../../../ui/Dialog'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: React.ReactNode
  /** 附在提示语下方的额外内容（如「同步删除浏览器书签」勾选项） */
  extra?: React.ReactNode
  confirmLabel?: string
  danger?: boolean
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  extra,
  confirmLabel = '确认',
  danger,
  pending,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      width={440}
      footer={
        <>
          <Button variant="ghost" onPress={onCancel} isDisabled={pending}>
            取消
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onPress={onConfirm} isDisabled={pending}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="text-sm text-[var(--muted)]">{message}</div>
        {extra}
      </div>
    </Dialog>
  )
}
