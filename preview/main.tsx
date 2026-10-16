import './chrome-stub'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from '@heroui/react'
import { BookmarkList } from '../src/manage/components/BookmarkList'
import { TagPanel } from '../src/manage/components/TagPanel'
import { Toolbar } from '../src/manage/components/Toolbar'
import { TagDetailDialog } from '../src/manage/components/TagDetailDialogs'
import { TagEditDialog } from '../src/manage/components/dialogs/TagEditDialog'
import type { Bookmark, Tag, TagGroup } from '../src/shared/types'
import '../src/styles/global.css'

/** 仅用于本地肉眼验收的临时预览页：不参与扩展构建 */
const groups: TagGroup[] = [
  { id: 'g-开发', name: '开发', color: '#3b82f6', order: 1, createdAt: 1 },
  { id: 'g-设计', name: '设计', color: '#ec4899', order: 2, createdAt: 2 },
]

const tags: Tag[] = [
  { id: 'java', name: 'java', color: '#f97316', useCount: 34, lastUsedAt: 9, pinned: false, groupId: 'g-开发' },
  { id: 'php', name: 'php', color: '#8b5cf6', useCount: 12, lastUsedAt: 8, pinned: false, groupId: 'g-开发' },
  { id: '前端', name: '前端', color: '#06b6d4', useCount: 86, lastUsedAt: 7, pinned: true, groupId: 'g-开发' },
  { id: 'react', name: 'react', color: '#0ea5e9', useCount: 41, lastUsedAt: 6, pinned: false, groupId: 'g-开发' },
  { id: '配色', name: '配色', color: '#f43f5e', useCount: 5, lastUsedAt: 5, pinned: false, groupId: 'g-设计' },
  { id: '图标库', name: '图标库', color: '#22c55e', useCount: 7, lastUsedAt: 4, pinned: false, groupId: 'g-设计' },
  { id: '工具', name: '工具', color: '#eab308', useCount: 173, lastUsedAt: 3, pinned: false },
  { id: '待读', name: '待读', color: '#14b8a6', useCount: 88, lastUsedAt: 2, pinned: false },
  { id: '稍后处理', name: '稍后处理', color: '#a855f7', useCount: 2, lastUsedAt: 1, pinned: false },
]

const makeBookmark = (id: number, title: string, url: string, tagIds: string[]): Bookmark => ({
  id: `b${id}`,
  url,
  normUrl: url,
  title,
  tagIds,
  createdAt: Date.now() - id * 86400000,
  lastOpenedAt: Date.now() - id * 3600000,
  openCount: id,
  importPaths: [],
  source: 'browser',
})

const bookmarks: Bookmark[] = [
  makeBookmark(1, 'Spring Boot 官方文档 - 快速开始你的第一个企业级应用', 'https://spring.io/projects/spring-boot', [
    'java',
    '前端',
    '工具',
    '待读',
    '稍后处理',
    'react',
  ]),
  makeBookmark(2, 'PHP: The Right Way', 'https://phptherightway.com', ['php', '待读']),
  makeBookmark(3, 'Tailwind CSS v4 主题变量与 OKLCH 配色实践', 'https://tailwindcss.com/docs/colors', [
    '前端',
    '配色',
    '图标库',
    '工具',
    'react',
    '待读',
    'java',
    'php',
  ]),
  makeBookmark(4, 'HeroUI 组件库', 'https://heroui.com', ['前端', 'react']),
  makeBookmark(5, 'MDN Web Docs', 'https://developer.mozilla.org', []),
]

const tagById = new Map(tags.map((tag) => [tag.id, tag]))
const counts = new Map(tags.map((tag) => [tag.id, tag.useCount]))

/** 造一批数据，用来验证变高虚拟滚动 */
function makeBulk(count: number): Bookmark[] {
  const words = ['Spring', 'Rust', 'Docker', 'Kubernetes', 'Vite', 'React', 'Tailwind', 'Grafana']
  return Array.from({ length: count }, (_, index) => {
    const shuffled = [...tags].sort(() => Math.random() - 0.5).slice(0, index % 9)
    return makeBookmark(
      1000 + index,
      `${words[index % words.length]} 参考文档 #${index} - 一条长度不等的标题用于测试换行`,
      `https://example.com/doc/${index}`,
      shuffled.map((tag) => tag.id),
    )
  })
}

