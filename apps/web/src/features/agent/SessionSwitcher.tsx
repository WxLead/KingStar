import { ChevronDown, MessageSquare, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { AgentSessionSummary } from '@/services/api'

const UNTITLED = '新对话'

type Props = {
  sessions: AgentSessionSummary[]
  activeId: string | null
  disabled?: boolean
  onSelect: (sessionId: string) => void
  onDelete: (sessionId: string) => void
}

function sessionLabel(title: string | null | undefined): string {
  return title?.trim() || UNTITLED
}

export function SessionSwitcher({
  sessions,
  activeId,
  disabled,
  onSelect,
  onDelete,
}: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#e4e6f0] bg-white px-3 py-2 text-[13px] font-semibold text-[#6a70a0] transition hover:border-[#c7d2fe] hover:text-[#4176e6] disabled:opacity-40"
          title="会话历史"
        >
          <MessageSquare size={14} className="shrink-0" />
          <span>会话历史</span>
          <ChevronDown size={14} className="shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-[11px] font-bold uppercase tracking-wide text-[#8b91b3]">
          会话历史
        </DropdownMenuLabel>
        <div className="max-h-64 overflow-y-auto py-1">
          {sessions.length === 0 ? (
            <p className="px-2 py-3 text-[12px] text-[#9aa0b8]">暂无会话</p>
          ) : (
            sessions.map((s) => {
              const activeRow = s.session_id === activeId
              return (
                <div
                  key={s.session_id}
                  className={`group flex items-center gap-0.5 rounded-md px-1 ${
                    activeRow ? 'bg-[#e8f0ff]' : 'hover:bg-[#f5f7fb]'
                  }`}
                >
                  <button
                    type="button"
                    className={`min-w-0 flex-1 truncate px-2 py-2 text-left text-[13px] ${
                      activeRow ? 'font-semibold text-[#4176e6]' : 'text-[#3a4568]'
                    }`}
                    onClick={() => onSelect(s.session_id)}
                  >
                    <span className="block truncate">{sessionLabel(s.title)}</span>
                    <span className="block text-[10px] font-normal text-[#9aa0b8]">
                      {s.session_id.slice(0, 8)}…
                    </span>
                  </button>
                  <button
                    type="button"
                    title="删除会话"
                    className="mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#9aa0b8] opacity-0 transition hover:bg-[#fee2e2] hover:text-[#dc2626] group-hover:opacity-100 focus:opacity-100"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onDelete(s.session_id)
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
