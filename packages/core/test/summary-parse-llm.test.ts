import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { summaryParseConfig } from '../src/types/config/app'

const state = vi.hoisted(() => ({
  fetch: vi.fn(),
  get: vi.fn(),
  tempRoot: '/tmp/karin-plugin-kkk-test-root',
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    mark: vi.fn(),
    warn: vi.fn()
  }
}))

const tempDirs: string[] = []

const createSseResponse = (
  chunks: string[],
  headers: Record<string, string> = {}
) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  body: Readable.from(chunks.map(chunk => Buffer.from(chunk, 'utf8'))),
  headers: new Headers(headers),
  text: vi.fn(async () => '')
})

const createTempImageUrl = (filename: string, base64: string): string => {
  fs.mkdirSync(path.join(state.tempRoot, 'karin-plugin-kkk'), { recursive: true })
  const tempDir = fs.mkdtempSync(path.join(state.tempRoot, 'karin-plugin-kkk/summary-parse-llm-'))
  tempDirs.push(tempDir)

  const filePath = path.join(tempDir, filename)
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))
  return `file://${filePath}`
}

const getPostedPayload = (callIndex = 0) => {
  return JSON.parse(String(state.fetch.mock.calls[callIndex]?.[1]?.body))
}

const getPostedSystemText = (callIndex = 0): string => {
  return getPostedPayload(callIndex).input[0].content[0].text
}

const getPostedUserContent = (callIndex = 0) => {
  return getPostedPayload(callIndex).input[1].content
}

