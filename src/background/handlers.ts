import * as db from '../db'
import { selectBookmarksForNode, type MergeMode } from '../core/batchTag'
import { parseBackup, type BackupFile } from '../core/backup'
import { bookmarkIdFor, normalizeUrl, type NormalizeOptions } from '../core/normalizeUrl'
import {
  folderTagPlan,
  parseBrowserTree,
  toFolderNode,
  type ParseResult,
} from '../core/parseTree'
import {
  readBrowserFolders,
  removeBrowserBookmark,
  supportsBrowserBookmarks,
  syncBookmarkToBrowser,
  type BrowserSyncResult,
} from '../core/browserBookmarks'
import {
  createGroup,
  createTag,
  deleteGroup,
  deleteTag,
  mergeTags,
  recalcTagUsage,
  renameGroup,
  renameTag,
  reorderGroups,
  reorderPinnedTags,
  setGroupColor,
  setTagColor,
  setTagGroup,
  setTagPinned,
  sortTags,
  touchTags,
} from '../core/tagOps'
import { MAX_BACKUP_SNAPSHOTS, MAX_UNDO_SNAPSHOTS } from '../shared/constants'
import type {
  BatchTagRequest,
  BatchTagResult,
  BootstrapData,
  PageContext,
  TreeApplyOptions,
  TreeApplyResult,
} from '../shared/messages'
import type { Bookmark, BrowserFolderMode, Settings, Tag, TagGroup, TreeSnapshot, UndoPayload } from '../shared/types'

function normalizeOptions(settings: Settings): NormalizeOptions {
  return {
    removeTrackingParams: settings.removeTrackingParams,
    ignoreFragment: settings.ignoreFragment,
  }
}

async function context(): Promise<{ bookmarks: Bookmark[]; tags: Tag[]; settings: Settings }> {
  const [bookmarks, tags, settings] = await Promise.all([db.allBookmarks(), db.allTags(), db.getSettings()])
  return { bookmarks, tags, settings }
}

/* ------------------------------------------------------------------ */
/* 收藏                                                                */
/* ------------------------------------------------------------------ */

async function handlePageContext(payload: { url: string; title: string }): Promise<PageContext> {
  const { bookmarks, tags, settings } = await context()
  const normUrl = normalizeUrl(payload.url, normalizeOptions(settings))
  const bookmark = normUrl
    ? bookmarks.find((item) => item.normUrl === normUrl)
    : undefined

  const frequentTagIds = sortTags(tags)
    .filter((tag) => tag.useCount > 0)
    .slice(0, 6)
    .map((tag) => tag.id)

  return {
    url: payload.url,
    title: payload.title || payload.url,
    bookmark,
    tags: sortTags(tags),
    settings,
    frequentTagIds,
    lastTagIds: settings.lastTagIds.filter((id) => tags.some((tag) => tag.id === id)),
  }
}

