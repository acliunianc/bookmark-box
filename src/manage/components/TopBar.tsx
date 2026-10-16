import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Button, Kbd, ListBox, SearchField, Tooltip } from '@heroui/react'
import type { Key, KeyboardEvent, RefObject } from 'react'
import {
  applySuggestToken,
  getActiveSuggestToken,
  type ActiveSuggestToken,
} from '../../core/search'
import type { Tag } from '../../shared/types'
import { cn } from '../../ui/cn'
import {
  IconClose,
  IconDownload,
  IconFolder,
  IconSearch,
  IconSettings,
  IconStar,
  IconTag,
  IconUpload,
} from '../../ui/icons'

export interface SearchFolderOption {
  name: string
  path: string
  totalCount: number
}

/** Ctrl/⌘+K 或 `/` 通过它展开搜索 */
export interface SearchLauncher {
  open: () => void
}

interface TopBarProps {
  query: string
  onQueryChange: (value: string) => void
  searchRef: RefObject<SearchLauncher | null>
  tags: Tag[]
  folders: SearchFolderOption[]
  onImport: () => void
  onExport: () => void
  onSettings: () => void
}

const MAX_SUGGESTIONS = 8
const PLACEHOLDER = '搜索标题 / 网址 / #标签 / in:文件夹'
const COMMIT_DEBOUNCE_MS = 280
const SUGGEST_DEBOUNCE_MS = 120
/** 收起态宽度 */
const COLLAPSED_WIDTH = 'w-64'
/** 展开态：最多半屏，且不超过 36rem */
const EXPANDED_WIDTH = 'w-[min(50vw,36rem)]'

type SuggestItem =
  | { kind: 'tag'; id: string; label: string; color: string; meta: number }
  | { kind: 'folder'; id: string; label: string; path: string; meta: number }

function isImeKey(event: KeyboardEvent<HTMLInputElement>): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229
}

/**
 * 顶部栏搜索：假条居中 → 点击就地变宽成真输入（最多约 50vw），
 * Enter / Esc / 点外部收起，不再多一步关弹窗。
 * `#` / `in:` 建议下拉与真搜索框同宽；IME 合成与输入防抖仍保留。
 */
