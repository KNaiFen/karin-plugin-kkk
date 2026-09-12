import { Readable } from 'node:stream'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { detailedSummaryParseConfig } from '../src/types/config/app'

const state = vi.hoisted(() => ({
  fetch: vi.fn(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    mark: vi.fn(),
    warn: vi.fn()
  }
}))

const createSseBody = (frames: string[]): Readable => {
  return Readable.from(frames.map(frame => Buffer.from(frame, 'utf8')))
}

const createErrorResponse = (status: number, statusText: string, detail: string) => ({
  ok: false,
  status,
  statusText,
  headers: new Headers(),
  body: null,
  text: vi.fn(async () => detail)
})

const createConfig = (overrides: Partial<detailedSummaryParseConfig> = {}): detailedSummaryParseConfig => {
  const base: detailedSummaryParseConfig = {
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
  }

  return {
    ...base,
    ...overrides,
    llm: {
      ...base.llm,
      ...overrides.llm
    },
    asr: {
      ...base.asr,
      ...overrides.asr,
      videoFrames: {
        ...base.asr.videoFrames,
        ...overrides.asr?.videoFrames
      },
      cloud: {
        ...base.asr.cloud,
        ...overrides.asr?.cloud
      }
    }
  }
}

vi.mock('node-karin', () => ({
  logger: state.logger
}))

const { summarizeWithOpenAIResponses } = await import('../src/module/detailedSummaryParse/responses')

describe('detailed summary responses payloads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', state.fetch)
    state.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: createSseBody([
        `event: response.output_text.delta
data: {"type":"response.output_text.delta","delta":"一、核心结论\\n"}

`,
        `event: response.output_text.delta
data: {"type":"response.output_text.delta","delta":"这是研报正文。"}

`,
        `event: response.completed
data: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"一、核心结论\\n这是研报正文。","annotations":[{"type":"url_citation","title":"OpenAI Docs","url":"https://developers.openai.com/api/docs/guides/tools-web-search"}]}]},{"type":"web_search_call","action":{"sources":[{"title":"OpenAI Docs","url":"https://developers.openai.com/api/docs/guides/tools-web-search"}]}}]}}

`,
        'data: [DONE]\n\n'
      ])
    })
  })

  it('builds a streaming responses request with web search and reasoning enabled, then returns citations', async () => {
    const result = await summarizeWithOpenAIResponses(createConfig(), [
      {
        platform: 'weibo',
        platformLabel: '微博',
        title: '标题',
        blocks: [{ type: 'text', text: '正文内容' }],
        videos: [],
        stats: [],
        meta: [],
        asrTexts: [],
        videoFrames: [],
        rawSource: {
          mode: 'video',
          platform: 'weibo',
          platformLabel: '微博',
          title: '标题',
          url: 'https://weibo.com/1',
          videos: []
        }
      } as any
    ])

    const [, requestInit] = state.fetch.mock.calls[0] ?? []
    const payload = JSON.parse(String(requestInit?.body))

    expect(state.fetch).toHaveBeenCalledWith('https://api.openai.com/v1/responses', expect.objectContaining({
      method: 'POST'
    }))
    expect(requestInit?.headers).toMatchObject({
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
      Authorization: 'Bearer secret'
    })
    expect(payload.model).toBe('gpt-5')
    expect(payload.stream).toBe(true)
    expect(payload.tools).toEqual([{ type: 'web_search' }])
    expect(payload.tool_choice).toBe('required')
    expect(payload.include).toEqual(['web_search_call.action.sources'])
    expect(payload.reasoning).toEqual({ effort: 'high' })
    expect(payload.input).toEqual(expect.any(Array))
    expect(JSON.stringify(payload.input)).toContain('你是中文研报编辑')
    expect(JSON.stringify(payload.input)).toContain('正文内容')

    expect(result.text).toContain('一、核心结论')
    expect(result.sources).toEqual([
      {
        title: 'OpenAI Docs',
        url: 'https://developers.openai.com/api/docs/guides/tools-web-search',
        domain: 'developers.openai.com'
      }
    ])
  })

  it('retries upstream responses errors such as HTTP 524', async () => {
    state.fetch
      .mockResolvedValueOnce(createErrorResponse(524, 'A Timeout Occurred', 'upstream timeout'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        body: createSseBody([
          `event: response.output_text.delta
data: {"type":"response.output_text.delta","delta":"重试成功。"}

`,
          'data: [DONE]\n\n'
        ])
      })

    const result = await summarizeWithOpenAIResponses(createConfig({
      llm: {
        retryCount: 1,
        retryDelayMs: 0
      }
    }), [
      {
        platform: 'weibo',
        platformLabel: '微博',
        title: '标题',
        blocks: [{ type: 'text', text: '正文内容' }],
        videos: [],
        stats: [],
        meta: [],
        asrTexts: [],
        videoFrames: [],
        rawSource: {
          mode: 'video',
          platform: 'weibo',
          platformLabel: '微博',
          title: '标题',
          url: 'https://weibo.com/1',
          videos: []
        }
      } as any
    ])

    expect(state.fetch).toHaveBeenCalledTimes(2)
    expect(state.logger.warn).toHaveBeenCalledWith(expect.stringContaining('详细解析总结 Responses 请求失败，准备重试'))
    expect(result.text).toBe('重试成功。')
  })
})
