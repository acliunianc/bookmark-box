import type { Bookmark } from '../shared/types'

/** 文件树节点圈定的书签范围（按 importPaths 匹配） */
export function selectBookmarksForNode(
  bookmarks: Bookmark[],
  path: string,
  includeChildren: boolean,
): Bookmark[] {
  const prefix = `${path}/`
  return bookmarks.filter((bookmark) => {
    if (bookmark.deletedAt) return false
    return bookmark.importPaths.some(
      (importPath) => importPath === path || (includeChildren && importPath.startsWith(prefix)),
    )
  })
}

export type MergeMode = 'append' | 'replace'

export function mergeTagIds(existing: string[], incoming: string[], mode: MergeMode): string[] {
  if (mode === 'replace') return [...new Set(incoming)]
  return [...new Set([...existing, ...incoming])]
}
