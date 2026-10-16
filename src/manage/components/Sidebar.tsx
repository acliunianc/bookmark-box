import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Tooltip } from '@heroui/react'
import { cn } from '../../ui/cn'
import { IconChevron, IconFolder, IconTag } from '../../ui/icons'

interface SidebarProps {
  tagCount: number
  tagPanel: ReactNode
  treePanel: ReactNode
}

const MIN_WIDTH = 240
const MAX_WIDTH = 520
/** 左侧面板默认宽度 */
const DEFAULT_WIDTH = 350

export function Sidebar({ tagCount, tagPanel, treePanel }: SidebarProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [collapsed, setCollapsed] = useState(false)
  const [tagsCollapsed, setTagsCollapsed] = useState(false)
  const [treeCollapsed, setTreeCollapsed] = useState(false)
  const [ratio, setRatio] = useState(0.55)
  const dragging = useRef<'width' | 'split' | null>(null)

  const onMouseMove = useCallback((event: MouseEvent) => {
    if (dragging.current === 'width') {
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, event.clientX)))
      return
    }
    if (dragging.current === 'split') {
      const container = document.getElementById('bookmarkbox-sidebar-body')
      if (!container) return
      const rect = container.getBoundingClientRect()
      setRatio(Math.min(0.85, Math.max(0.15, (event.clientY - rect.top) / rect.height)))
    }
  }, [])

  useEffect(() => {
    const stop = () => {
      dragging.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', stop)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', stop)
    }
  }, [onMouseMove])

  const startDrag = (kind: 'width' | 'split') => {
    dragging.current = kind
    document.body.style.cursor = kind === 'width' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
  }

  if (collapsed) {
    return (
      <div className="flex w-6 shrink-0 flex-col items-center border-r border-[var(--separator)] bg-[var(--surface)]">
        <Tooltip delay={400}>
          <Tooltip.Trigger>
            <Button
              size="sm"
              isIconOnly
              variant="ghost"
              className="mt-3 h-24 min-h-0 w-5 min-w-0 rounded p-0 text-[var(--muted)]"
              aria-label="展开左侧栏"
              onPress={() => setCollapsed(false)}
            >
              <IconChevron width={12} height={12} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>展开左侧栏</Tooltip.Content>
        </Tooltip>
      </div>
    )
  }

  return (
    <div className="relative flex shrink-0 border-r border-[var(--separator)] bg-[var(--surface)]" style={{ width }}>
      <div id="bookmarkbox-sidebar-body" className="flex min-h-0 flex-1 flex-col">
        {/* 标签区 */}
        <section
          className="flex min-h-0 flex-col"
          style={{ height: tagsCollapsed ? 'auto' : `${ratio * 100}%` }}
        >
          <div className="flex items-center justify-between px-3 py-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 min-h-0 min-w-0 gap-1.5 rounded px-1 text-xs font-semibold text-[var(--muted)]"
              onPress={() => setTagsCollapsed((prev) => !prev)}
            >
              <IconChevron
                width={12}
                height={12}
                className={cn('transition', tagsCollapsed ? 'rotate-0' : 'rotate-90')}
              />
              <IconTag width={13} height={13} />
              标签 ({tagCount})
            </Button>
            <Tooltip delay={400}>
              <Tooltip.Trigger>
                <Button
                  size="sm"
                  isIconOnly
                  variant="ghost"
                  className="size-6 min-h-0 min-w-0 rounded p-0 text-xs text-[var(--muted)]"
              aria-label="收起左侧栏"
              onPress={() => setCollapsed(true)}
            >
              <IconChevron width={12} height={12} className="rotate-180" />
            </Button>
              </Tooltip.Trigger>
              <Tooltip.Content>收起左侧栏</Tooltip.Content>
            </Tooltip>
          </div>
          {tagsCollapsed ? null : tagPanel}
        </section>

        {tagsCollapsed || treeCollapsed ? null : (
          <div
            className="h-1 shrink-0 cursor-row-resize bg-transparent hover:bg-[var(--accent)]/40"
            onMouseDown={() => startDrag('split')}
            role="separator"
            aria-orientation="horizontal"
          />
        )}

        {/* 文件树区 */}
        <section className="flex min-h-0 flex-1 flex-col border-t border-[var(--separator)]">
          <div className="flex items-center justify-between px-3 py-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 min-h-0 min-w-0 gap-1.5 rounded px-1 text-xs font-semibold text-[var(--muted)]"
              onPress={() => setTreeCollapsed((prev) => !prev)}
            >
              <IconChevron
                width={12}
                height={12}
                className={cn('transition', treeCollapsed ? 'rotate-0' : 'rotate-90')}
              />
              <IconFolder width={13} height={13} />
              文件树
            </Button>
          </div>
          {treeCollapsed ? null : treePanel}
        </section>
      </div>

      <div
        className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-[var(--accent)]/40"
        onMouseDown={() => startDrag('width')}
        role="separator"
        aria-orientation="vertical"
      />
    </div>
  )
}
