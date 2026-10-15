import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  Button,
  Chip,
  Disclosure,
  EmptyState,
  Input,
  ScrollShadow,
  SearchField,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from '@heroui/react'
import { bucketTagsByGroup, pinnedTags } from '../../core/tagOps'
import { UNGROUPED_KEY } from '../../shared/constants'
import type { Tag, TagGroup, VirtualScope } from '../../shared/types'
import { cn } from '../../ui/cn'
import { IconClock, IconEllipsis, IconFolder, IconPin, IconPlus, IconTag } from '../../ui/icons'

/** 置顶标签拖拽排序时使用的私有 MIME，避免和「书签拖到标签」串味 */
const PIN_MIME = 'text/tagmark-pin'

interface TagPanelProps {
  tags: Tag[]
  groups: TagGroup[]
  counts: Map<string, number>
  totalCount: number
  recentCount: number
  untaggedCount: number
  scope: VirtualScope
  selectedTagIds: string[]
  onSelectScope: (scope: VirtualScope) => void
  onToggleTag: (id: string, additive: boolean) => void
  onNewTag: (name: string) => void
  onNewGroup: (name: string) => void
  onEditTag: (id: string) => void
  onEditGroup: (id: string) => void
  /** 置顶 / 取消置顶（左侧图钉按钮触发） */
  onPin: (id: string, pinned: boolean) => void
  /** 把书签拖到标签上直接关联 */
  onDropBookmarks: (tagId: string, bookmarkId: string) => void
  /** 把标签拖到分组里（groupId 为 null 表示拖到「未分组」） */
  onMoveTagToGroup: (tagId: string, groupId: string | null) => void
  /** 置顶标签拖拽后的新顺序 */
  onReorderPinned: (ids: string[]) => void
}

const SCOPES: Array<{ key: VirtualScope; label: string; icon: typeof IconTag }> = [
  { key: 'all', label: '全部', icon: IconTag },
  { key: 'recent', label: '最近打开', icon: IconClock },
  { key: 'untagged', label: '未分类', icon: IconTag },
]

