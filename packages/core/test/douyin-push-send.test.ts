import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  addAwemeCache: vi.fn(async () => ({})),
  getBot: vi.fn(),
  getDouyinID: vi.fn(async () => ({ type: 'one_work' })),
  loggerWarn: vi.fn(),
  render: vi.fn(),
  sendRenderedImagesToContact: vi.fn(),
  shouldFilter: vi.fn(async () => false)
}))

vi.mock('node-karin', () => ({
  default: {
    contactGroup: (groupId: string) => ({ groupId, type: 'group' }),
    getBot: state.getBot,
    sendMsg: vi.fn()
  },
  common: {
    sleep: vi.fn()
  },
  logger: {
    blue: (value: unknown) => String(value),
    cyan: (value: unknown) => String(value),
    debug: vi.fn(),
    green: (value: unknown) => String(value),
    info: vi.fn(),
    magenta: (value: unknown) => String(value),
    mark: vi.fn(),
    red: (value: unknown) => String(value),
    trace: vi.fn(),
    warn: (...args: unknown[]) => state.loggerWarn(...args),
    yellow: (value: unknown) => String(value)
  }
}))

vi.mock('@/module/utils/Base', () => ({
  Base: class {
    e: any
    headers: Record<string, string> = {}
    amagi = {}

    constructor (e: any) {
      this.e = e
    }

    count (value: unknown) {
      return String(value ?? '')
    }

    desc (_detailData: unknown, value: string) {
      return value
    }

    reloadConfig () {}
  }
}))

vi.mock('@/module/db', () => ({
  cleanOldDynamicCache: vi.fn(async () => 0),
  douyinDB: {
    addAwemeCache: state.addAwemeCache,
    shouldFilter: state.shouldFilter,
    syncConfigSubscriptions: vi.fn(),
    updateLiveStatus: vi.fn()
  }
}))

vi.mock('@/module/utils/Config', () => ({
  Config: {
    app: {
      fakeForward: true
    },
    cookies: {
      douyin: ''
    },
    douyin: {
      push: {
        parsedynamic: false,
        shareType: 'douyin',
        switch: true
      }
    },
    pushlist: {
      douyin: []
    },
    upload: {},
    Modify: vi.fn()
  }
}))

vi.mock('@/module/utils/DouyinBrowserFallback', () => ({
  fetchDouyinUserPageByBrowser: vi.fn()
}))

vi.mock('@/module/utils/Network/constants', () => ({
  BASE_HEADERS: {}
}))

vi.mock('@/module/utils/Network/Network', () => ({
  Network: class {
    async getLocation () {
      return 'https://www.douyin.com/video/test'
    }
  }
}))

vi.mock('@/module/utils/Render', () => ({
  applyWatermarkToImages: (images: unknown[]) => images,
  Render: (...args: unknown[]) => state.render(...args),
  sendRenderedImagesToContact: (...args: unknown[]) => state.sendRenderedImagesToContact(...args)
}))

vi.mock('@/platform/douyin/articleContent', () => ({
  normalizeDouyinArticleContent: vi.fn()
}))

vi.mock('@/platform/douyin/douyin', () => ({
  DouYin: class {}
}))

vi.mock('@/platform/douyin/getID', () => ({
  getDouyinID: (...args: unknown[]) => state.getDouyinID(...args)
}))

vi.mock('@/platform/douyin/workType', () => ({
  getDouyinShareableVideoUrl: vi.fn(() => 'https://www.douyin.com/video/test'),
  getWorkCoverUrl: vi.fn(() => 'https://example.com/cover.jpg'),
  getWorkTypeDisplayName: vi.fn(() => '视频'),
  getWorkTypeInfo: vi.fn(() => ({
    isArticle: false,
    isLive: false,
    isVideo: true,
    templatePath: 'douyin/video-work'
  }))
}))

