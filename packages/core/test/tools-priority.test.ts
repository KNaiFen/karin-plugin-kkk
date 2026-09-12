import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  commands: [] as Array<{ reg: RegExp, handler: (...args: any[]) => unknown, options: { name: string, priority?: number } }>,
  config: {
    app: {
      videoTool: false,
      summaryParse: {
        switch: true,
        keywords: ['总结'],
        sendParsedContent: false
      },
      detailedSummaryParse: {
        switch: true,
        keywords: ['详细总结'],
        sendParsedContent: false,
        llm: {
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'secret',
          model: 'gpt-5',
          timeoutMs: 90000,
          retryCount: 1,
          retryDelayMs: 1500,
          webSearchEnabled: true,
          reasoningEnabled: true,
          reasoningEffort: 'high'
        },
        asr: {
          mode: 'cloud',
          whisperCppPath: 'whisper-cli',
          modelPath: '',
          language: 'zh',
          threads: 4,
          ffmpegPath: 'ffmpeg',
          audioBitrateKbps: 24,
          maxSegmentMinutes: 30,
          cloud: {
            baseUrl: 'https://api.openai.com/v1',
            apiKey: 'asr-secret',
            model: 'gpt-4o-mini-transcribe',
            timeoutMs: 45000,
            retryCount: 1,
            retryDelayMs: 1500
          }
        }
      },
      transcriptOriginal: {
        switch: true,
        keywords: ['转写原文'],
        sendParsedContent: false,
        markdownRender: {
          enabled: false,
          sendTextVersion: false,
          fontSizePx: 16,
          multiPageEnabled: true,
          multiPageTriggerAspectRatio: 3,
          multiPageMaxAspectRatio: 2.2
        },
        llm: {
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'secret',
          model: 'gpt-5',
          timeoutMs: 90000,
          retryCount: 1,
          retryDelayMs: 1500,
          reasoningEnabled: true,
          reasoningEffort: 'high'
        },
        asr: {
          mode: 'cloud',
          whisperCppPath: 'whisper-cli',
          modelPath: '',
          language: 'zh',
          threads: 4,
          ffmpegPath: 'ffmpeg',
          audioBitrateKbps: 24,
          maxSegmentMinutes: 30,
          cloud: {
            baseUrl: 'https://api.openai.com/v1',
            apiKey: 'asr-secret',
            model: 'gpt-4o-mini-transcribe',
            timeoutMs: 45000,
            retryCount: 1,
            retryDelayMs: 1500
          }
        }
      }
    },
    douyin: {
      switch: true
    },
    tiktok: {
      switch: true,
      videoTool: true,
      priority: 123,
      plainTitleReply: {
        switch: true,
        types: ['video']
      }
    },
    x: {
      switch: true,
      plainTitleReply: {
        switch: true,
        types: ['video', 'image', 'text']
      }
    },
    bilibili: {
      switch: true
    },
    kuaishou: {
      switch: true
    },
    xiaohongshu: {
      switch: true
    },
    heybox: {
      switch: true,
      plainTitleReply: {
        switch: true,
        types: ['video', 'image', 'text']
      }
    },
    github: {
      switch: true,
      plainTitleReply: {
        switch: true,
        types: ['text', 'image']
      }
    },
    zhihu: {
      switch: true,
      plainTitleReply: {
        switch: true,
        types: ['video', 'image', 'text']
      }
    },
    tieba: {
      switch: true,
      plainTitleReply: {
        switch: true,
        types: ['video', 'image', 'text']
      }
    },
    wechat: {
      switch: true,
      plainTitleReply: {
        switch: true,
        types: ['image', 'text']
      }
    },
    weibo: {
      switch: true,
      plainTitleReply: {
        switch: true,
        types: ['video', 'image', 'text']
      }
    }
  },
  ensureFreshCookie: vi.fn(),
  getDouyinID: vi.fn(),
  douyinHandler: vi.fn(),
  douyinConstructArgs: [] as any[][],
  getBilibiliID: vi.fn(),
  bilibiliHandler: vi.fn(),
  bilibiliConstructArgs: [] as any[][],
  getTikTokID: vi.fn(),
  tiktokHandler: vi.fn(),
  tiktokConstructArgs: [] as any[][],
  getWechatID: vi.fn(),
  wechatHandler: vi.fn(),
  wechatConstructArgs: [] as any[][],
  getWeiboID: vi.fn(),
  weiboHandler: vi.fn(),
  weiboConstructArgs: [] as any[][],
  getXID: vi.fn(),
  xHandler: vi.fn(),
  xConstructArgs: [] as any[][],
  getGithubID: vi.fn(),
  githubHandler: vi.fn(),
  githubConstructArgs: [] as any[][],
  runSummaryParse: vi.fn(),
  runDetailedSummaryParse: vi.fn(),
  initLongTaskCompletionNotify: vi.fn(),
  notifyLongTaskCompletionIfNeeded: vi.fn(async () => false),
  shouldTriggerSummaryParse: vi.fn(() => null),
  shouldTriggerDetailedSummaryParse: vi.fn(() => null),
  shouldTriggerTranscriptOriginal: vi.fn(() => null),
  resolveSummaryParseContext: vi.fn(async () => null),
  resolveDetailedSummaryParseContext: vi.fn(async () => null),
  resolveTranscriptOriginalContext: vi.fn(async () => null),
  runTranscriptOriginal: vi.fn()
}))

