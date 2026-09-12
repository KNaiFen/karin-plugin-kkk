import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  sleep: vi.fn(async () => {}),
  info: vi.fn(),
  warn: vi.fn(),
  trace: vi.fn(),
  debug: vi.fn(),
  mark: vi.fn(),
  addAwemeCache: vi.fn(async () => ({})),
  getLiveStatus: vi.fn(async () => ({ living: false })),
  hasHistory: vi.fn(async () => false),
  isAwemePushed: vi.fn(async () => false),
  syncConfigSubscriptions: vi.fn(async () => {}),
  fetchUserProfile: vi.fn(),
  fetchUserVideoList: vi.fn(),
  fetchDouyinUserPageByBrowser: vi.fn()
}))

vi.mock('node-karin', () => ({
  default: {
    getAllBotID: vi.fn(() => ['bot-1']),
    getBot: vi.fn(),
    contactGroup: vi.fn()
  },
  common: {
    sleep: state.sleep
  },
  logger: {
    blue: (value: unknown) => String(value),
    cyan: (value: unknown) => String(value),
    debug: state.debug,
    green: (value: unknown) => String(value),
    info: state.info,
    mark: state.mark,
    red: (value: unknown) => String(value),
    trace: state.trace,
    warn: state.warn,
    yellow: (value: unknown) => String(value)
  }
}))

vi.mock('@ikenxuan/amagi', () => ({
  default: vi.fn(() => ({}))
}))

vi.mock('@/module', () => ({
  Base: class {
    e: any
    headers = {}
    amagi: any

    constructor (e: any) {
      this.e = e
      this.amagi = {
        douyin: {
          fetcher: {
            fetchUserProfile: state.fetchUserProfile,
            fetchUserVideoList: state.fetchUserVideoList
          }
        }
      }
    }
  },
  baseHeaders: {},
  buildGoogleMotionPhoto: vi.fn(),
  cleanOldDynamicCache: vi.fn(async () => 0),
  Common: {
    tempDri: {
      cache: {
        root: '/tmp/karin-plugin-kkk/cache',
        derived: '/tmp/karin-plugin-kkk/cache/derived',
        media: '/tmp/karin-plugin-kkk/cache/media'
      },
      video: '/tmp/karin-plugin-kkk/video'
    }
  },
  douyinDB: {
    addAwemeCache: state.addAwemeCache,
    getLiveStatus: state.getLiveStatus,
    hasHistory: state.hasHistory,
    isAwemePushed: state.isAwemePushed,
    syncConfigSubscriptions: state.syncConfigSubscriptions,
    updateLiveStatus: vi.fn()
  },
  downloadFile: vi.fn(),
  downloadVideo: vi.fn(),
  fetchDouyinUserPageByBrowser: state.fetchDouyinUserPageByBrowser,
  fileInfo: class {},
  loopVideoWithTransition: vi.fn(),
  Networks: class {},
  processImageUrl: vi.fn(),
  Render: vi.fn(),
  sendRenderedImagesToContact: vi.fn()
}))

vi.mock('@/module/utils/Base', () => ({
  Base: class {
    e: any
    headers: Record<string, string> = {}
    amagi = {
      douyin: {
        fetcher: {
          fetchUserProfile: state.fetchUserProfile,
          fetchUserVideoList: state.fetchUserVideoList
        }
      }
    }

    constructor (e: any) {
      this.e = e
    }

    reloadConfig () {}
  }
}))

vi.mock('@/module/utils/DouyinBrowserFallback', () => ({
  fetchDouyinUserPageByBrowser: (...args: unknown[]) => state.fetchDouyinUserPageByBrowser(...args)
}))

vi.mock('@/module/db', () => ({
  cleanOldDynamicCache: vi.fn(async () => 0),
  douyinDB: {
    addAwemeCache: state.addAwemeCache,
    getLiveStatus: state.getLiveStatus,
    hasHistory: state.hasHistory,
    isAwemePushed: state.isAwemePushed,
    syncConfigSubscriptions: state.syncConfigSubscriptions,
    updateLiveStatus: vi.fn()
  }
}))

vi.mock('@/module/utils/amagiClient', () => ({
  AmagiBase: class {
    amagi: any

    constructor () {
      this.amagi = {
        douyin: {
          fetcher: {}
        }
      }
    }

    reloadConfig () {}
  },
  douyinFetcher: {
    fetchUserProfile: vi.fn()
  }
}))

vi.mock('@/platform/douyin', () => ({
  douyinProcessVideos: vi.fn(),
  getDouyinID: vi.fn(async () => ({ type: 'one_work' }))
}))

vi.mock('@/module/utils/Config', () => ({
  Config: {
    cookies: {
      douyin: ''
    },
    pushlist: {
      douyin: []
    },
    douyin: {
      push: {
        switch: true
      }
    },
    app: {},
    upload: {},
    Modify: vi.fn()
  }
}))

vi.mock('../src/platform/douyin/push/cookie', () => ({
  assertSuccessfulDouyinPushResult: (result: any) => result,
  prepareDouyinPushCookie: vi.fn(async () => true),
  retryDouyinPushAfterCookieRefresh: async (operation: () => Promise<unknown>) => await operation(),
  shouldFallbackDouyinUserPageAfterError: vi.fn(() => false)
}))

