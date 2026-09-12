import { beforeEach, describe, expect, it, vi } from 'vitest'

const MB = 1024 * 1024

const state = vi.hoisted(() => {
  const config = {
    app: {
      parseTip: false,
      removeCache: true
    },
    bilibili: {
      burnDanmaku: false,
      danmakuArea: 0,
      displayContent: [],
      maxAutoVideoSize: 50,
      numcomment: 3,
      realCommentCount: false,
      sendContent: ['video'],
      verticalMode: false,
      videoCodec: 'h264',
      videoInfoMode: 'text',
      videoQuality: 127
    },
    cookies: {
      bilibili: 'bili-cookie'
    },
    upload: {
      compress: false,
      filelimit: 100,
      groupfilevalue: 100,
      usefilelimit: false
    }
  }

  return {
    config,
    biliLoginStatus: 'isLogin',
    bundleCalls: [] as Array<Record<string, unknown>>,
    dataCalls: [] as string[],
    headerCalls: [] as string[],
    playUrlDataKind: 'dash' as 'dash' | 'durl',
    sizeByUrl: {} as Record<string, number>
  }
})

const videoInfo = {
  aid: 123,
  bvid: 'BVspeed',
  cid: 456,
  desc: '',
  desc_v2: [],
  duration: 30,
  owner: {
    mid: 789,
    name: 'UP主'
  },
  pages: [{ cid: 456, duration: 30 }],
  pic: 'https://example.com/cover.jpg',
  stat: {
    coin: 0,
    danmaku: 0,
    favorite: 0,
    like: 0,
    reply: 0,
    share: 0,
    view: 0
  },
  title: '视频标题'
}

const createDashData = () => ({
  accept_description: ['8K 超高清', '高清 1080P'],
  dash: {
    audio: [{
      backup_url: [],
      base_url: 'https://dash.example/audio.m4s',
      id: 30280
    }],
    video: [
      {
        backup_url: [],
        base_url: 'https://dash.example/video-127.m4s',
        height: 4320,
        id: 127,
        width: 7680
      },
      {
        backup_url: [],
        base_url: 'https://dash.example/video-80.m4s',
        height: 1080,
        id: 80,
        width: 1920
      }
    ]
  }
})

const createDurlData = () => ({
  accept_description: ['高清 720P', '流畅 360P'],
  durl: [{
    size: 12 * MB,
    url: 'https://durl.playurl.example/video.mp4'
  }]
})

vi.mock('node-karin', () => ({
  default: {},
  common: {
    makeForward: vi.fn()
  },
  logger: {
    blue: (value: unknown) => String(value),
    debug: vi.fn(),
    error: vi.fn(),
    green: (value: unknown) => String(value),
    info: vi.fn(),
    mark: vi.fn(),
    warn: vi.fn(),
    yellow: (value: unknown) => String(value)
  },
  Message: class {},
  segment: {
    image: vi.fn(),
    text: vi.fn((text: string) => ({ type: 'text', text })),
    video: vi.fn()
  }
}))

vi.mock('@ikenxuan/amagi', () => ({
  bilibiliApiUrls: {
    getVideoStream: vi.fn(() => 'https://api.example/playurl')
  },
  DynamicType: {
    ARTICLE: 'DYNAMIC_TYPE_ARTICLE',
    AV: 'DYNAMIC_TYPE_AV',
    DRAW: 'DYNAMIC_TYPE_DRAW',
    FORWARD: 'DYNAMIC_TYPE_FORWARD',
    LIVE_RCMD: 'DYNAMIC_TYPE_LIVE_RCMD',
    WORD: 'DYNAMIC_TYPE_WORD'
  }
}))

vi.mock('@/module/utils/Config', () => ({
  Config: state.config
}))

vi.mock('@/module/utils/amagiClient', () => ({
  bilibiliFetcher: {},
  SOFT_ERROR_CODES: {},
  softFetch: vi.fn()
}))

