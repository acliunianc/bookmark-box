import { useEffect, useMemo, useState } from 'react'
import { Button } from '@heroui/react'
import { selectBookmarksForNode } from '../../../core/batchTag'
import type { Bookmark, FolderNode, Tag } from '../../../shared/types'
import { Dialog } from '../../../ui/Dialog'
import { RadioCardGroup } from '../../../ui/RadioCardGroup'
import { TagPicker } from '../../../ui/TagPicker'

interface BatchTagDialogProps {
  open: boolean
  node: FolderNode | null
  allBookmarks: Bookmark[]
  tags: Tag[]
  pending?: boolean
  onClose: () => void
  onCreateTag: (name: string) => Promise<string | null>
  onApply: (payload: {
    path: string
    includeChildren: boolean
    tagIds: string[]
    mode: 'append' | 'replace'
  }) => void
}

export function BatchTagDialog({
  open,
  node,
  allBookmarks,
  tags,
  pending,
  onClose,
  onCreateTag,
  onApply,
}: BatchTagDialogProps) {
  const [includeChildren, setIncludeChildren] = useState(true)
  const [mode, setMode] = useState<'append' | 'replace'>('append')
  const [tagIds, setTagIds] = useState<string[]>([])

  useEffect(() => {
    if (open) {
      setIncludeChildren(true)
      setMode('append')
      setTagIds([])
    }
  }, [open, node?.id])

  const matched = useMemo(
    () => (node ? selectBookmarksForNode(allBookmarks, node.path, includeChildren) : []),
    [node, allBookmarks, includeChildren],
  )

  const untagged = matched.filter((bookmark) => bookmark.tagIds.length === 0).length

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={node ? `为「${node.path.split('/').join(' / ')}」下的书签打标签` : '批量打标签'}
      description="文件树只读，批量打标签是把文件夹结构转成标签的主要方式"
      width={540}
      footer={
        <>
          <Button variant="ghost" onPress={onClose} isDisabled={pending}>
            取消
          </Button>
          <Button
            variant="primary"
            isDisabled={pending || matched.length === 0 || tagIds.length === 0}
            onPress={() => {
              if (!node) return
              onApply({ path: node.path, includeChildren, tagIds, mode })
            }}
          >
            应用到 {matched.length} 条
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <RadioCardGroup
          aria-label="范围"
          label="范围"
          layout="row"
          value={includeChildren ? 'children' : 'self'}
          onChange={(value) => setIncludeChildren(value === 'children')}
          options={[
            { value: 'self', label: '仅当前文件夹' },
            { value: 'children', label: '含子文件夹' },
          ]}
        />

        <div className="rounded-[var(--radius)] bg-[var(--surface-secondary)] px-3 py-2 text-xs">
          <p>
            预览：共命中 <strong>{matched.length}</strong> 条书签，其中{' '}
            <strong>{untagged}</strong> 条当前没有任何标签
          </p>
          <p className="mt-1 text-[var(--muted)]">
            {matched.length === 0
              ? '该范围内没有书签，请检查是否已导入文件树'
              : '文件树中的书签已在书签池中，应用后直接写入标签'}
          </p>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-[var(--muted)]">标签</p>
          <TagPicker
            tags={tags}
            selectedIds={tagIds}
            onChange={setTagIds}
            onCreate={onCreateTag}
          />
        </div>

        <RadioCardGroup
          aria-label="应用方式"
          label="方式"
          layout="row"
          value={mode}
          onChange={(value) => setMode(value as 'append' | 'replace')}
          options={[
            { value: 'append', label: '追加到已有标签' },
            { value: 'replace', label: '替换全部标签' },
          ]}
        />
      </div>
    </Dialog>
  )
}
