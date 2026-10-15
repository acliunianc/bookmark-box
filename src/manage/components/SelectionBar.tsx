import { Button } from '@heroui/react'
import { IconClose, IconTag, IconTrash } from '../../ui/icons'

interface SelectionBarProps {
  count: number
  onAddTags: () => void
  onRemoveTags: () => void
  onDelete: () => void
  onCancel: () => void
}

export function SelectionBar({ count, onAddTags, onRemoveTags, onDelete, onCancel }: SelectionBarProps) {
  if (count === 0) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--overlay)] px-3 py-2 shadow-xl">
        <span className="px-2 text-sm">
          已选 <strong>{count}</strong>
        </span>
        <Button size="sm" variant="secondary" onPress={onAddTags}>
          <IconTag width={14} height={14} /> 打标签
        </Button>
        <Button size="sm" variant="ghost" onPress={onRemoveTags}>
          移除标签
        </Button>
        <Button size="sm" variant="danger-soft" onPress={onDelete}>
          <IconTrash width={14} height={14} /> 删除
        </Button>
        <Button size="sm" variant="ghost" isIconOnly onPress={onCancel} aria-label="退出多选">
          <IconClose width={14} height={14} />
        </Button>
      </div>
    </div>
  )
}
