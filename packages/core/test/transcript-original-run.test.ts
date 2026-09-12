import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  config: {
    app: {
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
    }
  },
  resolveParsedPostWithCache: vi.fn(),
  enrichSummaryInputWithAsr: vi.fn(),
  summarizeTranscriptOriginalWithResponses: vi.fn(),
  renderMarkdownToHtml: vi.fn(),
  renderHtmlToImage: vi.fn(),
  makeForward: vi.fn((elements: unknown[]) => elements),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    mark: vi.fn(),
    warn: vi.fn()
  }
}))

vi.mock('node-karin', () => ({
  logger: state.logger,
  common: {
    makeForward: (...args: unknown[]) => state.makeForward(...args)
  },
  render: {
    render: (...args: unknown[]) => state.renderHtmlToImage(...args)
  },
  segment: {
    text: (text: string) => ({ type: 'text', text }),
    image: (file: string) => ({ type: 'image', file }),
    markdown: vi.fn((markdown: string) => ({ type: 'markdown', markdown }))
  }
}))

vi.mock('node-karin/root', () => ({
  karinPathHtml: '/tmp/karin-html',
  karinPathTemp: '/tmp/karin-temp'
}))

vi.mock('@karinjs/md-html', () => ({
  markdown: (...args: unknown[]) => state.renderMarkdownToHtml(...args)
}))

vi.mock('@/module/utils/Config', () => ({
  Config: state.config
}))

vi.mock('../src/module/summaryParse/parsedPostCache', () => ({
  resolveParsedPostWithCache: (...args: unknown[]) => state.resolveParsedPostWithCache(...args)
}))

vi.mock('../src/module/summaryParse/asr', () => ({
  enrichSummaryInputWithAsr: (...args: unknown[]) => state.enrichSummaryInputWithAsr(...args)
}))

vi.mock('../src/module/transcriptOriginal/responses', () => ({
  summarizeTranscriptOriginalWithResponses: (...args: unknown[]) => state.summarizeTranscriptOriginalWithResponses(...args)
}))

const { runTranscriptOriginal } = await import('../src/module/transcriptOriginal')

describe('transcript original run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.config.app.transcriptOriginal.markdownRender.enabled = false
    state.config.app.transcriptOriginal.markdownRender.sendTextVersion = false
    state.resolveParsedPostWithCache.mockResolvedValue({
      parsedPost: {
        platform: 'weibo',
        platformLabel: '微博',
        subtype: 'status',
        title: '标题',
        author: { name: '作者' },
        summary: '摘要',
        url: 'https://weibo.com/1',
        contentBlocks: [{ type: 'text', text: '正文内容' }],
        images: [],
        videos: [],
        stats: [],
        meta: [],
        raw: {}
      },
      cacheHit: false
    })
    state.enrichSummaryInputWithAsr.mockImplementation(async (_config, input) => {
      input.asrTexts = [{ title: '视频 1', text: '原始字幕' }]
      return input
    })
    state.summarizeTranscriptOriginalWithResponses.mockResolvedValue({
      text: '整理后的转写文本'
    })
    state.renderMarkdownToHtml.mockReturnValue('<html><body><h1>markdown</h1></body></html>')
    state.renderHtmlToImage.mockResolvedValue('base64-rendered-image')
    state.makeForward.mockImplementation((elements: unknown[]) => elements)
  })

  it('sends transcript original text as a forward collection when markdown render is disabled', async () => {
    const reply = vi.fn()
    const sendForwardMsg = vi.fn().mockResolvedValue({ message_id: 'forward-1' })
    await runTranscriptOriginal({
      reply,
      bot: {
        account: { selfId: 'bot', name: 'bot' },
        sendForwardMsg
      },
      contact: { scene: 'group', peer: '1000' }
    } as any, {
      trigger: {
        keyword: '转写原文',
        rest: 'https://weibo.com/1'
      },
      shareContext: '',
      links: [{ platform: 'weibo', url: 'https://weibo.com/1' }]
    })

    expect(state.summarizeTranscriptOriginalWithResponses).toHaveBeenCalledTimes(1)
    expect(state.resolveParsedPostWithCache).toHaveBeenCalledTimes(1)
    expect(state.enrichSummaryInputWithAsr).toHaveBeenCalledTimes(1)
    expect(sendForwardMsg).toHaveBeenCalledTimes(1)
    expect(reply).not.toHaveBeenCalled()
    expect(state.makeForward).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ type: 'text', text: expect.stringContaining('【微博】x【gpt-5】x【转写原文】') }),
        expect.objectContaining({ type: 'text', text: expect.stringContaining('整理后的转写文本') })
      ]),
      'bot',
      'bot'
    )
    expect(state.logger.mark).toHaveBeenCalledWith(expect.stringContaining('ASR 数据已就绪'))
    expect(state.logger.mark).toHaveBeenCalledWith(expect.stringContaining('LLM 原文整理中'))
    expect(state.logger.mark).toHaveBeenCalledWith(expect.stringContaining('LLM 原文整理完成'))
  })

  it('sends markdown rendered images when markdown render is enabled', async () => {
    state.config.app.transcriptOriginal.markdownRender.enabled = true
    const reply = vi.fn()
    const sendForwardMsg = vi.fn().mockResolvedValue({ message_id: 'forward-1' })

    await runTranscriptOriginal({
      reply,
      bot: {
        account: { selfId: 'bot', name: 'bot' },
        sendForwardMsg
      },
      contact: { scene: 'group', peer: '1000' }
    } as any, {
      trigger: {
        keyword: '转写原文',
        rest: 'https://weibo.com/1'
      },
      shareContext: '',
      links: [{ platform: 'weibo', url: 'https://weibo.com/1' }]
    })

    expect(sendForwardMsg).toHaveBeenCalledTimes(1)
    expect(state.renderMarkdownToHtml).toHaveBeenCalled()
    expect(state.renderHtmlToImage).toHaveBeenCalled()
    const forwardedElements = state.makeForward.mock.calls.at(-1)?.[0] as Array<{ type: string, text?: string, file?: string }>
    expect(forwardedElements).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'image', file: expect.stringMatching(/^base64:\/\//) })
    ]))
    expect(forwardedElements.some(item => item.type === 'text')).toBe(false)
  })

  it('appends a cleaned text version when markdown text delivery is enabled', async () => {
    state.config.app.transcriptOriginal.markdownRender.enabled = true
    state.config.app.transcriptOriginal.markdownRender.sendTextVersion = true
    const reply = vi.fn()
    const sendForwardMsg = vi.fn().mockResolvedValue({ message_id: 'forward-1' })

    await runTranscriptOriginal({
      reply,
      bot: {
        account: { selfId: 'bot', name: 'bot' },
        sendForwardMsg
      },
      contact: { scene: 'group', peer: '1000' }
    } as any, {
      trigger: {
        keyword: '转写原文',
        rest: 'https://weibo.com/1'
      },
      shareContext: '',
      links: [{ platform: 'weibo', url: 'https://weibo.com/1' }]
    })

    const forwardedElements = state.makeForward.mock.calls.at(-1)?.[0] as Array<{ type: string, text?: string, file?: string }>
    expect(forwardedElements).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'image', file: expect.stringMatching(/^base64:\/\//) }),
      expect.objectContaining({ type: 'text', text: expect.stringContaining('【微博】x【gpt-5】x【转写原文】') })
    ]))
  })
})
