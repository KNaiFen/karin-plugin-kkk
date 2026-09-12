import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  addDynamicCache: vi.fn(),
  dbDel: vi.fn(),
  dbGet: vi.fn(),
  dbSet: vi.fn(),
  fetchDynamicList: vi.fn(),
  fetchArticleContent: vi.fn(),
  fetchArticleInfo: vi.fn(),
  fetchUserCard: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  getBot: vi.fn(),
  getGroupSubscriptions: vi.fn(),
  karinSendMsg: vi.fn(),
  shouldFilter: vi.fn()
}))

vi.mock('@ikenxuan/amagi', () => ({
  default: vi.fn(() => ({})),
  DynamicType: {
    ARTICLE: 'DYNAMIC_TYPE_ARTICLE',
    AV: 'DYNAMIC_TYPE_AV',
    DRAW: 'DYNAMIC_TYPE_DRAW',
    FORWARD: 'DYNAMIC_TYPE_FORWARD',
    LIVE_RCMD: 'DYNAMIC_TYPE_LIVE_RCMD',
    WORD: 'DYNAMIC_TYPE_WORD'
  },
  MajorType: {
    DRAW: 'MAJOR_TYPE_DRAW',
    LIVE_RCMD: 'MAJOR_TYPE_LIVE_RCMD',
    OPUS: 'MAJOR_TYPE_OPUS'
  }
}))

vi.mock('node-karin', () => ({
  default: {
    contactGroup: (groupId: string) => ({ type: 'group', groupId }),
    getAllBotID: vi.fn(() => ['bot-1']),
    getBot: state.getBot,
    sendMsg: state.karinSendMsg
  },
  db: {
    get: (...args: unknown[]) => state.dbGet(...args),
    set: (...args: unknown[]) => state.dbSet(...args),
    del: (...args: unknown[]) => state.dbDel(...args)
  },
  common: {
    makeForward: vi.fn(() => ({})),
    sleep: vi.fn()
  },
  logger: {
    blue: (text: string) => text,
    cyan: (text: string) => text,
    debug: vi.fn(),
    green: (text: string) => text,
    info: (...args: unknown[]) => state.loggerInfo(...args),
    mark: vi.fn(),
    red: (text: string) => text,
    trace: vi.fn(),
    warn: (...args: unknown[]) => state.loggerWarn(...args),
    yellow: (text: string) => text
  },
  segment: {
    image: (file: string) => ({ type: 'image', file }),
    reply: (messageId: string) => ({ type: 'reply', messageId }),
    text: (text: string) => ({ type: 'text', text }),
    video: (file: string) => ({ type: 'video', file })
  }
}))

vi.mock('@/module', () => ({
  applyWatermarkToImages: (images: unknown[]) => images,
  Base: class {
    e: any
    amagi: any

    constructor (e: any) {
      this.e = e
      this.amagi = {}
    }
  },
  baseHeaders: {},
  bilibiliDB: {
    addDynamicCache: state.addDynamicCache,
    getGroupSubscriptions: state.getGroupSubscriptions,
    isDynamicPushed: vi.fn(async () => false),
    shouldFilter: state.shouldFilter,
    syncConfigSubscriptions: vi.fn()
  },
  buildGoogleMotionPhoto: vi.fn(),
  cleanOldDynamicCache: vi.fn(async () => 0),
  Common: {
    removeFile: vi.fn(),
    tempDri: {
      cache: {
        root: '/private/tmp/cache/',
        derived: '/private/tmp/cache/derived/',
        media: '/private/tmp/cache/media/'
      },
      images: '/private/tmp/',
      video: '/private/tmp/'
    },
    useDarkTheme: vi.fn(() => false)
  },
  Count: (count: number) => String(count),
  downloadFile: vi.fn(),
  loopVideoWithTransition: vi.fn(),
  mergeVideoAudio: vi.fn(),
  processImageUrl: vi.fn(async (url: string) => url),
  Render: vi.fn(async () => [{ type: 'image', file: 'rendered-card' }]),
  sendRenderedImagesToContact: vi.fn(async (_event: unknown, images: unknown[], options: Record<string, any>) => {
    return await options.sendDirect(images)
  }),
  uploadFile: vi.fn()
}))

vi.mock('@/module/utils/amagiClient', () => ({
  AmagiBase: class {
    amagi = {}

    reloadConfig () {}
  },
  bilibiliFetcher: {}
}))

vi.mock('@/module/utils/Common', () => ({
  Common: {
    removeFile: vi.fn(),
    tempDri: {
      cache: {
        root: '/private/tmp/cache/',
        derived: '/private/tmp/cache/derived/',
        media: '/private/tmp/cache/media/'
      },
      images: '/private/tmp/',
      video: '/private/tmp/'
    },
    useDarkTheme: vi.fn(() => false)
  }
}))

