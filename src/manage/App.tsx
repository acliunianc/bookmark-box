import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Checkbox, Description, Spinner } from '@heroui/react'
import { ROOT_FOLDER_NAME, walkFolderTree } from '../core/parseTree'
import { filterBookmarks, parseQuery, sortBookmarks } from '../core/search'
import { RECENT_WINDOW_MS, tagIdOf } from '../shared/constants'
import { send } from '../shared/messages'
import type { Bookmark, FilterLogic, FolderNode, SortKey, ViewMode, VirtualScope } from '../shared/types'
import { useToast } from '../ui/toast'
import { BookmarkList } from './components/BookmarkList'
import { Sidebar } from './components/Sidebar'
import { SelectionBar } from './components/SelectionBar'
import { TagPanel } from './components/TagPanel'
import { TagDetailDialog } from './components/TagDetailDialogs'
import { Toolbar } from './components/Toolbar'
import { TopBar, type SearchFolderOption, type SearchLauncher } from './components/TopBar'
import { TreePanel } from './components/TreePanel'
import { BatchTagDialog } from './components/dialogs/BatchTagDialog'
import { ConfirmDialog } from './components/dialogs/ConfirmDialog'
import { ExportDialog } from './components/dialogs/ExportDialog'
import { ImportDialog } from './components/dialogs/ImportDialog'
import { SettingsDialog } from './components/dialogs/SettingsDialog'
import { TagEditDialog } from './components/dialogs/TagEditDialog'
import { useStore } from './store'

interface UiFilter {
  scope: VirtualScope
  tagIds: string[]
  logic: FilterLogic
  query: string
  treePath?: string
  sort: SortKey
  view: ViewMode
}

const INITIAL_FILTER: UiFilter = {
  scope: 'all',
  tagIds: [],
  logic: 'AND',
  query: '',
  sort: 'lastOpened',
  view: 'list',
}

