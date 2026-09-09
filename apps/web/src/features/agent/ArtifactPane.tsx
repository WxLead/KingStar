import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Globe2,
  PanelRightClose,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'
import { AgentMarkdown } from './AgentMarkdown'
import { CopyTextButton } from './CopyTextButton'
import { MessageIconButton } from './MessageIconButton'
import type { AgentArtifact } from '@/services/api'
import { cn } from '@/lib/utils'

type KindFilter = 'all' | 'report' | 'web' | 'file' | 'archived'

type Props = {
  artifacts: AgentArtifact[]
  activeId: string | null
  onSelect: (id: string) => void
  onHide: () => void
  onRename: (id: string, title: string) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
  onSetStatus: (id: string, status: string) => void | Promise<void>
  className?: string
  overlay?: boolean
}

function kindLabel(kind: string) {
  if (kind === 'web') return '网页'
  if (kind === 'file') return '文件'
  return '报告'
}

function statusLabel(status: string) {
  if (status === 'drafting') return '生成中'
  if (status === 'ready') return '已完成'
  if (status === 'archived') return '已归档'
  if (status === 'error') return '失败'
  return status
}

function downloadArtifact(art: AgentArtifact) {
  const body = art.content || ''
  const safe = (art.title || art.kind || 'artifact').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80)
  const ext = art.kind === 'web' ? 'txt' : 'md'
  const blob = new Blob([body], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safe}.${ext}`
  a.click()
  URL.revokeObjectURL(url)
}

export function ArtifactPane({
  artifacts,
  activeId,
  onSelect,
  onHide,
  onRename,
  onDelete,
  onSetStatus,
  className,
  overlay,
}: Props) {
  const [filter, setFilter] = useState<KindFilter>('all')
  /** Default: list. Preview only after eye click / double-click. */
  const [view, setView] = useState<'list' | 'preview'>('list')
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [webExpanded, setWebExpanded] = useState(false)

  const visible = useMemo(() => {
    return artifacts.filter((a) => {
      if (filter === 'archived') return a.status === 'archived'
      if (a.status === 'archived' && filter !== 'archived') return false
      if (filter === 'all') return true
      return a.kind === filter
    })
  }, [artifacts, filter])

  const previewing = useMemo(() => {
    const id = previewId || activeId
    return visible.find((a) => a.artifact_id === id) ?? artifacts.find((a) => a.artifact_id === id) ?? null
  }, [visible, artifacts, previewId, activeId])

  useEffect(() => {
    setWebExpanded(false)
  }, [previewing?.artifact_id])

  // If the previewed item was deleted, return to list.
  useEffect(() => {
    if (view === 'preview' && previewId && !artifacts.some((a) => a.artifact_id === previewId)) {
      setView('list')
      setPreviewId(null)
    }
  }, [artifacts, previewId, view])

  const openPreview = (id: string) => {
    onSelect(id)
    setPreviewId(id)
    setView('preview')
  }

  const backToList = () => {
    setView('list')
    setRenamingId(null)
  }

  const startRename = (art: AgentArtifact) => {
    setRenamingId(art.artifact_id)
    setRenameDraft(art.title || '')
  }

  const commitRename = async () => {
    if (!renamingId) return
    const title = renameDraft.trim()
    setBusyId(renamingId)
    try {
      if (title) await onRename(renamingId, title)
    } finally {
      setBusyId(null)
      setRenamingId(null)
    }
  }

  if (artifacts.length === 0) return null

  return (
    <aside
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#e4e8f0] bg-white/95 shadow-sm',
        overlay && 'absolute inset-y-0 right-0 z-20 w-[min(100%,420px)] shadow-xl',
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-[#eceef6] px-3 py-2.5">
        {view === 'preview' ? (
          <button
            type="button"
            title="返回列表"
            onClick={backToList}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#6a70a0] transition hover:bg-[#f3f4fb] hover:text-ink"
          >
            <ArrowLeft size={16} />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold tracking-wide text-[#9aa0b8]">本会话产物</p>
          <h2 className="truncate text-[14px] font-semibold text-ink">
            {view === 'preview'
              ? previewing?.title || '预览'
              : `列表 · ${visible.length}/${artifacts.length}`}
          </h2>
        </div>
        <button
          type="button"
          title="隐藏产物台"
          onClick={onHide}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#6a70a0] transition hover:bg-[#f3f4fb] hover:text-ink"
        >
          <PanelRightClose size={16} />
        </button>
      </div>

      {view === 'list' ? (
        <>
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[#f0f1f7] px-2 py-2 [scrollbar-width:none]">
            {(
              [
                ['all', '全部'],
                ['report', '报告'],
                ['web', '网页'],
                ['archived', '归档'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={cn(
                  'shrink-0 rounded-lg px-2 py-1 text-[12px] font-semibold transition',
                  filter === id
                    ? 'bg-[#eef0fb] text-[#4f46e5]'
                    : 'text-[#6a70a0] hover:bg-[#f5f6fb]',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {visible.length === 0 ? (
              <p className="px-2 py-8 text-center text-[13px] text-[#9aa0b8]">此分类下暂无产物</p>
            ) : (
              <ul className="space-y-1">
                {visible.map((a) => {
                  const Icon = a.kind === 'web' ? Globe2 : FileText
                  const renaming = renamingId === a.artifact_id
                  const highlighted = a.artifact_id === activeId
                  return (
                    <li
                      key={a.artifact_id}
                      onClick={() => {
                        if (renaming) return
                        openPreview(a.artifact_id)
                      }}
                      className={cn(
                        'cursor-pointer rounded-xl border px-2.5 py-2 transition',
                        highlighted
                          ? 'border-[#c7d2fe] bg-[#f5f7ff]'
                          : 'border-transparent hover:bg-[#f7f8fc]',
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 shrink-0 text-[#4f46e5]">
                          <Icon size={14} />
                        </span>
                        <div className="min-w-0 flex-1">
                          {renaming ? (
                            <input
                              value={renameDraft}
                              autoFocus
                              disabled={busyId === a.artifact_id}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  void commitRename()
                                }
                                if (e.key === 'Escape') setRenamingId(null)
                              }}
                              onBlur={() => void commitRename()}
                              onClick={(e) => e.stopPropagation()}
                              className="h-8 w-full rounded-lg border border-[#c7d2fe] bg-white px-2 text-[13px] text-ink outline-none"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                openPreview(a.artifact_id)
                              }}
                              className="block w-full truncate text-left text-[13px] font-semibold text-ink"
                            >
                              {a.title || kindLabel(a.kind)}
                            </button>
                          )}
                          <p className="mt-0.5 text-[11px] text-[#9aa0b8]">
                            {kindLabel(a.kind)} · {statusLabel(a.status)} ·{' '}
                            {(a.content || '').length} 字
                          </p>
                        </div>
                        <MessageIconButton
                          title="预览"
                          onClick={() => openPreview(a.artifact_id)}
                        >
                          <Eye size={14} />
                        </MessageIconButton>
                      </div>
                      <div
                        className="mt-1.5 flex flex-wrap items-center justify-end gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MessageIconButton title="重命名" onClick={() => startRename(a)}>
                          <Pencil size={13} />
                        </MessageIconButton>
                        {a.content?.trim() ? (
                          <MessageIconButton title="下载" onClick={() => downloadArtifact(a)}>
                            <Download size={13} />
                          </MessageIconButton>
                        ) : null}
                        {a.status === 'drafting' ? (
                          <MessageIconButton
                            title="标为完成"
                            disabled={busyId === a.artifact_id}
                            onClick={() => {
                              setBusyId(a.artifact_id)
                              void Promise.resolve(onSetStatus(a.artifact_id, 'ready')).finally(() =>
                                setBusyId(null),
                              )
                            }}
                          >
                            <CheckCircle2 size={13} />
                          </MessageIconButton>
                        ) : null}
                        {a.status !== 'archived' ? (
                          <MessageIconButton
                            title="归档"
                            disabled={busyId === a.artifact_id}
                            onClick={() => {
                              setBusyId(a.artifact_id)
                              void Promise.resolve(onSetStatus(a.artifact_id, 'archived')).finally(
                                () => setBusyId(null),
                              )
                            }}
                          >
                            <Archive size={13} />
                          </MessageIconButton>
                        ) : (
                          <MessageIconButton
                            title="取消归档"
                            disabled={busyId === a.artifact_id}
                            onClick={() => {
                              setBusyId(a.artifact_id)
                              void Promise.resolve(onSetStatus(a.artifact_id, 'ready')).finally(() =>
                                setBusyId(null),
                              )
                            }}
                          >
                            <CheckCircle2 size={13} />
                          </MessageIconButton>
                        )}
                        <MessageIconButton
                          title="删除"
                          disabled={busyId === a.artifact_id}
                          onClick={() => {
                            setBusyId(a.artifact_id)
                            void Promise.resolve(onDelete(a.artifact_id)).finally(() =>
                              setBusyId(null),
                            )
                          }}
                        >
                          <Trash2 size={13} />
                        </MessageIconButton>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      ) : previewing ? (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {previewing.kind === 'web' ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-[#eef0fb] px-1.5 py-0.5 text-[11px] font-semibold text-[#4f46e5]">
                    网页
                  </span>
                  <span className="text-[11px] text-[#9aa0b8]">
                    {statusLabel(previewing.status)}
                  </span>
                </div>
                {previewing.uri ? (
                  <a
                    href={previewing.uri}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#4176e6] hover:underline"
                  >
                    <ExternalLink size={14} />
                    <span className="break-all">{previewing.uri}</span>
                  </a>
                ) : null}
                <pre
                  className={cn(
                    'whitespace-pre-wrap break-words rounded-xl border border-[#eef0f6] bg-[#fafbff] px-3 py-2.5 text-[13px] leading-relaxed text-[#2f3358]',
                    !webExpanded && 'line-clamp-[18]',
                  )}
                >
                  {(previewing.content || '').trim() || '（无正文摘录）'}
                </pre>
                {(previewing.content || '').length > 600 ? (
                  <button
                    type="button"
                    onClick={() => setWebExpanded((v) => !v)}
                    className="text-[12px] font-semibold text-[#6a70a0] hover:text-[#4f46e5]"
                  >
                    {webExpanded ? '收起' : '展开全文摘录'}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="select-text">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-[#eef0fb] px-1.5 py-0.5 text-[11px] font-semibold text-[#4f46e5]">
                    报告
                  </span>
                  <span className="text-[11px] text-[#9aa0b8]">
                    {statusLabel(previewing.status)}
                  </span>
                </div>
                <AgentMarkdown
                  text={previewing.content || ''}
                  streaming={previewing.status === 'drafting'}
                />
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[#eceef6] bg-[#fafbff] px-3 py-2">
            <button
              type="button"
              onClick={backToList}
              className="text-[12px] font-semibold text-[#6a70a0] hover:text-[#4f46e5]"
            >
              返回列表
            </button>
            <div className="flex items-center gap-0.5">
              {previewing.content?.trim() ? (
                <>
                  <CopyTextButton text={previewing.content} />
                  <MessageIconButton title="下载" onClick={() => downloadArtifact(previewing)}>
                    <Download size={14} />
                  </MessageIconButton>
                </>
              ) : (
                <span
                  className="inline-flex h-7 w-7 items-center justify-center text-[#c7c9ef]"
                  title="暂无可复制内容"
                >
                  <Copy size={14} />
                </span>
              )}
            </div>
          </div>
        </>
      ) : (
        <p className="px-4 py-10 text-center text-[13px] text-[#9aa0b8]">未找到可预览的产物</p>
      )}
    </aside>
  )
}

/** Compact control to reopen a hidden pane. */
export function ArtifactPaneToggle({
  count,
  onOpen,
}: {
  count: number
  onOpen: () => void
}) {
  if (count <= 0) return null
  return (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex items-center gap-1.5 rounded-xl border border-[#e4e6f0] bg-white px-3 py-2 text-[13px] font-semibold text-[#6a70a0] transition hover:border-[#c7d2fe] hover:text-[#4176e6]"
    >
      <FileText size={14} />
      产物
      <span className="rounded-md bg-[#eef0fb] px-1.5 py-0.5 text-[11px] tabular-nums text-[#4f46e5]">
        {count}
      </span>
    </button>
  )
}

/** Mobile drawer chrome close affordance (optional). */
export function ArtifactDrawerScrim({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      aria-label="关闭产物台"
      onClick={onClose}
      className="absolute inset-0 z-10 bg-[#1e2a52]/25 backdrop-blur-[1px] md:hidden"
    >
      <X className="sr-only" />
    </button>
  )
}
