import { useCallback, useEffect, useRef, useState } from 'react'
import { send, type BrowserFolderInfo } from '../shared/messages'
import type { BrowserFolder, BrowserFolderMode } from '../shared/types'
import { SearchSelect, type SearchSelectOption } from './SearchSelect'

const EMPTY: BrowserFolderInfo = { folders: [], auto: null }

/** 「自动」选项在 Select 里的 key（真实文件夹 id 由 Chrome 生成，不会冲突） */
const AUTO_KEY = '__auto__'

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
 * 本机书签往往有几十上百个文件夹，所以用可搜索下拉：按文件夹名或完整路径过滤，
 * 选中后输入框里回填完整路径，避免同名文件夹分不清。
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

  const options: SearchSelectOption[] = [
    { id: AUTO_KEY, label: autoLabel },
    ...folders.map((folder) => ({
      id: folder.id,
      label: folder.name,
      // 按完整路径搜索，同名文件夹可以靠父级路径区分
      textValue: folder.path,
      indent: folder.depth * 12,
    })),
  ]

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