const createConfig = (overrides: Partial<summaryParseConfig> = {}): summaryParseConfig => {
  const base: summaryParseConfig = {
    switch: true,
    keywords: ['总结'],
    sendParsedContent: false,
    llm: {
      baseUrl: 'https://api.siliconflow.cn/v1',
      apiKey: 'secret',
      model: 'zai-org/GLM-4.6V',
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
      modelPath: '/models/ggml-base.bin',
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

const createTextSummaryInput = () => ({
  platform: 'weibo',
  platformLabel: '微博',
  title: '标题',
  author: '作者',
  summary: '摘要',
  blocks: [{ type: 'text' as const, text: '纯文本内容' }],
  videos: [],
  stats: [],
  meta: [],
  asrTexts: [],
  videoFrames: [],
  rawSource: {
    mode: 'video' as const,
    platform: 'weibo',
    platformLabel: '微博',
    title: '标题',
    url: 'https://weibo.com/1',
    videos: []
  }
})

vi.mock('node-karin', () => ({
  logger: state.logger
}))

vi.mock('node-karin/root', () => ({
  karinPathTemp: state.tempRoot
}))

vi.mock('@/root', () => ({
  Root: {
    pluginName: 'karin-plugin-kkk',
    pluginVersion: 'test',
    pluginPath: state.tempRoot,
    karinVersion: 'test',
    pkg: { name: 'karin-plugin-kkk' }
  }
}))

vi.mock('node-karin/axios', () => ({
  default: {
    get: (...args: unknown[]) => state.get(...args)
  }
}))

const { buildResponsesEndpoint, summarizeWithOpenAICompatible } = await import('../src/module/summaryParse/llm')
const { MULTIMODAL_SUMMARY_SYSTEM_PROMPT, TEXT_ONLY_SUMMARY_SYSTEM_PROMPT } = await import('../src/module/summaryParse/prompt')

describe('summary parse llm payloads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fs.mkdirSync(path.join(state.tempRoot, 'karin-plugin-kkk'), { recursive: true })
    vi.stubGlobal('fetch', state.fetch)
    state.get.mockResolvedValue({
      data: Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2w==', 'base64'),
      headers: {
        'content-type': 'image/jpeg'
      }
    })
    state.fetch.mockResolvedValue(createSseResponse([
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"总结结果"}\n\n',
      'event: response.completed\ndata: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"总结结果"}]}]}}\n\n',
      'data: [DONE]\n\n'
    ]))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    for (const tempDir of tempDirs.splice(0, tempDirs.length)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('validates the configured Responses API base URL before sending requests', () => {
    expect(buildResponsesEndpoint(createConfig({
      llm: { baseUrl: 'https://api.example.com/v1/' }
    }))).toBe('https://api.example.com/v1/responses')

    expect(() => buildResponsesEndpoint(createConfig({
      llm: { baseUrl: 'https://api.example.com/v1/responses' }
    }))).toThrow('不要填写 /responses')
    expect(() => buildResponsesEndpoint(createConfig({
      llm: { baseUrl: 'ftp://api.example.com/v1' }
    }))).toThrow('仅支持 http:// 或 https://')
  })

  it('reports a Responses endpoint 404 without retrying it', async () => {
    state.fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      body: null,
      headers: new Headers(),
      text: vi.fn(async () => 'route missing')
    })

    await expect(summarizeWithOpenAICompatible(createConfig({
      llm: {
        retryCount: 2,
        retryDelayMs: 0
      }
    }), [createTextSummaryInput()])).rejects.toThrow('未提供 Responses API')

    expect(state.fetch).toHaveBeenCalledTimes(1)
    expect(state.fetch.mock.calls[0]?.[0]).toBe('https://api.siliconflow.cn/v1/responses')
  })

  it('inlines remote images into multimodal content arrays when summary input contains images', async () => {
    await summarizeWithOpenAICompatible(createConfig(), [
      {
        platform: 'zhihu',
        platformLabel: '知乎',
        title: '标题',
        author: '作者',
        summary: '摘要',
        blocks: [
          { type: 'text', text: '第一段' },
          { type: 'image', url: 'https://example.com/image-1.jpg', alt: '配图一' },
          { type: 'html', html: '<p>第二段</p>', text: '第二段' }
        ],
        videos: [],
        stats: [],
        meta: [],
        shareContext: '附带文案',
        asrTexts: [],
        videoFrames: [],
        rawSource: {
          mode: 'external-post',
          card: {
            platform: { key: 'zhihu', label: '知乎', accentColor: '#1772f6' },
            title: '标题',
            author: { name: '作者' },
            summary: '摘要',
            url: 'https://www.zhihu.com/question/1/answer/2',
            images: ['https://example.com/image-1.jpg'],
            content: [],
            stats: [],
            meta: []
          }
        }
      }
    ])

    const payload = getPostedPayload()
    expect(payload.model).toBe('zai-org/GLM-4.6V')
    expect(payload.stream).toBe(true)
    expect(getPostedSystemText()).toBe(MULTIMODAL_SUMMARY_SYSTEM_PROMPT)
    expect(getPostedUserContent()).toEqual([
      { type: 'input_text', text: expect.stringContaining('平台：知乎') },
      { type: 'input_text', text: '第一段' },
      { type: 'input_text', text: '图片：配图一' },
      {
        type: 'input_image',
        image_url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w=='
      },
      { type: 'input_text', text: '第二段' }
    ])
    expect(state.get).toHaveBeenCalledWith('https://example.com/image-1.jpg', expect.objectContaining({
      responseType: 'arraybuffer',
      timeout: 15000
    }))
  })

  it('keeps plain text payloads when summary input has no images', async () => {
    await summarizeWithOpenAICompatible(createConfig({
      llm: {
        model: 'Pro/zai-org/GLM-4.7'
      }
    }), [
      {
        platform: 'weibo',
        platformLabel: '微博',
        title: '标题',
        author: '作者',
        summary: '摘要',
        blocks: [{ type: 'text', text: '纯文本内容' }],
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
      }
    ])

    const payload = getPostedPayload()
    expect(payload.tools).toBeUndefined()
    expect(payload.reasoning).toEqual({ effort: 'high' })
    expect(getPostedSystemText()).toBe(TEXT_ONLY_SUMMARY_SYSTEM_PROMPT)
    expect(getPostedUserContent()).toEqual([
      {
        type: 'input_text',
        text: expect.stringContaining('纯文本内容')
      }
    ])
  })

  it('uses the fixed text-only system prompt and ignores legacy prompt fields', async () => {
    const legacyConfig = createConfig({
      llm: {
        model: 'Pro/zai-org/GLM-4.7'
      }
    }) as summaryParseConfig & {
      prompt?: {
        system?: string
      }
    }
    legacyConfig.prompt = {
      system: '这是旧的自定义提示词，不应再生效'
    }

    await summarizeWithOpenAICompatible(legacyConfig, [
      {
        platform: 'weibo',
        platformLabel: '微博',
        title: '标题',
        author: '作者',
        summary: '摘要',
        blocks: [{ type: 'text', text: '纯文本内容' }],
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
      }
    ])

    const systemText = getPostedSystemText()
    expect(systemText).toBe(TEXT_ONLY_SUMMARY_SYSTEM_PROMPT)
    expect(systemText).toContain('你是中文资讯编辑')
    expect(systemText).toContain('只输出摘要正文')
    expect(systemText).not.toContain('这是旧的自定义提示词')
    expect(systemText).not.toContain('{{model}}')
  })

  it('normalizes base64 and file images into data urls for multimodal payloads', async () => {
    const localImageUrl = createTempImageUrl(
      'cover.png',
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6X8AAAAASUVORK5CYII='
    )

    await summarizeWithOpenAICompatible(createConfig(), [
      {
        platform: 'weibo',
        platformLabel: '微博',
        title: '标题',
        author: '作者',
        summary: '摘要',
        blocks: [
          {
            type: 'image',
            url: 'base64://R0lGODdhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=',
            alt: 'GIF 配图'
          },
          {
            type: 'image',
            url: localImageUrl,
            alt: '本地 PNG'
          },
          {
            type: 'image',
            url: 'data:image/webp;base64,Y292ZXItd2VicA==',
            alt: '内嵌 WEBP'
          }
        ],
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
      }
    ])

    expect(getPostedUserContent()).toEqual([
      { type: 'input_text', text: expect.stringContaining('平台：微博') },
      { type: 'input_text', text: '图片：GIF 配图' },
      {
        type: 'input_image',
        image_url: 'data:image/gif;base64,R0lGODdhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs='
      },
      { type: 'input_text', text: '图片：本地 PNG' },
      {
        type: 'input_image',
        image_url: expect.stringMatching(/^data:image\/png;base64,/)
      },
      { type: 'input_text', text: '图片：内嵌 WEBP' },
      {
        type: 'input_image',
        image_url: 'data:image/webp;base64,Y292ZXItd2VicA=='
      }
    ])
  })

  it('normalizes Windows file urls without duplicating the drive prefix', async () => {
    const readFileSpy = vi.spyOn(fs.promises, 'readFile')
      .mockResolvedValue(Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2w==', 'base64') as never)

    try {
      await summarizeWithOpenAICompatible(createConfig(), [
        {
          platform: 'douyin',
          platformLabel: '抖音',
          title: '标题',
          author: '作者',
          summary: '摘要',
          blocks: [
            {
              type: 'image',
              url: `file://${path.join(state.tempRoot, 'karin-plugin-kkk', 'kkkdownload', 'video', 'frame-001.jpg')}`,
              alt: 'Windows 抽帧'
            }
          ],
          videos: [],
          stats: [],
          meta: [],
          asrTexts: [],
          videoFrames: [],
          rawSource: {
            mode: 'video',
            platform: 'douyin',
            platformLabel: '抖音',
            title: '标题',
            url: 'https://www.douyin.com/video/1',
            videos: []
          }
        }
      ])

      expect(readFileSpy).toHaveBeenCalledWith(
        path.normalize(path.join(state.tempRoot, 'karin-plugin-kkk', 'kkkdownload', 'video', 'frame-001.jpg'))
      )

      expect(getPostedUserContent()).toEqual([
        { type: 'input_text', text: expect.stringContaining('平台：抖音') },
        { type: 'input_text', text: '图片：Windows 抽帧' },
        {
          type: 'input_image',
          image_url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w=='
        }
      ])
    } finally {
      readFileSpy.mockRestore()
    }
  })

  it('includes extracted video frame images in multimodal payloads', async () => {
    const frameOne = createTempImageUrl(
      'frame-1.jpg',
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2w=='
    )
    const frameTwo = createTempImageUrl(
      'frame-2.jpg',
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6X8AAAAASUVORK5CYII='
    )

    await summarizeWithOpenAICompatible(createConfig({
      asr: {
        videoFrames: {
          enabled: true,
          minIntervalSeconds: 10,
          maxImages: 10,
          skipStartSeconds: 3,
          skipEndSeconds: 3,
          sourceMode: 'auto'
        }
      }
    }), [
      {
        platform: 'bilibili',
        platformLabel: 'B站',
        title: '视频标题',
        author: '作者',
        summary: '摘要',
        blocks: [{ type: 'text', text: '正文内容' }],
        videos: [],
        stats: [],
        meta: [],
        asrTexts: [{ title: '视频标题', text: '字幕文本' }],
        videoFrames: [
          {
            title: '视频标题',
            images: [
              { type: 'image', url: frameOne, alt: '抽帧一' },
              { type: 'image', url: frameTwo, alt: '抽帧二' }
            ]
          }
        ],
        rawSource: {
          mode: 'video',
          platform: 'bilibili',
          platformLabel: 'B站',
          title: '视频标题',
          url: 'https://www.bilibili.com/video/BV1xx',
          videos: []
        }
      }
    ])

    expect(getPostedUserContent()).toEqual(expect.arrayContaining([
      { type: 'input_text', text: expect.stringContaining('视频抽帧：\n1. 视频标题：共 2 张画面') },
      { type: 'input_text', text: '正文内容' },
      { type: 'input_text', text: '视频转写（视频标题）：字幕文本' },
      { type: 'input_text', text: '视频抽帧（视频标题）：共 2 张画面' },
      { type: 'input_text', text: '抽帧 1/2：抽帧一' },
      { type: 'input_text', text: '抽帧 2/2：抽帧二' },
      {
        type: 'input_image',
        image_url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w=='
      },
      {
        type: 'input_image',
        image_url: expect.stringMatching(/^data:image\/jpeg;base64,/)
      }
    ]))
    expect(state.logger.mark).toHaveBeenCalledWith(expect.stringContaining('images=2'))
  })

  it('retries transient timeout failures before succeeding', async () => {
    state.fetch
      .mockRejectedValueOnce(Object.assign(new Error('timeout of 18000ms exceeded'), {
        code: 'ECONNABORTED'
      }))
      .mockResolvedValueOnce(createSseResponse([
        'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"重试后"}\n\n',
        'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"总结结果"}\n\n',
        'event: response.completed\ndata: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"重试后总结结果"}]}]}}\n\n',
        'data: [DONE]\n\n'
      ], {
        'x-siliconcloud-trace-id': 'trace-retry-success'
      }))

    await expect(summarizeWithOpenAICompatible(createConfig({
      llm: {
        model: 'Pro/zai-org/GLM-4.7',
        timeoutMs: 18000,
        retryCount: 1,
        retryDelayMs: 0
      }
    }), [
      {
        platform: 'weibo',
        platformLabel: '微博',
        title: '标题',
        author: '作者',
        summary: '摘要',
        blocks: [{ type: 'text', text: '纯文本内容' }],
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
      }
    ])).resolves.toBe('重试后总结结果')

    expect(state.fetch).toHaveBeenCalledTimes(2)
    expect(state.logger.warn).toHaveBeenCalledWith(expect.stringContaining('LLM 请求失败，准备重试'))
    expect(state.logger.mark).toHaveBeenCalledWith(expect.stringContaining('trace-retry-success'))
  })

  it('skips remote images when inline download fails instead of falling back to raw urls', async () => {
    state.get.mockRejectedValueOnce(new Error('image fetch failed'))

    await summarizeWithOpenAICompatible(createConfig(), [
      {
        platform: 'weibo',
        platformLabel: '微博',
        title: '标题',
        author: '作者',
        summary: '摘要',
        blocks: [
          { type: 'image', url: 'https://example.com/fallback.jpg', alt: '封面' }
        ],
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
      }
    ])

    expect(getPostedUserContent(state.fetch.mock.calls.length - 1)).toEqual([
      { type: 'input_text', text: expect.stringContaining('平台：微博') },
      { type: 'input_text', text: '图片：封面' }
    ])
    expect(state.logger.warn).toHaveBeenCalledWith(expect.stringContaining('图片 1 已跳过'))
  })

  it('skips empty image urls instead of emitting broken image_url payloads', async () => {
    await summarizeWithOpenAICompatible(createConfig(), [
      {
        platform: 'weibo',
        platformLabel: '微博',
        title: '标题',
        author: '作者',
        summary: '摘要',
        blocks: [
          { type: 'image', url: '', alt: '空地址图片' }
        ],
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
      }
    ])

    expect(getPostedUserContent()).toEqual([
      { type: 'input_text', text: expect.stringContaining('平台：微博') },
      { type: 'input_text', text: '图片：空地址图片' }
    ])
  })

  it('skips unsupported image schemes instead of emitting invalid image_url payloads', async () => {
    await summarizeWithOpenAICompatible(createConfig(), [
      {
        platform: 'weibo',
        platformLabel: '微博',
        title: '标题',
        author: '作者',
        summary: '摘要',
        blocks: [
          { type: 'image', url: 'ftp://example.com/cover.jpg', alt: '非法协议图片' }
        ],
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
      }
    ])

    expect(getPostedUserContent()).toEqual([
      { type: 'input_text', text: expect.stringContaining('平台：微博') },
      { type: 'input_text', text: '图片：非法协议图片' }
    ])
  })

  it('skips file images when reading local files fails', async () => {
    const originalReadFile = fs.promises.readFile
    ;(fs.promises.readFile as unknown as ReturnType<typeof vi.fn>) = vi.fn()
      .mockRejectedValueOnce(new Error('ENOENT: no such file or directory'))

    try {
      await summarizeWithOpenAICompatible(createConfig(), [
        {
          platform: 'douyin',
          platformLabel: '抖音',
          title: '标题',
          author: '作者',
          summary: '摘要',
          blocks: [
            {
              type: 'image',
              url: 'file:///tmp/missing-frame.jpg',
              alt: '缺失抽帧'
            }
          ],
          videos: [],
          stats: [],
          meta: [],
          asrTexts: [],
          videoFrames: [],
          rawSource: {
            mode: 'video',
            platform: 'douyin',
            platformLabel: '抖音',
            title: '标题',
            url: 'https://www.douyin.com/video/1',
            videos: []
          }
        }
      ])

      expect(getPostedUserContent()).toEqual([
        { type: 'input_text', text: expect.stringContaining('平台：抖音') },
        { type: 'input_text', text: '图片：缺失抽帧' }
      ])
    } finally {
      fs.promises.readFile = originalReadFile
    }
  })

  it('skips file images outside the plugin cache root', async () => {
    await summarizeWithOpenAICompatible(createConfig(), [
      {
        platform: 'douyin',
        platformLabel: '抖音',
        title: '标题',
        author: '作者',
        summary: '摘要',
        blocks: [
          {
            type: 'image',
            url: 'file:///etc/passwd',
            alt: '越界文件'
          }
        ],
        videos: [],
        stats: [],
        meta: [],
        asrTexts: [],
        videoFrames: [],
        rawSource: {
          mode: 'video',
          platform: 'douyin',
          platformLabel: '抖音',
          title: '标题',
          url: 'https://www.douyin.com/video/1',
          videos: []
        }
      }
    ])

    expect(getPostedUserContent()).toEqual([
      { type: 'input_text', text: expect.stringContaining('平台：抖音') },
      { type: 'input_text', text: '图片：越界文件' }
    ])
  })

  it('concatenates streamed deltas, enables stream mode and logs trace id', async () => {
    state.fetch.mockResolvedValueOnce(createSseResponse([
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"第一"}\n\n',
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"段"}\n\n',
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"，第二段"}\n\n',
      'event: response.completed\ndata: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"第一段，第二段"}]}]}}\n\n',
      'data: [DONE]\n\n'
    ], {
      'x-siliconcloud-trace-id': 'trace-stream-123'
    }))

    await expect(summarizeWithOpenAICompatible(createConfig({
      llm: {
        model: 'Pro/zai-org/GLM-4.7'
      }
    }), [
      {
        platform: 'weibo',
        platformLabel: '微博',
        title: '标题',
        author: '作者',
        summary: '摘要',
        blocks: [{ type: 'text', text: '纯文本内容' }],
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
      }
    ])).resolves.toBe('第一段，第二段')

    expect(getPostedPayload(state.fetch.mock.calls.length - 1)).toMatchObject({
      model: 'Pro/zai-org/GLM-4.7',
      stream: true
    })
    expect(state.fetch.mock.calls.at(-1)?.[1]).toMatchObject({
      method: 'POST'
    })
    expect(state.logger.mark).toHaveBeenCalledWith(expect.stringContaining('trace-stream-123'))
  })

  it('adds web search tools and switches prompt policy when enabled', async () => {
    await summarizeWithOpenAICompatible(createConfig({
      llm: {
        model: 'gpt-5-mini',
        webSearchEnabled: true,
        reasoningEnabled: false
      }
    }), [
      {
        platform: 'weibo',
        platformLabel: '微博',
        title: '标题',
        author: '作者',
        summary: '摘要',
        blocks: [{ type: 'text', text: '纯文本内容' }],
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
      }
    ])

    const payload = getPostedPayload()
    expect(payload.tools).toEqual([{ type: 'web_search' }])
    expect(payload.tool_choice).toBe('required')
    expect(payload.reasoning).toBeUndefined()
    expect(getPostedSystemText()).toContain('仅在必要时可使用联网搜索')
    expect(getPostedSystemText()).not.toContain('不得补背景、查外部信息、猜测或胡编')
  })

  it('parses streamed sse events when server uses crlf separators', async () => {
    state.fetch.mockResolvedValueOnce(createSseResponse([
      'event: response.output_text.delta\r\ndata: {"type":"response.output_text.delta","delta":"CRLF"}\r\n\r\n',
      'event: response.output_text.delta\r\ndata: {"type":"response.output_text.delta","delta":" 正常"}\r\n\r\n',
      'event: response.completed\r\ndata: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"CRLF 正常"}]}]}}\r\n\r\n',
      'data: [DONE]\r\n\r\n'
    ]))

    await expect(summarizeWithOpenAICompatible(createConfig({
      llm: {
        model: 'Pro/zai-org/GLM-4.7'
      }
    }), [
      {
        platform: 'weibo',
        platformLabel: '微博',
        title: '标题',
        author: '作者',
        summary: '摘要',
        blocks: [{ type: 'text', text: '纯文本内容' }],
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
      }
    ])).resolves.toBe('CRLF 正常')
  })

  it('ignores non-output_text response events before final content in stream mode', async () => {
    state.fetch.mockResolvedValueOnce(createSseResponse([
      'event: response.reasoning_summary_text.delta\ndata: {"type":"response.reasoning_summary_text.delta","delta":"先思考一下"}\n\n',
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"最终总结"}\n\n',
      'event: response.completed\ndata: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"最终总结"}]}]}}\n\n',
      'data: [DONE]\n\n'
    ]))

    await expect(summarizeWithOpenAICompatible(createConfig({
      llm: {
        model: 'Pro/zai-org/GLM-4.7'
      }
    }), [
      {
        platform: 'weibo',
        platformLabel: '微博',
        title: '标题',
        author: '作者',
        summary: '摘要',
        blocks: [{ type: 'text', text: '纯文本内容' }],
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
      }
    ])).resolves.toBe('最终总结')
  })

  it('retries when streamed response finishes without any content', async () => {
    state.fetch.mockResolvedValueOnce(createSseResponse([
      'data: [DONE]\n\n'
    ]))

    await expect(summarizeWithOpenAICompatible(createConfig({
      llm: {
        model: 'Pro/zai-org/GLM-4.7'
      }
    }), [
      {
        platform: 'weibo',
        platformLabel: '微博',
        title: '标题',
        author: '作者',
        summary: '摘要',
        blocks: [{ type: 'text', text: '纯文本内容' }],
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
      }
    ])).resolves.toBe('总结结果')

    expect(state.fetch).toHaveBeenCalledTimes(2)
    expect(state.logger.warn).toHaveBeenCalledWith(expect.stringContaining('LLM 请求失败，准备重试'))
  })

  it('parses multi-line data events and chunk-split frames', async () => {
    state.fetch.mockResolvedValueOnce(createSseResponse([
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"跨"\n',
      'data: }\n\n',
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"行"}\n\n',
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":" 事件"}\n',
      '\n',
      'event: response.completed\ndata: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"跨行 事件"}]}]}}\n\n',
      'data: [DONE]\n\n'
    ]))

    await expect(summarizeWithOpenAICompatible(createConfig({
      llm: {
        model: 'Pro/zai-org/GLM-4.7'
      }
    }), [
      {
        platform: 'weibo',
        platformLabel: '微博',
        title: '标题',
        author: '作者',
        summary: '摘要',
        blocks: [{ type: 'text', text: '纯文本内容' }],
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
      }
    ])).resolves.toBe('跨行 事件')
  })

  it('retries after streamed error payload before succeeding', async () => {
    state.fetch
      .mockResolvedValueOnce(createSseResponse([
        'event: error\ndata: {"type":"error","message":"temporary overload"}\n\n'
      ]))
      .mockResolvedValueOnce(createSseResponse([
        'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"恢复成功"}\n\n',
        'event: response.completed\ndata: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"恢复成功"}]}]}}\n\n',
        'data: [DONE]\n\n'
      ]))

    await expect(summarizeWithOpenAICompatible(createConfig({
      llm: {
        model: 'Pro/zai-org/GLM-4.7',
        retryCount: 1,
        retryDelayMs: 0
      }
    }), [
      {
        platform: 'weibo',
        platformLabel: '微博',
        title: '标题',
        author: '作者',
        summary: '摘要',
        blocks: [{ type: 'text', text: '纯文本内容' }],
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
      }
    ])).resolves.toBe('恢复成功')

    expect(state.fetch).toHaveBeenCalledTimes(2)
    expect(state.logger.warn).toHaveBeenCalledWith(expect.stringContaining('LLM 请求失败，准备重试'))
  })
})