const { DouYinpush } = await import('../src/platform/douyin/push')

const nowSeconds = Math.floor(Date.now() / 1000)

const createAweme = (awemeId: string, createTime: number) => ({
  aweme_id: awemeId,
  create_time: createTime,
  is_top: 0,
  desc: `作品 ${awemeId}`,
  author: {
    nickname: '测试用户'
  }
})

describe('Douyin push post lookback window', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.addAwemeCache.mockResolvedValue({})
    state.hasHistory.mockResolvedValue(false)
    state.isAwemePushed.mockResolvedValue(false)

    state.fetchUserProfile.mockResolvedValue({
      success: true,
      code: 200,
      message: 'ok',
      data: {
        user: {
          nickname: '测试用户',
          live_status: 0,
          aweme_count: 40,
          avatar_larger: {
            uri: 'avatar-uri'
          },
          unique_id: 'tester',
          short_id: 'tester',
          follower_count: 0,
          total_favorited: 0,
          following_count: 0
        }
      }
    })
    state.fetchDouyinUserPageByBrowser.mockResolvedValue({
      profile: {
        user: {
          nickname: '测试用户',
          live_status: 0,
          aweme_count: 40,
          avatar_larger: {
            uri: 'avatar-uri'
          },
          unique_id: 'tester',
          short_id: 'tester',
          follower_count: 0,
          total_favorited: 0,
          following_count: 0
        }
      },
      postList: {
        aweme_list: []
      }
    })
  })

  it('requests a larger post lookback window so recent posts beyond the first 15 are still detected', async () => {
    const awemeList = Array.from({ length: 20 }, (_, index) => {
      if (index === 15) {
        return createAweme('fresh-aweme', nowSeconds - 60)
      }

      return createAweme(`old-aweme-${index}`, nowSeconds - (48 * 3600) - index)
    })

    state.fetchUserVideoList.mockResolvedValue({
      success: true,
      code: 200,
      message: 'ok',
      data: {
        aweme_list: awemeList,
        has_more: false,
        max_cursor: '0'
      }
    })

    const push = new DouYinpush({ sender: { userId: 'u1', nick: 'tester' } } as any)
    const result = await push.getDynamicList([{
      sec_uid: 'sec-user',
      short_id: 'tester',
      remark: '测试用户',
      switch: true,
      pushTypes: ['post'],
      group_id: ['group-1:bot-1']
    }] as any)

    expect(state.fetchUserVideoList).toHaveBeenCalledWith({
      sec_uid: 'sec-user',
      number: 50,
      typeMode: 'strict'
    })
    expect(Object.keys(result)).toContain('post_sec-user_fresh-aweme')
  })

  it('falls back to browser post responses when the API succeeds but returns a truncated user post list', async () => {
    const apiAwemeList = Array.from({ length: 14 }, (_, index) => {
      if (index === 13) {
        return createAweme('api-fresh-aweme', nowSeconds - 60)
      }

      return createAweme(`api-old-aweme-${index}`, nowSeconds - (48 * 3600) - index)
    })

    const browserAwemeList = Array.from({ length: 17 }, (_, index) => {
      if (index === 16) {
        return createAweme('browser-fresh-aweme', nowSeconds - 30)
      }

      return createAweme(`browser-old-aweme-${index}`, nowSeconds - (48 * 3600) - index)
    })

    state.fetchUserVideoList.mockResolvedValue({
      success: true,
      code: 200,
      message: 'ok',
      data: {
        aweme_list: apiAwemeList
      }
    })

    state.fetchDouyinUserPageByBrowser.mockResolvedValue({
      profile: {
        user: {
          nickname: '测试用户',
          live_status: 0,
          aweme_count: 40,
          avatar_larger: {
            uri: 'avatar-uri'
          },
          unique_id: 'tester',
          short_id: 'tester',
          follower_count: 0,
          total_favorited: 0,
          following_count: 0
        }
      },
      postList: {
        aweme_list: browserAwemeList
      }
    })

    const push = new DouYinpush({ sender: { userId: 'u1', nick: 'tester' } } as any)
    const result = await push.getDynamicList([{
      sec_uid: 'sec-user',
      short_id: 'tester',
      remark: '测试用户',
      switch: true,
      pushTypes: ['post'],
      group_id: ['group-1:bot-1']
    }] as any)

    expect(state.fetchDouyinUserPageByBrowser).toHaveBeenCalledWith('sec-user')
    expect(Object.keys(result)).toContain('post_sec-user_browser-fresh-aweme')
    expect(Object.keys(result)).not.toContain('post_sec-user_api-fresh-aweme')
  })

  it('falls back to browser post responses when a user with published works receives an empty API list', async () => {
    state.fetchUserVideoList.mockResolvedValue({
      success: true,
      code: 200,
      message: 'ok',
      data: {
        aweme_list: []
      }
    })
    state.fetchDouyinUserPageByBrowser.mockResolvedValue({
      profile: {
        user: {
          nickname: '测试用户',
          live_status: 0,
          aweme_count: 40,
          avatar_larger: { uri: 'avatar-uri' },
          unique_id: 'tester',
          short_id: 'tester',
          follower_count: 0,
          total_favorited: 0,
          following_count: 0
        }
      },
      postList: {
        aweme_list: [createAweme('browser-empty-list-fresh', nowSeconds - 30)]
      }
    })

    const push = new DouYinpush({ sender: { userId: 'u1', nick: 'tester' } } as any)
    const result = await push.getDynamicList([{
      sec_uid: 'sec-user',
      short_id: 'tester',
      remark: '测试用户',
      switch: true,
      pushTypes: ['post'],
      group_id: ['group-1:bot-1']
    }] as any)

    expect(state.fetchDouyinUserPageByBrowser).toHaveBeenCalledWith('sec-user')
    expect(Object.keys(result)).toContain('post_sec-user_browser-empty-list-fresh')
  })

  it('keeps the API post list when browser compensation is unavailable', async () => {
    state.fetchUserVideoList.mockResolvedValue({
      success: true,
      code: 200,
      message: 'ok',
      data: {
        aweme_list: [createAweme('api-fresh-when-browser-fails', nowSeconds - 30)]
      }
    })
    state.fetchDouyinUserPageByBrowser.mockRejectedValue(new Error('browser unavailable'))

    const push = new DouYinpush({ sender: { userId: 'u1', nick: 'tester' } } as any)
    const result = await push.getDynamicList([{
      sec_uid: 'sec-user',
      short_id: 'tester',
      remark: '测试用户',
      switch: true,
      pushTypes: ['post'],
      group_id: ['group-1:bot-1']
    }] as any)

    expect(Object.keys(result)).toContain('post_sec-user_api-fresh-when-browser-fails')
  })

  it('continues checking later subscriptions when one user lookup fails', async () => {
    state.fetchUserProfile.mockRejectedValueOnce(new Error('profile request failed'))
    state.fetchUserVideoList.mockResolvedValue({
      success: true,
      code: 200,
      message: 'ok',
      data: {
        aweme_list: [createAweme('healthy-user-fresh', nowSeconds - 30)]
      }
    })

    const push = new DouYinpush({ sender: { userId: 'u1', nick: 'tester' } } as any)
    const result = await push.getDynamicList([{
      sec_uid: 'broken-user',
      short_id: 'broken',
      remark: '失败用户',
      switch: true,
      pushTypes: ['post'],
      group_id: ['group-1:bot-1']
    }, {
      sec_uid: 'healthy-user',
      short_id: 'healthy',
      remark: '正常用户',
      switch: true,
      pushTypes: ['post'],
      group_id: ['group-1:bot-1']
    }] as any)

    expect(state.fetchUserProfile).toHaveBeenCalledTimes(2)
    expect(Object.keys(result)).toContain('post_healthy-user_healthy-user-fresh')
  })

  it('writes old posts into a first-subscription baseline but can later recover an unpushed old post', async () => {
    state.fetchUserVideoList.mockResolvedValue({
      success: true,
      code: 200,
      message: 'ok',
      data: {
        aweme_list: [createAweme('recoverable-old-post', nowSeconds - (48 * 3600))]
      }
    })

    const subscription = [{
      sec_uid: 'sec-user',
      short_id: 'tester',
      remark: '测试用户',
      switch: true,
      pushTypes: ['post'],
      group_id: ['group-1:bot-1']
    }] as any
    const push = new DouYinpush({ sender: { userId: 'u1', nick: 'tester' } } as any)

    await expect(push.getDynamicList(subscription)).resolves.toEqual({})
    expect(state.addAwemeCache).toHaveBeenCalledWith('recoverable-old-post', 'sec-user', 'group-1', 'post')

    state.hasHistory.mockResolvedValue(true)
    const recovered = await push.getDynamicList(subscription)

    expect(Object.keys(recovered)).toContain('post_sec-user_recoverable-old-post')
  })

  it('keeps same-id candidates from different subscriptions independent', async () => {
    state.fetchUserVideoList.mockImplementation(async () => ({
      success: true,
      code: 200,
      message: 'ok',
      data: {
        aweme_list: [createAweme('shared-aweme-id', nowSeconds - 30)]
      }
    }))

    const push = new DouYinpush({ sender: { userId: 'u1', nick: 'tester' } } as any)
    const result = await push.getDynamicList([{
      sec_uid: 'sec-user-a',
      short_id: 'a',
      remark: '用户 A',
      switch: true,
      pushTypes: ['post'],
      group_id: ['group-1:bot-1']
    }, {
      sec_uid: 'sec-user-b',
      short_id: 'b',
      remark: '用户 B',
      switch: true,
      pushTypes: ['post'],
      group_id: ['group-2:bot-1']
    }] as any)

    expect(state.fetchUserVideoList).toHaveBeenCalledTimes(2)
    expect(Object.keys(result)).toEqual(expect.arrayContaining([
      'post_sec-user-a_shared-aweme-id',
      'post_sec-user-b_shared-aweme-id'
    ]))
  })
})
