import { expect, test } from 'claude-code/testing'

import { parseLog } from './parse'

const SAMPLE = `# 内容创作状态入口

## 当前在忙

### 风格提取教程
- 状态(10-05):日落大道 MV 不发了。
- 下一步:看逐字稿,补录屏 3 样。
- 入口:\`projects/x/README.md\`

### Grok Bot 实测
- 状态(9-13):还没开拍。

## 已发布待收尾
- TikTok 0 播放(10-01):已提交官方反馈。
- 粉色大象(9-25)：待核五平台上线。
`

test('当前在忙取标题和下一步，没有下一步的也列出', async () => {
  const { busy } = parseLog(SAMPLE)

  expect(busy).toEqual([
    { title: '风格提取教程', next: '看逐字稿,补录屏 3 样。' },
    { title: 'Grok Bot 实测' },
  ])
})

test('待收尾按第一个冒号拆成标题和说明，中英文冒号都认', async () => {
  const { wrapUp } = parseLog(SAMPLE)

  expect(wrapUp).toEqual([
    { title: 'TikTok 0 播放(10-01)', next: '已提交官方反馈。' },
    { title: '粉色大象(9-25)', next: '待核五平台上线。' },
  ])
})
