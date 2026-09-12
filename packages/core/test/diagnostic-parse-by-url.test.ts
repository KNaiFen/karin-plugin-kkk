import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  ensureFreshCookie: vi.fn(),
  resolveParsedPostWithCache: vi.fn(),
  douyinHandler: vi.fn(),
  getBilibiliID: vi.fn(),
  getDouyinID: vi.fn(),
  getGithubID: vi.fn(),
  getHeyboxID: vi.fn(),
  getKuaishouID: vi.fn(),
  getTiebaID: vi.fn(),
  getTikTokID: vi.fn(),
  getWechatID: vi.fn(),
  getWeiboID: vi.fn(),
  getXID: vi.fn(),
  getXiaohongshuID: vi.fn(),
  getZhihuID: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerDebug: vi.fn()
}))

vi.mock('node-karin', () => ({
  createBadRequestResponse: (res: any, message: string) => res.status(400).json({ success: false, message }),
  createServerErrorResponse: (res: any, message: string) => res.status(500).json({ success: false, message }),
  createSuccessResponse: (res: any, data: any) => res.status(200).json({ success: true, data }),
  logger: {
    warn: (...args: unknown[]) => state.loggerWarn(...args),
    error: (...args: unknown[]) => state.loggerError(...args),
    debug: (...args: unknown[]) => state.loggerDebug(...args)
  }
}))

vi.mock('@/module/utils/GuestCookieManager', () => ({
  guestCookieManager: {
    ensureFreshCookie: (...args: unknown[]) => state.ensureFreshCookie(...args)
  }
}))

vi.mock('@/module/summaryParse/parsedPostCache', () => ({
  resolveParsedPostWithCache: (...args: unknown[]) => state.resolveParsedPostWithCache(...args)
}))

vi.mock('@/platform/douyin', () => ({
  DouYin: class {
    e: any

    constructor (e: any) {
      this.e = e
    }

    async DouyinHandler (...args: unknown[]) {
      return await state.douyinHandler(this.e, ...args)
    }
  }
}))

vi.mock('@/platform/bilibili/getID', () => ({
  getBilibiliID: (...args: unknown[]) => state.getBilibiliID(...args)
}))

vi.mock('@/platform/douyin/getID', () => ({
  getDouyinID: (...args: unknown[]) => state.getDouyinID(...args)
}))

vi.mock('@/platform/github/getID', () => ({
  getGithubID: (...args: unknown[]) => state.getGithubID(...args)
}))

vi.mock('@/platform/heybox/getID', () => ({
  getHeyboxID: (...args: unknown[]) => state.getHeyboxID(...args)
}))

vi.mock('@/platform/kuaishou/getID', () => ({
  getKuaishouID: (...args: unknown[]) => state.getKuaishouID(...args)
}))

vi.mock('@/platform/tieba/getID', () => ({
  getTiebaID: (...args: unknown[]) => state.getTiebaID(...args)
}))

vi.mock('@/platform/tiktok/getID', () => ({
  getTikTokID: (...args: unknown[]) => state.getTikTokID(...args)
}))

vi.mock('@/platform/wechat/getID', () => ({
  getWechatID: (...args: unknown[]) => state.getWechatID(...args)
}))

vi.mock('@/platform/weibo/getID', () => ({
  getWeiboID: (...args: unknown[]) => state.getWeiboID(...args)
}))

vi.mock('@/platform/x/getID', () => ({
  getXID: (...args: unknown[]) => state.getXID(...args)
}))

vi.mock('@/platform/xiaohongshu/getID', () => ({
  getXiaohongshuID: (...args: unknown[]) => state.getXiaohongshuID(...args)
}))

vi.mock('@/platform/zhihu/getID', () => ({
  getZhihuID: (...args: unknown[]) => state.getZhihuID(...args)
}))

