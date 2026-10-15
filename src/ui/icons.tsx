import { forwardRef } from 'react'
import {
  Check,
  ChevronRight,
  Clock,
  Download,
  Ellipsis,
  ExternalLink,
  Folder,
  LayoutGrid,
  List,
  Pin,
  Plus,
  Search,
  Settings,
  SquarePen,
  Star,
  Tag,
  Trash,
  Upload,
  X,
  Zap,
} from 'lucide-react'
import type { LucideIcon, LucideProps } from 'lucide-react'

/** 全项目统一的图标默认值：16px / 1.8 线宽（调用处仍可覆盖） */
const DEFAULT_ICON_SIZE = 16
const DEFAULT_STROKE_WIDTH = 1.8

/**
 * 把 lucide 图标包成项目里固定用法的组件：
 * 统一默认尺寸与线宽，并标记 aria-hidden（图标只是装饰，语义由外层按钮的 aria-label 提供）。
 */
function createIcon(Icon: LucideIcon) {
  const Component = forwardRef<SVGSVGElement, LucideProps>(function IconComponent(
    { width, height, strokeWidth, ...props },
    ref,
  ) {
    return (
      <Icon
        ref={ref}
        width={width ?? DEFAULT_ICON_SIZE}
        height={height ?? DEFAULT_ICON_SIZE}
        strokeWidth={strokeWidth ?? DEFAULT_STROKE_WIDTH}
        aria-hidden="true"
        {...props}
      />
    )
  })
  Component.displayName = `Icon(${Icon.displayName ?? 'Lucide'})`
  return Component
}

export const IconSearch = createIcon(Search)
export const IconStar = createIcon(Star)
export const IconTrash = createIcon(Trash)
export const IconTag = createIcon(Tag)
export const IconFolder = createIcon(Folder)
export const IconPlus = createIcon(Plus)
export const IconClose = createIcon(X)
export const IconChevron = createIcon(ChevronRight)
export const IconExternal = createIcon(ExternalLink)
export const IconEdit = createIcon(SquarePen)
export const IconDownload = createIcon(Download)
export const IconUpload = createIcon(Upload)
export const IconSettings = createIcon(Settings)
export const IconGrid = createIcon(LayoutGrid)
export const IconList = createIcon(List)
export const IconCheck = createIcon(Check)
export const IconPin = createIcon(Pin)
export const IconClock = createIcon(Clock)
export const IconBolt = createIcon(Zap)
export const IconEllipsis = createIcon(Ellipsis)
