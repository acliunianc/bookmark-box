import { useEffect, useMemo, useState } from 'react'
import { Button, Dropdown, ToggleButton, ToggleButtonGroup, Tooltip } from '@heroui/react'
import type { FolderMode, FolderNode } from '../../shared/types'
import { folderModeOf, type FolderModeMap } from '../../core/parseTree'
import { cn } from '../../ui/cn'
import { IconChevron, IconEllipsis, IconFolder } from '../../ui/icons'

interface ImportFolderPlanProps {
  /** 解析结果的根节点（合成根），只渲染它的 children */
  root: FolderNode
  /** 逐文件夹的处理方式，只含被显式改过的路径 */
  folderModes: FolderModeMap
  onChange: (next: Record<string, FolderMode>) => void
}

/** 判断某个路径下（不含自身）是否已有祖先被设为「成组」 */
function hasGroupAncestor(path: string, folderModes: FolderModeMap): boolean {
  const segments = path.split('/')
  let acc = ''
  for (let index = 0; index < segments.length - 1; index += 1) {
    acc = acc ? `${acc}/${segments[index]}` : segments[index]
    if (folderModeOf(folderModes, acc) === 'group') return true
  }
  return false
}

/** 一个文件夹能否被设为「成组」：下面还得有文件夹，且祖先没有成组过 */
function canGroup(node: FolderNode, folderModes: FolderModeMap): boolean {
  return node.children.length > 0 && !hasGroupAncestor(node.path, folderModes)
}

/** 该文件夹被设为某个方式是否可行（不可行时批量套用会跳过它，保持原样） */
function modeSupported(node: FolderNode, mode: FolderMode, folderModes: FolderModeMap): boolean {
  if (mode === 'group') return canGroup(node, folderModes)
  return true
}

const MODE_LABELS: Record<FolderMode, string> = {
  tag: '创建为标签',
  group: '标签成组',
  none: '不处理',
}

/** 批量套用的三个入口（对某个文件夹下的所有子文件夹生效） */
const BATCH_ITEMS: { id: FolderMode; label: string; hint: string }[] = [
  { id: 'tag', label: `全部${MODE_LABELS.tag}`, hint: '其下每个文件夹都生成同名标签' },
  { id: 'group', label: `全部${MODE_LABELS.group}`, hint: '其下每个文件夹都不生成标签，改成同名分组' },
  { id: 'none', label: `全部${MODE_LABELS.none}`, hint: '其下每个文件夹的名字都被忽略，既不生成标签也不成组' },
]

/** 收集某个节点下的所有后代（不含自身） */
function collectDescendants(node: FolderNode, out: FolderNode[] = []): FolderNode[] {
  for (const child of node.children) {
    out.push(child)
    collectDescendants(child, out)
  }
  return out
}