vi.mock('../src/platform/douyin/push/cookie', () => ({
  assertSuccessfulDouyinPushResult: (result: unknown) => result,
  prepareDouyinPushCookie: vi.fn(async () => true),
  retryDouyinPushAfterCookieRefresh: async (operation: () => Promise<unknown>) => await operation(),
  shouldFallbackDouyinUserPageAfterError: vi.fn(() => false)
}))

vi.mock('../src/platform/douyin/push/favorite', () => ({
  processFavoriteList: vi.fn()
}))

vi.mock('../src/platform/douyin/push/live', () => ({
  processLiveStream: vi.fn()
}))

vi.mock('../src/platform/douyin/push/post', () => ({
  processPostList: vi.fn()
}))

vi.mock('../src/platform/douyin/push/recommend', () => ({
  processRecommendList: vi.fn()
}))

const { DouYinpush } = await import('../src/platform/douyin/push')

const createFavoritePushItem = (awemeId: string, targets = [{ groupId: 'group-1', botId: 'bot-1' }]) => ({
  remark: '订阅者',
  sec_uid: 'subscriber-sec',
  create_time: Math.floor(Date.now() / 1000),
  targets,
  pushType: 'favorite',
  Detail_Data: {
    aweme_id: awemeId,
    author: {
      avatar_thumb: {
        uri: 'author-avatar'
      },
      nickname: '原作品作者',
      short_id: 'author-short-id'
    },
    desc: '测试作品',
    share_url: `https://www.douyin.com/video/${awemeId}`,
    statistics: {
      collect_count: 0,
      comment_count: 0,
      digg_count: 0,
      recommend_count: 0,
      share_count: 0
    },
    user_info: {
      data: {
        user: {
          avatar_larger: {
            uri: 'subscriber-avatar'
          },
          follower_count: 100,
          following_count: 20,
          total_favorited: 300,
          short_id: 'subscriber-short-id',
          unique_id: 'subscriber-id'
        }
      }
    },
    video: {}
  },
  avatar_img: '',
  living: false
}) as any

const createPostPushItem = (awemeId: string, desc: string) => ({
  ...createFavoritePushItem(awemeId),
  pushType: 'post',
  Detail_Data: {
    ...createFavoritePushItem(awemeId).Detail_Data,
    desc,
    preview_title: '推送预览标题',
    create_time: Math.floor(Date.now() / 1000),
    video: {
      duration: 90000,
      width: 1080,
      height: 1920,
      ratio: '1080p'
    }
  }
}) as any

