import { useEffect, useMemo, useState } from 'react'
import { Button, ToggleButton, ToggleButtonGroup, Tooltip } from '@heroui/react'
import type { AutoTagMode, FolderNode } from '../../shared/types'
import { cn } from '../../ui/cn'
import { IconChevron, IconFolder } from '../../ui/icons'

/** 单个文件夹节点的处理方式 */
type NodeMode = 'tag' | 'group'

interface ImportFolderPlanProps {
  /** 解析结果的根节点（合成根），只渲染它的 children */
  root: FolderNode
  /** 当前策略，none 时不会生成标签，配置整体失效 */
  autoTagMode: AutoTagMode
  /** 已选为「成组」的文件夹路径 */
  groupPaths: Set<string>
  onChange: (next: Set<string>) => void
}

/** 判断某个路径下（不含自身）是否已有祖先被选为成组 */
function hasGroupAncestor(path: string, groupPaths: Set<string>): boolean {
  const segments = path.split('/')
  let acc = ''
  for (let index = 0; index < segments.length - 1; index += 1) {
    acc = acc ? `${acc}/${segments[index]}` : segments[index]
    if (groupPaths.has(acc)) return true
  }
  return false
}

/**
 * 导入预览里的「文件夹 → 标签 / 分组」配置树。
 *
 * 每个文件夹可以单独选择：
 * - 创建为标签（默认）：按标签策略生成同名标签
 * - 成组：该文件夹自身不生成标签，其下所有标签归入同名分组
 *
 * 分组只有一层，因此祖先已选成组时，后代不能再选成组。
 */
export function ImportFolderPlan({ root, autoTagMode, groupPaths, onChange }: ImportFolderPlanProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const topNodes = useMemo(() => root.children, [root])
  const disabled = autoTagMode === 'none'

  /* 顶层文件夹换了才重置展开状态（默认展开顶层），避免无关重渲染把树折叠回去 */
  const topKey = topNodes.map((node) => node.path).join('|')
  useEffect(() => {
    setExpanded(new Set(topKey ? topKey.split('|') : []))
  }, [topKey])

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const setNodeMode = (node: FolderNode, mode: NodeMode) => {
    const next = new Set(groupPaths)
    if (mode === 'group') {
      next.add(node.path)
      // 祖先成组后，后代不能再成组，顺手清掉已选的子孙
      for (const path of [...next]) {
        if (path !== node.path && path.startsWith(`${node.path}/`)) next.delete(path)
      }
    } else {
      next.delete(node.path)
    }
    onChange(next)
  }

  const renderNode = (node: FolderNode, depth: number) => {
    const hasChildren = node.children.length > 0
    const isOpen = expanded.has(node.path)
    const isGroup = groupPaths.has(node.path)
    const groupBlocked = hasGroupAncestor(node.path, groupPaths)

    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-1 rounded-md py-0.5 pr-1 hover:bg-[var(--default)]"
          style={{ paddingLeft: depth * 12 + 2 }}
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
            onPress={() => toggleExpand(node.path)}
          >
            <IconChevron width={12} height={12} className={cn('transition', isOpen && 'rotate-90')} />
          </Button>

          <span
            className={cn(
              'flex min-w-0 flex-1 items-center gap-1.5 text-sm',
              isGroup && 'text-[var(--accent)]',
            )}
            title={`${node.path} · 直属 ${node.directCount} 条 / 共 ${node.totalCount} 条`}
          >
            <IconFolder
              width={14}
              height={14}
              className={cn('shrink-0', isGroup ? 'text-[var(--accent)]' : 'text-[var(--warning)]')}
            />
            <span className="truncate">{node.name}</span>
            <span className="shrink-0 text-xs text-[var(--muted)]">{node.totalCount}</span>
          </span>

          <Tooltip delay={200}>
            <Tooltip.Trigger className="shrink-0">
              <ToggleButtonGroup
                size="sm"
                selectionMode="single"
                disallowEmptySelection
                isDisabled={disabled}
                selectedKeys={[isGroup ? 'group' : 'tag']}
                onSelectionChange={(keys) => {
                  const key = [...keys][0]
                  if (key === 'tag' || key === 'group') setNodeMode(node, key)
                }}
              >
                <ToggleButton id="tag" aria-label={`${node.name} 创建为标签`}>
                  标签
                </ToggleButton>
                <ToggleButton
                  id="group"
                  aria-label={`${node.name} 标签成组`}
                  isDisabled={groupBlocked}
                >
                  <ToggleButtonGroup.Separator />
                  分组
                </ToggleButton>
              </ToggleButtonGroup>
            </Tooltip.Trigger>
            <Tooltip.Content>
              {groupBlocked
                ? '祖先文件夹已选为分组，分组不能嵌套'
                : `「${node.name}」创建为标签，或成组：该文件夹不生成标签，其下生成的标签归入同名分组`}
            </Tooltip.Content>
          </Tooltip>
        </div>
        {isOpen ? node.children.map((child) => renderNode(child, depth + 1)) : null}
      </div>
    )
  }

  if (topNodes.length === 0) return null

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium">文件夹处理方式</p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            逐个文件夹选择「创建为标签」或「标签成组」；成组的文件夹自身不生成标签，其下标签归入同名分组（分组仅一层，不可嵌套）
          </p>
        </div>
        {groupPaths.size > 0 ? (
          <Button size="sm" variant="ghost" onPress={() => onChange(new Set())} isDisabled={disabled}>
            重置
          </Button>
        ) : null}
      </div>

      {disabled ? (
        <p className="rounded bg-[var(--warning)]/15 px-2 py-1 text-xs text-[var(--warning)]">
          当前选择「不生成标签」，文件夹配置不会生效
        </p>
      ) : null}

      <div className="max-h-56 overflow-y-auto pr-1">{topNodes.map((node) => renderNode(node, 0))}</div>
    </div>
  )
}