vi.mock('@/module/utils', () => ({
  Base: class {
    e: any
    headers = { 'User-Agent': 'Unit Test UA' }
    amagi = {
      bilibili: {
        fetcher: {
          fetchVideoInfo: vi.fn(async () => ({ data: { data: videoInfo } })),
          fetchVideoStreamUrl: vi.fn(async () => ({
            data: {
              data: state.playUrlDataKind === 'durl' ? createDurlData() : createDashData()
            }
          }))
        }
      }
    }

    constructor (e: any) {
      this.e = e
    }
  },
  baseHeaders: { 'User-Agent': 'Unit Test UA' },
  buildGoogleMotionPhoto: vi.fn(),
  Common: {
    tempDri: {
      images: '/tmp/',
      video: '/tmp/'
    }
  },
  Count: (value: unknown) => String(value),
  Root: {
    pluginName: 'karin-plugin-kkk'
  },
  createPlainVideoTitleContext: vi.fn(() => ({ enabled: false, platformLabel: 'B站', sent: false })),
  downloadFile: vi.fn(),
  downloadVideo: vi.fn(),
  extractTotalBytesFromHeaders: vi.fn((headers: { url?: string }) => state.sizeByUrl[headers.url ?? ''] ?? 0),
  fileInfo: class {},
  fixM4sFile: vi.fn(),
  loopVideoWithTransition: vi.fn(),
  mergeVideoAudio: vi.fn(),
  Networks: class {
    private readonly url: string

    constructor (data: { url: string }) {
      this.url = data.url
    }

    async getData () {
      state.dataCalls.push(this.url)
      return {
        data: {
          accept_description: ['流畅'],
          durl: [{
            size: 10 * MB,
            url: 'https://durl.example/video.mp4'
          }]
        }
      }
    }

    async getHeaders () {
      state.headerCalls.push(this.url)
      return { url: this.url }
    }
  },
  processImageUrl: vi.fn(async (url: string) => url),
  Render: vi.fn(async () => ['rendered-image']),
  replyPlainVideoTitle: vi.fn(async () => true),
  uploadFile: vi.fn()
}))

vi.mock('@/platform/bilibili', () => ({
  bilibiliComments: vi.fn(() => ({ comments: [], image_urls: [] })),
  checkCk: vi.fn(async () => ({ Status: state.biliLoginStatus, isVIP: false })),
  genParams: vi.fn()
}))

vi.mock('@/platform/bilibili/danmaku', () => ({
  burnBiliDanmaku: vi.fn(),
  mergeAndBurnBili: vi.fn()
}))

vi.mock('@/platform/bilibili/dynamic-text', () => ({
  buildBilibiliArticleRichText: vi.fn(),
  buildBilibiliDynamicRichText: vi.fn((text: string) => text),
  buildBilibiliVideoDescRichText: vi.fn((text: string) => text),
  getUsernameMetadata: vi.fn(() => ({}))
}))

vi.mock('@/platform/bilibili/liveRecorder', () => ({
  buildBilibiliLiveApiHeaders: vi.fn(),
  buildBilibiliLiveRecordHeaders: vi.fn(),
  fetchBilibiliLivePlayInfo: vi.fn(),
  normalizeBilibiliLiveQuality: vi.fn(),
  normalizeBilibiliLiveRecordSeconds: vi.fn(),
  recordBilibiliLiveStream: vi.fn(),
  selectBilibiliLiveStream: vi.fn()
}))

vi.mock('@/platform/bilibili/bundle', () => ({
  fetchBilibiliDynamicBundle: vi.fn(),
  fetchBilibiliOneVideoBundle: vi.fn(async (_idData: unknown, need: Record<string, unknown>) => {
    state.bundleCalls.push(need)
    const playUrlData = state.playUrlDataKind === 'durl' ? createDurlData() : createDashData()
    return {
      infoData: { data: { data: videoInfo } },
      selectedCid: videoInfo.cid,
      selectedPage: 1,
      playUrlData: need.playUrlData ? { data: { data: playUrlData } } : undefined,
      html5PlayUrlData: need.html5PlayUrlData
        ? {
            data: {
              accept_description: ['流畅'],
              durl: [{
                size: 10 * MB,
                url: 'https://durl.example/video.mp4'
              }]
            }
          }
        : undefined
    }
  })
}))

vi.mock('@/platform/resolveParsedPost', () => ({
  resolveBilibiliParsedPost: vi.fn(async () => ({
    platform: 'bilibili',
    platformLabel: 'B站',
    subtype: 'video',
    title: videoInfo.title,
    author: {
      name: videoInfo.owner.name
    },
    summary: videoInfo.desc,
    url: `https://www.bilibili.com/video/${videoInfo.bvid}`,
    contentBlocks: videoInfo.desc ? [{ type: 'text', text: videoInfo.desc }] : [],
    images: [],
    videos: [{
      url: 'https://dash.example/video-127.m4s',
      title: videoInfo.title
    }],
    primaryVideo: {
      url: 'https://dash.example/video-127.m4s',
      title: videoInfo.title
    },
    stats: [],
    meta: [],
    raw: {}
  }))
}))

const moduleUtils = await import('../src/module/utils')
const { Bilibili, bilibiliProcessVideos } = await import('../src/platform/bilibili/bilibili')

