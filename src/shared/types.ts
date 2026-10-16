/** BookmarkBox 领域模型 —— 与需求文档 5. 数据模型与存储 保持一致 */

export interface Bookmark {
  /** = sha1(normUrl) 前 12 位，天然去重 */
  id: string
  /** 原始 URL */
  url: string
  /** 规范化 URL（去重键） */
  normUrl: string
  title: string
  tagIds: string[]
  createdAt: number
  lastOpenedAt?: number
  openCount: number
  /** 导入来源文件夹路径，多个来源取并集 */
  importPaths: string[]
  /** 已同步写入的本机浏览器书签 id（chrome.bookmarks），用于避免重复创建 */
  browserBookmarkId?: string
  /** 软删除（回收站） */
  deletedAt?: number
}

export interface Tag {
  /** name 归一化后生成，唯一 */
  id: string
  name: string
  color: string
  useCount: number
  lastUsedAt: number
  pinned: boolean
  /** 置顶标签之间的自定义顺序（越小越靠前），仅 pinned 时有意义；未设置时排在已排序的置顶标签之后 */
  pinOrder?: number
  /** 所属分组 id（一层结构，一个标签最多属于一个分组；未分组为 undefined） */
  groupId?: string
}

/** 标签分组：仅一层，用于把 java / php 这类标签收拢到「开发」下 */
export interface TagGroup {
  id: string
  name: string
  color: string
  /** 排序权重，越小越靠前 */
  order: number
  createdAt: number
}

export interface FolderNode {
  /** 路径哈希，稳定 */
  id: string
  name: string
  /** "书签栏/开发工具/前端" */
  path: string
  children: FolderNode[]
  /** 直属书签数 */
  directCount: number
  /** 含子级总数（构建时缓存） */
  totalCount: number
}

export interface TreeSnapshot {
  id: 'current'
  source: 'browser' | 'html'
  importedAt: number
  root: FolderNode
}

export interface Settings {
  /** 剔除 utm_* / spm / from / fbclid / gclid 等追踪参数 */
  removeTrackingParams: boolean
  /** 规范化时忽略 #fragment */
  ignoreFragment: boolean
  /** 接管新标签页 */
  takeoverNewTab: boolean
  /** 空标签书签的兜底标签名（未分类视图使用，仅展示用） */
  theme: 'light' | 'dark' | 'system'
  /** 极速保存使用的上次标签组合 */
  lastTagIds: string[]
  lastTagUsedAt: number
  /** 收藏时默认同步写入本机浏览器书签 */
  syncToBrowser: boolean
  /** 浏览器书签落点：auto = 自动放最顶层，manual = 手动指定文件夹 */
  browserFolderMode: BrowserFolderMode
  /** 手动模式的目标文件夹 id（空字符串表示尚未选择） */
  browserFolderId: string
}

/** 浏览器书签文件夹（扁平化后带层级，用于下拉选择） */
export interface BrowserFolder {
  id: string
  name: string
  /** 完整路径，如「书签栏/开发工具」 */
  path: string
  /** 缩进层级，顶层为 0 */
  depth: number
  children: BrowserFolder[]
}

/**
 * 同步落点模式：
 * - auto：自动放到最顶层文件夹（Chrome / Edge 通常是「书签栏」）
 * - manual：放到用户手动指定的文件夹
 */
export type BrowserFolderMode = 'auto' | 'manual'

export type SortKey = 'lastOpened' | 'created' | 'openCount' | 'title' | 'url'
export type ViewMode = 'list' | 'grid'
export type FilterLogic = 'AND' | 'OR'

/**
 * 导入时单个文件夹的处理方式（在「是否生成标签」之上逐文件夹微调）：
 * - `tag`：该文件夹名生成为标签（默认）
 * - `group`：该文件夹名不生成标签，其下生成的标签归入同名分组
 * - `both`：既生成同名标签，又把该标签和其下标签归入同名分组
 *   （文件夹里既有子文件夹、又有直接放着的链接时用它）
 * - `none`：既不生成标签、也不成组，该层文件夹名直接忽略
 */
export type FolderMode = 'tag' | 'group' | 'both' | 'none'

/** 左侧固定入口 */
export type VirtualScope = 'all' | 'recent' | 'untagged'

export interface BookmarkFilter {
  scope: VirtualScope
  /** 选中的标签 id */
  tagIds: string[]
  logic: FilterLogic
  /** 搜索词（支持 #标签 / in:文件夹） */
  query: string
  /** 文件树节点路径来源 */
  treePath?: string
  sort: SortKey
  view: ViewMode
}

/** 解析 HTML 书签得到的中间结构（尚未写入书签池） */
export interface ParsedFolder {
  name: string
  path: string
  children: ParsedFolder[]
  bookmarks: ParsedBookmark[]
  directCount: number
  totalCount: number
}

export interface ParsedBookmark {
  url: string
  title: string
  favicon?: string
  addDate?: number
}

export interface SnapshotRecord {
  id?: number
  kind: 'full' | 'tree' | 'undo'
  label: string
  createdAt: number
  payload: unknown
}

export interface UndoPayload {
  type: 'batchTag'
  bookmarkIds: string[]
  /** 每个书签操作前的 tagIds 快照 */
  before: Record<string, string[]>
  /** 本次因打标签而新增（原本不在库中）的书签 id */
  addedIds: string[]
}
