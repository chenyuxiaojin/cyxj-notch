import type { EngineInterface, Register } from 'claude-code'

import { parseLog } from './parse'

// ── 可配置项 ──
// 环境变量 NOTCH_TODO_LOG：待办 log 文件的绝对路径（含「## 当前在忙」「## 已发布待收尾」两节，格式见 parse.ts）；没设就不写 todo.json
const logPath = ($: EngineInterface) => $.env.get('NOTCH_TODO_LOG')
// 刘海台读这里：~/.claude/notch/todo.json
const feedPath = async ($: EngineInterface) => `${(await $.env.get('HOME')) ?? ''}/.claude/notch/todo.json`
// 多久刷新一次
const REFRESH_MS = 5 * 60 * 1000
const PANE = 'todo'
const COMMAND = 'daiban'

const feed = async ($: EngineInterface) => {
  const log = await logPath($)
  if (!log) return
  const text = await $.fs.read(log)
  await $.fs.write(await feedPath($), JSON.stringify({ at: await $.clock.now(), ...parseLog(text) }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: '侧边面板：待办 log 的当前在忙 + 已发布待收尾',
    })
    void feed($).catch(() => undefined)
    $.clock.every(REFRESH_MS, () => feed($).catch(() => undefined))

    return next(e)
  })

  // 每轮结束顺手刷新一次，刚改完 log 刘海台也能马上看到
  on('turn.complete', async ($, e, next) => {
    void feed($).catch(() => undefined)

    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    const failed = await $.ui
      .open({ id: PANE, title: '待办' })
      .then(() => undefined)
      .catch((error: unknown) => String(error))

    return { text: failed === undefined ? '待办面板已打开。' : `待办面板没打开：${failed}` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const log = await logPath($)

    if (!log) {
      return <Text color="yellow">没设待办 log：在 ~/.claude/settings.json 的 env 里加 NOTCH_TODO_LOG=待办文件的绝对路径</Text>
    }

    const text = await $.fs.read(log).catch(() => undefined)

    if (text === undefined) {
      return <Text color="red">读不到 {log}</Text>
    }

    const { busy, wrapUp } = parseLog(text)

    return (
      <Box flexDirection="column">
        <Text bold>当前在忙 · {busy.length}</Text>
        {busy.map(item => (
          <Box key={`busy-${item.title}`} flexDirection="column" marginBottom={1}>
            <Text>• {item.title}</Text>
            {item.next && <Text dimColor>  {item.next}</Text>}
          </Box>
        ))}
        <Text bold>已发布待收尾 · {wrapUp.length}</Text>
        {wrapUp.map(item => (
          <Box key={`wrap-${item.title}`} flexDirection="column" marginBottom={1}>
            <Text>• {item.title}</Text>
            {item.next && <Text dimColor>  {item.next}</Text>}
          </Box>
        ))}
        <Button key="refresh" label="刷新" onPress={() => $.ui.invalidate('ui.render')} />
      </Box>
    )
  })
}