export function TagPanel({
  tags,
  groups,
  counts,
  totalCount,
  recentCount,
  untaggedCount,
  scope,
  selectedTagIds,
  onSelectScope,
  onToggleTag,
  onNewTag,
  onNewGroup,
  onEditTag,
  onEditGroup,
  onPin,
  onDropBookmarks,
  onMoveTagToGroup,
  onReorderPinned,
}: TagPanelProps) {
  const [keyword, setKeyword] = useState('')
  const [creating, setCreating] = useState<'tag' | 'group' | null>(null)
  const [draft, setDraft] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dropTagId, setDropTagId] = useState<string | null>(null)
  const [dropGroupKey, setDropGroupKey] = useState<string | null>(null)
  /** 置顶区拖拽排序：插入位置（0..n） */
  const [pinDropIndex, setPinDropIndex] = useState<number | null>(null)
  const [draggingPinId, setDraggingPinId] = useState<string | null>(null)
  const pinListRef = useRef<HTMLDivElement | null>(null)
  /* 防止「回车」和随后 input 卸载触发的 blur 各提交一次 */
  const submittedRef = useRef(false)

  const searching = keyword.trim().length > 0

  const buckets = useMemo(() => {
    const value = keyword.trim().toLowerCase()
    const filtered = value ? tags.filter((tag) => tag.name.toLowerCase().includes(value)) : tags
    const all = bucketTagsByGroup(filtered, groups)
    // 搜索时隐藏没有命中的分组，减少噪音
    return value ? all.filter((bucket) => bucket.tags.length > 0) : all
  }, [keyword, tags, groups])

  /** 置顶标签单独成区：钉住的标签排在所有分组之前 */
  const pinList = useMemo(() => {
    const value = keyword.trim().toLowerCase()
    return pinnedTags(value ? tags.filter((tag) => tag.name.toLowerCase().includes(value)) : tags)
  }, [keyword, tags])

  const visibleCount = buckets.reduce((sum, bucket) => sum + bucket.tags.length, 0) + pinList.length

  // 筛选命中的标签时自动展开所在分组
  useEffect(() => {
    if (searching) setCollapsed(new Set())
  }, [searching])

  const scopeCount = (key: VirtualScope): number => {
    if (key === 'all') return totalCount
    if (key === 'recent') return recentCount
    return untaggedCount
  }

  const submitDraft = () => {
    if (submittedRef.current) return
    submittedRef.current = true
    const name = draft.trim()
    if (name) {
      if (creating === 'group') onNewGroup(name)
      else onNewTag(name)
    }
    setDraft('')
    setCreating(null)
  }

  const toggleCollapse = (key: string, expanded: boolean) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (expanded) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const renderTag = (tag: Tag, options?: { inPinZone?: boolean }) => {
    const active = selectedTagIds.includes(tag.id)
    const count = counts.get(tag.id) ?? 0
    const inPinZone = Boolean(options?.inPinZone)
    const dragging = draggingPinId === tag.id

    return (
      <span
        key={tag.id}
        draggable
        data-pin-chip={inPinZone ? '' : undefined}
        onDragStart={(event) => {
          event.dataTransfer.setData('text/tagmark-tag', tag.id)
          if (inPinZone) {
            // 带上私有类型，置顶区只对「置顶标签之间」的重排做响应
            event.dataTransfer.setData(PIN_MIME, tag.id)
            setDraggingPinId(tag.id)
          }
          event.dataTransfer.effectAllowed = 'move'
        }}
        onDragEnd={() => {
          setDraggingPinId(null)
          setPinDropIndex(null)
        }}
        onDragOver={(event) => {
          // 书签拖进来 = 关联标签；标签拖进来不处理（由分组容器接管）
          if (event.dataTransfer.types.includes('text/tagmark-bookmark')) {
            event.preventDefault()
            event.stopPropagation()
            setDropTagId(tag.id)
          }
        }}
        onDragLeave={() => setDropTagId((prev) => (prev === tag.id ? null : prev))}
        onDrop={(event) => {
          const bookmarkId = event.dataTransfer.getData('text/tagmark-bookmark')
          if (!bookmarkId) return
          event.preventDefault()
          event.stopPropagation()
          setDropTagId(null)
          onDropBookmarks(tag.id, bookmarkId)
        }}
        className={
          dropTagId === tag.id
            ? 'inline-flex max-w-full rounded-full ring-2 ring-[var(--accent)]'
            : cn('inline-flex max-w-full', inPinZone && 'cursor-grab active:cursor-grabbing', dragging && 'opacity-40')
        }
        title={inPinZone ? '拖拽可调整置顶顺序' : undefined}
      >
        <Chip
          color={active ? 'accent' : 'default'}
          variant={active ? 'primary' : 'soft'}
          size="sm"
          role="button"
          tabIndex={0}
          title="点击切换筛选（单选）；Ctrl / ⌘ / Shift + 点击可多选组合"
          className="group/chip max-w-full cursor-pointer transition hover:opacity-90"
          // 直接用事件上的修饰键判断「多选组合」，不依赖额外的 ref：
          // 之前用 ref 记录时，监听只挂在搜索栏那一小块上，点标签时 ref 永远是 false，
          // 于是 Ctrl / ⌘ / Shift + 点击被当成普通点击（每次替换筛选），组合筛选根本加不进第二个标签。
          onClick={(event) =>
            onToggleTag(tag.id, event.ctrlKey || event.metaKey || event.shiftKey)
          }
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onToggleTag(tag.id, event.ctrlKey || event.metaKey || event.shiftKey)
            }
          }}
        >
          <Chip.Label className="flex items-center gap-1">
            {/*
              置顶图钉放在标签最左侧。
              未置顶时用 visibility 隐藏（而不是 opacity）：既留出固定宽度的槽位、
              不会因为鼠标移入溢出图标而让后面的标签重排导致误点，也彻底不参与点击命中。
            */}
            <span
              className="grid size-3.5 shrink-0 place-items-center"
              onClick={(event) => event.stopPropagation()}
            >
              <Tooltip delay={400}>
                <Tooltip.Trigger>
                  <Button
                    size="sm"
                    isIconOnly
                    variant="ghost"
                    className={cn(
                      'size-3.5 min-h-0 min-w-0 rounded-full p-0',
                      tag.pinned
                        ? 'text-[var(--warning)] opacity-100'
                        : 'invisible text-current opacity-70 group-hover/chip:visible focus-visible:visible',
                    )}
                    aria-label={tag.pinned ? `取消置顶标签 ${tag.name}` : `置顶标签 ${tag.name}`}
                    onPress={() => onPin(tag.id, !tag.pinned)}
                  >
                    {/* 图钉本身很小，稍微加粗描边否则在浅色底上看不清 */}
                    <IconPin width={12} height={12} strokeWidth={2.2} />
                  </Button>
                </Tooltip.Trigger>
                <Tooltip.Content>{tag.pinned ? '取消置顶' : '置顶（排在列表最前）'}</Tooltip.Content>
              </Tooltip>
            </span>
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: active ? 'currentColor' : tag.color }}
              aria-hidden="true"
            />
            <span className="truncate">{tag.name}</span>
            <span className={active ? 'shrink-0 opacity-70 tabular-nums' : 'shrink-0 text-[var(--muted)] tabular-nums'}>
              {count}
            </span>
            <span className="shrink-0" onClick={(event) => event.stopPropagation()}>
              <Button
                size="sm"
                isIconOnly
                variant="ghost"
                className="size-5 min-h-0 min-w-0 rounded-full p-0 text-current opacity-60 hover:opacity-100"
                aria-label={`编辑标签 ${tag.name}`}
                onPress={() => onEditTag(tag.id)}
              >
                <IconEllipsis width={14} height={14} />
              </Button>
            </span>
          </Chip.Label>
        </Chip>
      </span>
    )
  }

  /**
   * 计算置顶标签的插入位置。
   * 芯片是多行换行的，所以先按指针 y 找到所在行，再用 x 判断在该行的哪两枚之间。
   */
  const computePinDropIndex = (event: DragEvent<HTMLDivElement>): number => {
    const list = pinListRef.current
    if (!list) return pinList.length
    const chips = Array.from(list.querySelectorAll<HTMLElement>('[data-pin-chip]'))
    if (chips.length === 0) return 0
    const rects = chips.map((chip) => chip.getBoundingClientRect())
    for (let index = 0; index < rects.length; index += 1) {
      const rect = rects[index]
      if (event.clientY < rect.top) return index
      if (event.clientY <= rect.bottom) {
        if (event.clientX < rect.left + rect.width / 2) return index
        // 同一行里继续往右找，直到遇到换行的下一枚
        for (let next = index + 1; next < rects.length; next += 1) {
          if (rects[next].top >= rect.bottom - 1) return next
          if (event.clientX < rects[next].left + rects[next].width / 2) return next
        }
        return rects.length
      }
    }
    return rects.length
  }

  const handlePinDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(PIN_MIME)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    setPinDropIndex(computePinDropIndex(event))
  }

  const handlePinDrop = (event: DragEvent<HTMLDivElement>) => {
    const draggedId = event.dataTransfer.getData(PIN_MIME)
    const index = pinDropIndex
    setPinDropIndex(null)
    setDraggingPinId(null)
    if (!draggedId || index === null) return
    event.preventDefault()
    event.stopPropagation()

    const ids = pinList.map((tag) => tag.id)
    const from = ids.indexOf(draggedId)
    if (from < 0) return
    const next = [...ids]
    next.splice(from, 1)
    // 移除自身后，插入位置要相应左移
    next.splice(index > from ? index - 1 : index, 0, draggedId)
    if (next.every((id, position) => id === ids[position])) return
    onReorderPinned(next)
  }

  /** 置顶区：钉住的标签排在最前，可在区内拖拽调整顺序 */
  const renderPinZone = () => {
    if (pinList.length === 0) return null
    return (
      <div className="mb-1 rounded-md border-b border-dashed border-[var(--separator)] pb-1">
        <div className="flex items-center gap-1.5 px-1 py-1 text-xs font-medium text-[var(--muted)]">
          <IconPin width={11} height={11} className="shrink-0 text-[var(--warning)]" />
          <span className="truncate">置顶</span>
          <span className="shrink-0 tabular-nums">{pinList.length}</span>
          <span className="ms-auto shrink-0 text-[10px] opacity-70">拖拽排序</span>
        </div>
        <div
          ref={pinListRef}
          onDragOver={handlePinDragOver}
          onDragLeave={(event) => {
            // 只在真正离开置顶区时清掉插入指示
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
            setPinDropIndex(null)
          }}
          onDrop={handlePinDrop}
          className="flex flex-wrap gap-1 px-1 pb-1"
        >
          {pinList.map((tag, index) => (
            <span key={tag.id} className="inline-flex items-center">
              {pinDropIndex === index ? (
                <span className="me-1 h-5 w-0.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden="true" />
              ) : null}
              {renderTag(tag, { inPinZone: true })}
            </span>
          ))}
          {pinDropIndex === pinList.length ? (
            <span className="h-5 w-0.5 shrink-0 self-center rounded-full bg-[var(--accent)]" aria-hidden="true" />
          ) : null}
        </div>
      </div>
    )
  }

  const renderBucket = (bucket: { group: TagGroup | null; tags: Tag[] }) => {
    const key = bucket.group?.id ?? UNGROUPED_KEY
    const isOpen = searching || !collapsed.has(key)
    const isDropTarget = dropGroupKey === key

    return (
      <div
        key={key}
        onDragOver={(event) => {
          // 置顶区内的排序拖拽不参与「移入分组」
          if (event.dataTransfer.types.includes(PIN_MIME)) return
          if (!event.dataTransfer.types.includes('text/tagmark-tag')) return
          event.preventDefault()
          setDropGroupKey(key)
        }}
        onDragLeave={() => setDropGroupKey((prev) => (prev === key ? null : prev))}
        onDrop={(event) => {
          if (event.dataTransfer.types.includes(PIN_MIME)) return
          const tagId = event.dataTransfer.getData('text/tagmark-tag')
          if (!tagId) return
          event.preventDefault()
          setDropGroupKey(null)
          onMoveTagToGroup(tagId, bucket.group?.id ?? null)
        }}
        className={
          isDropTarget
            ? 'mb-1 rounded-md bg-[var(--accent)]/15 ring-1 ring-dashed ring-[var(--accent)]'
            : 'mb-1 rounded-md'
        }
      >
        <Disclosure isExpanded={isOpen} onExpandedChange={(expanded) => toggleCollapse(key, expanded)}>
          <div className="flex items-center gap-1">
            <Disclosure.Heading className="min-w-0 flex-1">
              <Disclosure.Trigger className="flex w-full items-center gap-1.5 px-1 py-1 text-left text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)]">
                <Disclosure.Indicator width={11} height={11} className="ms-0 size-3 transition" />
                {bucket.group ? (
                  <span
                    className="size-2 shrink-0 rounded-sm"
                    style={{ backgroundColor: bucket.group.color }}
                    aria-hidden="true"
                  />
                ) : (
                  <IconFolder width={11} height={11} className="shrink-0" />
                )}
                <span className="truncate">{bucket.group?.name ?? '未分组'}</span>
                <span className="shrink-0 tabular-nums">{bucket.tags.length}</span>
              </Disclosure.Trigger>
            </Disclosure.Heading>
            {bucket.group ? (
              <Button
                size="sm"
                isIconOnly
                variant="ghost"
                className="size-5 min-h-0 min-w-0 rounded-full p-0 text-[var(--muted)]"
                aria-label={`编辑分组 ${bucket.group.name}`}
                onPress={() => onEditGroup(bucket.group!.id)}
              >
                <IconEllipsis width={14} height={14} />
              </Button>
            ) : null}
          </div>
          <Disclosure.Content>
            <div className="flex flex-wrap gap-1 px-1 pb-1">
              {bucket.tags.length === 0 ? (
                <EmptyState className="px-1 py-1 text-[11px] text-[var(--muted)]">
                  {bucket.group ? '把标签拖到这里' : '暂无未分组标签'}
                </EmptyState>
              ) : (
                bucket.tags.map((tag) => renderTag(tag))
              )}
            </div>
          </Disclosure.Content>
        </Disclosure>
      </div>
    )
  }

  const showGroupHeadings = groups.length > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-3 pb-2">
        <SearchField aria-label="过滤标签名" fullWidth value={keyword} onChange={setKeyword}>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="过滤标签名" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
      </div>

      <ScrollShadow className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <ToggleButtonGroup
          aria-label="范围"
          fullWidth
          size="sm"
          selectionMode="single"
          selectedKeys={new Set([scope])}
          onSelectionChange={(keys) => {
            const first = [...keys][0]
            if (first) onSelectScope(String(first) as VirtualScope)
          }}
          className="@container"
        >
          {SCOPES.map(({ key, label, icon: Icon }, index) => (
            <ToggleButton
              key={key}
              id={key}
              className="flex min-w-0 items-center justify-center gap-1 px-1 py-1 text-[11px]"
            >
              {index > 0 ? <ToggleButtonGroup.Separator /> : null}
              {/* 侧栏收窄到极限时优先保住文字，图标让位 */}
              <Icon width={13} height={13} className="shrink-0 @max-[250px]:hidden" />
              <span className="truncate">{label}</span>
              <span className="shrink-0 text-[10px] opacity-60 tabular-nums">
                {scopeCount(key).toLocaleString()}
              </span>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <div className="my-2 border-t border-dashed border-[var(--separator)]" />

        {visibleCount === 0 && searching ? (
          <EmptyState className="px-2 py-3 text-xs text-[var(--muted)]">没有匹配的标签</EmptyState>
        ) : tags.length === 0 ? (
          <EmptyState className="px-2 py-3 text-xs text-[var(--muted)]">
            还没有标签，下方新建一个
          </EmptyState>
        ) : (
          <>
            {renderPinZone()}
            {showGroupHeadings ? (
              buckets.map((bucket) => renderBucket(bucket))
            ) : (
              <div className="flex flex-wrap gap-1 px-1 py-1">
                {buckets[0]?.tags.map((tag) => renderTag(tag))}
              </div>
            )}
          </>
        )}
      </ScrollShadow>

      <div className="flex items-center gap-1 border-t border-[var(--separator)] p-2">
        {creating ? (
          <TextField
            className="w-full"
            value={draft}
            onChange={setDraft}
            onBlur={submitDraft}
            isDisabled={false}
          >
            <Input
              autoFocus
              placeholder={creating === 'group' ? '分组名，回车确认' : '标签名，回车确认'}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submitDraft()
                }
                if (event.key === 'Escape') {
                  setDraft('')
                  setCreating(null)
                }
              }}
            />
          </TextField>
        ) : (
          <>
            <Button
              size="sm"
              variant="ghost"
              fullWidth
              className="justify-start text-[var(--muted)]"
              onPress={() => {
                submittedRef.current = false
                setCreating('tag')
              }}
            >
              <IconPlus width={14} height={14} />
              新建标签
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-[var(--muted)]"
              onPress={() => {
                submittedRef.current = false
                setCreating('group')
              }}
            >
              <IconPlus width={14} height={14} />
              分组
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
