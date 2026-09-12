import { Readable } from 'node:stream'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { transcriptOriginalConfig } from '../src/types/config/app'

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

const createConfig = (overrides: Partial<transcriptOriginalConfig> = {}): transcriptOriginalConfig => {
  const base: transcriptOriginalConfig = {
    switch: true,
    keywords: ['转写原文'],
    sendParsedContent: false,
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
    markdownRender: {
      enabled: false,
      sendTextVersion: false,
      fontSizePx: 16,
      multiPageEnabled: true,
      multiPageTriggerAspectRatio: 3,
      multiPageMaxAspectRatio: 2.2
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
    markdownRender: {
      ...base.markdownRender,
      ...overrides.markdownRender
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

const { summarizeTranscriptOriginalWithResponses } = await import('../src/module/transcriptOriginal/responses')

describe('transcript original responses payloads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', state.fetch)
    state.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: createSseBody([
        `event: response.output_text.delta
data: {"type":"response.output_text.delta","delta":"第一段。"}

`,
        `event: response.completed
data: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"第一段。"}]}]}}

`,
        'data: [DONE]\n\n'
      ])
    })
  })

  it('builds a streaming responses request with reasoning enabled and plain transcript text only', async () => {
    const result = await summarizeTranscriptOriginalWithResponses(createConfig(), [
      {
        platform: 'weibo',
        platformLabel: '微博',
        title: '标题',
        blocks: [],
        videos: [],
        stats: [],
        meta: [],
        asrTexts: [
          { title: '视频 1', text: '原始字幕内容' }
        ],
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
    expect(payload.include).toBeUndefined()
    expect(payload.tools).toBeUndefined()
    expect(payload.tool_choice).toBeUndefined()
    expect(payload.reasoning).toEqual({ effort: 'high' })
    expect(JSON.stringify(payload.input)).toContain('转写原文整理')
    expect(JSON.stringify(payload.input)).toContain('原始字幕内容')

    expect(result).toEqual({
      text: '第一段。'
    })
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

    const result = await summarizeTranscriptOriginalWithResponses(createConfig({
      llm: {
        retryCount: 1,
        retryDelayMs: 0
      }
    }), [
      {
        platform: 'weibo',
        platformLabel: '微博',
        title: '标题',
        blocks: [],
        videos: [],
        stats: [],
        meta: [],
        asrTexts: [
          { title: '视频 1', text: '原始字幕内容' }
        ],
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
    expect(state.logger.warn).toHaveBeenCalledWith(expect.stringContaining('转写原文 Responses 请求失败，准备重试'))
    expect(result).toEqual({
      text: '重试成功。'
    })
  })
})
