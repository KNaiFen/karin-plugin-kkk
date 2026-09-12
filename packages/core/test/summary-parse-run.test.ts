import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ParsedPost } from '../src/platform/parsedPost'

const state = vi.hoisted(() => ({
  config: {
    app: {
      summaryParse: {
        switch: true,
        keywords: ['总结'],
        sendParsedContent: false,
        llm: {
          baseUrl: 'https://api.siliconflow.cn/v1',
          apiKey: 'secret',
          model: 'zai-org/GLM-4.6V',
          timeoutMs: 60000,
          retryCount: 1,
          retryDelayMs: 1500
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
            baseUrl: 'https://api.siliconflow.cn/v1',
            apiKey: 'asr-secret',
            model: 'FunAudioLLM/SenseVoiceSmall',
            timeoutMs: 45000,
            retryCount: 1,
            retryDelayMs: 1500
          }
        }
      }
    }
  },
  resolveParsedPostWithCache: vi.fn(),
  resolveParsedPostFromResolvedLink: vi.fn(),
  enrichSummaryInputWithAsr: vi.fn(),
  summarizeWithOpenAICompatible: vi.fn(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    mark: vi.fn(),
    warn: vi.fn()
  }
}))

vi.mock('node-karin', () => ({
  logger: state.logger
}))

vi.mock('@/module/utils/Config', () => ({
  Config: state.config
}))

vi.mock('../src/platform/resolveParsedPost', () => ({
  resolveParsedPostFromResolvedLink: (...args: unknown[]) => state.resolveParsedPostFromResolvedLink(...args)
}))

vi.mock('../src/module/summaryParse/parsedPostCache', () => ({
  resolveParsedPostWithCache: (...args: unknown[]) => state.resolveParsedPostWithCache(...args)
}))

vi.mock('../src/module/summaryParse/asr', () => ({
  canUseAsr: vi.fn(() => false),
  enrichSummaryInputWithAsr: (...args: unknown[]) => state.enrichSummaryInputWithAsr(...args)
}))

vi.mock('../src/module/summaryParse/llm', () => ({
  canUseSummaryLLM: vi.fn(() => true),
  summarizeWithOpenAICompatible: (...args: unknown[]) => state.summarizeWithOpenAICompatible(...args)
}))

const {
  resolveSummaryParseContext,
  runSummaryParse
} = await import('../src/module/summaryParse')

const createParsedPost = (overrides: Partial<ParsedPost> = {}): ParsedPost => ({
  platform: 'weibo',
  platformLabel: '微博',
  subtype: 'status',
  title: '默认标题',
  author: {
    name: '默认作者'
  },
  summary: '默认摘要',
  url: 'https://weibo.com/default',
  contentBlocks: [{ type: 'text', text: '默认正文' }],
  images: [],
  videos: [],
  stats: [],
  meta: [],
  raw: {},
  ...overrides
})

