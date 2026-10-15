import { hashPath } from '../shared/utils'
import type { AutoTagMode, FolderNode, ParsedBookmark, ParsedFolder } from '../shared/types'

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

/** 按导入策略挑出「要生成标签」的文件夹段：leaf 只取末级，ancestors 取全部 */
function pickedSegments(path: string, mode: AutoTagMode): FolderPathSegment[] {
  if (mode === 'none') return []
  const segments = folderPathSegments(path)
  return mode === 'leaf' ? segments.slice(-1) : segments
}

/**
 * 按导入策略从文件夹路径推导出要自动生成的标签名。
 * - `leaf`：只用末级文件夹名（如 `书签栏/开发工具/前端` → `前端`）
 * - `ancestors`：末级 + 所有祖先文件夹名（如 `书签栏/开发工具/前端` → `书签栏`、`开发工具`、`前端`）
 * 合成根节点 `书签` 不是真实文件夹，始终跳过。
 */
export function tagNamesFromPath(path: string, mode: AutoTagMode): string[] {
  return pickedSegments(path, mode).map((segment) => segment.name)
}

/** 单个书签的「标签 → 分组」推导结果 */
export interface TagPlanEntry {
  /** 要生成 / 关联的标签名 */
  name: string
  /** 该标签归属的分组名；未归属分组时为 undefined */
  groupName?: string
}

/**
 * 导入时推导单个书签要生成的标签，以及每个标签归属的分组。
 *
 * `groupPaths` 里是用户在导入预览里选了「成组」的文件夹路径：
 * - 这些文件夹自身不生成标签，而是把其下（不含自身）生成的标签统一归入同名分组；
 * - 分组只有一层，所以某个文件夹的祖先已经成组时，它即使被列进 `groupPaths` 也不再生效
 *   （标签归到最近的那个成组祖先）。
 */
export function folderTagPlan(
  path: string,
  mode: AutoTagMode,
  groupPaths: Iterable<string> = [],
): TagPlanEntry[] {
  const groupSet = groupPaths instanceof Set ? groupPaths : new Set(groupPaths)
  if (groupSet.size === 0) return tagNamesFromPath(path, mode).map((name) => ({ name }))

  const segments = folderPathSegments(path)
  const plan: TagPlanEntry[] = []
  for (const segment of pickedSegments(path, mode)) {
    // 成组的文件夹本身不生成标签
    if (groupSet.has(segment.path)) continue
    let groupName: string | undefined
    for (const ancestor of segments) {
      if (ancestor.path === segment.path) break
      // 取最近的成组祖先（分组只有一层，更上层的会被覆盖）
      if (groupSet.has(ancestor.path)) groupName = ancestor.name
    }
    plan.push(groupName ? { name: segment.name, groupName } : { name: segment.name })
  }
  return plan
}