async function handleSaveBookmark(payload: {
  url: string
  title: string
  tagIds: string[]
  rememberTags?: boolean
  syncToBrowser?: boolean
  browserFolderMode?: BrowserFolderMode
  browserFolderId?: string
}): Promise<{
  bookmark: Bookmark
  created: boolean
  tags: Tag[]
  browserSync: BrowserSyncResult | null
  browserSyncError?: string
}> {
  const settings = await db.getSettings()
  const normUrl = normalizeUrl(payload.url, normalizeOptions(settings))
  if (!normUrl) throw new Error('无法解析当前页地址')

  const id = await bookmarkIdFor(normUrl)
  const existing = await db.getBookmarkByNormUrl(normUrl)
  const tagIds = [...new Set(payload.tagIds)]
  const now = Date.now()

  const bookmark: Bookmark = existing
    ? {
        ...existing,
        url: payload.url,
        title: payload.title || existing.title,
        tagIds,
        deletedAt: undefined,
      }
    : {
        id,
        url: payload.url,
        normUrl,
        title: payload.title || payload.url,
        tagIds,
        createdAt: now,
        openCount: 0,
        importPaths: [],
      }

  await db.putBookmarks([bookmark])

  // 同步写入本机浏览器书签：失败不影响本地收藏，只回传错误让 UI 提示
  let browserSync: BrowserSyncResult | null = null
  let browserSyncError: string | undefined
  const wantSync = payload.syncToBrowser ?? settings.syncToBrowser
  if (wantSync) {
    if (!supportsBrowserBookmarks()) {
      browserSyncError = '当前环境不支持读写浏览器书签'
    } else {
      const mode = payload.browserFolderMode ?? settings.browserFolderMode
      try {
        browserSync = await syncBookmarkToBrowser({
          url: bookmark.url,
          title: bookmark.title,
          existingId: existing?.browserBookmarkId,
          mode,
          folderId: payload.browserFolderId ?? settings.browserFolderId,
        })
        if (bookmark.browserBookmarkId !== browserSync.id) {
          bookmark.browserBookmarkId = browserSync.id
          await db.putBookmarks([bookmark])
        }
      } catch (error) {
        browserSyncError = error instanceof Error ? error.message : String(error)
      }
    }
  }

  let tags = recalcTagUsage(touchTags(await db.allTags(), tagIds), await db.allBookmarks())
  await db.putTags(tags)

  if (payload.rememberTags !== false) {
    await db.saveSettings({ lastTagIds: tagIds, lastTagUsedAt: now })
  }

  tags = sortTags(await db.allTags())
  return { bookmark, created: !existing, tags, browserSync, browserSyncError }
}

async function handleRecordOpen(payload: { id: string }): Promise<{ bookmark: Bookmark | null }> {
  const bookmarks = await db.allBookmarks(true)
  const bookmark = bookmarks.find((item) => item.id === payload.id)
  if (!bookmark) return { bookmark: null }
  const next: Bookmark = { ...bookmark, openCount: bookmark.openCount + 1, lastOpenedAt: Date.now() }
  await db.putBookmarks([next])
  return { bookmark: next }
}

async function handleBookmarkDelete(payload: {
  ids: string[]
  syncBrowser?: boolean
}): Promise<{ count: number; browserRemoved: number }> {
  const all = await db.allBookmarks(true)
  const now = Date.now()
  const targets = all.filter((item) => payload.ids.includes(item.id))

  // 勾选「同步删除浏览器书签」时，先把本机浏览器里对应的那几条删掉
  let browserRemoved = 0
  const cleared = new Set<string>()
  if (payload.syncBrowser) {
    for (const item of targets) {
      if (!item.browserBookmarkId) continue
      // 删除成功才清掉记录；失败时保留，之后彻底删除还能再试一次
      if (await removeBrowserBookmark(item.browserBookmarkId)) {
        browserRemoved += 1
        cleared.add(item.id)
      }
    }
  }

  const next = targets.map((item) => {
    const trashed: Bookmark = { ...item, deletedAt: now }
    if (cleared.has(item.id)) delete trashed.browserBookmarkId
    return trashed
  })
  await db.putBookmarks(next)
  return { count: next.length, browserRemoved }
}

async function handleBookmarkRestore(payload: { ids: string[] }): Promise<{ count: number }> {
  const all = await db.allBookmarks(true)
  const next = all
    .filter((item) => payload.ids.includes(item.id))
    .map((item) => ({ ...item, deletedAt: undefined }))
  await db.putBookmarks(next)
  return { count: next.length }
}

async function handleBookmarkPurge(payload: { ids?: string[] }): Promise<{ count: number }> {
  const all = await db.allBookmarks(true)
  const targets = payload.ids?.length
    ? all.filter((item) => payload.ids?.includes(item.id))
    : all.filter((item) => item.deletedAt)
  await Promise.all(
    targets.map(async (item) => {
      // 彻底删除时顺带清掉本机浏览器里同步出来的那条书签
      if (item.browserBookmarkId) await removeBrowserBookmark(item.browserBookmarkId)
      await db.deleteBookmarkHard(item.id)
    }),
  )
  return { count: targets.length }
}

