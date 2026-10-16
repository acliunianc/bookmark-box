import { useEffect, useMemo, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Separator } from '@heroui/react'
import { TAG_COLORS, UNGROUPED_KEY } from '../../shared/constants'
import type { Tag, TagGroup } from '../../shared/types'
import { cn } from '../../ui/cn'
import { LightDialog } from '../../ui/LightDialog'
import { SearchSelect, type SearchSelectOption } from '../../ui/SearchSelect'

const UNGROUPED_LABEL = '未分组'
const DEFAULT_COLOR: string = TAG_COLORS[0]

type NativeBtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-soft'

function NativeButton({
  variant = 'secondary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: NativeBtnVariant }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-9 items-center justify-center rounded-[var(--field-radius)] px-3 text-sm font-medium',
        'transition-colors disabled:pointer-events-none disabled:opacity-50',
        variant === 'primary' &&
          'bg-[var(--accent)] text-[var(--accent-foreground)] hover:opacity-90',
        variant === 'secondary' &&
          'bg-[var(--default)] text-[var(--default-foreground)] hover:brightness-95',
        variant === 'ghost' && 'bg-transparent text-[var(--foreground)] hover:bg-[var(--default)]',
        variant === 'danger' &&
          'bg-[var(--danger)] text-[var(--danger-foreground)] hover:opacity-90',
        variant === 'danger-soft' &&
          'bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_oklab,var(--danger)_18%,transparent)]',
        className,
      )}
      {...props}
    />
  )
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-xs font-medium text-[var(--muted)]">{children}</span>
}

/** 轻量色板：替代 ColorSwatchPicker，避免首开挂载卡顿 */
function ColorField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: string
  onChange: (color: string) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {TAG_COLORS.map((item) => {
          const selected = item === value
          return (
            <button
              key={item}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={item}
              disabled={disabled}
              className={cn(
                'size-7 shrink-0 rounded-full transition-[box-shadow,transform] duration-100',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
                selected
                  ? 'scale-110 shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--accent)]'
                  : 'hover:scale-105',
                disabled && 'pointer-events-none opacity-50',
              )}
              style={{ backgroundColor: item }}
              onClick={() => onChange(item)}
            />
          )
        })}
      </div>
    </div>
  )
}

function NameField({
  value,
  onChange,
  disabled,
  autoFocus,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  autoFocus?: boolean
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <FieldLabel>名称</FieldLabel>
      <input
        autoFocus={autoFocus}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'h-10 rounded-[var(--field-radius)] border border-[var(--border)] bg-[var(--field-background)]',
          'px-3 text-sm text-[var(--field-foreground)] outline-none',
          'focus:border-[var(--accent)] focus:ring-2 focus:ring-[color-mix(in_oklab,var(--accent)_35%,transparent)]',
          'disabled:opacity-50',
        )}
      />
    </label>
  )
}

interface TagDetailDialogProps {
  open: boolean
  tag: Tag | null
  tags: Tag[]
  groups: TagGroup[]
  affectedCount: number
  onClose: () => void
  onRename: (id: string, name: string) => Promise<void>
  onColor: (id: string, color: string) => Promise<void>
  onSetGroup: (id: string, groupId: string | null) => Promise<void>
  onMerge: (fromId: string, toId: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

/** 标签编辑：命名 / 颜色 / 分组 / 合并 / 删除（置顶改由标签左侧图钉直接操作） */
export function TagDetailDialog({
  open,
  tag,
  tags,
  groups,
  affectedCount,
  onClose,
  onRename,
  onColor,
  onSetGroup,
  onMerge,
  onDelete,
}: TagDetailDialogProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(DEFAULT_COLOR)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [mergeTarget, setMergeTarget] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !tag) return
    setName(tag.name)
    setColor(tag.color)
    setGroupId(tag.groupId ?? null)
    setMergeTarget(null)
    setConfirmDelete(false)
    setBusy(false)
  }, [open, tag])

  const groupOptions = useMemo<SearchSelectOption[]>(() => {
    if (!open) return []
    return [
      { id: UNGROUPED_KEY, label: UNGROUPED_LABEL },
      ...groups.map((group) => ({
        id: group.id,
        label: group.name,
        color: group.color,
        shape: 'square' as const,
      })),
    ]
  }, [open, groups])

  const mergeOptions = useMemo<SearchSelectOption[]>(() => {
    if (!open || !tag) return []
    return tags
      .filter((item) => item.id !== tag.id)
      .sort((a, b) => b.useCount - a.useCount)
      .map((item) => ({
        id: item.id,
        label: item.name,
        color: item.color,
        meta: item.useCount,
      }))
  }, [open, tags, tag])

  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    try {
      await task()
    } finally {
      setBusy(false)
    }
  }

  const save = () => {
    if (!tag) return
    void run(async () => {
      if (name.trim() && name.trim() !== tag.name) await onRename(tag.id, name.trim())
      if (color !== tag.color) await onColor(tag.id, color)
      if ((tag.groupId ?? null) !== groupId) await onSetGroup(tag.id, groupId)
      onClose()
    })
  }

  if (!open || !tag) return null

  return (
    <LightDialog
      open
      onClose={onClose}
      closeOnBackdrop={!busy}
      width={520}
      title={`编辑标签「${tag.name}」`}
      description={`影响 ${affectedCount} 条书签`}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {confirmDelete ? (
            <>
              <span className="text-xs text-[var(--danger)]">确认删除？书签不会被删除</span>
              <div className="flex items-center gap-2">
                <NativeButton variant="ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>
                  取消
                </NativeButton>
                <NativeButton
                  variant="danger"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await onDelete(tag.id)
                      onClose()
                    })
                  }
                >
                  确认删除
                </NativeButton>
              </div>
            </>
          ) : (
            <>
              <NativeButton
                variant="danger-soft"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
              >
                删除标签
              </NativeButton>
              <div className="flex items-center gap-2">
                <NativeButton variant="ghost" onClick={onClose} disabled={busy}>
                  取消
                </NativeButton>
                <NativeButton variant="primary" onClick={() => void save()} disabled={busy}>
                  保存
                </NativeButton>
              </div>
            </>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <NameField value={name} onChange={setName} disabled={busy} autoFocus />

        <ColorField label="颜色" value={color} onChange={setColor} disabled={busy} />

        <SearchSelect
          aria-label="所属分组"
          className="w-full"
          label="所属分组"
          value={groupId ?? UNGROUPED_KEY}
          onChange={(id) => setGroupId(id === UNGROUPED_KEY ? null : id)}
          options={groupOptions}
          placeholder="输入关键字搜索分组"
          isDisabled={busy}
        />

        <Separator />

        <div className="flex flex-col gap-2">
          <FieldLabel>合并到其他标签</FieldLabel>
          <div className="flex items-center gap-2">
            <SearchSelect
              aria-label="合并目标"
              className="flex-1"
              value={mergeTarget}
              onChange={setMergeTarget}
              options={mergeOptions}
              placeholder="搜索并选择目标标签"
              isDisabled={busy}
            />
            <NativeButton
              variant="danger-soft"
              disabled={busy || !mergeTarget}
              onClick={() =>
                void run(async () => {
                  if (mergeTarget) await onMerge(tag.id, mergeTarget)
                  onClose()
                })
              }
            >
              合并
            </NativeButton>
          </div>
          <p className="text-xs text-[var(--muted)]">
            合并后当前标签会被删除，其书签改为关联目标标签
          </p>
        </div>
      </div>
    </LightDialog>
  )
}

