import { beforeEach, describe, expect, it, vi } from 'vitest'

const component = (kind: string) => (key: string, props: Record<string, any> = {}) => ({
  kind,
  key,
  ...props
})

const state = vi.hoisted(() => ({
  config: {
    app: {
      autoUpdate: false,
      autoRestartOnInstalledUpdate: false,
      videoTool: true,
      priority: 800,
      removeCache: true,
      renderScale: 100,
      Theme: 0,
      RemoveWatermark: false,
      RenderWaitTime: 60,
      EmojiReply: true,
      parseTip: false,
      fakeForward: false,
      errorLogSendTo: ['master'],
      multiPageRender: true,
      multiPageTriggerAspectRatio: 3,
      multiPageMaxAspectRatio: 2.2,
      renderImageFormat: 'auto',
      renderImageQuality: 95,
      livePhotoSystem: 'oppo',
      livePhotoMode: 'video_and_livephoto',
      qrLoginAddrType: 'lan',
      qrLoginExternalAddr: '',
      summaryParse: {
        switch: true,
        keywords: ['总结'],
        sendParsedContent: false,
        llm: {
          baseUrl: 'https://api.openai.com/v1',
          apiKey: '',
          model: 'gpt-4o-mini',
          timeoutMs: 60000,
          retryCount: 1,
          retryDelayMs: 1500,
          webSearchEnabled: false,
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
          videoFrames: {
            enabled: false,
            minIntervalSeconds: 30,
            maxImages: 6,
            skipStartSeconds: 3,
            skipEndSeconds: 3,
            sourceMode: 'auto'
          },
          cloud: {
            baseUrl: 'https://api.siliconflow.cn/v1',
            apiKey: '',
            model: 'FunAudioLLM/SenseVoiceSmall',
            timeoutMs: 45000,
            retryCount: 1,
            retryDelayMs: 1500
          }
        }
      }
    },
    cookies: {},
    request: {
      timeout: 30000,
      'User-Agent': 'UnitTest UA',
      proxy: {
        switch: false,
        host: '',
        port: 7890,
        protocol: 'http',
        auth: {
          username: '',
          password: ''
        }
      }
    },
    pushlist: {
      douyin: [],
      bilibili: []
    },
    douyin: { switch: false },
    bilibili: { switch: false },
    kuaishou: { switch: false },
    xiaohongshu: { switch: false },
    heybox: { switch: false },
    github: {
      switch: false,
      renderCard: {
        enable: false,
        includeImages: false
      },
      proxy: {
        switch: false,
        host: '',
        port: 7890,
        protocol: 'http',
        auth: {
          username: '',
          password: ''
        }
      },
      plainTitleReply: {
        switch: false,
        types: []
      }
    },
    x: { switch: false },
    zhihu: { switch: false },
    tieba: { switch: false },
    wechat: { switch: false },
    weibo: { switch: false },
    tiktok: { switch: false },
    upload: {
      videoSendMode: 'file',
      usegroupfile: false,
      groupfilevalue: 50,
      imageSendMode: 'url',
      usefilelimit: false,
      filelimit: 100,
      compress: false,
      compresstrigger: 100,
      compressvalue: 50,
      compressPreset: 'auto',
      compressCustomArgs: '',
      downloadThrottle: false,
      downloadMaxSpeed: 20,
      downloadAutoReduce: false,
      downloadMinSpeed: 5
    }
  },
  commands: [] as Array<{ pattern: RegExp | string, handler: (...args: any[]) => unknown, options?: Record<string, any> }>,
  friendHooks: [] as Array<(event: any, next: () => void) => unknown>,
  tasks: [] as Array<{ name: string, cron: string, handler: () => Promise<unknown>, options?: Record<string, any> }>,
  dbGet: vi.fn(),
  dbSet: vi.fn(),
  dbDel: vi.fn(),
  checkPkgUpdate: vi.fn(),
  updatePkg: vi.fn(),
  restart: vi.fn(),
  restartDirect: vi.fn(),
  sendMaster: vi.fn(),
  getAllBotList: vi.fn(() => []),
  getChangelogImage: vi.fn(async () => []),
  getNonConsoleMasters: vi.fn(() => []),
  fsReadFileSync: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn()
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  const readFileSync = (...args: unknown[]) => state.fsReadFileSync(...args)

  return {
    ...actual,
    default: {
      ...actual.default,
      readFileSync
    },
    readFileSync
  }
})

vi.mock('node-karin', () => ({
  default: {
    command: (pattern: RegExp | string, handler: (...args: any[]) => unknown, options?: Record<string, any>) => {
      state.commands.push({ pattern, handler, options })
      return { pattern, handler, options }
    },
    task: (name: string, cron: string, handler: () => Promise<unknown>, options?: Record<string, any>) => {
      state.tasks.push({ name, cron, handler, options })
      return { name, cron, handler, options }
    },
    sendMaster: (...args: unknown[]) => state.sendMaster(...args),
    getAllBotList: () => state.getAllBotList()
  },
  checkPkgUpdate: (...args: unknown[]) => state.checkPkgUpdate(...args),
  db: {
    get: (...args: unknown[]) => state.dbGet(...args),
    set: (...args: unknown[]) => state.dbSet(...args),
    del: (...args: unknown[]) => state.dbDel(...args)
  },
  hooks: {
    message: {
      friend: (handler: (event: any, next: () => void) => unknown) => {
        state.friendHooks.push(handler)
        return handler
      }
    }
  },
  Message: class {},
  restart: (...args: unknown[]) => state.restart(...args),
  restartDirect: (...args: unknown[]) => state.restartDirect(...args),
  segment: {
    text: (text: string) => ({ type: 'text', text }),
    image: (file: string) => ({ type: 'image', file })
  },
  updatePkg: (...args: unknown[]) => state.updatePkg(...args),
  logger: {
    info: (...args: unknown[]) => state.loggerInfo(...args),
    warn: (...args: unknown[]) => state.loggerWarn(...args),
    error: (...args: unknown[]) => state.loggerError(...args)
  },
  components: {
    accordion: {
      create: component('accordion'),
      createItem: component('accordionItem')
    },
    accordionPro: {
      create: component('accordionPro')
    },
    button: {
      create: component('button')
    },
    card: {
      create: component('card')
    },
    checkbox: {
      create: component('checkbox'),
      group: component('checkboxGroup')
    },
    divider: {
      create: component('divider')
    },
    input: {
      group: component('inputGroup'),
      number: component('numberInput'),
      string: component('stringInput')
    },
    radio: {
      create: component('radio'),
      group: component('radioGroup')
    },
    select: {
      create: component('select')
    },
    switch: {
      create: component('switch')
    }
  },
  defineConfig: (config: any) => config
}))

vi.mock('@/module', () => ({
  Root: {
    pluginName: 'karin-plugin-kkk',
    pluginVersion: '2.31.95',
    pluginPath: '/mock/node_modules/.pnpm/karin-plugin-kkk@2.31.95/node_modules/karin-plugin-kkk',
    karinVersion: 'test'
  }
}))

vi.mock('@/module/utils/changelog', () => ({
  getChangelogImage: (...args: unknown[]) => state.getChangelogImage(...args)
}))

vi.mock('@/module/utils/Config', () => ({
  Config: {
    ...state.config,
    All: async () => state.config
  }
}))

vi.mock('@/module/utils/ErrorHandler', () => ({
  wrapWithErrorHandler: (handler: unknown) => handler
}))

vi.mock('@/module/utils/master', () => ({
  getNonConsoleMasters: () => state.getNonConsoleMasters()
}))

vi.mock('@/module/utils/amagiClient', () => ({
  reloadAmagiConfig: vi.fn()
}))

vi.mock('@/module/utils/guestCookieWebConfig', () => ({
  createGuestCookieWebConfig: () => [],
  normalizeGuestCookieFrontendConfig: vi.fn()
}))

vi.mock('@/platform/bilibili/web.config', () => ({
  BilibiliWeb: () => []
}))
vi.mock('@/platform/douyin/web.config', () => ({
  DouyinWeb: () => []
}))
vi.mock('@/platform/heybox/web.config', () => ({
  HeyboxWeb: () => []
}))
vi.mock('@/platform/kuaishou/web.config', () => ({
  KuaishouWeb: () => []
}))
vi.mock('@/platform/tieba/web.config', () => ({
  TiebaWeb: () => []
}))
vi.mock('@/platform/tiktok/web.config', () => ({
  TikTokWeb: () => []
}))
vi.mock('@/platform/wechat/web.config', () => ({
  WechatWeb: () => []
}))
vi.mock('@/platform/weibo/web.config', () => ({
  WeiboWeb: () => []
}))
vi.mock('@/platform/x/web.config', () => ({
  XWeb: () => []
}))
vi.mock('@/platform/xiaohongshu/web.config', () => ({
  XiaohongshuWeb: () => []
}))
vi.mock('@/platform/zhihu/web.config', () => ({
  ZhihuWeb: () => []
}))

const findComponentByKey = (value: unknown, key: string): Record<string, any> | null => {
  if (!value || typeof value !== 'object') return null
  if ('key' in value && (value as Record<string, unknown>).key === key) return value as Record<string, any>

  for (const child of Object.values(value as Record<string, unknown>)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findComponentByKey(item, key)
        if (found) return found
      }
    } else if (child && typeof child === 'object') {
      const found = findComponentByKey(child, key)
      if (found) return found
    }
  }

  return null
}

