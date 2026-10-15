import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  ColorSwatchPicker,
  Input,
  Label,
  ListBox,
  Modal,
  ScrollShadow,
  Select,
  Separator,
  TextField,
} from '@heroui/react'
import { TAG_COLORS, UNGROUPED_KEY } from '../../shared/constants'
import type { Tag, TagGroup } from '../../shared/types'

const UNGROUPED_LABEL = '未分组'
const DEFAULT_COLOR: string = TAG_COLORS[0]

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

/** 标签编辑：命名 / 颜色 / 分组 / 合并 / 删除，全部用 HeroUI 表单组件（置顶改由标签左侧图钉直接操作） */
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
  }, [open, tag])

  const mergeCandidates = useMemo(
    () => tags.filter((item) => item.id !== tag?.id).sort((a, b) => b.useCount - a.useCount),
    [tags, tag?.id],
  )

  if (!tag) return null

  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    try {
      await task()
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    run(async () => {
      if (name.trim() && name.trim() !== tag.name) await onRename(tag.id, name.trim())
      if (color !== tag.color) await onColor(tag.id, color)
      if ((tag.groupId ?? null) !== groupId) await onSetGroup(tag.id, groupId)
      onClose()
    })

  return (
    <Modal isOpen={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <Modal.Backdrop>
        <Modal.Container placement="center" scroll="inside">
          <Modal.Dialog style={{ maxWidth: 520 }}>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>编辑标签「{tag.name}」</Modal.Heading>
              <p className="mt-1 text-xs text-[var(--muted)]">影响 {affectedCount} 条书签</p>
            </Modal.Header>

            <Modal.Body>
              <div className="flex flex-col gap-5">
                <TextField value={name} onChange={setName} isDisabled={busy}>
                  <Label className="text-xs font-medium text-[var(--muted)]">名称</Label>
                  <Input autoFocus />
                </TextField>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--muted)]">颜色</span>
                  <ColorSwatchPicker aria-label="标签颜色" value={color} onChange={(value) => setColor(String(value))}>
                    {TAG_COLORS.map((item) => (
                      <ColorSwatchPicker.Item key={item} color={item}>
                        <ColorSwatchPicker.Swatch />
                        <ColorSwatchPicker.Indicator />
                      </ColorSwatchPicker.Item>
                    ))}
                  </ColorSwatchPicker>
                </div>

                <Select
                  variant="secondary"
                  aria-label="所属分组"
                  selectedKey={groupId ?? UNGROUPED_KEY}
                  onSelectionChange={(key) => setGroupId(key === UNGROUPED_KEY ? null : String(key))}
                >
                  <Label className="text-xs font-medium text-[var(--muted)]">所属分组</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id={UNGROUPED_KEY} textValue={UNGROUPED_LABEL}>
                        {UNGROUPED_LABEL}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      {groups.map((group) => (
                        <ListBox.Item key={group.id} id={group.id} textValue={group.name}>
                          <span className="flex items-center gap-2">
                            <span
                              className="size-2 shrink-0 rounded-sm"
                              style={{ backgroundColor: group.color }}
                            />
                            {group.name}
                          </span>
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>

                <Separator />

                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-[var(--muted)]">合并到其他标签</span>
                  <div className="flex items-center gap-2">
                    <Select
                      className="flex-1"
                      variant="secondary"
                      aria-label="合并目标"
                      placeholder="选择目标标签"
                      selectedKey={mergeTarget}
                      onSelectionChange={(key) => setMergeTarget(key == null ? null : String(key))}
                    >
                      <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator />
                      </Select.Trigger>
                      <Select.Popover>
                        <ScrollShadow className="max-h-64">
                          <ListBox>
                            {mergeCandidates.map((item) => (
                              <ListBox.Item key={item.id} id={item.id} textValue={item.name}>
                                <span className="flex items-center gap-2">
                                  <span
                                    className="size-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: item.color }}
                                  />
                                  {item.name}
                                  <span className="text-xs text-[var(--muted)]">{item.useCount}</span>
                                </span>
                                <ListBox.ItemIndicator />
                              </ListBox.Item>
                            ))}
                          </ListBox>
                        </ScrollShadow>
                      </Select.Popover>
                    </Select>
                    <Button
                      variant="danger-soft"
                      isDisabled={busy || !mergeTarget}
                      onPress={() =>
                        run(async () => {
                          if (mergeTarget) await onMerge(tag.id, mergeTarget)
                          onClose()
                        })
                      }
                    >
                      合并
                    </Button>
                  </div>
                  <p className="text-xs text-[var(--muted)]">
                    合并后当前标签会被删除，其书签改为关联目标标签
                  </p>
                </div>
              </div>
            </Modal.Body>

            <Modal.Footer className="justify-between">
              {confirmDelete ? (
                <>
                  <span className="text-xs text-[var(--danger)]">确认删除？书签不会被删除</span>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" onPress={() => setConfirmDelete(false)} isDisabled={busy}>
                      取消
                    </Button>
                    <Button
                      variant="danger"
                      isDisabled={busy}
                      onPress={() =>
                        run(async () => {
                          await onDelete(tag.id)
                          onClose()
                        })
                      }
                    >
                      确认删除
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <Button variant="danger-soft" onPress={() => setConfirmDelete(true)} isDisabled={busy}>
                    删除标签
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" onPress={onClose} isDisabled={busy}>
                      取消
                    </Button>
                    <Button variant="primary" onPress={() => void save()} isDisabled={busy}>
                      保存
                    </Button>
                  </div>
                </>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
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

/** 分组编辑：命名 / 颜色 / 排序 / 删除 */
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
  }, [open, group])

  if (!group) return null

  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    try {
      await task()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal isOpen={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <Modal.Backdrop>
        <Modal.Container placement="center" scroll="inside">
          <Modal.Dialog style={{ maxWidth: 480 }}>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>编辑分组「{group.name}」</Modal.Heading>
              <p className="mt-1 text-xs text-[var(--muted)]">分组内 {tagCount} 个标签</p>
            </Modal.Header>

            <Modal.Body>
              <div className="flex flex-col gap-5">
                <TextField value={name} onChange={setName} isDisabled={busy}>
                  <Label className="text-xs font-medium text-[var(--muted)]">名称</Label>
                  <Input autoFocus />
                </TextField>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--muted)]">颜色</span>
                  <ColorSwatchPicker
                    aria-label="分组颜色"
                    value={color}
                    onChange={(value) =>
                      run(async () => {
                        setColor(String(value))
                        await onColor(group.id, String(value))
                      })
                    }
                  >
                    {TAG_COLORS.map((item) => (
                      <ColorSwatchPicker.Item key={item} color={item}>
                        <ColorSwatchPicker.Swatch />
                        <ColorSwatchPicker.Indicator />
                      </ColorSwatchPicker.Item>
                    ))}
                  </ColorSwatchPicker>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--muted)]">排序</span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      isDisabled={busy || index <= 0}
                      onPress={() => run(() => onMove(group.id, -1))}
                    >
                      上移
                    </Button>
                    <Button
                      variant="secondary"
                      isDisabled={busy || index >= total - 1}
                      onPress={() => run(() => onMove(group.id, 1))}
                    >
                      下移
                    </Button>
                    <span className="text-xs text-[var(--muted)]">
                      第 {index + 1} / {total}
                    </span>
                  </div>
                </div>
              </div>
            </Modal.Body>

            <Modal.Footer className="justify-between">
              {confirmDelete ? (
                <>
                  <span className="text-xs text-[var(--danger)]">
                    删除后 {tagCount} 个标签会回到「未分组」
                  </span>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" onPress={() => setConfirmDelete(false)} isDisabled={busy}>
                      取消
                    </Button>
                    <Button
                      variant="danger"
                      isDisabled={busy}
                      onPress={() =>
                        run(async () => {
                          await onDelete(group.id)
                          onClose()
                        })
                      }
                    >
                      确认删除
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <Button variant="danger-soft" onPress={() => setConfirmDelete(true)} isDisabled={busy}>
                    删除分组
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" onPress={onClose} isDisabled={busy}>
                      取消
                    </Button>
                    <Button
                      variant="primary"
                      isDisabled={busy}
                      onPress={() =>
                        run(async () => {
                          if (name.trim() && name.trim() !== group.name) await onRename(group.id, name.trim())
                          onClose()
                        })
                      }
                    >
                      保存
                    </Button>
                  </div>
                </>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
