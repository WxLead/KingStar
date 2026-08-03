import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

/** StarT UI mode → MinerU API backend */
export type ParseMode = 'pipeline' | 'local' | 'remote'

export type ParseConfigValue = {
  mode: ParseMode
}

export const PARSE_MODE_OPTIONS: {
  mode: ParseMode
  label: string
  backend: string
  recommended?: boolean
  tip: string
}[] = [
  {
    mode: 'pipeline',
    label: 'Pipeline',
    backend: 'pipeline',
    tip: '传统多模型流水线：版面检测 + OCR + 表格/公式。多语言友好，可跑 CPU，速度与显存压力相对可控，适合批量与通用文档。',
  },
  {
    mode: 'local',
    label: '本地推理',
    backend: 'hybrid-engine',
    recommended: true,
    tip: '在本机用 hybrid-engine 混合解析（VLM + OCR/版面）。精度更高，需要本机 GPU 与已下载的模型；默认推荐用于日常论文解析。',
  },
  {
    mode: 'remote',
    label: '远程推理',
    backend: 'hybrid-http-client',
    tip: '本机作为客户端，把重推理交给远程 OpenAI 兼容 VLM 服务（如 mineru-vllm-server）。适合本机无卡、或把算力集中在一台 GPU 服务器上。',
  },
]

export function modeToBackend(mode: ParseMode): string {
  return PARSE_MODE_OPTIONS.find((o) => o.mode === mode)?.backend ?? 'hybrid-engine'
}

function HoverTip({ text, anchor }: { text: string; anchor: DOMRect | null }) {
  if (!anchor) return null
  const style: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(anchor.bottom + 8, window.innerHeight - 160),
    left: Math.min(anchor.left, window.innerWidth - 300),
    width: 280,
    zIndex: 80,
  }
  return createPortal(
    <div
      style={style}
      className="rounded-xl border border-[#e8eaf5] bg-white p-3.5 text-[13px] leading-relaxed text-ink-soft shadow-[0_12px_40px_rgba(30,42,82,0.12)]"
    >
      {text}
    </div>,
    document.body,
  )
}

function ConfigRow({
  label,
  tip,
  children,
}: {
  label: string
  tip?: string
  children: React.ReactNode
}) {
  const [hover, setHover] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const labelRef = useRef<HTMLSpanElement>(null)

  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span
        ref={labelRef}
        className={`shrink-0 text-[14px] text-ink ${tip ? 'cursor-help border-b border-dashed border-[#c5c9dc]' : ''}`}
        onMouseEnter={() => {
          if (!tip) return
          setHover(true)
          setRect(labelRef.current?.getBoundingClientRect() ?? null)
        }}
        onMouseLeave={() => setHover(false)}
      >
        {label}
      </span>
      <div className="min-w-0 flex-1 flex justify-end">{children}</div>
      {hover && tip ? <HoverTip text={tip} anchor={rect} /> : null}
    </div>
  )
}

export default function ParseConfigPanel({
  value,
  onChange,
}: {
  value: ParseConfigValue
  onChange: (next: ParseConfigValue) => void
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [optHover, setOptHover] = useState<ParseMode | null>(null)
  const [optRect, setOptRect] = useState<DOMRect | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const current = PARSE_MODE_OPTIONS.find((o) => o.mode === value.mode) ?? PARSE_MODE_OPTIONS[1]

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className="w-full max-w-md">
      <ConfigRow
        label="文档解析"
        tip="选择 MinerU 版面分析后端。Pipeline / 本地推理 / 远程推理对应不同算力与精度取舍。"
      >
        <div ref={rootRef} className="relative w-[220px]">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-xl bg-[#f3f4f8] px-3 py-2.5 text-left transition hover:bg-[#eceef6]"
          >
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[#4f46e5]">
              {current.label}
            </span>
            {current.recommended && (
              <span className="shrink-0 rounded-md bg-[#7c3aed] px-1.5 py-0.5 text-[11px] font-bold text-white">
                推荐
              </span>
            )}
            <ChevronDown size={16} className="shrink-0 text-[#9aa0b8]" />
          </button>

          {open && (
            <ul
              id={listId}
              role="listbox"
              className="absolute right-0 z-40 mt-1.5 w-full overflow-hidden rounded-xl border border-[#e8eaf5] bg-white py-1 shadow-[0_12px_32px_rgba(30,42,82,0.12)]"
            >
              {PARSE_MODE_OPTIONS.map((opt) => (
                <li key={opt.mode} role="option" aria-selected={opt.mode === value.mode}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-[14px] transition hover:bg-[#f5f6fb] ${
                      opt.mode === value.mode ? 'font-semibold text-[#4f46e5]' : 'text-ink'
                    }`}
                    onMouseEnter={(e) => {
                      setOptHover(opt.mode)
                      setOptRect(e.currentTarget.getBoundingClientRect())
                    }}
                    onMouseLeave={() => setOptHover(null)}
                    onClick={() => {
                      onChange({ ...value, mode: opt.mode })
                      setOpen(false)
                      setOptHover(null)
                    }}
                  >
                    <span className="flex-1">{opt.label}</span>
                    {opt.recommended && (
                      <span className="rounded-md bg-[#7c3aed] px-1.5 py-0.5 text-[11px] font-bold text-white">
                        推荐
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {open && optHover && (
            <HoverTip
              text={PARSE_MODE_OPTIONS.find((o) => o.mode === optHover)?.tip ?? ''}
              anchor={optRect}
            />
          )}
        </div>
      </ConfigRow>

      <ConfigRow label="解析引擎" tip="当前选项映射到的 MinerU backend 标识，提交任务时会传给 mineru-api。">
        <div className="w-[220px] rounded-xl bg-[#f3f4f8] px-3 py-2.5 text-[13px] text-[#6a70a0]">
          {modeToBackend(value.mode)}
        </div>
      </ConfigRow>
    </div>
  )
}
