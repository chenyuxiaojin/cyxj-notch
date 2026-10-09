export type Item = { title: string; next?: string }
export type Todo = { busy: Item[]; wrapUp: Item[] }

// 读 log/index.md：「当前在忙」取每个 ### 标题和它的「下一步」，「已发布待收尾」取每条 - 开头的行
export const parseLog = (text: string): Todo => {
  const busy: Item[] = []
  const wrapUp: Item[] = []
  let section = ''

  for (const raw of text.split('\n')) {
    const line = raw.trim()

    if (line.startsWith('## ')) {
      section = line.slice(3).trim()
      continue
    }

    if (section.startsWith('当前在忙')) {
      if (line.startsWith('### ')) {
        busy.push({ title: line.slice(4).trim() })
      } else if (line.startsWith('- 下一步')) {
        const last = busy.at(-1)
        if (last) last.next = line.replace(/^- 下一步[:：]\s*/, '')
      }
    } else if (section.includes('待收尾') && line.startsWith('- ')) {
      const body = line.slice(2)
      const cut = body.search(/[:：]/)
      wrapUp.push(
        cut < 0
          ? { title: body }
          : { title: body.slice(0, cut), next: body.slice(cut + 1).trim() },
      )
    }
  }

  return { busy, wrapUp }
}