vi.mock('@/module/utils/Config', () => ({
  Config: {
    app: {
      parseTip: true
    },
    douyin: {
      sendContent: ['info', 'comment', 'video'],
      plainTitleReply: {
        switch: true,
        types: ['video', 'image', 'article', 'live']
      },
      renderCard: {
        enable: true
      }
    },
    bilibili: {
      sendContent: ['info', 'video', 'comment'],
      plainTitleReply: {
        switch: true,
        types: ['video', 'image', 'article', 'live', 'text']
      },
      renderCard: {
        enable: true
      }
    },
    tiktok: {
      plainTitleReply: {
        switch: true,
        types: ['video']
      }
    },
    kuaishou: {
      comment: true
    },
    xiaohongshu: {
      sendContent: ['info', 'comment', 'image', 'video'],
      plainTitleReply: {
        switch: true,
        types: ['video', 'image']
      },
      renderCard: {
        enable: true
      }
    },
    heybox: {
      sendContent: ['info', 'comment', 'image', 'video'],
      plainTitleReply: {
        switch: true,
        types: ['video', 'image', 'text']
      },
      renderCard: {
        enable: true
      }
    },
    github: {
      sendContent: ['info', 'image'],
      plainTitleReply: {
        switch: true,
        types: ['text', 'image']
      },
      renderCard: {
        enable: true
      }
    },
    x: {
      sendContent: ['info', 'image', 'video'],
      plainTitleReply: {
        switch: true,
        types: ['video', 'image', 'text']
      },
      renderCard: {
        enable: true
      }
    },
    zhihu: {
      sendContent: ['info', 'image', 'video'],
      plainTitleReply: {
        switch: true,
        types: ['video', 'image', 'text']
      },
      renderCard: {
        enable: true
      }
    },
    tieba: {
      sendContent: ['info', 'comment', 'image', 'video'],
      plainTitleReply: {
        switch: true,
        types: ['video', 'image', 'text']
      },
      renderCard: {
        enable: true
      }
    },
    wechat: {
      sendContent: ['info', 'image'],
      plainTitleReply: {
        switch: true,
        types: ['image', 'text']
      },
      renderCard: {
        enable: true
      }
    },
    weibo: {
      sendContent: ['info', 'image', 'video'],
      plainTitleReply: {
        switch: true,
        types: ['video', 'image', 'text']
      },
      renderCard: {
        enable: true
      }
    }
  }
}))

const createParsedPost = (overrides: Record<string, unknown> = {}) => ({
  platform: 'douyin',
  platformLabel: '抖音',
  subtype: 'video',
  title: '测试标题',
  author: {
    name: '测试作者'
  },
  summary: '测试摘要',
  url: 'https://example.com/post',
  contentBlocks: [],
  images: [],
  videos: [{
    url: 'https://example.com/video.mp4'
  }],
  primaryVideo: {
    url: 'https://example.com/video.mp4'
  },
  stats: [],
  meta: [],
  raw: {},
  ...overrides
})

const createResponse = () => ({
  statusCode: 200,
  payload: null as any,
  status (code: number) {
    this.statusCode = code
    return this
  },
  json (payload: any) {
    this.payload = payload
    return this
  }
})

const {
  createParseByUrlHandler,
  createSimulateHandlerByUrlHandler,
  runDiagnosticParseByUrl,
  runDiagnosticSimulateHandlerByUrl
} = await import('../src/module/server/api/diagnosticParseByUrl')

