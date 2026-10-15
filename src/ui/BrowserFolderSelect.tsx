import { useCallback, useEffect, useRef, useState } from 'react'
import { ListBox, Select } from '@heroui/react'
import { send, type BrowserFolderInfo } from '../shared/messages'
import type { BrowserFolder, BrowserFolderMode } from '../shared/types'

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

  return (
    <Select
      className={className}
      variant="secondary"
      aria-label={ariaLabel}
      placeholder="选择放置位置"
      isDisabled={isDisabled}
      selectedKey={selectedKey}
      onSelectionChange={(key) => {
        const value = key == null ? AUTO_KEY : String(key)
        if (value === AUTO_KEY) onChange({ mode: 'auto', folderId: '' })
        else onChange({ mode: 'manual', folderId: value })
      }}
    >
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <ListBox.Item id={AUTO_KEY} textValue={autoLabel}>
            {autoLabel}
            <ListBox.ItemIndicator />
          </ListBox.Item>
          {folders.map((folder) => (
            <ListBox.Item key={folder.id} id={folder.id} textValue={folder.path}>
              <span
                className="truncate"
                style={{ paddingLeft: folder.depth * 12 }}
                title={folder.path}
              >
                {folder.name}
              </span>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}