function Preview() {
  const [scope, setScope] = useState<'all' | 'recent' | 'untagged'>('all')
  const [selected, setSelected] = useState<string[]>(['java'])
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [bulk, setBulk] = useState<Bookmark[]>([])
  const [editTag, setEditTag] = useState<Tag | null>(null)
  const [tagEditOpen, setTagEditOpen] = useState(false)
  const items = bulk.length > 0 ? bulk : bookmarks

  return (
    <div className="flex h-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      <div className="flex items-center gap-3 border-b border-[var(--separator)] p-3">
        <strong className="text-sm">BookmarkBox 预览</strong>
        <Button size="sm" variant="secondary" onPress={() => setView(view === 'list' ? 'grid' : 'list')}>
          切换视图：{view}
        </Button>
        <Button size="sm" variant="secondary" onPress={() => setBulk(bulk.length > 0 ? [] : makeBulk(500))}>
          {bulk.length > 0 ? '回到 5 条示例' : '生成 500 条压测数据'}
        </Button>
        <Button size="sm" variant="secondary" onPress={() => setEditTag(tags[0])}>
          标签详情弹窗
        </Button>
        <Button size="sm" variant="secondary" onPress={() => setTagEditOpen(true)}>
          编辑标签弹窗
        </Button>
        <span className="text-xs text-[var(--muted)]">分组详情：点侧栏分组 ⋯</span>
        <span className="text-xs text-[var(--muted)]">当前 {items.length} 条</span>
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[350px] shrink-0 flex-col border-r border-[var(--separator)]">
          <TagPanel
            tags={tags}
            groups={groups}
            counts={counts}
            totalCount={1284}
            recentCount={63}
            untaggedCount={356}
            scope={scope}
            selectedTagIds={selected}
            onSelectScope={setScope}
            onToggleTag={(id, additive) =>
              setSelected((prev) =>
                additive ? (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]) : [id],
              )
            }
            onNewTag={() => undefined}
            onNewGroup={() => undefined}
            onEditTag={(id) => setEditTag(tags.find((tag) => tag.id === id) ?? null)}
            onGroupRename={async () => undefined}
            onGroupColor={async () => undefined}
            onGroupMove={async () => undefined}
            onGroupDelete={async () => undefined}
            onPin={() => undefined}
            onReorderPinned={() => undefined}
            onDropBookmarks={() => undefined}
            onMoveTagToGroup={() => undefined}
          />
        </aside>
        <main className="relative flex min-w-0 flex-1 flex-col">
          <Toolbar
            tagChips={tags.filter((tag) => selected.includes(tag.id))}
            activeTagCount={selected.length}
            onRemoveTag={(id) => setSelected((prev) => prev.filter((item) => item !== id))}
            logic="AND"
            onLogicChange={() => undefined}
            sort="lastOpened"
            onSortChange={() => undefined}
            view={view}
            onViewChange={setView}
            multiSelect={false}
            onToggleMultiSelect={() => undefined}
            treePath="书签栏/开发工具"
            onClearTreePath={() => undefined}
            query=""
            onClearQuery={() => undefined}
            matchedCount={items.length}
            totalCount={1284}
          />
          <BookmarkList
            items={items}
            tagById={tagById}
            keywords={[]}
            selectedIds={new Set()}
            multiSelect
            view={view}
            activeIndex={0}
            onToggleSelect={() => undefined}
            onOpen={() => undefined}
            onOpenBackground={() => undefined}
            onFilterByTag={() => undefined}
            onEditTags={() => undefined}
            onDelete={() => undefined}
          />
        </main>
      </div>

      <TagDetailDialog
        open={Boolean(editTag)}
        tag={editTag}
        tags={tags}
        groups={groups}
        affectedCount={editTag?.useCount ?? 0}
        onClose={() => setEditTag(null)}
        onRename={async () => undefined}
        onColor={async () => undefined}
        onSetGroup={async () => undefined}
        onMerge={async () => undefined}
        onDelete={async () => undefined}
      />

      <TagEditDialog
        open={tagEditOpen}
        title="批量编辑标签"
        description={`目标 ${bookmarks.length} 条书签`}
        targets={bookmarks}
        tags={tags}
        onClose={() => setTagEditOpen(false)}
        onCreateTag={async () => null}
        onApply={() => setTagEditOpen(false)}
      />
    </div>
  )
}

createRoot(document.getElementById('preview-root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
)
