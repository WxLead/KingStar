import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import {
  FileText,
  File,
  FileCode,
  FileImage,
  FileType,
  FileSpreadsheet,
  Presentation,
  Languages,
  Trash2,
  Loader2,
  BookOpen,
  LayoutList,
  Download,
  ChevronDown,
  Plus,
  RotateCcw,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import ListPageHero from '@/features/layout/ListPageHero'
import TaskFilterBar, { type TaskFilter } from '@/features/tasks/TaskFilterBar'
import { downloadTextFile } from '@/features/reading/notesExportMarkdown'
import { useUploads } from '@/features/uploads/UploadsContext'
import {
  isStageBusy,
  resolveStage,
  stageMeta,
} from '@/features/uploads/pipelineStage'
import {
  exportTaskPdf,
  fetchArtifactText,
  formatBytes,
  formatUploadTime,
  getTask,
  paperDisplayTitle,
  retryTask,
  type UploadItem,
} from '@/services/api'

function fileIconMeta(filename: string): { icon: React.ReactNode; bg: string } {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'pdf':
      return {
        icon: <FileText size={18} strokeWidth={2.1} className="text-[#e23f2b]" />,
        bg: 'bg-[#fef2f2]',
      }
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'bmp':
      return {
        icon: <FileImage size={18} strokeWidth={2.1} className="text-[#22a06b]" />,
        bg: 'bg-[#ecfdf5]',
      }
    case 'ppt':
    case 'pptx':
      return {
        icon: <Presentation size={18} strokeWidth={2.1} className="text-[#e8801a]" />,
        bg: 'bg-[#fff7ed]',
      }
    case 'doc':
    case 'docx':
      return {
        icon: <FileType size={18} strokeWidth={2.1} className="text-[#2b6cd4]" />,
        bg: 'bg-[#eff6ff]',
      }
    case 'xls':
    case 'xlsx':
    case 'csv':
      return {
        icon: <FileSpreadsheet size={18} strokeWidth={2.1} className="text-[#059669]" />,
        bg: 'bg-[#ecfdf5]',
      }
    case 'md':
    case 'markdown':
      return {
        icon: <FileCode size={18} strokeWidth={2.1} className="text-[#7c3aed]" />,
        bg: 'bg-[#f5f3ff]',
      }
    case 'txt':
      return {
        icon: <FileText size={18} strokeWidth={2.1} className="text-[#6b7280]" />,
        bg: 'bg-[#f3f4f6]',
      }
    default:
      return {
        icon: <File size={18} strokeWidth={2.1} className="text-[#6a70a0]" />,
        bg: 'bg-[#f0f1f8]',
      }
  }
}

