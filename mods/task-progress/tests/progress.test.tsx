import { describe, expect, test } from 'claude-code/testing'

import { barParts, fromTodos, toProgress } from '../hooks/bar'

describe('进度条格子', () => {
  test('3/7 画出 7 格实心、9 格空心', async () => {
    const { filled, empty } = barParts({ done: 3, total: 7, now: '' })

    expect(filled).toBe('▓'.repeat(7))
    expect(empty).toBe('░'.repeat(9))
  })

  test('做完时整条实心', async () => {
    expect(barParts({ done: 7, total: 7, now: '' }).empty).toBe('')
  })
})

describe('Claude 报进度的参数', () => {
  test('合格的参数原样收下', async () => {
    expect(toProgress({ done: 3, total: 7, now: '渲染第二段' })).toEqual({
      done: 3,
      total: 7,
      now: '渲染第二段',
    })
  })

  test('done 超过 total、total 为 0、不是整数，都拒收', async () => {
    expect(toProgress({ done: 8, total: 7, now: '' })).toBeNull()
    expect(toProgress({ done: 0, total: 0, now: '' })).toBeNull()
    expect(toProgress({ done: 1.5, total: 3, now: '' })).toBeNull()
  })
})

describe('自带步骤清单换算成进度', () => {
  test('数已完成的，取正在做的那一步', async () => {
    const p = fromTodos([
      { content: 'a', status: 'completed', activeForm: '写稿' },
      { content: 'b', status: 'in_progress', activeForm: '渲染' },
      { content: 'c', status: 'pending', activeForm: '发布' },
    ])

    expect(p).toEqual({ done: 1, total: 3, now: '渲染' })
  })
})

const PROPS = {
  hasSurvey: false,
  isWorking: true,
  maxRows: 3,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 3 },
  view: {},
}

describe('输入框上方的进度条', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`${surface}：Claude 报了 3/7 就画出进度条`, async ($, on) => {
      on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
        const { Box } = $.ui.resolve(e)

        return <Box />
      })
      await $.tool.call({ tool: 'mcp__task-progress__progress', done: 3, total: 7, now: '渲染第二段' })

      const ui = await $.ui.mount({ plugin: 'task-progress', surface, component: 'AbovePrompt', props: PROPS })
      const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)

      expect(texts).toEqual(['▓'.repeat(7), '░'.repeat(9), '  3/7  ', '正在：渲染第二段'])
    })

    test(`${surface}：做完后显示完成，用户再发消息就收起`, async ($, on) => {
      on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
        // 替身：没有插件画东西时，Claude Code 自己只画一个空框
        const { Box } = $.ui.resolve(e)

        return <Box />
      })
      on('prompt.submit', ($, e) => ({ text: e.text }))
      await $.tool.call({ tool: 'mcp__task-progress__progress', done: 7, total: 7, now: '收尾' })

      const ui = await $.ui.mount({ plugin: 'task-progress', surface, component: 'AbovePrompt', props: PROPS })
      expect(await ui.find({ type: 'Text', text: '✓ 完成' })).toBeDefined()

      await $.prompt.submit({ text: '下一件事', wait: false, origin: { kind: 'composer' } })
      const after = await $.ui.mount({ plugin: 'task-progress', surface, component: 'AbovePrompt', props: PROPS })
      expect(await after.find({ type: 'Text', text: '✓ 完成' })).toBeUndefined()
    })

    test(`${surface}：没人报进度时不画`, async ($, on) => {
      on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
        // 替身：没有插件画东西时，Claude Code 自己只画一个空框
        const { Box } = $.ui.resolve(e)

        return <Box />
      })

      const ui = await $.ui.mount({ plugin: 'task-progress', surface, component: 'AbovePrompt', props: PROPS })

      expect(await ui.findAll({ type: 'Text' })).toHaveLength(0)
    })
  }
})

describe('保留其他 AbovePrompt 内容', () => {
  const cases = [
    { name: '任务进行中', done: 3, hasSurvey: false, showProgress: true },
    { name: '任务已完成', done: 7, hasSurvey: false, showProgress: true },
    { name: '没有任务', done: null, hasSurvey: false, showProgress: false },
    { name: '问卷显示中', done: 3, hasSurvey: true, showProgress: false },
  ] as const

  for (const surface of ['terminal', 'desktop'] as const) {
    for (const scenario of cases) {
      test(`${surface}：${scenario.name}时保留下游文字和按钮`, async ($, on) => {
        let downstreamCalls = 0
        on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
          downstreamCalls += 1
          const { Box, Text, Button } = $.ui.resolve(e)

          return (
            <Box>
              <Text>downstream-marker</Text>
              <Button label="downstream-control" onPress={() => {}} />
            </Box>
          )
        })
        on('prompt.submit', ($, e) => ({ text: e.text }))

        if (scenario.done !== null) {
          await $.tool.call({
            tool: 'mcp__task-progress__progress',
            done: scenario.done,
            total: 7,
            now: '渲染第二段',
          })
        }

        const ui = await $.ui.mount({
          plugin: 'task-progress',
          surface,
          component: 'AbovePrompt',
          props: { ...PROPS, hasSurvey: scenario.hasSurvey },
        })
        const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
        const expectedTexts = ['downstream-marker']

        if (scenario.showProgress) {
          const { filled, empty } = barParts({ done: scenario.done, total: 7, now: '渲染第二段' })
          expectedTexts.push(
            filled,
            empty,
            `  ${scenario.done}/7  `,
            scenario.done === 7 ? '✓ 完成' : '正在：渲染第二段',
          )
        }

        expect(texts).toEqual(expectedTexts)
        expect(await ui.find({ type: 'Button', label: 'downstream-control' })).toBeDefined()
        expect(downstreamCalls).toBe(1)

        if (scenario.done === 7) {
          await $.prompt.submit({ text: '下一件事', wait: false, origin: { kind: 'composer' } })
          const after = await $.ui.mount({ plugin: 'task-progress', surface, component: 'AbovePrompt', props: PROPS })

          expect((await after.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['downstream-marker'])
          expect(await after.find({ type: 'Button', label: 'downstream-control' })).toBeDefined()
        }
      })
    }
  }
})
