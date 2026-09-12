import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  douyinCookie: 'douyin-secret-cookie-value',
  debug: vi.fn(),
  warn: vi.fn(),
  refreshPlatform: vi.fn(async () => true),
  fetchXhsNoteDetail: vi.fn(),
  searchXhsNotes: vi.fn(),
  amagiClientFactory: vi.fn(() => ({
    bilibili: {
      fetcher: {}
    },
    douyin: {
      fetcher: {
        parseWork: vi.fn()
      }
    },
    kuaishou: {
      fetcher: {}
    },
    xiaohongshu: {
      fetcher: {
        fetchNoteDetail: (...args: unknown[]) => state.fetchXhsNoteDetail(...args),
        searchNotes: (...args: unknown[]) => state.searchXhsNotes(...args)
      }
    }
  }))
}))

vi.mock('@ikenxuan/amagi', () => ({
  default: (...args: unknown[]) => state.amagiClientFactory(...args)
}))

vi.mock('node-karin', () => ({
  logger: {
    debug: state.debug,
    warn: state.warn
  }
}))

vi.mock('../src/module/utils/GuestCookieManager', () => ({
  GUEST_COOKIE_PLATFORMS: ['douyin', 'xiaohongshu', 'tiktok', 'heybox', 'zhihu', 'weibo'],
  guestCookieManager: {
    refreshPlatform: (...args: unknown[]) => state.refreshPlatform(...args)
  }
}))

vi.mock('../src/module/utils/Config', () => ({
  Config: {
    cookies: {
      bilibili: 'bilibili-secret-cookie-value',
      get douyin () {
        return state.douyinCookie
      },
      kuaishou: '',
      xiaohongshu: 'xhs-secret-cookie-value'
    },
    request: {}
  }
}))

vi.mock('../src/module/utils/RequestConfig', () => ({
  buildConfiguredRequestOptions: vi.fn(() => ({}))
}))

const { AmagiBase } = await import('../src/module/utils/amagiClient')
const { resetGuestCookieRecoveryState } = await import('../src/module/utils/GuestCookieRecovery')

const createMockAmagiClient = (overrides: {
  parseWork?: (...args: unknown[]) => unknown
  fetchNoteDetail?: (...args: unknown[]) => unknown
  searchNotes?: (...args: unknown[]) => unknown
} = {}) => ({
  bilibili: {
    fetcher: {}
  },
  douyin: {
    fetcher: {
      parseWork: (...args: unknown[]) => overrides.parseWork?.(...args)
    }
  },
  kuaishou: {
    fetcher: {}
  },
  xiaohongshu: {
    fetcher: {
      fetchNoteDetail: (...args: unknown[]) => (overrides.fetchNoteDetail ?? state.fetchXhsNoteDetail)(...args),
      searchNotes: (...args: unknown[]) => (overrides.searchNotes ?? state.searchXhsNotes)(...args)
    }
  }
})