describe('runSummaryParse', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.resolveParsedPostWithCache.mockImplementation(async (...args: unknown[]) => ({
      parsedPost: await state.resolveParsedPostFromResolvedLink(...args),
      cacheHit: false
    }))
    state.enrichSummaryInputWithAsr.mockImplementation(async (_config, input) => input)
    state.summarizeWithOpenAICompatible.mockResolvedValue('总结结果')
  })

  it('skips failed links and summarizes remaining inputs', async () => {
    state.resolveParsedPostWithCache
      .mockRejectedValueOnce(new Error('第一个失败'))
      .mockResolvedValueOnce({
        parsedPost: createParsedPost({
          title: '第二条标题',
          url: 'https://weibo.com/2',
          contentBlocks: [{ type: 'text', text: '第二条正文' }]
        }),
        cacheHit: false
      })

    const reply = vi.fn()
    const result = await runSummaryParse({
      reply
    } as any, {
      trigger: {
        keyword: '总结',
        rest: 'test'
      },
      shareContext: '附带文案',
      links: [
        { platform: 'weibo', url: 'https://weibo.com/1' },
        { platform: 'weibo', url: 'https://weibo.com/2' }
      ]
    })

    expect(state.resolveParsedPostWithCache).toHaveBeenCalledTimes(2)
    expect(state.enrichSummaryInputWithAsr).toHaveBeenCalledTimes(1)
    expect(state.resolveParsedPostWithCache.mock.invocationCallOrder[0]).toBeLessThan(
      state.resolveParsedPostWithCache.mock.invocationCallOrder[1]!
    )
    expect(state.resolveParsedPostWithCache.mock.invocationCallOrder[1]).toBeLessThan(
      state.enrichSummaryInputWithAsr.mock.invocationCallOrder[0]!
    )
    expect(state.summarizeWithOpenAICompatible).toHaveBeenCalledWith(
      state.config.app.summaryParse,
      [
        expect.objectContaining({
          title: '第二条标题',
          shareContext: '附带文案'
        })
      ],
      expect.objectContaining({
        totalLinks: 2
      })
    )
    expect(reply).toHaveBeenCalledWith('【微博】x【zai-org/GLM-4.6V】\n第二条标题\n总结结果')
    expect(result.summaryText).toBe('【微博】x【zai-org/GLM-4.6V】\n第二条标题\n总结结果')
    expect(result.taskId).toBeTypeOf('string')
    expect(state.logger.warn).toHaveBeenCalledWith(expect.stringContaining('单条链接解析失败，已跳过：第一个失败'))
    expect(state.logger.mark).toHaveBeenCalledWith(expect.stringContaining('开始解析'))
    expect(state.logger.mark).toHaveBeenCalledWith(expect.stringContaining('总结已发送'))
    expect(state.logger.mark).toHaveBeenCalledWith(expect.stringContaining('任务完成'))
  })

  it('throws when all links fail to build inputs', async () => {
    state.resolveParsedPostWithCache.mockRejectedValue(new Error('全部失败'))

    await expect(runSummaryParse({
      reply: vi.fn()
    } as any, {
      trigger: {
        keyword: '总结',
        rest: 'test'
      },
      shareContext: '',
      links: [
        { platform: 'weibo', url: 'https://weibo.com/1' }
      ]
    })).rejects.toThrow('解析总结失败：没有可用于总结的解析结果')
  })

  it('logs per-link progress with index platform and title', async () => {
    state.resolveParsedPostWithCache.mockResolvedValue({
      parsedPost: createParsedPost({
        platform: 'zhihu',
        platformLabel: '知乎',
        subtype: 'answer',
        title: '跨世纪大型回旋镖',
        url: 'https://example.com/1',
        contentBlocks: []
      }),
      cacheHit: false
    })

    await runSummaryParse({
      reply: vi.fn()
    } as any, {
      trigger: {
        keyword: '总结',
        rest: 'test'
      },
      shareContext: '',
      links: [
        { platform: 'zhihu', url: 'https://example.com/1' },
        { platform: 'zhihu', url: 'https://example.com/2' }
      ]
    })

    expect(state.logger.mark).toHaveBeenCalledWith(expect.stringContaining('[1/2]'))
    expect(state.logger.mark).toHaveBeenCalledWith(expect.stringContaining('[知乎]'))
    expect(state.logger.mark).toHaveBeenCalledWith(expect.stringContaining('跨世纪大型回旋镖'))
  })

  it('formats the final reply with platform and model while keeping only llm body content', async () => {
    state.summarizeWithOpenAICompatible.mockResolvedValue('【标题】标题【模型名称】模型\n【正文总结】\n最终总结')
    state.resolveParsedPostWithCache.mockResolvedValue({
      parsedPost: createParsedPost({
        platform: 'zhihu',
        platformLabel: '知乎',
        title: '标题'
      }),
      cacheHit: false
    })

    const reply = vi.fn()
    const result = await runSummaryParse({
      reply
    } as any, {
      trigger: {
        keyword: '总结',
        rest: 'test'
      },
      shareContext: '',
      links: [
        { platform: 'zhihu', url: 'https://example.com/1' }
      ]
    })

    expect(reply).toHaveBeenCalledWith('【知乎】x【zai-org/GLM-4.6V】\n标题\n最终总结')
    expect(result.summaryText).toBe('【知乎】x【zai-org/GLM-4.6V】\n标题\n最终总结')
  })

  it('reuses cached parsed posts across repeated runs while preserving the current share context', async () => {
    const parsedPost = createParsedPost({
      platform: 'zhihu',
      platformLabel: '知乎',
      title: '缓存标题',
      url: 'https://example.com/cache'
    })

    state.resolveParsedPostWithCache
      .mockResolvedValueOnce({
        parsedPost,
        cacheHit: false
      })
      .mockResolvedValueOnce({
        parsedPost,
        cacheHit: true
      })

    await runSummaryParse({
      reply: vi.fn()
    } as any, {
      trigger: {
        keyword: '总结',
        rest: '第一次'
      },
      shareContext: '第一次附带说明',
      links: [
        { platform: 'zhihu', url: 'https://example.com/cache' }
      ]
    })

    await runSummaryParse({
      reply: vi.fn()
    } as any, {
      trigger: {
        keyword: '总结',
        rest: '第二次'
      },
      shareContext: '第二次附带说明',
      links: [
        { platform: 'zhihu', url: 'https://example.com/cache' }
      ]
    })

    expect(state.resolveParsedPostWithCache).toHaveBeenCalledTimes(2)
    expect(state.summarizeWithOpenAICompatible.mock.calls[0]?.[1]?.[0]).toMatchObject({
      title: '缓存标题',
      shareContext: '第一次附带说明'
    })
    expect(state.summarizeWithOpenAICompatible.mock.calls[1]?.[1]?.[0]).toMatchObject({
      title: '缓存标题',
      shareContext: '第二次附带说明'
    })
    expect(state.logger.mark).toHaveBeenCalledWith(expect.stringContaining('命中链接级解析缓存'))
  })

  it('falls back to replied card content when the summary command itself does not include links', async () => {
    const getMsg = vi.fn().mockResolvedValue({
      elements: [{
        type: 'json',
        data: JSON.stringify({
          meta: {
            news: {
              title: '微信文章',
              jumpUrl: 'https://mp.weixin.qq.com/s/tAJ1B8ClOjQ41TWYJbIFTA'
            }
          }
        })
      }]
    })

    const context = await resolveSummaryParseContext({
      msg: '#总结 重点看看这个',
      replyId: 'reply-1',
      bot: {
        getMsg
      },
      contact: {
        scene: 'group',
        peer: '123'
      }
    } as any)

    expect(getMsg).toHaveBeenCalledWith(
      expect.objectContaining({
        scene: 'group',
        peer: '123'
      }),
      'reply-1'
    )
    expect(context).toEqual({
      trigger: {
        keyword: '总结',
        rest: '重点看看这个'
      },
      shareContext: '重点看看这个',
      links: [
        {
          platform: 'wechat',
          url: 'https://mp.weixin.qq.com/s/tAJ1B8ClOjQ41TWYJbIFTA'
        }
      ]
    })
  })
})
