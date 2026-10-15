/**
 * URL 规范化规则（需求文档 5. 存储方案）
 * 1. 去除首尾空白，统一小写协议与 host
 * 2. 默认剔除追踪参数：utm_*、spm、from、fbclid、gclid
 * 3. 默认忽略 #fragment
 * 4. 去除空 query 的尾部 ?；根路径保留 /
 */

export interface NormalizeOptions {
  removeTrackingParams: boolean
  ignoreFragment: boolean
}

export const DEFAULT_NORMALIZE_OPTIONS: NormalizeOptions = {
  removeTrackingParams: true,
  ignoreFragment: true,
}

const TRACKING_PATTERNS: RegExp[] = [
  /^utm_/i,
  /^spm$/i,
  /^from$/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^yclid$/i,
  /^igshid$/i,
  /^mc_eid$/i,
  /^ref$/i,
  /^ref_src$/i,
]

export function normalizeUrl(raw: string, options: Partial<NormalizeOptions> = {}): string {
  const opts = { ...DEFAULT_NORMALIZE_OPTIONS, ...options }
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return ''

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return trimmed.toLowerCase()
  }

  url.protocol = url.protocol.toLowerCase()
  url.hostname = url.hostname.toLowerCase()

  if (opts.removeTrackingParams) {
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PATTERNS.some((pattern) => pattern.test(key))) {
        url.searchParams.delete(key)
      }
    }
  }

  if (opts.ignoreFragment) url.hash = ''

  let out = url.toString()
  if (!url.search) out = out.replace(/\?(?=#|$)/, '')
  return out
}

/** 供“已收藏”提示使用：页面可能被浏览器限制访问 */
export function isSpecialPage(url: string): boolean {
  return /^(chrome|edge|about|brave|opera|vivaldi|devtools|chrome-extension|moz-extension|file):/i.test(url)
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function isHttpUrl(url: string): boolean {
  return /^https?:/i.test(url)
}

function fallbackHash(input: string): string {
  // FNV-1a 32bit ×2，仅在 crypto.subtle 不可用时兜底
  let h1 = 0x811c9dc5
  let h2 = 0xcbf29ce4
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i)
    h1 = ((h1 ^ code) * 0x01000193) >>> 0
    h2 = ((h2 ^ (code + i)) * 0x01000193) >>> 0
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')
}

/** id = sha1(normUrl) 前 12 位 */
export async function bookmarkIdFor(normUrl: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return fallbackHash(normUrl).slice(0, 12)
  const data = new TextEncoder().encode(normUrl)
  const digest = await subtle.digest('SHA-1', data)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 12)
}