vi.mock('node-karin', () => ({
  default: {
    command: (reg: RegExp, handler: (...args: any[]) => unknown, options: { name: string, priority?: number }) => {
      state.commands.push({ reg, handler, options })
      return { options }
    }
  },
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    mark: vi.fn(),
    warn: vi.fn()
  }
}))

vi.mock('@/module', () => ({
  Common: {
    getReplyMessage: vi.fn()
  },
  createPlainVideoTitleContext: (enabled: boolean, platformLabel: string, types: string[] = ['video', 'image', 'article', 'live', 'text']) => ({
    enabled,
    platformLabel,
    types,
    sent: false
  }),
  normalizePlainTitleReplyConfig: (config: boolean | { switch?: boolean, types?: string[] } | undefined, defaultTypes: string[]) => {
    if (typeof config === 'boolean') return { switch: config, types: defaultTypes }
    return { switch: config?.switch !== false, types: config?.types ?? defaultTypes }
  },
  downloadVideo: vi.fn(),
  resolveSummaryParseContext: (...args: unknown[]) => state.resolveSummaryParseContext(...args),
  resolveDetailedSummaryParseContext: (...args: unknown[]) => state.resolveDetailedSummaryParseContext(...args),
  resolveTranscriptOriginalContext: (...args: unknown[]) => state.resolveTranscriptOriginalContext(...args),
  runSummaryParse: (...args: unknown[]) => state.runSummaryParse(...args),
  runDetailedSummaryParse: (...args: unknown[]) => state.runDetailedSummaryParse(...args),
  runTranscriptOriginal: (...args: unknown[]) => state.runTranscriptOriginal(...args),
  initLongTaskCompletionNotify: (...args: unknown[]) => state.initLongTaskCompletionNotify(...args),
  notifyLongTaskCompletionIfNeeded: (...args: unknown[]) => state.notifyLongTaskCompletionIfNeeded(...args),
  shouldTriggerSummaryParse: (...args: unknown[]) => state.shouldTriggerSummaryParse(...args),
  shouldTriggerDetailedSummaryParse: (...args: unknown[]) => state.shouldTriggerDetailedSummaryParse(...args),
  shouldTriggerTranscriptOriginal: (...args: unknown[]) => state.shouldTriggerTranscriptOriginal(...args)
}))

vi.mock('@/module/db', () => ({
  getStatisticsDB: vi.fn(async () => ({
    recordParse: vi.fn()
  }))
}))

vi.mock('@/module/utils/Config', () => ({
  Config: state.config
}))

vi.mock('@/module/utils/ErrorHandler', () => ({
  wrapWithErrorHandler: (handler: unknown) => handler
}))

vi.mock('@/module/utils/GuestCookieManager', () => ({
  guestCookieManager: {
    ensureFreshCookie: (...args: unknown[]) => state.ensureFreshCookie(...args)
  }
}))

vi.mock('@/platform/bilibili', () => ({
  Bilibili: class {
    constructor (...args: any[]) {
      state.bilibiliConstructArgs.push(args)
    }

    BilibiliHandler = state.bilibiliHandler
  },
  getBilibiliID: (...args: unknown[]) => state.getBilibiliID(...args)
}))

