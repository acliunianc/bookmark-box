import { useEffect, useMemo, useState } from 'react'
import { Button, Tooltip } from '@heroui/react'
import type { FolderNode, TreeSnapshot } from '../../shared/types'
import { relativeTime } from '../../shared/utils'
import { cn } from '../../ui/cn'
import { IconBolt, IconChevron, IconFolder, IconPlus, IconUpload } from '../../ui/icons'

interface TreePanelProps {
  tree: TreeSnapshot | null
  selectedPath?: string
  onSelectPath: (path?: string) => void
  onBatchTag: (node: FolderNode) => void
  onReadBrowser: () => void
  onPickHtml: () => void
  disabled?: boolean
}

export function TreePanel({
  tree,
  selectedPath,
  onSelectPath,
  onBatchTag,
  onReadBrowser,
  onPickHtml,
  disabled,
}: TreePanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    setExpanded(new Set())
  }, [tree?.importedAt])

  const topNodes = useMemo(() => tree?.root.children ?? [], [tree])

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const renderNode = (node: FolderNode, depth: number) => {
    const hasChildren = node.children.length > 0
    const isOpen = expanded.has(node.path)
    const isSelected = selectedPath === node.path

    return (
      <div key={node.id}>
        <div
          className={cn(
            'group flex items-center gap-1 rounded-md py-1 pr-1 text-sm transition',
            isSelected ? 'bg-[var(--accent)]/20' : 'hover:bg-[var(--default)]',
          )}
          style={{ paddingLeft: depth * 12 + 4 }}
        >
          <Button
            size="sm"
            isIconOnly
            variant="ghost"
            aria-label={isOpen ? '折叠' : '展开'}
            isDisabled={!hasChildren}
            className={cn(
              'size-5 min-h-0 min-w-0 shrink-0 rounded p-0 text-[var(--muted)]',
              !hasChildren && 'invisible',
            )}
            onPress={() => toggle(node.path)}
          >
            <IconChevron width={12} height={12} className={cn('transition', isOpen && 'rotate-90')} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            fullWidth
            className="h-6 min-h-0 min-w-0 flex-1 justify-start gap-1.5 px-1 text-sm font-normal"
            onPress={() => onSelectPath(isSelected ? undefined : node.path)}
            aria-label={`${node.path}，共 ${node.totalCount} 条`}
          >
            <IconFolder width={14} height={14} className="shrink-0 text-[var(--warning)]" />
            <span className="truncate">{node.name}</span>
            <span className="shrink-0 text-xs text-[var(--muted)]">{node.directCount}</span>
          </Button>
          <Tooltip delay={400}>
            <Tooltip.Trigger>
              <Button
                size="sm"
                isIconOnly
                variant="ghost"
                className="size-6 min-h-0 min-w-0 shrink-0 rounded p-0 text-[var(--muted)] opacity-0 transition group-hover:opacity-100"
                aria-label="为该文件夹下的书签批量打标签"
                onPress={() => onBatchTag(node)}
              >
                <IconBolt width={14} height={14} />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>为该文件夹下的书签批量打标签</Tooltip.Content>
          </Tooltip>
        </div>
        {isOpen
          ? node.children.map((child) => renderNode(child, depth + 1))
          : null}
      </div>
    )
  }

  if (!tree) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-xs text-[var(--muted)]">
          文件树为只读快照，用「导入 HTML 书签」生成，用于批量打标签
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onPress={onPickHtml} isDisabled={disabled}>
            <IconUpload width={14} height={14} />
            导入 HTML
          </Button>
          <Button size="sm" variant="ghost" onPress={onReadBrowser} isDisabled={disabled}>
            读取浏览器书签
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 px-3 pb-2 text-xs text-[var(--muted)]">
        <span className="truncate">
          {tree.source === 'browser' ? '本机书签' : '导入'} · {relativeTime(tree.importedAt)}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            isIconOnly
            variant="ghost"
            className="size-6 min-h-0 min-w-0 rounded p-0 text-[var(--muted)]"
            aria-label="重新读取本机书签（整体替换快照）"
            onPress={onReadBrowser}
          >
            <IconPlus width={13} height={13} className="rotate-45" />
          </Button>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {topNodes.map((node) => renderNode(node, 0))}
      </div>
    </div>
  )
}
