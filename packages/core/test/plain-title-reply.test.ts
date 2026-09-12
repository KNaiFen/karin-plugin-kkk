import { describe, expect, it, vi } from 'vitest'

import {
  createPlainVideoTitleContext,
  normalizePlainTitleReplyConfig,
  replyPlainVideoTitle
} from '../src/module/utils/PlainTitleReply'

describe('plain video title reply', () => {
  it('sends the normalized title with the platform prefix', async () => {
    const event = { reply: vi.fn(async () => ({ messageId: 'title-1' })) } as any
    const context = createPlainVideoTitleContext(true, '抖音')

    const sent = await replyPlainVideoTitle(event, context, '  测试\n标题  ')

    expect(sent).toBe(true)
    expect(event.reply).toHaveBeenCalledWith('抖音标题：测试 标题')
  })

  it('uses the bracketed platform and author format when author is available', async () => {
    const event = { reply: vi.fn(async () => ({ messageId: 'title-1' })) } as any
    const context = createPlainVideoTitleContext(true, '小红书')

    const sent = await replyPlainVideoTitle(event, context, '  测试\n标题  ', '  作者\n名称  ')

    expect(sent).toBe(true)
    expect(event.reply).toHaveBeenCalledWith('【小红书】作者 名称：测试 标题')
  })

  it('does not send when disabled or title is empty', async () => {
    const event = { reply: vi.fn() } as any

    expect(await replyPlainVideoTitle(event, createPlainVideoTitleContext(false, 'B站'), '视频标题', '作者')).toBe(false)
    expect(await replyPlainVideoTitle(event, createPlainVideoTitleContext(true, '小红书'), '   ')).toBe(false)

    expect(event.reply).not.toHaveBeenCalled()
  })

  it('does not send when the parsed content type is disabled', async () => {
    const event = { reply: vi.fn() } as any
    const context = createPlainVideoTitleContext(true, '小红书', ['video'])

    expect(await replyPlainVideoTitle(event, context, '图文标题', '作者', 'image')).toBe(false)
    expect(event.reply).not.toHaveBeenCalled()
  })

  it('sends at most once for one parse context', async () => {
    const event = { reply: vi.fn(async () => ({ messageId: 'title-1' })) } as any
    const context = createPlainVideoTitleContext(true, 'B站')

    expect(await replyPlainVideoTitle(event, context, '第一个标题')).toBe(true)
    expect(await replyPlainVideoTitle(event, context, '第二个标题')).toBe(false)

    expect(event.reply).toHaveBeenCalledTimes(1)
    expect(event.reply).toHaveBeenCalledWith('B站标题：第一个标题')
  })

  it('normalizes legacy boolean and object plain title settings', () => {
    expect(normalizePlainTitleReplyConfig(true, ['video', 'image'])).toEqual({
      switch: true,
      types: ['video', 'image']
    })
    expect(normalizePlainTitleReplyConfig(false, ['video', 'image'])).toEqual({
      switch: false,
      types: ['video', 'image']
    })
    expect(normalizePlainTitleReplyConfig({ switch: true, types: ['image', 'unknown'] } as any, ['video', 'image'])).toEqual({
      switch: true,
      types: ['image']
    })
    expect(normalizePlainTitleReplyConfig({ switch: true, types: [] }, ['video'])).toEqual({
      switch: true,
      types: []
    })
  })
})
