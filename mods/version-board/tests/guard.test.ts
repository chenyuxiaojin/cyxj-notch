import type { On } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

const PAD = '/private/tmp/claude-501/-Users-me-projects-demo/abc/scratchpad'
const LAUNCH3 = `SP=${PAD}/s7; for i in 1 2 3; do (cd $SP/v$i && nohup pnpm exec remotion studio --port 305$i --no-open &); done`

// 假装已经开着两个版本 Studio：3041、3042
const world = (on: On) => {
  on('process.run', (_$, e) => {
    const argv = e.argv.join(' ')
    const stdout = argv.includes('-sTCP:LISTEN')
      ? 'p101\nn*:3041\np102\nn*:3042'
      : argv.startsWith('ps ')
        ? '  101 05:00 node remotion studio --port 3041\n  102 05:00 node remotion studio --port 3042'
        : `p101\nfcwd\nn${PAD}/s6-high\np102\nfcwd\nn${PAD}/s6-xhigh`

    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('fs.list', () => ({ value: [] }))
  on('clock.now', () => ({ value: 0 }))
}

describe('一次最多 3 版', () => {
  test('已开 2 个再开 3 个：拦下，命令没跑', async ($, on) => {
    let didRun = false
    world(on)
    on('tool.call', () => {
      didRun = true
      return { result: 'ok', text: 'ok' }
    })

    const ran = await $.tool.call({ tool: 'Bash', command: LAUNCH3 })

    expect(didRun).toBe(false)
    expect(JSON.stringify(ran).includes('超过一次最多 3 版')).toBe(true)
  })

  test('已开 2 个再开 1 个：放行', async ($, on) => {
    let didRun = false
    world(on)
    on('tool.call', () => {
      didRun = true
      return { result: 'ok', text: 'ok' }
    })

    await $.tool.call({ tool: 'Bash', command: `cd ${PAD}/s7-high && pnpm exec remotion studio --port 3043` })

    expect(didRun).toBe(true)
  })
})
