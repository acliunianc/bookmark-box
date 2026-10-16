import { useState } from 'react'
import { domainOf } from '../core/normalizeUrl'
import { faviconUrl } from '../shared/utils'
import { cn } from './cn'

interface FaviconProps {
  url: string
  /** 显示边长（px） */
  size?: number
  className?: string
}

function siteFavicon(url: string): string | null {
  try {
    return new URL('/favicon.ico', url).href
  } catch {
    return null
  }
}

function letterOf(url: string): string {
  const domain = domainOf(url).replace(/^www\./, '')
  const char = domain.trim().charAt(0)
  return char ? char.toUpperCase() : '·'
}

/**
 * 书签图标：优先 Chrome 的 `_favicon` 缓存，失败再试站点 `/favicon.ico`，
 * 都没有时用域名首字母，避免整块空白。
 */
export function Favicon({ url, size = 20, className }: FaviconProps) {
  const chromeSrc = faviconUrl(url, 32)
  const originSrc = siteFavicon(url)
  const [stage, setStage] = useState<'chrome' | 'origin' | 'letter'>(chromeSrc ? 'chrome' : 'origin')

  const src = stage === 'chrome' ? chromeSrc : stage === 'origin' ? originSrc : null

  return (
    <span
      className={cn(
        'inline-grid shrink-0 place-items-center overflow-hidden rounded bg-[var(--default)] text-[10px] font-semibold text-[var(--muted)]',
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {src && stage !== 'letter' ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="size-full object-contain"
          onError={() => setStage((prev) => (prev === 'chrome' && originSrc ? 'origin' : 'letter'))}
        />
      ) : (
        letterOf(url)
      )}
    </span>
  )
}