/**
 * 导入预览里的「文件夹 → 标签 / 分组」配置树。
 *
 * 路径上每一层文件夹都会按这里的设置生成标签，所以「按文件夹路径生成标签」不再需要
 * 单独的全局策略（仅末级 / 含祖先），改用本配置树逐层控制：
 * - 创建为标签（默认）：该文件夹名生成一个同名标签
 * - 标签成组：该文件夹自身不生成标签，其下生成的标签归入同名分组
 * - 不处理：既不生成标签也不成组，这一层文件夹名直接忽略（想去掉祖先层就选它）
 *
 * 两个限制：分组只有一层，祖先已选成组时后代不能再选成组；文件夹下面没有子文件夹时无法成组
 * （成组是把「下面生成的标签」归入分组，没有子文件夹就没有可归入的东西）。
 *
 * 每一行的「⋮」可以把某个方式批量套用到该文件夹下的所有子文件夹，
 * 其中不被支持的子文件夹保持原样（例如没有子文件夹的文件夹不支持成组）。
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
   * 清理失效的「成组」：祖先已改成成组后，后代即使还留着 group 也不再生效，
   * 直接删掉，避免树里显示成「分组」但实际按标签处理、和左边的预览结果对不上。
   */
  const dropNestedGroups = (next: Record<string, FolderMode>) => {
    for (const [path, mode] of Object.entries(next)) {
      if (mode === 'group' && hasGroupAncestor(path, next)) delete next[path]
    }
    return next
  }

  const setNodeMode = (node: FolderNode, mode: FolderMode) => {
    onChange(dropNestedGroups(withMode({ ...folderModes }, node.path, mode)))
  }

  /** 批量：把这个方式套用到该文件夹下的所有子文件夹，不支持的保持原样 */
  const applyToDescendants = (node: FolderNode, mode: FolderMode) => {
    const next = { ...folderModes }
    // 按树的先序遍历套用：某个文件夹刚被设成成组后，其下后代就会判定为「不支持」而保持原样
    for (const descendant of collectDescendants(node)) {
      if (!modeSupported(descendant, mode, next)) continue
      withMode(next, descendant.path, mode)
    }
    onChange(dropNestedGroups(next))
  }

  const renderNode = (node: FolderNode, depth: number) => {
    const hasChildren = node.children.length > 0
    const isOpen = expanded.has(node.path)
    const mode = folderModeOf(folderModes, node.path)
    const groupBlocked = !canGroup(node, folderModes)

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
              mode === 'group' && 'text-[var(--accent)]',
              mode === 'none' && 'text-[var(--muted)]',
            )}
            title={`${node.path} · 直属 ${node.directCount} 条 / 共 ${node.totalCount} 条`}
          >
            <IconFolder
              width={14}
              height={14}
              className={cn(
                'shrink-0',
                mode === 'group' ? 'text-[var(--accent)]' : 'text-[var(--warning)]',
                mode === 'none' && 'opacity-50',
              )}
            />
            <span className={cn('truncate', mode === 'none' && 'line-through')}>{node.name}</span>
            <span className="shrink-0 text-xs text-[var(--muted)]">{node.totalCount}</span>
          </span>

          {hasChildren ? (
            <Dropdown>
              <Tooltip delay={200}>
                <Tooltip.Trigger className="shrink-0">
                  <Button
                    size="sm"
                    isIconOnly
                    variant="ghost"
                    aria-label={`批量设置「${node.name}」下的子文件夹`}
                    className="size-6 min-h-0 min-w-0 rounded p-0 text-[var(--muted)]"
                  >
                    <IconEllipsis width={13} height={13} />
                  </Button>
                </Tooltip.Trigger>
                <Tooltip.Content>批量设置其下所有子文件夹</Tooltip.Content>
              </Tooltip>
              <Dropdown.Popover>
                <Dropdown.Menu
                  aria-label={`批量设置「${node.name}」下的子文件夹`}
                  onAction={(key) => applyToDescendants(node, String(key) as FolderMode)}
                >
                  {BATCH_ITEMS.map((item) => (
                    <Dropdown.Item key={item.id} id={item.id} textValue={item.label}>
                      {item.label}
                      <span className="ml-2 text-xs text-[var(--muted)]">{item.hint}</span>
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          ) : (
            <span className="size-6 shrink-0" />
          )}

          <Tooltip delay={200}>
            <Tooltip.Trigger className="shrink-0">
              <ToggleButtonGroup
                size="sm"
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={[mode]}
                onSelectionChange={(keys) => {
                  const key = [...keys][0]
                  if (key === 'tag' || key === 'group' || key === 'none') setNodeMode(node, key)
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
                <ToggleButton id="none" aria-label={`${node.name} 不处理`}>
                  <ToggleButtonGroup.Separator />
                  不处理
                </ToggleButton>
              </ToggleButtonGroup>
            </Tooltip.Trigger>
            <Tooltip.Content>
              {groupBlocked && !hasChildren
                ? `「${node.name}」下面没有子文件夹，无法成组（成组用于把其下生成的标签归入同名分组），只能创建标签或不处理`
                : groupBlocked
                  ? '祖先文件夹已选为分组，分组不能嵌套'
                  : `「${node.name}」创建为标签 / 成组（自身不生成标签，其下标签归入同名分组）/ 不处理（该层名字直接忽略）`}
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
            每一层文件夹默认都会生成一个同名标签（即「含祖先文件夹名」）；想去掉某一层就选「不处理」，
            想把它作为分组就选「标签成组」。成组要求该文件夹下还有子文件夹，且分组仅一层、不可嵌套；
            每行的 ⋮ 可把同一方式批量套用到其下所有子文件夹（不支持的保持不变）
          </p>
        </div>
        {Object.keys(folderModes).length > 0 ? (
          <Button size="sm" variant="ghost" onPress={() => onChange({})}>
            重置
          </Button>
        ) : null}
      </div>

      <div className="max-h-56 overflow-y-auto pr-1">{topNodes.map((node) => renderNode(node, 0))}</div>
    </div>
  )
}
