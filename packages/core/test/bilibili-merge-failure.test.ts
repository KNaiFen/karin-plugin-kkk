import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  config: {
    app: {
      parseTip: false,
      removeCache: true
    },
    bilibili: {
      burnDanmaku: false,
      danmakuArea: 0,
      verticalMode: false,
      videoCodec: 'h264',
      danmakuFontSize: 'medium',
      danmakuOpacity: 70
    },
    cookies: {
      bilibili: 'bili-cookie'
    },
    upload: {
      compressPreset: 'cpu',
      compressCustomArgs: '',
      groupfilevalue: 100
    }
  },
  downloadFile: vi.fn(),
  fixM4sFile: vi.fn(),
  mergeVideoAudio: vi.fn(),
  removeFile: vi.fn(),
  uploadFile: vi.fn()
}))

vi.mock('node-karin', () => ({
  common: {
    makeForward: vi.fn()
  },
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    mark: vi.fn(),
    warn: vi.fn()
  },
  Message: class {},
  segment: {
    image: vi.fn(),
    text: vi.fn((text: string) => ({ type: 'text', text })),
    video: vi.fn()
  }
}))

vi.mock('@ikenxuan/amagi', () => ({
  ArticleContent: class {},
  BiliBangumiVideoInfo: class {},
  BiliBangumiVideoPlayurlIsLogin: class {},
  BiliBangumiVideoPlayurlNoLogin: class {},
  bilibiliApiUrls: {
    getVideoStream: vi.fn(() => 'https://api.example/playurl')
  },
  BiliBiliVideoPlayurlNoLogin: class {},
  BiliDynamicInfoUnion: class {},
  BiliOneWork: class {},
  BiliVideoPlayurlIsLogin: class {},
  DynamicType: {
    ARTICLE: 'DYNAMIC_TYPE_ARTICLE',
    AV: 'DYNAMIC_TYPE_AV',
    DRAW: 'DYNAMIC_TYPE_DRAW',
    FORWARD: 'DYNAMIC_TYPE_FORWARD',
    LIVE_RCMD: 'DYNAMIC_TYPE_LIVE_RCMD',
    WORD: 'DYNAMIC_TYPE_WORD'
  },
  DynamicTypeDraw: class {},
  Result: class {}
}))

vi.mock('@/module/utils/Config', () => ({
  Config: state.config
}))

vi.mock('@/module/utils/amagiClient', () => ({
  SOFT_ERROR_CODES: {}
}))

vi.mock('@/module/utils', () => ({
  Base: class {
    e: any
    headers = { 'User-Agent': 'Unit Test UA' }
    amagi = { bilibili: { fetcher: {} } }

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
    },
    removeFile: (...args: unknown[]) => state.removeFile(...args)
  },
  Count: (value: unknown) => String(value),
  createPlainVideoTitleContext: vi.fn(() => ({ enabled: false, platformLabel: 'B站', sent: false })),
  downloadFile: (...args: unknown[]) => state.downloadFile(...args),
  downloadVideo: vi.fn(),
  extractTotalBytesFromHeaders: vi.fn(() => 0),
  fileInfo: class {},
  fixM4sFile: (...args: unknown[]) => state.fixM4sFile(...args),
  loopVideoWithTransition: vi.fn(async () => ({ success: true })),
  mergeVideoAudio: (...args: unknown[]) => state.mergeVideoAudio(...args),
  Networks: class {},
  processImageUrl: vi.fn(async (url: string) => url),
  Render: vi.fn(async () => []),
  replyPlainVideoTitle: vi.fn(async () => true),
  replyRenderedImages: vi.fn(async () => true),
  uploadFile: (...args: unknown[]) => state.uploadFile(...args)
}))

vi.mock('@/module/utils/LongTaskCompletionNotify', () => ({
  replyAndRecordLongTaskCompletionAnchor: vi.fn(async () => true),
  sendForwardAndRecordLongTaskCompletionAnchor: vi.fn(async () => true)
}))

vi.mock('@/platform/parsedPostAdapters', () => ({
  buildParsedPostTextModeReply: vi.fn(() => [])
}))

vi.mock('@/platform/resolveParsedPost', () => ({
  resolveBilibiliParsedPost: vi.fn(async () => null)
}))

vi.mock('@/platform/bilibili', () => ({
  bilibiliComments: vi.fn(() => ({ comments: [], image_urls: [] })),
  checkCk: vi.fn(async () => ({ Status: 'isLogin', isVIP: false })),
  genParams: vi.fn(async () => '')
}))

vi.mock('@/platform/bilibili/bundle', () => ({
  fetchBilibiliDynamicBundle: vi.fn(),
  fetchBilibiliOneVideoBundle: vi.fn()
}))

