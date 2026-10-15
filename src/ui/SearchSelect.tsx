import type { ReactNode } from 'react'
import { ComboBox, Input, Label, ListBox } from '@heroui/react'
import { cn } from './cn'
import { IconSearch } from './icons'

export interface SearchSelectOption {
  /** 回调给外部的取值 */
  id: string
  /** 列表里显示的文案 */
  label: string
  /** 参与搜索匹配的文本，默认用 label；需要按路径、别名搜索时可以单独指定 */
  textValue?: string
  /** 左侧色块颜色 */
  color?: string
  /** 色块形状，默认圆点 */
  shape?: 'dot' | 'square'
  /** 右侧附加信息，如使用次数 */
  meta?: ReactNode
  /** 左侧缩进（px），用于展示层级 */
  indent?: number
}

interface SearchSelectProps {
  'aria-label': string
  /** 表单标题，渲染在输入框上方 */
  label?: ReactNode
  /** 当前选中项 id；null 表示未选中（显示 placeholder） */
  value: string | null
  onChange: (id: string) => void
  options: SearchSelectOption[]
  placeholder?: string
  isDisabled?: boolean
  className?: string
}

/**
 * 可搜索的单选下拉：HeroUI ComboBox（输入框 + 过滤后的 ListBox 弹层）。
 *
 * 和 Select 的区别：Select 只能滚动翻找，标签/分组/文件夹一多就几乎选不动；
 * 这里输入框本身就是筛选器，选中项的文案会回填进输入框，点开还能继续改了重搜。
 */
export function SearchSelect({
  label,
  value,
  onChange,
  options,
  placeholder = '输入关键字搜索',
  isDisabled,
  className,
  ...ariaProps
}: SearchSelectProps) {
  return (
    <ComboBox
      className={cn('min-w-0', className)}
      variant="secondary"
      fullWidth
      selectedKey={value}
      onSelectionChange={(key) => {
        if (key != null) onChange(String(key))
      }}
      isDisabled={isDisabled}
      {...ariaProps}
    >
      {label ? <Label className="text-xs font-medium text-[var(--muted)]">{label}</Label> : null}
      <ComboBox.InputGroup className="relative">
        <IconSearch className="pointer-events-none absolute start-2.5 z-10 text-[var(--field-placeholder)]" />
        <Input className="ps-8" placeholder={placeholder} />
        <ComboBox.Trigger />
      </ComboBox.InputGroup>
      <ComboBox.Popover>
        <ListBox
          className="max-h-64 overflow-y-auto"
          renderEmptyState={() => (
            <span className="block px-2 py-3 text-center text-xs text-[var(--muted)]">
              没有匹配的选项
            </span>
          )}
        >
          {options.map((option) => (
            <ListBox.Item
              key={option.id}
              id={option.id}
              textValue={option.textValue ?? option.label}
            >
              <span
                className="flex min-w-0 items-center gap-2"
                style={option.indent ? { paddingLeft: option.indent } : undefined}
              >
                {option.color ? (
                  <span
                    className={cn(
                      'size-2 shrink-0',
                      option.shape === 'square' ? 'rounded-sm' : 'rounded-full',
                    )}
                    style={{ backgroundColor: option.color }}
                    aria-hidden="true"
                  />
                ) : null}
                <span className="truncate">{option.label}</span>
                {option.meta != null ? (
                  <span className="ms-auto shrink-0 text-xs text-[var(--muted)] tabular-nums">
                    {option.meta}
                  </span>
                ) : null}
              </span>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </ComboBox.Popover>
    </ComboBox>
  )
}
