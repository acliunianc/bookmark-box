import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Checkbox, Input, Spinner, TextField } from '@heroui/react'
import { tagIdOf } from '../shared/constants'
import { send, type BookmarkSummary, type PageContext } from '../shared/messages'
import { folderTagPlan } from '../core/parseTree'
import type { BrowserFolderMode } from '../shared/types'
import { isSpecialPage } from '../core/normalizeUrl'
import { relativeTime } from '../shared/utils'
import { cn } from '../ui/cn'
import { Favicon } from '../ui/Favicon'
import { BrowserPlacementSelect, useBrowserFolders } from '../ui/BrowserFolderSelect'
import { SearchSelect } from '../ui/SearchSelect'
import { TagChip } from '../ui/TagChip'
import { IconBolt, IconCheck, IconPlus, IconTrash } from '../ui/icons'
import { useToast } from '../ui/toast'
import { TagPicker } from '../ui/TagPicker'

interface LoadedState {
  url: string
  title: string
  tagIds: string[]
  context: PageContext
}

/** 浏览器书签落点（自动 / 手动指定文件夹） */
interface Placement {
  mode: BrowserFolderMode
  folderId: string
}

export function PopupApp() {
  const toast = useToast()
  const [state, setState] = useState<LoadedState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  /* 是否同步写入本机浏览器书签（默认取设置，设置里默认开启） */
  const [syncToBrowser, setSyncToBrowser] = useState(true)
  /* 浏览器书签落点：默认「自动（最顶层）」 */
  const [placement, setPlacement] = useState<Placement>({ mode: 'auto', folderId: '' })
  const [summaries, setSummaries] = useState<BookmarkSummary[]>([])
  const [copySourceId, setCopySourceId] = useState<string | null>(null)
  /* 把新书签放到所选书签的同级文件夹（勾选后，选中书签即切换落点） */
  const [placeBesideSelected, setPlaceBesideSelected] = useState(false)
  const [siblingFolder, setSiblingFolder] = useState<{ id: string; path: string } | null>(null)
  const [siblingLoading, setSiblingLoading] = useState(false)
  const [applyFolderTags, setApplyFolderTags] = useState(false)
  /* 勾选文件夹标签时加上的 id，取消勾选或换文件夹时只撤掉这一批 */
  const appliedFolderTags = useRef<string[]>([])
  /* 设置里的默认落点，清除书签等场景下还原到它 */
  const defaultPlacement = useRef<Placement>({ mode: 'auto', folderId: '' })

  /* 落点回到设置里的默认值（不动「同级」的勾选状态） */
  const resetPlacement = () => {
    setPlacement(defaultPlacement.current)
  }

  /* 1. 打开时并行解析当前标签页并拉取上下文 */
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        const url = tab?.url ?? ''
        const title = tab?.title ?? url
        if (!url) throw new Error('未取到当前页地址')
        const [context, listed] = await Promise.all([
          send('page/context', { url, title }),
          send('bookmark/summaries', {}).catch(() => ({ bookmarks: [] as BookmarkSummary[] })),
        ])
        if (cancelled) return
        setSummaries(listed.bookmarks ?? [])
        setState({
          url,
          title: context.bookmark?.title ?? title,
          tagIds: context.bookmark?.tagIds ?? [],
          context,
        })
        setSyncToBrowser(context.settings.syncToBrowser)
        const initialPlacement = {
          mode: context.settings.browserFolderMode,
          folderId: context.settings.browserFolderId,
        }
        defaultPlacement.current = initialPlacement
        setPlacement(initialPlacement)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const tags = state?.context.tags ?? []
  const tagById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags])
  /* 需要选择浏览器书签落点时，懒加载本机书签文件夹 */
  const browserFolders = useBrowserFolders(syncToBrowser)
  const copySource = useMemo(
    () => (copySourceId ? summaries.find((item) => item.id === copySourceId) ?? null : null),
    [copySourceId, summaries],
  )
  const showBesideOption = syncToBrowser

  /* 选中书签后解析它在本机书签里的所在文件夹，供「同级」落点使用 */
  useEffect(() => {
    if (!copySource) {
      setSiblingFolder(null)
      setSiblingLoading(false)
      return undefined
    }
    let cancelled = false
    setSiblingFolder(null)
    setSiblingLoading(true)
    void send('browser/siblingFolder', {
      url: copySource.url,
      browserBookmarkId: copySource.browserBookmarkId,
    })
      .then((result) => {
        if (cancelled) return
        setSiblingFolder(result.folder)
        // 换了书签却定位不到所在文件夹时，落点退回默认，避免沿用上一条书签的文件夹
        if (!result.folder && placeBesideSelected) resetPlacement()
      })
      .catch(() => {
        if (!cancelled) setSiblingFolder(null)
      })
      .finally(() => {
        if (!cancelled) setSiblingLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [copySource, showBesideOption])

  /* 勾选了「同级」：选中书签解析出文件夹后，把落点切到该文件夹 */
  useEffect(() => {
    if (!placeBesideSelected || !siblingFolder) return
    setPlacement({ mode: 'manual', folderId: siblingFolder.id })
  }, [placeBesideSelected, siblingFolder])

  /* 关掉同步后，勾选项随之失效，落点退回默认 */
  useEffect(() => {
    if (!showBesideOption) {
      setPlaceBesideSelected(false)
      resetPlacement()
    }
  }, [showBesideOption])

  /* 优先用当前页已经在的文件夹；没有时用这次选择的放置位置 */
  const folderPath = useMemo(() => {
    const located = state?.context.folderPath || null
    if (located) return located
    if (!syncToBrowser) return null
    if (placement.mode === 'manual') {
      return (
        browserFolders.folders.find((folder) => folder.id === placement.folderId)?.path ??
        (siblingFolder?.id === placement.folderId ? siblingFolder.path : null)
      )
    }
    return browserFolders.auto?.path ?? null
  }, [
    browserFolders.auto,
    browserFolders.folders,
    placement.folderId,
    placement.mode,
    siblingFolder,
    state,
    syncToBrowser,
  ])

  const folderPlan = useMemo(
    () =>
      folderPath
        ? folderTagPlan(folderPath, state?.context.folderModes ?? {}, state?.context.folderAutoTag !== false)
        : [],
    [folderPath, state],
  )

  const bookmarkOptions = useMemo(
    () =>
      (summaries ?? []).map((item) => ({
        id: item.id,
        label: item.title,
        description: item.url.replace(/^https?:\/\//, ''),
        textValue: item.title,
      })),
    [summaries],
  )

  /* 勾选期间，文件夹路径变了就换成新路径对应的标签 */
  useEffect(() => {
    if (!applyFolderTags) return undefined
    if (!folderPath) {
      const remove = new Set(appliedFolderTags.current)
      appliedFolderTags.current = []
      setApplyFolderTags(false)
      setState((prev) =>
        prev ? { ...prev, tagIds: prev.tagIds.filter((id) => !remove.has(id)) } : prev,
      )
      return undefined
    }
    let cancelled = false
    const previous = appliedFolderTags.current
    void send('tag/fromFolder', { path: folderPath })
      .then((result) => {
        if (cancelled) return
        appliedFolderTags.current = result.tagIds
        const remove = new Set(previous)
        setState((prev) => {
          if (!prev) return prev
          const kept = prev.tagIds.filter((id) => !remove.has(id))
          return {
            ...prev,
            tagIds: [...new Set([...kept, ...result.tagIds])],
            context: { ...prev.context, tags: result.tags },
          }
        })
      })
      .catch((err: unknown) => {
        if (!cancelled) toast.danger(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [applyFolderTags, folderPath, toast])

  if (error) {
    return (
      <main className="flex h-[540px] w-[380px] flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-[var(--danger)]">{error}</p>
        <Button size="sm" variant="secondary" onPress={() => window.location.reload()}>
          重试
        </Button>
      </main>
    )
  }

  if (!state) {
    return (
      <main className="flex h-[540px] w-[380px] items-center justify-center">
        <Spinner />
      </main>
    )
  }

  const bookmark = state.context.bookmark
  const special = isSpecialPage(state.url)

  const setTagIds = (ids: string[]) => {
    setState((prev) => (prev ? { ...prev, tagIds: ids } : prev))
  }

  const toggleTag = (id: string) => {
    setTagIds(
      state.tagIds.includes(id) ? state.tagIds.filter((item) => item !== id) : [...state.tagIds, id],
    )
  }

  const createTag = async (name: string): Promise<string | null> => {
    try {
      const result = await send('tag/create', { name })
      setState((prev) => (prev ? { ...prev, context: { ...prev.context, tags: result.tags } } : prev))
      return result.tags.find((tag) => tag.id === tagIdOf(name))?.id ?? null
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : String(err))
      return null
    }
  }

  const save = async (supermode = false) => {
    setSaving(true)
    try {
      const result = await send('bookmark/save', {
        url: state.url,
        title: state.title,
        tagIds: supermode ? state.context.lastTagIds : state.tagIds,
        syncToBrowser,
        browserFolderMode: placement.mode,
        browserFolderId: placement.folderId,
      })
      if (result.browserSyncError) {
        toast.danger(`已保存到 BookmarkBox，但同步浏览器书签失败：${result.browserSyncError}`)
        setSaving(false)
        return
      }
      const synced = !!result.browserSync
      toast.success(
        result.created
          ? synced
            ? '已收藏并同步到浏览器书签'
            : '已收藏'
          : synced
            ? '已更新收藏并同步到浏览器书签'
            : '已更新收藏',
      )
      setTimeout(() => window.close(), 260)
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!bookmark) return
    await send('bookmark/delete', { ids: [bookmark.id] })
    toast.success('已移入回收站')
    setTimeout(() => window.close(), 260)
  }

  const openManage = () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('manage.html') })
    window.close()
  }

  const toggleFolderTags = (checked: boolean) => {
    if (checked) {
      setApplyFolderTags(true)
      return
    }
    const remove = new Set(appliedFolderTags.current)
    appliedFolderTags.current = []
    setApplyFolderTags(false)
    setTagIds(state.tagIds.filter((id) => !remove.has(id)))
  }

  const copyTagsFrom = (id: string) => {
    if (!id) {
      setCopySourceId(null)
      setSiblingFolder(null)
      resetPlacement()
      return
    }
    setCopySourceId(id)
    const source = summaries.find((item) => item.id === id)
    if (!source || source.tagIds.length === 0) {
      toast.danger('这条书签还没有标签')
      return
    }
    setTagIds([...new Set([...state.tagIds, ...source.tagIds])])
  }

  const folderHint = !folderPath
    ? '没有可套用的文件夹'
    : folderPlan.length === 0
      ? `「${folderPath.replaceAll('/', ' / ')}」按当前配置不会生成标签`
      : `${state.context.folderPath ? '当前页在' : '按放置位置'}「${folderPath.replaceAll('/', ' / ')}」，将加上 ${folderPlan.map((entry) => entry.name).join('、')}`

  return (
    <main className="flex h-[600px] w-[380px] flex-col gap-3 overflow-y-auto p-4">
      {/* 标题 / URL */}
      <header className="flex items-start gap-3">
        <Favicon url={state.url} size={32} className="mt-1 rounded-md" />
        <div className="min-w-0 flex-1">
          <TextField
            aria-label="书签标题"
            className="w-full"
            fullWidth
            value={state.title}
            onChange={(value) => setState((prev) => (prev ? { ...prev, title: value } : prev))}
          >
            <Input placeholder="书签标题" />
          </TextField>
          <p className="mt-1 truncate text-xs text-[var(--muted)]" title={state.url}>
            {state.url.replace(/^https?:\/\//, '')}
          </p>
        </div>
      </header>

      {special ? (
        <p className="rounded-md bg-[var(--warning)]/15 px-3 py-1.5 text-xs text-[var(--warning)]">
          该页面可能限制访问，收藏后可能无法正常打开
        </p>
      ) : null}

      {/* 已选标签 */}
      <section className="min-h-[34px] rounded-[var(--field-radius)] border border-dashed border-[var(--border)] p-2">
        {state.tagIds.length === 0 ? (
          <span className="text-xs text-[var(--field-placeholder)]">未选择标签</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {state.tagIds.map((id) => {
              const tag = tagById.get(id)
              return (
                <TagChip
                  key={id}
                  name={tag?.name ?? id}
                  color={tag?.color}
                  active
                  onRemove={() => toggleTag(id)}
                />
              )
            })}
          </div>
        )}
      </section>

      {/* 标签输入（复用管理页的 TagPicker：HeroUI Input + ListBox 建议 + TagGroup） */}
      <section>
        <TagPicker
          tags={tags}
          selectedIds={state.tagIds}
          onChange={setTagIds}
          onCreate={createTag}
          placeholder="搜索标签，回车即新建"
          hideEmptyHint
          hideSelected
        />
      </section>

      <div className="flex items-center gap-2">
        <SearchSelect
          aria-label="复制书签标签"
          className="min-w-0 flex-1"
          value={copySourceId}
          onChange={copyTagsFrom}
          onClear={() => {
            setCopySourceId(null)
            setSiblingFolder(null)
            resetPlacement()
          }}
          isClearable
          options={bookmarkOptions}
          placeholder="选择书签，复制它的标签"
          isDisabled={bookmarkOptions.length === 0}
        />
        {syncToBrowser ? (
          <Checkbox
            className="shrink-0"
            aria-label="更新文件夹"
            isSelected={placeBesideSelected}
            onChange={(checked) => {
              setPlaceBesideSelected(checked)
              if (!checked) resetPlacement()
            }}
          >
            <Checkbox.Content className="whitespace-nowrap text-xs">
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              更新文件夹
            </Checkbox.Content>
          </Checkbox>
        ) : null}
      </div>
      {syncToBrowser && placeBesideSelected && (siblingLoading || !siblingFolder) ? (
        <p className="-mt-1 text-xs leading-4 text-[var(--muted)]">
          {!copySource
            ? '选择一条书签后，自动切换到它所在的文件夹'
            : siblingLoading
              ? '正在查找所选书签所在文件夹…'
              : '所选书签不在本机浏览器书签中，无法定位同级文件夹'}
        </p>
      ) : null}

      {/* 同步进浏览器书签（落点默认「自动 · 最顶层」），以及按文件夹打标签 */}
      <section className="flex flex-col gap-1.5 rounded-[var(--field-radius)] border border-[var(--border)] p-2">
        <Checkbox
          aria-label="同步加入到浏览器书签"
          isSelected={syncToBrowser}
          onChange={setSyncToBrowser}
        >
          <Checkbox.Content className="text-xs">
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            同步加入到浏览器书签
          </Checkbox.Content>
        </Checkbox>
        {syncToBrowser ? (
          <>
            <Checkbox
              aria-label="按文件夹配置打标签"
              isSelected={applyFolderTags}
              isDisabled={!folderPath || folderPlan.length === 0}
              onChange={toggleFolderTags}
            >
              <Checkbox.Content className="text-xs">
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                按文件夹配置打标签
              </Checkbox.Content>
            </Checkbox>
            <p className="-mt-1 ps-6 text-xs leading-4 text-[var(--muted)]" title={folderHint}>
              {folderHint}
            </p>
            <BrowserPlacementSelect
              className="w-full"
              folders={browserFolders.folders}
              auto={browserFolders.auto}
              mode={placement.mode}
              folderId={placement.folderId}
              onChange={setPlacement}
            />
          </>
        ) : null}
      </section>

      <div className="mt-auto flex flex-col gap-3">
        {/* 收藏状态 */}
        <div className="flex items-center justify-between text-xs">
          {bookmark ? (
            <span className={cn('flex items-center gap-1 text-[var(--success)]')}>
              <IconCheck width={14} height={14} />
              已收藏于 {relativeTime(bookmark.createdAt)}
              {bookmark.openCount > 0 ? (
                <span className="text-[var(--muted)]">· 打开 {bookmark.openCount} 次</span>
              ) : null}
              {bookmark.browserBookmarkId ? (
                <span className="text-[var(--muted)]">· 已同步浏览器</span>
              ) : null}
            </span>
          ) : (
            <span className="text-[var(--muted)]">尚未收藏</span>
          )}
          <div className="flex items-center gap-1">
            {bookmark ? (
              <Button
                size="sm"
                isIconOnly
                variant="ghost"
                className="size-7 min-h-0 min-w-0 rounded-md p-0 text-[var(--muted)] hover:text-[var(--danger)]"
                aria-label="移入回收站"
                onPress={() => void remove()}
              >
                <IconTrash width={15} height={15} />
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onPress={openManage}>
              管理全部
            </Button>
          </div>
        </div>

        {/* 主操作 */}
        <div className="flex items-center gap-2">
          <Button
            className="flex-1"
            variant="primary"
            isDisabled={saving}
            onPress={() => void save(false)}
          >
            {saving ? <Spinner size="sm" /> : bookmark ? '更新收藏' : '保存收藏'}
          </Button>
          {state.context.lastTagIds.length > 0 ? (
            <span title="以上次标签组合极速保存（Ctrl+Shift+S ×2）">
              <Button variant="secondary" isDisabled={saving} onPress={() => void save(true)}>
                <IconBolt width={15} height={15} />
                <span className="sr-only">极速保存</span>
              </Button>
            </span>
          ) : (
            <span title="暂无上次标签组合">
              <Button variant="secondary" isDisabled>
                <IconPlus width={15} height={15} />
              </Button>
            </span>
          )}
        </div>
      </div>
    </main>
  )
}