vi.mock('@/platform/bilibili/cdnSelector', () => ({
  collectBilibiliCdnBackupUrls: vi.fn(() => []),
  preferBilibiliNonMcdnUrls: vi.fn((item: unknown) => item),
  rewriteBilibiliCdnUrlCarrier: vi.fn((item: unknown) => item)
}))

vi.mock('@/platform/bilibili/liveRecorder', () => ({
  buildBilibiliLiveApiHeaders: vi.fn(),
  buildBilibiliLiveRecordHeaders: vi.fn(),
  fetchBilibiliLivePlayInfo: vi.fn(),
  normalizeBilibiliLiveQuality: vi.fn((value: number) => value),
  normalizeBilibiliLiveRecordSeconds: vi.fn((value: number) => value),
  recordBilibiliLiveStream: vi.fn(),
  selectBilibiliLiveStream: vi.fn()
}))

vi.mock('@/platform/bilibili/danmaku', () => ({
  burnBiliDanmaku: vi.fn(async () => true),
  mergeAndBurnBili: vi.fn(async () => true)
}))

vi.mock('@/platform/bilibili/dynamic-text', () => ({
  buildBilibiliArticleRichText: vi.fn(),
  buildBilibiliDynamicRichText: vi.fn((text: string) => text),
  buildBilibiliVideoDescRichText: vi.fn((text: string) => text),
  getUsernameMetadata: vi.fn(() => ({}))
}))

vi.mock('@/types', () => ({
  BilibiliDataTypes: {}
}))

const { Bilibili } = await import('../src/platform/bilibili/bilibili')

describe('Bilibili merge failure propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.downloadFile
      .mockResolvedValueOnce({ filepath: '/tmp/raw-video.m4s', totalBytes: 12 * 1024 * 1024 })
      .mockResolvedValueOnce({ filepath: '/tmp/raw-audio.m4s', totalBytes: 4 * 1024 * 1024 })
    state.fixM4sFile.mockResolvedValue(true)
    state.mergeVideoAudio.mockResolvedValue(false)
    state.uploadFile.mockResolvedValue(true)
  })

  it('throws when dash merge fails so the caller cannot report a false success', async () => {
    const event = { reply: vi.fn() } as any
    const handler = new Bilibili(event, { type: 'one_video', USER: { STATUS: 'isLogin' } } as any)
    handler.islogin = true
    handler.downloadfilename = 'B站视频标题'

    await expect(handler.getvideo({
      infoData: {
        data: {
          bvid: 'BVmergefail',
          cid: 123
        }
      },
      playUrlData: {
        data: {
          dash: {
            video: [{
              base_url: 'https://example.com/bili-video.m4s',
              backup_url: []
            }],
            audio: [{
              base_url: 'https://example.com/bili-audio.m4s',
              backup_url: []
            }]
          }
        }
      }
    })).rejects.toThrow('B站视频合成失败')

    expect(state.uploadFile).not.toHaveBeenCalled()
  })

  it('uses isolated temporary files for concurrent requests of the same video', async () => {
    state.downloadFile.mockReset()
    state.fixM4sFile.mockReset()
    state.removeFile.mockClear()
    state.downloadFile.mockImplementation(async (_url: unknown, options: { title: string }) => ({
      filepath: `/tmp/${options.title}`,
      totalBytes: 12 * 1024 * 1024
    }))
    state.fixM4sFile.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 5))
      return false
    })

    const createHandler = () => {
      const handler = new Bilibili({ reply: vi.fn() } as any, {
        type: 'one_video',
        USER: { STATUS: 'isLogin' }
      } as any)
      handler.islogin = true
      handler.downloadfilename = '同一视频'
      return handler
    }
    const request = {
      infoData: {
        data: {
          bvid: 'BVconcurrent',
          cid: 123
        }
      },
      playUrlData: {
        data: {
          dash: {
            video: [{ base_url: 'https://example.com/bili-video.m4s', backup_url: [] }],
            audio: [{ base_url: 'https://example.com/bili-audio.m4s', backup_url: [] }]
          }
        }
      }
    }

    const results = await Promise.allSettled([
      createHandler().getvideo(request as any),
      createHandler().getvideo(request as any)
    ])
    const videoTitles = state.downloadFile.mock.calls.map(call => (call[1] as { title: string }).title)
    const removedPaths = state.removeFile.mock.calls.map(call => call[0])

    expect(results.every(result => result.status === 'rejected')).toBe(true)
    expect(videoTitles).toHaveLength(2)
    expect(new Set(videoTitles).size).toBe(2)
    expect(videoTitles.every(title => /^Bil_V_BVconcurrent_\d+-[0-9a-f-]+\.m4s$/.test(title))).toBe(true)
    expect(removedPaths).toHaveLength(4)
    expect(new Set(removedPaths).size).toBe(removedPaths.length)
    expect(removedPaths).toEqual(expect.arrayContaining(videoTitles.map(title => `/tmp/${title}`)))
  })
})
