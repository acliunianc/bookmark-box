import { hashPath } from '../shared/utils'
import type { FolderMode, FolderNode, ParsedBookmark, ParsedFolder } from '../shared/types'

/** 解析时创建的合成根节点名（它不是一个真实文件夹，自动生成标签时会跳过） */
export const ROOT_FOLDER_NAME = '书签'

export interface ParsedItem extends ParsedBookmark {
  /** 所在文件夹路径，如 "书签栏/开发工具/前端" */
  path: string
}

export interface ParseResult {
  source: 'browser' | 'html'
  root: ParsedFolder
  /** 扁平化的全部书签（含 importPaths） */
  items: ParsedItem[]
}

function createFolder(name: string, parent: ParsedFolder | null): ParsedFolder {
  const path = parent ? (parent.path ? `${parent.path}/${name}` : name) : name
  return { name, path, children: [], bookmarks: [], directCount: 0, totalCount: 0 }
}

function finalize(folder: ParsedFolder): void {
  folder.directCount = folder.bookmarks.length
  folder.totalCount =
    folder.directCount + folder.children.reduce((sum, child) => sum + child.totalCount, 0)
}

function toItems(folder: ParsedFolder, out: ParsedItem[]): void {
  for (const bookmark of folder.bookmarks) out.push({ ...bookmark, path: folder.path })
  for (const child of folder.children) toItems(child, out)
}

/* ------------------------------------------------------------------ */
/* 1. Netscape Bookmark HTML（Chrome / Edge / Firefox / Safari 通用）  */
/* ------------------------------------------------------------------ */

function readAnchor(anchor: Element): ParsedBookmark | null {
  const url = anchor.getAttribute('href') ?? ''
  if (!url.trim()) return null
  const addDateRaw = anchor.getAttribute('add_date') ?? anchor.getAttribute('last_visit')
  const addDate = addDateRaw ? Number(addDateRaw) * 1000 : undefined
  return {
    url,
    title: (anchor.textContent ?? '').trim() || url,
    favicon: anchor.getAttribute('icon') ?? undefined,
    addDate: Number.isFinite(addDate) ? addDate : undefined,
  }
}

function directChild(parent: Element, tagName: string): Element | null {
  for (const child of Array.from(parent.children)) {
    if (child.tagName.toLowerCase() === tagName) return child
  }
  return null
}

function parseDl(dl: Element, parent: ParsedFolder): void {
  const children = Array.from(dl.children)

  children.forEach((child, index) => {
    const tag = child.tagName.toLowerCase()

    if (tag === 'dt') {
      const heading = directChild(child, 'h3')
      const anchor = directChild(child, 'a')
      const nestedDl = directChild(child, 'dl')

      if (heading) {
        const folder = createFolder((heading.textContent ?? '').trim() || '未命名文件夹', parent)
        parent.children.push(folder)
        if (nestedDl) parseDl(nestedDl, folder)
      } else if (anchor) {
        const parsed = readAnchor(anchor)
        if (parsed) parent.bookmarks.push(parsed)
        if (nestedDl) parseDl(nestedDl, parent)
      } else if (nestedDl) {
        parseDl(nestedDl, parent)
      }
      return
    }

    if (tag === 'h3') {
      const folder = createFolder((child.textContent ?? '').trim() || '未命名文件夹', parent)
      parent.children.push(folder)
      const next = children[index + 1]
      if (next && next.tagName.toLowerCase() === 'dl') parseDl(next, folder)
      return
    }

    if (tag === 'a') {
      const parsed = readAnchor(child)
      if (parsed) parent.bookmarks.push(parsed)
      return
    }

    if (tag === 'dl') {
      parseDl(child, parent)
    }
  })
}

export function parseNetscapeHtml(html: string): ParseResult {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = createFolder(ROOT_FOLDER_NAME, null)
  const topDl = doc.querySelector('dl')
  if (topDl) parseDl(topDl, root)

  const finalizeTree = (folder: ParsedFolder): void => {
    folder.children.forEach(finalizeTree)
    finalize(folder)
  }
  finalizeTree(root)

  const items: ParsedItem[] = []
  toItems(root, items)
  return { source: 'html', root, items }
}

/* ------------------------------------------------------------------ */
/* 2. 浏览器书签树（chrome.bookmarks）                                 */
/* ------------------------------------------------------------------ */

export function parseBrowserTree(nodes: chrome.bookmarks.BookmarkTreeNode[]): ParseResult {
  const root = createFolder(ROOT_FOLDER_NAME, null)

  const visit = (node: chrome.bookmarks.BookmarkTreeNode, parent: ParsedFolder): void => {
    if (node.url) {
      parent.bookmarks.push({
        url: node.url,
        title: node.title || node.url,
        addDate: node.dateAdded,
      })
      return
    }
    const isSyntheticRoot = node.id === '0'
    const target = isSyntheticRoot
      ? parent
      : (() => {
          const folder = createFolder(node.title || '未命名文件夹', parent)
          parent.children.push(folder)
          return folder
        })()
    for (const child of node.children ?? []) visit(child, target)
  }

  for (const node of nodes) visit(node, root)

  const finalizeTree = (folder: ParsedFolder): void => {
    folder.children.forEach(finalizeTree)
    finalize(folder)
  }
  finalizeTree(root)

  const items: ParsedItem[] = []
  toItems(root, items)
  return { source: 'browser', root, items }
}

/* ------------------------------------------------------------------ */
/* 3. ParsedFolder -> FolderNode（只读快照）                            */
/* ------------------------------------------------------------------ */

