import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  formatFailureTraceTime,
  getFailureTraceSnapshot,
  runWithFailureTraceContext
} from '../src/module/utils/ErrorTrace'

const state = vi.hoisted(() => ({
  renderErrorImage: vi.fn(),
  sendMaster: vi.fn(),
  getReachableMasterBots: vi.fn(async () => []),
  getConfiguredMasters: vi.fn(() => ['10001']),
  getBuildMetadata: vi.fn(() => ({
    buildTime: '2026-06-09T06:00:00.000Z',
    commitHash: 'deadbeef'
  })),
  config: {
    app: {
      errorLogSendTo: ['trigger']
    }
  }
}))

vi.mock('node-karin', () => ({
  default: {
    sendMaster: (...args: unknown[]) => state.sendMaster(...args),
    getBot: vi.fn(() => undefined)
  },
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    runContext: (fn: () => unknown) => ({
      run: async () => await fn()
    })
  },
  segment: {
    text: (text: string) => ({ type: 'text', text })
  }
}))

vi.mock('@/module', () => ({
  getBuildMetadata: () => state.getBuildMetadata()
}))

vi.mock('@/module/utils/Config', () => ({
  Config: state.config
}))

vi.mock('../src/module/utils/bot', () => ({
  getReachableMasterBots: (...args: unknown[]) => state.getReachableMasterBots(...args)
}))

vi.mock('../src/module/utils/master', () => ({
  getNonConsoleMasters: () => state.getConfiguredMasters()
}))

vi.mock('../src/module/utils/ErrorHandler/render', () => ({
  renderErrorImage: (...args: unknown[]) => state.renderErrorImage(...args)
}))

const { handleBusinessError, wrapWithErrorHandler } = await import('../src/module/utils/ErrorHandler/handler')

const createEvent = () => {
  const replies: unknown[] = []
  return {
    replies,
    event: {
      msg: 'https://weibo.com/5177612153/R34sAiuo6',
      selfId: 'bot-self',
      bot: {
        account: {
          selfId: 'bot-self',
          name: 'Bot'
        }
      },
      reply: vi.fn(async (payload: unknown) => {
        replies.push(payload)
        return true
      })
    } as any
  }
}

describe('error handler fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.config.app.errorLogSendTo = ['trigger']
  })

  it('falls back to plain text when error image render fails', async () => {
    state.renderErrorImage.mockRejectedValue(new Error('渲染失败 token=render-secret'))

    const { event, replies } = createEvent()
    event.msg = 'https://weibo.com/private?token=trigger-secret'
    const traceId = await runWithFailureTraceContext({
      businessName: '微博解析',
      event: { message: event.msg }
    }, async () => {
      const currentTraceId = getFailureTraceSnapshot()?.traceId
      await expect(handleBusinessError(
        new Error('微博接口异常 token=error-secret'),
        { businessName: '微博解析' },
        [{
          timestamp: '12:00:00.000',
          level: 'ERRO',
          message: 'Authorization: Bearer log-secret',
          raw: 'Authorization: Bearer log-secret'
        }],
        event
      )).resolves.toBeUndefined()
      return currentTraceId
    })

    expect(replies).toHaveLength(1)
    expect(replies[0]).toEqual([
      expect.objectContaining({
        type: 'text'
      })
    ])
    const notification = JSON.stringify(replies[0])
    expect(notification).toContain('微博解析')
    expect(notification).toContain(String(traceId))
    expect(notification).toContain('业务处理失败')
    for (const secret of [
      'error-secret',
      'trigger-secret',
      'log-secret',
      '微博接口异常'
    ]) {
      expect(notification).not.toContain(secret)
    }
  })

  it('forwards the triggering message time to the failure trace context', async () => {
    const messageTimeSeconds = 1784788800
    const { event } = createEvent()
    event.time = messageTimeSeconds

    const wrapped = wrapWithErrorHandler(async () => getFailureTraceSnapshot(), {
      businessName: '时间测试推送'
    })
    const snapshot = await wrapped(event)

    expect(snapshot?.meta.event?.time).toBe(messageTimeSeconds)
    expect(snapshot?.startedAt).toBe(
      formatFailureTraceTime(new Date(messageTimeSeconds * 1000))
    )
  })

  it('sends masters only the business summary and trace id without group context', async () => {
    state.config.app.errorLogSendTo = ['master']
    state.renderErrorImage.mockResolvedValue([{ type: 'image', file: 'safe-error.png' }])
    const { event } = createEvent()
    event.groupId = 'private-group-id'
    event.msg = 'private trigger token=trigger-secret'

    const traceId = await runWithFailureTraceContext({
      businessName: '微博解析',
      event: { message: event.msg, groupId: event.groupId }
    }, async () => {
      const currentTraceId = getFailureTraceSnapshot()?.traceId
      await handleBusinessError(
        new Error('upstream token=error-secret'),
        { businessName: '微博解析' },
        [],
        event
      )
      return currentTraceId
    })

    expect(state.sendMaster).toHaveBeenCalledTimes(1)
    const notification = JSON.stringify(state.sendMaster.mock.calls[0])
    expect(notification).toContain('微博解析')
    expect(notification).toContain(String(traceId))
    expect(notification).not.toContain('private-group-id')
    expect(notification).not.toContain('trigger-secret')
    expect(notification).not.toContain('error-secret')
  })
})