function ActionBtn({
  label,
  title,
  onClick,
  disabled,
  tone = 'indigo',
  children,
}: {
  label: string
  title?: string
  onClick: () => void
  disabled?: boolean
  tone?: 'indigo' | 'danger' | 'muted'
  children: React.ReactNode
}) {
  const tones = {
    indigo: 'text-[#4f46e5] hover:bg-[#eef0fb]',
    danger: 'text-[#dc2626] hover:bg-[#fef2f2]',
    muted: 'text-[#6a70a0] hover:bg-[#f3f4fb]',
  }
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone]}`}
    >
      {children}
      <span>{label}</span>
    </button>
  )
}

function TaskRow({ item }: { item: UploadItem }) {
  const navigate = useNavigate()
  const { selectedId, setSelectedId, busyId, remove, translateOneClick, refresh } = useUploads()
  const stage = resolveStage(item)
  const status = stageMeta(stage)
  const fileMeta = fileIconMeta(item.filename)
  const rowBusy = busyId === item.upload_id
  const pipelineBusy = isStageBusy(stage)
  const busy = rowBusy || pipelineBusy
  const selected = selectedId === item.upload_id
  const canTranslate =
    !pipelineBusy &&
    (stage === 'parsed' || stage === 'completed' || stage === 'failed' || stage === 'unprocessed')
  const [exporting, setExporting] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [taskError, setTaskError] = useState<string | null>(null)

  useEffect(() => {
    if (stage !== 'failed' || !item.last_task_id) {
      setTaskError(null)
      return
    }
    let cancelled = false
    void getTask(item.last_task_id)
      .then((t) => {
        if (!cancelled) setTaskError(t.error || null)
      })
      .catch(() => {
        if (!cancelled) setTaskError(null)
      })
    return () => {
      cancelled = true
    }
  }, [stage, item.last_task_id])

  const openWorkspace = () => {
    setSelectedId(item.upload_id)
    navigate('/')
  }

  const openReading = () => {
    setSelectedId(item.upload_id)
    navigate(`/read/${item.upload_id}`)
  }

  const canRead =
    Boolean(item.last_task_id) &&
    (stage === 'parsed' || stage === 'completed' || stage === 'failed' || stage === 'translating')

  const canExportMd =
    Boolean(item.last_task_id) &&
    (stage === 'parsed' || stage === 'completed' || stage === 'failed' || stage === 'translating')
  const canExportZh = canExportMd && Boolean(item.has_zh)

  const displayTitle = paperDisplayTitle(item)
  const baseName = (item.filename || 'document').replace(/\.[^.]+$/, '') || 'document'

  const onTranslate = async () => {
    try {
      await translateOneClick(item.upload_id, {
        parse_backend: 'pipeline',
        task_id: item.last_task_id,
      })
    } catch (err) {
      alert(err instanceof Error ? err.message : '翻译启动失败')
    }
  }

  const onDelete = async () => {
    if (!confirm(`删除「${displayTitle}」及其解析结果？`)) return
    try {
      await remove(item.upload_id)
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败')
    }
  }

  const onRetry = async () => {
    if (!item.last_task_id) return
    setRetrying(true)
    try {
      await retryTask(item.last_task_id)
      await refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : '重试失败')
    } finally {
      setRetrying(false)
    }
  }

  const onExportMd = async (source: 'en' | 'zh') => {
    const taskId = item.last_task_id
    if (!taskId) return
    setExporting(true)
    try {
      const text = await fetchArtifactText(taskId, source === 'zh' ? 'zh_markdown' : 'markdown')
      if (!text.trim()) throw new Error(source === 'zh' ? '暂无译文 Markdown' : '暂无原文 Markdown')
      downloadTextFile(`${baseName}${source === 'zh' ? '_zh' : ''}.md`, text)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Markdown 导出失败')
    } finally {
      setExporting(false)
    }
  }

  const onExportPdf = async (source: 'en' | 'zh') => {
    const taskId = item.last_task_id
    if (!taskId) return
    setExporting(true)
    try {
      await exportTaskPdf(taskId, source, `${baseName}${source === 'zh' ? '_zh' : ''}.pdf`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'PDF 导出失败')
    } finally {
      setExporting(false)
    }
  }

  return (
    <li
      role="button"
      tabIndex={0}
      onClick={openWorkspace}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openWorkspace()
        }
      }}
      className={`group grid cursor-pointer grid-cols-[2.5rem_minmax(0,1fr)_5.5rem_auto] items-center gap-x-3 rounded-2xl border bg-white/90 px-4 py-3.5 backdrop-blur-sm transition ${
        selected
          ? 'border-[#c7c9ef] shadow-[0_0_0_1px_rgba(79,70,229,0.12)]'
          : 'border-[#eceef6] hover:-translate-y-0.5 hover:border-[#d4d7f0] hover:shadow-[0_8px_24px_-12px_rgba(79,70,229,0.25)]'
      }`}
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${fileMeta.bg}`}>
        {fileMeta.icon}
      </span>

      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold text-ink" title={displayTitle}>
          {displayTitle}
        </p>
        <p className="mt-0.5 truncate text-[12px] text-[#9aa0b8]">
          {formatBytes(item.size)}
          {item.created_at ? ` · ${formatUploadTime(item.created_at)}` : ''}
        </p>
        {stage === 'failed' && taskError ? (
          <p className="mt-1 truncate text-[11px] text-[#b45309]" title={taskError}>
            {taskError}
          </p>
        ) : null}
      </div>

      <span
        className={`inline-flex h-6 w-full items-center justify-center rounded-md text-[11px] font-semibold ${status.badge}`}
      >
        {status.label}
      </span>

      <div
        className="flex items-center justify-end gap-0.5"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {stage === 'failed' && item.last_task_id ? (
          <ActionBtn
            label={retrying ? '重试中' : '重试'}
            disabled={retrying || busy}
            onClick={() => void onRetry()}
          >
            {retrying ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RotateCcw size={13} />
            )}
          </ActionBtn>
        ) : null}
        <ActionBtn
          label={stage === 'translating' ? '翻译中' : '翻译'}
          title={
            stage === 'unprocessed' ? '未解析时将自动先分析再翻译' : undefined
          }
          disabled={!canTranslate || rowBusy}
          onClick={() => void onTranslate()}
        >
          {stage === 'translating' ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Languages size={13} />
          )}
        </ActionBtn>
        <ActionBtn
          label="阅读"
          title={canRead ? undefined : '请先完成版面分析'}
          disabled={!canRead}
          onClick={openReading}
        >
          <BookOpen size={13} />
        </ActionBtn>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={!canExportMd || exporting || busy}
              title={canExportMd ? undefined : '请先完成版面分析'}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-[#4f46e5] transition hover:bg-[#eef0fb] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              <span>{exporting ? '导出中' : '导出'}</span>
              <ChevronDown size={12} className="opacity-70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[11rem]" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem
              className="gap-2 text-[13px]"
              disabled={exporting}
              onSelect={() => void onExportMd('en')}
            >
              <FileText size={14} className="text-[#4f46e5]" />
              Markdown · 原文
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 text-[13px]"
              disabled={exporting || !canExportZh}
              onSelect={() => void onExportMd('zh')}
            >
              <FileText size={14} className="text-[#7c3aed]" />
              Markdown · 译文
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 text-[13px]"
              disabled={exporting}
              onSelect={() => void onExportPdf('en')}
            >
              <Download size={14} className="text-[#e23f2b]" />
              PDF · 原文
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 text-[13px]"
              disabled={exporting || !canExportZh}
              onSelect={() => void onExportPdf('zh')}
            >
              <Download size={14} className="text-[#ea580c]" />
              PDF · 译文
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          title="删除文件"
          disabled={busy}
          onClick={() => void onDelete()}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#dc2626] transition hover:bg-[#fef2f2] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  )
}

