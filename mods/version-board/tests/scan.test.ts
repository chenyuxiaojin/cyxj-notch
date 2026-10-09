import { describe, expect, test } from 'claude-code/testing'

import {
  buildBoard,
  etimeMinutes,
  finishedSince,
  labelOf,
  liveVersions,
  parseLsof,
  parsePs,
  portsOf,
  projectDirOf,
  usedFromTranscript,
  versionLaunches,
} from '../hooks/scan'

const PAD = '/private/tmp/claude-501/-Users-me-projects-demo/225d5bc4/scratchpad'
const MAIN = '/Users/me/projects/demo/2026-10-04-iq-inversion'

const LISTEN = ['p101', 'f20', 'n*:3041', 'p102', 'f20', 'n127.0.0.1:3042', 'p103', 'f21', 'n[::1]:3000', 'p104', 'n*:5678'].join('\n')
const CWD = ['p101', 'fcwd', `n${PAD}/s1/v1`, 'p102', 'fcwd', `n${PAD}/s1/v2`, 'p103', 'fcwd', `n${MAIN}`, 'p201', 'fcwd', `n${PAD}/s1/v2`, 'p202', 'fcwd', `n${PAD}/s1/v3`].join('\n')
const PS = [
  '  101   10:00 node /x/node_modules/@remotion/cli/remotion-cli.js studio --port 3041',
  '  102   09:00 node /x/node_modules/@remotion/cli/remotion-cli.js studio --port 3042',
  '  103 1-02:03:04 node /y/node_modules/.bin/remotion studio',
  '  104   01:00 node /z/server.js',
  '  201   12:30 claude -p --effort xhigh --model claude-opus-5-5 做第一段',
  '  202   02:10 claude --print --effort=medium 做第一段',
  '  300   00:05 claude --resume abc',
].join('\n')

const scanned = (used = new Map<string, { effort?: string; model?: string }>()) => {
  const cwds = new Map<number, string>()
  for (const [pid, names] of parseLsof(CWD)) cwds.set(pid, names[0] ?? '')

  return buildBoard({ ports: portsOf(parseLsof(LISTEN)), cwds, ps: parsePs(PS), used, now: 0 })
}

describe('读进程', () => {
  test('只认 3000–3999 的监听端口', async () => {
    expect([...portsOf(parseLsof(LISTEN))]).toEqual([
      [101, 3041],
      [102, 3042],
      [103, 3000],
    ])
  })

  test('ps 的运行时长换成分钟', async () => {
    expect(etimeMinutes('12:30')).toBe(12)
    expect(etimeMinutes('1-02:03:04')).toBe(1440 + 120 + 3)
  })

  test('认出 claude -p 和档位，交互式的 claude 不算', async () => {
    const { runs } = parsePs(PS)
    expect(runs.map(run => [run.pid, run.effort, run.model])).toEqual([
      [201, 'xhigh', 'claude-opus-5-5'],
      [202, 'medium', undefined],
    ])
  })

  test('transcript 里取最后一次的档位和模型', async () => {
    const tail = '{"effort":"medium","model":"claude-sonnet-5-5"}\n{"effort":"high","model":"claude-opus-5-5"}'
    expect(usedFromTranscript(tail)).toEqual({ effort: 'high', model: 'claude-opus-5-5' })
  })
})

describe('拼面板', () => {
  test('版本按端口排，-p 和 Studio 同目录合成一行', async () => {
    const used = new Map([[`${PAD}/s1/v1`, { effort: 'high' }]])
    const rows = scanned(used).rows.map(row => [row.port, row.label, row.effort, row.isRunning, row.isVersion])

    expect(rows).toEqual([
      [3000, '2026-10-04-iq-inversion', undefined, false, false],
      [3041, 's1/v1', 'high', false, true],
      [3042, 's1/v2', 'xhigh', true, true],
      [undefined, 's1/v3', 'medium', true, true],
    ])
  })

  test('开着的版本只算 scratchpad 下有端口的', async () => {
    expect(liveVersions(scanned()).map(row => row.port)).toEqual([3041, 3042])
  })

  test('上一轮在跑、这一轮停了的算跑完，整行消失的也算', async () => {
    const before = scanned()
    const after = { rows: before.rows.filter(row => row.label !== 's1/v3').map(row => ({ ...row, isRunning: false })), at: 1 }

    expect(finishedSince(before, after).map(row => row.label).sort()).toEqual(['s1/v2', 's1/v3'])
  })

  test('目录名和 transcript 文件夹名', async () => {
    expect(labelOf(`${PAD}/s1/v2`)).toBe('s1/v2')
    expect(labelOf(MAIN)).toBe('2026-10-04-iq-inversion')
    expect(projectDirOf('/Users/me/projects/视频/Remotion')).toBe('-Users-me-projects----Remotion')
  })
})

describe('数这条命令要开几个版本 Studio', () => {
  test('循环开三个', async () => {
    const command = `SP=${PAD}/s1; for i in 1 2 3; do (cd $SP/v$i && nohup pnpm exec remotion studio --port 304$i --no-open > $SP/studio$i.log 2>&1 &); done`
    expect(versionLaunches(command)).toBe(3)
  })

  test('单开一个', async () => {
    expect(versionLaunches(`cd ${PAD}/s6-high && pnpm run dev -- --port 3044`)).toBe(1)
  })

  test('主工程、关进程、查进程都不算', async () => {
    expect(versionLaunches(`cd ${MAIN} && pnpm exec remotion studio --port 3000`)).toBe(0)
    expect(versionLaunches(`pkill -f "remotion studio"; ls ${PAD}`)).toBe(0)
    expect(versionLaunches(`ps -ax | grep "remotion studio" ${PAD}`)).toBe(0)
  })
})