async function handleBulkTag(payload: {
  ids: string[]
  tagIds: string[]
  mode: MergeMode
  removeTagIds?: string[]
}): Promise<{ bookmarks: Bookmark[]; tags: Tag[] }> {
  const all = await db.allBookmarks(true)
  const remove = payload.removeTagIds ?? []
  const next = all
    .filter((item) => payload.ids.includes(item.id))
    .map((item) => {
      let tagIds = item.tagIds.filter((id) => !remove.includes(id))
      tagIds =
        payload.mode === 'replace'
          ? [...new Set(payload.tagIds)]
          : [...new Set([...tagIds, ...payload.tagIds])]
      return { ...item, tagIds }
    })

  await db.putBookmarks(next)
  let tags = recalcTagUsage(touchTags(await db.allTags(), payload.tagIds), await db.allBookmarks())
  await db.putTags(tags)
  tags = sortTags(tags)

  const updated = await db.allBookmarks()
  const updatedIds = new Set(next.map((item) => item.id))
  return { bookmarks: updated.filter((item) => updatedIds.has(item.id)), tags }
}

/* ------------------------------------------------------------------ */
/* 标签                                                                */
/* ------------------------------------------------------------------ */

async function handleTagCreate(payload: { name: string; color?: string }): Promise<{ tags: Tag[] }> {
  const tags = await db.allTags()
  const { tags: next } = createTag(tags, payload.name, payload.color)
  await db.putTags(next)
  return { tags: sortTags(next) }
}

async function handleTagRename(payload: { id: string; name: string }): Promise<{ tags: Tag[] }> {
  const tags = await db.allTags()
  const result = renameTag(tags, payload.id, payload.name)
  if (result.conflict) throw new Error(`已存在同名标签「${result.conflict.name}」，请直接使用它`)
  await db.putTags(result.tags)
  return { tags: sortTags(result.tags) }
}

async function handleTagColor(payload: { id: string; color: string }): Promise<{ tags: Tag[] }> {
  const tags = setTagColor(await db.allTags(), payload.id, payload.color)
  await db.putTags(tags)
  return { tags: sortTags(tags) }
}

async function handleTagPin(payload: {
  id: string
  pinned: boolean
  pinOrder?: number
}): Promise<{ tags: Tag[] }> {
  const tags = setTagPinned(await db.allTags(), payload.id, payload.pinned, payload.pinOrder)
  await db.putTags(tags)
  return { tags: sortTags(tags) }
}

async function handleTagReorderPinned(payload: { ids: string[] }): Promise<{ tags: Tag[] }> {
  const tags = reorderPinnedTags(await db.allTags(), payload.ids)
  await db.putTags(tags)
  return { tags: sortTags(tags) }
}

async function handleTagMerge(payload: {
  fromId: string
  toId: string
}): Promise<{ tags: Tag[]; bookmarks: Bookmark[] }> {
  const result = mergeTags(await db.allTags(), await db.allBookmarks(true), payload.fromId, payload.toId)
  await db.putTags(result.tags)
  await db.putBookmarks(result.bookmarks)
  return { tags: sortTags(result.tags), bookmarks: await db.allBookmarks() }
}

async function handleTagDelete(payload: { id: string }): Promise<{ tags: Tag[]; bookmarks: Bookmark[] }> {
  const result = deleteTag(await db.allTags(), await db.allBookmarks(true), payload.id)
  await db.putTags(result.tags)
  await db.putBookmarks(result.bookmarks)
  return { tags: sortTags(result.tags), bookmarks: await db.allBookmarks() }
}