describe('Amagi client config reload logging', () => {
  beforeEach(() => {
    resetGuestCookieRecoveryState()
    state.douyinCookie = 'douyin-secret-cookie-value'
    state.debug.mockReset()
    state.warn.mockReset()
    state.refreshPlatform.mockReset()
    state.refreshPlatform.mockResolvedValue(true)
    state.fetchXhsNoteDetail.mockReset()
    state.searchXhsNotes.mockReset()
    state.amagiClientFactory.mockReset()
    state.amagiClientFactory.mockImplementation(() => createMockAmagiClient())
  })

  it('does not log cookie content when reloading config', () => {
    const base = new AmagiBase()

    base.reloadConfig()

    const output = state.debug.mock.calls.map(call => String(call[0])).join('\n')
    expect(output).not.toContain('douyin-secret-cookie')
    expect(output).not.toContain('bilibili-secret-cookie')
    expect(output).not.toContain('xhs-secret-cookie')
    expect(output).toContain('length')
  })

  it('refreshes xiaohongshu guest cookie and retries when note detail is structurally empty', async () => {
    state.fetchXhsNoteDetail
      .mockResolvedValueOnce({
        success: true,
        code: 0,
        message: 'ok',
        data: {
          data: {
            items: [{}]
          }
        }
      })
      .mockResolvedValueOnce({
        success: true,
        code: 0,
        message: 'ok',
        data: {
          data: {
            items: [{ note_card: { title: '海风会让皮肤变得黏潮' } }]
          }
        }
      })

    const base = new AmagiBase()
    const result = await base.amagi.xiaohongshu.fetcher.fetchNoteDetail({
      note_id: '6a464e98000000002103c4cf',
      xsec_token: 'token'
    } as any)

    expect(state.fetchXhsNoteDetail).toHaveBeenCalledTimes(2)
    expect(state.refreshPlatform).toHaveBeenCalledWith('xiaohongshu', 'ensure')
    expect(result.data.data.items[0].note_card.title).toBe('海风会让皮肤变得黏潮')
  })

  it('refreshes douyin guest cookie and retries parseWork with the reloaded client instance', async () => {
    const staleError = new Error('抖音数据获取失败')
    Object.assign(staleError, {
      rawError: {
        errorDescription: '获取响应数据失败！接口返回内容为空，你的抖音ck可能已经失效！'
      }
    })

    const requestCookies: string[] = []
    const staleParseWork = vi.fn().mockImplementationOnce((_options, requestConfig) => {
      requestCookies.push({ ...requestConfig.headers }.Cookie)
      return Promise.reject(staleError)
    })
    const freshParseWork = vi.fn().mockImplementationOnce((_options, requestConfig) => {
      requestCookies.push({ ...requestConfig.headers }.Cookie)
      return Promise.resolve({
        success: true,
        code: 0,
        message: 'ok',
        data: {
          aweme_detail: {
            aweme_id: '7657916175708779685'
          }
        }
      })
    })

    state.amagiClientFactory
      .mockReset()
      .mockImplementationOnce(() => createMockAmagiClient({ parseWork: staleParseWork }))
      .mockImplementationOnce(() => createMockAmagiClient({ parseWork: freshParseWork }))
    state.douyinCookie = 'ttwid=config-old; transient_only=1'
    state.refreshPlatform.mockImplementationOnce(async () => {
      state.douyinCookie = 'ttwid=config-fresh; transient_only=1'
      return true
    })
    const requestHeaders: Record<string, string> = {}
    Object.defineProperty(requestHeaders, 'Cookie', {
      enumerable: true,
      get: () => state.douyinCookie
    })

    const base = new AmagiBase()
    const result = await base.amagi.douyin.fetcher.parseWork({
      aweme_id: '7657916175708779685',
      typeMode: 'strict'
    } as any, {
      headers: requestHeaders
    } as any)

    expect(staleParseWork).toHaveBeenCalledTimes(1)
    expect(freshParseWork).toHaveBeenCalledTimes(1)
    expect(state.amagiClientFactory).toHaveBeenCalledTimes(2)
    expect(state.refreshPlatform).toHaveBeenCalledWith('douyin', 'ensure')
    expect(requestCookies).toEqual([
      'ttwid=config-old; transient_only=1',
      'ttwid=config-fresh; transient_only=1'
    ])
    expect(result.data.aweme_detail.aweme_id).toBe('7657916175708779685')
  })

  it('refreshes xiaohongshu guest cookie and retries searchNotes with the reloaded client instance', async () => {
    const staleSearchNotes = vi.fn().mockResolvedValueOnce({
      success: false,
      code: 403,
      message: '小红书 cookie 失效',
      data: undefined,
      error: {
        errorDescription: 'a1= expired'
      }
    })
    const freshSearchNotes = vi.fn().mockResolvedValueOnce({
      success: true,
      code: 0,
      message: 'ok',
      data: {
        items: [{ id: 'note-1' }]
      }
    })

    state.amagiClientFactory
      .mockReset()
      .mockImplementationOnce(() => createMockAmagiClient({ searchNotes: staleSearchNotes }))
      .mockImplementationOnce(() => createMockAmagiClient({ searchNotes: freshSearchNotes }))

    const base = new AmagiBase()
    const result = await base.amagi.xiaohongshu.fetcher.searchNotes({
      keyword: '海风'
    } as any)

    expect(staleSearchNotes).toHaveBeenCalledTimes(1)
    expect(freshSearchNotes).toHaveBeenCalledTimes(1)
    expect(state.amagiClientFactory).toHaveBeenCalledTimes(2)
    expect(state.refreshPlatform).toHaveBeenCalledWith('xiaohongshu', 'ensure')
    expect(result.data.items[0].id).toBe('note-1')
  })
})
