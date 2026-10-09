export type Doc = { title: string; text: string }
export type Last = { date: string; title: string }
export type Next = { when: string; title: string; what: string }

// 「2026-10-08 14:59 已发」「已发布(2026-07-13)」两种写法都算发过
const DONE_AFTER = /(\d{4}-\d{2}-\d{2})[^;；\n]{0,12}已发/g
const DONE_BEFORE = /已发布[(（](\d{4}-\d{2}-\d{2})/g
const WHEN = /(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?/

const HEAD_LINES = 60

// 网址里常带日期（幕后页链接之类），找日期前先去掉
const URL = /<?https?:\/\/[^\s>)]+>?/g

const headOf = (text: string) => text.split('\n').slice(0, HEAD_LINES).join('\n').replace(URL, '')

// 入口文件只看「## 进度」那一段；没有这一段就看开头
const progressOf = (text: string) => {
  const lines = text.split('\n')
  const start = lines.findIndex(line => line.trim().startsWith('## 进度'))
  if (start < 0) return headOf(text)

  const rest = lines.slice(start + 1)
  const end = rest.findIndex(line => line.trim().startsWith('## '))

  return (end < 0 ? rest : rest.slice(0, end)).join('\n').replace(URL, '')
}

export const lastPublished = (docs: readonly Doc[]): Last | undefined => {
  let last: Last | undefined

  for (const doc of docs) {
    const head = headOf(doc.text)
    const dates = [...head.matchAll(DONE_AFTER), ...head.matchAll(DONE_BEFORE)].map(m => m[1] ?? '')

    for (const date of dates) {
      if (date !== '' && (last === undefined || date > last.date)) {
        last = { date, title: doc.title }
      }
    }
  }

  return last
}

// 发布中 入口文件里还没「已发」、时间在 now 之后的那几行，取最早的一条
export const nextScheduled = (entries: readonly Doc[], now: string): Next | undefined => {
  let next: Next | undefined

  for (const entry of entries) {
    for (const raw of progressOf(entry.text).split('\n')) {
      const line = raw.trim()
      if (!line.startsWith('- ') || line.includes('已发')) continue

      const m = WHEN.exec(line)
      if (!m) continue

      const when = `${m[1]} ${m[2] ?? '23:59'}`.replace(/ (\d):/, ' 0$1:')
      if (when < now) continue

      if (next === undefined || when < next.when) {
        const what = line.slice(2).split(/[:：]/)[0]?.trim() ?? ''
        next = { when, title: entry.title, what }
      }
    }
  }

  return next
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / 86_400_000)

// 「YouTube / B站 / 视频号」这种写成「3 平台」，其他原样
const shortWhat = (what: string) => {
  const parts = what.split('/').map(p => p.trim()).filter(Boolean)

  return parts.length > 1 ? `${parts.length} 平台` : what
}

export const formatPulse = (last: Last | undefined, next: Next | undefined, now: string): string => {
  const parts: string[] = []

  if (last) {
    const days = daysBetween(last.date, now)
    const light = days <= 3 ? '🟢' : days <= 7 ? '🟡' : '🔴'
    parts.push(`${light} 距上次发片 ${days} 天（${last.title}）`)
  } else {
    parts.push('⚪ 没找到发片记录')
  }

  if (next) {
    parts.push(`下一发 ${next.when.slice(5)} ${next.title} ${shortWhat(next.what)}`)
  }

  return parts.join(' · ')
}

// 插件环境的时区不一定是本地，按固定的 UTC 偏移算（小时，默认 8 = 北京时间）
export const localNow = (ms: number, offsetHours = 8) =>
  new Date(ms + offsetHours * 3_600_000).toISOString().slice(0, 16).replace('T', ' ')
