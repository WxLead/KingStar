import { useState } from 'react'
import { ChevronDown, ChevronUp, ListTodo } from 'lucide-react'
import type { AgentTodoItem } from './types'

function StatusGlyph({ status }: { status: AgentTodoItem['status'] }) {
  if (status === 'completed') {
    return (
      <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden className="text-[#4176e6]">
        <circle cx="7" cy="7" r="6.4" stroke="currentColor" strokeWidth="1.2" />
        <path
          d="M4.2 7.1 6.1 9l3.7-4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (status === 'in_progress') {
    return <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#4176e6] border-t-transparent" />
  }
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden className="text-[#9aa0b8]">
      <circle cx="7" cy="7" r="6.4" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2.4 2.4" />
    </svg>
  )
}

export function TodoDock({ todos }: { todos: AgentTodoItem[] }) {
  const [collapsed, setCollapsed] = useState(true)
  if (!todos.length) return null

  const done = todos.filter((t) => t.status === 'completed').length
  const active = todos.filter((t) => t.status === 'in_progress').length
  const pending = todos.length - done - active
  const parts = [
    done > 0 ? `${done} 完成` : '',
    active > 0 ? `${active} 进行中` : '',
    pending > 0 ? `${pending} 待办` : '',
  ].filter(Boolean)

  return (
    <section className="mb-2 overflow-hidden rounded-xl border border-[#e4e8f0] bg-[#f7f9fd]">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px]"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((v) => !v)}
      >
        <ListTodo size={14} className="text-[#4176e6]" />
        <span className="font-semibold text-[#3a4568]">计划</span>
        <span className="min-w-0 flex-1 truncate text-[#8b91b3]">{parts.join(' · ')}</span>
        {collapsed ? <ChevronDown size={14} className="text-[#9aa0b8]" /> : <ChevronUp size={14} className="text-[#9aa0b8]" />}
      </button>
      {!collapsed ? (
        <ul className="space-y-1.5 border-t border-[#e4e8f0] px-3 py-2">
          {todos.map((t) => (
            <li key={t.id} className="flex items-start gap-2 text-[13px] text-[#3a4568]">
              <span className="mt-0.5 shrink-0">
                <StatusGlyph status={t.status} />
              </span>
              <span className={t.status === 'completed' ? 'text-[#8b91b3] line-through' : ''}>{t.content}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
