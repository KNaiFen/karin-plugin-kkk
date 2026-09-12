import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  allConfig: {
    app: {
      autoRestartOnInstalledUpdate: false,
      longTaskCompletionNotify: true,
      longTaskCompletionNotifyThresholdMs: 300000,
      multiPageRender: true,
      multiPageTriggerAspectRatio: 3,
      multiPageMaxAspectRatio: 2.2,
      renderImageFormat: 'auto',
      renderImageQuality: 95,
      summaryParse: {
        switch: false,
        keywords: ['总结', '解析总结'],
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
          cloud: {
            baseUrl: 'https://api.siliconflow.cn/v1',
            apiKey: '',
            model: 'FunAudioLLM/SenseVoiceSmall',
            timeoutMs: 45000
          }
        }
      },
      detailedSummaryParse: {
        switch: false,
        keywords: ['详细总结', '深度总结'],
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
          apiKey: '',
          model: 'gpt-5-mini',
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
            apiKey: '',
            model: 'gpt-4o-mini-transcribe',
            timeoutMs: 45000,
            retryCount: 1,
            retryDelayMs: 1500
          }
        }
      }
      ,
      transcriptOriginal: {
        switch: false,
        keywords: ['转写原文', '原文'],
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
          apiKey: '',
          model: 'gpt-5-mini',
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
            apiKey: '',
            model: 'gpt-4o-mini-transcribe',
            timeoutMs: 45000,
            retryCount: 1,
            retryDelayMs: 1500
          }
        }
      }
    },
    request: {
      timeout: 30000,
      'User-Agent': 'UnitTest UA',
      proxy: {
        switch: true,
        host: '127.0.0.1',
        port: 7890,
        protocol: 'http',
        auth: {
          username: 'old-user',
          password: 'old-pass'
        }
      }
    },
    tiktok: {
      switch: true,
      videoTool: true,
      priority: 800,
      proxy: {
        switch: true,
        host: '127.0.0.1',
        port: 7890,
        protocol: 'http',
        auth: {
          username: 'old-user',
          password: 'old-pass'
        }
      }
    },
    x: {
      switch: true,
      sendContent: ['info', 'image', 'video'],
      renderCard: {
        enable: true,
        includeImages: false
      },
      plainTitleReply: {
        switch: true,
        types: ['video', 'image', 'text']
      },
      proxy: {
        switch: true,
        host: '127.0.0.1',
        port: 7890,
        protocol: 'http',
        auth: {
          username: 'old-user',
          password: 'old-pass'
        }
      }
    },
    github: {
      switch: true,
      sendContent: ['info', 'image'],
      renderCard: {
        enable: true,
        includeImages: false
      },
      plainTitleReply: {
        switch: true,
        types: ['text', 'image']
      },
      token: ''
    },
    pushlist: {
      douyin: [],
      bilibili: []
    }
  },
  modifyPro: vi.fn(),
  reloadAmagiConfig: vi.fn(),
  syncConfigToDatabase: vi.fn()
}))

const component = (kind: string) => (key: string, props: Record<string, any> = {}) => ({
  kind,
  key,
  ...props
})

