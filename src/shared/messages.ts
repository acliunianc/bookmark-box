/** 消息协议：UI 只通过 background 读写数据，保证单一写入方 */

import type { ParsedItem } from '../core/parseTree'
import type { BrowserFolderInfo, BrowserSyncResult } from '../core/browserBookmarks'
import type {
  Bookmark,
  BrowserFolderMode,
  FolderMode,
  Settings,
  SnapshotRecord,
  Tag,
  TagGroup,
  TreeSnapshot,
  UndoPayload,
} from './types'

export type { BrowserFolderInfo, BrowserSyncResult }

export interface PageContext {
  url: string
  title: string
  bookmark?: Bookmark
  tags: Tag[]
  settings: Settings
  /** 常用标签（按使用次数） */
  frequentTagIds: string[]
  /** 上次使用的标签组合 */
  lastTagIds: string[]
}

export interface BootstrapData {
  bookmarks: Bookmark[]
  trashed: Bookmark[]
  tags: Tag[]
  groups: TagGroup[]
  tree: TreeSnapshot | null
  settings: Settings
}

export interface TreeApplyOptions {
  conflict: 'keep' | 'overwrite'
  /**
   * 是否按文件夹路径生成标签（默认 true）。
   * 这是总开关：关掉后 `folderModes` 整体失效，一条标签都不会自动生成。
   */
  autoTag?: boolean
  /**
   * 逐文件夹的处理方式：`tag`（默认，生成同名标签）/ `group`（自身上下不生成标签，
   * 其下生成的标签归入同名分组，分组只有一层，不能嵌套）/ `none`（既不生成标签也不成组）。
   * 只记录被用户显式改过的文件夹，缺省即 `tag`。
   */
  folderModes?: Record<string, FolderMode>
}

export interface TreeApplyResult {
  added: number
  updated: number
  skipped: number
  tagsCreated: number
  /** 本次导入新建的分组数 */
  groupsCreated: number
  /** 本次导入被归入分组的标签数 */
  tagsGrouped: number
  tree: TreeSnapshot
}

export interface BatchTagRequest {
  path: string
  includeChildren: boolean
  tagIds: string[]
  mode: 'append' | 'replace'
}

export interface BatchTagResult {
  count: number
  bookmarkCount: number
  bookmarks: Bookmark[]
  tags: Tag[]
}

export interface RequestMap {
  'page/context': { req: { url: string; title: string }; res: PageContext }
  'data/bootstrap': { req: Record<string, never>; res: BootstrapData }
  /** 本机浏览器书签的文件夹树（仅文件夹，用于同步落点选择） */
  'browser/folders': { req: Record<string, never>; res: BrowserFolderInfo }

  'bookmark/save': {
    req: {
      url: string
      title: string
      tagIds: string[]
      rememberTags?: boolean
      /** 是否同步写入本机浏览器书签；缺省时沿用设置里的默认值（默认同步） */
      syncToBrowser?: boolean
      /** 浏览器书签落点模式；缺省时沿用设置 */
      browserFolderMode?: BrowserFolderMode
      /** 手动模式的目标文件夹 id；缺省时沿用设置 */
      browserFolderId?: string
    }
    res: {
      bookmark: Bookmark
      created: boolean
      tags: Tag[]
      /** 浏览器书签同步结果；null 表示本次没有同步 */
      browserSync: BrowserSyncResult | null
      /** 同步失败原因（本地收藏依然成功） */
      browserSyncError?: string
    }
  }
  /** 移入回收站；syncBrowser 为 true 时连同本机浏览器书签一起删除 */
  'bookmark/delete': {
    req: { ids: string[]; syncBrowser?: boolean }
    res: { count: number; browserRemoved: number }
  }
  'bookmark/restore': { req: { ids: string[] }; res: { count: number } }
  'bookmark/purge': { req: { ids?: string[] }; res: { count: number } }
  'bookmark/recordOpen': { req: { id: string }; res: { bookmark: Bookmark | null } }
  'bookmark/bulkTag': {
    req: { ids: string[]; tagIds: string[]; mode: 'append' | 'replace'; removeTagIds?: string[] }
    res: { bookmarks: Bookmark[]; tags: Tag[] }
  }

  'tag/create': { req: { name: string; color?: string }; res: { tags: Tag[] } }
  'tag/rename': { req: { id: string; name: string }; res: { tags: Tag[] } }
  'tag/color': { req: { id: string; color: string }; res: { tags: Tag[] } }
  /** 置顶 / 取消置顶；撤销「取消置顶」时可传 pinOrder 放回原位置 */
  'tag/pin': { req: { id: string; pinned: boolean; pinOrder?: number }; res: { tags: Tag[] } }
  /** 重排置顶标签（拖拽排序），ids 为置顶标签的新顺序 */
  'tag/reorderPinned': { req: { ids: string[] }; res: { tags: Tag[] } }
  'tag/merge': { req: { fromId: string; toId: string }; res: { tags: Tag[]; bookmarks: Bookmark[] } }
  'tag/delete': { req: { id: string }; res: { tags: Tag[]; bookmarks: Bookmark[] } }
  /** 设置标签所属分组；groupId 为 null 表示移出分组 */
  'tag/setGroup': { req: { id: string; groupId: string | null }; res: { tags: Tag[] } }

  'group/create': { req: { name: string; color?: string }; res: { groups: TagGroup[] } }
  'group/rename': { req: { id: string; name: string }; res: { groups: TagGroup[] } }
  'group/color': { req: { id: string; color: string }; res: { groups: TagGroup[] } }
  'group/reorder': { req: { ids: string[] }; res: { groups: TagGroup[] } }
  /** 删除分组：仅解除归属，标签与书签都保留 */
  'group/delete': { req: { id: string }; res: { groups: TagGroup[]; tags: Tag[] } }

  'tree/get': { req: Record<string, never>; res: { tree: TreeSnapshot | null } }
  'tree/apply': {
    req: {
      source: 'browser' | 'html'
      items: ParsedItem[]
      root: TreeSnapshot['root']
      options: TreeApplyOptions
    }
    res: TreeApplyResult
  }
  'tree/readBrowser': { req: { options: TreeApplyOptions }; res: TreeApplyResult }
  'tree/batchTag': { req: BatchTagRequest; res: BatchTagResult }

  'undo/last': { req: Record<string, never>; res: { undo: UndoPayload | null } }
  'undo/apply': { req: Record<string, never>; res: { count: number } }

  'settings/update': { req: Partial<Settings>; res: { settings: Settings } }
  'backup/import': { req: { text: string; mode: 'replace' | 'merge' }; res: { added: number; updated: number } }
  'snapshot/list': { req: Record<string, never>; res: { snapshots: SnapshotRecord[] } }
  'snapshot/restore': { req: { id: number }; res: { ok: true } }
  'snapshot/create': { req: { label: string }; res: { id: number } }
}

export type RequestType = keyof RequestMap

export type Response<T> = { ok: true; data: T } | { ok: false; error: string }

export async function send<K extends RequestType>(
  type: K,
  payload: RequestMap[K]['req'],
): Promise<RequestMap[K]['res']> {
  const response = (await chrome.runtime.sendMessage({ type, payload })) as
    | Response<RequestMap[K]['res']>
    | undefined
  if (!response) throw new Error(`请求 ${type} 无响应（后台脚本可能已被回收，请重试）`)
  if (!response.ok) throw new Error(response.error)
  return response.data
}
