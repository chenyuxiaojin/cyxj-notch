import { describe, expect, test } from 'claude-code/testing'

import { formatCache, formatQuota, newlyOver, shouldWarnCache } from '../hooks/quota'

const LIMITS = [
  { kind: 'five_hour', percentUsed: 23.4, resetsAt: '2026-10-08T15:00:00Z' },
  // 2026-10-08 是周四（北京时间）
  { kind: 'seven_day', percentUsed: 41, resetsAt: '2026-10-08T02:00:00Z' },
]

describe('额度文字', () => {
  test('订阅：两个窗口 + 周几重置 + 折合金额', async () => {
    expect(formatQuota(LIMITS, 3.214)).toBe('额度 5h 23% · 本周 41%（周四重置） · 本对话≈$3.21')
  })

  test('还没读到额度时显示横线', async () => {
    expect(formatQuota([], undefined)).toBe('额度 —')
  })

  test('没有额度窗口（按量付费）时金额是真实花费，不带约等号', async () => {
    expect(formatQuota([], 1.5)).toBe('额度 — · 本对话$1.50')
  })
})

describe('90% 提醒', () => {
  test('只提醒刚越线、还没提醒过的窗口', async () => {
    const limits = [
      { kind: 'five_hour', percentUsed: 92 },
      { kind: 'seven_day', percentUsed: 95 },
    ]

    expect(newlyOver(limits, new Set(['seven_day'])).map(l => l.kind)).toEqual(['five_hour'])
  })
})

describe('缓存倒计时', () => {
  const MIN = 60_000
  const last = 1_000_000

  test('没回复过就不显示', async () => {
    expect(formatCache(last, undefined, false, 60, 160_000)).toBeUndefined()
  })

  test('干活时一直是满的', async () => {
    expect(formatCache(last + 30 * MIN, last, true, 60, 160_000)).toBe('🔥 缓存 60 分钟')
  })

  test('停了 17 分钟还剩 43 分钟', async () => {
    expect(formatCache(last + 17 * MIN, last, false, 60, 160_000)).toBe('🔥 缓存 43 分钟')
  })

  test('过了 1 小时显示已凉和要重发多少', async () => {
    expect(formatCache(last + 61 * MIN, last, false, 60, 160_400)).toBe('🧊 缓存已凉 · 下条重发 160K')
  })

  test('剩 5 分钟以内提醒，凉了或在干活不提醒', async () => {
    expect(shouldWarnCache(last + 56 * MIN, last, false, 60)).toBe(true)
    expect(shouldWarnCache(last + 50 * MIN, last, false, 60)).toBe(false)
    expect(shouldWarnCache(last + 61 * MIN, last, false, 60)).toBe(false)
    expect(shouldWarnCache(last + 56 * MIN, last, true, 60)).toBe(false)
  })
})
