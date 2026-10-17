/**
 * 预览页专用的 chrome.* 桩：让 popup / manage 页面能在普通网页里跑起来。
 * 只在 preview 目录使用，不参与扩展构建。
 */
import './chrome-stub'

const TAGS = [
  { id: 'java', name: 'java', color: '#f97316', useCount: 34, lastUsedAt: 9, pinned: false, groupId: 'g-开发' },
  { id: 'php', name: 'php', color: '#8b5cf6', useCount: 12, lastUsedAt: 8, pinned: false, groupId: 'g-开发' },
  { id: '前端', name: '前端', color: '#06b6d4', useCount: 86, lastUsedAt: 7, pinned: true, groupId: 'g-开发' },
  { id: 'react', name: 'react', color: '#0ea5e9', useCount: 41, lastUsedAt: 6, pinned: false, groupId: 'g-开发' },
  { id: '配色', name: '配色', color: '#f43f5e', useCount: 5, lastUsedAt: 5, pinned: false, groupId: 'g-设计' },
  { id: '待读', name: '待读', color: '#14b8a6', useCount: 88, lastUsedAt: 2, pinned: false },
]

const chromeLike = (globalThis as unknown as { chrome: Record<string, unknown> }).chrome

chromeLike.tabs = {
  query: async () => [{ url: 'https://spring.io/projects/spring-boot', title: 'Spring Boot 官方文档 - 快速开始' }],
  create: async () => undefined,
}

chromeLike.runtime = {
  ...(chromeLike.runtime as Record<string, unknown>),
  id: 'bookmarkbox-preview',
  getURL: (path: string) => `/${path}`,
  sendMessage: async (message: { type: string; payload: unknown }) => {
    if (message.type === 'page/context') {
      return {
        ok: true,
        data: {
          url: 'https://spring.io/projects/spring-boot',
          title: 'Spring Boot 官方文档 - 快速开始',
          bookmark: undefined,
          tags: TAGS,
          settings: {
            removeTrackingParams: true,
            ignoreFragment: true,
            takeoverNewTab: false,
            theme: 'light',
            lastTagIds: ['java', 'react'],
            lastTagUsedAt: 0,
            syncToBrowser: true,
            browserFolderMode: 'auto',
            browserFolderId: '',
          },
          frequentTagIds: ['java', '前端', '待读'],
          lastTagIds: ['java', 'react'],
          folderPath: '书签栏/开发工具/前端',
          folderModes: {},
          folderAutoTag: true,
        },
      }
    }
    if (message.type === 'bookmark/summaries') {
      return {
        ok: true,
        data: {
          bookmarks: [
            {
              id: 'b1',
              title: 'Spring Boot 官方文档',
              url: 'https://spring.io/projects/spring-boot',
              tagIds: ['java', '前端'],
            },
            {
              id: 'b2',
              title: 'MDN Web Docs',
              url: 'https://developer.mozilla.org',
              tagIds: ['待读'],
            },
          ],
        },
      }
    }
    if (message.type === 'tag/fromFolder') {
      const path = (message.payload as { path?: string }).path ?? ''
      const names = path.split('/').filter(Boolean)
      const extra = names
        .filter((name) => !TAGS.some((tag) => tag.name === name))
        .map((name) => ({
          id: name,
          name,
          color: '#eab308',
          useCount: 0,
          lastUsedAt: 0,
          pinned: false,
        }))
      const tags = [...TAGS, ...extra]
      return {
        ok: true,
        data: {
          tagIds: names,
          tags,
        },
      }
    }
    if (message.type === 'tag/create') {
      const name = (message.payload as { name: string }).name
      const created = { id: name, name, color: '#f97316', useCount: 0, lastUsedAt: 0, pinned: false }
      TAGS.push(created)
      return { ok: true, data: { tags: [...TAGS] } }
    }
    if (message.type === 'bookmark/save')
      return {
        ok: true,
        data: {
          bookmark: null,
          created: true,
          tags: TAGS,
          browserSync: { id: '42', action: 'created', folderPath: '书签栏' },
          browserSyncError: undefined,
        },
      }
    if (message.type === 'browser/folders') {
      return {
        ok: true,
        data: {
          folders: [
            { id: '1', name: '书签栏', path: '书签栏', depth: 0, children: [] },
            { id: '2', name: '其他书签', path: '其他书签', depth: 0, children: [] },
            { id: '11', name: '开发工具', path: '书签栏/开发工具', depth: 1, children: [] },
            { id: '12', name: '前端', path: '书签栏/开发工具/前端', depth: 2, children: [] },
          ],
          auto: { id: '1', path: '书签栏' },
        },
      }
    }
    return { ok: true, data: {} }
  },
}
