import type { EngineInterface, Register } from 'claude-code'

import { formatCache, formatQuota, labelOf, newlyOver, shouldWarnCache, ttlOf, WARN_LEFT_MIN } from './quota'

// ── 可配置项 ──
// 多久刷新一次额度
const REFRESH_MS = 60 * 1000
// 刘海台读这里：~/.claude/notch/sessions/<对话id>.quota.json，每个对话一份，按 at 判断还活着没
const feedDir = async ($: EngineInterface) => `${(await $.env.get('HOME')) ?? ''}/.claude/notch/sessions`

// 已经弹过 90% 提醒的窗口；重新加载后清空，最多多提醒一次
const warned = new Set<string>()

// 缓存倒计时：主对话最后一次回复完成的时刻、是否正在干活、这段空闲是否已提醒过
let lastAt: number | undefined
let isWorking = false
let cacheWarnedFor: number | undefined

const warnCache = ($: EngineInterface) => {
  const text = `缓存 ${WARN_LEFT_MIN} 分钟内变凉，要走开的话先 /compact`
  $.ui.toast(text, { timeoutMs: 15_000 })
  // 人可能不在终端前，再弹一个系统横幅
  void $.process
    .run(['osascript', '-e', `display notification "${text}" with title "Claude Code 缓存" sound name "Submarine"`])
    .catch(() => undefined)
}

const refresh = async ($: EngineInterface) => {
  const usage = await $.session.usage()
  const now = await $.clock.now()
  const ttl = ttlOf(usage.rateLimits)
  const cache = formatCache(now, lastAt, isWorking, ttl, usage.context.tokens)
  const quota = formatQuota(usage.rateLimits, usage.cost?.usd)

  $.ui.status(cache ? `${quota} · ${cache}` : quota)

  const id = await $.session.id()
  const cwd = await $.session.cwd()
  const feed = { id, cwd, at: now, working: isWorking, quota, cache: cache ?? null, limits: usage.rateLimits }
  void $.fs.write(`${await feedDir($)}/${id}.quota.json`, JSON.stringify(feed)).catch(() => undefined)

  for (const limit of newlyOver(usage.rateLimits, warned)) {
    warned.add(limit.kind)
    $.ui.toast(`${labelOf(limit.kind)}已用 ${Math.round(limit.percentUsed)}%`, { timeoutMs: 10_000 })
  }

  // 窗口重置、降回 90% 以下后，下次再越线还会提醒
  for (const limit of usage.rateLimits) {
    if (limit.percentUsed < 90) warned.delete(limit.kind)
  }

  if (shouldWarnCache(now, lastAt, isWorking, ttl) && cacheWarnedFor !== lastAt) {
    cacheWarnedFor = lastAt
    warnCache($)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    void refresh($).catch(() => undefined)
    $.clock.every(REFRESH_MS, () => refresh($).catch(() => undefined))

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    isWorking = true
    lastAt = await $.clock.now()
    void refresh($).catch(() => undefined)

    return next(e)
  })

  // 只看主对话：子任务的回合不算
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      isWorking = false
      lastAt = await $.clock.now()
      void refresh($).catch(() => undefined)
    }

    return next(e)
  })

  // 对话关掉时告诉刘海台这一行可以撤了
  on('session.end', async ($, e, next) => {
    const id = await $.session.id()
    await $.fs.write(`${await feedDir($)}/${id}.quota.json`, JSON.stringify({ id, ended: true })).catch(() => undefined)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    void refresh($).catch(() => undefined)

    return next(e)
  })
}
