import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  warn: vi.fn(),
  makeForward: vi.fn((elements: unknown[]) => elements)
}))

vi.mock('node-karin', () => ({
  common: {
    makeForward: (...args: unknown[]) => state.makeForward(...args)
  },
  db: {
    get: vi.fn()
  },
  karinPathHtml: '/tmp/karin-html',
  logger: {
    debug: vi.fn(),
    warn: (...args: unknown[]) => state.warn(...args)
  },
  render: {
    render: vi.fn()
  },
  segment: {
    image: (file: string, options?: Record<string, unknown>) => ({ type: 'image', ...options, file }),
    reply: (messageId: string) => ({ type: 'reply', messageId }),
    at: (targetId: string) => ({ type: 'at', targetId }),
    text: (text: string) => ({ type: 'text', text })
  }
}))

vi.mock('template/server', () => ({
  default: vi.fn()
}))

vi.mock('@/module', () => ({
  Common: {
    useDarkTheme: vi.fn(() => false)
  },
  Root: {
    karinVersion: '1.0.0-test',
    pluginName: 'karin-plugin-kkk',
    pluginVersion: '0.0.0-test'
  }
}))

vi.mock('@/module/utils/Config', () => ({
  Config: {
    app: {
      fakeForward: false,
      longTaskCompletionNotify: true,
      longTaskCompletionNotifyThresholdMs: 0,
      RemoveWatermark: true,
      RenderWaitTime: 60,
      multiPageRender: true,
      multiPageTriggerAspectRatio: 3,
      multiPageMaxAspectRatio: 2.2,
      renderScale: 100,
      renderImageFormat: 'auto',
      renderImageQuality: 95
    }
  }
}))

const { replyRenderedImages, sendRenderedImagesToContact } = await import('../src/module/utils/Render')
const {
  initLongTaskCompletionNotify,
  notifyLongTaskCompletionIfNeeded
} = await import('../src/module/utils/LongTaskCompletionNotify')

const createImages = (count: number) => Array.from({ length: count }, (_, index) => ({
  type: 'image',
  file: `base64://image-${index + 1}`,
  name: `page-${index + 1}.jpg`
})) as any[]

describe('replyRenderedImages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-23T00:00:00.000Z'))
  })

  it('falls back to sequential direct sends when grouped reply for a small album fails', async () => {
    const reply = vi.fn()
      .mockRejectedValueOnce(new Error('batch failed'))
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
    const event = {
      bot: {
        account: { selfId: 'bot', name: 'bot' }
      },
      reply
    } as any

    const result = await replyRenderedImages(event, createImages(2))

    expect(result).toBe(true)
    expect(reply).toHaveBeenCalledTimes(3)
    expect(reply).toHaveBeenNthCalledWith(1, expect.arrayContaining(createImages(2)))
    expect(reply).toHaveBeenNthCalledWith(2, [expect.objectContaining({ file: 'base64://image-1' })])
    expect(reply).toHaveBeenNthCalledWith(3, [expect.objectContaining({ file: 'base64://image-2' })])
  })

  it('falls back to sequential direct sends when forward message send fails', async () => {
    const reply = vi.fn()
      .mockRejectedValueOnce(new Error('batch failed'))
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
    const sendForwardMsg = vi.fn().mockRejectedValueOnce(new Error('forward failed'))
    const event = {
      contact: { scene: 'group', peer: '1000' },
      bot: {
        account: { selfId: 'bot', name: 'bot' },
        sendForwardMsg
      },
      reply
    } as any

    const result = await replyRenderedImages(event, createImages(4))

    expect(result).toBe(true)
    expect(sendForwardMsg).toHaveBeenCalledTimes(1)
    expect(reply).toHaveBeenCalledTimes(5)
    expect(reply).toHaveBeenNthCalledWith(1, expect.arrayContaining(createImages(4)))
    expect(reply).toHaveBeenNthCalledWith(2, [expect.objectContaining({ file: 'base64://image-1' })])
    expect(reply).toHaveBeenNthCalledWith(3, [expect.objectContaining({ file: 'base64://image-2' })])
    expect(reply).toHaveBeenNthCalledWith(4, [expect.objectContaining({ file: 'base64://image-3' })])
    expect(reply).toHaveBeenNthCalledWith(5, [expect.objectContaining({ file: 'base64://image-4' })])
  })

  it('records the forward message as the long-task anchor', async () => {
    const reply = vi.fn()
      .mockResolvedValueOnce({ messageId: 'notify-1' })
    const sendForwardMsg = vi.fn().mockResolvedValueOnce({ messageId: 'forward-1' })
    const event = {
      isGroup: true,
      userId: '114514',
      contact: { scene: 'group', peer: '1000' },
      bot: {
        account: { selfId: 'bot', name: 'bot' },
        sendForwardMsg
      },
      reply
    } as any

    initLongTaskCompletionNotify(event, 'X 解析')
    await replyRenderedImages(event, createImages(4))
    await notifyLongTaskCompletionIfNeeded(event)

    expect(sendForwardMsg).toHaveBeenCalledTimes(1)
    expect(reply).toHaveBeenCalledTimes(1)
    expect(reply).toHaveBeenCalledWith([
      { type: 'reply', messageId: 'forward-1' },
      { type: 'at', targetId: '114514' },
      { type: 'text', text: '【X 解析】处理完毕了' }
    ])
  })
})

describe('sendRenderedImagesToContact', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('falls back to sequential direct sends for contact sender when grouped send fails', async () => {
    const sendDirect = vi.fn()
      .mockRejectedValueOnce(new Error('batch failed'))
      .mockResolvedValueOnce({ messageId: '1' })
      .mockResolvedValueOnce({ messageId: '2' })
    const event = {
      contact: { scene: 'group', peer: '1000' },
      bot: {
        account: { selfId: 'bot', name: 'bot' }
      }
    } as any

    const result = await sendRenderedImagesToContact(event, createImages(2), { sendDirect })

    expect(result).toEqual({ messageId: '2' })
    expect(sendDirect).toHaveBeenCalledTimes(3)
    expect(sendDirect).toHaveBeenNthCalledWith(1, expect.arrayContaining(createImages(2)))
    expect(sendDirect).toHaveBeenNthCalledWith(2, [expect.objectContaining({ file: 'base64://image-1' })])
    expect(sendDirect).toHaveBeenNthCalledWith(3, [expect.objectContaining({ file: 'base64://image-2' })])
  })
})
