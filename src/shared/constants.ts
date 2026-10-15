import type { Settings } from './types'

/** 预置 12 色色板（标签颜色） */
export const TAG_COLORS = [
  '#f87171',
  '#fb923c',
  '#fbbf24',
  '#a3e635',
  '#34d399',
  '#2dd4bf',
  '#38bdf8',
  '#60a5fa',
  '#818cf8',
  '#a78bfa',
  '#e879f9',
  '#f472b6',
] as const

export const DEFAULT_SETTINGS: Settings = {
  removeTrackingParams: true,
  ignoreFragment: true,
  takeoverNewTab: false,
  theme: 'system',
  lastTagIds: [],
  lastTagUsedAt: 0,
  syncToBrowser: true,
  browserFolderMode: 'auto',
  browserFolderId: '',
}

export const SETTINGS_KEY = 'app'

/** 保留的快照份数（设置页可回滚） */
export const MAX_BACKUP_SNAPSHOTS = 3
/** 最大撤销记录数 */
export const MAX_UNDO_SNAPSHOTS = 10
/** 回收站保留天数 */
export const TRASH_RETENTION_DAYS = 30
/** 批量打开上限 */
export const MAX_BATCH_OPEN = 10
/** “最近打开”窗口：7 天 */
export const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/** 标签名归一化：大小写 / 首尾空格 / 连续空白归一 */
export function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

/** 标签 id 由归一化名称生成（大小写不敏感去重） */
export function tagIdOf(name: string): string {
  return normalizeTagName(name).toLocaleLowerCase()
}

export function colorForName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return TAG_COLORS[hash % TAG_COLORS.length]
}

/** 分组 id 由归一化名称生成（同名分组视为同一个） */
export function groupIdOf(name: string): string {
  return `g-${tagIdOf(name)}`
}

/** 未分组标签在左侧栏中的虚拟分组键 */
export const UNGROUPED_KEY = '__ungrouped__'
