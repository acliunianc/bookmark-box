import { domainOf } from '../core/normalizeUrl'

/** 稳定短哈希：用于 FolderNode.id（路径哈希） */
export function hashPath(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash ^ input.charCodeAt(i)) * 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** Chrome 已缓存的站点图标；不在扩展环境（没有 runtime.id）时返回 null */
export function faviconUrl(url: string, size = 32): string | null {
  const id = chrome.runtime?.id
  if (!id) return null
  return `chrome-extension://${id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=${size}`
}

export function relativeTime(ts?: number): string {
  if (!ts) return '—'
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`
  return new Date(ts).toLocaleDateString('zh-CN')
}

export function formatDateTime(ts?: number): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function displayDomain(url: string): string {
  const path = (() => {
    try {
      const parsed = new URL(url)
      const rest = `${parsed.pathname}${parsed.search}`
      return rest === '/' ? '' : rest
    } catch {
      return ''
    }
  })()
  return `${domainOf(url)}${path}`
}

export interface HighlightSegment {
  text: string
  match: boolean
}

/** 关键字高亮：把命中片段拆成 [文本, 是否命中] */
export function highlightSegments(text: string, keywords: string[]): HighlightSegment[] {
  const cleaned = keywords.map((k) => k.trim()).filter((k) => k.length > 0)
  if (cleaned.length === 0) return [{ text, match: false }]
  const escaped = cleaned.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts = text.split(re)
  return parts
    .filter((part) => part !== '')
    .map((part) => ({ text: part, match: cleaned.some((k) => k.toLowerCase() === part.toLowerCase()) }))
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function download(filename: string, content: string, mime = 'application/json'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function timestampTag(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
}
