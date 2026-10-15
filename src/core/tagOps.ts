import { colorForName, groupIdOf, normalizeTagName, tagIdOf } from '../shared/constants'
import type { Bookmark, Tag, TagGroup } from '../shared/types'

export interface TagOpResult {
  tags: Tag[]
  bookmarks: Bookmark[]
  /** 受影响的书签数 */
  bookmarkCount: number
}

function recount(bookmarks: Bookmark[], tag: Tag): Tag {
  const useCount = bookmarks.reduce(
    (sum, bookmark) => (bookmark.tagIds.includes(tag.id) ? sum + 1 : sum),
    0,
  )
  return { ...tag, useCount }
}

export function createTag(
  tags: Tag[],
  name: string,
  color?: string,
): { tags: Tag[]; tag: Tag; existed: boolean } {
  const normalized = normalizeTagName(name)
  const id = tagIdOf(normalized)
  const existed = tags.find((tag) => tag.id === id)
  if (existed) return { tags, tag: existed, existed: true }
  const tag: Tag = {
    id,
    name: normalized,
    color: color ?? colorForName(normalized),
    useCount: 0,
    lastUsedAt: Date.now(),
    pinned: false,
  }
  return { tags: [...tags, tag], tag, existed: false }
}

export function renameTag(
  tags: Tag[],
  id: string,
  nextName: string,
): { tags: Tag[]; conflict?: Tag } {
  const normalized = normalizeTagName(nextName)
  const nextId = tagIdOf(normalized)
  const target = tags.find((tag) => tag.id === id)
  if (!target) return { tags }
  if (nextId !== id) {
    const conflict = tags.find((tag) => tag.id === nextId)
    if (conflict) return { tags, conflict }
  }
  return {
    tags: tags.map((tag) => (tag.id === id ? { ...tag, name: normalized, lastUsedAt: Date.now() } : tag)),
  }
}

export function setTagColor(tags: Tag[], id: string, color: string): Tag[] {
  return tags.map((tag) => (tag.id === id ? { ...tag, color } : tag))
}

/**
 * 置顶 / 取消置顶。
 * 新置顶的标签排在已有置顶标签末尾，取消置顶时清掉顺序，避免留下无意义的脏字段。
 * `pinOrder` 只在撤销「取消置顶」时传入，用来把标签放回原来的位置。
 */
export function setTagPinned(tags: Tag[], id: string, pinned: boolean, pinOrder?: number): Tag[] {
  if (!pinned) {
    return tags.map((tag) => {
      if (tag.id !== id) return tag
      const next: Tag = { ...tag, pinned: false }
      delete next.pinOrder
      return next
    })
  }
  const maxOrder = tags.reduce(
    (max, tag) => (tag.pinned && typeof tag.pinOrder === 'number' ? Math.max(max, tag.pinOrder) : max),
    0,
  )
  const order = typeof pinOrder === 'number' ? pinOrder : maxOrder + 1
  return tags.map((tag) => (tag.id === id ? { ...tag, pinned: true, pinOrder: order } : tag))
}

/** 按给定顺序重排置顶标签（拖拽排序用）；非置顶标签不受影响 */
export function reorderPinnedTags(tags: Tag[], ids: string[]): Tag[] {
  const orderById = new Map(ids.map((id, index) => [id, index + 1]))
  return tags.map((tag) => {
    if (!tag.pinned) return tag
    const order = orderById.get(tag.id)
    return order === undefined ? tag : { ...tag, pinOrder: order }
  })
}

export function touchTags(tags: Tag[], ids: string[]): Tag[] {
  const now = Date.now()
  return tags.map((tag) => (ids.includes(tag.id) ? { ...tag, lastUsedAt: now } : tag))
}

/** A 合并到 B：A 下书签挂到 B，A 删除，重复关联自动去重 */
export function mergeTags(tags: Tag[], bookmarks: Bookmark[], fromId: string, toId: string): TagOpResult {
  if (fromId === toId) return { tags, bookmarks, bookmarkCount: 0 }
  const from = tags.find((tag) => tag.id === fromId)
  const to = tags.find((tag) => tag.id === toId)
  if (!from || !to) return { tags, bookmarks, bookmarkCount: 0 }

  let bookmarkCount = 0
  const nextBookmarks = bookmarks.map((bookmark) => {
    if (!bookmark.tagIds.includes(fromId)) return bookmark
    bookmarkCount += 1
    return { ...bookmark, tagIds: [...new Set(bookmark.tagIds.map((id) => (id === fromId ? toId : id)))] }
  })

  const nextTags = tags
    .filter((tag) => tag.id !== fromId)
    .map((tag) => (tag.id === toId ? recount(nextBookmarks, tag) : tag))

  return { tags: nextTags, bookmarks: nextBookmarks, bookmarkCount }
}

/** 删除标签：仅解除书签关联，不删书签 */
export function deleteTag(tags: Tag[], bookmarks: Bookmark[], id: string): TagOpResult {
  let bookmarkCount = 0
  const nextBookmarks = bookmarks.map((bookmark) => {
    if (!bookmark.tagIds.includes(id)) return bookmark
    bookmarkCount += 1
    return { ...bookmark, tagIds: bookmark.tagIds.filter((tagId) => tagId !== id) }
  })
  return { tags: tags.filter((tag) => tag.id !== id), bookmarks: nextBookmarks, bookmarkCount }
}

export function recalcTagUsage(tags: Tag[], bookmarks: Bookmark[]): Tag[] {
  return tags.map((tag) => recount(bookmarks, tag))
}

