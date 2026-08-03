import { useEffect, useState } from 'react'
import { listTasks, type TaskSummary } from '@/services/api'

export default function TasksPage() {
  const [items, setItems] = useState<TaskSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await listTasks()
        if (!cancelled) setItems(data.items)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex flex-col overflow-hidden rounded-3xl border border-[#e8e9f4] bg-[#f8f8fd] p-8">
      <h1 className="font-display text-[28px] text-ink">任务管理</h1>
      <p className="mt-2 text-[15px] text-ink-soft">查看解析与翻译任务状态</p>

      {loading && <p className="mt-8 text-[15px] text-[#9aa0b8]">加载中…</p>}
      {error && (
        <p className="mt-8 text-[15px] text-[#b45309]">
          无法连接 BFF（{error}）。请先启动 services/api。
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="mt-8 text-[15px] text-[#9aa0b8]">暂无任务。在「新解析」上传文档后会出现在这里。</p>
      )}
      {!loading && items.length > 0 && (
        <ul className="mt-6 space-y-2 overflow-y-auto">
          {items.map((t) => (
            <li
              key={t.task_id}
              className="flex items-center justify-between rounded-xl border border-[#eceef6] bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-[16px] font-semibold text-ink">{t.filename}</p>
                <p className="mt-0.5 text-[13px] text-[#9aa0b8]">{t.task_id}</p>
              </div>
              <span className="shrink-0 rounded-full bg-[#eef0fb] px-3 py-1 text-[13px] font-bold text-[#4f46e5]">
                {t.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
