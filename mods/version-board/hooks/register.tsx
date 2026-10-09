import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import {
  MAX_VERSIONS,
  buildBoard,
  effortText,
  finishedSince,
  liveVersions,
  parseLsof,
  parsePs,
  portsOf,
  projectDirOf,
  stateText,
  usedFromTranscript,
  versionLaunches,
} from './scan'
import type { Board, Row } from '../types'

// ── 可配置项 ──
// Claude Code 存对话记录的地方：~/.claude/projects（用来核实每个版本实际用的档位）
const projectsDir = async ($: EngineInterface) => `${(await $.env.get('HOME')) ?? ''}/.claude/projects`
// 刘海台读这里：~/.claude/notch/versions.json
const feedPath = async ($: EngineInterface) => `${(await $.env.get('HOME')) ?? ''}/.claude/notch/versions.json`
// 多久扫描一次
const REFRESH_MS = 8000
const PANE = 'versions'
const COMMAND = 'banben'

const board = atom({ plugin: 'version-board', key: 'board' } as const, { rows: [], at: 0 })

// 跑完的版本档位从它自己的 transcript 里核实；同一份 transcript 只读一次
const usedCache = new Map<string, { effort?: string; model?: string }>()

const usedOf = async ($: EngineInterface, cwd: string) => {
  const dir = `${await projectsDir($)}/${projectDirOf(cwd)}`
  const files = (await $.fs.list(dir).catch(() => [])).filter(f => f.kind === 'file' && f.name.endsWith('.jsonl'))
  const newest = [...files].sort((a, b) => b.mtimeMs - a.mtimeMs)[0]
  if (newest === undefined) return {}

  const key = `${dir}/${newest.name}:${newest.mtimeMs}`
  const hit = usedCache.get(key)
  if (hit) return hit

  const { stdout } = await $.process.run(['tail', '-c', '300000', `${dir}/${newest.name}`])
  const used = usedFromTranscript(stdout)
  usedCache.set(key, used)

  return used
}

const scan = async ($: EngineInterface): Promise<Board> => {
  const listen = await $.process.run(['lsof', '-nP', '-iTCP', '-sTCP:LISTEN', '-a', '-c', 'node', '-Fpn'])
  const ports = portsOf(parseLsof(listen.stdout))
  const ps = parsePs((await $.process.run(['ps', '-ax', '-o', 'pid=,etime=,command='])).stdout)
  const pids = [...new Set([...ports.keys(), ...ps.runs.map(run => run.pid)])]
  const cwds = new Map<number, string>()

  if (pids.length > 0) {
    const out = await $.process.run(['lsof', '-a', '-p', pids.join(','), '-d', 'cwd', '-Fpn'])
    for (const [pid, names] of parseLsof(out.stdout)) {
      if (names[0] !== undefined) cwds.set(pid, names[0])
    }
  }

  const used = new Map<string, { effort?: string; model?: string }>()
  for (const pid of ports.keys()) {
    const cwd = cwds.get(pid)
    if (cwd !== undefined && !used.has(cwd)) used.set(cwd, await usedOf($, cwd).catch(() => ({})))
  }

  return buildBoard({ ports, cwds, ps, used, now: await $.clock.now() })
}

const sameRows = (a: Board, b: Board) => JSON.stringify(a.rows) === JSON.stringify(b.rows)

const doneToast = (row: Row) =>
  `${row.label}（${effortText(row) || '主工程'}）跑完了${row.port === undefined ? '' : `，:${row.port} 可以看`}`

const denyText = (live: Row[], adding: number) =>
  `版本面板：已经开着 ${live.length} 个版本 Studio（${live.map(row => `:${row.port} ${row.label}`).join('、')}），` +
  `这条命令还要再开 ${adding} 个，超过一次最多 ${MAX_VERSIONS} 版。先让用户挑完，关掉没选中的（lsof -ti :端口 | xargs kill）再开。`

let hasOpened = false

const refresh = async ($: EngineInterface) => {
  const after = await scan($)
  const before = await read($, board)

  for (const row of finishedSince(before, after)) $.ui.toast(doneToast(row))
  if (!sameRows(before, after)) await update($, board, () => after)

  const rows = after.rows.map(row => ({
    label: row.label,
    port: row.port ?? null,
    effort: effortText(row),
    state: stateText(row),
    isRunning: row.isRunning,
    isVersion: row.isVersion,
  }))
  void $.fs.write(await feedPath($), JSON.stringify({ at: await $.clock.now(), rows })).catch(() => undefined)

  // 第一次出现版本 Studio 时自己弹出面板（终端够宽才会停靠在侧边）
  if (!hasOpened && liveVersions(after).length > 0) {
    hasOpened = true
    void $.ui.open({ id: PANE, title: '版本' }).catch(() => undefined)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    if (!e.isInteractive) return next(e)

    await $.command.register({ name: COMMAND, description: '侧边面板：开着的 Studio 版本 · 档位 · 跑完没' })
    void refresh($).catch(() => undefined)
    $.clock.every(REFRESH_MS, () => refresh($).catch(() => undefined))

    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    hasOpened = true
    await refresh($).catch(() => undefined)
    const failed = await $.ui
      .open({ id: PANE, title: '版本' })
      .then(() => undefined)
      .catch((error: unknown) => String(error))

    return { text: failed === undefined ? '版本面板已打开。' : `版本面板没打开：${failed}` }
  })

  // 一次最多给你看 3 版：再开版本 Studio 会超过 3 个就拦下
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const adding = versionLaunches(e.command)
    if (adding === 0) return next(e)

    const live = liveVersions(await scan($))
    if (live.length + adding <= MAX_VERSIONS) return next(e)

    return { deny: denyText(live, adding) }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Link } = $.ui.resolve(e)
    const { rows } = await read($, board)
    const versions = rows.filter(row => row.isVersion)
    const mains = rows.filter(row => !row.isVersion)
    const live = versions.filter(row => row.port !== undefined).length

    const line = (row: Row) => (
      <Box key={row.cwd}>
        <Text color={row.isRunning ? 'yellow' : 'green'}>{row.isRunning ? '⏳ ' : '● '}</Text>
        {row.port === undefined ? (
          <Text dimColor>{'  —  '}</Text>
        ) : (
          <Link href={`http://localhost:${row.port}`} label={`:${row.port}`} />
        )}
        <Text>{`  ${row.label}  `}</Text>
        <Text color="claude">{effortText(row)}</Text>
        <Text dimColor wrap="truncate-end">{`  ${stateText(row)}`}</Text>
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Text bold>
          版本 · 开着 {live} 个{live > MAX_VERSIONS ? `（超过 ${MAX_VERSIONS} 个了）` : ''}
        </Text>
        {versions.length === 0 && <Text dimColor>没有在跑或开着的版本。</Text>}
        {versions.map(line)}
        {mains.length > 0 && <Text bold>主工程</Text>}
        {mains.map(line)}
        <Text dimColor>点端口号打开 · 每 8 秒刷新</Text>
      </Box>
    )
  })
}
