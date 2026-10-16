import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { send, type BrowserFolderInfo } from '../shared/messages'
import type { BrowserFolder, BrowserFolderMode } from '../shared/types'
import { SearchSelect, type SearchSelectOption } from './SearchSelect'

const EMPTY: BrowserFolderInfo = { folders: [], auto: null }

/** 「自动」选项在 Select 里的 key（真实文件夹 id 由 Chrome 生成，不会冲突） */
const AUTO_KEY = '__auto__'

/** 去掉路径末尾的文件夹名，剩下的父级用空格隔开；顶层文件夹没有父级 */
function parentPathLabel(path: string, name: string) {
  const suffix = `/${name}`
  if (!path.endsWith(suffix)) return undefined
  return path.slice(0, -suffix.length).replaceAll('/', ' / ')
}

/** 懒加载浏览器书签的文件夹树（只在需要选落点时才请求） */
export function useBrowserFolders(enabled: boolean) {
  const [info, setInfo] = useState<BrowserFolderInfo>(EMPTY)
  const [loading, setLoading] = useState(false)
  const loadedRef = useRef(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setInfo(await send('browser/folders', {}))
    } catch {
      setInfo(EMPTY)
    } finally {
      loadedRef.current = true
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled || loadedRef.current) return
    void reload()
  }, [enabled, reload])

  return { folders: info.folders, auto: info.auto, loading, reload }
}

interface BrowserPlacementSelectProps {
  folders: BrowserFolder[]
  /** 自动模式实际会落到哪个顶层文件夹（用于文案展示） */
  auto: { id: string; path: string } | null
  mode: BrowserFolderMode
  /** 手动模式的目标文件夹 id */
  folderId: string
  onChange: (next: { mode: BrowserFolderMode; folderId: string }) => void
  className?: string
  ariaLabel?: string
  isDisabled?: boolean
}

/**
 * 浏览器书签落点选择：第一项是「自动（最顶层）」，其余是本机浏览器书签里的文件夹。
 * 选中文件夹即视为手动模式。
 *
 * 本机书签往往有几十上百个文件夹，所以用可搜索下拉：按文件夹名或完整路径过滤。
 * 列表里文件夹名单独一行，父级路径用浅色写在下面；收起后按钮上仍显示完整路径。
 */
export function BrowserPlacementSelect({
  folders,
  auto,
  mode,
  folderId,
  onChange,
  className,
  ariaLabel = '浏览器书签放置位置',
  isDisabled,
}: BrowserPlacementSelectProps) {
  const autoLabel = auto ? `自动 · 最顶层（${auto.path}）` : '自动 · 最顶层'
  const selectedKey = mode === 'auto' ? AUTO_KEY : folderId || null

  const options = useMemo<SearchSelectOption[]>(
    () => [
      { id: AUTO_KEY, label: autoLabel, icon: 'folder' },
      ...folders.map((folder) => ({
        id: folder.id,
        label: folder.name,
        // 按完整路径搜索，同名文件夹可以靠父级路径区分
        textValue: folder.path,
        description: parentPathLabel(folder.path, folder.name),
        icon: 'folder' as const,
      })),
    ],
    [autoLabel, folders],
  )

  return (
    <SearchSelect
      className={className}
      aria-label={ariaLabel}
      value={selectedKey}
      onChange={(id) => {
        if (id === AUTO_KEY) onChange({ mode: 'auto', folderId: '' })
        else onChange({ mode: 'manual', folderId: id })
      }}
      options={options}
      placeholder="搜索文件夹，或选择自动"
      isDisabled={isDisabled}
    />
  )
}