vi.mock('@/platform/douyin', () => ({
  DouYin: class {
    constructor (...args: any[]) {
      state.douyinConstructArgs.push(args)
    }

    DouyinHandler = state.douyinHandler
  },
  getDouyinID: (...args: unknown[]) => state.getDouyinID(...args)
}))

vi.mock('@/platform/kuaishou', () => ({
  fetchKuaishouData: vi.fn(),
  getKuaishouID: vi.fn(),
  Kuaishou: class {}
}))

vi.mock('@/platform/heybox', () => ({
  getHeyboxID: vi.fn(),
  Heybox: class {}
}))

vi.mock('@/platform/github', () => ({
  getGithubID: (...args: unknown[]) => state.getGithubID(...args),
  Github: class {
    constructor (...args: any[]) {
      state.githubConstructArgs.push(args)
    }

    GithubHandler = state.githubHandler
  }
}))

vi.mock('@/platform/zhihu', () => ({
  getZhihuID: vi.fn(),
  Zhihu: class {}
}))

vi.mock('@/platform/tieba', () => ({
  getTiebaID: vi.fn(),
  Tieba: class {}
}))

vi.mock('@/platform/wechat', () => ({
  getWechatID: (...args: unknown[]) => state.getWechatID(...args),
  Wechat: class {
    constructor (...args: any[]) {
      state.wechatConstructArgs.push(args)
    }

    WechatHandler = state.wechatHandler
  }
}))

vi.mock('@/platform/weibo', () => ({
  getWeiboID: (...args: unknown[]) => state.getWeiboID(...args),
  Weibo: class {
    constructor (...args: any[]) {
      state.weiboConstructArgs.push(args)
    }

    WeiboHandler = state.weiboHandler
  }
}))

vi.mock('@/platform/tiktok', () => ({
  getTikTokID: (...args: unknown[]) => state.getTikTokID(...args),
  TikTok: class {
    constructor (...args: any[]) {
      state.tiktokConstructArgs.push(args)
    }

    TikTokHandler = state.tiktokHandler
  }
}))

vi.mock('@/platform/x', () => ({
  getXID: (...args: unknown[]) => state.getXID(...args),
  X: class {
    constructor (...args: any[]) {
      state.xConstructArgs.push(args)
    }

    XHandler = state.xHandler
  }
}))

vi.mock('@/platform/xiaohongshu', () => ({
  getXiaohongshuID: vi.fn(),
  Xiaohongshu: class {}
}))

const loadTools = async () => {
  vi.resetModules()
  state.commands.length = 0
  await import('../src/apps/tools')
}

const priorityOf = (name: string): number | undefined => {
  return state.commands.find(command => command.options.name === name)?.options.priority
}

const commandHandler = (name: string) => {
  const command = state.commands.find(command => command.options.name === name)
  if (!command) throw new Error(`missing command ${name}`)
  return command.handler
}

const commandRegex = (name: string) => {
  const command = state.commands.find(command => command.options.name === name)
  if (!command) throw new Error(`missing command ${name}`)
  return command.reg
}

