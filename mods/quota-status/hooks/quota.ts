export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

const WEEKDAYS = '日一二三四五六'
const WARN_AT = 90

// 重置时间按北京时间算星期几
const weekdayOf = (iso: string) => {
  const ms = Date.parse(iso)

  return Number.isNaN(ms) ? undefined : WEEKDAYS[new Date(ms + 8 * 3_600_000).getUTCDay()]
}

export const formatQuota = (limits: readonly Limit[], usd: number | undefined): string => {
  const five = limits.find(l => l.kind === 'five_hour')
  const week = limits.find(l => l.kind === 'seven_day')
  const parts: string[] = []

  if (five) parts.push(`5h ${Math.round(five.percentUsed)}%`)

  if (week) {
    const day = week.resetsAt ? weekdayOf(week.resetsAt) : undefined
    parts.push(`本周 ${Math.round(week.percentUsed)}%${day ? `（周${day}重置）` : ''}`)
  }

  const line = parts.length > 0 ? `额度 ${parts.join(' · ')}` : '额度 —'

  // 订阅（有额度窗口）时金额只是按 API 价折算，带 ≈；没有窗口就是真实花费
  if (usd === undefined) return line

  return `${line} · 本对话${parts.length > 0 ? '≈' : ''}$${usd.toFixed(2)}`
}

// 刚越过 90% 的窗口：这次 ≥90，上次没提醒过
export const newlyOver = (limits: readonly Limit[], warned: ReadonlySet<string>) =>
  limits.filter(l => l.percentUsed >= WARN_AT && !warned.has(l.kind))

export const labelOf = (kind: string) =>
  kind === 'five_hour' ? '5 小时额度' : kind === 'seven_day' ? '本周额度' : kind

// 订阅缓存 1 小时，按量付费（没有额度窗口）5 分钟
export const ttlOf = (limits: readonly Limit[]) => (limits.length > 0 ? 60 : 5)

const minutesLeft = (nowMs: number, lastAt: number, ttlMin: number) => Math.ceil(ttlMin - (nowMs - lastAt) / 60_000)

// Claude 干活时缓存一直是热的；停下后从最后一次回复完成开始倒数（按回复结束时间估，会差一两分钟）
export const formatCache = (
  nowMs: number,
  lastAt: number | undefined,
  isWorking: boolean,
  ttlMin: number,
  tokens: number | undefined,
): string | undefined => {
  if (lastAt === undefined) return undefined
  if (isWorking) return `🔥 缓存 ${ttlMin} 分钟`

  const left = minutesLeft(nowMs, lastAt, ttlMin)
  if (left > 0) return `🔥 缓存 ${left} 分钟`

  return tokens ? `🧊 缓存已凉 · 下条重发 ${Math.round(tokens / 1000)}K` : '🧊 缓存已凉'
}

export const WARN_LEFT_MIN = 5

// 停着、还热、只剩 5 分钟以内：该提醒了
export const shouldWarnCache = (nowMs: number, lastAt: number | undefined, isWorking: boolean, ttlMin: number) => {
  if (lastAt === undefined || isWorking || ttlMin <= WARN_LEFT_MIN) return false

  const left = minutesLeft(nowMs, lastAt, ttlMin)

  return left > 0 && left <= WARN_LEFT_MIN
}