describe('diagnostic parse-by-url', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds douyin diagnostic responses with sanitized id data and reply summary', async () => {
    state.getDouyinID.mockResolvedValue({
      type: 'one_work',
      aweme_id: '7658665604254507365',
      transientCookieHeader: 'ttwid=test; s_v_web_id=test'
    })
    state.resolveParsedPostWithCache.mockResolvedValue({
      cacheHit: true,
      parsedPost: createParsedPost()
    })

    const result = await runDiagnosticParseByUrl('douyin', {
      input: '看看这个 https://v.douyin.com/Br9x2Q4WNfQ/'
    })

    expect(state.ensureFreshCookie).toHaveBeenCalledWith('douyin', { waitForStale: true })
    expect(state.getDouyinID).toHaveBeenCalled()
    expect(state.resolveParsedPostWithCache).toHaveBeenCalledWith({
      platform: 'douyin',
      url: 'https://v.douyin.com/Br9x2Q4WNfQ/'
    })
    expect(result.extractedUrl).toBe('https://v.douyin.com/Br9x2Q4WNfQ/')
    expect(result.idData.transientCookieHeader).toContain('[redacted')
    expect(result.replySummary.plainTitleText).toBe('【抖音】测试作者：测试标题')
    expect(result.replySummary.plannedOutputs).toEqual(expect.arrayContaining(['plain-title', 'info', 'comment', 'video']))
    expect(result.cache.parsedPostHit).toBe(true)
  })

  it('normalizes bilibili BV token inputs into shareable urls before parsing', async () => {
    state.getBilibiliID.mockResolvedValue({
      type: 'one_video',
      bvid: 'BV12uLq6dEdv',
      p: 1
    })
    state.resolveParsedPostWithCache.mockResolvedValue({
      cacheHit: false,
      parsedPost: createParsedPost({
        platform: 'bilibili',
        platformLabel: 'B站'
      })
    })

    const result = await runDiagnosticParseByUrl('bilibili', {
      input: 'BV12uLq6dEdv'
    })

    expect(result.extractedUrl).toBe('https://www.bilibili.com/video/BV12uLq6dEdv')
    expect(state.resolveParsedPostWithCache).toHaveBeenCalledWith({
      platform: 'bilibili',
      url: 'https://www.bilibili.com/video/BV12uLq6dEdv'
    })
  })

  it('marks tiktok diagnostics as media-download heavy without running full handler logic', async () => {
    state.getTikTokID.mockResolvedValue({
      type: 'one_work',
      item_id: '7643493503778966797',
      url: 'https://www.tiktok.com/@good.ball21/video/7643493503778966797',
      cookie: 'msToken=test'
    })
    state.resolveParsedPostWithCache.mockResolvedValue({
      cacheHit: false,
      parsedPost: createParsedPost({
        platform: 'tiktok',
        platformLabel: 'TikTok'
      })
    })

    const result = await runDiagnosticParseByUrl('tiktok', {
      input: 'https://www.tiktok.com/@good.ball21/video/7643493503778966797'
    })

    expect(result.idData.cookie).toContain('[redacted')
    expect(result.replySummary.fullHandlerDownloadsMedia).toBe(true)
    expect(result.replySummary.notes.join('\n')).toContain('未执行完整 handler')
  })

  it('captures douyin handler outputs through simulate-handler diagnostics', async () => {
    state.getDouyinID.mockResolvedValue({
      type: 'one_work',
      aweme_id: '7655935692011496546',
      transientCookieHeader: 'ttwid=test; s_v_web_id=test'
    })
    state.douyinHandler.mockImplementation(async (event: any) => {
      await event.reply({ type: 'record', url: 'base64://audio' })
      await event.bot.sendForwardMsg(event.contact, [{ type: 'image', url: 'https://example.com/note-1.jpg' }])
      return true
    })

    const result = await runDiagnosticSimulateHandlerByUrl('douyin', {
      input: 'https://v.douyin.com/Y_X0PQLygTY/'
    })

    expect(state.ensureFreshCookie).not.toHaveBeenCalled()
    expect(result.idData).toMatchObject({
      type: 'one_work',
      aweme_id: '7655935692011496546',
      transientCookieHeader: expect.stringContaining('[redacted len:')
    })
    expect(result.simulation.replyCount).toBe(1)
    expect(result.simulation.forwardCount).toBe(1)
    expect(result.simulation.contains).toEqual({
      image: true,
      record: true,
      video: false
    })
    expect(result.simulation.outputs).toEqual([
      {
        channel: 'reply',
        elementTypes: ['record']
      },
      {
        channel: 'forward',
        elementTypes: ['image']
      }
    ])
  })

  it('detects nested image elements inside forward payloads during handler simulation', async () => {
    state.getDouyinID.mockResolvedValue({
      type: 'one_work',
      aweme_id: '7655935692011496546'
    })
    state.douyinHandler.mockImplementation(async (event: any) => {
      await event.bot.sendForwardMsg(event.contact, [{
        type: 'node',
        data: {
          nickname: 'tester',
          user_id: '10001',
          content: [{ type: 'image', url: 'https://example.com/note-1.jpg' }]
        }
      }])
      return true
    })

    const result = await runDiagnosticSimulateHandlerByUrl('douyin', {
      input: 'https://v.douyin.com/Y_X0PQLygTY/'
    })

    expect(result.simulation.contains.image).toBe(true)
    expect(result.simulation.outputs).toEqual([
      {
        channel: 'forward',
        elementTypes: ['node', 'image']
      }
    ])
  })

  it('rejects invalid parse-by-url requests through the request handler', async () => {
    const handler = createParseByUrlHandler('weibo')
    const req = {
      body: {
        input: '这不是有效链接'
      }
    }
    const res = createResponse()

    await handler(req as any, res as any, vi.fn())

    expect(res.statusCode).toBe(400)
    expect(res.payload?.message).toContain('未能提取')
  })

  it('exposes simulate-handler-by-url through the request handler', async () => {
    state.getDouyinID.mockResolvedValue({
      type: 'one_work',
      aweme_id: '7655935692011496546'
    })
    state.douyinHandler.mockImplementation(async (event: any) => {
      await event.reply({ type: 'record', url: 'base64://audio' })
      return true
    })

    const handler = createSimulateHandlerByUrlHandler('douyin')
    const req = {
      body: {
        input: 'https://v.douyin.com/Y_X0PQLygTY/'
      }
    }
    const res = createResponse()

    await handler(req as any, res as any, vi.fn())

    expect(res.statusCode).toBe(200)
    expect(res.payload?.success).toBe(true)
    expect(res.payload?.data?.simulation?.contains?.record).toBe(true)
    expect(state.ensureFreshCookie).not.toHaveBeenCalled()
  })
})
