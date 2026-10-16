import { useEffect, useState } from 'react'
import { Button, Checkbox, Description, ListBox, Select, Spinner } from '@heroui/react'
import { send } from '../../../shared/messages'
import type { Bookmark, Settings, SnapshotRecord } from '../../../shared/types'
import { formatDateTime } from '../../../shared/utils'
import { BrowserPlacementSelect, useBrowserFolders } from '../../../ui/BrowserFolderSelect'
import { Dialog } from '../../../ui/Dialog'
import { useToast } from '../../../ui/toast'
import { ConfirmDialog } from './ConfirmDialog'

interface SettingsDialogProps {
  open: boolean
  settings: Settings
  trashed: Bookmark[]
  onClose: () => void
  onUpdateSettings: (patch: Partial<Settings>) => Promise<void>
  onDataChanged: () => Promise<void>
  /** 清空本地数据后：刷新并丢掉仍指向旧数据的筛选 / 选中态 */
  onCleared: () => Promise<void>
}

const KIND_LABEL: Record<SnapshotRecord['kind'], string> = {
  full: '全库快照',
  tree: '文件树快照',
  undo: '撤销记录',
}

export function SettingsDialog({
  open,
  settings,
  trashed,
  onClose,
  onUpdateSettings,
  onDataChanged,
  onCleared,
}: SettingsDialogProps) {
  const toast = useToast()
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmPurge, setConfirmPurge] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  /* 打开设置时才去读本机浏览器书签的文件夹（用于选放置位置） */
  const browserFolders = useBrowserFolders(open)

  const loadSnapshots = async () => {
    setLoading(true)
    try {
      const result = await send('snapshot/list', {})
      setSnapshots(result.snapshots.filter((snapshot) => snapshot.kind !== 'undo'))
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) void loadSnapshots()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const applyTheme = async (theme: Settings['theme']) => {
    await onUpdateSettings({ theme })
    const resolved =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme
    document.documentElement.dataset.theme = resolved
  }

  const restore = async (id: number) => {
    try {
      await send('snapshot/restore', { id })
      await onDataChanged()
      await loadSnapshots()
      toast.success('已回滚到该快照')
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : String(error))
    }
  }

  const restoreBookmark = async (id: string) => {
    await send('bookmark/restore', { ids: [id] })
    await onDataChanged()
    toast.success('已恢复到书签列表')
  }

  const purge = async (ids?: string[]) => {
    await send('bookmark/purge', ids ? { ids } : {})
    await onDataChanged()
    toast.success('已彻底删除')
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="设置"
        width={620}
        footer={
          <Button variant="ghost" onPress={onClose}>
            关闭
          </Button>
        }
      >
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">收藏与检索</h3>

            <Checkbox
              aria-label="规范化 URL 时剔除追踪参数"
              isSelected={settings.removeTrackingParams}
              onChange={(value) => void onUpdateSettings({ removeTrackingParams: value })}
            >
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                规范化 URL 时剔除追踪参数
              </Checkbox.Content>
              <Description>utm_* / spm / from / fbclid / gclid 等，用于更准确的书签去重</Description>
            </Checkbox>

            <Checkbox
              aria-label="忽略 URL 的 #锚点"
              isSelected={settings.ignoreFragment}
              onChange={(value) => void onUpdateSettings({ ignoreFragment: value })}
            >
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                忽略 URL 的 #锚点
              </Checkbox.Content>
              <Description>同一页面的不同锚点视为同一条书签</Description>
            </Checkbox>

            <div className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-sm text-[var(--muted)]">主题</span>
              <Select
                className="w-40"
                variant="secondary"
                aria-label="主题"
                selectedKey={settings.theme}
                onSelectionChange={(key) => {
                  if (key != null) void applyTheme(String(key) as Settings['theme'])
                }}
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item id="system" textValue="跟随系统">
                      跟随系统
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item id="light" textValue="浅色">
                      浅色
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item id="dark" textValue="深色">
                      深色
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">浏览器书签同步</h3>

            <Checkbox
              aria-label="收藏时同步写入本机浏览器书签"
              isSelected={settings.syncToBrowser}
              onChange={(value) => void onUpdateSettings({ syncToBrowser: value })}
            >
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                收藏时同步写入本机浏览器书签
              </Checkbox.Content>
              <Description>浮动窗收藏时默认勾选，单次也可取消；需要扩展的「书签」权限</Description>
            </Checkbox>

            <div className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-sm text-[var(--muted)]">放置位置</span>
              <BrowserPlacementSelect
                className="w-72"
                folders={browserFolders.folders}
                auto={browserFolders.auto}
                mode={settings.browserFolderMode}
                folderId={settings.browserFolderId}
                isDisabled={!settings.syncToBrowser}
                onChange={({ mode, folderId }) =>
                  void onUpdateSettings({ browserFolderMode: mode, browserFolderId: folderId })
                }
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">回收站（{trashed.length}）</h3>
              {trashed.length > 0 ? (
                <Button size="sm" variant="danger-soft" onPress={() => setConfirmPurge(true)}>
                  清空回收站
                </Button>
              ) : null}
            </div>
            {trashed.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">回收站为空（删除的书签保留 30 天）</p>
            ) : (
              <ul className="max-h-52 overflow-y-auto rounded-[var(--radius)] border border-[var(--border)]">
                {trashed.map((bookmark) => (
                  <li
                    key={bookmark.id}
                    className="flex items-center gap-2 border-b border-[var(--separator)] px-3 py-2 text-xs last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 truncate" title={bookmark.url}>
                      {bookmark.title}
                    </span>
                    <span className="shrink-0 text-[var(--muted)]">
                      {formatDateTime(bookmark.deletedAt)}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => void restoreBookmark(bookmark.id)}
                    >
                      恢复
                    </Button>
                    <Button
                      size="sm"
                      variant="danger-soft"
                      onPress={() => void purge([bookmark.id])}
                    >
                      彻底删除
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">安全快照（最近 3 份）</h3>
            {loading ? (
              <Spinner size="sm" />
            ) : snapshots.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">还没有快照，导入书签或备份时会自动生成</p>
            ) : (
              <ul className="rounded-[var(--radius)] border border-[var(--border)]">
                {snapshots.map((snapshot) => (
                  <li
                    key={snapshot.id}
                    className="flex items-center gap-2 border-b border-[var(--separator)] px-3 py-2 text-xs last:border-b-0"
                  >
                    <span className="shrink-0 rounded bg-[var(--default)] px-1.5 py-0.5">
                      {KIND_LABEL[snapshot.kind]}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{snapshot.label}</span>
                    <span className="shrink-0 text-[var(--muted)]">
                      {formatDateTime(snapshot.createdAt)}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => void restore(snapshot.id as number)}
                    >
                      回滚
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--danger)]/30 p-3">
            <h3 className="text-sm font-medium text-[var(--danger)]">清理数据</h3>
            <p className="text-xs text-[var(--muted)]">
              清空本插件里的书签、标签、分组、文件树、回收站和快照。主题与同步设置会保留，浏览器里的书签不会被删除。此操作无法撤销。
            </p>
            <div>
              <Button
                size="sm"
                variant="danger"
                isDisabled={clearing}
                onPress={() => setConfirmClear(true)}
              >
                清空全部数据
              </Button>
            </div>
          </section>
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmPurge}
        title="清空回收站"
        message={`将彻底删除 ${trashed.length} 条书签，且无法恢复。确认继续？`}
        confirmLabel="彻底删除"
        danger
        onConfirm={() => {
          setConfirmPurge(false)
          void purge()
        }}
        onCancel={() => setConfirmPurge(false)}
      />

      <ConfirmDialog
        open={confirmClear}
        title="清空全部数据"
        message="将删除本插件中的全部书签、标签、分组、文件树、回收站和快照，且无法恢复。浏览器书签和设置项会保留。确认继续？"
        confirmLabel="清空"
        danger
        pending={clearing}
        onConfirm={() => {
          setClearing(true)
          void (async () => {
            try {
              await send('data/clear', {})
              setConfirmClear(false)
              setSnapshots([])
              await onCleared()
              toast.success('本地数据已清空')
            } catch (error) {
              toast.danger(error instanceof Error ? error.message : String(error))
            } finally {
              setClearing(false)
            }
          })()
        }}
        onCancel={() => {
          if (!clearing) setConfirmClear(false)
        }}
      />
    </>
  )
}