describe('Bilibili video speed hot path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.config.bilibili.sendContent = ['video']
    state.config.bilibili.videoQuality = 127
    state.config.upload.compress = false
    state.config.upload.usefilelimit = false
    state.biliLoginStatus = 'isLogin'
    state.bundleCalls = []
    state.playUrlDataKind = 'dash'
    state.dataCalls = []
    state.headerCalls = []
    state.sizeByUrl = {
      'https://dash.example/audio.m4s': 5 * MB,
      'https://dash.example/video-80.m4s': 20 * MB,
      'https://dash.example/video-127.m4s': 40 * MB
    }
  })

  it('does not fetch nock data or probe stream size for fixed high quality video-only parses', async () => {
    const getvideoSpy = vi.spyOn(Bilibili.prototype, 'getvideo').mockResolvedValue(true as never)
    const event = { reply: vi.fn() } as any

    await new Bilibili(event, { type: 'one_video', USER: { STATUS: 'isLogin' } })
      .BilibiliHandler({ bvid: 'BVspeed', p: 1 } as any)

    expect(state.dataCalls).toEqual([])
    expect(state.headerCalls).toEqual([])
    expect(getvideoSpy).toHaveBeenCalled()

    getvideoSpy.mockRestore()
  })

  it('uses available dash streams for high quality video-only parses even when cookie check is not login', async () => {
    state.biliLoginStatus = 'notLogin'
    const getvideoSpy = vi.spyOn(Bilibili.prototype, 'getvideo').mockResolvedValue(true as never)
    const event = { reply: vi.fn() } as any

    await new Bilibili(event, { type: 'one_video', USER: { STATUS: 'notLogin' } })
      .BilibiliHandler({ bvid: 'BVspeed', p: 1 } as any)

    expect(state.dataCalls).toEqual([])
    expect(getvideoSpy.mock.calls[0]?.[0]).toHaveProperty('infoData')

    getvideoSpy.mockRestore()
  })

  it('reuses durl returned by the primary playurl response instead of fetching nock data', async () => {
    state.biliLoginStatus = 'notLogin'
    state.playUrlDataKind = 'durl'
    const getvideoSpy = vi.spyOn(Bilibili.prototype, 'getvideo').mockResolvedValue(true as never)
    const event = { reply: vi.fn() } as any

    await new Bilibili(event, { type: 'one_video', USER: { STATUS: 'notLogin' } })
      .BilibiliHandler({ bvid: 'BVspeed', p: 1 } as any)

    expect(state.dataCalls).toEqual([])
    expect(getvideoSpy.mock.calls[0]?.[0].playUrlData.durl[0].url).toBe('https://durl.playurl.example/video.mp4')

    getvideoSpy.mockRestore()
  })

  it('disables environment proxy when downloading Bilibili durl streams', async () => {
    const event = { reply: vi.fn() } as any
    const bilibili = new Bilibili(event, { type: 'one_video', USER: { STATUS: 'notLogin' } })
    bilibili.islogin = false
    bilibili.downloadfilename = '视频标题'

    await bilibili.getvideo({ playUrlData: createDurlData() as any })

    expect(moduleUtils.downloadVideo).toHaveBeenCalledWith(event, expect.objectContaining({
      networkOptions: { proxy: false }
    }))
  })

  it('loads the HTML5 bundle for fixed low quality durl parses without probing size', async () => {
    state.config.bilibili.videoQuality = 16
    const getvideoSpy = vi.spyOn(Bilibili.prototype, 'getvideo').mockResolvedValue(true as never)
    const event = { reply: vi.fn() } as any

    await new Bilibili(event, { type: 'one_video', USER: { STATUS: 'isLogin' } })
      .BilibiliHandler({ bvid: 'BVspeed', p: 1 } as any)

    expect(state.bundleCalls).toContainEqual(expect.objectContaining({
      html5PlayUrlData: true
    }))
    expect(state.headerCalls).toEqual([])
    expect(getvideoSpy).toHaveBeenCalled()

    getvideoSpy.mockRestore()
  })

  it('returns the selected auto-quality stream size so callers can reuse it', async () => {
    state.config.bilibili.videoQuality = 0

    const result = await bilibiliProcessVideos({
      accept_description: ['8K 超高清', '高清 1080P'],
      bvid: 'BVspeed',
      maxAutoVideoSize: 30,
      qn: 0
    }, createDashData().dash.video as any, 'https://dash.example/audio.m4s')

    expect(result.videoList[0].id).toBe(80)
    expect(result.selectedSizeMB).toBe('25.00')
  })

  it('respects displayContent in text info mode', async () => {
    state.config.bilibili.sendContent = ['info']
    state.config.bilibili.displayContent = ['title', 'stats']

    const event = { reply: vi.fn() } as any

    await new Bilibili(event, { type: 'one_video', USER: { STATUS: 'isLogin' } })
      .BilibiliHandler({ bvid: 'BVspeed', p: 1 } as any)

    expect(event.reply).toHaveBeenCalledTimes(1)
    const payload = event.reply.mock.calls[0]?.[0]
    expect(payload).toHaveLength(2)
    expect(payload[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('标题: 视频标题')
    })
    expect(payload[1]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('弹幕')
    })
    expect(payload.some((item: any) => item.type === 'image')).toBe(false)
    expect(payload.some((item: any) => item.text?.includes('作者'))).toBe(false)
    expect(payload.some((item: any) => item.text?.includes('简介'))).toBe(false)
  })
})
