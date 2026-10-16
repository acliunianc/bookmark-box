import { useRef, useState } from 'react'
import { Button, Spinner } from '@heroui/react'
import { buildBackup, buildNetscapeHtml, type HtmlExportStrategy } from '../../../core/backup'
import { send } from '../../../shared/messages'
import type { Bookmark, Settings, Tag, TagGroup, TreeSnapshot } from '../../../shared/types'
import { download, timestampTag } from '../../../shared/utils'
import { Dialog } from '../../../ui/Dialog'
import { RadioCardGroup } from '../../../ui/RadioCardGroup'
import { useToast } from '../../../ui/toast'

interface ExportDialogProps {
  open: boolean
  bookmarks: Bookmark[]
  tags: Tag[]
  groups: TagGroup[]
  tree: TreeSnapshot | null
  settings: Settings
  onClose: () => void
  onImported: () => Promise<void>
}

export function ExportDialog({
  open,
  bookmarks,
  tags,
  groups,
  tree,
  settings,
  onClose,
  onImported,
}: ExportDialogProps) {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [strategy, setStrategy] = useState<HtmlExportStrategy>('byTag')
  const [mode, setMode] = useState<'replace' | 'merge'>('replace')
  const [busy, setBusy] = useState(false)

  const exportJson = () => {
    const content = buildBackup({ bookmarks, tags, groups, tree, settings })
    download(`bookmarkbox-backup-${timestampTag()}.json`, content)
    toast.success('已导出 JSON 全量备份')
  }

  const exportHtml = () => {
    const content = buildNetscapeHtml(bookmarks, tags, strategy)
    download(`bookmarkbox-bookmarks-${timestampTag()}.html`, content, 'text/html')
    toast.success('已导出标准 HTML 书签')
  }

  const importJson = async (file: File) => {
    setBusy(true)
    try {
      const text = await file.text()
      const result = await send('backup/import', { text, mode })
      await onImported()
      toast.success(`JSON 备份已导入：新增 ${result.added} · 更新 ${result.updated}`)
      onClose()
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="导入 / 导出"
      description="数据全部保存在本地 IndexedDB，导出的 JSON 可用于跨设备迁移"
      width={580}
      footer={
        <Button variant="ghost" onPress={onClose}>
          关闭
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <section className="rounded-[var(--radius)] border border-[var(--border)] p-4">
          <h3 className="text-sm font-medium">JSON 全量备份</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            书签 + 标签 + 标签关联 + 文件树快照 + 设置；可用本插件再导入恢复
          </p>
          <Button className="mt-3" variant="secondary" onPress={exportJson}>
            下载 bookmarkbox-backup-{timestampTag()}.json
          </Button>
        </section>

        <section className="rounded-[var(--radius)] border border-[var(--border)] p-4">
          <h3 className="text-sm font-medium">标准 HTML 书签</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">兼容浏览器「导入书签」功能</p>
          <RadioCardGroup
            className="mt-2"
            aria-label="HTML 导出方式"
            layout="row"
            value={strategy}
            onChange={(value) => setStrategy(value as HtmlExportStrategy)}
            options={[
              {
                value: 'byTag',
                label: '按标签分文件夹',
                description: '多标签书签会在多个文件夹下重复出现',
              },
              {
                value: 'flat',
                label: '仅导出全部书签',
                description: '平铺，不体现标签',
              },
            ]}
          />
          <Button className="mt-3" variant="secondary" onPress={exportHtml}>
            下载 bookmarks.html
          </Button>
        </section>

        <section className="rounded-[var(--radius)] border border-[var(--border)] p-4">
          <h3 className="text-sm font-medium">从 JSON 备份恢复</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            恢复前会自动保留一份当前数据的快照（设置页可回滚）
          </p>
          <RadioCardGroup
            className="mt-2"
            aria-label="恢复方式"
            layout="row"
            value={mode}
            onChange={(value) => setMode(value as 'replace' | 'merge')}
            options={[
              { value: 'replace', label: '全量恢复', description: '覆盖当前库' },
              { value: 'merge', label: '合并导入', description: '保留现有标签，追加新书签' },
            ]}
          />
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void importJson(file)
              event.target.value = ''
            }}
          />
          <Button
            className="mt-3"
            variant="secondary"
            onPress={() => fileRef.current?.click()}
            isDisabled={busy}
          >
            {busy ? <Spinner size="sm" /> : '选择 JSON 备份文件'}
          </Button>
        </section>
      </div>
    </Dialog>
  )
}
