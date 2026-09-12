import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  config: {
    app: {
      longTaskCompletionNotify: true,
      longTaskCompletionNotifyThresholdMs: 300000
    }
  }
}))

vi.mock('node-karin', () => ({
  segment: {
    reply: (messageId: string) => ({ type: 'reply', messageId }),
    at: (targetId: string) => ({ type: 'at', targetId }),
    text: (text: string) => ({ type: 'text', text })
  }
}))

vi.mock('@/module/utils/Config', () => ({
  Config: state.config
}))

const {
  initLongTaskCompletionNotify,
  markLongTaskCompletionFailed,
  notifyLongTaskCompletionIfNeeded,
  recordLongTaskCompletionAnchor
} = await import('../src/module/utils/LongTaskCompletionNotify')

describe('long task completion notify', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-23T00:00:00.000Z'))
    state.config.app.longTaskCompletionNotify = true
    state.config.app.longTaskCompletionNotifyThresholdMs = 300000
  })

  it('replies to the result anchor and @ the trigger user in groups after threshold', async () => {
    const reply = vi.fn()
    const event = {
      isGroup: true,
      userId: '114514',
      contact: { scene: 'group', peer: '1000' },
      reply
    } as any

    initLongTaskCompletionNotify(event, '详细解析总结')
    recordLongTaskCompletionAnchor(event, { messageId: 'result-1' })
    vi.setSystemTime(new Date('2026-06-23T00:05:01.000Z'))

    await notifyLongTaskCompletionIfNeeded(event)

    expect(reply).toHaveBeenCalledWith([
      { type: 'reply', messageId: 'result-1' },
      { type: 'at', targetId: '114514' },
      { type: 'text', text: '【详细解析总结】处理完毕了' }
    ])
  })

  it('replies without @ in private chats', async () => {
    const reply = vi.fn()
    const event = {
      isGroup: false,
      userId: '114514',
      contact: { scene: 'friend', peer: '114514' },
      reply
    } as any

    initLongTaskCompletionNotify(event, '转写原文')
    recordLongTaskCompletionAnchor(event, { message_id: 'result-2' })
    vi.setSystemTime(new Date('2026-06-23T00:05:01.000Z'))

    await notifyLongTaskCompletionIfNeeded(event)

    expect(reply).toHaveBeenCalledWith([
      { type: 'reply', messageId: 'result-2' },
      { type: 'text', text: '【转写原文】处理完毕了' }
    ])
  })

  it('skips notification when elapsed time is below threshold', async () => {
    const reply = vi.fn()
    const event = {
      isGroup: true,
      userId: '114514',
      contact: { scene: 'group', peer: '1000' },
      reply
    } as any

    initLongTaskCompletionNotify(event, '解析总结')
    recordLongTaskCompletionAnchor(event, { messageId: 'result-3' })
    vi.setSystemTime(new Date('2026-06-23T00:04:59.000Z'))

    await notifyLongTaskCompletionIfNeeded(event)

    expect(reply).not.toHaveBeenCalled()
  })

  it('skips notification when the switch is disabled', async () => {
    state.config.app.longTaskCompletionNotify = false
    const reply = vi.fn()
    const event = {
      isGroup: true,
      userId: '114514',
      contact: { scene: 'group', peer: '1000' },
      reply
    } as any

    initLongTaskCompletionNotify(event, '解析总结')
    recordLongTaskCompletionAnchor(event, { messageId: 'result-4' })
    vi.setSystemTime(new Date('2026-06-23T00:05:01.000Z'))

    await notifyLongTaskCompletionIfNeeded(event)

    expect(reply).not.toHaveBeenCalled()
  })

  it('skips notification when the task has failed', async () => {
    const reply = vi.fn()
    const event = {
      isGroup: true,
      userId: '114514',
      contact: { scene: 'group', peer: '1000' },
      reply
    } as any

    initLongTaskCompletionNotify(event, '微博解析')
    recordLongTaskCompletionAnchor(event, { messageId: 'result-5' })
    markLongTaskCompletionFailed(event)
    vi.setSystemTime(new Date('2026-06-23T00:05:01.000Z'))

    await notifyLongTaskCompletionIfNeeded(event)

    expect(reply).not.toHaveBeenCalled()
  })

  it('notifies at most once per task', async () => {
    const reply = vi.fn()
    const event = {
      isGroup: true,
      userId: '114514',
      contact: { scene: 'group', peer: '1000' },
      reply
    } as any

    initLongTaskCompletionNotify(event, 'X 解析')
    recordLongTaskCompletionAnchor(event, { messageId: 'result-6' })
    vi.setSystemTime(new Date('2026-06-23T00:05:01.000Z'))

    await notifyLongTaskCompletionIfNeeded(event)
    await notifyLongTaskCompletionIfNeeded(event)

    expect(reply).toHaveBeenCalledTimes(1)
  })
})