describe('video parse command priority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.config.app.videoTool = false
    state.config.app.summaryParse.keywords = ['总结']
    state.config.app.summaryParse.sendParsedContent = false
    state.config.app.detailedSummaryParse.keywords = ['详细总结']
    state.config.app.detailedSummaryParse.sendParsedContent = false
    state.config.app.transcriptOriginal.keywords = ['转写原文']
    state.config.app.transcriptOriginal.sendParsedContent = false
    state.config.tiktok.videoTool = true
    state.config.tiktok.priority = 123
    state.config.tiktok.plainTitleReply = { switch: true, types: ['video'] }
    state.ensureFreshCookie.mockResolvedValue(false)
    state.getDouyinID.mockResolvedValue({
      type: 'one_work',
      aweme_id: '7657916175708779685',
      url: 'https://v.douyin.com/Br9x2Q4WNfQ/'
    })
    state.douyinHandler.mockResolvedValue(true)
    state.douyinConstructArgs.length = 0
    state.getBilibiliID.mockResolvedValue({
      type: 'video',
      bvid: 'BV1xx411c7mD',
      url: 'https://b23.tv/EGrR7XL'
    })
    state.bilibiliHandler.mockResolvedValue(true)
    state.bilibiliConstructArgs.length = 0
    state.getTikTokID.mockResolvedValue({
      type: 'one_work',
      item_id: '7643493503778966797',
      url: 'https://www.tiktok.com/@good.ball21/video/7643493503778966797'
    })
    state.tiktokHandler.mockResolvedValue(true)
    state.tiktokConstructArgs.length = 0
    state.getWechatID.mockResolvedValue({
      type: 'article',
      url: 'https://mp.weixin.qq.com/s/tAJ1B8ClOjQ41TWYJbIFTA'
    })
    state.wechatHandler.mockResolvedValue(true)
    state.wechatConstructArgs.length = 0
    state.getWeiboID.mockResolvedValue({
      type: 'status',
      statusId: 'R34sAiuo6',
      url: 'https://weibo.com/5177612153/R34sAiuo6'
    })
    state.weiboHandler.mockResolvedValue(true)
    state.weiboConstructArgs.length = 0
    state.getXID.mockResolvedValue({
      type: 'tweet',
      id: '2050564108114899179',
      url: 'https://x.com/cakedochi/status/2050564108114899179'
    })
    state.xHandler.mockResolvedValue(true)
    state.xConstructArgs.length = 0
    state.getGithubID.mockResolvedValue({
      type: 'repository',
      owner: 'openai',
      repo: 'openai-node',
      url: 'https://github.com/openai/openai-node'
    })
    state.githubHandler.mockResolvedValue(true)
    state.githubConstructArgs.length = 0
    state.runSummaryParse.mockResolvedValue({
      inputs: [],
      summaryText: '总结结果',
      taskId: 'task-test',
      totalLinks: 1
    })
    state.shouldTriggerSummaryParse.mockReturnValue(null)
    state.resolveSummaryParseContext.mockResolvedValue(null)
    state.shouldTriggerTranscriptOriginal.mockReturnValue(null)
    state.resolveTranscriptOriginalContext.mockResolvedValue(null)
  })

  it('lets TikTok use its own default-parse switch when global default parsing is off', async () => {
    await loadTools()

    expect(priorityOf('kkk-视频功能-TikTok')).toBe(-Infinity)
    expect(priorityOf('kkk-视频功能-B站')).toBe(800)
    expect(priorityOf('kkk-视频功能-小红书')).toBe(800)
    expect(priorityOf('kkk-视频功能-小黑盒')).toBe(800)
    expect(priorityOf('kkk-视频功能-GitHub')).toBe(800)
    expect(priorityOf('kkk-视频功能-X')).toBe(800)
    expect(priorityOf('kkk-视频功能-知乎')).toBe(800)
    expect(priorityOf('kkk-视频功能-贴吧')).toBe(800)
    expect(priorityOf('kkk-视频功能-微信公众号')).toBe(800)
    expect(priorityOf('kkk-视频功能-微博')).toBe(800)
  })

  it('waits for stale douyin guest cookies before parsing share links', async () => {
    await loadTools()

    const handler = commandHandler('kkk-视频功能-抖音')
    await handler({
      msg: '9.76 复制打开抖音，看看 https://v.douyin.com/Br9x2Q4WNfQ/',
      isGroup: false,
      reply: vi.fn()
    })

    expect(state.ensureFreshCookie).toHaveBeenCalledWith('douyin', { waitForStale: true })
    expect(state.getDouyinID).toHaveBeenCalled()
    expect(state.douyinHandler).toHaveBeenCalled()
  })

  it('lets TikTok use its own custom priority when global default parsing is on', async () => {
    state.config.app.videoTool = true
    state.config.tiktok.videoTool = false
    state.config.tiktok.priority = 321

    await loadTools()

    expect(priorityOf('kkk-视频功能-TikTok')).toBe(321)
    expect(priorityOf('kkk-视频功能-B站')).toBe(-Infinity)
    expect(priorityOf('kkk-视频功能-小红书')).toBe(-Infinity)
    expect(priorityOf('kkk-视频功能-小黑盒')).toBe(-Infinity)
    expect(priorityOf('kkk-视频功能-GitHub')).toBe(-Infinity)
    expect(priorityOf('kkk-视频功能-X')).toBe(-Infinity)
    expect(priorityOf('kkk-视频功能-知乎')).toBe(-Infinity)
    expect(priorityOf('kkk-视频功能-贴吧')).toBe(-Infinity)
    expect(priorityOf('kkk-视频功能-微信公众号')).toBe(-Infinity)
    expect(priorityOf('kkk-视频功能-微博')).toBe(-Infinity)
  })

  it('enables TikTok plain title replies only for link-only messages', async () => {
    await loadTools()

    const handler = commandHandler('kkk-视频功能-TikTok')
    await handler({
      msg: 'https://www.tiktok.com/@good.ball21/video/7643493503778966797',
      isGroup: false,
      reply: vi.fn()
    })
    await handler({
      msg: '看这个 https://www.tiktok.com/@good.ball21/video/7643493503778966797',
      isGroup: false,
      reply: vi.fn()
    })

    expect(state.tiktokConstructArgs[0][2].plainVideoTitle).toMatchObject({
      enabled: true,
      platformLabel: 'TikTok',
      types: ['video'],
      sent: false
    })
    expect(state.tiktokConstructArgs[1][2].plainVideoTitle).toMatchObject({
      enabled: false,
      platformLabel: 'TikTok',
      types: ['video'],
      sent: false
    })
  })

  it('honors the TikTok plain title reply switch', async () => {
    state.config.tiktok.plainTitleReply = { switch: false, types: ['video'] }
    await loadTools()

    const handler = commandHandler('kkk-视频功能-TikTok')
    await handler({
      msg: 'https://www.tiktok.com/@good.ball21/video/7643493503778966797',
      isGroup: false,
      reply: vi.fn()
    })

    expect(state.tiktokConstructArgs[0][2].plainVideoTitle).toMatchObject({
      enabled: false,
      platformLabel: 'TikTok',
      types: ['video'],
      sent: false
    })
  })

  it('replays parsed content without triggering plain title replies in summary mode', async () => {
    await loadTools()
    state.config.app.summaryParse.sendParsedContent = true
    state.resolveSummaryParseContext
      .mockResolvedValueOnce({
        trigger: { keyword: '总结', rest: 'https://www.tiktok.com/@good.ball21/video/7643493503778966797' },
        shareContext: '',
        links: [
          {
            platform: 'tiktok',
            url: 'https://www.tiktok.com/@good.ball21/video/7643493503778966797'
          }
        ]
      })
    state.shouldTriggerSummaryParse.mockReturnValue(null)

    const handler = commandHandler('kkk-视频功能-解析总结')
    await handler({
      msg: '#总结 https://www.tiktok.com/@good.ball21/video/7643493503778966797',
      isGroup: false,
      reply: vi.fn()
    }, vi.fn())

    expect(state.runSummaryParse).toHaveBeenCalled()
    expect(state.resolveSummaryParseContext).toHaveBeenCalledTimes(1)
    expect(state.shouldTriggerSummaryParse).toHaveBeenCalledTimes(1)
  })

  it('replays parsed content without triggering plain title replies in detailed summary mode', async () => {
    await loadTools()
    state.config.app.detailedSummaryParse.sendParsedContent = true
    state.resolveDetailedSummaryParseContext
      .mockResolvedValueOnce({
        trigger: { keyword: '详细总结', rest: 'https://www.tiktok.com/@good.ball21/video/7643493503778966797' },
        shareContext: '',
        links: [
          {
            platform: 'tiktok',
            url: 'https://www.tiktok.com/@good.ball21/video/7643493503778966797'
          }
        ]
      })
    state.shouldTriggerDetailedSummaryParse.mockReturnValue(null)

    const handler = commandHandler('kkk-视频功能-详细解析总结')
    await handler({
      msg: '#详细总结 https://www.tiktok.com/@good.ball21/video/7643493503778966797',
      isGroup: false,
      reply: vi.fn()
    }, vi.fn())

    expect(state.runDetailedSummaryParse).toHaveBeenCalled()
    expect(state.resolveDetailedSummaryParseContext).toHaveBeenCalledTimes(1)
    expect(state.shouldTriggerDetailedSummaryParse).toHaveBeenCalledTimes(1)
  })

  it('replays parsed content without triggering plain title replies in transcript original mode', async () => {
    await loadTools()
    state.config.app.transcriptOriginal.sendParsedContent = true
    state.resolveTranscriptOriginalContext
      .mockResolvedValueOnce({
        trigger: { keyword: '转写原文', rest: 'https://www.tiktok.com/@good.ball21/video/7643493503778966797' },
        shareContext: '',
        links: [
          {
            platform: 'tiktok',
            url: 'https://www.tiktok.com/@good.ball21/video/7643493503778966797'
          }
        ]
      })
    state.shouldTriggerTranscriptOriginal.mockReturnValue(null)

    const handler = commandHandler('kkk-视频功能-转写原文')
    await handler({
      msg: '#转写原文 https://www.tiktok.com/@good.ball21/video/7643493503778966797',
      isGroup: false,
      reply: vi.fn()
    }, vi.fn())

    expect(state.runTranscriptOriginal).toHaveBeenCalled()
    expect(state.resolveTranscriptOriginalContext).toHaveBeenCalledTimes(1)
    expect(state.shouldTriggerTranscriptOriginal).toHaveBeenCalledTimes(1)
  })

  it('falls back to normal github parsing when transcript original command targets a github repository', async () => {
    await loadTools()
    state.resolveTranscriptOriginalContext.mockResolvedValue(null)
    state.shouldTriggerTranscriptOriginal.mockReturnValue(null)
    state.githubHandler.mockResolvedValue(true)
    state.githubConstructArgs.length = 0

    const handler = commandHandler('kkk-视频功能-转写原文')
    await handler({
      msg: '#转写原文 https://github.com/openai/openai-node',
      isGroup: false,
      reply: vi.fn()
    }, vi.fn())

    expect(state.runTranscriptOriginal).not.toHaveBeenCalled()
    expect(state.getGithubID).toHaveBeenCalledWith('https://github.com/openai/openai-node')
    expect(state.githubHandler).toHaveBeenCalledTimes(1)
  })

  it('does not intercept unrelated slash commands when summary keyword does not match', async () => {
    await loadTools()
    state.resolveSummaryParseContext.mockResolvedValue(null)
    const next = vi.fn()

    const handler = commandHandler('kkk-视频功能-解析总结')
    await handler({
      msg: '/help',
      isGroup: false,
      reply: vi.fn()
    }, next)

    expect(state.runSummaryParse).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
  })

  it('allows reply-based summary commands to resolve links from the replied card message', async () => {
    await loadTools()
    state.resolveSummaryParseContext.mockResolvedValue({
      trigger: {
        keyword: '总结',
        rest: ''
      },
      shareContext: '',
      links: [
        {
          platform: 'wechat',
          url: 'https://mp.weixin.qq.com/s/tAJ1B8ClOjQ41TWYJbIFTA'
        }
      ]
    })

    const next = vi.fn()
    const handler = commandHandler('kkk-视频功能-解析总结')
    const event = {
      msg: '#总结',
      replyId: 'reply-1',
      bot: { getMsg: vi.fn() },
      contact: { scene: 'group', peer: '123' },
      isGroup: false,
      reply: vi.fn()
    }

    await handler(event as any, next)

    expect(state.resolveSummaryParseContext).toHaveBeenCalledWith(event)
    expect(state.runSummaryParse).toHaveBeenCalledWith(
      event,
      expect.objectContaining({
        links: [
          {
            platform: 'wechat',
            url: 'https://mp.weixin.qq.com/s/tAJ1B8ClOjQ41TWYJbIFTA'
          }
        ]
      })
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('lets summary parse win before normal video parsing when summary keyword matches', async () => {
    await loadTools()
    state.config.app.summaryParse.sendParsedContent = false
    state.shouldTriggerSummaryParse.mockReturnValue({
      trigger: {
        keyword: '总结',
        rest: '9.23 Dhb:/ m@D.hB :6pm 06/20 跨世纪大型回旋镖，带英沦为印度殖民地 # 全球深度看抖音 # 零基础看懂全球 # 全球创作者计划 https://v.douyin.com/Wdv0YPvpaYg/ 复制此链接，打开Dou音搜索，直接观看视频！'
      },
      shareContext: '',
      links: [
        {
          platform: 'douyin',
          url: 'https://v.douyin.com/Wdv0YPvpaYg/'
        }
      ]
    })

    const handler = commandHandler('kkk-视频功能-抖音')
    await handler({
      msg: '#总结 9.23 Dhb:/ m@D.hB :6pm 06/20 跨世纪大型回旋镖，带英沦为印度殖民地 # 全球深度看抖音 # 零基础看懂全球 # 全球创作者计划 https://v.douyin.com/Wdv0YPvpaYg/ 复制此链接，打开Dou音搜索，直接观看视频！',
      isGroup: false,
      reply: vi.fn()
    }, vi.fn())

    expect(state.runSummaryParse).not.toHaveBeenCalled()
    expect(state.getTikTokID).not.toHaveBeenCalled()
  })

  it('lets detailed summary parse win before normal video parsing when detailed keyword matches', async () => {
    await loadTools()
    state.config.app.detailedSummaryParse.sendParsedContent = false
    state.shouldTriggerDetailedSummaryParse.mockReturnValue({
      trigger: {
        keyword: '详细总结',
        rest: 'https://v.douyin.com/Wdv0YPvpaYg/'
      },
      shareContext: '',
      links: [
        {
          platform: 'douyin',
          url: 'https://v.douyin.com/Wdv0YPvpaYg/'
        }
      ]
    })

    const handler = commandHandler('kkk-视频功能-抖音')
    await handler({
      msg: '#详细总结 https://v.douyin.com/Wdv0YPvpaYg/',
      isGroup: false,
      reply: vi.fn()
    }, vi.fn())

    expect(state.runDetailedSummaryParse).not.toHaveBeenCalled()
    expect(state.getTikTokID).not.toHaveBeenCalled()
  })

  it('lets transcript original parse win before normal video parsing when transcript keyword matches', async () => {
    await loadTools()
    state.config.app.transcriptOriginal.sendParsedContent = false
    state.shouldTriggerTranscriptOriginal.mockReturnValue({
      trigger: {
        keyword: '转写原文',
        rest: 'https://v.douyin.com/Wdv0YPvpaYg/'
      },
      shareContext: '',
      links: [
        {
          platform: 'douyin',
          url: 'https://v.douyin.com/Wdv0YPvpaYg/'
        }
      ]
    })

    const handler = commandHandler('kkk-视频功能-抖音')
    await handler({
      msg: '#转写原文 https://v.douyin.com/Wdv0YPvpaYg/',
      isGroup: false,
      reply: vi.fn()
    }, vi.fn())

    expect(state.runTranscriptOriginal).not.toHaveBeenCalled()
    expect(state.getTikTokID).not.toHaveBeenCalled()
  })

  it('lets transcript original replay markers bypass normal parsing handlers', async () => {
    await loadTools()
    const next = vi.fn()

    const handler = commandHandler('kkk-视频功能-抖音')
    await handler({
      msg: 'https://v.douyin.com/Wdv0YPvpaYg/ [transcript-original-parse]',
      isGroup: false,
      reply: vi.fn()
    }, next)

    expect(next).toHaveBeenCalled()
    expect(state.getTikTokID).not.toHaveBeenCalled()
  })

  it('routes hash-prefixed summary workflows away from normal douyin parsing', async () => {
    await loadTools()
    expect(commandRegex('kkk-视频功能-抖音').test('#总结 https://v.douyin.com/Wdv0YPvpaYg')).toBe(false)
    expect(commandRegex('kkk-视频功能-解析总结').test('#总结 https://v.douyin.com/Wdv0YPvpaYg')).toBe(true)
    expect(commandRegex('kkk-视频功能-抖音').test('#详细总结 https://v.douyin.com/Wdv0YPvpaYg')).toBe(false)
    expect(commandRegex('kkk-视频功能-详细解析总结').test('#详细总结 https://v.douyin.com/Wdv0YPvpaYg')).toBe(true)
    expect(commandRegex('kkk-视频功能-抖音').test('#转写原文 https://v.douyin.com/Wdv0YPvpaYg')).toBe(false)
    expect(commandRegex('kkk-视频功能-转写原文').test('#转写原文 https://v.douyin.com/Wdv0YPvpaYg')).toBe(true)
    expect(commandRegex('kkk-视频功能-解析总结').test('/总结 https://v.douyin.com/Wdv0YPvpaYg')).toBe(false)
    expect(commandRegex('kkk-视频功能-详细解析总结').test('/详细总结 https://v.douyin.com/Wdv0YPvpaYg')).toBe(false)
    expect(commandRegex('kkk-视频功能-转写原文').test('/转写原文 https://v.douyin.com/Wdv0YPvpaYg')).toBe(false)
  })

  it('does not let the generic parse prefix intercept the default #解析总结 alias', async () => {
    state.config.app.summaryParse.keywords = ['总结', '解析总结']
    await loadTools()

    const message = '#解析总结 https://v.douyin.com/Wdv0YPvpaYg'
    expect(commandRegex('kkk-视频功能-引用解析').test(message)).toBe(false)
    expect(commandRegex('kkk-视频功能-解析总结').test(message)).toBe(true)
  })

  it('keeps normal platform command regexes matching multiline json card payloads', async () => {
    await loadTools()

    const bilibiliCardPayload = `{
  "app": "com.tencent.miniapp_01",
  "meta": {
    "detail_1": {
      "title": "哔哩哔哩",
      "qqdocurl": "https:\\/\\/b23.tv\\/EGrR7XL"
    }
  }
}`

    const xCardPayload = `{
  "meta": {
    "detail_1": {
      "title": "X",
      "url": "https:\\/\\/x.com\\/cakedochi\\/status\\/2050564108114899179"
    }
  }
}`

    const wechatCardPayload = `{
  "meta": {
    "news": {
      "title": "微信公众号",
      "jumpUrl": "https:\\/\\/mp.weixin.qq.com\\/s\\/tAJ1B8ClOjQ41TWYJbIFTA"
    }
  }
}`

    const weiboCardPayload = `{
  "meta": {
    "detail_1": {
      "title": "微博",
      "url": "https:\\/\\/weibo.com\\/5177612153\\/R34sAiuo6"
    }
  }
}`

    expect(commandRegex('kkk-视频功能-B站').test(bilibiliCardPayload)).toBe(true)
    expect(commandRegex('kkk-视频功能-X').test(xCardPayload)).toBe(true)
    expect(commandRegex('kkk-视频功能-微信公众号').test(wechatCardPayload)).toBe(true)
    expect(commandRegex('kkk-视频功能-微博').test(weiboCardPayload)).toBe(true)
  })

  it('extracts urls from direct platform json cards after command dispatch', async () => {
    await loadTools()

    await commandHandler('kkk-视频功能-B站')({
      msg: `{
  "meta": {
    "detail_1": {
      "qqdocurl": "https:\\/\\/b23.tv\\/EGrR7XL"
    }
  }
}`,
      isGroup: false,
      reply: vi.fn()
    })

    await commandHandler('kkk-视频功能-微信公众号')({
      msg: `{
  "meta": {
    "news": {
      "jumpUrl": "https:\\/\\/mp.weixin.qq.com\\/s\\/tAJ1B8ClOjQ41TWYJbIFTA"
    }
  }
}`,
      isGroup: false,
      reply: vi.fn()
    })

    await commandHandler('kkk-视频功能-微博')({
      msg: `{
  "meta": {
    "detail_1": {
      "url": "https:\\/\\/weibo.com\\/5177612153\\/R34sAiuo6"
    }
  }
}`,
      isGroup: false,
      reply: vi.fn()
    })

    await commandHandler('kkk-视频功能-X')({
      msg: `{
  "meta": {
    "detail_1": {
      "url": "https:\\/\\/x.com\\/cakedochi\\/status\\/2050564108114899179"
    }
  }
}`,
      isGroup: false,
      reply: vi.fn()
    })

    expect(state.getBilibiliID).toHaveBeenCalledWith('https://b23.tv/EGrR7XL')
    expect(state.getWechatID).toHaveBeenCalledWith('https://mp.weixin.qq.com/s/tAJ1B8ClOjQ41TWYJbIFTA')
    expect(state.getWeiboID).toHaveBeenCalledWith('https://weibo.com/5177612153/R34sAiuo6')
    expect(state.getXID).toHaveBeenCalledWith('https://x.com/cakedochi/status/2050564108114899179')
  })
})
