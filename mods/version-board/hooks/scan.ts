import type { Board, Row } from '../types'

export type Run = { pid: number; minutes: number; effort?: string; model?: string }

export const MAX_VERSIONS = 3

const PORT_MIN = 3000
const PORT_MAX = 3999

// lsof -Fpn 的输出：p<pid> 开头一段，n<地址> 是监听地址或 cwd 路径
export const parseLsof = (out: string): Map<number, string[]> => {
  const byPid = new Map<number, string[]>()
  let pid = 0

  for (const line of out.split('\n')) {
    if (line.startsWith('p')) {
      pid = Number(line.slice(1))
      if (!byPid.has(pid)) byPid.set(pid, [])
    } else if (line.startsWith('n') && pid > 0) {
      byPid.get(pid)?.push(line.slice(1))
    }
  }

  return byPid
}

export const portsOf = (listen: Map<number, string[]>): Map<number, number> => {
  const ports = new Map<number, number>()

  for (const [pid, names] of listen) {
    for (const name of names) {
      const port = Number(/:(\d+)$/.exec(name)?.[1])
      if (port >= PORT_MIN && port <= PORT_MAX && !ports.has(pid)) ports.set(pid, port)
    }
  }

  return ports
}

// ps 的 etime：[[dd-]hh:]mm:ss
export const etimeMinutes = (etime: string): number => {
  const [days, rest] = etime.includes('-') ? etime.split('-') : ['0', etime]
  const parts = (rest ?? '').split(':').map(Number).reverse()

  return Number(days) * 1440 + (parts[2] ?? 0) * 60 + (parts[1] ?? 0)
}

const EFFORT = /--effort[=\s]+["']?(low|medium|high|xhigh|max)\b/
const CODEX_EFFORT = /model_reasoning_effort\s*=\s*\\?["']?(low|medium|high|xhigh|minimal)\b/
const MODEL = /--model[=\s]+["']?([\w.:-]+)/

const isPrintRun = (command: string) =>
  /(^|\/)claude\s/.test(command) && /\s(-p|--print)(\s|$)/.test(command)

const isCodexRun = (command: string) => /(^|\/)codex\s+exec\b/.test(command)

export type Ps = { commands: Map<number, string>; runs: Run[] }

export const parsePs = (out: string): Ps => {
  const commands = new Map<number, string>()
  const runs: Run[] = []

  for (const raw of out.split('\n')) {
    const m = /^\s*(\d+)\s+(\S+)\s+(.*)$/.exec(raw)
    if (!m) continue

    const pid = Number(m[1])
    const command = m[3] ?? ''
    commands.set(pid, command)

    if (isPrintRun(command) || isCodexRun(command)) {
      runs.push({
        pid,
        minutes: etimeMinutes(m[2] ?? '0:00'),
        effort: (EFFORT.exec(command) ?? CODEX_EFFORT.exec(command))?.[1],
        model: MODEL.exec(command)?.[1] ?? (isCodexRun(command) ? 'codex' : undefined),
      })
    }
  }

  return { commands, runs }
}

// -p 出的版本都在某个对话的 scratchpad 或 /tmp 下；其他目录里的是主工程
export const isVersionDir = (cwd: string) => cwd.includes('/scratchpad/') || /^\/(private\/)?tmp\//.test(cwd)

export const labelOf = (cwd: string) => {
  const inPad = cwd.split('/scratchpad/')[1]
  if (inPad) return inPad

  return cwd.split('/').filter(Boolean).pop() ?? cwd
}

// ~/.claude/projects 下的文件夹名：路径里每个非字母数字都换成 -
export const projectDirOf = (cwd: string) => cwd.replace(/[^A-Za-z0-9]/g, '-')

const lastMatch = (text: string, re: RegExp) => [...text.matchAll(re)].pop()?.[1]

export const usedFromTranscript = (tail: string) => ({
  effort: lastMatch(tail, /"effort":"(low|medium|high|xhigh|max)"/g),
  model: lastMatch(tail, /"model":"(claude-[\w.-]+)"/g),
})

export type Scan = {
  ports: Map<number, number>
  cwds: Map<number, string>
  ps: Ps
  used: Map<string, { effort?: string; model?: string }>
  now: number
}

export const buildBoard = ({ ports, cwds, ps, used, now }: Scan): Board => {
  const rows = new Map<string, Row>()

  for (const [pid, port] of ports) {
    const cwd = cwds.get(pid)
    const command = ps.commands.get(pid) ?? ''
    if (cwd === undefined || !/remotion/i.test(command)) continue

    rows.set(cwd, { cwd, port, label: labelOf(cwd), isVersion: isVersionDir(cwd), isRunning: false, ...used.get(cwd) })
  }

  for (const run of ps.runs) {
    const cwd = cwds.get(run.pid)
    if (cwd === undefined || !isVersionDir(cwd)) continue

    const row = rows.get(cwd) ?? { cwd, label: labelOf(cwd), isVersion: true, isRunning: false }
    rows.set(cwd, {
      ...row,
      isRunning: true,
      minutes: run.minutes,
      effort: run.effort ?? row.effort,
      model: run.model ?? row.model,
    })
  }

  const list = [...rows.values()].sort((a, b) => (a.port ?? 99_999) - (b.port ?? 99_999))

  return { rows: list, at: now }
}

export const liveVersions = (board: Board) => board.rows.filter(row => row.isVersion && row.port !== undefined)

// 跑完的：上一轮还在跑、这一轮不跑了
export const finishedSince = (before: Board, after: Board): Row[] => {
  const running = new Set(before.rows.filter(row => row.isRunning).map(row => row.cwd))

  return after.rows.filter(row => running.has(row.cwd) && !row.isRunning)
    .concat(
      before.rows.filter(row => row.isRunning && !after.rows.some(next => next.cwd === row.cwd)),
    )
}

const QUIET = /^(p?kill|pgrep|grep|rg|ps|lsof|echo|cat|sed|head|tail)\b/

// 这条命令要开几个「版本」Studio：只算 /tmp 或 scratchpad 下的，主工程不算
export const versionLaunches = (command: string): number => {
  if (!/\/tmp\/|scratchpad/.test(command)) return 0

  const segments = command.split(/;|&&|\|\||\n/).map(s => s.trim().replace(/^[(\s]*(do\s+)?(nohup\s+)?/, ''))
  const launches = segments.filter(s => /remotion\s+studio|\brun\s+dev\b/.test(s) && !QUIET.test(s)).length
  if (launches === 0) return 0

  const loop = /for\s+\w+\s+in\s+([^;\n]+?)\s*;?\s*do\b/.exec(command)
  const items = loop?.[1]?.trim().split(/\s+/).length ?? 1

  return launches * items
}

export const effortText = (row: Row) => row.effort ?? (row.isVersion ? '没写档位' : '')

export const stateText = (row: Row) => {
  if (row.isRunning) return `跑着 · ${row.minutes ?? 0} 分钟`
  if (!row.isVersion) return '主工程'

  return row.port === undefined ? '跑完 · 没开 Studio' : '跑完'
}
