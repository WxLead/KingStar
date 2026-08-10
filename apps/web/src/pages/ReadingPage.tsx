import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useUploads } from '@/features/uploads/UploadsContext'
import ReadingRoom from '@/features/reading/ReadingRoom'
import { touchRecentRead } from '@/features/reading/readingRecent'

export default function ReadingPage() {
  const { uploadId } = useParams<{ uploadId: string }>()
  const navigate = useNavigate()
  const { items, loading, selectedId, setSelectedId } = useUploads()

  const item = items.find((u) => u.upload_id === uploadId) ?? null

  useEffect(() => {
    if (uploadId && selectedId !== uploadId) {
      setSelectedId(uploadId)
    }
  }, [uploadId, selectedId, setSelectedId])

  useEffect(() => {
    if (item?.upload_id) touchRecentRead(item.upload_id)
  }, [item?.upload_id])

  if (loading && !item) {
    return (
      <div className="flex items-center justify-center rounded-3xl border border-[#e8e9f4] bg-[#f8f8fd] p-12 text-[15px] text-[#9aa0b8]">
        加载文献…
      </div>
    )
  }

  if (!uploadId || !item) {
    return (
      <div className="flex flex-col items-start justify-center gap-3 overflow-hidden rounded-3xl border border-[#e8e9f4] bg-[#f8f8fd] p-8">
        <h1 className="font-display text-[28px] text-ink">阅读室</h1>
        <p className="text-[15px] text-ink-soft">未找到该文献，可能已被删除。</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate('/library')}
            className="rounded-xl bg-[#4f46e5] px-4 py-2 text-[13px] font-semibold text-white"
          >
            回文献
          </button>
          <Link to="/" className="rounded-xl border border-[#e4e6f0] bg-white px-4 py-2 text-[13px] font-semibold text-ink-soft">
            工作区
          </Link>
        </div>
      </div>
    )
  }

  return <ReadingRoom item={item} />
}
