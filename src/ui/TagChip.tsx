import type { KeyboardEvent } from 'react'
import { Chip, CloseButton } from '@heroui/react'
import { cn } from './cn'

interface TagChipProps {
  name: string
  color?: string
  count?: number
  /** 处于筛选/选中态 */
  active?: boolean
  size?: 'sm' | 'md' | 'lg'
  title?: string
  className?: string
  /** 传入即可点击（用于「按该标签筛选」） */
  onPress?: () => void
  onRemove?: () => void
}

/** 标签徽章统一用 HeroUI 的 Chip，避免各处手写胶囊样式 */
export function TagChip({
  name,
  color,
  count,
  active,
  size = 'sm',
  title,
  className,
  onPress,
  onRemove,
}: TagChipProps) {
  const interactive = Boolean(onPress)

  return (
    <Chip
      color={active ? 'accent' : 'default'}
      variant={active ? 'primary' : 'soft'}
      size={size}
      className={cn(
        'max-w-full',
        // 可点击时给足反馈：只叠一层淡绿底色，不加描边、不放大。
        // 注意：HeroUI 的 .chip 样式没进 @layer，会盖掉 Tailwind 的 utilities，这里必须用 ! 提升优先级
        interactive &&
          cn(
            'cursor-pointer transition',
            // 已选中的 chip 本来就是实心底色，悬停不再叠底色，避免越悬停越淡
            !active && 'hover:bg-[var(--accent)]/25!',
          ),
        className,
      )}
      title={title ?? (interactive ? `按「${name}」筛选` : name)}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={
        onPress
          ? (event) => {
              event.stopPropagation()
              onPress()
            }
          : undefined
      }
      onKeyDown={
        interactive
          ? (event: KeyboardEvent<HTMLSpanElement>) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onPress?.()
              }
            }
          : undefined
      }
    >
      <Chip.Label className="flex items-center gap-1">
        {color ? (
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
        ) : null}
        <span className="truncate">{name}</span>
        {typeof count === 'number' ? <span className="shrink-0 opacity-60 tabular-nums">{count}</span> : null}
        {onRemove ? (
          <CloseButton
            aria-label={`移除 ${name}`}
            className="-mr-1 size-4 min-h-0 min-w-0 shrink-0 text-current"
            onPress={onRemove}
            onClick={(event) => event.stopPropagation()}
          />
        ) : null}
      </Chip.Label>
    </Chip>
  )
}