export function TopBar({
  query,
  onQueryChange,
  searchRef,
  tags,
  folders,
  onImport,
  onExport,
  onSettings,
}: TopBarProps) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const composingRef = useRef(false)
  const commitTimerRef = useRef<number | null>(null)
  const suggestTimerRef = useRef<number | null>(null)
  const draftRef = useRef(query)

  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState(query)
  const [suggestText, setSuggestText] = useState(query)
  const [caret, setCaret] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)

  draftRef.current = draft

  const clearCommitTimer = () => {
    if (commitTimerRef.current != null) {
      window.clearTimeout(commitTimerRef.current)
      commitTimerRef.current = null
    }
  }

  const clearSuggestTimer = () => {
    if (suggestTimerRef.current != null) {
      window.clearTimeout(suggestTimerRef.current)
      suggestTimerRef.current = null
    }
  }

  const flushCommit = (value: string) => {
    clearCommitTimer()
    if (value !== query) onQueryChange(value)
  }

  const scheduleCommit = (value: string) => {
    clearCommitTimer()
    commitTimerRef.current = window.setTimeout(() => {
      commitTimerRef.current = null
      onQueryChange(value)
    }, COMMIT_DEBOUNCE_MS)
  }

  const scheduleSuggest = (value: string) => {
    clearSuggestTimer()
    suggestTimerRef.current = window.setTimeout(() => {
      suggestTimerRef.current = null
      setSuggestText(value)
    }, SUGGEST_DEBOUNCE_MS)
  }

  const applyDraft = (value: string, options?: { commit?: 'flush' | 'debounce' | 'skip' }) => {
    setDraft(value)
    const mode = options?.commit ?? 'debounce'
    if (mode === 'flush') {
      setSuggestText(value)
      flushCommit(value)
      return
    }
    if (mode === 'skip') return
    scheduleSuggest(value)
    scheduleCommit(value)
  }

  const collapse = () => {
    applyDraft(draftRef.current, { commit: 'flush' })
    setExpanded(false)
  }

  const expand = () => {
    setDraft(query)
    setSuggestText(query)
    setExpanded(true)
  }

  useImperativeHandle(searchRef, () => ({ open: expand }), [query])

  useEffect(() => {
    if (composingRef.current) return
    setDraft(query)
    setSuggestText(query)
  }, [query])

  /* 展开后聚焦输入框 */
  useEffect(() => {
    if (!expanded) return
    const id = window.setTimeout(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      const end = el.value.length
      el.setSelectionRange(end, end)
      setCaret(end)
    }, 30)
    return () => window.clearTimeout(id)
  }, [expanded])

  /* 点搜索区外部 / Esc → 收起 */
  useEffect(() => {
    if (!expanded) return undefined
    const onPointerDown = (event: MouseEvent) => {
      if (shellRef.current?.contains(event.target as Node)) return
      collapse()
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !composingRef.current) {
        event.preventDefault()
        collapse()
      }
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
    // collapse 读 draftRef，只依赖 expanded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded])

  useEffect(
    () => () => {
      clearCommitTimer()
      clearSuggestTimer()
    },
    [],
  )

  const syncCaret = () => {
    const el = inputRef.current
    if (el) setCaret(el.selectionStart ?? el.value.length)
  }

  const activeToken = useMemo(
    () => getActiveSuggestToken(suggestText, Math.min(caret, suggestText.length)),
    [suggestText, caret],
  )

  const suggestions = useMemo<SuggestItem[]>(() => {
    if (!activeToken) return []
    const needle = activeToken.filter.toLowerCase()

    const matchRank = (text: string) => {
      if (!needle) return 1
      const lower = text.toLowerCase()
      if (lower === needle) return 0
      if (lower.startsWith(needle)) return 1
      return 2
    }

    if (activeToken.kind === 'tag') {
      const matched = (needle
        ? tags.filter((tag) => tag.name.toLowerCase().includes(needle))
        : tags
      )
        .slice()
        .sort((a, b) => {
          const rank = matchRank(a.name) - matchRank(b.name)
          if (rank !== 0) return rank
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
          if (a.name.length !== b.name.length) return a.name.length - b.name.length
          return b.useCount - a.useCount || a.name.localeCompare(b.name, 'zh-Hans-CN')
        })
      return matched.slice(0, MAX_SUGGESTIONS).map((tag) => ({
        kind: 'tag' as const,
        id: `tag:${tag.id}`,
        label: tag.name,
        color: tag.color,
        meta: tag.useCount,
      }))
    }

    const matched = (needle
      ? folders.filter(
          (folder) =>
            folder.name.toLowerCase().includes(needle) ||
            folder.path.toLowerCase().includes(needle),
        )
      : folders
    )
      .slice()
      .sort((a, b) => {
        const rank =
          Math.min(matchRank(a.name), matchRank(a.path)) -
          Math.min(matchRank(b.name), matchRank(b.path))
        if (rank !== 0) return rank
        return b.totalCount - a.totalCount || a.path.localeCompare(b.path, 'zh-Hans-CN')
      })
    return matched.slice(0, MAX_SUGGESTIONS).map((folder) => ({
      kind: 'folder' as const,
      id: `folder:${folder.path}`,
      label: folder.name,
      path: folder.path,
      meta: folder.totalCount,
    }))
  }, [activeToken, tags, folders])

  const showList = expanded && Boolean(activeToken)

  useEffect(() => {
    setActiveIndex(0)
  }, [activeToken?.kind, activeToken?.filter, suggestions.length])

  const applyItem = (item: SuggestItem, token: ActiveSuggestToken) => {
    const liveToken = getActiveSuggestToken(draft, caret) ?? token
    const insertion =
      item.kind === 'tag' ? `${liveToken.prefix}${item.label}` : `${liveToken.prefix}${item.path}`
    const next = applySuggestToken(draft, liveToken, insertion)
    applyDraft(next, { commit: 'flush' })
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      const pos = liveToken.start + insertion.length + 1
      el.focus()
      el.setSelectionRange(pos, pos)
      setCaret(pos)
    })
  }

  const onAction = (key: Key) => {
    if (composingRef.current || !activeToken) return
    const item = suggestions.find((entry) => entry.id === String(key))
    if (item) applyItem(item, activeToken)
  }

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (composingRef.current || isImeKey(event)) return

    if (showList && suggestions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((index) => (index + 1) % suggestions.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const item = suggestions[activeIndex]
        if (item && activeToken) {
          event.preventDefault()
          applyItem(item, activeToken)
        }
        return
      }
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      // 确认搜索并收起：一步完成，不再关弹窗
      collapse()
    }
  }

  const displayQuery = query.trim()

  return (
    <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 overflow-visible border-b border-[var(--separator)] bg-[var(--surface)] px-4">
      <div className="flex items-center gap-2 justify-self-start">
        <span className="flex size-7 items-center justify-center rounded-md bg-[var(--accent)] text-[var(--accent-foreground)]">
          <IconStar width={16} height={16} />
        </span>
        <span className="text-sm font-semibold tracking-tight">BookmarkBox</span>
      </div>

      <div
        ref={shellRef}
        className={cn(
          'relative z-40 justify-self-center transition-[width] duration-200 ease-out',
          expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
        )}
      >
        {expanded ? (
          <>
            <SearchField
              aria-label={PLACEHOLDER}
              className="w-full"
              fullWidth
              value={draft}
              onChange={(value) => {
                if (composingRef.current) {
                  setDraft(value)
                  return
                }
                applyDraft(value)
                requestAnimationFrame(syncCaret)
              }}
              onClear={() => {
                applyDraft('', { commit: 'flush' })
                setCaret(0)
              }}
              onSubmit={() => {
                if (composingRef.current) return
                if (!(showList && suggestions.length > 0)) collapse()
              }}
            >
              <SearchField.Group className="rounded-full!">
                <SearchField.SearchIcon />
                <SearchField.Input
                  ref={inputRef}
                  placeholder={PLACEHOLDER}
                  autoComplete="off"
                  onClick={syncCaret}
                  onKeyUp={syncCaret}
                  onSelect={syncCaret}
                  onKeyDown={onInputKeyDown}
                  onCompositionStart={() => {
                    composingRef.current = true
                  }}
                  onCompositionEnd={(event) => {
                    composingRef.current = false
                    const value = event.currentTarget.value
                    applyDraft(value, { commit: 'flush' })
                    requestAnimationFrame(syncCaret)
                  }}
                />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>

            {showList ? (
              <div className="absolute inset-x-0 top-full z-50 mt-1 w-full overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--overlay)] shadow-[var(--overlay-shadow)]">
                <ListBox
                  aria-label={activeToken?.kind === 'tag' ? '标签建议' : '文件夹建议'}
                  selectionMode="none"
                  onAction={onAction}
                  className="max-h-72 w-full overflow-y-auto bg-[var(--overlay)]"
                >
                  {suggestions.map((item, index) => (
                    <ListBox.Item
                      key={item.id}
                      id={item.id}
                      textValue={item.kind === 'tag' ? item.label : item.path}
                      className={cn('w-full', index === activeIndex && 'bg-[var(--accent)]/12')}
                    >
                      {item.kind === 'tag' ? (
                        <span className="flex w-full items-center gap-2">
                          <IconTag
                            width={14}
                            height={14}
                            className="shrink-0 text-[var(--muted)]"
                          />
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: item.color }}
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1 truncate">
                            <span className="text-[var(--muted)]">#</span>
                            {item.label}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-[var(--muted)]">
                            {item.meta}
                          </span>
                        </span>
                      ) : (
                        <span className="flex w-full items-center gap-2">
                          <IconFolder
                            width={14}
                            height={14}
                            className="shrink-0 text-[var(--muted)]"
                          />
                          <span className="min-w-0 flex-1 truncate" title={item.path}>
                            <span className="text-[var(--muted)]">in:</span>
                            {item.path}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-[var(--muted)]">
                            {item.meta}
                          </span>
                        </span>
                      )}
                    </ListBox.Item>
                  ))}
                  {suggestions.length === 0 ? (
                    <ListBox.Item id="__empty__" textValue="无匹配" isDisabled>
                      <span className="text-xs text-[var(--muted)]">
                        {activeToken?.kind === 'tag' ? '没有匹配的标签' : '没有匹配的文件夹'}
                      </span>
                    </ListBox.Item>
                  ) : null}
                </ListBox>
              </div>
            ) : null}
          </>
        ) : (
          <button
            type="button"
            className={cn(
              'flex h-8 w-full items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--field-background)] px-3 text-left transition',
              'hover:border-[var(--accent)] hover:bg-[var(--accent)]/6',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]',
            )}
            onClick={expand}
            aria-label="打开搜索"
          >
            <IconSearch width={14} height={14} className="shrink-0 text-[var(--field-placeholder)]" />
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-xs',
                displayQuery ? 'text-[var(--foreground)]' : 'text-[var(--field-placeholder)]',
              )}
            >
              {displayQuery || '搜索…'}
            </span>
            {displayQuery ? (
              <span
                role="button"
                tabIndex={-1}
                className="flex size-4 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--default)] hover:text-[var(--foreground)]"
                aria-label="清除搜索"
                onClick={(event) => {
                  event.stopPropagation()
                  applyDraft('', { commit: 'flush' })
                }}
              >
                <IconClose width={11} height={11} />
              </span>
            ) : (
              <Kbd className="shrink-0 scale-90 opacity-70">
                <Kbd.Abbr keyValue="ctrl" />
                <Kbd.Content>K</Kbd.Content>
              </Kbd>
            )}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 justify-self-end">
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
