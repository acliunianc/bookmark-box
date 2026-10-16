import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Label, ListBox, Select } from '@heroui/react'
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

function optionText(option: SearchSelectOption) {
  return option.textValue ?? option.label
}

function matchesQuery(option: SearchSelectOption, query: string) {
  const keyword = query.trim().toLowerCase()
  if (!keyword) return true
  return `${option.label}\n${option.textValue ?? ''}`.toLowerCase().includes(keyword)
}

/**
 * 可搜索的单选下拉。
 *
 * 用 Select 而不是 ComboBox：ComboBox 的触发器是文本框，弹层在显示前会先等「软键盘会不会顶上来」。
 * 桌面触屏设备上键盘并不会出现，这段等待大约 600ms，菜单才弹出来。
 * Select 的触发器是按钮，和主题下拉一样，按下就打开；筛选框放在菜单内部。
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
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const focusFrame = useRef(0)
  const selected = options.find((option) => option.id === value)
  const selectedLabel = selected ? optionText(selected) : ''
  const filtered = useMemo(
    () => options.filter((option) => matchesQuery(option, query)),
    [options, query],
  )

  const cancelScheduled = () => {
    cancelAnimationFrame(focusFrame.current)
    focusFrame.current = 0
  }

  /* 等弹层做完「要不要等软键盘」的两帧判断，再把焦点放进搜索框，避免菜单被推迟显示 */
  const focusSearch = () => {
    cancelAnimationFrame(focusFrame.current)
    let frame = 0
    const step = () => {
      frame += 1
      if (frame < 3) {
        focusFrame.current = requestAnimationFrame(step)
        return
      }
      focusFrame.current = 0
      searchRef.current?.focus()
    }
    focusFrame.current = requestAnimationFrame(step)
  }

  return (
    <Select
      className={cn('min-w-0', className)}
      variant="secondary"
      fullWidth
      selectedKey={value}
      placeholder={placeholder}
      isDisabled={isDisabled}
      onSelectionChange={(key) => {
        if (key != null) onChange(String(key))
      }}
      onOpenChange={(isOpen) => {
        setQuery('')
        if (!isOpen) {
          cancelScheduled()
          return
        }
        focusSearch()
      }}
      {...ariaProps}
    >
      {label ? <Label className="text-xs font-medium text-[var(--muted)]">{label}</Label> : null}
      <Select.Trigger className="w-full min-w-0">
        <Select.Value className="min-w-0 overflow-hidden">
          <span
            className={cn(
              'block truncate',
              selectedLabel ? 'text-[var(--field-foreground)]' : 'text-[var(--field-placeholder)]',
            )}
          >
            {selectedLabel || placeholder}
          </span>
        </Select.Value>
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <div className="border-b border-[var(--separator)] p-1.5">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute start-2.5 top-1/2 z-10 -translate-y-1/2 text-[var(--field-placeholder)]" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入关键字筛选"
              aria-label="筛选选项"
              autoComplete="off"
              spellCheck={false}
              className="h-8 w-full rounded-[var(--field-radius)] bg-[var(--field-background)] ps-8 pe-2 text-sm text-[var(--field-foreground)] outline-none placeholder:text-[var(--field-placeholder)]"
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') event.stopPropagation()
              }}
            />
          </div>
        </div>
        <ListBox
          className="max-h-64 overflow-y-auto"
          renderEmptyState={() => (
            <span className="block px-2 py-3 text-center text-xs text-[var(--muted)]">
              没有匹配的选项
            </span>
          )}
        >
          {filtered.map((option) => (
            <ListBox.Item key={option.id} id={option.id} textValue={optionText(option)}>
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
      </Select.Popover>
    </Select>
  )
}