describe('Douyin push send reliability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.addAwemeCache.mockResolvedValue({})
    state.getBot.mockReturnValue({
      account: {
        name: '测试 Bot',
        selfId: 'bot-1'
      }
    })
    state.getDouyinID.mockResolvedValue({ type: 'one_work' })
    state.render.mockResolvedValue([{ file: 'rendered-card', type: 'image' }])
    state.sendRenderedImagesToContact.mockResolvedValue({ message_id: 'message-1' })
    state.shouldFilter.mockResolvedValue(false)
  })

  it('uses work author data when the extra author profile is unavailable and keeps the real aweme id', async () => {
    await expect(new DouYinpush({} as any).getdata({
      'favorite_subscriber-sec_aweme-1': createFavoritePushItem('aweme-1')
    })).resolves.toBe(true)

    const renderPayload = state.render.mock.calls[0]?.[2]
    expect(state.render.mock.calls[0]?.[1]).toBe('douyin/favorite-list')
    expect(renderPayload).toMatchObject({
      author_avatar: 'https://p3-pc.douyinpic.com/aweme/1080x1080/author-avatar',
      author_douyin_id: 'author-short-id',
      author_username: '原作品作者'
    })
    expect(state.sendRenderedImagesToContact.mock.calls[0]?.[2]?.forwardIdentity).toBeUndefined()
    expect(state.addAwemeCache).toHaveBeenCalledWith('aweme-1', 'subscriber-sec', 'group-1', 'favorite')
  })

  it('uses the long text card for ordinary post subscriptions with long descriptions', async () => {
    const longText = '这是一条超过二十五个字的普通抖音作品订阅说明，推送时应该完整显示全部正文内容'

    await expect(new DouYinpush({} as any).getdata({
      'post_subscriber-sec_aweme-long': createPostPushItem('aweme-long', longText)
    })).resolves.toBe(true)

    expect(state.render).toHaveBeenCalledWith(
      expect.anything(),
      'douyin/long-text-work',
      expect.objectContaining({
        text: longText,
        work_type: '视频',
        dynamicTYPE: '作品动态推送'
      }),
      { skipWatermark: true }
    )
    expect(state.addAwemeCache).toHaveBeenCalledWith('aweme-long', 'subscriber-sec', 'group-1', 'post')
  })

  it('keeps ordinary post subscriptions with short descriptions on the existing work template', async () => {
    await expect(new DouYinpush({} as any).getdata({
      'post_subscriber-sec_aweme-short': createPostPushItem('aweme-short', '短标题作品')
    })).resolves.toBe(true)

    expect(state.render.mock.calls[0]?.[1]).toBe('douyin/video-work')
    expect(state.render).not.toHaveBeenCalledWith(
      expect.anything(),
      'douyin/long-text-work',
      expect.anything(),
      expect.anything()
    )
  })

  it.each([
    { pushType: 'favorite', template: 'douyin/favorite-list' },
    { pushType: 'recommend', template: 'douyin/recommend-list' }
  ])('keeps long $pushType pushes on their special context card', async ({ pushType, template }) => {
    const item = createFavoritePushItem(`aweme-${pushType}`)
    item.pushType = pushType
    item.Detail_Data.desc = '这条特殊上下文推送的作品说明同样超过二十五个字，但不应该覆盖喜欢或推荐语义'

    await expect(new DouYinpush({} as any).getdata({
      [`${pushType}_subscriber-sec_aweme-${pushType}`]: item
    })).resolves.toBe(true)

    expect(state.render.mock.calls[0]?.[1]).toBe(template)
    expect(state.render).not.toHaveBeenCalledWith(
      expect.anything(),
      'douyin/long-text-work',
      expect.anything(),
      expect.anything()
    )
  })

  it('continues with later candidates when rendering one candidate fails', async () => {
    state.render
      .mockRejectedValueOnce(new Error('render failed'))
      .mockResolvedValueOnce([{ file: 'second-card', type: 'image' }])

    await expect(new DouYinpush({} as any).getdata({
      'favorite_subscriber-sec_aweme-failed': createFavoritePushItem('aweme-failed'),
      'favorite_subscriber-sec_aweme-recovered': createFavoritePushItem('aweme-recovered')
    })).resolves.toBe(true)

    expect(state.sendRenderedImagesToContact).toHaveBeenCalledTimes(1)
    expect(state.addAwemeCache).toHaveBeenCalledWith('aweme-recovered', 'subscriber-sec', 'group-1', 'favorite')
    expect(state.addAwemeCache).not.toHaveBeenCalledWith('aweme-failed', 'subscriber-sec', 'group-1', 'favorite')
  })

  it('continues with later targets when one group send fails', async () => {
    state.sendRenderedImagesToContact
      .mockRejectedValueOnce(new Error('group send failed'))
      .mockResolvedValueOnce({ message_id: 'message-2' })

    await expect(new DouYinpush({} as any).getdata({
      'favorite_subscriber-sec_aweme-targets': createFavoritePushItem('aweme-targets', [
        { groupId: 'group-failed', botId: 'bot-1' },
        { groupId: 'group-success', botId: 'bot-1' }
      ])
    })).resolves.toBe(true)

    expect(state.sendRenderedImagesToContact).toHaveBeenCalledTimes(2)
    expect(state.addAwemeCache).toHaveBeenCalledWith('aweme-targets', 'subscriber-sec', 'group-success', 'favorite')
    expect(state.addAwemeCache).not.toHaveBeenCalledWith('aweme-targets', 'subscriber-sec', 'group-failed', 'favorite')
  })
})