export function toFolderNode(folder: ParsedFolder): FolderNode {
  return {
    id: `node-${hashPath(folder.path)}`,
    name: folder.name,
    path: folder.path,
    children: folder.children.map(toFolderNode),
    directCount: folder.directCount,
    totalCount: folder.totalCount,
  }
}

export function walkFolderTree(node: FolderNode, visit: (node: FolderNode) => void): void {
  visit(node)
  node.children.forEach((child) => walkFolderTree(child, visit))
}

/** 文件夹路径的一段（含自己的完整路径，用于判定它是否被选为「分组」） */
export interface FolderPathSegment {
  name: string
  /** 该段自己的完整路径，如 `书签栏/开发工具` */
  path: string
}

/**
 * 把文件夹路径拆成一段段（每段带自己的完整路径）。
 * 合成根节点 `书签` 不是真实文件夹，始终跳过。
 */
export function folderPathSegments(path: string): FolderPathSegment[] {
  const segments: FolderPathSegment[] = []
  let acc = ''
  for (const name of path.split('/').filter(Boolean)) {
    acc = acc ? `${acc}/${name}` : name
    if (segments.length === 0 && name === ROOT_FOLDER_NAME) continue
    segments.push({ name, path: acc })
  }
  return segments
}

/** 单个书签的「标签 → 分组」推导结果 */
export interface TagPlanEntry {
  /** 要生成 / 关联的标签名 */
  name: string
  /** 该标签归属的分组名；未归属分组时为 undefined */
  groupName?: string
}

/**
 * 文件夹路径 → 处理方式的映射（只有被显式改过的文件夹才需要出现在里面）。
 * 用普通对象而不是 Map，因为它要跟着消息 JSON 往返（渲染层 → service worker）。
 */
export type FolderModeMap = Readonly<Record<string, FolderMode>>

/** 取某个文件夹的处理方式，缺省视为「创建为标签」 */
export function folderModeOf(folderModes: FolderModeMap, path: string): FolderMode {
  return folderModes[path] ?? 'tag'
}

/** `group` 与 `both` 都会占用这一层分组名（分组只有一层，不能再嵌套） */
export function isGroupingMode(mode: FolderMode): boolean {
  return mode === 'group' || mode === 'both'
}

/** 路径上是否已有祖先占用了分组（不含自身） */
export function hasGroupingAncestor(path: string, folderModes: FolderModeMap): boolean {
  const segments = path.split('/')
  let acc = ''
  for (let index = 0; index < segments.length - 1; index += 1) {
    acc = acc ? `${acc}/${segments[index]}` : segments[index]
    if (isGroupingMode(folderModeOf(folderModes, acc))) return true
  }
  return false
}

/**
 * 该文件夹能否被设为「分组」或「成组+标签」。
 *
 * 这两种方式都要把它下面生成的标签归入同名分组，所以必须还有子文件夹；
 * 分组只有一层，祖先已经成组时它也不能再成组。
 */
export function canGroupFolder(node: FolderNode, hasGroupAncestor = false): boolean {
  return node.children.length > 0 && !hasGroupAncestor
}

/** 某个处理方式对该文件夹是否可用（不可用时批量套用会跳过它） */
export function folderModeSupported(
  node: FolderNode,
  mode: FolderMode,
  hasGroupAncestor = false,
): boolean {
  if (isGroupingMode(mode)) return canGroupFolder(node, hasGroupAncestor)
  return true
}

/**
 * 导入时推导单个书签要生成的标签，以及每个标签归属的分组。
 *
 * 路径上**每一层**文件夹都按各自的处理方式来：`folderModes` 是用户在导入预览里逐文件夹
 * 设置的映射，缺省即 `tag`。所以默认情况下 `书签栏/开发工具/前端` 会得到三个标签
 * （`#书签栏`、`#开发工具`、`#前端`），想去掉某一层就把那一层设成 `none`。
 *
 * - `tag`（默认）：该文件夹名生成一个标签；
 * - `group`：该文件夹自身不生成标签，其下生成的标签统一归入同名分组；
 * - `both`：既生成同名标签，又把这个标签和其下标签归入同名分组。
 *   文件夹里既有子文件夹、又有直接放着的链接时用它，那些链接也会带上这一层的标签；
 * - 分组只有一层，祖先已经成组时，更靠下的 `group` / `both` 不再生效
 *   （标签归到最近的那个成组祖先）；
 * - `none`：这一层文件夹既不生成标签也不成组，直接忽略（不影响其它层）。
 *
 * 整体不生成标签时由调用方跳过本函数（或传 `enabled = false`）。
 */
export function folderTagPlan(
  path: string,
  folderModes: FolderModeMap = {},
  enabled = true,
): TagPlanEntry[] {
  if (!enabled) return []

  const segments = folderPathSegments(path)
  const plan: TagPlanEntry[] = []
  for (const segment of segments) {
    const mode = folderModeOf(folderModes, segment.path)
    // 「分组」与「不处理」自身都不生成标签；「成组+标签」会生成
    if (mode !== 'tag' && mode !== 'both') continue
    let groupName: string | undefined
    for (const ancestor of segments) {
      if (ancestor.path === segment.path) break
      // 取最近的成组祖先（分组只有一层，更上层的会被覆盖）
      if (isGroupingMode(folderModeOf(folderModes, ancestor.path))) groupName = ancestor.name
    }
    // 自身是「成组+标签」时，这个标签也归进同名分组
    if (!groupName && mode === 'both') groupName = segment.name
    plan.push(groupName ? { name: segment.name, groupName } : { name: segment.name })
  }
  return plan
}
