import { describe, expect, test } from 'claude-code/testing'

import { formatPulse, localNow, lastPublished, nextScheduled } from '../hooks/pulse'

const ENTRIES = [
  {
    title: '智商倒挂',
    text: `## 进度
- 抖音:2026-10-08 14:59 已发(链接未登记)
- YouTube / B站 / 视频号 / 小红书 / TikTok:2026-10-13 14:59(抖音发布后 120 小时)
- 幕后页:本地已做好,未推送上线`,
  },
  {
    title: 'Opus 5.5 档位盲测',
    text: `## 进度
- 抖音:2026-09-30 22:38 已发(链接未登记)
- YouTube / 视频号:定时 2026-10-05 22:38;B站 / TikTok / 小红书:22:40`,
  },
]

const PUBLISHED = [
  { title: '双AI对决', text: '---\n状态: 已发布(2026-07-13);本文件=成片逐字稿\n---' },
  { title: 'Agent Teams', text: '---\nstatus: 视频抖音 2026-09-04 17:05 已发;其他平台定 2026-09-09\n---' },
]

describe('上次发片', () => {
  test('取所有「已发」里最新的日期', async () => {
    expect(lastPublished([...ENTRIES, ...PUBLISHED])).toEqual({ date: '2026-10-08', title: '智商倒挂' })
  })

  test('「已发布(日期)」的写法也认', async () => {
    expect(lastPublished([PUBLISHED[0]!])).toEqual({ date: '2026-07-13', title: '双AI对决' })
  })
})

describe('下一次定时发布', () => {
  test('跳过已发和已过时间的，取最早的未来一条', async () => {
    expect(nextScheduled(ENTRIES, '2026-10-08 22:00')).toEqual({
      when: '2026-10-13 14:59',
      title: '智商倒挂',
      what: 'YouTube / B站 / 视频号 / 小红书 / TikTok',
    })
  })

  test('只看进度段，网址里的日期不算', async () => {
    const entry = {
      title: '智商倒挂',
      text: `## 进度
- 抖音:2026-10-08 14:59 已发
## 链接
- 幕后页(推送后生效):<https://example.github.io/2026-10-08-iq-inversion/>`,
    }

    expect(nextScheduled([entry], '2026-10-08 22:00')).toBeUndefined()
  })

  test('时间都过了就没有', async () => {
    expect(nextScheduled(ENTRIES, '2026-10-14 00:00')).toBeUndefined()
  })
})

describe('状态栏文字', () => {
  test('当天发过是绿灯，多平台缩写成几平台', async () => {
    const now = '2026-10-08 22:00'
    const text = formatPulse(lastPublished(ENTRIES), nextScheduled(ENTRIES, now), now)

    expect(text).toBe('🟢 距上次发片 0 天（智商倒挂） · 下一发 10-13 14:59 智商倒挂 5 平台')
  })

  test('超过 7 天亮红灯', async () => {
    expect(formatPulse({ date: '2026-09-20', title: '粉色大象' }, undefined, '2026-10-08 10:00')).toBe(
      '🔴 距上次发片 18 天（粉色大象）',
    )
  })

  test('默认按 UTC+8 换算', async () => {
    expect(localNow(Date.parse('2026-10-08T14:30:00Z'))).toBe('2026-10-08 22:30')
  })

  test('偏移可配', async () => {
    expect(localNow(Date.parse('2026-10-08T14:30:00Z'), -4)).toBe('2026-10-08 10:30')
  })
})