async function handleTagSetGroup(payload: {
  id: string
  groupId: string | null
}): Promise<{ tags: Tag[] }> {
  const tags = setTagGroup(await db.allTags(), payload.id, payload.groupId)
  await db.putTags(tags)
  return { tags: sortTags(tags) }
}

/* ------------------------------------------------------------------ */
/* 标签分组                                                            */
/* ------------------------------------------------------------------ */

async function handleGroupCreate(payload: { name: string; color?: string }): Promise<{ groups: TagGroup[] }> {
  const { groups } = createGroup(await db.allGroups(), payload.name, payload.color)
  await db.putGroups(groups)
  return { groups: await db.allGroups() }
}

async function handleGroupRename(payload: { id: string; name: string }): Promise<{ groups: TagGroup[] }> {
  const result = renameGroup(await db.allGroups(), payload.id, payload.name)
  if (result.conflict) throw new Error(`已存在同名分组「${result.conflict.name}」`)
  await db.putGroups(result.groups)
  return { groups: await db.allGroups() }
}

async function handleGroupColor(payload: { id: string; color: string }): Promise<{ groups: TagGroup[] }> {
  await db.putGroups(setGroupColor(await db.allGroups(), payload.id, payload.color))
  return { groups: await db.allGroups() }
}

async function handleGroupReorder(payload: { ids: string[] }): Promise<{ groups: TagGroup[] }> {
  await db.putGroups(reorderGroups(await db.allGroups(), payload.ids))
  return { groups: await db.allGroups() }
}

async function handleGroupDelete(payload: { id: string }): Promise<{ groups: TagGroup[]; tags: Tag[] }> {
  const result = deleteGroup(await db.allGroups(), await db.allTags(), payload.id)
  await db.putGroups(result.groups)
  await db.putTags(result.tags)
  return { groups: await db.allGroups(), tags: sortTags(await db.allTags()) }
}

/* ------------------------------------------------------------------ */
/* 文件树 / 导入                                                       */
/* ------------------------------------------------------------------ */

async function backupTree(snapshot: TreeSnapshot | null, label: string): Promise<void> {
  await db.addSnapshot({ kind: 'tree', label, payload: { tree: snapshot } })
  await db.trimSnapshots('tree', MAX_BACKUP_SNAPSHOTS)
}

interface ApplyInput {
  source: 'browser' | 'html'
  items: ParseResult['items']
  root: TreeSnapshot['root']
}

