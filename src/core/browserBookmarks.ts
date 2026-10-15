/**
 * 浏览器书签（chrome.bookmarks）读写。
 *
 * 只负责「把收藏同步写进本机浏览器书签」这件事：
 * - 自动模式：放在最顶层文件夹（通常是「书签栏」；没有顶层文件夹时交给浏览器默认位置）
 * - 手动模式：放在用户指定的文件夹（找不到时退回自动）
 * 已同步过的书条用 Bookmark.browserBookmarkId 记录，再次收藏时做更新而不是重复创建。
 */

import type { Bookmark, BrowserFolder, BrowserFolderMode } from '../shared/types'

export interface BrowserFolderInfo {
  /** 扁平化的文件夹列表（含层级信息），用于下拉选择 */
  folders: BrowserFolder[]
  /** 自动模式实际会落到哪个文件夹（顶层文件夹） */
  auto: { id: string; path: string } | null
}

export interface BrowserSyncInput {
  url: string
  title: string
  /** TagMark 记录的浏览器书签 id */
  existingId?: string
  mode: BrowserFolderMode
  /** 手动模式的目标文件夹 id */
  folderId?: string
}

export interface BrowserSyncResult {
  id: string
  action: 'created' | 'updated'
  /** 最终落到的文件夹路径（为空表示浏览器默认位置） */
  folderPath: string
}

/** 扩展环境里是否可用书签接口（预览页 / 非扩展环境没有） */
export function supportsBrowserBookmarks(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.bookmarks
}

function flatten(folders: BrowserFolder[]): BrowserFolder[] {
  const out: BrowserFolder[] = []
  const walk = (list: BrowserFolder[]) => {
    for (const folder of list) {
      out.push(folder)
      walk(folder.children)
    }
  }
  walk(folders)
  return out
}

function toFolder(
  node: chrome.bookmarks.BookmarkTreeNode,
  ancestors: string[],
): BrowserFolder | null {
  // 有 url 的节点是书签本身，不是文件夹
  if (node.url) return null
  const name = node.title?.trim() || '未命名文件夹'
  const pathParts = [...ancestors, name]
  const children = (node.children ?? [])
    .map((child) => toFolder(child, pathParts))
    .filter((child): child is BrowserFolder => child !== null)
  return {
    id: node.id,
    name,
    path: pathParts.join('/'),
    depth: ancestors.length,
    children,
  }
}

/** 读取浏览器书签里的文件夹树（只取文件夹，忽略书签） */
export async function readBrowserFolders(): Promise<BrowserFolderInfo> {
  if (!supportsBrowserBookmarks()) return { folders: [], auto: null }

  let tree: chrome.bookmarks.BookmarkTreeNode[] = []
  try {
    tree = await chrome.bookmarks.getTree()
  } catch {
    return { folders: [], auto: null }
  }

  const root = tree[0]
  const topLevel = (root?.children ?? [])
    .map((node) => toFolder(node, []))
    .filter((folder): folder is BrowserFolder => folder !== null)

  return {
    folders: flatten(topLevel),
    // 自动模式 = 最顶层文件夹（Chrome / Edge 里通常是「书签栏」）
    auto: topLevel[0] ? { id: topLevel[0].id, path: topLevel[0].path } : null,
  }
}

/** 向上回溯出某个节点的完整路径，如「书签栏/开发工具」 */
async function pathOf(node?: chrome.bookmarks.BookmarkTreeNode): Promise<string> {
  const parts: string[] = []
  let current = node
  let guard = 0
  while (current && guard < 16) {
    guard += 1
    if (current.title?.trim()) parts.unshift(current.title.trim())
    const parentId: string | undefined = current.parentId
    if (!parentId) break
    const [parent] = await chrome.bookmarks.get(parentId).catch(() => [])
    current = parent
  }
  return parts.join('/')
}

async function folderPathOf(parentId?: string): Promise<string> {
  if (!parentId) return ''
  const [parent] = await chrome.bookmarks.get(parentId).catch(() => [])
  return pathOf(parent)
}

/** 解析出这次要写入的目标文件夹；返回 undefined 表示交给浏览器默认位置 */
async function resolveTargetFolder(
  mode: BrowserFolderMode,
  folderId?: string,
): Promise<{ id: string; path: string } | undefined> {
  if (mode === 'manual' && folderId) {
    const [node] = await chrome.bookmarks.get(folderId).catch(() => [])
    if (node && !node.url) return { id: node.id, path: await pathOf(node) }
  }
  const { auto } = await readBrowserFolders()
  return auto ?? undefined
}

/** 精确按 URL 找已存在的浏览器书签，避免重复创建 */
async function findByUrl(url: string): Promise<chrome.bookmarks.BookmarkTreeNode | undefined> {
  const matches = await chrome.bookmarks.search({ url }).catch(() => [])
  return matches.find((node) => !!node.url)
}

export async function syncBookmarkToBrowser(input: BrowserSyncInput): Promise<BrowserSyncResult> {
  if (!supportsBrowserBookmarks()) throw new Error('当前环境不支持读写浏览器书签')

  const title = input.title?.trim() || input.url
  const target = await resolveTargetFolder(input.mode, input.folderId)

  let existing: chrome.bookmarks.BookmarkTreeNode | undefined
  if (input.existingId) {
    const [tracked] = await chrome.bookmarks.get(input.existingId).catch(() => [])
    existing = tracked
  }
  if (!existing) existing = await findByUrl(input.url)

  if (existing) {
    // 已存在：只更新标题；手动模式下才把书签挪到用户选定的文件夹
    if (existing.title !== title) {
      await chrome.bookmarks.update(existing.id, { title })
    }
    if (input.mode === 'manual' && target && existing.parentId !== target.id) {
      await chrome.bookmarks.move(existing.id, { parentId: target.id })
    }
    return {
      id: existing.id,
      action: 'updated',
      folderPath: await folderPathOf(existing.parentId),
    }
  }

  const created = await chrome.bookmarks.create(
    target ? { parentId: target.id, title, url: input.url } : { title, url: input.url },
  )
  return { id: created.id, action: 'created', folderPath: target?.path ?? '' }
}

/** 删除浏览器侧的书签（用于书签被彻底删除时清理） */
export async function removeBrowserBookmark(id: string): Promise<boolean> {
  if (!supportsBrowserBookmarks() || !id) return false
  try {
    await chrome.bookmarks.remove(id)
    return true
  } catch {
    return false
  }
}

/** 书签是否已同步到浏览器（用于 UI 展示） */
export function isSyncedToBrowser(bookmark?: Bookmark | null): boolean {
  return !!bookmark?.browserBookmarkId
}