vi.mock('@/module/db', () => ({
  bilibiliDB: {
    addDynamicCache: state.addDynamicCache,
    getGroupSubscriptions: state.getGroupSubscriptions,
    isDynamicPushed: vi.fn(async () => false),
    shouldFilter: state.shouldFilter,
    syncConfigSubscriptions: vi.fn()
  },
  cleanOldDynamicCache: vi.fn(async () => 0)
}))

vi.mock('@/module/utils/Render', () => ({
  applyWatermarkToImages: (images: unknown[]) => images,
  Render: vi.fn(async () => [{ type: 'image', file: 'rendered-card' }]),
  sendRenderedImagesToContact: vi.fn(async (_event: unknown, images: unknown[], options: Record<string, any>) => {
    return await options.sendDirect(images)
  })
}))

vi.mock('@/module/utils/ImageHelper', () => ({
  processImageUrl: vi.fn(async (url: string) => url)
}))

vi.mock('@/module/utils/Config', () => ({
  Config: {
    app: {
      livePhotoMode: 'video_and_livephoto',
      removeCache: false
    },
    bilibili: {
      imageLayout: 'grid',
      push: {
        jitterSeconds: 0,
        parsedynamic: true,
        pushMaxAutoVideoSize: 500,
        pushVideoQuality: 80,
        riskCooldownEnabled: true,
        riskCooldownMs: 3600000,
        switch: true
      }
    },
    cookies: {
      bilibili: ''
    },
    pushlist: {
      bilibili: []
    },
    upload: {
      compress: false,
      filelimit: 100,
      groupfilevalue: 100,
      imageSendMode: 'file',
      usefilelimit: false,
      videoSendMode: 'file'
    },
    Modify: vi.fn()
  }
}))

vi.mock('@/platform/bilibili/cdnSelector', () => ({
  collectBilibiliCdnBackupUrls: vi.fn(() => []),
  preferBilibiliNonMcdnUrls: (stream: unknown) => stream
}))

vi.mock('@/platform/bilibili', () => ({
  bilibiliProcessVideos: vi.fn(),
  extractArticleImages: vi.fn(() => ['https://image.example/article.jpg']),
  generateDecorationCard: vi.fn(() => null),
  getvideosize: vi.fn(),
  parseAdditionalCard: vi.fn(() => null),
  TimeFormatter: {
    now: () => 'now',
    toDateTime: () => 'date'
  }
}))

vi.mock('@/platform/bilibili/bilibili', () => ({
  bilibiliProcessVideos: vi.fn(),
  extractArticleImages: vi.fn(() => ['https://image.example/article.jpg']),
  generateDecorationCard: vi.fn(() => null),
  getvideosize: vi.fn(),
  parseAdditionalCard: vi.fn(() => null),
  TimeFormatter: {
    now: () => 'now',
    toDateTime: () => 'date'
  }
}))

vi.mock('@/platform/bilibili/dynamic-text', () => ({
  buildBilibiliArticleRichText: vi.fn(() => []),
  buildBilibiliDynamicRichText: vi.fn((text: string) => text),
  buildBilibiliVideoDescRichText: vi.fn(() => ''),
  getUsernameMetadata: vi.fn(() => ({}))
}))

const { Bilibilipush } = await import('../src/platform/bilibili/push')

const createArticlePushData = () => ({
  'dynamic-1': {
    remark: '测试UP',
    host_mid: 123456,
    create_time: Math.floor(Date.now() / 1000),
    targets: [{ groupId: 'group-1', botId: 'bot-1' }],
    Dynamic_Data: {
      type: 'DYNAMIC_TYPE_ARTICLE',
      id_str: 'dynamic-1',
      basic: {
        rid_str: '10001'
      },
      modules: {
        module_author: {
          decoration_card: null,
          face: 'https://avatar.example/up.jpg',
          mid: 123456,
          name: '测试UP',
          pendant: {
            image: ''
          },
          pub_ts: Math.floor(Date.now() / 1000)
        },
        module_dynamic: {},
        module_stat: {
          comment: { count: 0 },
          forward: { count: 0 },
          like: { count: 0 }
        }
      }
    },
    avatar_img: 'https://avatar.example/up.jpg',
    dynamic_type: 'DYNAMIC_TYPE_ARTICLE'
  }
} as any)

const createPush = () => {
  const push = new Bilibilipush({ msg: '全部', selfId: 'bot-1' } as any)
  push.amagi = {
    bilibili: {
      fetcher: {
        fetchUserDynamicList: state.fetchDynamicList,
        fetchArticleContent: state.fetchArticleContent,
        fetchArticleInfo: state.fetchArticleInfo,
        fetchUserCard: state.fetchUserCard
      }
    }
  } as any
  return push
}

