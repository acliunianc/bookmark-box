import { useMemo } from 'react'
import { Toast, toast as heroToast } from '@heroui/react'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastInput {
  message: string
  description?: string
  variant?: 'success' | 'danger' | 'info' | 'warning'
  duration?: number
  action?: ToastAction
}

interface ToastApi {
  push: (toast: ToastInput) => string
  success: (message: string, options?: Omit<ToastInput, 'message' | 'variant'>) => string
  danger: (message: string, options?: Omit<ToastInput, 'message' | 'variant'>) => string
  dismiss: (id: string) => void
}

const VARIANT: Record<string, 'default' | 'accent' | 'success' | 'warning' | 'danger'> = {
  success: 'success',
  danger: 'danger',
  warning: 'warning',
  info: 'accent',
}

function push(item: ToastInput): string {
  return heroToast(item.message, {
    description: item.description,
    variant: VARIANT[item.variant ?? 'info'],
    timeout: item.duration ?? 6000,
    actionProps: item.action
      ? { children: item.action.label, variant: 'ghost', size: 'sm', onPress: item.action.onClick }
      : undefined,
  })
}

/** 保持与旧实现一致的调用方式，底层换成 HeroUI 的 Toast 队列 */
export function useToast(): ToastApi {
  return useMemo<ToastApi>(
    () => ({
      push,
      dismiss: (id: string) => heroToast.close(id),
      success: (message, options) => push({ ...options, message, variant: 'success' }),
      danger: (message, options) => push({ ...options, message, variant: 'danger' }),
    }),
    [],
  )
}

/** 全屏 toast 容器，挂在应用根部 */
export function ToastRegion() {
  return <Toast.Provider placement="bottom" width={420} />
}
