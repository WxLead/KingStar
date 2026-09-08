import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Loader2, Wrench } from 'lucide-react'
import type { ToolRowState } from './types'

type Props = {
  title: string
  summary: string
  state: ToolRowState
  bodyRaw?: string
  output?: string
  icon?: ReactNode
}

export function ToolDisclosureRow({ title, summary, state, bodyRaw, output, icon }: Props) {
  const [open, setOpen] = useState(false)
  const hasBody = Boolean((bodyRaw && bodyRaw !== '{}') || output)
  const lineSummary = state === 'error' && output ? output.split('\n')[0].slice(0, 120) : summary

  return (
    <div
      className={`group rounded-lg ${state === 'running' ? 'agent-tool-running' : ''} ${
        state === 'error' ? 'bg-[#fff7f7]' : ''
      }`}
    >
      <button
        type="button"
        disabled={!hasBody}
        onClick={() => hasBody && setOpen((v) => !v)}
        className="flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-1.5 text-left text-[13px] text-[#5a6486] transition hover:bg-[#f0f3fa] disabled:cursor-default disabled:hover:bg-transparent"
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[#4176e6]">
          {state === 'running' ? (
            <Loader2 size={14} className="animate-spin text-[#4176e6]" />
          ) : state === 'error' ? (
            <span className="h-2 w-2 rounded-full bg-[#dc2626]" />
          ) : (
            icon || <Wrench size={14} className="opacity-70" />
          )}
        </span>
        <span className="shrink-0 font-medium text-[#3a4568]">{title}</span>
        <span className="h-0.5 w-0.5 shrink-0 rounded-full bg-[#b0b7cc]" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[#7a849f]">{lineSummary}</span>
        {hasBody ? (
          open ? (
            <ChevronDown size={14} className="shrink-0 opacity-50" />
          ) : (
            <ChevronRight size={14} className="shrink-0 opacity-0 transition group-hover:opacity-50" />
          )
        ) : null}
      </button>
      {open && hasBody ? (
        <div className="mb-1 ml-6 space-y-2 border-l border-[#e4e8f0] pl-3 pr-1 pb-2">
          {bodyRaw && bodyRaw !== '{}' ? (
            <div>
              <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#9aa0b8]">
                Input
              </div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#f6f8fc] px-2 py-1.5 font-mono text-[12px] text-[#3a4568]">
                {bodyRaw}
              </pre>
            </div>
          ) : null}
          {output ? (
            <div>
              <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#9aa0b8]">
                Output
              </div>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#f6f8fc] px-2 py-1.5 font-mono text-[12px] text-[#3a4568]">
                {output}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
