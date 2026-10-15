import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Bookmark, Tag, ViewMode } from '../../shared/types'
import { displayDomain, faviconUrl, highlightSegments, relativeTime } from '../../shared/utils'
import { Button, Checkbox, EmptyState, Tooltip } from '@heroui/react'
import type { ReactNode } from 'react'
import { cn } from '../../ui/cn'
import { TagChip } from '../../ui/TagChip'
import { IconEdit, IconExternal, IconTrash } from '../../ui/icons'

interface BookmarkListProps {
  items: Bookmark[]
  tagById: Map<string, Tag>
  keywords: string[]
  selectedIds: Set<string>
  multiSelect: boolean
  view: ViewMode
  activeIndex: number
  emptyHint?: string
  onToggleSelect: (id: string, additive: boolean) => void
  /** 勾选框直接切换某一条的选中态（进入多选模式） */
  onSetSelected: (id: string, selected: boolean) => void
  /** 点击条目时把「当前项」高亮移过去 */
  onActivate: (index: number) => void
  /** 双击书签时调用：统一在新标签页打开 */
  onOpen: (bookmark: Bookmark) => void
  /** 中键单击：后台新标签打开 */
  onOpenBackground: (bookmark: Bookmark) => void
  onFilterByTag: (tagId: string) => void
  onEditTags: (bookmark: Bookmark) => void
  onDelete: (bookmark: Bookmark) => void
}

/**
 * 标签点击筛选的延迟（ms）。
 * 列表里双击整行 = 打开书签，而鼠标很可能正好落在标签上：
 * 若单击立即筛选，就会出现「想打开书签却变成筛选标签」。
 * 所以筛选延后一拍，双击时把它取消掉。
 */
const TAG_FILTER_DELAY = 220

interface TagFilterScheduler {
  schedule: (tagId: string) => void
  cancel: () => void
}

/** 把「单击标签筛选」延迟到一拍之后再执行，便于被双击取消 */
function useTagFilterScheduler(onFilterByTag: (tagId: string) => void): TagFilterScheduler {
  const timerRef = useRef<number | null>(null)
  const onFilterRef = useRef(onFilterByTag)
  onFilterRef.current = onFilterByTag

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => cancel, [cancel])

  const schedule = useCallback(
    (tagId: string) => {
      cancel()
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        onFilterRef.current(tagId)
      }, TAG_FILTER_DELAY)
    },
    [cancel],
  )

  return { schedule, cancel }
}

const LIST_MIN_ROW_HEIGHT = 60
const GRID_CARD_MIN_HEIGHT = 132
const TAG_LINE_HEIGHT = 19
const COLUMN_GAP = 12
const GRID_CARD_WIDTH = 248
/** 折叠芯片「+N」预留宽度（≈「+9」的实测宽度，宁松勿紧，避免把 +N 自己裁掉） */
const MORE_CHIP_WIDTH = 36
const CHIP_GAP = 4

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

/** 粗略估算一段文字在 11px 字号下的像素宽度（中文≈11px，西文≈6px） */
function estimateTextWidth(text: string, fontPx: number): number {
  let width = 0
  for (const char of text) width += CJK_RE.test(char) ? fontPx : fontPx * 0.55
  return width
}

