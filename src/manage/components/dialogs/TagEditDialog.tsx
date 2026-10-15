import { useEffect, useMemo, useState } from 'react'
import { Button, Tag, TagGroup } from '@heroui/react'
import type { Key } from 'react'
import type { Bookmark, Tag as TagItem } from '../../../shared/types'
import { Dialog } from '../../../ui/Dialog'
import { RadioCardGroup } from '../../../ui/RadioCardGroup'
import { TagPicker } from '../../../ui/TagPicker'

interface TagEditDialogProps {
  open: boolean
  title: string
  description?: string
  targets: Bookmark[]
  tags: TagItem[]
  pending?: boolean
  /** remove：从「移除标签」入口进入时，默认勾选已有标签待移除 */
  intent?: 'add' | 'remove'
  onClose: () => void
  onCreateTag: (name: string) => Promise<string | null>
  onApply: (payload: {
    tagIds: string[]
    removeTagIds: string[]
    mode: 'append' | 'replace'
  }) => void
}

export function TagEditDialog({
  open,
  title,
  description,
  targets,
  tags,
  pending,
  intent = 'add',
  onClose,
  onCreateTag,
  onApply,
}: TagEditDialogProps) {
  const [addIds, setAddIds] = useState<string[]>([])
  const [removeIds, setRemoveIds] = useState<string[]>([])
  const [mode, setMode] = useState<'append' | 'replace'>('append')

  const tagById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags])

  /** 目标书签上已存在的标签（并集） */
  const existingIds = useMemo(() => {
    const set = new Set<string>()
    targets.forEach((bookmark) => bookmark.tagIds.forEach((id) => set.add(id)))
    return [...set]
  }, [targets])

  useEffect(() => {
    if (!open) return
    setAddIds([])
    setRemoveIds(intent === 'remove' ? existingIds : [])
    setMode(intent === 'remove' ? 'replace' : 'append')
  }, [open, intent, existingIds])

  const toggleRemove = (id: string) => {
    setRemoveIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
    setAddIds((prev) => prev.filter((item) => item !== id))
  }

  const removeKeys = (keys: Set<Key>) => {
    for (const key of keys) toggleRemove(String(key))
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      width={540}
      footer={
        <>
          <Button variant="ghost" onPress={onClose} isDisabled={pending}>
            取消
          </Button>
          <Button
            variant="primary"
            isDisabled={pending || (addIds.length === 0 && removeIds.length === 0)}
            onPress={() => onApply({ tagIds: addIds, removeTagIds: removeIds, mode })}
          >
            应用到 {targets.length} 条
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {existingIds.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs font-medium text-[var(--muted)]">
              已有标签（{intent === 'remove' ? '默认选中，点 × 取消' : '点 × 标记为移除'}）
            </p>
            <TagGroup aria-label="已有标签" onRemove={removeKeys}>
              <TagGroup.List className="flex flex-wrap items-center gap-1.5">
                {existingIds.map((id) => {
                  const tag = tagById.get(id)
                  const removing = removeIds.includes(id)
                  return (
                    <Tag
                      key={id}
                      id={id}
                      textValue={tag?.name ?? id}
                      className={removing ? 'line-through opacity-60' : undefined}
                    >
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: tag?.color }}
                        aria-hidden="true"
                      />
                      {tag?.name ?? id}
                      <Tag.RemoveButton />
                    </Tag>
                  )
                })}
              </TagGroup.List>
            </TagGroup>
          </div>
        ) : null}

        <div>
          <p className="mb-1.5 text-xs font-medium text-[var(--muted)]">添加标签</p>
          <TagPicker tags={tags} selectedIds={addIds} onChange={setAddIds} onCreate={onCreateTag} />
        </div>

        <RadioCardGroup
          aria-label="应用方式"
          label="方式"
          layout="row"
          value={mode}
          onChange={(value) => setMode(value as 'append' | 'replace')}
          options={[
            { value: 'append', label: '追加到已有标签' },
            { value: 'replace', label: '先用选中标签替换', description: '再移除上方标记项' },
          ]}
        />
      </div>
    </Dialog>
  )
}
