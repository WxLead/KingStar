/** Derive one-line tool summaries (dsh ToolRow collapsed line). */

const SHORT: Record<string, string> = {
  health_check: '健康检查',
  library_search: '检索文献',
  library_get: '文献详情',
  library_update: '更新元数据',
  upload_from_url: '入库',
  parse_document: '版面解析',
  translate_document: '翻译',
  get_task_status: '任务状态',
  get_paper_text: '读取正文',
  export_citation: '导出引用',
  todo_write: '更新计划',
  web_search: '网页搜索',
  web_fetch: '抓取网页',
}

export function displayToolName(raw: string): string {
  const name = (raw || '').replace(/^mcp__start__/, '').replace(/^mcp__[^_]+__/, '')
  if (SHORT[name]) return SHORT[name]
  if (name.includes('todo')) return '更新计划'
  if (name.includes('web_search') || name.includes('search')) return '搜索'
  if (name.includes('web_fetch') || name.includes('fetch')) return '抓取'
  if (name.includes('bash') || name.includes('shell')) return '终端'
  if (name.includes('read')) return '读取'
  if (name.includes('write') || name.includes('edit')) return '编辑'
  return name || '工具'
}

export function summarizeToolArgs(tool: string, args: Record<string, unknown>): string {
  const name = (tool || '').replace(/^mcp__start__/, '')
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = args[k]
      if (v != null && String(v).trim()) return String(v).trim()
    }
    return ''
  }

  if (name.includes('library_search') || name === 'web_search') {
    return pick('query', 'q', 'search') || '列出最近文献'
  }
  if (name.includes('upload_from_url') || name.includes('web_fetch')) {
    return pick('url', 'uri').slice(0, 72)
  }
  if (name.includes('parse_document') || name.includes('translate') || name.includes('library_get') || name.includes('library_update') || name.includes('get_paper') || name.includes('export')) {
    return (
      pick('upload_id', 'task_id', 'path', 'file', 'doi', 'arxiv_id', 'venue', 'title') || '…'
    )
  }
  if (name.includes('todo')) {
    const todos = args.todos
    if (Array.isArray(todos)) {
      const active = todos.find(
        (t) => t && typeof t === 'object' && (t as { status?: string }).status === 'in_progress',
      ) as { content?: string } | undefined
      const done = todos.filter(
        (t) => t && typeof t === 'object' && (t as { status?: string }).status === 'completed',
      ).length
      const head = active?.content || (todos[0] as { content?: string } | undefined)?.content || ''
      return `${done}/${todos.length}${head ? ` · ${String(head).slice(0, 40)}` : ''}`
    }
  }
  const first = Object.values(args).find((v) => typeof v === 'string' && v.trim())
  if (typeof first === 'string') return first.slice(0, 72)
  try {
    const s = JSON.stringify(args)
    return s === '{}' ? '' : s.slice(0, 72)
  } catch {
    return ''
  }
}

export function formatToolResult(result: unknown): string {
  if (result == null) return ''
  if (typeof result === 'string') return result.slice(0, 6000)
  try {
    return JSON.stringify(result, null, 2).slice(0, 6000)
  } catch {
    return String(result)
  }
}
