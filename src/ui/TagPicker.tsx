import { useEffect, useMemo, useRef, useState } from 'react'
import { Input, ListBox, Tag, TagGroup, TextField } from '@heroui/react'
import type { Key } from 'react'
import { normalizeTagName, tagIdOf } from '../shared/constants'
import type { Tag as TagItem } from '../shared/types'
import { IconSearch, IconTag } from './icons'

interface TagPickerProps {
  tags: TagItem[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  onCreate: (name: string) => Promise<string | null>
  placeholder?: string
  /** 外部已有「未选择标签」占位时可关掉内部占位 */
  hideEmptyHint?: boolean
}

const CREATE_KEY = '__tagmark_create__'

/** 标签选择器：HeroUI TextField/Input + ListBox 建议列表 + TagGroup 已选标签 */
export function TagPicker({
  tags,
  selectedIds,
  onChange,
  onCreate,
  placeholder = '搜索标签，回车即新建',
  hideEmptyHint = false,
}: TagPickerProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  const tagById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags])

  const keyword = query.trim().toLowerCase()
  const suggestions = useMemo(() => {
    const pool = tags.filter((tag) => !selectedIds.includes(tag.id))
    if (!keyword) return pool.slice(0, 8)
    return pool.filter((tag) => tag.name.toLowerCase().includes(keyword)).slice(0, 8)
  }, [keyword, tags, selectedIds])

  const createName = normalizeTagName(query)
  const canCreate = Boolean(createName) && !tagById.has(tagIdOf(createName))

  /* 点击外部收起建议列表 */
  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const addId = (id: string) => {
    onChange([...new Set([...selectedIds, id])])
    setQuery('')
    setOpen(false)
  }

  const commit = async () => {
    if (!createName || busy) return
    const id = tagIdOf(createName)
    const existing = tagById.get(id)
    if (existing) {
      addId(existing.id)
      return
    }
    setBusy(true)
    try {
      const created = await onCreate(createName)
      if (created) addId(created)
      else setQuery('')
    } finally {
      setBusy(false)
    }
  }

  const onAction = (key: Key) => {
    if (String(key) === CREATE_KEY) void commit()
    else addId(String(key))
  }

  const removeKeys = (keys: Set<Key>) => {
    const removing = new Set([...keys].map(String))
    onChange(selectedIds.filter((id) => !removing.has(id)))
  }

  const showList = open && query.trim().length > 0

  return (
    <div className="flex flex-col gap-2">
      <div ref={wrapperRef} className="relative">
        <div className="relative flex items-center">
          <IconSearch className="pointer-events-none absolute start-2.5 z-10 text-[var(--field-placeholder)]" />
          <TextField
            aria-label="标签"
            className="w-full"
            fullWidth
            value={query}
            onChange={(value) => {
              setQuery(value)
              setOpen(true)
            }}
          >
            <Input
              className="ps-8"
              placeholder={placeholder}
              onFocus={() => setOpen(true)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void commit()
                }
                if (event.key === 'Escape') setOpen(false)
              }}
            />
          </TextField>
        </div>

        {showList ? (
          <div className="absolute top-full z-50 mt-1 w-full">
            <ListBox
              aria-label="标签建议"
              selectionMode="none"
              onAction={onAction}
              className="max-h-56 overflow-y-auto shadow-xl"
            >
              {suggestions.map((tag) => (
                <ListBox.Item key={tag.id} id={tag.id} textValue={tag.name}>
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="truncate">
                      <span style={{ color: tag.color }}>#</span>
                      {tag.name}
                    </span>
                    <span className="shrink-0 text-xs text-[var(--muted)] tabular-nums">
                      {tag.useCount}
                    </span>
                  </span>
                </ListBox.Item>
              ))}
              {canCreate ? (
                <ListBox.Item id={CREATE_KEY} textValue={createName}>
                  <span className="flex items-center gap-2">
                    <IconTag width={12} height={12} className="text-[var(--muted)]" />
                    新建标签「{createName}」
                  </span>
                </ListBox.Item>
              ) : null}
              {suggestions.length === 0 && !canCreate ? (
                <ListBox.Item id="__tagmark_empty__" textValue="无匹配">
                  <span className="text-xs text-[var(--muted)]">无匹配标签</span>
                </ListBox.Item>
              ) : null}
            </ListBox>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-[26px] flex-wrap items-center gap-1.5">
        {selectedIds.length === 0 ? (
          hideEmptyHint ? null : <span className="text-xs text-[var(--muted)]">未选择标签</span>
        ) : (
          <TagGroup aria-label="已选标签" onRemove={removeKeys}>
            <TagGroup.List className="flex flex-wrap items-center gap-1.5">
              {selectedIds.map((id) => {
                const tag = tagById.get(id)
                return (
                  <Tag key={id} id={id} textValue={tag?.name ?? id}>
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: tag?.color }}
                      aria-hidden="true"
                    />
                    {tag?.name ?? id}
                    <Tag.RemoveButton />
                  </Tag>
                )
              })}
            </TagGroup.List>
          </TagGroup>
        )}
        {busy ? <span className="text-xs text-[var(--muted)]">创建中…</span> : null}
      </div>
    </div>
  )
}
