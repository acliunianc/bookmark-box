import { useEffect, useMemo, useState } from 'react'
import { Button, Dropdown } from '@heroui/react'
import type { FolderMode, FolderNode } from '../../shared/types'
import {
  folderModeOf,
  folderModeSupported,
  hasGroupingAncestor,
  type FolderModeMap,
} from '../../core/parseTree'
import { cn } from '../../ui/cn'
import { IconChevron, IconEllipsis, IconFolder } from '../../ui/icons'

interface ImportFolderPlanProps {
  /** 解析结果的根节点（合成根），只渲染它的 children */
  root: FolderNode
  /** 逐文件夹的处理方式，只含被显式改过的路径 */
  folderModes: FolderModeMap
  onChange: (next: Record<string, FolderMode>) => void
}

interface ModeOption {
  id: FolderMode
  label: string
  hint: string
}

const MODE_OPTIONS: ModeOption[] = [
  { id: 'tag', label: '标签', hint: '这一层生成同名标签' },
  { id: 'group', label: '分组', hint: '不生成标签，其下标签归入同名分组' },
  { id: 'both', label: '成组+标签', hint: '生成同名标签，并和其下标签一起归入同名分组' },
  { id: 'none', label: '不处理', hint: '忽略这一层的名字' },
]

/** 批量套用到某个文件夹下的所有子文件夹 */
const BATCH_ITEMS: { id: FolderMode; label: string; hint: string }[] = [
  { id: 'tag', label: '子文件夹全部设为标签', hint: '每个子文件夹都生成同名标签' },
  { id: 'group', label: '子文件夹全部设为分组', hint: '不能成组的保持原样' },
  { id: 'both', label: '子文件夹全部设为成组+标签', hint: '不能成组的保持原样' },
  { id: 'none', label: '子文件夹全部不处理', hint: '子文件夹的名字都被忽略' },
]

/** 收集某个节点下的所有后代（不含自身） */
function collectDescendants(node: FolderNode, out: FolderNode[] = []): FolderNode[] {
  for (const child of node.children) {
    out.push(child)
    collectDescendants(child, out)
  }
  return out
}

function optionOf(mode: FolderMode): ModeOption {
  return MODE_OPTIONS.find((item) => item.id === mode) ?? MODE_OPTIONS[0]
}

/** 不可用时换成原因，可用时用默认说明 */
function optionHint(node: FolderNode, mode: FolderMode, folderModes: FolderModeMap): string {
  const blockedByAncestor = hasGroupingAncestor(node.path, folderModes)
  if (folderModeSupported(node, mode, blockedByAncestor)) return optionOf(mode).hint
  if (node.children.length === 0) return '下面没有子文件夹，无法成组'
  return '祖先已经成组，分组不能嵌套'
}

/**
 * 导入预览里的「文件夹 → 标签 / 分组」配置树。
 *
 * 路径上每一层文件夹都会按这里的设置生成标签：
 * - 标签（默认）：该文件夹名生成一个同名标签
 * - 分组：自身不生成标签，其下生成的标签归入同名分组
 * - 成组+标签：既生成同名标签，又把该标签和其下标签归入同名分组
 *   （文件夹里既有子文件夹、又有直接放着的链接时用它）
 * - 不处理：这一层文件夹名直接忽略
 *
 * 分组只有一层，祖先已成组时后代不能再成组；下面没有子文件夹时也不能成组。
 * 每行的「⋮」可以把某个方式批量套用到子文件夹，不支持的保持原样。
 */
