import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '../shared/constants'
import type { Bookmark, Settings, SnapshotRecord, Tag, TagGroup, TreeSnapshot } from '../shared/types'

interface SettingsRecord extends Settings {
  key: string
}

interface TagMarkDB extends DBSchema {
  bookmarks: {
    key: string
    value: Bookmark
    indexes: {
      'by-normUrl': string
      'by-createdAt': number
      'by-lastOpenedAt': number
      'by-deletedAt': number
    }
  }
  tags: {
    key: string
    value: Tag
    indexes: { 'by-lastUsedAt': number }
  }
  groups: {
    key: string
    value: TagGroup
    indexes: { 'by-order': number }
  }
  tree: {
    key: string
    value: TreeSnapshot
  }
  settings: {
    key: string
    value: SettingsRecord
  }
  snapshots: {
    key: number
    value: SnapshotRecord
    indexes: { 'by-createdAt': number }
  }
}

let dbPromise: Promise<IDBPDatabase<TagMarkDB>> | null = null

export function getDB(): Promise<IDBPDatabase<TagMarkDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TagMarkDB>('tagmark', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const bookmarks = db.createObjectStore('bookmarks', { keyPath: 'id' })
          bookmarks.createIndex('by-normUrl', 'normUrl', { unique: true })
          bookmarks.createIndex('by-createdAt', 'createdAt')
          bookmarks.createIndex('by-lastOpenedAt', 'lastOpenedAt')
          bookmarks.createIndex('by-deletedAt', 'deletedAt')

          const tags = db.createObjectStore('tags', { keyPath: 'id' })
          tags.createIndex('by-lastUsedAt', 'lastUsedAt')

          db.createObjectStore('tree', { keyPath: 'id' })
          db.createObjectStore('settings', { keyPath: 'key' })

          const snapshots = db.createObjectStore('snapshots', { keyPath: 'id', autoIncrement: true })
          snapshots.createIndex('by-createdAt', 'createdAt')
        }

        // v2：标签分组（仅一层）
        if (oldVersion < 2) {
          const groups = db.createObjectStore('groups', { keyPath: 'id' })
          groups.createIndex('by-order', 'order')
        }
      },
    })
  }
  return dbPromise
}

/* ------------------------------ 书签 ------------------------------ */

export async function allBookmarks(includeDeleted = false): Promise<Bookmark[]> {
  const db = await getDB()
  const list = await db.getAll('bookmarks')
  return includeDeleted ? list : list.filter((item) => !item.deletedAt)
}

export async function getBookmarkByNormUrl(normUrl: string): Promise<Bookmark | undefined> {
  const db = await getDB()
  return db.getFromIndex('bookmarks', 'by-normUrl', normUrl)
}

export async function putBookmarks(bookmarks: Bookmark[]): Promise<void> {
  if (bookmarks.length === 0) return
  const db = await getDB()
  const tx = db.transaction('bookmarks', 'readwrite')
  await Promise.all([...bookmarks.map((bookmark) => tx.store.put(bookmark)), tx.done])
}

export async function deleteBookmarkHard(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('bookmarks', id)
}

export async function clearBookmarks(): Promise<void> {
  const db = await getDB()
  await db.clear('bookmarks')
}

/* ------------------------------ 标签 ------------------------------ */

export async function allTags(): Promise<Tag[]> {
  const db = await getDB()
  return db.getAll('tags')
}

/**
 * 整体覆盖标签表。
 * 注意：`put` 只做 upsert，删不掉记录，所以必须先 clear。
 * 传入的必须是「完整标签列表」——合并 / 删除标签就是靠这份列表里少掉的记录生效的。
 */
