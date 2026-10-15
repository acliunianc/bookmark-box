import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { BookmarkIndex } from '../core/search'
import { send, type BootstrapData } from '../shared/messages'
import { DEFAULT_SETTINGS } from '../shared/constants'
import type { Bookmark, Settings, Tag, TagGroup, TreeSnapshot } from '../shared/types'

interface StoreValue {
  loading: boolean
  error: string | null
  bookmarks: Bookmark[]
  trashed: Bookmark[]
  tags: Tag[]
  groups: TagGroup[]
  tree: TreeSnapshot | null
  settings: Settings
  tagById: Map<string, Tag>
  groupById: Map<string, TagGroup>
  index: BookmarkIndex
  refresh: () => Promise<void>
  applyBookmarks: (list: Bookmark[]) => void
  applyTags: (list: Tag[]) => void
  applyGroups: (list: TagGroup[]) => void
  applyTree: (tree: TreeSnapshot | null) => void
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  setTrashed: (list: Bookmark[]) => void
}

const StoreContext = createContext<StoreValue | null>(null)

export function useStore(): StoreValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore 必须在 StoreProvider 内使用')
  return value
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<BootstrapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const next = await send('data/bootstrap', {})
      setData(next)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const applyBookmarks = useCallback((list: Bookmark[]) => {
    setData((prev) => {
      if (!prev) return prev
      const map = new Map(prev.bookmarks.map((item) => [item.id, item]))
      const trashedMap = new Map(prev.trashed.map((item) => [item.id, item]))
      for (const bookmark of list) {
        if (bookmark.deletedAt) {
          map.delete(bookmark.id)
          trashedMap.set(bookmark.id, bookmark)
        } else {
          trashedMap.delete(bookmark.id)
          map.set(bookmark.id, bookmark)
        }
      }
      return { ...prev, bookmarks: [...map.values()], trashed: [...trashedMap.values()] }
    })
  }, [])

  const applyTags = useCallback((list: Tag[]) => {
    setData((prev) => (prev ? { ...prev, tags: list } : prev))
  }, [])

  const applyGroups = useCallback((list: TagGroup[]) => {
    setData((prev) => (prev ? { ...prev, groups: list } : prev))
  }, [])

  const applyTree = useCallback((tree: TreeSnapshot | null) => {
    setData((prev) => (prev ? { ...prev, tree } : prev))
  }, [])

  const setTrashed = useCallback((list: Bookmark[]) => {
    setData((prev) => (prev ? { ...prev, trashed: list } : prev))
  }, [])

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const result = await send('settings/update', patch)
    setData((prev) => (prev ? { ...prev, settings: result.settings } : prev))
  }, [])

  const value = useMemo<StoreValue>(() => {
    const bookmarks = data?.bookmarks ?? []
    const tags = data?.tags ?? []
    const groups = data?.groups ?? []
    const tagById = new Map(tags.map((tag) => [tag.id, tag]))
    return {
      loading,
      error,
      bookmarks,
      trashed: data?.trashed ?? [],
      tags,
      groups,
      tree: data?.tree ?? null,
      settings: data?.settings ?? { ...DEFAULT_SETTINGS },
      tagById,
      groupById: new Map(groups.map((group) => [group.id, group])),
      index: new BookmarkIndex(bookmarks, new Map(tags.map((tag) => [tag.id, tag.name]))),
      refresh,
      applyBookmarks,
      applyTags,
      applyGroups,
      applyTree,
      updateSettings,
      setTrashed,
    }
  }, [
    data,
    loading,
    error,
    refresh,
    applyBookmarks,
    applyTags,
    applyGroups,
    applyTree,
    updateSettings,
    setTrashed,
  ])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
