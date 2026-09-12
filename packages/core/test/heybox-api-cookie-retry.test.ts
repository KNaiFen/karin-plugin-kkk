import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const config = {
    request: {},
    cookies: {
      heybox: 'x_xhh_tokenid=expired-token'
    }
  }

  return {
    axiosGet: vi.fn(),
    refreshPlatform: vi.fn(async () => {
      config.cookies.heybox = 'x_xhh_tokenid=fresh-token'
      return true
    }),
    warn: vi.fn(),
    config
  }
})

vi.mock('node-karin/axios', () => ({
  default: {
    get: (...args: unknown[]) => state.axiosGet(...args)
  }
}))

vi.mock('../src/module/utils/RequestConfig', () => ({
  buildConfiguredRequestOptions: vi.fn(() => ({}))
}))

vi.mock('../src/module/utils/Config', () => ({
  Config: state.config
}))

vi.mock('../src/module/utils/GuestCookieManager', () => ({
  guestCookieManager: {
    refreshPlatform: (...args: unknown[]) => state.refreshPlatform(...args)
  }
}))

vi.mock('node-karin', () => ({
  logger: {
    warn: (...args: unknown[]) => state.warn(...args)
  }
}))

const { fetchHeyboxDetail } = await import('../src/platform/heybox/api')
const { resetGuestCookieRecoveryState } = await import('../src/module/utils/GuestCookieRecovery')

describe('heybox api guest cookie retry', () => {
  it('refreshes guest cookie and retries once when heybox requires login', async () => {
    resetGuestCookieRecoveryState()
    state.config.cookies.heybox = 'x_xhh_tokenid=expired-token'
    state.warn.mockReset()
    state.refreshPlatform.mockClear()
    state.axiosGet.mockReset()
    state.axiosGet
      .mockResolvedValueOnce({
        data: {
          status: 'failed',
          msg: '需要登录'
        }
      })
      .mockResolvedValueOnce({
        data: {
          status: 'ok',
          result: {
            link: {
              title: '小黑盒测试帖子',
              description: '描述',
              user: { userid: '1', username: '盒友' },
              text: '正文',
              create_at: 1
            },
            comments: []
          }
        }
      })

    const detail = await fetchHeyboxDetail({
      linkId: '77f871fa97e9',
      cookie: 'x_xhh_tokenid=expired-token'
    })

    expect(detail.title).toBe('小黑盒测试帖子')
    expect(state.refreshPlatform).toHaveBeenCalledWith('heybox', 'ensure')
    expect(state.axiosGet).toHaveBeenCalledTimes(2)
    expect(state.axiosGet.mock.calls[1]?.[1]?.headers?.Cookie).toBe('x_xhh_tokenid=fresh-token')
  })
})