export async function putTags(tags: Tag[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('tags', 'readwrite')
  await tx.store.clear()
  await Promise.all(tags.map((tag) => tx.store.put(tag)))
  await tx.done
}

export async function deleteTagRecord(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('tags', id)
}

export async function clearTags(): Promise<void> {
  const db = await getDB()
  await db.clear('tags')
}

/* ------------------------------ 标签分组 ------------------------------ */

export async function allGroups(): Promise<TagGroup[]> {
  const db = await getDB()
  const list = await db.getAll('groups')
  return list.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
}

/**
 * 整体覆盖标签分组表。
 * 同上：必须先 clear，否则删除分组时记录仍留在库里，
 * 下一次 `allGroups()` 会把它读回来，前端就会「删了还在」。
 */
export async function putGroups(groups: TagGroup[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('groups', 'readwrite')
  await tx.store.clear()
  await Promise.all(groups.map((group) => tx.store.put(group)))
  await tx.done
}

export async function deleteGroupRecord(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('groups', id)
}

export async function clearGroups(): Promise<void> {
  const db = await getDB()
  await db.clear('groups')
}

/* ------------------------------ 文件树 ------------------------------ */

export async function getTreeSnapshot(): Promise<TreeSnapshot | undefined> {
  const db = await getDB()
  return db.get('tree', 'current')
}

export async function putTreeSnapshot(snapshot: TreeSnapshot): Promise<void> {
  const db = await getDB()
  await db.put('tree', snapshot)
}

export async function clearTree(): Promise<void> {
  const db = await getDB()
  await db.delete('tree', 'current')
}

/* ------------------------------ 设置 ------------------------------ */

function stripKey(record: SettingsRecord): Settings {
  const copy: Partial<SettingsRecord> = { ...record }
  delete copy.key
  return { ...DEFAULT_SETTINGS, ...copy }
}

export async function getSettings(): Promise<Settings> {
  const db = await getDB()
  const record = await db.get('settings', SETTINGS_KEY)
  if (!record) return { ...DEFAULT_SETTINGS }
  return stripKey(record)
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const db = await getDB()
  const current = await getSettings()
  const next: SettingsRecord = { key: SETTINGS_KEY, ...current, ...patch }
  await db.put('settings', next)
  return stripKey(next)
}

/* ------------------------------ 快照 / 撤销 ------------------------------ */

export async function addSnapshot(
  snapshot: Omit<SnapshotRecord, 'id' | 'createdAt'> & { createdAt?: number },
): Promise<number> {
  const db = await getDB()
  return db.add('snapshots', { ...snapshot, createdAt: snapshot.createdAt ?? Date.now() } as SnapshotRecord)
}

export async function listSnapshots(kind?: SnapshotRecord['kind']): Promise<SnapshotRecord[]> {
  const db = await getDB()
  const list = await db.getAll('snapshots')
  const filtered = kind ? list.filter((item) => item.kind === kind) : list
  return filtered.sort((a, b) => b.createdAt - a.createdAt)
}

export async function latestSnapshot(kind: SnapshotRecord['kind']): Promise<SnapshotRecord | undefined> {
  const list = await listSnapshots(kind)
  return list[0]
}

export async function deleteSnapshot(id: number): Promise<void> {
  const db = await getDB()
  await db.delete('snapshots', id)
}

export async function trimSnapshots(kind: SnapshotRecord['kind'], keep: number): Promise<void> {
  const list = await listSnapshots(kind)
  const stale = list.slice(keep)
  if (stale.length === 0) return
  const db = await getDB()
  const tx = db.transaction('snapshots', 'readwrite')
  await Promise.all([...stale.map((item) => tx.store.delete(item.id as number)), tx.done])
}

/* ------------------------------ 全库操作 ------------------------------ */

export async function replaceAll(data: {
  bookmarks: Bookmark[]
  tags: Tag[]
  groups?: TagGroup[]
  tree?: TreeSnapshot
  settings?: Settings
}): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['bookmarks', 'tags', 'groups', 'tree', 'settings'], 'readwrite')
  await Promise.all([
    tx.objectStore('bookmarks').clear(),
    tx.objectStore('tags').clear(),
    tx.objectStore('groups').clear(),
  ])
  for (const bookmark of data.bookmarks) await tx.objectStore('bookmarks').put(bookmark)
  for (const tag of data.tags) await tx.objectStore('tags').put(tag)
  for (const group of data.groups ?? []) await tx.objectStore('groups').put(group)
  if (data.tree) await tx.objectStore('tree').put(data.tree)
  else await tx.objectStore('tree').delete('current')
  if (data.settings) await tx.objectStore('settings').put({ key: SETTINGS_KEY, ...data.settings })
  await tx.done
}