describe('Bilibili push reliability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.dbGet.mockResolvedValue(null)
    state.dbSet.mockResolvedValue(undefined)
    state.dbDel.mockResolvedValue(undefined)
    state.fetchDynamicList.mockResolvedValue({
      data: {
        data: {
          items: []
        }
      }
    })
    state.karinSendMsg.mockResolvedValue({ messageId: 'card-message' })
    state.shouldFilter.mockResolvedValue(false)
    state.fetchUserCard.mockResolvedValue({
      data: {
        data: {
          card: {
            attention: 0,
            face: 'https://avatar.example/up.jpg'
          },
          follower: 0,
          like_num: 0
        }
      }
    })
    state.fetchArticleInfo.mockResolvedValue({
      data: {
        data: {
          banner_url: '',
          categories: [],
          image_urls: [],
          stats: {},
          summary: 'summary',
          title: 'article title',
          words: 100
        }
      }
    })
    state.fetchArticleContent.mockResolvedValue({
      data: {
        data: {
          content: {},
          dyn_id_str: 'dynamic-1',
          id: 10001,
          opus: {},
          title: 'article title'
        }
      }
    })
  })

  it('does not cache a single-image article push when the image send has no message id', async () => {
    state.getBot.mockReturnValue({
      account: { name: 'bot' },
      sendMsg: vi.fn(async () => ({ messageId: '' }))
    })

    await createPush().getdata(createArticlePushData())

    expect(state.addDynamicCache).not.toHaveBeenCalled()
  })

  it('caches a single-image article push after the image send succeeds', async () => {
    state.getBot.mockReturnValue({
      account: { name: 'bot' },
      sendMsg: vi.fn(async () => ({ messageId: 'article-image-message' }))
    })

    await createPush().getdata(createArticlePushData())

    expect(state.addDynamicCache).toHaveBeenCalledWith(
      'dynamic-1',
      123456,
      'group-1',
      'DYNAMIC_TYPE_ARTICLE'
    )
  })

  it('returns the send result from force push', async () => {
    const push = new Bilibilipush({ msg: '全部', selfId: 'bot-1', groupId: 'group-1' } as any)
    const getdata = vi.spyOn(push, 'getdata').mockResolvedValue(true as any)

    await expect(push.forcepush(createArticlePushData())).resolves.toBe(true)
    expect(getdata).toHaveBeenCalled()
  })

  it('skips push action while risk cooldown is active', async () => {
    state.dbGet.mockResolvedValueOnce(Date.now() + 10 * 60 * 1000)
    const push = createPush()
    const syncConfigToDatabase = vi.spyOn(push, 'syncConfigToDatabase').mockResolvedValue(undefined as any)
    const getDynamicList = vi.spyOn(push, 'getDynamicList')

    await expect(push.action()).resolves.toBe(true)

    expect(syncConfigToDatabase).not.toHaveBeenCalled()
    expect(getDynamicList).not.toHaveBeenCalled()
  })

  it('records risk cooldown when user dynamic fetch hits bilibili risk control', async () => {
    const push = createPush()
    state.fetchDynamicList.mockResolvedValueOnce({
      success: false,
      code: -352,
      message: '风控',
      data: {
        code: -352
      },
      error: {
        errorDescription: '风控',
        requestType: 'userDynamicList',
        requestUrl: 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space'
      }
    })

    await expect(push.getDynamicList([{
      switch: true,
      host_mid: 672328094,
      remark: '测试UP',
      group_id: ['group-1:bot-1'],
      pushTypes: ['video']
    } as any])).rejects.toThrow()

    expect(state.dbSet).toHaveBeenCalledTimes(1)
    expect(state.dbSet.mock.calls[0]?.[0]).toBe('kkk:bilibili-push:risk-cooldown-until')
    expect(Number(state.dbSet.mock.calls[0]?.[1])).toBeGreaterThan(Date.now())
  })

  it('passes conservative web-like user dynamic params to the fetcher', async () => {
    const push = createPush()

    await push.getDynamicList([{
      switch: true,
      host_mid: 672328094,
      remark: '测试UP',
      group_id: ['group-1:bot-1'],
      pushTypes: ['video']
    } as any])

    expect(state.fetchDynamicList).toHaveBeenCalledWith(expect.objectContaining({
      host_mid: 672328094,
      timezone_offset: -480,
      web_location: '333.1387',
      deviceReqJson: '{"platform":"web","device":"pc","spmid":"333.1387"}',
      typeMode: 'strict'
    }))
  })
})
