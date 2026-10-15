import type { ReactNode } from 'react'
import { Label, Radio, RadioGroup } from '@heroui/react'
import { cn } from './cn'

export interface RadioCardOption {
  value: string
  label: ReactNode
  /** 补充说明，渲染在标题下方一行 */
  description?: ReactNode
}

interface RadioCardGroupProps {
  'aria-label': string
  /** 分组标题，渲染在卡片列表上方 */
  label?: ReactNode
  value: string
  onChange: (value: string) => void
  options: RadioCardOption[]
  /**
   * `stack`（默认）纵向排列，卡片撑满整行；
   * `row` 让卡片并排显示，此时**默认按内容定宽**（不为了凑满父容器而拉伸）。
   */
  layout?: 'stack' | 'row'
  /**
   * row 模式下是否让卡片均分父容器宽度。
   * 默认 false——选项各有各的宽度更自然，硬凑满容器会留下大片空白或把短选项拉得很宽。
   */
  stretch?: boolean
  /** row 模式下单张卡片的最小宽度（px），避免窄容器里被压得只剩几个字一行 */
  minCardWidth?: number
  /**
   * row 模式下「标题 + 说明」文字块的最大宽度（px）。
   * 内容自适应时卡片宽度由文字决定，长说明需要靠它兜住，否则一张卡就能占满整行。
   */
  maxTextWidth?: number
  className?: string
}

/**
 * 卡片式单选组。
 *
 * 底层仍然是 HeroUI 的 RadioGroup / Radio，只调整视觉：整个选项是一张带边框的卡片，
 * 选中后描边高亮 + 淡绿底。
 *
 * 这样做的原因是 HeroUI 默认的未选中圆圈几乎看不见：`.radio__control` 用
 * `border-field-border` 描边，而本项目主题里 `--field-border` 是透明的，
 * 于是圆圈只剩纯白填充，落在白色弹窗上完全没有轮廓。
 *
 * row 布局下同一行的卡片靠 `items-stretch` 自动等高，宽度则按内容走（除非显式 `stretch`）。
 */
export function RadioCardGroup({
  label,
  value,
  onChange,
  options,
  layout = 'stack',
  stretch = false,
  minCardWidth = 120,
  maxTextWidth = 200,
  className,
  ...ariaProps
}: RadioCardGroupProps) {
  const row = layout === 'row'
  return (
    <RadioGroup
      className={cn('gap-2', row && 'flex flex-wrap items-stretch', className)}
      value={value}
      onChange={onChange}
      orientation={row ? 'horizontal' : 'vertical'}
      {...ariaProps}
    >
      {label ? (
        <Label className={cn('text-xs font-medium text-[var(--muted)]', row && 'w-full')}>
          {label}
        </Label>
      ) : null}
      {options.map((option) => (
        <Radio
          key={option.value}
          value={option.value}
          style={
            row
              ? {
                  minWidth: minCardWidth,
                  ...(stretch ? { flex: '1 1 0%' } : { flex: '0 1 auto' }),
                }
              : undefined
          }
          className={cn(
            'group cursor-pointer rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] transition',
            !row && 'w-full',
            'hover:border-[var(--accent)] hover:bg-[var(--accent)]/8',
            // data-selected 在 Radio 根节点上；aria-checked 在内层 label 上，两者都兜住
            'data-[selected=true]:border-[var(--accent)] data-[selected=true]:bg-[var(--accent)]/12',
            'has-[[aria-checked=true]]:border-[var(--accent)] has-[[aria-checked=true]]:bg-[var(--accent)]/12',
          )}
        >
          {/* 内边距放在这层：.radio__content 本身就是可点击的 label，这样整张卡片都点得到 */}
          <Radio.Content className="w-full items-start px-3 py-2.5">
            <Radio.Control
              className={cn(
                'mt-0.5 rounded-full',
                'border-[var(--muted)]!',
                'group-data-[selected=true]:border-transparent!',
                'group-has-[[aria-checked=true]]:border-transparent!',
              )}
            >
              <Radio.Indicator />
            </Radio.Control>
            <span
              className="min-w-0 flex-1"
              style={row && !stretch ? { maxWidth: maxTextWidth } : undefined}
            >
              <span className="block text-sm font-medium">{option.label}</span>
              {option.description ? (
                <span className="mt-0.5 block text-xs leading-relaxed text-[var(--muted)]">
                  {option.description}
                </span>
              ) : null}
            </span>
          </Radio.Content>
        </Radio>
      ))}
    </RadioGroup>
  )
}
