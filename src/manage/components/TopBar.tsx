import { Button, SearchField, Tooltip } from '@heroui/react'
import type { RefObject } from 'react'
import { IconDownload, IconSettings, IconStar, IconUpload } from '../../ui/icons'

interface TopBarProps {
  query: string
  onQueryChange: (value: string) => void
  /** 搜索区域容器，`/` 快捷键聚焦时使用 */
  searchRef: RefObject<HTMLDivElement | null>
  onImport: () => void
  onExport: () => void
  onSettings: () => void
}

export function TopBar({ query, onQueryChange, searchRef, onImport, onExport, onSettings }: TopBarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-[var(--separator)] bg-[var(--surface)] px-4">
      <div className="flex shrink-0 items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-md bg-[var(--accent)] text-[var(--accent-foreground)]">
          <IconStar width={16} height={16} />
        </span>
        <span className="text-sm font-semibold tracking-tight">TagMark</span>
      </div>

      <div ref={searchRef} className="flex min-w-[320px] flex-1 items-center gap-2">
        <SearchField
          aria-label="搜索标题 / 网址 / #标签 / in:文件夹"
          className="w-full min-w-0 flex-1"
          fullWidth
          value={query}
          onChange={onQueryChange}
        >
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="搜索标题 / 网址 / #标签 / in:文件夹" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Tooltip delay={400}>
          <Tooltip.Trigger>
            <Button size="sm" variant="ghost" onPress={onImport}>
              <IconUpload width={15} height={15} />
              导入
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>从浏览器书签或 HTML 文件导入</Tooltip.Content>
        </Tooltip>

        <Tooltip delay={400}>
          <Tooltip.Trigger>
            <Button size="sm" variant="ghost" onPress={onExport}>
              <IconDownload width={15} height={15} />
              导出
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>导出为 HTML / JSON / Markdown</Tooltip.Content>
        </Tooltip>

        <Tooltip delay={400}>
          <Tooltip.Trigger>
            <Button size="sm" variant="ghost" isIconOnly onPress={onSettings} aria-label="设置">
              <IconSettings width={16} height={16} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>设置</Tooltip.Content>
        </Tooltip>
      </div>
    </header>
  )
}
