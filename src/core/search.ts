import MiniSearch from 'minisearch'
import { tagIdOf } from '../shared/constants'
import type { Bookmark } from '../shared/types'

export interface ParsedQuery {
  /** 自由关键词 */
  keywords: string[]
  /** #标签 名称（归一化后的 id） */
  tagIds: string[]
  /** in:文件夹 路径片段 */
  folder: string
}

/** 解析搜索语法：#标签 / in:文件夹 / 多关键词 */
export function parseQuery(query: string): ParsedQuery {
  const keywords: string[] = []
  const tagIds: string[] = []
  let folder = ''

  for (const raw of query.split(/\s+/)) {
    if (!raw) continue
    if (raw.startsWith('#')) {
      const name = raw.slice(1).trim()
      if (name) tagIds.push(tagIdOf(name))
      continue
    }
    if (/^in:/i.test(raw)) {
      const value = raw.slice(3).trim()
      if (value) folder = value
      continue
    }
    keywords.push(raw)
  }

  return { keywords, tagIds, folder }
}

/* ---------------- MiniSearch 全文索引（中文按字 + 二元组切分） ---------------- */

interface SearchDoc {
  id: string
  title: string
  url: string
  tags: string
}

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

function cjkTokenize(text: string): string[] {
  const tokens: string[] = []
  for (const run of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (!run) continue
    if (CJK_RE.test(run)) {
      const chars = [...run]
      for (const ch of chars) tokens.push(ch)
      for (let i = 0; i < chars.length - 1; i += 1) tokens.push(chars[i] + chars[i + 1])
    } else {
      tokens.push(run)
    }
  }
  return tokens
}

export class BookmarkIndex {
  private mini = new MiniSearch<SearchDoc>({
    fields: ['title', 'url', 'tags'],
    tokenize: cjkTokenize,
    searchOptions: { prefix: true, combineWith: 'AND', boost: { title: 3, tags: 2 } },
  })

  constructor(bookmarks: Bookmark[], tagNameById: Map<string, string>) {
    this.rebuild(bookmarks, tagNameById)
  }

  rebuild(bookmarks: Bookmark[], tagNameById: Map<string, string>): void {
    this.mini.removeAll()
    const docs: SearchDoc[] = []
    for (const bookmark of bookmarks) {
      if (bookmark.deletedAt) continue
      docs.push({
        id: bookmark.id,
        title: bookmark.title,
        url: bookmark.url,
        tags: bookmark.tagIds.map((id) => tagNameById.get(id) ?? '').join(' '),
      })
    }
    this.mini.addAll(docs)
  }

  /** 返回命中的书签 id 集合；keywords 为空时返回 null（表示“不过滤”） */
  search(keywords: string[]): Set<string> | null {
    if (keywords.length === 0) return null
    const hits = this.mini.search(keywords.join(' '), { prefix: true, combineWith: 'AND' })
    return new Set(hits.map((hit) => String(hit.id)))
  }
}

/** 组合过滤：标签交集/并集 + 文件夹路径 + 关键词 + 虚拟入口 */
export function filterBookmarks(
  bookmarks: Bookmark[],
  options: {
    tagIds: string[]
    logic: 'AND' | 'OR'
    scope: 'all' | 'recent' | 'untagged'
    recentWindowMs: number
    treePath?: string
    keywordHits: Set<string> | null
    folderQuery: string
  },
): Bookmark[] {
  const { tagIds, logic, scope, recentWindowMs, treePath, keywordHits, folderQuery } = options
  const now = Date.now()

  return bookmarks.filter((bookmark) => {
    if (bookmark.deletedAt) return false

    if (scope === 'untagged' && bookmark.tagIds.length > 0) return false
    if (scope === 'recent' && !(bookmark.lastOpenedAt && now - bookmark.lastOpenedAt <= recentWindowMs)) {
      return false
    }

    if (tagIds.length > 0) {
      const matched = tagIds.filter((id) => bookmark.tagIds.includes(id)).length
      if (logic === 'AND' ? matched !== tagIds.length : matched === 0) return false
    }

    if (treePath) {
      const prefix = `${treePath}/`
      const hit = bookmark.importPaths.some((path) => path === treePath || path.startsWith(prefix))
      if (!hit) return false
    }

    if (folderQuery) {
      const needle = folderQuery.toLowerCase()
      const hit = bookmark.importPaths.some((path) => path.toLowerCase().includes(needle))
      if (!hit) return false
    }

    if (keywordHits && !keywordHits.has(bookmark.id)) return false

    return true
  })
}

export function sortBookmarks(bookmarks: Bookmark[], sort: string): Bookmark[] {
  const list = [...bookmarks]
  switch (sort) {
    case 'created':
      list.sort((a, b) => b.createdAt - a.createdAt)
      break
    case 'openCount':
      list.sort((a, b) => b.openCount - a.openCount || (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
      break
    case 'title':
      list.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
      break
    case 'url':
      list.sort((a, b) => a.url.localeCompare(b.url))
      break
    case 'lastOpened':
    default:
      list.sort(
        (a, b) =>
          (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) ||
          b.openCount - a.openCount ||
          b.createdAt - a.createdAt,
      )
      break
  }
  return list
}
