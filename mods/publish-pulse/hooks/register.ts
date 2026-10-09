import type { EngineInterface, Register } from 'claude-code'

import { formatPulse, localNow, lastPublished, nextScheduled } from './pulse'
import type { Doc } from './pulse'

// ── 可配置项 ──
// 环境变量 NOTCH_PUBLISH_ROOT：发布记录根目录的绝对路径，下面要有「发布中/<项目>/…入口.md」和「已发布/*.md」；没设就不写 pulse.json
const publishRoot = ($: EngineInterface) => $.env.get('NOTCH_PUBLISH_ROOT')
// 环境变量 NOTCH_TZ_OFFSET_HOURS：你所在时区相对 UTC 的小时数，默认 8（北京时间）
const tzOffset = async ($: EngineInterface) => {
  const raw = await $.env.get('NOTCH_TZ_OFFSET_HOURS')
  const n = Number(raw)
  return raw && Number.isFinite(n) ? n : 8
}
// 刘海台读这里：~/.claude/notch/pulse.json
const feedPath = async ($: EngineInterface) => `${(await $.env.get('HOME')) ?? ''}/.claude/notch/pulse.json`
// 多久刷新一次
const REFRESH_MS = 10 * 60 * 1000

const readDocs = async ($: EngineInterface, dir: string, pick: (name: string) => boolean) => {
  const entries = await $.fs.list(dir).catch(() => [])
  const docs: Doc[] = []

  for (const entry of entries) {
    if (entry.kind === 'file' && entry.name.endsWith('.md') && pick(entry.name)) {
      const text = await $.fs.read(`${dir}/${entry.name}`).catch(() => '')
      docs.push({ title: entry.name.replace(/\.md$/, '').slice(0, 12), text })
    }
  }

  return docs
}

// 发布中/<项目>/<项目>·入口.md，标题用文件夹名
const readEntries = async ($: EngineInterface, root: string) => {
  const folders = await $.fs.list(`${root}/发布中`).catch(() => [])
  const docs: Doc[] = []

  for (const folder of folders) {
    if (folder.kind !== 'dir') continue
    const inside = await readDocs($, `${root}/发布中/${folder.name}`, name => name.includes('入口'))
    docs.push(...inside.map(doc => ({ ...doc, title: folder.name })))
  }

  return docs
}

const refresh = async ($: EngineInterface) => {
  const root = await publishRoot($)
  if (!root) return
  const now = localNow(await $.clock.now(), await tzOffset($))
  const entries = await readEntries($, root)
  const published = await readDocs($, `${root}/已发布`, () => true)
  const text = formatPulse(lastPublished([...entries, ...published]), nextScheduled(entries, now), now)
  $.ui.status(text)
  void $.fs.write(await feedPath($), JSON.stringify({ at: await $.clock.now(), text })).catch(() => undefined)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    void refresh($).catch(() => $.ui.status('⚪ 发片节奏读取失败'))
    $.clock.every(REFRESH_MS, () => refresh($).catch(() => undefined))

    return next(e)
  })

  // 每轮结束顺手刷新一次，刚改完发布记录也能马上看到
  on('turn.complete', async ($, e, next) => {
    void refresh($).catch(() => undefined)

    return next(e)
  })
}