/* ------------------------------------------------------------------ */
/* 标签分组（仅一层）                                                   */
/* ------------------------------------------------------------------ */

export function createGroup(
  groups: TagGroup[],
  name: string,
  color?: string,
): { groups: TagGroup[]; group: TagGroup; existed: boolean } {
  const normalized = normalizeTagName(name)
  const id = groupIdOf(normalized)
  const existed = groups.find((group) => group.id === id)
  if (existed) return { groups, group: existed, existed: true }
  const order = groups.reduce((max, group) => Math.max(max, group.order), 0) + 1
  const group: TagGroup = {
    id,
    name: normalized,
    color: color ?? colorForName(normalized),
    order,
    createdAt: Date.now(),
  }
  return { groups: [...groups, group], group, existed: false }
}

export function renameGroup(
  groups: TagGroup[],
  id: string,
  nextName: string,
): { groups: TagGroup[]; conflict?: TagGroup } {
  const normalized = normalizeTagName(nextName)
  const nextId = groupIdOf(normalized)
  const target = groups.find((group) => group.id === id)
  if (!target) return { groups }
  if (nextId !== id) {
    const conflict = groups.find((group) => group.id === nextId)
    if (conflict) return { groups, conflict }
  }
  return { groups: groups.map((group) => (group.id === id ? { ...group, name: normalized } : group)) }
}

export function setGroupColor(groups: TagGroup[], id: string, color: string): TagGroup[] {
  return groups.map((group) => (group.id === id ? { ...group, color } : group))
}

/** 按给定顺序重排分组（用于上移 / 下移 / 拖拽排序） */
export function reorderGroups(groups: TagGroup[], ids: string[]): TagGroup[] {
  const orderById = new Map(ids.map((id, index) => [id, index + 1]))
  return groups
    .map((group) => (orderById.has(group.id) ? { ...group, order: orderById.get(group.id)! } : group))
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
}

/** 把标签放入分组（groupId 为 null 表示移出分组） */
export function setTagGroup(tags: Tag[], id: string, groupId: string | null): Tag[] {
  return tags.map((tag) => {
    if (tag.id !== id) return tag
    if (groupId) return { ...tag, groupId }
    const next: Tag = { ...tag }
    delete next.groupId
    return next
  })
}

/** 删除分组：仅解除归属，标签与书签都保留 */
export function deleteGroup(
  groups: TagGroup[],
  tags: Tag[],
  id: string,
): { groups: TagGroup[]; tags: Tag[]; affectedTags: number } {
  const affectedTags = tags.filter((tag) => tag.groupId === id).length
  return {
    groups: groups.filter((group) => group.id !== id),
    tags: tags.map((tag) => {
      if (tag.groupId !== id) return tag
      const next: Tag = { ...tag }
      delete next.groupId
      return next
    }),
    affectedTags,
  }
}

export interface TagGroupBucket {
  /** 分组本身；未分组桶为 null */
  group: TagGroup | null
  tags: Tag[]
}

/** 取出置顶标签，按自定义顺序（pinOrder）排列 */
export function pinnedTags(tags: Tag[]): Tag[] {
  return sortPinnedTags(tags.filter((tag) => tag.pinned))
}

/** 置顶标签排序：pinOrder 优先，未设置顺序的按最近使用回落 */
export function sortPinnedTags(tags: Tag[]): Tag[] {
  return [...tags].sort((a, b) => {
    const orderA = typeof a.pinOrder === 'number' ? a.pinOrder : Number.MAX_SAFE_INTEGER
    const orderB = typeof b.pinOrder === 'number' ? b.pinOrder : Number.MAX_SAFE_INTEGER
    if (orderA !== orderB) return orderA - orderB
    return compareByUsage(a, b)
  })
}

function compareByUsage(a: Tag, b: Tag): number {
  if (b.lastUsedAt !== a.lastUsedAt) return b.lastUsedAt - a.lastUsedAt
  if (b.useCount !== a.useCount) return b.useCount - a.useCount
  return a.name.localeCompare(b.name, 'zh-Hans-CN')
}

/**
 * 把标签按分组归类，返回 [分组..., 未分组] 顺序；未分组桶始终保留，便于把标签拖出分组。
 * 置顶标签单独成区（由 pinnedTags 提供），这里不再重复出现在分组里。
 */
export function bucketTagsByGroup(tags: Tag[], groups: TagGroup[]): TagGroupBucket[] {
  const sorted = sortTags(tags).filter((tag) => !tag.pinned)
  const buckets: TagGroupBucket[] = groups.map((group) => ({
    group,
    tags: sorted.filter((tag) => tag.groupId === group.id),
  }))
  const ungrouped = sorted.filter((tag) => !tag.groupId || !groups.some((group) => group.id === tag.groupId))
  buckets.push({ group: null, tags: ungrouped })
  return buckets
}

/** 标签列表排序：置顶（按自定义顺序） → 最近使用 → 使用次数 → 字母 */
export function sortTags(tags: Tag[]): Tag[] {
  return [...tags].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (a.pinned && b.pinned) {
      const orderA = typeof a.pinOrder === 'number' ? a.pinOrder : Number.MAX_SAFE_INTEGER
      const orderB = typeof b.pinOrder === 'number' ? b.pinOrder : Number.MAX_SAFE_INTEGER
      if (orderA !== orderB) return orderA - orderB
    }
    return compareByUsage(a, b)
  })
}
