import type { AgentChatNode, AgentTodoItem, TodoStatus } from './types'

function asStatus(v: unknown): TodoStatus {
  if (v === 'completed' || v === 'in_progress' || v === 'pending') return v
  return 'pending'
}

/** Project latest todo list from tool call args / results (todo_write style). */
export function extractTodosFromArgs(args: Record<string, unknown>): AgentTodoItem[] | null {
  const todos = args.todos ?? args.items
  if (!Array.isArray(todos) || todos.length === 0) return null
  const out: AgentTodoItem[] = []
  todos.forEach((t, i) => {
    if (!t || typeof t !== 'object') return
    const row = t as Record<string, unknown>
    const content = String(row.content ?? row.title ?? row.text ?? '').trim()
    if (!content) return
    out.push({
      id: String(row.id ?? `todo-${i}`),
      content,
      status: asStatus(row.status),
    })
  })
  return out.length ? out : null
}

export function projectTodosFromNodes(nodes: AgentChatNode[]): AgentTodoItem[] {
  let latest: AgentTodoItem[] = []
  for (const n of nodes) {
    if (n.kind !== 'tool') continue
    const name = n.tool.toLowerCase()
    if (!name.includes('todo')) continue
    const fromArgs = extractTodosFromArgs(n.arguments)
    if (fromArgs) latest = fromArgs
    if (n.resultText) {
      try {
        const parsed = JSON.parse(n.resultText) as Record<string, unknown>
        const nested = extractTodosFromArgs(parsed) || extractTodosFromArgs({ todos: parsed.todos })
        if (nested) latest = nested
      } catch {
        /* ignore */
      }
    }
  }
  return latest
}