export function ManageApp() {
  const store = useStore()
  const toast = useToast()
  const searchLauncherRef = useRef<SearchLauncher | null>(null)

  const [filter, setFilter] = useState<UiFilter>(INITIAL_FILTER)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [multiSelect, setMultiSelect] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const [batchNode, setBatchNode] = useState<FolderNode | null>(null)
  const [editTargets, setEditTargets] = useState<Bookmark[] | null>(null)
  const [editIntent, setEditIntent] = useState<'add' | 'remove'>('add')
  const [editTagId, setEditTagId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [confirmState, setConfirmState] = useState<{
    title: string
    message: React.ReactNode
    confirmLabel: string
    danger?: boolean
    /** 有值且 > 0 时，弹窗里显示「同步删除浏览器书签」勾选项（默认不勾选） */
    browserSyncedCount?: number
    /** syncBrowser 为弹窗里勾选项的当前值 */
    run: (syncBrowser: boolean) => void
  } | null>(null)
  /** 「同步删除浏览器书签」勾选状态：每次打开删除确认弹窗都重置为不勾选 */
  const [deleteSyncBrowser, setDeleteSyncBrowser] = useState(false)
  const [pending, setPending] = useState(false)

  /* ------------------------------ 主题 ------------------------------ */
  useEffect(() => {
    const { theme } = store.settings
    const resolved =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme
    document.documentElement.dataset.theme = resolved
  }, [store.settings])

  /* ------------------------------ 统计 ------------------------------ */
  const stats = useMemo(() => {
    const now = Date.now()
    const tagCounts = new Map<string, number>()
    let recent = 0
    let untagged = 0
    for (const bookmark of store.bookmarks) {
      if (bookmark.lastOpenedAt && now - bookmark.lastOpenedAt <= RECENT_WINDOW_MS) recent += 1
      if (bookmark.tagIds.length === 0) untagged += 1
      for (const id of bookmark.tagIds) tagCounts.set(id, (tagCounts.get(id) ?? 0) + 1)
    }
    return { tagCounts, recent, untagged }
  }, [store.bookmarks])

  /** 顶部搜索 `in:` 补全用的文件夹列表（跳过合成根「书签」） */
  const searchFolders = useMemo<SearchFolderOption[]>(() => {
    if (!store.tree) return []
    const out: SearchFolderOption[] = []
    walkFolderTree(store.tree.root, (node) => {
      if (!node.path || node.path === ROOT_FOLDER_NAME) return
      out.push({ name: node.name, path: node.path, totalCount: node.totalCount })
    })
    return out
  }, [store.tree])

  /* ------------------------------ 过滤 ------------------------------ */
  const { keywordHits, keywords, folderQuery, queryTagIds } = useMemo(() => {
    const parsed = parseQuery(filter.query)
    return {
      keywordHits: store.index.search(parsed.keywords),
      keywords: parsed.keywords,
      folderQuery: parsed.folder,
      queryTagIds: parsed.tagIds,
    }
  }, [filter.query, store.index])

  /**
   * 侧栏选中的标签 + 搜索框里 `#标签` 写的标签，统一参与 AND / OR 组合。
   * 之前 `parseQuery` 解析出的 tagIds 被丢掉了，所以 `#java` 这类写法完全不起作用。
   */
  const activeTagIds = useMemo(
    () => [...new Set([...filter.tagIds, ...queryTagIds])],
    [filter.tagIds, queryTagIds],
  )

  const visible = useMemo(() => {
    const filtered = filterBookmarks(store.bookmarks, {
      tagIds: activeTagIds,
      logic: filter.logic,
      scope: filter.scope,
      recentWindowMs: RECENT_WINDOW_MS,
      treePath: filter.treePath,
      keywordHits,
      folderQuery,
    })
    return sortBookmarks(filtered, filter.sort)
  }, [
    store.bookmarks,
    activeTagIds,
    filter.logic,
    filter.scope,
    filter.treePath,
    filter.sort,
    keywordHits,
    folderQuery,
  ])

  useEffect(() => {
    setActiveIndex(visible.length > 0 ? 0 : -1)
  }, [filter.query, filter.tagIds, filter.scope, filter.treePath, filter.sort, visible.length])

  /* ------------------------------ 操作 ------------------------------ */
  const patchFilter = (patch: Partial<UiFilter>) => setFilter((prev) => ({ ...prev, ...patch }))

  /**
   * 范围选择的锚点：上一次「普通点击 / 方向键定位」所在的下标。
   * Shift + 点击 / Shift + 方向键时从锚点算起，这样连续按 Shift 能稳定地扩选，
   * 而不会因为「当前项」跟着移动导致范围反复收缩。
   */
  const anchorIndexRef = useRef(0)

  /** 点击条目：既把高亮移过去，也把范围选择锚点挪过去 */
  const activateItem = useCallback((index: number) => {
    anchorIndexRef.current = index
    setActiveIndex(index)
  }, [])

  const toggleSelect = useCallback((id: string, additive: boolean) => {
    // Ctrl / Cmd 追加勾选时说明用户在挑多条，直接切到多选模式（勾选框随之出现）
    if (additive) setMultiSelect(true)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (additive) {
        if (next.has(id)) next.delete(id)
        else next.add(id)
      } else if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  /** 勾选框直接切换某一条：同样进入多选模式 */
  const setSelected = useCallback((id: string, selected: boolean) => {
    setMultiSelect(true)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (selected) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  /**
   * Shift + 点击：把「锚点 → 该条」之间的书签并入选中集。
   * 用并集而不是替换，方便连续 Shift 点几下拼出想要的组合。
   */
  const selectRange = useCallback(
    (index: number) => {
      setMultiSelect(true)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        const from = Math.min(anchorIndexRef.current, index)
        const to = Math.max(anchorIndexRef.current, index)
        for (const bookmark of visible.slice(from, to + 1)) next.add(bookmark.id)
        return next
      })
      setActiveIndex(index)
    },
    [visible],
  )

  /** 全选当前筛选结果 */
  const selectAll = useCallback(() => {
    setMultiSelect(true)
    setSelectedIds(new Set(visible.map((bookmark) => bookmark.id)))
  }, [visible])

  /** 当前筛选结果是否已全部选中（用于「全选 / 取消全选」按钮的文案） */
  const allSelected = visible.length > 0 && visible.every((bookmark) => selectedIds.has(bookmark.id))

  const toggleSelectAll = useCallback(() => {
    if (allSelected) setSelectedIds(new Set())
    else selectAll()
  }, [allSelected, selectAll])

  /** 打开书签：统一在新标签页打开，管理页保持原地不动 */
  const openBookmark = useCallback(
    async (bookmark: Bookmark) => {
      try {
        const result = await send('bookmark/recordOpen', { id: bookmark.id })
        if (result.bookmark) store.applyBookmarks([result.bookmark])
      } catch {
        /* 记录失败不影响打开 */
      }
      await chrome.tabs.create({ url: bookmark.url, active: true })
    },
    [store],
  )

  const openBackground = useCallback(
    async (bookmark: Bookmark) => {
      try {
        const result = await send('bookmark/recordOpen', { id: bookmark.id })
        if (result.bookmark) store.applyBookmarks([result.bookmark])
      } catch {
        /* ignore */
      }
      await chrome.tabs.create({ url: bookmark.url, active: false })
    },
    [store],
  )

  const softDelete = useCallback(
    async (ids: string[], syncBrowser: boolean) => {
      const now = Date.now()
      const result = await send('bookmark/delete', { ids, syncBrowser })
      store.applyBookmarks(
        ids
          .map((id) => store.bookmarks.find((item) => item.id === id))
          .filter((item): item is Bookmark => Boolean(item))
          .map((item) => ({ ...item, deletedAt: now })),
      )
      setSelectedIds(new Set())
      toast.push({
        message: `已移入回收站 ${ids.length} 条`,
        description: syncBrowser
          ? `已同时删除本机浏览器书签 ${result.browserRemoved} 条 · 可在「设置 → 回收站」恢复`
          : '可在「设置 → 回收站」恢复',
        variant: 'info',
      })
    },
    [store, toast],
  )

  /** 打开删除确认弹窗：顺带算出其中已同步到浏览器书签的条数，决定是否给出同步删除勾选项 */
  const askDelete = useCallback(
    (ids: string[]) => {
      const browserSyncedCount = store.bookmarks.filter(
        (item) => ids.includes(item.id) && item.browserBookmarkId,
      ).length
      setDeleteSyncBrowser(false)
      setConfirmState({
        title: '移入回收站',
        message: `将选中的 ${ids.length} 条书签移入回收站（保留 30 天，可恢复）。`,
        confirmLabel: '移入回收站',
        danger: true,
        browserSyncedCount,
        // syncBrowser 由弹窗里的勾选项在确认那一刻传入，避免闭包拿到旧值
        run: (syncBrowser) => void softDelete(ids, syncBrowser),
      })
    },
    [store, softDelete],
  )

  /**
   * 置顶 / 取消置顶，并给一次「短时间撤销」。
   * 图钉就贴在标签左侧，很容易顺手点到，所以撤销里要把原来的置顶顺序也带回去。
   */
  const toggleTagPin = useCallback(
    (id: string, pinned: boolean) => {
      void (async () => {
        const before = store.tags.find((tag) => tag.id === id)
        const name = before?.name ?? '标签'
        try {
          const result = await send('tag/pin', { id, pinned })
          store.applyTags(result.tags)
          const restoreOrder = typeof before?.pinOrder === 'number' ? before.pinOrder : undefined
          toast.push({
            message: pinned ? `已置顶「${name}」` : `已取消置顶「${name}」`,
            description: pinned ? '可在置顶区拖拽调整顺序' : '撤销后回到原来的位置',
            variant: 'info',
            duration: 6000,
            action: {
              label: '撤销',
              onClick: () => {
                void (async () => {
                  try {
                    const undo = await send('tag/pin', {
                      id,
                      pinned: !pinned,
                      pinOrder: pinned ? undefined : restoreOrder,
                    })
                    store.applyTags(undo.tags)
                    toast.success(`已恢复「${name}」的置顶状态`)
                  } catch (error) {
                    toast.danger(error instanceof Error ? error.message : String(error))
                  }
                })()
              },
            },
          })
        } catch (error) {
          toast.danger(error instanceof Error ? error.message : String(error))
        }
      })()
    },
    [store, toast],
  )

  const offerUndo = useCallback(
    (message: string) => {
      toast.push({
        message,
        description: '5 秒内可撤销本次操作',
        variant: 'success',
        duration: 5200,
        action: {
          label: '撤销',
          onClick: () => {
            void (async () => {
              try {
                const result = await send('undo/apply', {})
                await store.refresh()
                toast.success(`已撤销 ${result.count} 条书签的改动`)
              } catch (error) {
                toast.danger(error instanceof Error ? error.message : String(error))
              }
            })()
          },
        },
      })
    },
    [store, toast],
  )

  const bulkTag = useCallback(
    async (payload: {
      ids: string[]
      tagIds: string[]
      removeTagIds: string[]
      mode: 'append' | 'replace'
    }) => {
      setPending(true)
      try {
        const result = await send('bookmark/bulkTag', {
          ids: payload.ids,
          tagIds: payload.tagIds,
          removeTagIds: payload.removeTagIds,
          mode: payload.mode,
        })
        store.applyBookmarks(result.bookmarks)
        store.applyTags(result.tags)
        setSelectedIds(new Set())
        toast.success(`已更新 ${payload.ids.length} 条书签`)
      } catch (error) {
        toast.danger(error instanceof Error ? error.message : String(error))
      } finally {
        setPending(false)
      }
    },
    [store, toast],
  )

  /* ------------------------------ 快捷键 ------------------------------ */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable

      // Ctrl/⌘+K：打开搜索（输入框里也能用，类似命令面板）
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchLauncherRef.current?.open()
        return
      }

      if (event.key === '/' && !typing) {
        event.preventDefault()
        searchLauncherRef.current?.open()
        return
      }

      if (event.key === 'Escape') {
        if (typing) {
          ;(target as HTMLElement).blur()
          return
        }
        if (selectedIds.size > 0) {
          setSelectedIds(new Set())
          setMultiSelect(false)
          return
        }
        patchFilter({ tagIds: [], query: '', treePath: undefined, scope: 'all' })
        return
      }

      if (typing) return

      // Ctrl / Cmd + A：全选当前筛选结果
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        if (allSelected) {
          setSelectedIds(new Set())
          setMultiSelect(false)
        } else {
          selectAll()
        }
        return
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const delta = event.key === 'ArrowDown' ? 1 : -1
        const next = Math.max(0, Math.min(visible.length - 1, activeIndex + delta))
        if (event.shiftKey) {
          // Shift + 方向键：从锚点一路扩选到新位置（锚点不动，连按可持续扩）
          setMultiSelect(true)
          setSelectedIds((prev) => {
            const result = new Set(prev)
            const from = Math.min(anchorIndexRef.current, next)
            const to = Math.max(anchorIndexRef.current, next)
            for (const bookmark of visible.slice(from, to + 1)) result.add(bookmark.id)
            return result
          })
          setActiveIndex(next)
          return
        }
        anchorIndexRef.current = next
        setActiveIndex(next)
        return
      }
      if (event.key === 'Enter' && activeIndex >= 0) {
        const bookmark = visible[activeIndex]
        if (!bookmark) return
        event.preventDefault()
        if (event.ctrlKey || event.metaKey) void openBackground(bookmark)
        else void openBookmark(bookmark)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    activeIndex,
    allSelected,
    openBackground,
    openBookmark,
    selectAll,
    selectedIds.size,
    visible,
  ])

  /* ------------------------------ 渲染 ------------------------------ */
  const tagChips = filter.tagIds
    .map((id) => store.tags.find((tag) => tag.id === id))
    .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag))

  const menuTag = editTagId ? store.tags.find((tag) => tag.id === editTagId) : undefined

  return (
    <div className="flex h-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      <TopBar
        query={filter.query}
        onQueryChange={(value) => patchFilter({ query: value })}
        searchRef={searchLauncherRef}
        tags={store.tags}
        folders={searchFolders}
        onImport={() => setImportOpen(true)}
        onExport={() => setExportOpen(true)}
        onSettings={() => setSettingsOpen(true)}
      />

      <div className="flex min-h-0 flex-1">
        <Sidebar
          tagCount={store.tags.length}
          tagPanel={
            <TagPanel
              tags={store.tags}
              groups={store.groups}
              counts={stats.tagCounts}
              totalCount={store.bookmarks.length}
              recentCount={stats.recent}
              untaggedCount={stats.untagged}
              scope={filter.scope}
              selectedTagIds={filter.tagIds}
              onSelectScope={(scope) => patchFilter({ scope, tagIds: [] })}
              onToggleTag={(id, additive) => {
                // 默认「切换」：点另一个标签直接替换当前筛选；已在筛选中则取消
                // Ctrl / ⌘ / Shift + 点击才做多选累加
                const selected = filter.tagIds.includes(id)
                const onlyThis = selected && filter.tagIds.length === 1
                if (!additive && (onlyThis || !selected)) {
                  patchFilter({ scope: 'all', tagIds: onlyThis ? [] : [id] })
                  return
                }
                patchFilter({
                  scope: 'all',
                  tagIds: selected
                    ? filter.tagIds.filter((item) => item !== id)
                    : [...filter.tagIds, id],
                })
              }}
              onNewTag={(name) => {
                void (async () => {
                  try {
                    const result = await send('tag/create', { name })
                    store.applyTags(result.tags)
                    // 与点击标签一致：直接切换到新标签
                    patchFilter({ scope: 'all', tagIds: [tagIdOf(name)] })
                  } catch (error) {
                    toast.danger(error instanceof Error ? error.message : String(error))
                  }
                })()
              }}
              onNewGroup={(name) => {
                void (async () => {
                  try {
                    const result = await send('group/create', { name })
                    store.applyGroups(result.groups)
                  } catch (error) {
                    toast.danger(error instanceof Error ? error.message : String(error))
                  }
                })()
              }}
              onEditTag={(id) => setEditTagId(id)}
              onGroupRename={async (id, name) => {
                try {
                  const result = await send('group/rename', { id, name })
                  store.applyGroups(result.groups)
                } catch (error) {
                  toast.danger(error instanceof Error ? error.message : String(error))
                }
              }}
              onGroupColor={async (id, color) => {
                const result = await send('group/color', { id, color })
                store.applyGroups(result.groups)
              }}
              onGroupMove={async (id, direction) => {
                const ids = store.groups.map((group) => group.id)
                const index = ids.indexOf(id)
                const target = index + direction
                if (index < 0 || target < 0 || target >= ids.length) return
                const next = [...ids]
                ;[next[index], next[target]] = [next[target], next[index]]
                const result = await send('group/reorder', { ids: next })
                store.applyGroups(result.groups)
              }}
              onGroupDelete={async (id) => {
                const result = await send('group/delete', { id })
                store.applyGroups(result.groups)
                store.applyTags(result.tags)
                toast.success('分组已删除（标签保留为未分组）')
              }}
              onPin={toggleTagPin}
              onDropBookmarks={(tagId, bookmarkId) => {
                void bulkTag({ ids: [bookmarkId], tagIds: [tagId], removeTagIds: [], mode: 'append' })
              }}
              onMoveTagToGroup={(tagId, groupId) => {
                void (async () => {
                  try {
                    const result = await send('tag/setGroup', { id: tagId, groupId })
                    store.applyTags(result.tags)
                  } catch (error) {
                    toast.danger(error instanceof Error ? error.message : String(error))
                  }
                })()
              }}
              onReorderPinned={(ids) => {
                void (async () => {
                  try {
                    const result = await send('tag/reorderPinned', { ids })
                    store.applyTags(result.tags)
                  } catch (error) {
                    toast.danger(error instanceof Error ? error.message : String(error))
                  }
                })()
              }}
            />
          }
          treePanel={
            <TreePanel
              tree={store.tree}
              selectedPath={filter.treePath}
              onSelectPath={(path) => patchFilter({ treePath: path })}
              onBatchTag={(node) => setBatchNode(node)}
              onReadBrowser={() => setImportOpen(true)}
              onPickHtml={() => setImportOpen(true)}
              disabled={pending}
            />
          }
        />

        <main className="relative flex min-w-0 flex-1 flex-col">
          <Toolbar
            tagChips={tagChips}
            activeTagCount={activeTagIds.length}
            onRemoveTag={(id) => patchFilter({ tagIds: filter.tagIds.filter((item) => item !== id) })}
            logic={filter.logic}
            onLogicChange={(logic) => patchFilter({ logic })}
            sort={filter.sort}
            onSortChange={(sort) => patchFilter({ sort })}
            view={filter.view}
            onViewChange={(view) => patchFilter({ view })}
            multiSelect={multiSelect}
            onToggleMultiSelect={() => {
              setMultiSelect((prev) => {
                if (prev) setSelectedIds(new Set())
                return !prev
              })
            }}
            treePath={filter.treePath}
            onClearTreePath={() => patchFilter({ treePath: undefined })}
            query={filter.query}
            onClearQuery={() => patchFilter({ query: '' })}
            matchedCount={visible.length}
            totalCount={store.bookmarks.length}
            allSelected={allSelected}
            onToggleSelectAll={toggleSelectAll}
          />

          {store.error ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-sm text-[var(--danger)]">{store.error}</p>
              <Button variant="outline" onPress={() => void store.refresh()}>
                重试
              </Button>
            </div>
          ) : store.loading && store.bookmarks.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <BookmarkList
              items={visible}
              tagById={store.tagById}
              keywords={keywords}
              selectedIds={selectedIds}
              multiSelect={multiSelect}
              view={filter.view}
              activeIndex={activeIndex}
              emptyHint={
                store.bookmarks.length === 0
                  ? '还没有书签，去「导入」把浏览器书签迁进来，或用工具栏图标收藏当前页'
                  : '没有匹配的书签，试试调整筛选条件'
              }
              onToggleSelect={toggleSelect}
              onSetSelected={setSelected}
              onActivate={activateItem}
              onRangeSelect={selectRange}
              onOpen={(bookmark) => void openBookmark(bookmark)}
              onOpenBackground={(bookmark) => void openBackground(bookmark)}
              onFilterByTag={(id) => patchFilter({ scope: 'all', tagIds: [id] })}
              onEditTags={(bookmark) => {
                setEditIntent('add')
                setEditTargets([bookmark])
              }}
              onDelete={(bookmark) => askDelete([bookmark.id])}
            />
          )}

          <SelectionBar
            count={selectedIds.size}
            onAddTags={() => {
              setEditIntent('add')
              setEditTargets(store.bookmarks.filter((item) => selectedIds.has(item.id)))
            }}
            onRemoveTags={() => {
              setEditIntent('remove')
              setEditTargets(store.bookmarks.filter((item) => selectedIds.has(item.id)))
            }}
            onDelete={() => askDelete([...selectedIds])}
            onCancel={() => {
              setSelectedIds(new Set())
              setMultiSelect(false)
            }}
          />
        </main>
      </div>

      {/* 对话框 */}
      <BatchTagDialog
        open={Boolean(batchNode)}
        node={batchNode}
        allBookmarks={store.bookmarks}
        tags={store.tags}
        pending={pending}
        onClose={() => setBatchNode(null)}
        onCreateTag={async (name) => {
          const result = await send('tag/create', { name })
          store.applyTags(result.tags)
          const created = result.tags.find((tag) => tag.id === tagIdOf(name))
          return created?.id ?? null
        }}
        onApply={(payload) => {
          void (async () => {
            setPending(true)
            try {
              const result = await send('tree/batchTag', payload)
              await store.refresh()
              setBatchNode(null)
              offerUndo(`已为 ${result.count} 条书签打标签`)
            } catch (error) {
              toast.danger(error instanceof Error ? error.message : String(error))
            } finally {
              setPending(false)
            }
          })()
        }}
      />

      <TagEditDialog
        open={Boolean(editTargets && editTargets.length > 0)}
        title={editTargets && editTargets.length === 1 ? `编辑标签：${editTargets[0].title}` : `批量编辑标签`}
        description={
          editTargets && editTargets.length > 1 ? `目标 ${editTargets.length} 条书签` : undefined
        }
        targets={editTargets ?? []}
        tags={store.tags}
        pending={pending}
        intent={editIntent}
        onClose={() => setEditTargets(null)}
        onCreateTag={async (name) => {
          const result = await send('tag/create', { name })
          store.applyTags(result.tags)
          const created = result.tags.find((tag) => tag.id === tagIdOf(name))
          return created?.id ?? null
        }}
        onApply={(payload) => {
          const ids = (editTargets ?? []).map((bookmark) => bookmark.id)
          setEditTargets(null)
          void bulkTag({ ids, ...payload })
        }}
      />

      <ImportDialog
        open={importOpen}
        bookmarks={store.bookmarks}
        settings={store.settings}
        onClose={() => setImportOpen(false)}
        onImported={store.refresh}
      />

      <ExportDialog
        open={exportOpen}
        bookmarks={store.bookmarks}
        tags={store.tags}
        groups={store.groups}
        tree={store.tree}
        settings={store.settings}
        onClose={() => setExportOpen(false)}
        onImported={store.refresh}
      />

      <SettingsDialog
        open={settingsOpen}
        settings={store.settings}
        trashed={store.trashed}
        onClose={() => setSettingsOpen(false)}
        onUpdateSettings={store.updateSettings}
        onDataChanged={store.refresh}
      />

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title ?? ''}
        message={confirmState?.message ?? ''}
        confirmLabel={confirmState?.confirmLabel}
        danger={confirmState?.danger}
        extra={
          confirmState?.browserSyncedCount ? (
            <Checkbox
              aria-label="同步删除浏览器书签"
              isSelected={deleteSyncBrowser}
              onChange={setDeleteSyncBrowser}
            >
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                同步删除浏览器书签
              </Checkbox.Content>
              <Description>
                其中 {confirmState.browserSyncedCount} 条已同步到本机浏览器书签，勾选后一并删除（默认不勾选）
              </Description>
            </Checkbox>
          ) : null
        }
        onConfirm={() => {
          confirmState?.run(deleteSyncBrowser)
          setConfirmState(null)
        }}
        onCancel={() => setConfirmState(null)}
      />

      <TagDetailDialog
        open={Boolean(menuTag)}
        tag={menuTag ?? null}
        tags={store.tags}
        groups={store.groups}
        affectedCount={menuTag?.useCount ?? 0}
        onClose={() => setEditTagId(null)}
        onRename={async (id, name) => {
          try {
            const result = await send('tag/rename', { id, name })
            store.applyTags(result.tags)
          } catch (error) {
            toast.danger(error instanceof Error ? error.message : String(error))
          }
        }}
        onColor={async (id, color) => {
          const result = await send('tag/color', { id, color })
          store.applyTags(result.tags)
        }}
        onSetGroup={async (id, groupId) => {
          const result = await send('tag/setGroup', { id, groupId })
          store.applyTags(result.tags)
        }}
        onMerge={async (fromId, toId) => {
          const result = await send('tag/merge', { fromId, toId })
          store.applyTags(result.tags)
          store.applyBookmarks(result.bookmarks)
          toast.success('标签已合并')
        }}
        onDelete={async (id) => {
          const result = await send('tag/delete', { id })
          store.applyTags(result.tags)
          store.applyBookmarks(result.bookmarks)
          toast.success('标签已删除（书签保留）')
        }}
      />

    </div>
  )
}
