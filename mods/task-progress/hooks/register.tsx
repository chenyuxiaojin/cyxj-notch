import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Progress } from '../types'

import { barParts, fromTodos, toProgress } from './bar'

const progress = atom({ plugin: 'task-progress', key: 'progress' } as const, null)
const TOOL = 'mcp__task-progress__progress'

// ── 可配置项 ──
// 刘海台读这里：~/.claude/notch/sessions/<对话id>.progress.json，每个对话一份
const feedDir = async ($: EngineInterface) => `${(await $.env.get('HOME')) ?? ''}/.claude/notch/sessions`

// 改进度条，同时把新值写给刘海台
const save = async ($: EngineInterface, fn: (p: Progress | null) => Progress | null) => {
  let value: Progress | null = null
  await update($, progress, p => (value = fn(p)))

  const id = await $.session.id()
  const at = await $.clock.now()
  void $.fs.write(`${await feedDir($)}/${id}.progress.json`, JSON.stringify({ id, at, progress: value })).catch(() => undefined)
}


const DESCRIPTION = [
  '在用户界面输入框上方显示任务进度条，让用户一眼看到你做到第几步。',
  '接到需要 3 步及以上的任务时：开始前先调用一次（done=0，total=总步数，now=第一步做什么）；',
  '之后每完成一步调用一次，更新 done 和 now；全部做完时 done 等于 total。',
  '中途步数有变化就直接改 total。now 用 10 个字以内的中文短语。',
].join('')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'progress',
      description: DESCRIPTION,
      inputSchema: {
        type: 'object',
        properties: {
          done: { type: 'integer', minimum: 0, description: '已完成几步' },
          total: { type: 'integer', minimum: 1, description: '一共几步' },
          now: { type: 'string', description: '正在做的这一步，10 字以内' },
        },
        required: ['done', 'total', 'now'],
      },
    })

    return next(e)
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const p = toProgress(e as unknown as Record<string, unknown>)

    if (p === null) {
      return { deny: 'done 和 total 要是整数，total ≥ 1，且 0 ≤ done ≤ total' }
    }

    const failed = await save($, () => p)
      .then(() => undefined)
      .catch((error: unknown) => String(error))

    return {
      result: failed === undefined ? `进度条已更新：${p.done}/${p.total}` : `进度条没更新：${failed}`,
    }
  })

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    await save($, () => fromTodos(e.todos)).catch(() => undefined)

    return ran
  })

  // 上一件活已经做完，用户发新消息时把进度条收起来；没做完的留着
  on('prompt.submit', async ($, e, next) => {
    const finished = (p: Progress | null) => (p !== null && p.done >= p.total ? null : p)
    await save($, finished).catch(() => undefined)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const p = await read($, progress)

    if (p === null || e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const { filled, empty } = barParts(p)
    const isDone = p.done >= p.total

    return (
      <Box>
        <Text color="claude">{filled}</Text>
        <Text dimColor>{empty}</Text>
        <Text>{`  ${p.done}/${p.total}  `}</Text>
        <Text dimColor wrap="truncate-end">
          {isDone ? '✓ 完成' : `正在：${p.now}`}
        </Text>
      </Box>
    )
  })
}