export function BookmarkList(props: BookmarkListProps) {
  const {
    items,
    tagById,
    keywords,
    selectedIds,
    multiSelect,
    view,
    activeIndex,
    emptyHint,
    onToggleSelect,
    onSetSelected,
    onActivate,
    onOpen,
    onOpenBackground,
    onFilterByTag,
    onEditTags,
    onDelete,
  } = props

  /** 标签筛选延后一拍执行，双击打开书签时会取消，避免误筛选 */
  const tagFilter = useTagFilterScheduler(onFilterByTag)

  const containerRef = useRef<HTMLDivElement>(null)
  /** 只用来算网格视图的列数；虚拟化的可视区高度由 virtualizer 自己跟踪 */
  const [viewportWidth, setViewportWidth] = useState(1200)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return undefined
    const observer = new ResizeObserver(() => setViewportWidth(element.clientWidth))
    observer.observe(element)
    setViewportWidth(element.clientWidth)
    return () => observer.disconnect()
  }, [])

  const perRow = view === 'grid' ? Math.max(1, Math.floor((viewportWidth - 24) / GRID_CARD_WIDTH)) : 1
  const rowCount = Math.ceil(items.length / perRow)

  /** 行高估算（仅用于尚未实测过的行：标签换行会改变行高） */
  const estimateRowHeight = useCallback(
    (rowIndex: number): number => {
      const start = rowIndex * perRow
      const slice = items.slice(start, start + perRow)
      if (slice.length === 0) return view === 'grid' ? GRID_CARD_MIN_HEIGHT : LIST_MIN_ROW_HEIGHT

      let maxHeight = 0
      for (const bookmark of slice) {
        const chipsWidth = bookmark.tagIds.reduce((sum, id) => {
          const name = tagById.get(id)?.name ?? id
          return sum + estimateTextWidth(name, 11) + 22
        }, 0)
        if (view === 'list') {
          const available = Math.max(140, viewportWidth - 300)
          const lines = chipsWidth === 0 ? 0 : Math.ceil(chipsWidth / available)
          maxHeight = Math.max(maxHeight, LIST_MIN_ROW_HEIGHT + Math.max(0, lines - 1) * TAG_LINE_HEIGHT)
        } else {
          // 网格卡片标签固定单行（超出折叠为 +N），高度不随标签数量变化
          maxHeight = Math.max(maxHeight, GRID_CARD_MIN_HEIGHT)
        }
      }
      return maxHeight
    },
    [items, perRow, tagById, view, viewportWidth],
  )

  /* ---------------- 虚拟列表：让 @tanstack/react-virtual 负责实测行高与滚动锚定 ----------------
   * 自己维护 offsets 的版本会在每次实测到新行高时重算总高度，
   * 再把 scrollTop 拉回去，表现就是「往下滚会弹回顶部」，这里交给库处理。 */
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => containerRef.current,
    estimateSize: estimateRowHeight,
    overscan: 8,
    // 网格视图行与行之间需要间距；列表视图靠行自身高度即可
    gap: view === 'grid' ? COLUMN_GAP : 0,
    // 用行首书签 id 作为 key，列表内容变化（筛选/排序）后旧的高度缓存自然失效
    getItemKey: (index) => items[index * perRow]?.id ?? `row-${index}`,
  })

  // 视图 / 每行列数 / 容器宽度变化后，行高（标签换行位置）会变，实测缓存必须失效
  useEffect(() => {
    rowVirtualizer.measure()
  }, [rowVirtualizer, view, perRow, viewportWidth])

  /* 键盘导航时把当前项滚进可视区：只在 activeIndex 真正变化时滚动，避免滚动中被拉回顶部 */
  const lastActiveRef = useRef(activeIndex)
  /** 鼠标点击引起的「当前项」变化不需要滚动，否则视口会有细微跳动 */
  const skipScrollRef = useRef(false)
  useEffect(() => {
    if (lastActiveRef.current === activeIndex) return
    lastActiveRef.current = activeIndex
    if (skipScrollRef.current) {
      skipScrollRef.current = false
      return
    }
    if (activeIndex < 0 || rowCount === 0) return
    rowVirtualizer.scrollToIndex(Math.min(rowCount - 1, Math.floor(activeIndex / perRow)), {
      align: 'auto',
    })
  }, [activeIndex, perRow, rowCount, rowVirtualizer])

  const handleActivate = useCallback(
    (index: number) => {
      skipScrollRef.current = true
      onActivate(index)
    },
    [onActivate],
  )

  const handleDragStart = (event: DragEvent, bookmark: Bookmark) => {
    event.dataTransfer.setData('text/tagmark-bookmark', bookmark.id)
    event.dataTransfer.effectAllowed = 'link'
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-10">
        <EmptyState className="text-center text-sm text-[var(--muted)]">
          {emptyHint ?? '没有匹配的书签'}
        </EmptyState>
      </div>
    )
  }

  const virtualRows = rowVirtualizer.getVirtualItems()

  return (
    <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
      <div style={{ height: rowVirtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
        {virtualRows.map((virtualRow) => {
          const rowStart = virtualRow.index * perRow
          const rowItems = items.slice(rowStart, rowStart + perRow)
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className={cn('absolute top-0 left-0 w-full', view === 'grid' && 'grid')}
              style={{
                transform: `translateY(${virtualRow.start}px)`,
                ...(view === 'grid'
                  ? { gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))`, columnGap: COLUMN_GAP }
                  : undefined),
              }}
            >
              {rowItems.map((bookmark, index) => {
                const absoluteIndex = rowStart + index
                const active = absoluteIndex === activeIndex
                const selected = selectedIds.has(bookmark.id)
                return view === 'grid' ? (
                  <BookmarkCard
                    key={bookmark.id}
                    bookmark={bookmark}
                    tagById={tagById}
                    keywords={keywords}
                    selected={selected}
                    active={active}
                    selectOnClick={multiSelect}
                    onDragStart={handleDragStart}
                    onToggleSelect={onToggleSelect}
                    onSetSelected={onSetSelected}
                    onActivate={() => handleActivate(absoluteIndex)}
                    onOpen={onOpen}
                    onOpenBackground={onOpenBackground}
                    tagFilter={tagFilter}
                    onEditTags={onEditTags}
                    onDelete={onDelete}
                  />
                ) : (
                  <BookmarkRow
                    key={bookmark.id}
                    bookmark={bookmark}
                    tagById={tagById}
                    keywords={keywords}
                    selected={selected}
                    active={active}
                    showCheckbox={multiSelect || selectedIds.size > 0}
                    selectOnClick={multiSelect}
                    onDragStart={handleDragStart}
                    onToggleSelect={onToggleSelect}
                    onSetSelected={onSetSelected}
                    onActivate={() => handleActivate(absoluteIndex)}
                    onOpen={onOpen}
                    onOpenBackground={onOpenBackground}
                    tagFilter={tagFilter}
                    onEditTags={onEditTags}
                    onDelete={onDelete}
                  />
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface ItemProps {
  bookmark: Bookmark
  tagById: Map<string, Tag>
  keywords: string[]
  selected: boolean
  active: boolean
  /** 多选模式下单击整行即切换勾选，双击不再跳转 */
  selectOnClick: boolean
  onDragStart: (event: DragEvent, bookmark: Bookmark) => void
  onToggleSelect: (id: string, additive: boolean) => void
  onSetSelected: (id: string, selected: boolean) => void
  onActivate: () => void
  onOpen: (bookmark: Bookmark) => void
  onOpenBackground: (bookmark: Bookmark) => void
  /** 单击标签（延后一拍生效） */
  tagFilter: TagFilterScheduler
  onEditTags: (bookmark: Bookmark) => void
  onDelete: (bookmark: Bookmark) => void
}

function Highlighted({ text, keywords }: { text: string; keywords: string[] }) {
  const segments = highlightSegments(text, keywords)
  return (
    <>
      {segments.map((segment, index) =>
        segment.match ? (
          <mark key={index} className="rounded bg-[var(--warning)]/40 px-0.5 text-inherit">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  )
}

/** 渲染该条书签的全部标签（列表模式，允许换行，不做 +N 折叠） */
function TagChips({
  bookmark,
  tagById,
  tagFilter,
}: Pick<ItemProps, 'bookmark' | 'tagById' | 'tagFilter'>) {
  if (bookmark.tagIds.length === 0) return null
  return (
    // 双击标签也交给整行处理（打开书签），单击才延后触发筛选
    <span className="flex flex-wrap items-center gap-1">
      {bookmark.tagIds.map((id) => {
        const tag = tagById.get(id)
        return (
          <TagChip
            key={id}
            name={tag?.name ?? id}
            color={tag?.color}
            size="sm"
            onPress={() => tagFilter.schedule(id)}
          />
        )
      })}
    </span>
  )
}

/**
 * 网格卡片底部的标签行：固定单行，放不下的折叠为「+N」，鼠标移入可看到剩余标签。
 * 所有芯片都会渲染出来量一次真实宽度（被折叠的用 absolute + invisible 移出流），
 * 因此宽度是实测值而不是估算值，换行裁剪不会出现半截。
 */
function CardTagRow({
  bookmark,
  tagById,
  tagFilter,
}: Pick<ItemProps, 'bookmark' | 'tagById' | 'tagFilter'>) {
  const rowRef = useRef<HTMLSpanElement>(null)
  const [visibleCount, setVisibleCount] = useState(bookmark.tagIds.length)

  const recompute = useCallback(() => {
    const row = rowRef.current
    if (!row) return
    const available = row.clientWidth
    if (available <= 0) return
    const widths = Array.from(row.querySelectorAll<HTMLElement>('[data-tag-chip]')).map(
      (chip) => chip.offsetWidth + CHIP_GAP,
    )
    if (widths.length === 0) return

    const total = widths.reduce((sum, width) => sum + width, 0)
    if (total <= available + CHIP_GAP) {
      setVisibleCount(widths.length)
      return
    }
    // 放不下：给「+N」预留位置后再往前收
    const budget = available + CHIP_GAP - MORE_CHIP_WIDTH - CHIP_GAP
    let count = widths.length
    let used = total
    while (count > 0 && used > budget) {
      count -= 1
      used -= widths[count]
    }
    setVisibleCount(count)
  }, [])

  useEffect(() => {
    recompute()
    const row = rowRef.current
    if (!row) return undefined
    const observer = new ResizeObserver(recompute)
    observer.observe(row)
    return () => observer.disconnect()
  }, [recompute, bookmark.tagIds])

  if (bookmark.tagIds.length === 0) return null

  const hiddenIds = bookmark.tagIds.slice(visibleCount)

  return (
    <span
      ref={rowRef}
      className="relative flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-hidden"
    >
      {bookmark.tagIds.map((id, index) => {
        const tag = tagById.get(id)
        const hidden = index >= visibleCount
        return (
          <span
            key={id}
            data-tag-chip
            className={cn(
              'shrink-0',
              // 被折叠的芯片仍在 DOM 里（用于实测宽度），但要移出布局与交互
              hidden && 'pointer-events-none invisible absolute w-max',
            )}
          >
            <TagChip
              name={tag?.name ?? id}
              color={tag?.color}
              size="sm"
              onPress={() => tagFilter.schedule(id)}
            />
          </span>
        )
      })}
      {hiddenIds.length > 0 ? (
        <Tooltip delay={120}>
          <Tooltip.Trigger>
            <span
              className="shrink-0 cursor-help rounded-full bg-[var(--default)] px-1.5 py-0.5 text-[11px] text-[var(--muted)]"
              onClick={(event) => event.stopPropagation()}
            >
              +{hiddenIds.length}
            </span>
          </Tooltip.Trigger>
          <Tooltip.Content>
            <span className="flex flex-col gap-1.5">
              <span className="text-[11px] opacity-70">还有 {hiddenIds.length} 个标签</span>
              <span className="flex max-w-[240px] flex-wrap gap-1">
                {hiddenIds.map((id) => (
                  <TagChip
                    key={id}
                    name={tagById.get(id)?.name ?? id}
                    color={tagById.get(id)?.color}
                    size="sm"
                  />
                ))}
              </span>
            </span>
          </Tooltip.Content>
        </Tooltip>
      ) : null}
    </span>
  )
}

/** 行内图标按钮：统一 HeroUI Button + Tooltip，并阻止冒泡到外层行 */
function IconAction({
  label,
  danger,
  onPress,
  children,
}: {
  label: string
  danger?: boolean
  onPress: () => void
  children: ReactNode
}) {
  return (
    <span
      className="inline-flex"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <Tooltip delay={400}>
        <Tooltip.Trigger>
          <Button
            size="sm"
            isIconOnly
            variant="ghost"
            aria-label={label}
            className={cn(
              'size-6 min-h-0 min-w-0 rounded p-0 text-[var(--muted)]',
              danger && 'hover:text-[var(--danger)]',
            )}
            onPress={onPress}
          >
            {children}
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content>{label}</Tooltip.Content>
      </Tooltip>
    </span>
  )
}

function Favicon({ url }: { url: string }) {
  return (
    <img
      src={faviconUrl(url, 32)}
      alt=""
      loading="lazy"
      className="size-5 shrink-0 rounded"
      onError={(event) => {
        event.currentTarget.style.visibility = 'hidden'
      }}
    />
  )
}

const BookmarkRow = ({
  bookmark,
  tagById,
  keywords,
  selected,
  active,
  showCheckbox,
  selectOnClick,
  onDragStart,
  onToggleSelect,
  onSetSelected,
  onActivate,
  onOpen,
  onOpenBackground,
  tagFilter,
  onEditTags,
  onDelete,
}: ItemProps & { showCheckbox: boolean }) => {
  /** 连点两下勾选框时，第二次 change 忽略掉，避免「选了又取消」 */
  const lastToggleRef = useRef(0)
  /** 最近一次点到勾选框的时间：双击事件可能先于多选状态生效，这里兜一层 */
  const checkboxTouchedRef = useRef(0)

  const handleCheckboxChange = (value: boolean) => {
    const now = Date.now()
    const isRapidRepeat = now - lastToggleRef.current < 350
    lastToggleRef.current = now
    if (isRapidRepeat) return
    onSetSelected(bookmark.id, value)
  }

  return (
    <div
      draggable
      onDragStart={(event) => onDragStart(event, bookmark)}
      onClick={(event) => {
        onActivate()
        // 多选模式：单击整行切换勾选；按住 Ctrl / Cmd 时追加勾选
        if (event.ctrlKey || event.metaKey) {
          onToggleSelect(bookmark.id, true)
          return
        }
        if (selectOnClick) onToggleSelect(bookmark.id, false)
      }}
      onDoubleClick={() => {
        // 双击时取消尚未生效的「标签筛选」，确保这次双击一定是打开书签
        tagFilter.cancel()
        // 双击落在勾选框上时不要打开页面（第二次点击可能晚于多选状态生效）
        if (Date.now() - checkboxTouchedRef.current < 400) return
        if (!selectOnClick) onOpen(bookmark)
      }}
      onAuxClick={(event) => {
        if (event.button === 1) {
          event.preventDefault()
          onOpenBackground(bookmark)
        }
      }}
      className={cn(
        'group flex min-h-[60px] cursor-pointer items-center gap-3 rounded-[var(--radius)] px-3 py-2 transition',
        active ? 'bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]/40' : 'hover:bg-[var(--default)]',
        selected && 'bg-[var(--accent)]/20',
      )}
    >
      {showCheckbox ? (
        <span
          className="shrink-0"
          onClick={(event) => {
            checkboxTouchedRef.current = Date.now()
            event.stopPropagation()
          }}
          // 连点两下勾选框不该冒泡到整行的双击「打开」逻辑
          onDoubleClick={(event) => event.stopPropagation()}
        >
          {/* 必须带上 Checkbox.Content：没有它时组件不会渲染可点击的 label/input，点了没反应 */}
          <Checkbox
            aria-label={`选择 ${bookmark.title}`}
            isSelected={selected}
            onChange={handleCheckboxChange}
          >
            <Checkbox.Content>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
            </Checkbox.Content>
          </Checkbox>
        </span>
      ) : null}

      <Favicon url={bookmark.url} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium" title={bookmark.title}>
            <Highlighted text={bookmark.title} keywords={keywords} />
          </span>
          <span className="shrink-0 truncate text-xs text-[var(--muted)]" title={bookmark.url}>
            <Highlighted text={displayDomain(bookmark.url)} keywords={keywords} />
          </span>
        </div>
        {bookmark.tagIds.length > 0 ? (
          <div className="mt-1">
            <TagChips bookmark={bookmark} tagById={tagById} tagFilter={tagFilter} />
          </div>
        ) : null}
      </div>

      <div className="hidden shrink-0 flex-col items-end text-[11px] text-[var(--muted)] sm:flex">
        <span>{bookmark.openCount > 0 ? `${bookmark.openCount} 次` : '未打开'}</span>
        <span>{relativeTime(bookmark.lastOpenedAt ?? bookmark.createdAt)}</span>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
        <IconAction label="打开（新标签页）" onPress={() => onOpen(bookmark)}>
          <IconExternal width={14} height={14} />
        </IconAction>
        <IconAction label="编辑标签" onPress={() => onEditTags(bookmark)}>
          <IconEdit width={14} height={14} />
        </IconAction>
        <IconAction label="移入回收站" danger onPress={() => onDelete(bookmark)}>
          <IconTrash width={14} height={14} />
        </IconAction>
      </div>
    </div>
  )
}

const BookmarkCard = ({
  bookmark,
  tagById,
  keywords,
  selected,
  active,
  selectOnClick,
  onDragStart,
  onToggleSelect,
  onActivate,
  onOpen,
  onOpenBackground,
  tagFilter,
  onEditTags,
  onDelete,
}: ItemProps) => {
  return (
    <div
      draggable
      onDragStart={(event) => onDragStart(event, bookmark)}
      onClick={(event) => {
        onActivate()
        // 多选模式：单击整块切换勾选；按住 Ctrl / Cmd 时追加勾选
        if (event.ctrlKey || event.metaKey) {
          onToggleSelect(bookmark.id, true)
          return
        }
        if (selectOnClick) onToggleSelect(bookmark.id, false)
      }}
      onDoubleClick={() => {
        // 双击时取消尚未生效的「标签筛选」，确保这次双击一定是打开书签
        tagFilter.cancel()
        if (!selectOnClick) onOpen(bookmark)
      }}
      onAuxClick={(event) => {
        if (event.button === 1) {
          event.preventDefault()
          onOpenBackground(bookmark)
        }
      }}
      className={cn(
        'group flex min-h-[132px] cursor-pointer flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] p-3 transition',
        active ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'hover:bg-[var(--default)]',
        selected && 'bg-[var(--accent)]/20',
      )}
    >
      <div className="flex items-start gap-2">
        <Favicon url={bookmark.url} />
        <span className="line-clamp-3 flex-1 text-sm font-medium" title={bookmark.title}>
          <Highlighted text={bookmark.title} keywords={keywords} />
        </span>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
          <IconAction label="编辑标签" onPress={() => onEditTags(bookmark)}>
            <IconEdit width={13} height={13} />
          </IconAction>
          <IconAction label="移入回收站" danger onPress={() => onDelete(bookmark)}>
            <IconTrash width={13} height={13} />
          </IconAction>
        </div>
      </div>
      <p className="truncate text-xs text-[var(--muted)]" title={bookmark.url}>
        <Highlighted text={displayDomain(bookmark.url)} keywords={keywords} />
      </p>
      {/* 标签与打开次数一起沉到卡片底部，和标题信息拉开距离 */}
      <div className="mt-auto flex items-end gap-2">
        <CardTagRow bookmark={bookmark} tagById={tagById} tagFilter={tagFilter} />
        <span className="shrink-0 text-[11px] text-[var(--muted)]">
          {bookmark.openCount > 0 ? `${bookmark.openCount} 次` : ''}
        </span>
      </div>
    </div>
  )
}
