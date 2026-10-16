import { useEffect, useMemo, useState } from 'react'
import { Button, Checkbox, Input, Spinner, TextField } from '@heroui/react'
import { tagIdOf } from '../shared/constants'
import { send, type PageContext } from '../shared/messages'
import type { BrowserFolderMode, Tag } from '../shared/types'
import { isSpecialPage } from '../core/normalizeUrl'
import { relativeTime } from '../shared/utils'
import { cn } from '../ui/cn'
import { Favicon } from '../ui/Favicon'
import { BrowserPlacementSelect, useBrowserFolders } from '../ui/BrowserFolderSelect'
import { TagChip } from '../ui/TagChip'
import { IconBolt, IconCheck, IconEdit, IconPlus, IconTrash } from '../ui/icons'
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
  const [editingTitle, setEditingTitle] = useState(false)
  /* 是否同步写入本机浏览器书签（默认取设置，设置里默认开启） */
  const [syncToBrowser, setSyncToBrowser] = useState(true)
  /* 浏览器书签落点：默认「自动（最顶层）」 */
  const [placement, setPlacement] = useState<Placement>({ mode: 'auto', folderId: '' })

  /* 1. 打开时并行解析当前标签页并拉取上下文 */
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        const url = tab?.url ?? ''
        const title = tab?.title ?? url
        if (!url) throw new Error('未取到当前页地址')
        const context = await send('page/context', { url, title })
        if (cancelled) return
        setState({
          url,
          title: context.bookmark?.title ?? title,
          tagIds: context.bookmark?.tagIds ?? [],
          context,
        })
        setSyncToBrowser(context.settings.syncToBrowser)
        setPlacement({
          mode: context.settings.browserFolderMode,
          folderId: context.settings.browserFolderId,
        })
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

  const frequent = (state?.context.frequentTagIds ?? []).map((id) => tagById.get(id)).filter(Boolean) as Tag[]
  const lastUsed = (state?.context.lastTagIds ?? []).map((id) => tagById.get(id)).filter(Boolean) as Tag[]

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

  return (
    <main className="flex h-[540px] w-[380px] flex-col gap-3 overflow-y-auto p-4">
      {/* 标题 / URL */}
      <header className="flex items-start gap-3">
        <Favicon url={state.url} size={32} className="mt-0.5 rounded-md" />
        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <TextField
              aria-label="书签标题"
              className="w-full"
              fullWidth
              value={state.title}
              onChange={(value) => setState((prev) => (prev ? { ...prev, title: value } : prev))}
            >
              <Input
                autoFocus
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') setEditingTitle(false)
                }}
              />
            </TextField>
          ) : (
            <h1 className="truncate text-sm font-semibold" title={state.title}>
              {state.title}
            </h1>
          )}
          <p className="mt-0.5 truncate text-xs text-[var(--muted)]" title={state.url}>
            {state.url.replace(/^https?:\/\//, '')}
          </p>
        </div>
        <Button
          size="sm"
          isIconOnly
          variant="ghost"
          className="size-7 min-h-0 min-w-0 shrink-0 rounded-md p-0 text-[var(--muted)]"
          aria-label="编辑标题"
          onPress={() => setEditingTitle(true)}
        >
          <IconEdit width={15} height={15} />
        </Button>
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
        />
      </section>

      {/* 常用 / 上次 */}
      <section className="flex flex-col gap-2 text-xs">
        {frequent.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[var(--muted)]">常用</span>
            {frequent.map((tag) => (
              <TagChip
                key={tag.id}
                name={tag.name}
                color={tag.color}
                active={state.tagIds.includes(tag.id)}
                onPress={() => toggleTag(tag.id)}
              />
            ))}
          </div>
        ) : null}
        {lastUsed.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[var(--muted)]">上次</span>
            {lastUsed.map((tag) => (
              <TagChip
                key={tag.id}
                name={tag.name}
                color={tag.color}
                active={state.tagIds.includes(tag.id)}
                onPress={() => toggleTag(tag.id)}
              />
            ))}
          </div>
        ) : null}
      </section>

      {/* 浏览器书签同步（默认开启，落点默认「自动 · 最顶层」） */}
      <section className="flex flex-col gap-2 rounded-[var(--field-radius)] border border-[var(--border)] p-2">
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
          <BrowserPlacementSelect
            className="w-full"
            folders={browserFolders.folders}
            auto={browserFolders.auto}
            mode={placement.mode}
            folderId={placement.folderId}
            onChange={setPlacement}
          />
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
