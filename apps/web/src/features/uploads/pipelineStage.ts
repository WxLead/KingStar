/** Shared upload pipeline stage helpers for sidebar / tasks page. */

import type { PipelineStage, UploadItem } from '@/services/api'

export function resolveStage(item: UploadItem): PipelineStage {
  if (item.pipeline_stage) return item.pipeline_stage
  const status = item.last_status
  if (status === 'queued' || status === 'parsing') return 'parsing'
  if (status === 'translating') return 'translating'
  if (status === 'failed') return 'failed'
  if (status === 'done') return item.has_zh ? 'completed' : 'parsed'
  return 'unprocessed'
}

export function stageMeta(stage: PipelineStage): { label: string; badge: string } {
  switch (stage) {
    case 'unprocessed':
      return { label: '未处理', badge: 'bg-[#fef2f2] text-[#dc2626]' }
    case 'parsing':
      return { label: '分析中', badge: 'bg-[#eef0fb] text-[#4f46e5]' }
    case 'translating':
      return { label: '翻译中', badge: 'bg-[#eef0fb] text-[#4f46e5]' }
    case 'parsed':
      return { label: '已解析', badge: 'bg-[#eff6ff] text-[#2563eb]' }
    case 'completed':
      return { label: '已完成', badge: 'bg-[#ecfdf5] text-[#059669]' }
    case 'failed':
      return { label: '失败', badge: 'bg-[#fef2f2] text-[#dc2626]' }
  }
}

export function isStageBusy(stage: PipelineStage): boolean {
  return stage === 'parsing' || stage === 'translating'
}