export function ImportFolderPlan({ root, folderModes, onChange }: ImportFolderPlanProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const topNodes = useMemo(() => root.children, [root])

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

  /** 只把非默认（tag）的方式写进结果，避免键无限膨胀 */
  const withMode = (next: Record<string, FolderMode>, path: string, mode: FolderMode) => {
    if (mode === 'tag') delete next[path]
    else next[path] = mode
    return next
  }

  /**
   * 清理失效的成组：祖先已成组后，后代即使还留着 group / both 也不再生效，
   * 直接删掉，避免树里显示成「分组」但实际按标签处理。
   */
  const dropNestedGroups = (next: Record<string, FolderMode>) => {
    for (const [path, mode] of Object.entries(next)) {
      if ((mode === 'group' || mode === 'both') && hasGroupingAncestor(path, next)) delete next[path]
    }
    return next
  }

  const setNodeMode = (node: FolderNode, mode: FolderMode) => {
    if (!folderModeSupported(node, mode, hasGroupingAncestor(node.path, folderModes))) return
    onChange(dropNestedGroups(withMode({ ...folderModes }, node.path, mode)))
  }

  /** 批量：把这个方式套用到该文件夹下的所有子文件夹，不支持的保持原样 */
  const applyToDescendants = (node: FolderNode, mode: FolderMode) => {
    const next = { ...folderModes }
    // 按树的先序遍历套用：某个文件夹刚被设成成组后，其下后代就会判定为「不支持」而保持原样
    for (const descendant of collectDescendants(node)) {
      if (!folderModeSupported(descendant, mode, hasGroupingAncestor(descendant.path, next))) continue
      withMode(next, descendant.path, mode)
    }
    onChange(dropNestedGroups(next))
  }

  const renderNode = (node: FolderNode, depth: number) => {
    const hasChildren = node.children.length > 0
    const isOpen = expanded.has(node.path)
    const mode = folderModeOf(folderModes, node.path)
    const current = optionOf(mode)

    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-1.5 rounded-lg py-1 pr-1 hover:bg-[var(--default)]"
          style={{ paddingLeft: depth * 14 + 4 }}
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
              mode === 'none' && 'text-[var(--muted)]',
            )}
            title={`${node.path} · 直属 ${node.directCount} 条 / 共 ${node.totalCount} 条`}
          >
            <IconFolder
              width={14}
              height={14}
              className={cn(
                'shrink-0 text-[var(--warning)]',
                (mode === 'group' || mode === 'both') && 'text-[var(--accent)]',
                mode === 'none' && 'opacity-50',
              )}
            />
            <span className={cn('truncate', mode === 'none' && 'line-through')}>{node.name}</span>
            <span className="shrink-0 text-xs text-[var(--muted)]">{node.totalCount}</span>
          </span>

          <Dropdown>
            <Button
              size="sm"
              variant="secondary"
              aria-label={`${node.name} 的处理方式，当前为${current.label}`}
              className={cn(
                'h-7 min-h-0 shrink-0 gap-1 rounded-full px-2.5 text-xs font-medium',
                mode === 'tag' && 'text-[var(--foreground)]',
                mode === 'group' && 'text-[var(--accent)]',
                mode === 'both' &&
                  'border-[var(--accent)] bg-[color-mix(in_oklch,var(--accent)_18%,var(--surface))] text-[var(--foreground)]',
                mode === 'none' && 'text-[var(--muted)] line-through',
              )}
            >
              {current.label}
              <IconChevron width={12} height={12} className="rotate-90 opacity-60" />
            </Button>
            <Dropdown.Popover>
              <Dropdown.Menu
                aria-label={`${node.name} 的处理方式`}
                selectionMode="single"
                selectedKeys={[mode]}
                onAction={(key) => setNodeMode(node, String(key) as FolderMode)}
              >
                {MODE_OPTIONS.map((item) => {
                  const supported = folderModeSupported(
                    node,
                    item.id,
                    hasGroupingAncestor(node.path, folderModes),
                  )
                  return (
                    <Dropdown.Item
                      key={item.id}
                      id={item.id}
                      textValue={item.label}
                      isDisabled={!supported}
                    >
                      <span className="flex flex-col items-start gap-0.5 py-0.5">
                        <span>{item.label}</span>
                        <span className="text-xs font-normal text-[var(--muted)]">
                          {optionHint(node, item.id, folderModes)}
                        </span>
                      </span>
                    </Dropdown.Item>
                  )
                })}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>

          {hasChildren ? (
            <Dropdown>
              <Button
                size="sm"
                isIconOnly
                variant="ghost"
                aria-label={`批量设置「${node.name}」下的子文件夹`}
                className="size-7 min-h-0 min-w-0 shrink-0 rounded-full p-0 text-[var(--muted)]"
              >
                <IconEllipsis width={13} height={13} />
              </Button>
              <Dropdown.Popover>
                <Dropdown.Menu
                  aria-label={`批量设置「${node.name}」下的子文件夹`}
                  onAction={(key) => applyToDescendants(node, String(key) as FolderMode)}
                >
                  {BATCH_ITEMS.map((item) => (
                    <Dropdown.Item key={item.id} id={item.id} textValue={item.label}>
                      <span className="flex flex-col items-start gap-0.5 py-0.5">
                        <span>{item.label}</span>
                        <span className="text-xs font-normal text-[var(--muted)]">{item.hint}</span>
                      </span>
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          ) : (
            <span className="size-7 shrink-0" />
          )}
        </div>
        {isOpen ? node.children.map((child) => renderNode(child, depth + 1)) : null}
      </div>
    )
  }

  if (topNodes.length === 0) return null

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium">文件夹处理方式</p>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">
            每一层默认生成同名标签。文件夹里既有子文件夹、又有直接放着的链接时，选「成组+标签」，这些链接也会带上这一层的标签，并和子文件夹的标签归到同一组。分组只有一层。
          </p>
        </div>
        {Object.keys(folderModes).length > 0 ? (
          <Button size="sm" variant="ghost" className="shrink-0" onPress={() => onChange({})}>
            重置
          </Button>
        ) : null}
      </div>

      <div className="max-h-64 overflow-y-auto pr-1">{topNodes.map((node) => renderNode(node, 0))}</div>
    </div>
  )
}
