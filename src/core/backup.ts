import type { Bookmark, Settings, Tag, TagGroup, TreeSnapshot } from '../shared/types'

const BACKUP_FORMAT = 'bookmarkbox-backup' as const
/** 旧版 TagMark 导出格式，导入时仍接受 */
const LEGACY_BACKUP_FORMAT = 'tagmark-backup' as const

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: 1
  exportedAt: number
  bookmarks: Bookmark[]
  tags: Tag[]
  groups: TagGroup[]
  tree: TreeSnapshot | null
  settings: Settings
}

export function buildBackup(input: {
  bookmarks: Bookmark[]
  tags: Tag[]
  groups: TagGroup[]
  tree: TreeSnapshot | null
  settings: Settings
}): string {
  const payload: BackupFile = {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: Date.now(),
    bookmarks: input.bookmarks,
    tags: input.tags,
    groups: input.groups,
    tree: input.tree,
    settings: input.settings,
  }
  return JSON.stringify(payload, null, 2)
}

export function parseBackup(text: string): BackupFile {
  const parsed = JSON.parse(text) as Partial<BackupFile> & { format?: string }
  if (parsed.format !== BACKUP_FORMAT && parsed.format !== LEGACY_BACKUP_FORMAT) {
    throw new Error(
      `不是 BookmarkBox 备份文件（缺少 format: ${BACKUP_FORMAT}）`,
    )
  }
  if (!Array.isArray(parsed.bookmarks)) {
    throw new Error('备份文件缺少 bookmarks 字段')
  }
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: parsed.exportedAt ?? Date.now(),
    bookmarks: parsed.bookmarks,
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    // 旧版本备份没有 groups 字段，容错为空数组
    groups: Array.isArray(parsed.groups) ? parsed.groups : [],
    tree: parsed.tree ?? null,
    settings: parsed.settings as Settings,
  }
}

/* ------------------------------ HTML 导出 ------------------------------ */

export type HtmlExportStrategy = 'byTag' | 'flat'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function anchor(bookmark: Bookmark, indent: string): string {
  const addDate = Math.floor((bookmark.createdAt || Date.now()) / 1000)
  return `${indent}<DT><A HREF="${escapeHtml(bookmark.url)}" ADD_DATE="${addDate}">${escapeHtml(
    bookmark.title || bookmark.url,
  )}</A>`
}

export function buildNetscapeHtml(
  bookmarks: Bookmark[],
  tags: Tag[],
  strategy: HtmlExportStrategy,
): string {
  const head = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
  ]

  const active = bookmarks.filter((bookmark) => !bookmark.deletedAt)

  if (strategy === 'flat') {
    const lines = active.map((bookmark) => anchor(bookmark, '    '))
    return [...head, '<DL><p>', ...lines, '</DL><p>', ''].join('\n')
  }

  const usedTagIds = new Set(active.flatMap((bookmark) => bookmark.tagIds))
  const usedTags = tags.filter((tag) => usedTagIds.has(tag.id))
  const untagged = active.filter((bookmark) => bookmark.tagIds.length === 0)

  const lines: string[] = ['<DL><p>']
  for (const tag of usedTags) {
    const items = active.filter((bookmark) => bookmark.tagIds.includes(tag.id))
    if (items.length === 0) continue
    lines.push(`    <DT><H3>${escapeHtml(tag.name)}</H3>`)
    lines.push('    <DL><p>')
    lines.push(...items.map((bookmark) => anchor(bookmark, '        ')))
    lines.push('    </DL><p>')
  }
  if (untagged.length > 0) {
    lines.push('    <DT><H3>未分类</H3>')
    lines.push('    <DL><p>')
    lines.push(...untagged.map((bookmark) => anchor(bookmark, '        ')))
    lines.push('    </DL><p>')
  }
  lines.push('</DL><p>')

  return [...head, ...lines, ''].join('\n')
}