const findChildrenKeys = (value: unknown, key: string): string[] => {
  const found = findComponentByKey(value, key)
  const children = Array.isArray(found?.children) ? found.children : []
  return children
    .filter(item => item && typeof item === 'object' && 'key' in item && typeof item.key === 'string')
    .map(item => item.key as string)
}

const loadUpdateApp = async () => {
  vi.resetModules()
  state.commands.length = 0
  state.friendHooks.length = 0
  state.tasks.length = 0
  await import('../src/apps/update')
}

const flushAsyncEffects = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('update settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.commands.length = 0
    state.friendHooks.length = 0
    state.tasks.length = 0
    state.config.app.autoUpdate = false
    state.config.app.autoRestartOnInstalledUpdate = false
    state.dbGet.mockResolvedValue(undefined)
    state.checkPkgUpdate.mockResolvedValue({
      status: 'yes',
      local: '2.31.95',
      remote: '2.31.96'
    })
    state.fsReadFileSync.mockReturnValue(JSON.stringify({
      name: 'karin-plugin-kkk',
      version: '2.31.95'
    }))
    state.updatePkg.mockResolvedValue({
      status: 'ok',
      local: '2.31.95',
      remote: '2.31.96'
    })
  })

  it('does not run scheduled update checks when autoUpdate is disabled', async () => {
    await loadUpdateApp()

    expect(state.tasks).toHaveLength(2)
    await state.tasks[0].handler()

    expect(state.checkPkgUpdate).not.toHaveBeenCalled()
    expect(state.sendMaster).not.toHaveBeenCalled()
  })

  it('does not react to update reply hooks when autoUpdate is disabled', async () => {
    await loadUpdateApp()

    state.dbGet.mockResolvedValue('msg-1')
    const next = vi.fn()
    await state.friendHooks[0]?.({
      msg: '更新',
      replyId: 'msg-1',
      reply: vi.fn()
    }, next)

    expect(state.checkPkgUpdate).not.toHaveBeenCalled()
    expect(state.updatePkg).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('blocks manual update command when autoUpdate is disabled', async () => {
    await loadUpdateApp()

    const command = state.commands.find(item => item.options?.name === 'kkk-更新')
    expect(command).toBeTruthy()

    const reply = vi.fn()
    await command?.handler({ reply } as any)

    expect(reply).toHaveBeenCalledWith('自动更新已关闭，请先在前端配置页开启后再使用。', { reply: true })
    expect(state.checkPkgUpdate).not.toHaveBeenCalled()
    expect(state.updatePkg).not.toHaveBeenCalled()
  })

  it('renders auto update switch in app settings and keeps video frame switch in its own block', async () => {
    const { webConfig } = await import('../src/web.config')
    const view = await webConfig.components?.()
    const summaryReasoningField = findComponentByKey(view, 'summaryParse:llm:reasoningEffort')
    const detailedReasoningField = findComponentByKey(view, 'detailedSummaryParse:llm:reasoningEffort')
    const summaryChildrenKeys = findChildrenKeys(view, 'cfg:summaryParse')
    const detailedChildrenKeys = findChildrenKeys(view, 'cfg:detailedSummaryParse')

    expect(findComponentByKey(view, 'autoUpdate')).toMatchObject({
      kind: 'switch',
      defaultSelected: false
    })
    expect(findComponentByKey(view, 'autoRestartOnInstalledUpdate')).toMatchObject({
      kind: 'switch',
      defaultSelected: false
    })
    expect(findComponentByKey(view, 'longTaskCompletionNotify')).toMatchObject({
      kind: 'switch',
      defaultSelected: true
    })
    expect(summaryChildrenKeys).toContain('summaryParse:llm:webSearchEnabled')
    expect(summaryChildrenKeys).toContain('summaryParse:llm:reasoningEnabled')
    expect(summaryChildrenKeys).toContain('summaryParse:llm:reasoningEffort')
    expect(summaryChildrenKeys).toContain('divider-summary-parse-video-frames')
    expect(summaryChildrenKeys).toContain('summaryParse:asr:videoFrames:enabled')
    expect(summaryChildrenKeys.indexOf('summaryParse:asr:cloud:baseUrl')).toBeLessThan(summaryChildrenKeys.indexOf('divider-summary-parse-video-frames'))
    expect(detailedChildrenKeys.indexOf('detailedSummaryParse:asr:cloud:baseUrl')).toBeLessThan(detailedChildrenKeys.indexOf('divider-detailed-summary-parse-video-frames'))
    expect(summaryReasoningField?.radio).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'xhigh' })
    ]))
    expect(detailedReasoningField?.radio).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'xhigh' })
    ]))
  })

  it('does not check installed version on startup when auto restart is disabled', async () => {
    await loadUpdateApp()
    await flushAsyncEffects()

    expect(state.restartDirect).not.toHaveBeenCalled()
    expect(state.loggerInfo).not.toHaveBeenCalledWith(expect.stringContaining('检测到已安装新版本'))
  })

  it('restarts on startup when installed version is newer and auto restart is enabled from the top-level package path', async () => {
    state.config.app.autoRestartOnInstalledUpdate = true
    state.fsReadFileSync.mockImplementation((target: unknown) => {
      if (String(target) === '/mock/node_modules/karin-plugin-kkk/package.json') {
        return JSON.stringify({
          name: 'karin-plugin-kkk',
          version: '2.31.96'
        })
      }
      if (String(target) === '/mock/node_modules/.pnpm/karin-plugin-kkk@2.31.95/node_modules/karin-plugin-kkk/package.json') {
        return JSON.stringify({
          name: 'karin-plugin-kkk',
          version: '2.31.95'
        })
      }
      throw new Error(`unexpected path: ${String(target)}`)
    })

    await loadUpdateApp()
    await flushAsyncEffects()

    expect(state.restartDirect).toHaveBeenCalledTimes(1)
    expect(state.fsReadFileSync).toHaveBeenCalledWith('/mock/node_modules/karin-plugin-kkk/package.json', 'utf-8')
    expect(state.loggerInfo).toHaveBeenCalledWith(expect.stringContaining('/mock/node_modules/karin-plugin-kkk/package.json'))
    expect(state.loggerInfo).toHaveBeenCalledWith(expect.stringContaining('2.31.95 -> 2.31.96'))
  })

  it('does not restart on startup when installed version is the same or lower', async () => {
    state.config.app.autoRestartOnInstalledUpdate = true
    state.fsReadFileSync.mockReturnValueOnce(JSON.stringify({
      name: 'karin-plugin-kkk',
      version: '2.31.95'
    }))

    await loadUpdateApp()
    await flushAsyncEffects()

    expect(state.restartDirect).not.toHaveBeenCalled()
  })

  it('restarts during scheduled installed-version checks when a newer version is detected', async () => {
    state.config.app.autoRestartOnInstalledUpdate = true
    await loadUpdateApp()
    state.fsReadFileSync.mockReturnValue(JSON.stringify({
      name: 'karin-plugin-kkk',
      version: '2.31.97'
    }))

    await state.tasks[1].handler()

    expect(state.restartDirect).toHaveBeenCalledTimes(1)
  })

  it('does not restart repeatedly after entering the auto restart flow once', async () => {
    state.config.app.autoRestartOnInstalledUpdate = true
    await loadUpdateApp()
    state.fsReadFileSync.mockReturnValue(JSON.stringify({
      name: 'karin-plugin-kkk',
      version: '2.31.97'
    }))

    await state.tasks[1].handler()
    await state.tasks[1].handler()

    expect(state.restartDirect).toHaveBeenCalledTimes(1)
  })

  it('logs and skips auto restart when installed package version cannot be read', async () => {
    state.config.app.autoRestartOnInstalledUpdate = true
    state.fsReadFileSync.mockImplementation(() => {
      throw new Error('read failed')
    })

    await loadUpdateApp()
    await flushAsyncEffects()

    expect(state.restartDirect).not.toHaveBeenCalled()
    expect(state.loggerWarn).toHaveBeenCalledWith(expect.stringContaining('检测已安装版本失败'))
  })
})
