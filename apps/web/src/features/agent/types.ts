/** Agent transcript node model (dsh-inspired: messages + tool rows + process fold). */

export type ToolRowState = 'running' | 'ok' | 'error'

export type TodoStatus = 'pending' | 'in_progress' | 'completed'

export type AgentTodoItem = {
  id: string
  content: string
  status: TodoStatus
}

export type AgentChatNode =
  | {
      kind: 'user'
      id: string
      text: string
      turnId?: string
    }
  | {
      kind: 'assistant'
      id: string
      text: string
      streaming?: boolean
      turnId?: string
      step?: number
    }
  | {
      kind: 'tool'
      id: string
      tool: string
      title: string
      summary: string
      arguments: Record<string, unknown>
      resultText?: string
      state: ToolRowState
      turnId?: string
      toolCallId?: string
    }
  | {
      kind: 'progress'
      id: string
      title: string
      message: string
      turnId?: string
    }
  | {
      kind: 'error'
      id: string
      message: string
      turnId?: string
    }
  | {
      kind: 'confirm'
      id: string
      message: string
      confirmId: string
      tool?: string
      turnId?: string
    }
  | {
      kind: 'turn_end'
      id: string
      status: string
      turnId?: string
    }

export type AgentTurnGroup = {
  turnId: string
  nodes: AgentChatNode[]
  settled: boolean
}