vi.mock('node-karin', () => ({
  components: {
    accordion: {
      create: component('accordion'),
      createItem: component('accordionItem')
    },
    button: {
      create: component('button')
    },
    card: {
      create: component('card')
    },
    divider: {
      create: component('divider')
    },
    input: {
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
    pluginVersion: '0.0.0-test'
  }
}))

vi.mock('@/module/utils/amagiClient', () => ({
  reloadAmagiConfig: () => state.reloadAmagiConfig()
}))

vi.mock('@/module/utils/Config', () => ({
  Config: {
    All: () => state.allConfig,
    ModifyPro: (...args: unknown[]) => state.modifyPro(...args),
    syncConfigToDatabase: () => state.syncConfigToDatabase()
  }
}))

vi.mock('@/module/utils/guestCookieWebConfig', () => ({
  createGuestCookieWebConfig: () => [],
  normalizeGuestCookieFrontendConfig: vi.fn()
}))

const { webConfig } = await import('../src/web.config')

describe('web config save normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.allConfig.pushlist = {
      douyin: [],
      bilibili: []
    }
    state.modifyPro.mockResolvedValue(true)
    state.syncConfigToDatabase.mockResolvedValue(undefined)
  })

  it('keeps numeric proxy credentials as strings while preserving numeric ports', async () => {
    const result = await webConfig.save({
      request: [{
        timeout: '30000',
        'User-Agent': 'UnitTest UA',
        'proxy:switch': true,
        'proxy:host': '127.0.0.1',
        'proxy:port': '7891',
        'proxy:protocol': 'http',
        'proxy:auth:username': '123456',
        'proxy:auth:password': '654321'
      }],
      tiktok: [{
        switch: true,
        videoTool: true,
        priority: '800',
        'proxy:switch': true,
        'proxy:host': '127.0.0.1',
        'proxy:port': '7892',
        'proxy:protocol': 'http',
        'proxy:auth:username': '234567',
        'proxy:auth:password': '765432'
      }],
      x: [{
        switch: true,
        sendContent: ['info', 'image', 'video'],
        'renderCard:enable': true,
        'renderCard:includeImages': false,
        'plainTitleReply:switch': true,
        'plainTitleReply:types': ['video', 'image', 'text'],
        'proxy:switch': true,
        'proxy:host': '127.0.0.1',
        'proxy:port': '7893',
        'proxy:protocol': 'http',
        'proxy:auth:username': '345678',
        'proxy:auth:password': '876543'
      }]
    } as any)

    expect(result.formatCfg.request.proxy.auth).toEqual({
      username: '123456',
      password: '654321'
    })
    expect(result.formatCfg.request.proxy.port).toBe(7891)
    expect(result.formatCfg.tiktok.proxy.auth).toEqual({
      username: '234567',
      password: '765432'
    })
    expect(result.formatCfg.tiktok.proxy.port).toBe(7892)
    expect(result.formatCfg.x.proxy.auth).toEqual({
      username: '345678',
      password: '876543'
    })
    expect(result.formatCfg.x.proxy.port).toBe(7893)
  })

  it('preserves github token and nested github switches when saving from web config', async () => {
    const result = await webConfig.save({
      github: [{
        switch: true,
        sendContent: ['info', 'image'],
        'renderCard:enable': true,
        'renderCard:includeImages': false,
        'plainTitleReply:switch': true,
        'plainTitleReply:types': ['text', 'image'],
        token: 'ghp_test_token',
        'proxy:switch': true,
        'proxy:host': '127.0.0.1',
        'proxy:port': '7894',
        'proxy:protocol': 'https',
        'proxy:auth:username': '456789',
        'proxy:auth:password': '987654'
      }]
    } as any)

    expect(result.formatCfg.github).toEqual({
      switch: true,
      sendContent: ['info', 'image'],
      renderCard: {
        enable: true,
        includeImages: false
      },
      plainTitleReply: {
        switch: true,
        types: ['text', 'image']
      },
      token: 'ghp_test_token',
      proxy: {
        switch: true,
        host: '127.0.0.1',
        port: 7894,
        protocol: 'https',
        auth: {
          username: '456789',
          password: '987654'
        }
      }
    })
  })

  it('converts push jitter seconds to numbers while keeping cron expressions as strings', async () => {
    const result = await webConfig.save({
      bilibili: [{
        'push:switch': true,
        'push:permission': 'master',
        'push:cron': '*/10 * * * *',
        'push:jitterSeconds': '120',
        'push:riskCooldownEnabled': false,
        'push:riskCooldownMs': '1800000'
      }],
      douyin: [{
        'push:switch': true,
        'push:permission': 'master',
        'push:cron': '*/10 * * * *',
        'push:jitterSeconds': '90'
      }]
    } as any)

    expect(result.formatCfg.bilibili.push.cron).toBe('*/10 * * * *')
    expect(result.formatCfg.bilibili.push.jitterSeconds).toBe(120)
    expect(result.formatCfg.bilibili.push.riskCooldownEnabled).toBe(false)
    expect(result.formatCfg.bilibili.push.riskCooldownMs).toBe(1800000)
    expect(result.formatCfg.douyin.push.cron).toBe('*/10 * * * *')
    expect(result.formatCfg.douyin.push.jitterSeconds).toBe(90)
  })

  it('does not generate or persist an empty pushlist when saving another module', async () => {
    state.allConfig.pushlist = {
      douyin: [{
        switch: true,
        sec_uid: 'sec-1',
        short_id: 'author-1',
        group_id: ['100:200'],
        remark: '作者'
      }],
      bilibili: []
    } as any

    const result = await webConfig.save({
      app: [{
        longTaskCompletionNotify: false
      }]
    } as any)

    expect(result.formatCfg).not.toHaveProperty('pushlist')
    expect(state.modifyPro).not.toHaveBeenCalledWith('pushlist', expect.anything())
    expect(state.syncConfigToDatabase).not.toHaveBeenCalled()
  })

  it('reports a failed save when changed subscriptions cannot be synchronized', async () => {
    state.allConfig.pushlist = {
      douyin: [{
        switch: true,
        sec_uid: 'sec-1',
        short_id: 'author-1',
        group_id: ['100:200'],
        remark: '作者'
      }],
      bilibili: []
    } as any
    state.syncConfigToDatabase.mockRejectedValue(new Error('database unavailable'))

    const result = await webConfig.save({
      'pushlist:douyin': []
    } as any)

    expect(state.modifyPro).toHaveBeenCalledWith('pushlist', expect.objectContaining({
      douyin: []
    }))
    expect(state.syncConfigToDatabase).toHaveBeenCalledTimes(1)
    expect(result.success).toBe(false)
    expect(result.message).toBe('配置已保存，但订阅数据库同步失败')
  })

  it('retries subscription sync when the submitted pushlist is unchanged after a failure', async () => {
    state.allConfig.pushlist = {
      douyin: [{
        switch: true,
        sec_uid: 'sec-1',
        short_id: 'author-1',
        group_id: ['100:200'],
        remark: '作者'
      }],
      bilibili: []
    } as any
    state.modifyPro.mockImplementation(async (module: string, value: any) => {
      if (module === 'pushlist') state.allConfig.pushlist = value
      return true
    })
    state.syncConfigToDatabase
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce(undefined)

    const firstResult = await webConfig.save({
      'pushlist:douyin': []
    } as any)
    const retryResult = await webConfig.save({
      'pushlist:douyin': []
    } as any)

    expect(state.modifyPro).toHaveBeenCalledTimes(1)
    expect(state.syncConfigToDatabase).toHaveBeenCalledTimes(2)
    expect(firstResult.success).toBe(false)
    expect(firstResult.message).toBe('配置已保存，但订阅数据库同步失败')
    expect(retryResult.success).toBe(true)
    expect(retryResult.message).toBe('保存成功 Ciallo～(∠・ω< )⌒☆')
  })

  it('does not synchronize subscriptions when pushlist persistence fails', async () => {
    state.allConfig.pushlist = {
      douyin: [{
        switch: true,
        sec_uid: 'sec-1',
        short_id: 'author-1',
        group_id: ['100:200'],
        remark: '作者'
      }],
      bilibili: []
    } as any
    state.modifyPro.mockResolvedValue(false)

    const result = await webConfig.save({
      'pushlist:douyin': []
    } as any)

    expect(state.modifyPro).toHaveBeenCalledTimes(1)
    expect(state.syncConfigToDatabase).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    expect(result.message).toBe('配置保存失败')
  })

  it('reports a partial failure when another module saves before pushlist persistence fails', async () => {
    state.allConfig.pushlist = {
      douyin: [{
        switch: true,
        sec_uid: 'sec-1',
        short_id: 'author-1',
        group_id: ['100:200'],
        remark: '作者'
      }],
      bilibili: []
    } as any
    state.modifyPro.mockImplementation(async (module: string) => module !== 'pushlist')

    const result = await webConfig.save({
      app: [{
        longTaskCompletionNotify: false
      }],
      'pushlist:douyin': []
    } as any)

    expect(state.modifyPro).toHaveBeenCalledWith('app', expect.objectContaining({
      longTaskCompletionNotify: false
    }))
    expect(state.modifyPro).toHaveBeenCalledWith('pushlist', expect.objectContaining({
      douyin: []
    }))
    expect(state.syncConfigToDatabase).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    expect(result.message).toBe('部分配置保存失败')
  })

  it('keeps partial pushlist submissions scoped to the submitted platform', async () => {
    const result = await webConfig.save({
      'pushlist:douyin': []
    } as any)

    expect(result.formatCfg.pushlist).toEqual({ douyin: [] })
    expect(result.formatCfg.pushlist).not.toHaveProperty('bilibili')
  })

  it('converts smart render ratio settings to numbers while preserving image format as a string', async () => {
    const result = await webConfig.save({
      app: [{
        autoUpdate: true,
        autoRestartOnInstalledUpdate: true,
        multiPageRender: true,
        multiPageTriggerAspectRatio: '3.4',
        multiPageMaxAspectRatio: '2.15',
        renderImageFormat: 'jpeg',
        renderImageQuality: '87'
      }]
    } as any)

    expect(result.formatCfg.app.autoUpdate).toBe(true)
    expect(result.formatCfg.app.autoRestartOnInstalledUpdate).toBe(true)
    expect(result.formatCfg.app.multiPageRender).toBe(true)
    expect(result.formatCfg.app.multiPageTriggerAspectRatio).toBe(3.4)
    expect(result.formatCfg.app.multiPageMaxAspectRatio).toBe(2.15)
    expect(result.formatCfg.app.renderImageFormat).toBe('jpeg')
    expect(result.formatCfg.app.renderImageQuality).toBe(87)
  })

  it('converts long task completion notify settings while preserving booleans and numeric threshold', async () => {
    const result = await webConfig.save({
      app: [{
        longTaskCompletionNotify: false,
        longTaskCompletionNotifyThresholdMs: '420000'
      }]
    } as any)

    expect(result.formatCfg.app.longTaskCompletionNotify).toBe(false)
    expect(result.formatCfg.app.longTaskCompletionNotifyThresholdMs).toBe(420000)
  })

  it('normalizes summary parse settings with nested llm and asr fields', async () => {
    const result = await webConfig.save({
      summaryParse: [{
        'summaryParse:switch': true,
        'summaryParse:keywords': ['总结', '速览'],
        'summaryParse:sendParsedContent': true,
        'summaryParse:llm:baseUrl': 'https://example.com/v1',
        'summaryParse:llm:apiKey': 'secret',
        'summaryParse:llm:model': 'glm-4.5',
        'summaryParse:llm:timeoutMs': '45000',
        'summaryParse:llm:retryCount': '2',
        'summaryParse:llm:retryDelayMs': '2000',
        'summaryParse:llm:webSearchEnabled': true,
        'summaryParse:llm:reasoningEnabled': true,
        'summaryParse:llm:reasoningEffort': 'medium',
        'summaryParse:asr:mode': 'local',
        'summaryParse:asr:whisperCppPath': '/usr/local/bin/whisper-cli',
        'summaryParse:asr:modelPath': '/models/ggml-base.bin',
        'summaryParse:asr:language': 'zh',
        'summaryParse:asr:threads': '6',
        'summaryParse:asr:ffmpegPath': '/usr/local/bin/ffmpeg',
        'summaryParse:asr:audioBitrateKbps': '32',
        'summaryParse:asr:maxSegmentMinutes': '25',
        'summaryParse:asr:cloud:baseUrl': 'https://api.siliconflow.cn/v1',
        'summaryParse:asr:cloud:apiKey': 'asr-secret',
        'summaryParse:asr:cloud:model': 'TeleAI/TeleSpeechASR',
        'summaryParse:asr:cloud:timeoutMs': '55000',
        'summaryParse:asr:cloud:retryCount': '3',
        'summaryParse:asr:cloud:retryDelayMs': '2500'
      }]
    } as any)

    expect(result.formatCfg.app.summaryParse).toEqual({
      switch: true,
      keywords: ['总结', '速览'],
      sendParsedContent: true,
      llm: {
        baseUrl: 'https://example.com/v1',
        apiKey: 'secret',
        model: 'glm-4.5',
        timeoutMs: 45000,
        retryCount: 2,
        retryDelayMs: 2000,
        webSearchEnabled: true,
        reasoningEnabled: true,
        reasoningEffort: 'medium'
      },
      asr: {
        mode: 'local',
        whisperCppPath: '/usr/local/bin/whisper-cli',
        modelPath: '/models/ggml-base.bin',
        language: 'zh',
        threads: 6,
        ffmpegPath: '/usr/local/bin/ffmpeg',
        audioBitrateKbps: 32,
        maxSegmentMinutes: 25,
        cloud: {
          baseUrl: 'https://api.siliconflow.cn/v1',
          apiKey: 'asr-secret',
          model: 'TeleAI/TeleSpeechASR',
          timeoutMs: 55000,
          retryCount: 3,
          retryDelayMs: 2500
        }
      }
    })
  })

  it('normalizes detailed summary parse settings with responses llm options', async () => {
    const result = await webConfig.save({
      detailedSummaryParse: [{
        'detailedSummaryParse:switch': true,
        'detailedSummaryParse:keywords': ['详细总结', '研报'],
        'detailedSummaryParse:sendParsedContent': true,
        'detailedSummaryParse:markdownRender:enabled': true,
        'detailedSummaryParse:markdownRender:sendTextVersion': true,
        'detailedSummaryParse:markdownRender:fontSizePx': '18',
        'detailedSummaryParse:markdownRender:multiPageEnabled': true,
        'detailedSummaryParse:markdownRender:multiPageTriggerAspectRatio': '3.5',
        'detailedSummaryParse:markdownRender:multiPageMaxAspectRatio': '2.05',
        'detailedSummaryParse:llm:baseUrl': 'https://api.openai.com/v1',
        'detailedSummaryParse:llm:apiKey': 'secret',
        'detailedSummaryParse:llm:model': 'gpt-5',
        'detailedSummaryParse:llm:timeoutMs': '90000',
        'detailedSummaryParse:llm:retryCount': '2',
        'detailedSummaryParse:llm:retryDelayMs': '2500',
        'detailedSummaryParse:llm:webSearchEnabled': true,
        'detailedSummaryParse:llm:reasoningEnabled': true,
        'detailedSummaryParse:llm:reasoningEffort': 'xhigh',
        'detailedSummaryParse:asr:mode': 'local',
        'detailedSummaryParse:asr:whisperCppPath': '/usr/local/bin/whisper-cli',
        'detailedSummaryParse:asr:modelPath': '/models/ggml-base.bin',
        'detailedSummaryParse:asr:language': 'zh',
        'detailedSummaryParse:asr:threads': '6',
        'detailedSummaryParse:asr:ffmpegPath': '/usr/local/bin/ffmpeg',
        'detailedSummaryParse:asr:audioBitrateKbps': '32',
        'detailedSummaryParse:asr:maxSegmentMinutes': '25',
        'detailedSummaryParse:asr:cloud:baseUrl': 'https://api.openai.com/v1',
        'detailedSummaryParse:asr:cloud:apiKey': 'asr-secret',
        'detailedSummaryParse:asr:cloud:model': 'gpt-4o-mini-transcribe',
        'detailedSummaryParse:asr:cloud:timeoutMs': '55000',
        'detailedSummaryParse:asr:cloud:retryCount': '3',
        'detailedSummaryParse:asr:cloud:retryDelayMs': '2500'
      }]
    } as any)

    expect(result.formatCfg.app.detailedSummaryParse).toEqual({
      switch: true,
      keywords: ['详细总结', '研报'],
      sendParsedContent: true,
      markdownRender: {
        enabled: true,
        sendTextVersion: true,
        fontSizePx: 18,
        multiPageEnabled: true,
        multiPageTriggerAspectRatio: 3.5,
        multiPageMaxAspectRatio: 2.05
      },
      llm: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'secret',
        model: 'gpt-5',
        timeoutMs: 90000,
        retryCount: 2,
        retryDelayMs: 2500,
        webSearchEnabled: true,
        reasoningEnabled: true,
        reasoningEffort: 'xhigh'
      },
      asr: {
        mode: 'local',
        whisperCppPath: '/usr/local/bin/whisper-cli',
        modelPath: '/models/ggml-base.bin',
        language: 'zh',
        threads: 6,
        ffmpegPath: '/usr/local/bin/ffmpeg',
        audioBitrateKbps: 32,
        maxSegmentMinutes: 25,
        cloud: {
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'asr-secret',
          model: 'gpt-4o-mini-transcribe',
          timeoutMs: 55000,
          retryCount: 3,
          retryDelayMs: 2500
        }
      }
    })
  })

  it('normalizes transcript original settings with responses llm options', async () => {
    const result = await webConfig.save({
      transcriptOriginal: [{
        'transcriptOriginal:switch': true,
        'transcriptOriginal:keywords': ['转写原文', '原文'],
        'transcriptOriginal:sendParsedContent': true,
        'transcriptOriginal:markdownRender:enabled': true,
        'transcriptOriginal:markdownRender:sendTextVersion': true,
        'transcriptOriginal:markdownRender:fontSizePx': '18',
        'transcriptOriginal:markdownRender:multiPageEnabled': true,
        'transcriptOriginal:markdownRender:multiPageTriggerAspectRatio': '3.5',
        'transcriptOriginal:markdownRender:multiPageMaxAspectRatio': '2.05',
        'transcriptOriginal:llm:baseUrl': 'https://api.openai.com/v1',
        'transcriptOriginal:llm:apiKey': 'secret',
        'transcriptOriginal:llm:model': 'gpt-5',
        'transcriptOriginal:llm:timeoutMs': '90000',
        'transcriptOriginal:llm:retryCount': '2',
        'transcriptOriginal:llm:retryDelayMs': '2500',
        'transcriptOriginal:llm:reasoningEnabled': true,
        'transcriptOriginal:llm:reasoningEffort': 'xhigh',
        'transcriptOriginal:asr:mode': 'local',
        'transcriptOriginal:asr:whisperCppPath': '/usr/local/bin/whisper-cli',
        'transcriptOriginal:asr:modelPath': '/models/ggml-base.bin',
        'transcriptOriginal:asr:language': 'zh',
        'transcriptOriginal:asr:threads': '6',
        'transcriptOriginal:asr:ffmpegPath': '/usr/local/bin/ffmpeg',
        'transcriptOriginal:asr:audioBitrateKbps': '32',
        'transcriptOriginal:asr:maxSegmentMinutes': '25',
        'transcriptOriginal:asr:cloud:baseUrl': 'https://api.openai.com/v1',
        'transcriptOriginal:asr:cloud:apiKey': 'asr-secret',
        'transcriptOriginal:asr:cloud:model': 'gpt-4o-mini-transcribe',
        'transcriptOriginal:asr:cloud:timeoutMs': '55000',
        'transcriptOriginal:asr:cloud:retryCount': '3',
        'transcriptOriginal:asr:cloud:retryDelayMs': '2500'
      }]
    } as any)

    expect(result.formatCfg.app.transcriptOriginal).toEqual({
      switch: true,
      keywords: ['转写原文', '原文'],
      sendParsedContent: true,
      markdownRender: {
        enabled: true,
        sendTextVersion: true,
        fontSizePx: 18,
        multiPageEnabled: true,
        multiPageTriggerAspectRatio: 3.5,
        multiPageMaxAspectRatio: 2.05
      },
      llm: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'secret',
        model: 'gpt-5',
        timeoutMs: 90000,
        retryCount: 2,
        retryDelayMs: 2500,
        reasoningEnabled: true,
        reasoningEffort: 'xhigh'
      },
      asr: {
        mode: 'local',
        whisperCppPath: '/usr/local/bin/whisper-cli',
        modelPath: '/models/ggml-base.bin',
        language: 'zh',
        threads: 6,
        ffmpegPath: '/usr/local/bin/ffmpeg',
        audioBitrateKbps: 32,
        maxSegmentMinutes: 25,
        cloud: {
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'asr-secret',
          model: 'gpt-4o-mini-transcribe',
          timeoutMs: 55000,
          retryCount: 3,
          retryDelayMs: 2500
        }
      }
    })
  })
})
