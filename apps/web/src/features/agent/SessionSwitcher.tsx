import { ChevronDown, MessageSquare, Plus, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { AgentSessionSummary } from '@/services/api'

type Props = {
  sessions: AgentSessionSummary[]
  activeId: string | null
  disabled?: boolean
  onSelect: (sessionId: string) => void
  onNew: () => void
  onDelete: (sessionId: string) => void
}

export function SessionSwitcher({
  sessions,
  activeId,
  disabled,
  onSelect,
  onNew,
  onDelete,
}: Props) {
  const active = sessions.find((s) => s.session_id === activeId)
  const label = active?.title?.trim() || '研究助手'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className="inline-flex max-w-[min(420px,55vw)] items-center gap-1.5 rounded-xl border border-[#e4e8f0] bg-white px-3 py-2 text-left text-[13px] font-semibold text-[#3a4568] transition hover:border-[#c7d2fe] hover:text-[#4176e6] disabled:opacity-40"
          title={label}
        >
          <MessageSquare size={14} className="shrink-0 text-[#4176e6]" />
          <span className="min-w-0 truncate">{label}</span>
          <ChevronDown size={14} className="shrink-0 text-[#9aa0b8]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-[11px] font-bold uppercase tracking-wide text-[#8b91b3]">
          会话
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
                    <span className="block truncate">{s.title?.trim() || '研究助手'}</span>
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
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 text-[#4176e6] focus:text-[#4176e6]"
          onSelect={() => onNew()}
        >
          <Plus size={14} />
          新会话
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
