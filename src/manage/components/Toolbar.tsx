import type { Key } from 'react'
import { Button, ListBox, Select, Tag, TagGroup, ToggleButton, ToggleButtonGroup, Tooltip } from '@heroui/react'
import type { FilterLogic, SortKey, Tag as TagItem, ViewMode } from '../../shared/types'
import { IconFolder, IconGrid, IconList, IconPin, IconSearch } from '../../ui/icons'

interface ToolbarProps {
  tagChips: TagItem[]
  /** 参与组合的标签总数（含搜索框里 `#标签` 写的），≥2 时才显示 AND / OR 切换 */
  activeTagCount: number
  onRemoveTag: (id: string) => void
  logic: FilterLogic
  onLogicChange: (logic: FilterLogic) => void
  sort: SortKey
  onSortChange: (sort: SortKey) => void
  view: ViewMode
  onViewChange: (view: ViewMode) => void
  multiSelect: boolean
  onToggleMultiSelect: () => void
  /** 当前筛选结果是否已全部选中 */
  allSelected: boolean
  /** 全选 / 取消全选当前筛选结果 */
  onToggleSelectAll: () => void
  treePath?: string
  onClearTreePath: () => void
  query: string
  onClearQuery: () => void
  matchedCount: number
  totalCount: number
}

const SORT_LABELS: Array<{ key: SortKey; label: string }> = [
  { key: 'lastOpened', label: '最近打开' },
  { key: 'created', label: '添加时间' },
  { key: 'openCount', label: '打开次数' },
  { key: 'title', label: '标题' },
  { key: 'url', label: 'URL' },
]

const LOGIC_LABELS: Array<{ key: FilterLogic; label: string }> = [
  { key: 'AND', label: 'AND 交集' },
  { key: 'OR', label: 'OR 并集' },
]

const TAG_PREFIX = 'tag:'
const TREE_PREFIX = 'tree:'
const QUERY_PREFIX = 'query:'

export function Toolbar({
  tagChips,
  activeTagCount,
  onRemoveTag,
  logic,
  onLogicChange,
  sort,
  onSortChange,
  view,
  onViewChange,
  multiSelect,
  onToggleMultiSelect,
  allSelected,
  onToggleSelectAll,
  treePath,
  onClearTreePath,
  query,
  onClearQuery,
  matchedCount,
  totalCount,
}: ToolbarProps) {
  const hasFilter = tagChips.length > 0 || Boolean(treePath) || Boolean(query.trim())

  const removeKeys = (keys: Set<Key>) => {
    for (const raw of keys) {
      const key = String(raw)
      if (key.startsWith(TAG_PREFIX)) onRemoveTag(key.slice(TAG_PREFIX.length))
      else if (key.startsWith(TREE_PREFIX)) onClearTreePath()
      else if (key.startsWith(QUERY_PREFIX)) onClearQuery()
    }
  }

  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--separator)] bg-[var(--surface)] px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        <span className="shrink-0 text-xs text-[var(--muted)]">筛选</span>

        {hasFilter ? (
          <TagGroup aria-label="当前筛选条件" onRemove={removeKeys}>
            <TagGroup.List className="flex flex-nowrap items-center gap-1.5">
              {tagChips.map((tag) => (
                <Tag key={`${TAG_PREFIX}${tag.id}`} id={`${TAG_PREFIX}${tag.id}`} textValue={tag.name}>
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: tag.color }}
                    aria-hidden="true"
                  />
                  {tag.name}
                  {tag.pinned ? <IconPin width={10} height={10} /> : null}
                  <Tag.RemoveButton />
                </Tag>
              ))}
              {treePath ? (
                <Tag key={`${TREE_PREFIX}${treePath}`} id={`${TREE_PREFIX}${treePath}`} textValue={treePath}>
                  <IconFolder width={12} height={12} className="text-[var(--warning)]" />
                  {treePath}
                  <Tag.RemoveButton />
                </Tag>
              ) : null}
              {query.trim() ? (
                <Tag key={`${QUERY_PREFIX}${query}`} id={`${QUERY_PREFIX}${query}`} textValue={query}>
                  <IconSearch width={12} height={12} />
                  {query}
                  <Tag.RemoveButton />
                </Tag>
              ) : null}
            </TagGroup.List>
          </TagGroup>
        ) : (
          <span className="shrink-0 text-xs text-[var(--muted)]">未设置（显示全部）</span>
        )}

        {activeTagCount > 1 ? (
          <Select
            className="w-28 shrink-0"
            variant="secondary"
            aria-label="多标签组合逻辑"
            selectedKey={logic}
            onSelectionChange={(key) => {
              if (key != null) onLogicChange(String(key) as FilterLogic)
            }}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {LOGIC_LABELS.map((option) => (
                  <ListBox.Item key={option.key} id={option.key} textValue={option.label}>
                    {option.label}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        ) : null}

        <span className="shrink-0 text-xs text-[var(--muted)]">
          {matchedCount.toLocaleString()} / {totalCount.toLocaleString()}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Select
          className="w-32"
          variant="secondary"
          aria-label="排序方式"
          selectedKey={sort}
          onSelectionChange={(key) => {
            if (key != null) onSortChange(String(key) as SortKey)
          }}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {SORT_LABELS.map((option) => (
                <ListBox.Item key={option.key} id={option.key} textValue={option.label}>
                  {option.label}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <ToggleButtonGroup
          aria-label="视图切换"
          selectionMode="single"
          selectedKeys={new Set([view])}
          onSelectionChange={(keys) => {
            const first = [...keys][0]
            if (first) onViewChange(String(first) as ViewMode)
          }}
        >
          <ToggleButton id="list" isIconOnly aria-label="列表视图">
            <IconList width={14} height={14} />
          </ToggleButton>
          <ToggleButton id="grid" isIconOnly aria-label="网格视图">
            <IconGrid width={14} height={14} />
          </ToggleButton>
        </ToggleButtonGroup>

        <Tooltip>
          <Tooltip.Trigger>
            <Button
              size="sm"
              variant={multiSelect ? 'primary' : 'ghost'}
              onPress={onToggleMultiSelect}
            >
              多选
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            多选模式（Ctrl / Cmd + 单击追加，Shift + 单击选一段，Ctrl + A 全选）
          </Tooltip.Content>
        </Tooltip>

        {multiSelect ? (
          <Button
            size="sm"
            variant="ghost"
            onPress={onToggleSelectAll}
            isDisabled={matchedCount === 0}
          >
            {allSelected ? '取消全选' : '全选'}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