function isReadyStage(item: UploadItem): boolean {
  const s = resolveStage(item)
  return s === 'completed' || s === 'parsed'
}

export default function TasksPage() {
  const { items, loading, error } = useUploads()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<TaskFilter>('all')

  const busyItems = items.filter((i) => isStageBusy(resolveStage(i)))
  const readyItems = items.filter(isReadyStage)
  const visible =
    filter === 'busy' ? busyItems : filter === 'ready' ? readyItems : items

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-[#e8e9f4] bg-[#f8f8fd]">
      <ListPageHero
        title="任务管理"
        action={
          <button
            type="button"
            onClick={() => navigate('/')}
            className="group relative inline-flex shrink-0 items-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-br from-[#4f46e5] to-[#6366f1] px-3.5 py-2 text-[13px] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(79,70,229,0.7)] transition duration-200 hover:-translate-y-0.5 hover:from-[#4338ca] hover:to-[#4f46e5] hover:shadow-[0_12px_26px_-10px_rgba(79,70,229,0.8)] active:translate-y-0"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(255,255,255,0.28),transparent_50%)]"
            />
            <Plus size={15} strokeWidth={2.5} className="relative shrink-0" />
            <span className="relative tracking-wide">新解析</span>
          </button>
        }
      />

      {!loading && items.length > 0 ? (
        <TaskFilterBar
          filter={filter}
          onChange={setFilter}
          counts={{
            all: items.length,
            busy: busyItems.length,
            ready: readyItems.length,
          }}
        />
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {loading && <p className="px-2 text-[15px] text-[#9aa0b8]">加载中…</p>}
        {error && (
          <p className="px-2 text-[15px] text-[#b45309]">
            {error.includes('Failed') || error.includes('fetch')
              ? '无法连接 BFF，请先启动 services/api'
              : error}
          </p>
        )}
        {!loading && !error && items.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center"
          >
            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#eef0fd] to-[#e4e6fb] shadow-sm"
            >
              <LayoutList size={28} className="text-[#4f46e5]" />
            </motion.div>
            <p className="mt-5 text-[16px] font-semibold text-ink">还没有任务</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-[#9aa0b8]">
              上传文档后，解析与翻译进度都会汇总在这里。
            </p>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="mt-5 rounded-xl bg-[#4f46e5] px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-95"
            >
              前往上传
            </button>
          </motion.div>
        )}
        {!loading && items.length > 0 && visible.length === 0 && (
          <p className="px-2 py-10 text-center text-[14px] text-[#9aa0b8]">
            {filter === 'busy' ? '暂无进行中的任务' : filter === 'ready' ? '暂无已就绪任务' : '暂无任务'}
          </p>
        )}
        {!loading && visible.length > 0 && (
          <motion.ul
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.04 } },
            }}
            className="space-y-2.5"
          >
            {visible.map((f) => (
              <motion.div
                key={f.upload_id}
                variants={{
                  hidden: { opacity: 0, y: 8 },
                  show: { opacity: 1, y: 0 },
                }}
              >
                <TaskRow item={f} />
              </motion.div>
            ))}
          </motion.ul>
        )}
      </div>
    </div>
  )
}
