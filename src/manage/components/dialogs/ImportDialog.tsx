import { useMemo, useRef, useState } from 'react'
import { Button, Checkbox, Chip, Spinner } from '@heroui/react'
import { normalizeUrl } from '../../../core/normalizeUrl'
import {
  folderTagPlan,
  parseBrowserTree,
  parseNetscapeHtml,
  toFolderNode,
  walkFolderTree,
  type ParseResult,
} from '../../../core/parseTree'
import { send, type TreeApplyResult } from '../../../shared/messages'
import type { Bookmark, FolderMode, Settings } from '../../../shared/types'
import { Dialog } from '../../../ui/Dialog'
import { RadioCardGroup } from '../../../ui/RadioCardGroup'
import { useToast } from '../../../ui/toast'
import { ImportFolderPlan } from '../ImportFolderPlan'

interface ImportDialogProps {
  open: boolean
  bookmarks: Bookmark[]
  settings: Settings
  onClose: () => void
  onImported: () => Promise<void>
}

type Step = 'source' | 'preview' | 'report'

function countFolders(result: ParseResult): number {
  let count = 0
  walkFolderTree(toFolderNode(result.root), () => {
    count += 1
  })
  return count
}

export function ImportDialog({ open, bookmarks, settings, onClose, onImported }: ImportDialogProps) {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('source')
  const [source, setSource] = useState<'browser' | 'html'>('html')
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [conflict, setConflict] = useState<'keep' | 'overwrite'>('keep')
  const [autoTag, setAutoTag] = useState(true)
  /* 被用户显式改过处理方式的文件夹：路径 → tag / group / none */
  const [folderModes, setFolderModes] = useState<Record<string, FolderMode>>({})
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<TreeApplyResult | null>(null)
  const [lastTreeSnapshotId, setLastTreeSnapshotId] = useState<number | null>(null)

  const reset = () => {
    setStep('source')
    setSource('html')
    setParsed(null)
    setConflict('keep')
    setAutoTag(true)
    setFolderModes({})
    setReport(null)
    setBusy(false)
    setLastTreeSnapshotId(null)
  }

  const close = () => {
    reset()
    onClose()
  }

  const existingNormUrls = useMemo(
    () => new Set(bookmarks.map((bookmark) => bookmark.normUrl)),
    [bookmarks],
  )

  const preview = useMemo(() => {
    if (!parsed) return null
    const normUrls = new Set(
      parsed.items
        .map((item) => normalizeUrl(item.url, settings))
        .filter((url): url is string => Boolean(url)),
    )
    let duplicates = 0
    for (const url of normUrls) if (existingNormUrls.has(url)) duplicates += 1
    const tree = toFolderNode(parsed.root)
    return {
      total: parsed.items.length,
      unique: normUrls.size,
      duplicates,
      folders: countFolders(parsed),
      root: tree,
      topFolders: tree.children.map((child) => `${child.name} (${child.totalCount})`),
    }
  }, [parsed, settings, existingNormUrls])

  /** 会自动生成的标签与分组的预览（按逐文件夹配置推导） */
  const planPreview = useMemo(() => {
    if (!parsed) return { tags: [] as string[], groups: [] as string[] }
    const names = new Set<string>()
    const groups = new Set<string>()
    for (const item of parsed.items) {
      for (const entry of folderTagPlan(item.path, folderModes, autoTag)) {
        names.add(entry.name)
        // 只有真正收到标签的分组才会被创建
        if (entry.groupName) groups.add(entry.groupName)
      }
    }
    const sort = (a: string, b: string) => a.localeCompare(b, 'zh-Hans-CN')
    return { tags: [...names].sort(sort), groups: [...groups].sort(sort) }
  }, [parsed, autoTag, folderModes])

  const handleFile = async (file: File) => {
    setBusy(true)
    try {
      const text = await file.text()
      const result = parseNetscapeHtml(text)
      if (result.items.length === 0) {
        toast.danger('未在该 HTML 中解析到书签，请确认是浏览器导出的书签文件')
        return
      }
      setParsed(result)
      setSource('html')
      setStep('preview')
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const readBrowser = async () => {
    setBusy(true)
    try {
      const tree = await chrome.bookmarks.getTree()
      const result = parseBrowserTree(tree)
      if (result.items.length === 0) {
        toast.danger('本机书签为空')
        return
      }
      setParsed(result)
      setSource('browser')
      setStep('preview')
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    if (!parsed || !preview) return
    setBusy(true)
    try {
      const snapshots = await send('snapshot/list', {})
      const lastTree = snapshots.snapshots.find((snapshot) => snapshot.kind === 'tree')
      const result = await send('tree/apply', {
        source: parsed.source,
        items: parsed.items,
        root: preview.root,
        options: { conflict, autoTag, folderModes },
      })
      setReport(result)
      setLastTreeSnapshotId(lastTree?.id ?? null)
      setStep('report')
      await onImported()
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const undoImport = async () => {
    if (lastTreeSnapshotId == null) {
      toast.danger('没有可回滚的快照')
      return
    }
    setBusy(true)
    try {
      await send('snapshot/restore', { id: lastTreeSnapshotId })
      await onImported()
      toast.success('已回滚文件树快照')
      close()
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="导入书签"
      description="解析出的文件夹树会整体替换旧快照（只读），书签按 URL 去重合并进书签池"
      width={680}
      footer={
        <>
          {step === 'preview' ? (
            <Button variant="ghost" onPress={() => setStep('source')} isDisabled={busy}>
              上一步
            </Button>
          ) : null}
          <Button variant="ghost" onPress={close} isDisabled={busy}>
            {step === 'report' ? '完成' : '取消'}
          </Button>
          {step === 'preview' ? (
            <Button variant="primary" onPress={() => void apply()} isDisabled={busy}>
              {busy ? <Spinner size="sm" /> : `执行导入（${preview?.unique ?? 0} 条）`}
            </Button>
          ) : null}
          {step === 'report' ? (
            <Button variant="secondary" onPress={() => void undoImport()} isDisabled={busy}>
              撤销全部
            </Button>
          ) : null}
        </>
      }
    >
      {step === 'source' ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-[var(--radius)] border border-[var(--border)] p-4">
            <h3 className="text-sm font-medium">① 上传 HTML 书签文件</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              支持 Chrome / Edge / Firefox / Safari 导出的 Netscape 格式（.html）
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".html,.htm,text/html"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void handleFile(file)
                event.target.value = ''
              }}
            />
            <Button
              className="mt-3"
              variant="secondary"
              onPress={() => fileRef.current?.click()}
              isDisabled={busy}
            >
              选择文件
            </Button>
          </div>

          <div className="rounded-[var(--radius)] border border-[var(--border)] p-4">
            <h3 className="text-sm font-medium">② 读取本浏览器书签</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              通过 chrome.bookmarks 读取当前浏览器全部书签，生成文件夹树快照
            </p>
            <Button className="mt-3" variant="secondary" onPress={() => void readBrowser()} isDisabled={busy}>
              {busy ? <Spinner size="sm" /> : '读取本机书签'}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'preview' && preview ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-[var(--radius)] bg-[var(--surface-secondary)] px-3 py-2 text-xs">
            <p>
              来源：{source === 'browser' ? '本机书签' : 'HTML 文件'} · 文件夹{' '}
              <strong>{preview.folders}</strong> 个 · 书签 <strong>{preview.total}</strong> 条（去重后{' '}
              <strong>{preview.unique}</strong> 条）
            </p>
            <p className="mt-1 text-[var(--muted)]">
              与现有库重复 <strong>{preview.duplicates}</strong> 条
            </p>
          </div>

          {preview.topFolders.length > 0 ? (
            <div className="rounded-[var(--radius)] border border-[var(--border)] p-3">
              <p className="mb-2 text-xs font-medium text-[var(--muted)]">顶层文件夹</p>
              <div className="flex flex-wrap gap-1.5">
                {preview.topFolders.map((name) => (
                  <Chip key={name} size="sm" variant="soft">
                    <Chip.Label>{name}</Chip.Label>
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}

          <RadioCardGroup
            aria-label="冲突策略"
            label="冲突策略"
            layout="row"
            value={conflict}
            onChange={(value) => setConflict(value as 'keep' | 'overwrite')}
            options={[
              {
                value: 'keep',
                label: '保留已有标签（默认）',
                description: '已存在的书签仅补充文件夹来源，不改动已打标签',
              },
              {
                value: 'overwrite',
                label: '覆盖为导入状态',
                description: '用导入标题覆盖，并重置标签（配合下方选项可自动生成标签）',
              },
            ]}
          />

          <div className="rounded-[var(--radius)] border border-[var(--border)] p-3">
            <Checkbox isSelected={autoTag} onChange={setAutoTag}>
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <span className="flex flex-col">
                  <span className="text-sm font-medium">按文件夹路径生成标签</span>
                  <span className="mt-0.5 text-xs text-[var(--muted)]">
                    默认勾选。取消勾选后不会自动生成任何标签与分组，下方各文件夹的处理方式一并失效
                  </span>
                </span>
              </Checkbox.Content>
            </Checkbox>
          </div>

          {/* 不生成标签时整块配置没有意义，直接不渲染 */}
          {autoTag ? (
            <ImportFolderPlan
              root={preview.root}
              folderModes={folderModes}
              onChange={setFolderModes}
            />
          ) : null}

          {planPreview.tags.length > 0 ? (
            <div className="rounded-[var(--radius)] bg-[var(--surface-secondary)] px-3 py-2">
              <p className="text-xs text-[var(--muted)]">
                将自动生成 <strong>{planPreview.tags.length}</strong> 个标签
                {planPreview.groups.length > 0 ? (
                  <>
                    {' '}
                    · 归入 <strong>{planPreview.groups.length}</strong> 个分组
                  </>
                ) : null}
                {planPreview.tags.length > 24 ? `（仅列出前 24 个）` : ''}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {planPreview.tags.slice(0, 24).map((name) => (
                  <Chip key={name} size="sm" variant="tertiary">
                    <Chip.Label>#{name}</Chip.Label>
                  </Chip>
                ))}
              </div>
              {planPreview.groups.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {planPreview.groups.map((name) => (
                    <Chip key={name} size="sm" variant="soft">
                      <Chip.Label>{name} 分组</Chip.Label>
                    </Chip>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 'report' && report ? (
        <div className="flex flex-col gap-3 text-sm">
          <p>
            新增 <strong>{report.added}</strong> · 更新 <strong>{report.updated}</strong> · 重复跳过{' '}
            <strong>{report.skipped}</strong>
          </p>
          <p className="text-xs text-[var(--muted)]">
            文件树已替换（{report.tree.source === 'browser' ? '本机书签' : 'HTML 文件'} ·{' '}
            {new Date(report.tree.importedAt).toLocaleString('zh-CN')}）
            {report.tagsCreated > 0 ? ` · 自动新建标签 ${report.tagsCreated} 个` : ''}
            {report.groupsCreated > 0 ? ` · 新建分组 ${report.groupsCreated} 个` : ''}
            {report.tagsGrouped > 0 ? ` · 归入分组标签 ${report.tagsGrouped} 个` : ''}
          </p>
          <p className="text-xs text-[var(--muted)]">
            导入前已自动保留一份快照，「撤销全部」可回滚文件树。
          </p>
        </div>
      ) : null}
    </Dialog>
  )
}