/** 由解析结果写入书签池并整体替换文件树快照 */
async function applyParsed(parsed: ApplyInput, options: TreeApplyOptions): Promise<TreeApplyResult> {
  const previous = (await db.getTreeSnapshot()) ?? null
  await backupTree(previous, `导入前自动快照（${previous ? '旧文件树' : '空'}）`)

  const [all, existingTags] = await Promise.all([db.allBookmarks(true), db.allTags()])
  const byNormUrl = new Map(all.map((item) => [item.normUrl, item]))
  const settings = await db.getSettings()

  /** 用户逐文件夹设置的处理方式（tag / group / both / none） */
  const folderModes = options.folderModes ?? {}
  let groups = await db.allGroups()

  let tags = [...existingTags]
  let added = 0
  let updated = 0
  let skipped = 0
  let tagsCreated = 0
  let groupsCreated = 0
  let tagsGrouped = 0

  const touched: Bookmark[] = []

  for (const item of parsed.items) {
    const normUrl = normalizeUrl(item.url, normalizeOptions(settings))
    if (!normUrl) continue

    const importTagIds: string[] = []
    for (const entry of folderTagPlan(item.path, folderModes, options.autoTag !== false)) {
      const created = createTag(tags, entry.name)
      tags = created.tags
      if (!created.existed) tagsCreated += 1

      let tag = created.tag
      if (entry.groupName) {
        const createdGroup = createGroup(groups, entry.groupName)
        groups = createdGroup.groups
        if (!createdGroup.existed) groupsCreated += 1
        // 成组文件夹下的标签统一归入该分组（已存在的标签也会被归入）
        if (tag.groupId !== createdGroup.group.id) {
          tag = { ...tag, groupId: createdGroup.group.id }
          tags = tags.map((existing) => (existing.id === tag.id ? tag : existing))
          tagsGrouped += 1
        }
      }
      importTagIds.push(tag.id)
    }

    const existing = byNormUrl.get(normUrl)
    if (!existing) {
      const bookmark: Bookmark = {
        id: await bookmarkIdFor(normUrl),
        url: item.url,
        normUrl,
        title: item.title || item.url,
        tagIds: [...new Set(importTagIds)],
        createdAt: item.addDate ?? Date.now(),
        openCount: 0,
        importPaths: [item.path],
      }
      touched.push(bookmark)
      byNormUrl.set(normUrl, bookmark)
      added += 1
      continue
    }

    const importPaths = [...new Set([...existing.importPaths, item.path])]
    if (options.conflict === 'overwrite') {
      touched.push({
        ...existing,
        url: item.url,
        normUrl,
        title: item.title || existing.title,
        tagIds: [...new Set(importTagIds)],
        importPaths,
      })
      updated += 1
    } else {
      touched.push({ ...existing, title: existing.title || item.title, importPaths })
      skipped += 1
    }
  }

  await db.putBookmarks(touched)

  const snapshot: TreeSnapshot = {
    id: 'current',
    source: parsed.source,
    importedAt: Date.now(),
    root: parsed.root,
  }
  await db.putTreeSnapshot(snapshot)

  const bookmarks = await db.allBookmarks(true)
  tags = recalcTagUsage(tags, bookmarks)
  await db.putTags(tags)
  if (groupsCreated > 0) await db.putGroups(groups)

  return { added, updated, skipped, tagsCreated, groupsCreated, tagsGrouped, tree: snapshot }
}

async function handleTreeApply(payload: {
  source: 'browser' | 'html'
  items: ParseResult['items']
  root: TreeSnapshot['root']
  options: TreeApplyOptions
}): Promise<TreeApplyResult> {
  return applyParsed({ source: payload.source, items: payload.items, root: payload.root }, payload.options)
}

async function handleReadBrowser(options: TreeApplyOptions): Promise<TreeApplyResult> {
  const tree = await chrome.bookmarks.getTree()
  const parsed = parseBrowserTree(tree)
  return applyParsed(
    { source: 'browser', items: parsed.items, root: toFolderNode(parsed.root) },
    options,
  )
}

/* ------------------------------------------------------------------ */
/* 批量打标签                                                          */
/* ------------------------------------------------------------------ */

async function handleTreeBatchTag(payload: BatchTagRequest): Promise<BatchTagResult> {
  const [bookmarks, existingTags] = await Promise.all([db.allBookmarks(true), db.allTags()])
  const matched = selectBookmarksForNode(bookmarks, payload.path, payload.includeChildren)

  let tags = [...existingTags]
  for (const id of payload.tagIds) {
    const tag = tags.find((item) => item.id === id)
    if (!tag) tags = createTag(tags, id).tags
  }

  const before: Record<string, string[]> = {}
  const next = matched.map((bookmark) => {
    before[bookmark.id] = [...bookmark.tagIds]
    const tagIds =
      payload.mode === 'replace'
        ? [...new Set(payload.tagIds)]
        : [...new Set([...bookmark.tagIds, ...payload.tagIds])]
    return { ...bookmark, tagIds }
  })

  await db.putBookmarks(next)
  tags = recalcTagUsage(touchTags(tags, payload.tagIds), await db.allBookmarks(true))
  await db.putTags(tags)

  const undo: UndoPayload = {
    type: 'batchTag',
    bookmarkIds: next.map((item) => item.id),
    before,
    addedIds: [],
  }
  await db.addSnapshot({ kind: 'undo', label: `批量打标签：${payload.path}`, payload: undo })
  await db.trimSnapshots('undo', MAX_UNDO_SNAPSHOTS)

  const updatedIds = new Set(next.map((item) => item.id))
  return {
    count: next.length,
    bookmarkCount: next.length,
    bookmarks: (await db.allBookmarks()).filter((item) => updatedIds.has(item.id)),
    tags: sortTags(tags),
  }
}

