import { describe, expect, it, vi } from 'vitest'

import { formatFailureTraceTime } from '../src/module/utils/ErrorTrace'

const state = vi.hoisted(() => ({
  render: vi.fn()
}))

vi.mock('@/module', () => ({
  formatBuildTime: vi.fn(),
  Render: (...args: unknown[]) => state.render(...args),
  Root: {
    karinVersion: '1.15.5',
    pluginVersion: '4.0.43'
  }
}))

const { renderErrorImage } = await import('../src/module/utils/ErrorHandler/render')

describe('error handler image rendering', () => {
  it('renders the triggering message time in the system timezone', async () => {
    const event = {
      msg: 'https://www.xiaohongshu.com/explore/private?token=trigger-secret',
      time: 1784788800
    }
    const ctx = {
      traceId: 'trace-safe-id',
      error: new Error('小红书数据获取失败 token=error-secret'),
      options: { businessName: '小红书视频解析' },
      event,
      logs: [{
        timestamp: '12:00:00.000',
        level: 'ERRO',
        message: 'Cookie: a1=log-secret',
        raw: 'Cookie: a1=log-secret'
      }]
    } as any

    state.render.mockResolvedValue([{ type: 'image' }])

    await renderErrorImage(ctx, {
      stack: 'Authorization: Bearer stack-secret'
    })

    expect(state.render).toHaveBeenCalledWith(
      event,
      'other/handlerError',
      expect.objectContaining({
        timestamp: formatFailureTraceTime(new Date(event.time * 1000)),
        error: expect.objectContaining({
          message: '业务处理失败，诊断详情已记录',
          stack: 'Trace ID: trace-safe-id'
        }),
        logs: undefined,
        triggerCommand: undefined
      })
    )

    const renderedPayload = JSON.stringify(state.render.mock.calls[0]?.[2])
    for (const secret of [
      'error-secret',
      'trigger-secret',
      'log-secret',
      'stack-secret',
      '小红书数据获取失败'
    ]) {
      expect(renderedPayload).not.toContain(secret)
    }
  })
})
