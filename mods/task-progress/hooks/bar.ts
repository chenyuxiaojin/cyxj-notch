import type { Progress } from '../types'

export const BAR_WIDTH = 16

// 把进度切成「已完成」和「未完成」两段格子，分开上色
export const barParts = (p: Progress, width = BAR_WIDTH) => {
  const total = Math.max(1, p.total)
  const done = Math.min(Math.max(0, p.done), total)
  const filled = Math.round((done / total) * width)

  return { filled: '▓'.repeat(filled), empty: '░'.repeat(width - filled) }
}

// Claude 调「报进度」工具时传来的参数，不合格就返回 null
export const toProgress = (input: Record<string, unknown>): Progress | null => {
  const { done, total, now } = input
  const isValid =
    typeof done === 'number' &&
    typeof total === 'number' &&
    Number.isInteger(done) &&
    Number.isInteger(total) &&
    total >= 1 &&
    done >= 0 &&
    done <= total

  if (!isValid) return null

  return { done, total, now: typeof now === 'string' ? now : '' }
}

type Todo = { content: string; status: string; activeForm: string }

// 会话里有自带步骤清单（TodoWrite）时，也把它画成进度条
export const fromTodos = (todos: readonly Todo[]): Progress | null => {
  if (todos.length === 0) return null

  const done = todos.filter(t => t.status === 'completed').length
  const current = todos.find(t => t.status === 'in_progress')

  return { done, total: todos.length, now: current?.activeForm ?? '' }
}