async function handleUndoApply(): Promise<{ count: number }> {
  const snapshot = await db.latestSnapshot('undo')
  if (!snapshot) throw new Error('没有可撤销的操作')
  const undo = snapshot.payload as UndoPayload
  const all = await db.allBookmarks(true)
  const byId = new Map(all.map((item) => [item.id, item]))

  const next: Bookmark[] = []
  for (const id of undo.bookmarkIds) {
    const bookmark = byId.get(id)
    if (!bookmark) continue
    next.push({ ...bookmark, tagIds: undo.before[id] ?? [] })
  }

  await db.putBookmarks(next)
  if (undo.addedIds.length > 0) {
    await Promise.all(undo.addedIds.map((id) => db.deleteBookmarkHard(id)))
  }

  const tags = recalcTagUsage(await db.allTags(), await db.allBookmarks(true))
  await db.putTags(tags)
  await db.deleteSnapshot(snapshot.id as number)
  return { count: next.length }
}

/* ------------------------------------------------------------------ */
/* 数据 / 设置 / 备份                                                   */
/* ------------------------------------------------------------------ */

async function handleBootstrap(): Promise<BootstrapData> {
  const [all, tags, groups, tree, settings] = await Promise.all([
    db.allBookmarks(true),
    db.allTags(),
    db.allGroups(),
    db.getTreeSnapshot(),
    db.getSettings(),
  ])
  return {
    bookmarks: all.filter((item) => !item.deletedAt),
    trashed: all.filter((item) => item.deletedAt),
    tags: sortTags(tags),
    groups,
    tree: tree ?? null,
    settings,
  }
}

async function handleSettingsUpdate(patch: Partial<Settings>): Promise<{ settings: Settings }> {
  return { settings: await db.saveSettings(patch) }
}

async function snapshotFull(label: string): Promise<void> {
  const [bookmarks, tags, groups, tree, settings] = await Promise.all([
    db.allBookmarks(true),
    db.allTags(),
    db.allGroups(),
    db.getTreeSnapshot(),
    db.getSettings(),
  ])
  await db.addSnapshot({
    kind: 'full',
    label,
    payload: { bookmarks, tags, groups, tree: tree ?? null, settings },
  })
  await db.trimSnapshots('full', MAX_BACKUP_SNAPSHOTS)
}

async function handleBackupImport(payload: {
  text: string
  mode: 'replace' | 'merge'
}): Promise<{ added: number; updated: number }> {
  const parsed: BackupFile = parseBackup(payload.text)
  await snapshotFull('导入 JSON 备份前自动快照')

  if (payload.mode === 'replace') {
    await db.replaceAll({
      bookmarks: parsed.bookmarks,
      tags: parsed.tags,
      groups: parsed.groups,
      tree: parsed.tree ?? undefined,
      settings: parsed.settings,
    })
    return { added: parsed.bookmarks.length, updated: 0 }
  }

  const existing = await db.allBookmarks(true)
  const byNormUrl = new Map(existing.map((item) => [item.normUrl, item]))
  let added = 0
  let updated = 0
  const touched: Bookmark[] = []

  for (const incoming of parsed.bookmarks) {
    const current = byNormUrl.get(incoming.normUrl)
    if (!current) {
      touched.push(incoming)
      added += 1
      continue
    }
    touched.push({
      ...current,
      tagIds: [...new Set([...current.tagIds, ...incoming.tagIds])],
      importPaths: [...new Set([...current.importPaths, ...incoming.importPaths])],
      title: current.title || incoming.title,
    })
    updated += 1
  }

  await db.putBookmarks(touched)
  const tags = [...(await db.allTags())]
  for (const tag of parsed.tags) {
    if (!tags.some((item) => item.id === tag.id)) tags.push(tag)
  }
  await db.putTags(tags)

  const groupsToMerge = [...(await db.allGroups())]
  for (const group of parsed.groups) {
    if (!groupsToMerge.some((item) => item.id === group.id)) groupsToMerge.push(group)
  }
  await db.putGroups(groupsToMerge)

  if (parsed.tree) await db.putTreeSnapshot(parsed.tree)
  return { added, updated }
}

