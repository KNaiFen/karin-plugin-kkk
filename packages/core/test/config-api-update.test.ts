import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  allConfig: {
    app: {
      autoUpdate: true,
      autoRestartOnInstalledUpdate: false,
      longTaskCompletionNotify: true,
      longTaskCompletionNotifyThresholdMs: 300000,
      removeCache: true,
      summaryParse: {
        switch: false,
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
          cloud: {
            baseUrl: 'https://api.siliconflow.cn/v1',
            apiKey: '',
            model: 'FunAudioLLM/SenseVoiceSmall',
            timeoutMs: 45000,
            retryCount: 1,
            retryDelayMs: 1500
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
    guestCookie: {
      switch: true,
      refreshIntervalHours: 12,
      refreshJitterMinutes: 60,
      minRefreshAgeHours: 6,
      httpTimeoutSeconds: 20,
      browserTimeoutSeconds: 30,
      pageSettleSeconds: 3,
      blockMedia: true,
      blockFont: true,
      logging: {
        switch: true,
        retentionDays: 30,
        maxFileSizeMB: 10
      },
      douyin: {
        switch: true,
        pageUrl: 'https://www.douyin.com/jingxuan?enter=guide',
        testUrl: 'https://v.douyin.com/pGDQzKiWtBM/',
        requiredCookies: ['ttwid', 's_v_web_id']
      },
      xiaohongshu: {
        switch: true,
        pageUrl: 'https://www.xiaohongshu.com/explore',
        testUrl: 'http://xhslink.cn/o/1wPOQ9a9RyI',
        requiredCookies: ['a1', 'webId', 'web_session']
      },
      tiktok: {
        switch: true,
        pageUrl: 'https://www.tiktok.com/',
        testUrl: 'https://vt.tiktok.com/ZSxVY1Gos/',
        requiredCookies: ['ttwid', 'msToken']
      },
      heybox: {
        switch: true,
        pageUrl: 'https://www.xiaoheihe.cn/',
        testUrl: 'https://www.xiaoheihe.cn/app/bbs/link/4a9471857e40',
        requiredCookies: ['x_xhh_tokenid']
      },
      zhihu: {
        switch: true,
        pageUrl: 'https://www.zhihu.com/',
        testUrl: 'https://www.zhihu.com/question/19550283/answer/122329247',
        requiredCookies: ['_zap', 'd_c0']
      },
      weibo: {
        switch: true,
        pageUrl: 'https://m.weibo.cn/',
        testUrl: 'https://weibo.com/5955106173/R2YQog7Pb',
        requiredCookies: ['SUB', 'SUBP']
      }
    },
    pushlist: {
      douyin: [],
      bilibili: []
    },
    bilibili: {
      push: {
        riskCooldownEnabled: true,
        riskCooldownMs: 3600000
      }
    },
    weibo: {
      switch: true,
      sendContent: ['info', 'image', 'video'],
      renderCard: {
        enable: true,
        includeImages: false
      },
      plainTitleReply: {
        switch: true,
        types: ['video', 'image', 'text']
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
    }
  },
  modifyPro: vi.fn(),
  modify: vi.fn(),
  syncConfigToDatabase: vi.fn()
}))

vi.mock('@/module/utils/Config', () => ({
  Config: {
    All: () => state.allConfig,
    ModifyPro: (...args: unknown[]) => state.modifyPro(...args),
    Modify: (...args: unknown[]) => state.modify(...args),
    syncConfigToDatabase: () => state.syncConfigToDatabase()
  }
}))

const { getConfigModule, patchConfigItem, updateAllConfig, updateConfigModule } = await import('../src/module/server/api/config')

const createResponse = () => {
  const response = {
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
  }

  return response
}

describe('config api update', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.modifyPro.mockResolvedValue(true)
    state.syncConfigToDatabase.mockResolvedValue(undefined)
  })

  it('returns an error and skips subscription sync when pushlist persistence fails', async () => {
    state.modifyPro.mockResolvedValue(false)
    const res = createResponse()

    await updateConfigModule({
      params: { module: 'pushlist' },
      body: {
        douyin: [],
        bilibili: []
      }
    } as any, res as any)

    expect(res.statusCode).toBe(500)
    expect(res.payload).toMatchObject({
      success: false,
      message: '配置更新失败',
      data: null
    })
    expect(state.syncConfigToDatabase).not.toHaveBeenCalled()
  })

  it('returns an error when pushlist subscription sync fails after persistence', async () => {
    state.syncConfigToDatabase.mockRejectedValue(new Error('database unavailable'))
    const res = createResponse()

    await updateConfigModule({
      params: { module: 'pushlist' },
      body: {
        douyin: [],
        bilibili: []
      }
    } as any, res as any)

    expect(state.modifyPro).toHaveBeenCalledWith('pushlist', {
      douyin: [],
      bilibili: []
    })
    expect(state.syncConfigToDatabase).toHaveBeenCalledTimes(1)
    expect(res.statusCode).toBe(500)
    expect(res.payload).toEqual({
      success: false,
      message: '配置已保存，但订阅数据库同步失败',
      data: null
    })
  })

  it('persists and synchronizes a pushlist item patch through ModifyPro', async () => {
    const res = createResponse()

    await patchConfigItem({
      params: { module: 'pushlist' },
      body: {
        key: 'douyin',
        value: []
      }
    } as any, res as any)

    expect(state.modifyPro).toHaveBeenCalledWith('pushlist', {
      douyin: []
    })
    expect(state.modify).not.toHaveBeenCalled()
    expect(state.syncConfigToDatabase).toHaveBeenCalledTimes(1)
    expect(res.statusCode).toBe(200)
    expect(res.payload?.success).toBe(true)
  })

  it('keeps concurrent platform patches scoped to the submitted platform', async () => {
    const douyinRes = createResponse()
    const bilibiliRes = createResponse()

    await Promise.all([
      patchConfigItem({
        params: { module: 'pushlist' },
        body: { key: 'douyin', value: [] }
      } as any, douyinRes as any),
      patchConfigItem({
        params: { module: 'pushlist' },
        body: { key: 'bilibili', value: [] }
      } as any, bilibiliRes as any)
    ])

    expect(state.modifyPro.mock.calls).toEqual(expect.arrayContaining([
      ['pushlist', { douyin: [] }],
      ['pushlist', { bilibili: [] }]
    ]))
    expect(state.syncConfigToDatabase).toHaveBeenCalledTimes(2)
    expect(douyinRes.statusCode).toBe(200)
    expect(bilibiliRes.statusCode).toBe(200)
  })

  it('skips pushlist subscription sync when an item patch cannot be persisted', async () => {
    state.modifyPro.mockResolvedValue(false)
    const res = createResponse()

    await patchConfigItem({
      params: { module: 'pushlist' },
      body: {
        key: 'bilibili',
        value: []
      }
    } as any, res as any)

    expect(state.syncConfigToDatabase).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(500)
    expect(res.payload).toEqual({
      success: false,
      message: '配置更新失败',
      data: null
    })
  })

  it('reports a fixed error when an item patch subscription sync fails', async () => {
    state.syncConfigToDatabase.mockRejectedValue(new Error('database unavailable'))
    const res = createResponse()

    await patchConfigItem({
      params: { module: 'pushlist' },
      body: {
        key: 'douyin',
        value: []
      }
    } as any, res as any)

    expect(state.modifyPro).toHaveBeenCalledTimes(1)
    expect(state.syncConfigToDatabase).toHaveBeenCalledTimes(1)
    expect(res.statusCode).toBe(500)
    expect(res.payload).toEqual({
      success: false,
      message: '配置已保存，但订阅数据库同步失败',
      data: null
    })
  })

  it('marks a bulk pushlist update failed when subscription sync fails', async () => {
    state.syncConfigToDatabase.mockRejectedValue(new Error('database unavailable'))
    const res = createResponse()

    await updateAllConfig({
      body: {
        pushlist: {
          douyin: [],
          bilibili: []
        }
      }
    } as any, res as any)

    expect(state.syncConfigToDatabase).toHaveBeenCalledTimes(1)
    expect(res.statusCode).toBe(200)
    expect(res.payload).toMatchObject({
      success: false,
      message: '部分配置更新失败',
      data: {
        results: [{
          module: 'pushlist',
          success: false,
          error: '订阅数据库同步失败'
        }]
      }
    })
  })

  it('normalizes dotted payloads before persisting module config', async () => {
    const res = createResponse()

    await updateConfigModule({
      params: { module: 'weibo' },
      body: {
        'renderCard.enable': false,
        'renderCard.includeImages': true,
        'plainTitleReply.switch': false,
        'plainTitleReply.types': ['image']
      }
    } as any, res as any)

    expect(state.modifyPro).toHaveBeenCalledWith('weibo', {
      renderCard: {
        enable: false,
        includeImages: true
      },
      plainTitleReply: {
        switch: false,
        types: ['image']
      }
    })
    expect(res.statusCode).toBe(200)
    expect(res.payload?.success).toBe(true)
  })

  it('updates github config with dotted payloads and token field', async () => {
    const res = createResponse()

    await updateConfigModule({
      params: { module: 'github' },
      body: {
        'renderCard.enable': false,
        'renderCard.includeImages': true,
        'plainTitleReply.switch': false,
        'plainTitleReply.types': ['image'],
        token: 'ghp_test',
        'proxy.switch': true,
        'proxy.host': '127.0.0.1',
        'proxy.port': 7894,
        'proxy.protocol': 'https',
        'proxy.auth.username': 'proxy-user',
        'proxy.auth.password': 'proxy-pass'
      }
    } as any, res as any)

    expect(state.modifyPro).toHaveBeenCalledWith('github', {
      renderCard: {
        enable: false,
        includeImages: true
      },
      plainTitleReply: {
        switch: false,
        types: ['image']
      },
      token: 'ghp_test',
      proxy: {
        switch: true,
        host: '127.0.0.1',
        port: 7894,
        protocol: 'https',
        auth: {
          username: 'proxy-user',
          password: 'proxy-pass'
        }
      }
    })
  })

  it('persists autoRestartOnInstalledUpdate through the app module config api', async () => {
    const res = createResponse()

    await updateConfigModule({
      params: { module: 'app' },
      body: {
        autoUpdate: true,
        autoRestartOnInstalledUpdate: true
      }
    } as any, res as any)

    expect(state.modifyPro).toHaveBeenCalledWith('app', expect.objectContaining({
      autoUpdate: true,
      autoRestartOnInstalledUpdate: true
    }))
    expect(res.statusCode).toBe(200)
    expect(res.payload?.success).toBe(true)
  })

  it('persists long task completion notify settings through the app module config api', async () => {
    const res = createResponse()

    await updateConfigModule({
      params: { module: 'app' },
      body: {
        longTaskCompletionNotify: false,
        longTaskCompletionNotifyThresholdMs: 480000
      }
    } as any, res as any)

    expect(state.modifyPro).toHaveBeenCalledWith('app', expect.objectContaining({
      longTaskCompletionNotify: false,
      longTaskCompletionNotifyThresholdMs: 480000
    }))
    expect(res.statusCode).toBe(200)
    expect(res.payload?.success).toBe(true)
  })

  it('persists bilibili push risk cooldown settings through the bilibili module config api', async () => {
    const res = createResponse()

    await updateConfigModule({
      params: { module: 'bilibili' },
      body: {
        'push.riskCooldownEnabled': false,
        'push.riskCooldownMs': 1800000
      }
    } as any, res as any)

    expect(state.modifyPro).toHaveBeenCalledWith('bilibili', expect.objectContaining({
      push: expect.objectContaining({
        riskCooldownEnabled: false,
        riskCooldownMs: 1800000
      })
    }))
    expect(res.statusCode).toBe(200)
    expect(res.payload?.success).toBe(true)
  })

  it('reads summaryParse from app.summaryParse via config module alias', async () => {
    const res = createResponse()

    await getConfigModule({
      params: { module: 'summaryParse' }
    } as any, res as any)

    expect(res.statusCode).toBe(200)
    expect(res.payload?.success).toBe(true)
    expect(res.payload?.data).toEqual(state.allConfig.app.summaryParse)
  })

  it('reads detailedSummaryParse from app.detailedSummaryParse via config module alias', async () => {
    const res = createResponse()

    await getConfigModule({
      params: { module: 'detailedSummaryParse' }
    } as any, res as any)

    expect(res.statusCode).toBe(200)
    expect(res.payload?.success).toBe(true)
    expect(res.payload?.data).toEqual(state.allConfig.app.detailedSummaryParse)
  })

  it('reads transcriptOriginal from app.transcriptOriginal via config module alias', async () => {
    const res = createResponse()

    await getConfigModule({
      params: { module: 'transcriptOriginal' }
    } as any, res as any)

    expect(res.statusCode).toBe(200)
    expect(res.payload?.success).toBe(true)
    expect(res.payload?.data).toEqual(state.allConfig.app.transcriptOriginal)
  })

  it('normalizes nested summary parse payloads before persisting alias module config', async () => {
    const res = createResponse()

    await updateConfigModule({
      params: { module: 'summaryParse' },
      body: {
        switch: true,
        keywords: ['总结', '速览'],
        sendParsedContent: true,
        'llm.baseUrl': 'https://example.com/v1',
        'llm.apiKey': 'secret',
        'llm.model': 'qwen-plus',
        'llm.timeoutMs': 45000,
        'llm.retryCount': 2,
        'llm.retryDelayMs': 2000,
        'llm.webSearchEnabled': true,
        'llm.reasoningEnabled': true,
        'llm.reasoningEffort': 'medium',
        'asr.mode': 'local',
        'asr.whisperCppPath': '/usr/local/bin/whisper-cli',
        'asr.modelPath': '/models/ggml.bin',
        'asr.language': 'zh',
        'asr.threads': 8,
        'asr.ffmpegPath': '/usr/local/bin/ffmpeg',
        'asr.audioBitrateKbps': 32,
        'asr.maxSegmentMinutes': 25,
        'asr.cloud.baseUrl': 'https://api.siliconflow.cn/v1',
        'asr.cloud.apiKey': 'asr-secret',
        'asr.cloud.model': 'FunAudioLLM/SenseVoiceSmall',
        'asr.cloud.timeoutMs': 55000
      }
    } as any, res as any)

    expect(state.modifyPro).toHaveBeenCalledWith('app', expect.objectContaining({
      summaryParse: {
        switch: true,
        keywords: ['总结', '速览'],
        sendParsedContent: true,
        llm: {
          baseUrl: 'https://example.com/v1',
          apiKey: 'secret',
          model: 'qwen-plus',
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
          modelPath: '/models/ggml.bin',
          language: 'zh',
          threads: 8,
          ffmpegPath: '/usr/local/bin/ffmpeg',
          audioBitrateKbps: 32,
          maxSegmentMinutes: 25,
          cloud: expect.objectContaining({
            baseUrl: 'https://api.siliconflow.cn/v1',
            apiKey: 'asr-secret',
            model: 'FunAudioLLM/SenseVoiceSmall',
            timeoutMs: 55000
          })
        }
      }
    }))
    expect(res.statusCode).toBe(200)
    expect(res.payload?.success).toBe(true)
  })

  it('patches summaryParse nested items via the app config file', async () => {
    const res = createResponse()

    await patchConfigItem({
      params: { module: 'summaryParse' },
      body: {
        key: 'llm.timeoutMs',
        value: 45000
      }
    } as any, res as any)

    expect(state.modify).toHaveBeenCalledWith('app', 'summaryParse.llm.timeoutMs', 45000)
    expect(res.statusCode).toBe(200)
    expect(res.payload?.success).toBe(true)
  })

  it('patches autoRestartOnInstalledUpdate via the app config file', async () => {
    const res = createResponse()

    await patchConfigItem({
      params: { module: 'app' },
      body: {
        key: 'autoRestartOnInstalledUpdate',
        value: true
      }
    } as any, res as any)

    expect(state.modify).toHaveBeenCalledWith('app', 'autoRestartOnInstalledUpdate', true)
    expect(res.statusCode).toBe(200)
    expect(res.payload?.success).toBe(true)
  })

  it('patches longTaskCompletionNotify via the app config file', async () => {
    const res = createResponse()

    await patchConfigItem({
      params: { module: 'app' },
      body: {
        key: 'longTaskCompletionNotify',
        value: false
      }
    } as any, res as any)

    expect(state.modify).toHaveBeenCalledWith('app', 'longTaskCompletionNotify', false)
    expect(res.statusCode).toBe(200)
    expect(res.payload?.success).toBe(true)
  })

  it('patches longTaskCompletionNotifyThresholdMs via the app config file', async () => {
    const res = createResponse()

    await patchConfigItem({
      params: { module: 'app' },
      body: {
        key: 'longTaskCompletionNotifyThresholdMs',
        value: 420000
      }
    } as any, res as any)

    expect(state.modify).toHaveBeenCalledWith('app', 'longTaskCompletionNotifyThresholdMs', 420000)
    expect(res.statusCode).toBe(200)
    expect(res.payload?.success).toBe(true)
  })

  it('normalizes nested detailed summary parse payloads before persisting alias module config', async () => {
    const res = createResponse()

    await updateConfigModule({
      params: { module: 'detailedSummaryParse' },
      body: {
        switch: true,
        keywords: ['详细总结', '研报'],
        sendParsedContent: true,
        'markdownRender.enabled': true,
        'markdownRender.sendTextVersion': true,
        'markdownRender.fontSizePx': 18,
        'markdownRender.multiPageEnabled': true,
        'markdownRender.multiPageTriggerAspectRatio': 3.5,
        'markdownRender.multiPageMaxAspectRatio': 2.05,
        'llm.baseUrl': 'https://api.openai.com/v1',
        'llm.apiKey': 'openai-secret',
        'llm.model': 'gpt-5',
        'llm.timeoutMs': 90000,
        'llm.retryCount': 2,
        'llm.retryDelayMs': 2500,
        'llm.webSearchEnabled': true,
        'llm.reasoningEnabled': true,
        'llm.reasoningEffort': 'xhigh',
        'asr.mode': 'local',
        'asr.whisperCppPath': '/usr/local/bin/whisper-cli',
        'asr.modelPath': '/models/ggml.bin',
        'asr.language': 'zh',
        'asr.threads': 8,
        'asr.ffmpegPath': '/usr/local/bin/ffmpeg',
        'asr.audioBitrateKbps': 32,
        'asr.maxSegmentMinutes': 25,
        'asr.cloud.baseUrl': 'https://api.openai.com/v1',
        'asr.cloud.apiKey': 'asr-secret',
        'asr.cloud.model': 'gpt-4o-mini-transcribe',
        'asr.cloud.timeoutMs': 55000
      }
    } as any, res as any)

    expect(state.modifyPro).toHaveBeenCalledWith('app', expect.objectContaining({
      detailedSummaryParse: {
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
          apiKey: 'openai-secret',
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
          modelPath: '/models/ggml.bin',
          language: 'zh',
          threads: 8,
          ffmpegPath: '/usr/local/bin/ffmpeg',
          audioBitrateKbps: 32,
          maxSegmentMinutes: 25,
          cloud: expect.objectContaining({
            baseUrl: 'https://api.openai.com/v1',
            apiKey: 'asr-secret',
            model: 'gpt-4o-mini-transcribe',
            timeoutMs: 55000
          })
        }
      }
    }))
    expect(res.statusCode).toBe(200)
    expect(res.payload?.success).toBe(true)
  })

  it('normalizes nested transcript original payloads before persisting alias module config', async () => {
    const res = createResponse()

    await updateConfigModule({
      params: { module: 'transcriptOriginal' },
      body: {
        switch: true,
        keywords: ['转写原文', '原文'],
        sendParsedContent: true,
        'markdownRender.enabled': true,
        'markdownRender.sendTextVersion': true,
        'markdownRender.fontSizePx': 18,
        'markdownRender.multiPageEnabled': true,
        'markdownRender.multiPageTriggerAspectRatio': 3.5,
        'markdownRender.multiPageMaxAspectRatio': 2.05,
        'llm.baseUrl': 'https://api.openai.com/v1',
        'llm.apiKey': 'openai-secret',
        'llm.model': 'gpt-5',
        'llm.timeoutMs': 90000,
        'llm.retryCount': 2,
        'llm.retryDelayMs': 2500,
        'llm.reasoningEnabled': true,
        'llm.reasoningEffort': 'xhigh',
        'asr.mode': 'local',
        'asr.whisperCppPath': '/usr/local/bin/whisper-cli',
        'asr.modelPath': '/models/ggml.bin',
        'asr.language': 'zh',
        'asr.threads': 8,
        'asr.ffmpegPath': '/usr/local/bin/ffmpeg',
        'asr.audioBitrateKbps': 32,
        'asr.maxSegmentMinutes': 25,
        'asr.cloud.baseUrl': 'https://api.openai.com/v1',
        'asr.cloud.apiKey': 'asr-secret',
        'asr.cloud.model': 'gpt-4o-mini-transcribe',
        'asr.cloud.timeoutMs': 55000
      }
    } as any, res as any)

    expect(state.modifyPro).toHaveBeenCalledWith('app', expect.objectContaining({
      transcriptOriginal: expect.objectContaining({
        switch: true,
        keywords: ['转写原文', '原文'],
        sendParsedContent: true,
        markdownRender: expect.objectContaining({
          enabled: true,
          sendTextVersion: true,
          fontSizePx: 18,
          multiPageEnabled: true,
          multiPageTriggerAspectRatio: 3.5,
          multiPageMaxAspectRatio: 2.05
        }),
        llm: expect.objectContaining({
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'openai-secret',
          model: 'gpt-5',
          timeoutMs: 90000,
          retryCount: 2,
          retryDelayMs: 2500,
          reasoningEnabled: true,
          reasoningEffort: 'xhigh'
        })
      })
    }))
    expect(res.statusCode).toBe(200)
    expect(res.payload?.success).toBe(true)
  })

  it('patches detailedSummaryParse nested items via the app config file', async () => {
    const res = createResponse()

    await patchConfigItem({
      params: { module: 'detailedSummaryParse' },
      body: {
        key: 'llm.reasoningEffort',
        value: 'medium'
      }
    } as any, res as any)

    expect(state.modify).toHaveBeenCalledWith('app', 'detailedSummaryParse.llm.reasoningEffort', 'medium')
    expect(res.statusCode).toBe(200)
    expect(res.payload?.success).toBe(true)
  })

  it('patches transcriptOriginal nested items via the app config file', async () => {
    const res = createResponse()

    await patchConfigItem({
      params: { module: 'transcriptOriginal' },
      body: {
        key: 'llm.reasoningEffort',
        value: 'medium'
      }
    } as any, res as any)

    expect(state.modify).toHaveBeenCalledWith('app', 'transcriptOriginal.llm.reasoningEffort', 'medium')
    expect(res.statusCode).toBe(200)
    expect(res.payload?.success).toBe(true)
  })

  it('maps summaryParse in bulk updates back into app.summaryParse', async () => {
    const res = createResponse()

    await updateAllConfig({
      body: {
        summaryParse: {
          'llm.timeoutMs': 52000,
          'llm.retryCount': 3,
          'llm.reasoningEnabled': true,
          'llm.reasoningEffort': 'xhigh',
          'llm.webSearchEnabled': true
        },
        weibo: {
          'renderCard.enable': false
        }
      }
    } as any, res as any)

    expect(state.modifyPro).toHaveBeenCalledWith('app', expect.objectContaining({
      summaryParse: expect.objectContaining({
        llm: expect.objectContaining({
          timeoutMs: 52000,
          retryCount: 3,
          reasoningEnabled: true,
          reasoningEffort: 'xhigh',
          webSearchEnabled: true
        })
      })
    }))
    expect(state.modifyPro).toHaveBeenCalledWith('weibo', {
      renderCard: {
        enable: false
      }
    })
    expect(res.statusCode).toBe(200)
    expect(res.payload?.success).toBe(true)
  })

  it('keeps autoRestartOnInstalledUpdate in app during bulk updates', async () => {
    const res = createResponse()

    await updateAllConfig({
      body: {
        app: {
          autoRestartOnInstalledUpdate: true
        }
      }
    } as any, res as any)

    expect(state.modifyPro).toHaveBeenCalledWith('app', expect.objectContaining({
      autoRestartOnInstalledUpdate: true
    }))
    expect(res.statusCode).toBe(200)
    expect(res.payload?.success).toBe(true)
  })

  it('keeps long task completion notify settings in app during bulk updates', async () => {
    const res = createResponse()

    await updateAllConfig({
      body: {
        app: {
          longTaskCompletionNotify: false,
          longTaskCompletionNotifyThresholdMs: 420000
        }
      }
    } as any, res as any)

    expect(state.modifyPro).toHaveBeenCalledWith('app', expect.objectContaining({
      longTaskCompletionNotify: false,
      longTaskCompletionNotifyThresholdMs: 420000
    }))
    expect(res.statusCode).toBe(200)
    expect(res.payload?.success).toBe(true)
  })

  it('rejects unknown summaryParse dotted keys before persisting', async () => {
    const res = createResponse()

    await updateConfigModule({
      params: { module: 'summaryParse' },
      body: {
        'llm.timeoutMs': 52000,
        'llm.unknownField': 'bad'
      }
    } as any, res as any)

    expect(state.modifyPro).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
    expect(res.payload?.message).toContain('非法配置项')
    expect(res.payload?.message).toContain('llm.unknownField')
  })

  it('rejects removed summary prompt keys before persisting', async () => {
    const res = createResponse()

    await updateConfigModule({
      params: { module: 'summaryParse' },
      body: {
        'prompt.system': '不应再允许'
      }
    } as any, res as any)

    expect(state.modifyPro).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
    expect(res.payload?.message).toContain('非法配置项')
    expect(res.payload?.message).toContain('prompt.system')
  })

  it('rejects dangerous dotted keys before persisting module config', async () => {
    const res = createResponse()

    await updateConfigModule({
      params: { module: 'weibo' },
      body: {
        'renderCard.__proto__.polluted': true
      }
    } as any, res as any)

    expect(state.modifyPro).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
    expect(res.payload?.message).toContain('非法配置项')
  })

  it('accepts summaryParse patch keys with or without alias prefix', async () => {
    const res = createResponse()

    await patchConfigItem({
      params: { module: 'summaryParse' },
      body: {
        key: 'summaryParse.llm.retryCount',
        value: 2
      }
    } as any, res as any)

    expect(state.modify).toHaveBeenCalledWith('app', 'summaryParse.llm.retryCount', 2)
    expect(res.statusCode).toBe(200)
  })

  it('maps detailedSummaryParse in bulk updates back into app.detailedSummaryParse', async () => {
    const res = createResponse()

    await updateAllConfig({
      body: {
        detailedSummaryParse: {
          'markdownRender.enabled': true,
          'markdownRender.sendTextVersion': true,
          'markdownRender.fontSizePx': 20,
          'markdownRender.multiPageEnabled': false,
          'markdownRender.multiPageTriggerAspectRatio': 3.4,
          'markdownRender.multiPageMaxAspectRatio': 2.1,
          'llm.reasoningEnabled': true,
          'llm.reasoningEffort': 'xhigh',
          'llm.webSearchEnabled': true
        },
        weibo: {
          'renderCard.enable': false
        }
      }
    } as any, res as any)

    expect(state.modifyPro).toHaveBeenCalledWith('app', expect.objectContaining({
      detailedSummaryParse: expect.objectContaining({
        markdownRender: expect.objectContaining({
          enabled: true,
          sendTextVersion: true,
          fontSizePx: 20,
          multiPageEnabled: false,
          multiPageTriggerAspectRatio: 3.4,
          multiPageMaxAspectRatio: 2.1
        }),
        llm: expect.objectContaining({
          reasoningEnabled: true,
          reasoningEffort: 'xhigh',
          webSearchEnabled: true
        })
      })
    }))
    expect(state.modifyPro).toHaveBeenCalledWith('weibo', {
      renderCard: {
        enable: false
      }
    })
    expect(res.statusCode).toBe(200)
    expect(res.payload?.success).toBe(true)
  })

  it('maps transcriptOriginal in bulk updates back into app.transcriptOriginal', async () => {
    const res = createResponse()

    await updateAllConfig({
      body: {
        transcriptOriginal: {
          'markdownRender.enabled': true,
          'markdownRender.sendTextVersion': true,
          'markdownRender.fontSizePx': 20,
          'markdownRender.multiPageEnabled': false,
          'markdownRender.multiPageTriggerAspectRatio': 3.4,
          'markdownRender.multiPageMaxAspectRatio': 2.1,
          'llm.reasoningEnabled': true,
          'llm.reasoningEffort': 'xhigh'
        },
        weibo: {
          'renderCard.enable': false
        }
      }
    } as any, res as any)

    expect(state.modifyPro).toHaveBeenCalledWith('app', expect.objectContaining({
      transcriptOriginal: expect.objectContaining({
        markdownRender: expect.objectContaining({
          enabled: true,
          sendTextVersion: true,
          fontSizePx: 20,
          multiPageEnabled: false,
          multiPageTriggerAspectRatio: 3.4,
          multiPageMaxAspectRatio: 2.1
        }),
        llm: expect.objectContaining({
          reasoningEnabled: true,
          reasoningEffort: 'xhigh'
        })
      })
    }))
    expect(res.statusCode).toBe(200)
    expect(res.payload?.success).toBe(true)
  })

  it('rejects unknown transcriptOriginal dotted keys before persisting', async () => {
    const res = createResponse()

    await updateConfigModule({
      params: { module: 'transcriptOriginal' },
      body: {
        'llm.reasoningEnabled': true,
        'llm.unknownField': 'bad'
      }
    } as any, res as any)

    expect(state.modifyPro).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
    expect(res.payload?.message).toContain('非法配置项')
    expect(res.payload?.message).toContain('llm.unknownField')
  })

  it('rejects unknown detailedSummaryParse dotted keys before persisting', async () => {
    const res = createResponse()

    await updateConfigModule({
      params: { module: 'detailedSummaryParse' },
      body: {
        'llm.reasoningEnabled': true,
        'llm.unknownField': 'bad'
      }
    } as any, res as any)

    expect(state.modifyPro).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
    expect(res.payload?.message).toContain('非法配置项')
    expect(res.payload?.message).toContain('llm.unknownField')
  })

  it('rejects unknown patch keys before touching config files', async () => {
    const res = createResponse()

    await patchConfigItem({
      params: { module: 'summaryParse' },
      body: {
        key: 'llm.notAllowed',
        value: 'bad'
      }
    } as any, res as any)

    expect(state.modify).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
    expect(res.payload?.message).toContain('非法配置项')
  })

  it('rejects wrong value types and out-of-range values before persisting', async () => {
    const wrongTypeRes = createResponse()
    await updateConfigModule({
      params: { module: 'app' },
      body: {
        removeCache: 'false'
      }
    } as any, wrongTypeRes as any)

    expect(wrongTypeRes.statusCode).toBe(400)
    expect(wrongTypeRes.payload?.message).toContain('removeCache')
    expect(state.modifyPro).not.toHaveBeenCalled()

    const outOfRangeRes = createResponse()
    await updateConfigModule({
      params: { module: 'summaryParse' },
      body: {
        'llm.timeoutMs': 999
      }
    } as any, outOfRangeRes as any)

    expect(outOfRangeRes.statusCode).toBe(400)
    expect(outOfRangeRes.payload?.message).toContain('llm.timeoutMs')
    expect(state.modifyPro).not.toHaveBeenCalled()
  })

  it('validates alias patch values against runtime schema constraints', async () => {
    const res = createResponse()

    await patchConfigItem({
      params: { module: 'summaryParse' },
      body: {
        key: 'llm.retryCount',
        value: 11
      }
    } as any, res as any)

    expect(res.statusCode).toBe(400)
    expect(res.payload?.message).toContain('llm.retryCount')
    expect(state.modify).not.toHaveBeenCalled()
  })

  it('accepts a GET app payload in a following PUT without dropping summary aliases', async () => {
    const res = createResponse()

    await updateConfigModule({
      params: { module: 'app' },
      body: state.allConfig.app
    } as any, res as any)

    expect(res.statusCode).toBe(200)
    expect(state.modifyPro).toHaveBeenCalledWith('app', expect.objectContaining({
      summaryParse: state.allConfig.app.summaryParse,
      detailedSummaryParse: state.allConfig.app.detailedSummaryParse,
      transcriptOriginal: state.allConfig.app.transcriptOriginal
    }))
  })

  it('accepts douyin runtime paths returned by GET during PUT round trips', async () => {
    const douyin = {
      switch: true,
      tip: true,
      sendContent: ['info', 'comment', 'video'],
      plainTitleReply: { switch: true, types: ['video', 'image', 'article', 'live'] },
      numcomment: 5,
      subCommentLimit: 5,
      subCommentDepth: 3,
      realCommentCount: false,
      commentImageCollection: true,
      textMode: false,
      liveImageMergeMode: 'continuous',
      liveRecordSeconds: 10,
      liveQuality: 'auto',
      videoQuality: '4k',
      maxAutoVideoSize: 50,
      loginPerm: 'master',
      videoInfoMode: 'image',
      longTitleFullText: false,
      longTitleFullTextThreshold: 40,
      displayContent: ['cover', 'title', 'author', 'stats'],
      burnDanmaku: false,
      danmakuArea: 0.5,
      danmakuFontSize: 'medium',
      danmakuOpacity: 70,
      verticalMode: 'off',
      videoCodec: 'h265',
      push: {
        switch: true,
        permission: 'master',
        cron: '*/10 * * * *',
        jitterSeconds: 0,
        parsedynamic: false,
        shareType: 'web',
        pushVideoQuality: '4k',
        pushMaxAutoVideoSize: 50
      }
    }
    state.allConfig.douyin = douyin as any
    const res = createResponse()

    await updateConfigModule({
      params: { module: 'douyin' },
      body: douyin
    } as any, res as any)

    expect(res.statusCode).toBe(200)
    expect(state.modifyPro).toHaveBeenCalledWith('douyin', douyin)
  })

  it('strips _method only at the HTTP body top level', async () => {
    const topLevelRes = createResponse()
    await updateConfigModule({
      params: { module: 'app' },
      body: {
        _method: 'PUT',
        removeCache: false
      }
    } as any, topLevelRes as any)

    expect(topLevelRes.statusCode).toBe(200)
    expect(state.modifyPro).toHaveBeenCalledWith('app', { removeCache: false })

    vi.clearAllMocks()
    state.modifyPro.mockResolvedValue(true)
    const nestedRes = createResponse()
    await updateConfigModule({
      params: { module: 'app' },
      body: {
        summaryParse: {
          _method: 'PUT'
        }
      }
    } as any, nestedRes as any)

    expect(nestedRes.statusCode).toBe(400)
    expect(nestedRes.payload?.message).toContain('非法配置项')
    expect(state.modifyPro).not.toHaveBeenCalled()
  })

  it('rejects bulk updates atomically when any module contains invalid keys', async () => {
    const res = createResponse()

    await updateAllConfig({
      body: {
        summaryParse: {
          'llm.timeoutMs': 52000
        },
        weibo: {
          'renderCard.unknown': true
        }
      }
    } as any, res as any)

    expect(state.modifyPro).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
    expect(res.payload?.message).toContain('weibo')
    expect(res.payload?.message).toContain('renderCard.unknown')
  })

  it('accepts guestCookie nested updates derived from default config shape', async () => {
    const res = createResponse()

    await updateConfigModule({
      params: { module: 'guestCookie' },
      body: {
        'logging.retentionDays': 14,
        'douyin.requiredCookies': ['ttwid']
      }
    } as any, res as any)

    expect(state.modifyPro).toHaveBeenCalledWith('guestCookie', {
      logging: {
        retentionDays: 14
      },
      douyin: {
        requiredCookies: ['ttwid']
      }
    })
    expect(res.statusCode).toBe(200)
  })

  it('accepts pushlist whole-array updates and rejects unknown item keys', async () => {
    const successRes = createResponse()

    await updateConfigModule({
      params: { module: 'pushlist' },
      body: {
        douyin: [{
          switch: true,
          sec_uid: 'sec-1',
          short_id: '',
          group_id: ['123:456'],
          remark: '作者',
          pushTypes: ['post'],
          filterMode: 'blacklist',
          Keywords: ['关键词'],
          Tags: ['标签']
        }],
        bilibili: []
      }
    } as any, successRes as any)

    expect(state.modifyPro).toHaveBeenCalledWith('pushlist', {
      douyin: [{
        switch: true,
        sec_uid: 'sec-1',
        short_id: '',
        group_id: ['123:456'],
        remark: '作者',
        pushTypes: ['post'],
        filterMode: 'blacklist',
        Keywords: ['关键词'],
        Tags: ['标签']
      }],
      bilibili: []
    })
    expect(successRes.statusCode).toBe(200)

    vi.clearAllMocks()
    state.modifyPro.mockResolvedValue(true)
    state.syncConfigToDatabase.mockResolvedValue(undefined)

    const failRes = createResponse()
    await updateConfigModule({
      params: { module: 'pushlist' },
      body: {
        douyin: [{
          switch: true,
          sec_uid: 'sec-1',
          short_id: '',
          group_id: ['123:456'],
          remark: '作者',
          extra: 'bad'
        }]
      }
    } as any, failRes as any)

    expect(state.modifyPro).not.toHaveBeenCalled()
    expect(failRes.statusCode).toBe(400)
    expect(failRes.payload?.message).toContain('非法配置项')
  })
})