interface GroupDetailDialogProps {
  open: boolean
  group: TagGroup | null
  tagCount: number
  index: number
  total: number
  onClose: () => void
  onRename: (id: string, name: string) => Promise<void>
  onColor: (id: string, color: string) => Promise<void>
  onMove: (id: string, direction: -1 | 1) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

/** 分组编辑：命名 / 颜色 / 排序 / 删除（纯原生控件，打开不走 Modal 重挂载） */
export function GroupDetailDialog({
  open,
  group,
  tagCount,
  index,
  total,
  onClose,
  onRename,
  onColor,
  onMove,
  onDelete,
}: GroupDetailDialogProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(DEFAULT_COLOR)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !group) return
    setName(group.name)
    setColor(group.color)
    setConfirmDelete(false)
    setBusy(false)
  }, [open, group])

  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    try {
      await task()
    } finally {
      setBusy(false)
    }
  }

  if (!open || !group) return null

  return (
    <LightDialog
      open
      onClose={onClose}
      closeOnBackdrop={!busy}
      width={480}
      title={`编辑分组「${group.name}」`}
      description={`分组内 ${tagCount} 个标签`}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {confirmDelete ? (
            <>
              <span className="text-xs text-[var(--danger)]">
                删除后 {tagCount} 个标签会回到「未分组」
              </span>
              <div className="flex items-center gap-2">
                <NativeButton variant="ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>
                  取消
                </NativeButton>
                <NativeButton
                  variant="danger"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await onDelete(group.id)
                      onClose()
                    })
                  }
                >
                  确认删除
                </NativeButton>
              </div>
            </>
          ) : (
            <>
              <NativeButton
                variant="danger-soft"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
              >
                删除分组
              </NativeButton>
              <div className="flex items-center gap-2">
                <NativeButton variant="ghost" onClick={onClose} disabled={busy}>
                  取消
                </NativeButton>
                <NativeButton
                  variant="primary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      if (name.trim() && name.trim() !== group.name) {
                        await onRename(group.id, name.trim())
                      }
                      onClose()
                    })
                  }
                >
                  保存
                </NativeButton>
              </div>
            </>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <NameField value={name} onChange={setName} disabled={busy} autoFocus />

        <ColorField
          label="颜色"
          value={color}
          disabled={busy}
          onChange={(next) => {
            setColor(next)
            void onColor(group.id, next)
          }}
        />

        <div className="flex flex-col gap-1.5">
          <FieldLabel>排序</FieldLabel>
          <div className="flex items-center gap-2">
            <NativeButton
              variant="secondary"
              disabled={busy || index <= 0}
              onClick={() => void run(() => onMove(group.id, -1))}
            >
              上移
            </NativeButton>
            <NativeButton
              variant="secondary"
              disabled={busy || index >= total - 1}
              onClick={() => void run(() => onMove(group.id, 1))}
            >
              下移
            </NativeButton>
            <span className="text-xs text-[var(--muted)]">
              第 {index + 1} / {total}
            </span>
          </div>
        </div>
      </div>
    </LightDialog>
  )
}