async function handleSnapshotRestore(id: number): Promise<{ ok: true }> {
  const snapshots = await db.listSnapshots()
  const snapshot = snapshots.find((item) => item.id === id)
  if (!snapshot) throw new Error('快照不存在')
  if (snapshot.kind === 'tree') {
    const payloadData = snapshot.payload as { tree: TreeSnapshot | null }
    if (payloadData.tree) await db.putTreeSnapshot(payloadData.tree)
    else await db.clearTree()
    return { ok: true }
  }
  if (snapshot.kind === 'full') {
    const payloadData = snapshot.payload as {
      bookmarks: Bookmark[]
      tags: Tag[]
      groups?: TagGroup[]
      tree: TreeSnapshot | null
      settings: Settings
    }
    await snapshotFull('回滚前自动快照')
    await db.replaceAll({
      bookmarks: payloadData.bookmarks,
      tags: payloadData.tags,
      groups: payloadData.groups ?? [],
      tree: payloadData.tree ?? undefined,
      settings: payloadData.settings,
    })
    return { ok: true }
  }
  throw new Error('该快照类型不支持回滚')
}

/* ------------------------------------------------------------------ */

export const handlers = {
  'page/context': handlePageContext,
  'data/bootstrap': handleBootstrap,
  'browser/folders': async () => readBrowserFolders(),
  'bookmark/save': handleSaveBookmark,
  'bookmark/delete': handleBookmarkDelete,
  'bookmark/restore': handleBookmarkRestore,
  'bookmark/purge': handleBookmarkPurge,
  'bookmark/recordOpen': handleRecordOpen,
  'bookmark/bulkTag': handleBulkTag,
  'tag/create': handleTagCreate,
  'tag/rename': handleTagRename,
  'tag/color': handleTagColor,
  'tag/pin': handleTagPin,
  'tag/reorderPinned': handleTagReorderPinned,
  'tag/merge': handleTagMerge,
  'tag/delete': handleTagDelete,
  'tag/setGroup': handleTagSetGroup,
  'group/create': handleGroupCreate,
  'group/rename': handleGroupRename,
  'group/color': handleGroupColor,
  'group/reorder': handleGroupReorder,
  'group/delete': handleGroupDelete,
  'tree/get': async () => ({ tree: (await db.getTreeSnapshot()) ?? null }),
  'tree/apply': handleTreeApply,
  'tree/readBrowser': async (payload: { options: TreeApplyOptions }) => handleReadBrowser(payload.options),
  'tree/batchTag': handleTreeBatchTag,
  'undo/last': async () => ({ undo: ((await db.latestSnapshot('undo'))?.payload as UndoPayload) ?? null }),
  'undo/apply': handleUndoApply,
  'settings/update': handleSettingsUpdate,
  'data/clear': async () => {
    await db.clearUserData()
    return { ok: true as const }
  },
  'backup/import': handleBackupImport,
  'snapshot/list': async () => ({ snapshots: await db.listSnapshots() }),
  'snapshot/restore': async (payload: { id: number }) => handleSnapshotRestore(payload.id),
  'snapshot/create': async (payload: { label: string }) => {
    const id = await db.addSnapshot({ kind: 'full', label: payload.label, payload: null })
    return { id }
  },
} as const

export type HandlerMap = typeof handlers
