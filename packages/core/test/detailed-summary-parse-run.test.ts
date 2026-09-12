import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  config: {
    app: {
      detailedSummaryParse: {
        switch: true,
        keywords: ['详细总结'],
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
          webSearchEnabled: true,
          reasoningEnabled: true,
          reasoningEffort: 'high'
        },
        asr: {
          mode: 'cloud',
          whisperCppPath: '',
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
    }
  },
  resolveParsedPostWithCache: vi.fn(),
  summarizeWithOpenAIResponses: vi.fn(),
  enrichSummaryInputWithAsr: vi.fn(),
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
    markdown: vi.fn((markdown: string) => ({ type: 'markdown', markdown })),
    image: vi.fn((file: string) => ({ type: 'image', file }))
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

vi.mock('../src/module/detailedSummaryParse/responses', () => ({
  summarizeWithOpenAIResponses: (...args: unknown[]) => state.summarizeWithOpenAIResponses(...args)
}))

const { runDetailedSummaryParse } = await import('../src/module/detailedSummaryParse')

describe('detailed summary parse run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.config.app.detailedSummaryParse.markdownRender.enabled = false
    state.config.app.detailedSummaryParse.markdownRender.sendTextVersion = false
    state.config.app.detailedSummaryParse.markdownRender.fontSizePx = 16
    state.config.app.detailedSummaryParse.markdownRender.multiPageEnabled = true
    state.config.app.detailedSummaryParse.markdownRender.multiPageTriggerAspectRatio = 3
    state.config.app.detailedSummaryParse.markdownRender.multiPageMaxAspectRatio = 2.2
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
    state.enrichSummaryInputWithAsr.mockImplementation(async (_config, input) => input)
    state.summarizeWithOpenAIResponses.mockResolvedValue({
      text: '一、核心结论\n这是研报正文。',
      sources: [
        {
          title: 'OpenAI Docs',
          url: 'https://developers.openai.com/api/docs/guides/tools-web-search',
          domain: 'developers.openai.com'
        }
      ]
    })
    state.renderMarkdownToHtml.mockReturnValue('<html><body><h1>markdown</h1></body></html>')
    state.renderHtmlToImage.mockResolvedValue('base64-rendered-image')
    state.makeForward.mockImplementation((elements: unknown[]) => elements)
  })

  it('sends the research reply as a forward collection with text chunks when markdown render is disabled', async () => {
    const reply = vi.fn()
    const sendForwardMsg = vi.fn().mockResolvedValue({ message_id: 'forward-1' })
    await runDetailedSummaryParse({
      reply,
      bot: {
        account: { selfId: 'bot', name: 'bot' },
        sendForwardMsg
      },
      contact: { scene: 'group', peer: '1000' }
    } as any, {
      trigger: {
        keyword: '详细总结',
        rest: 'https://weibo.com/1'
      },
      shareContext: '',
      links: [{ platform: 'weibo', url: 'https://weibo.com/1' }]
    })

    expect(state.summarizeWithOpenAIResponses).toHaveBeenCalledWith(
      state.config.app.detailedSummaryParse,
      expect.any(Array)
    )
    expect(state.resolveParsedPostWithCache).toHaveBeenCalledTimes(1)
    expect(state.enrichSummaryInputWithAsr).toHaveBeenCalledTimes(1)
    expect(sendForwardMsg).toHaveBeenCalledTimes(1)
    expect(reply).not.toHaveBeenCalled()
    expect(state.makeForward).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ type: 'text', text: expect.stringContaining('【微博】x【gpt-5】x【详细研报】') }),
        expect.objectContaining({ type: 'text', text: expect.stringContaining('【参考来源】') })
      ]),
      'bot',
      'bot'
    )
  })

  it('renders markdown report to image when markdown render is enabled', async () => {
    state.config.app.detailedSummaryParse.markdownRender.enabled = true
    state.summarizeWithOpenAIResponses.mockResolvedValueOnce({
      text: '## 一、核心结论\n**这是** [研报](https://example.com/report)\n\n## 二、内容梳理\n- 条目一',
      sources: [
        {
          title: 'OpenAI Docs',
          url: 'https://developers.openai.com/api/docs/guides/tools-web-search',
          domain: 'developers.openai.com'
        }
      ]
    })
    const reply = vi.fn()
    const sendForwardMsg = vi.fn().mockResolvedValue({ message_id: 'forward-1' })

    await runDetailedSummaryParse({
      reply,
      bot: {
        account: { selfId: 'bot', name: 'bot' },
        sendForwardMsg
      },
      contact: { scene: 'group', peer: '1000' }
    } as any, {
      trigger: {
        keyword: '详细总结',
        rest: 'https://weibo.com/1'
      },
      shareContext: '',
      links: [{ platform: 'weibo', url: 'https://weibo.com/1' }]
    })

    expect(sendForwardMsg).toHaveBeenCalledTimes(1)
    expect(reply).not.toHaveBeenCalled()
    expect(state.makeForward).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'image',
          file: expect.stringMatching(/^base64:\/\//)
        })
      ]),
      'bot',
      'bot'
    )
    expect(state.renderMarkdownToHtml).toHaveBeenCalledWith(expect.stringContaining('# 【微博】x【gpt-5】x【详细研报】'), expect.any(Object))
    expect(state.renderMarkdownToHtml).toHaveBeenCalledWith(expect.stringContaining('## 一、核心结论'), expect.anything())
  })

  it('appends a cleaned text version into the same collection when markdown text delivery is enabled', async () => {
    state.config.app.detailedSummaryParse.markdownRender.enabled = true
    state.config.app.detailedSummaryParse.markdownRender.sendTextVersion = true
    state.summarizeWithOpenAIResponses.mockResolvedValueOnce({
      text: '## 一、核心结论\n**这是** [研报](https://example.com/report)\n\n## 二、内容梳理\n- 条目一\n\n```text\n代码块内容\n```',
      sources: []
    })
    const reply = vi.fn()
    const sendForwardMsg = vi.fn().mockResolvedValue({ message_id: 'forward-1' })

    await runDetailedSummaryParse({
      reply,
      bot: {
        account: { selfId: 'bot', name: 'bot' },
        sendForwardMsg
      },
      contact: { scene: 'group', peer: '1000' }
    } as any, {
      trigger: {
        keyword: '详细总结',
        rest: 'https://weibo.com/1'
      },
      shareContext: '',
      links: [{ platform: 'weibo', url: 'https://weibo.com/1' }]
    })

    expect(sendForwardMsg).toHaveBeenCalledTimes(1)
    const forwardedElements = state.makeForward.mock.calls.at(-1)?.[0] as Array<{ type: string, text?: string }>
    expect(forwardedElements).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'image', file: expect.stringMatching(/^base64:\/\//) }),
      expect.objectContaining({ type: 'text', text: expect.stringContaining('一、核心结论') })
    ]))
    const textPayload = forwardedElements.find(item => item.type === 'text')?.text ?? ''
    expect(textPayload).toContain('这是 研报（https://example.com/report）')
    expect(textPayload).not.toContain('**')
    expect(textPayload).not.toContain('[研报](')
    expect(textPayload).not.toContain('```')
  })

  it('sends all rendered markdown pages when the renderer returns multiple images', async () => {
    state.config.app.detailedSummaryParse.markdownRender.enabled = true
    state.renderHtmlToImage.mockResolvedValueOnce(['base64-page-1', 'base64-page-2'])
    const reply = vi.fn()
    const sendForwardMsg = vi.fn().mockResolvedValue({ message_id: 'forward-1' })

    await runDetailedSummaryParse({
      reply,
      bot: {
        account: { selfId: 'bot', name: 'bot' },
        sendForwardMsg
      },
      contact: { scene: 'group', peer: '1000' }
    } as any, {
      trigger: {
        keyword: '详细总结',
        rest: 'https://weibo.com/1'
      },
      shareContext: '',
      links: [{ platform: 'weibo', url: 'https://weibo.com/1' }]
    })

    expect(sendForwardMsg).toHaveBeenCalledTimes(1)
    expect(state.makeForward).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ type: 'image', file: expect.stringMatching(/^base64:\/\//) }),
        expect.objectContaining({ type: 'image', file: expect.stringMatching(/^base64:\/\//) })
      ]),
      'bot',
      'bot'
    )
  })

  it('falls back to direct rendered images when collection delivery fails after markdown rendering succeeds', async () => {
    state.config.app.detailedSummaryParse.markdownRender.enabled = true
    const sendForwardMsg = vi.fn().mockRejectedValueOnce(new Error('forward failed'))
    const reply = vi.fn().mockResolvedValue(undefined)

    await runDetailedSummaryParse({
      reply,
      bot: {
        account: { selfId: 'bot', name: 'bot' },
        sendForwardMsg
      },
      contact: { scene: 'group', peer: '1000' }
    } as any, {
      trigger: {
        keyword: '详细总结',
        rest: 'https://weibo.com/1'
      },
      shareContext: '',
      links: [{ platform: 'weibo', url: 'https://weibo.com/1' }]
    })

    expect(sendForwardMsg).toHaveBeenCalledTimes(1)
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({
      type: 'image',
      file: expect.stringMatching(/^base64:\/\//)
    }))
  })

  it('falls back to plain text when markdown image rendering fails', async () => {
    state.config.app.detailedSummaryParse.markdownRender.enabled = true
    state.summarizeWithOpenAIResponses.mockResolvedValueOnce({
      text: '## 一、核心结论\n**这是** [研报](https://example.com/report)',
      sources: []
    })
    const sendForwardMsg = vi.fn().mockRejectedValueOnce(new Error('forward failed'))
    state.renderHtmlToImage.mockRejectedValueOnce(new Error('markdown render failed'))
    const reply = vi.fn().mockResolvedValue(undefined)

    await runDetailedSummaryParse({
      reply,
      bot: {
        account: { selfId: 'bot', name: 'bot' },
        sendForwardMsg
      },
      contact: { scene: 'group', peer: '1000' }
    } as any, {
      trigger: {
        keyword: '详细总结',
        rest: 'https://weibo.com/1'
      },
      shareContext: '',
      links: [{ platform: 'weibo', url: 'https://weibo.com/1' }]
    })

    expect(sendForwardMsg).toHaveBeenCalledTimes(1)
    expect(reply).toHaveBeenCalledTimes(1)
    expect(reply).toHaveBeenNthCalledWith(1, expect.stringContaining('【微博】x【gpt-5】x【详细研报】'))
    expect(reply).toHaveBeenNthCalledWith(1, expect.not.stringContaining('**'))
    expect(reply).toHaveBeenNthCalledWith(1, expect.not.stringContaining('[研报]('))
  })
})
