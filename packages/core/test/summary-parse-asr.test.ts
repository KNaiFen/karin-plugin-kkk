import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { summaryParseConfig } from '../src/types/config/app'
import type { SummaryInput } from '../src/module/summaryParse/types'

const state = vi.hoisted(() => ({
  downloadFile: vi.fn(),
  tempDir: '/tmp/kkk-summary-parse-test',
  axiosGet: vi.fn(),
  axiosPost: vi.fn(),
  loggerDebug: vi.fn(),
  loggerInfo: vi.fn(),
  loggerMark: vi.fn(),
  loggerWarn: vi.fn(),
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  readdirSync: vi.fn(),
  readFile: vi.fn(),
  getMediaDuration: vi.fn(),
  files: new Map<string, string | Buffer>()
}))

vi.mock('node-karin', () => ({
  logger: {
    debug: (...args: unknown[]) => state.loggerDebug(...args),
    info: (...args: unknown[]) => state.loggerInfo(...args),
    mark: (...args: unknown[]) => state.loggerMark(...args),
    warn: (...args: unknown[]) => state.loggerWarn(...args),
    chalk: {
      rgb: vi.fn((_red: number, _green: number, _blue: number) => (text: string) => text)
    }
  }
}))

vi.mock('node-karin/axios', () => ({
  default: {
    get: (...args: unknown[]) => state.axiosGet(...args),
    post: (...args: unknown[]) => state.axiosPost(...args)
  }
}))

vi.mock('node:fs', () => ({
  default: {
    existsSync: (...args: unknown[]) => state.existsSync(...args),
    readFileSync: (...args: unknown[]) => state.readFileSync(...args),
    writeFileSync: (...args: unknown[]) => state.writeFileSync(...args),
    unlinkSync: (...args: unknown[]) => state.unlinkSync(...args),
    readdirSync: (...args: unknown[]) => state.readdirSync(...args),
    promises: {
      readFile: (...args: unknown[]) => state.readFile(...args)
    }
  }
}))

vi.mock('@/module', () => ({
  Common: {
    tempDri: {
      video: state.tempDir,
      cache: {
        root: `${state.tempDir}/shared-cache`,
        parsedPost: `${state.tempDir}/shared-cache/parsed-post`,
        workBundle: `${state.tempDir}/shared-cache/work-bundle`,
        media: `${state.tempDir}/shared-cache/media`,
        renderAssets: `${state.tempDir}/shared-cache/render-assets`,
        derived: `${state.tempDir}/shared-cache/derived`
      }
    }
  },
  downloadFile: (...args: unknown[]) => state.downloadFile(...args)
}))

vi.mock('@/module/utils', () => ({
  getMediaDuration: (...args: unknown[]) => state.getMediaDuration(...args)
}))

const {
  enrichSummaryInputWithAsr,
  checkSummaryAsrAvailability,
  buildExtractAudioCommand
} = await import('../src/module/summaryParse/asr')
const {
  createFfmpegProgressParser,
  extractProgressPercentFromText
} = await import('../src/module/summaryParse/cliProgress')

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
      retryDelayMs: 1500
    },
    asr: {
      mode: 'cloud',
      whisperCppPath: '/usr/local/bin/whisper-cli',
      modelPath: '/models/ggml-base.bin',
      language: 'zh',
      threads: 4,
      ffmpegPath: '/usr/local/bin/ffmpeg',
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

const createVideo = (
  overrides: Partial<SummaryInput['videos'][number]> = {}
): SummaryInput['videos'][number] => ({
  type: 'video',
  url: 'https://example.com/video.mp4',
  title: '视频一',
  ...overrides
})

const createInput = (
  videos: SummaryInput['videos'],
  overrides: Partial<SummaryInput> = {}
): SummaryInput => ({
  platform: 'weibo',
  platformLabel: '微博',
  title: '标题',
  author: '作者',
  blocks: [],
  videos,
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
  },
  ...overrides,
  rawSource: {
    mode: 'video',
    platform: 'weibo',
    platformLabel: '微博',
    title: '标题',
    url: 'https://weibo.com/1',
    videos: [],
    ...overrides.rawSource
  }
})

const createProgress = () => ({
  taskId: 'task-1',
  totalLinks: 1,
  linkIndex: 1,
  platform: '微博',
  title: '标题'
})

const createFrameConfig = (
  overrides: Partial<NonNullable<summaryParseConfig['asr']['videoFrames']>> = {}
): summaryParseConfig => createConfig({
  asr: {
    ...createConfig().asr,
    videoFrames: {
      enabled: true,
      minIntervalSeconds: 10,
      maxImages: 10,
      skipStartSeconds: 3,
      skipEndSeconds: 3,
      sourceMode: 'auto',
      ...overrides
    }
  }
})

const createExecRunner = () => vi.fn(async (invocation: { file: string; args: string[] }) => {
  if (invocation.file.includes('ffmpeg')) {
    const outputTarget = String(invocation.args.at(-1) ?? '')
    if (outputTarget.includes('%03d')) {
      state.files.set(outputTarget.replace('%03d', '000'), Buffer.from('segment-audio'))
      state.files.set(outputTarget.replace('%03d', '001'), Buffer.from('segment-audio'))
    } else if (outputTarget.endsWith('.jpg')) {
      state.files.set(outputTarget, Buffer.from('frame-image'))
    } else if (outputTarget) {
      state.files.set(outputTarget, Buffer.from('generated-audio'))
    }
  }

  if (invocation.file.includes('whisper-cli')) {
    const outputIndex = invocation.args.indexOf('-of')
    const outputBase = outputIndex >= 0 ? String(invocation.args[outputIndex + 1] ?? '') : ''
    if (outputBase) {
      state.files.set(`${outputBase}.txt`, '转写文本')
    }
  }

  return { stdout: '', stderr: '' }
})

describe('summary parse ASR', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.files.clear()

    state.downloadFile.mockReset()
    state.axiosGet.mockReset()
    state.axiosPost.mockReset()
    state.existsSync.mockReset()
    state.readFileSync.mockReset()
    state.writeFileSync.mockReset()
    state.unlinkSync.mockReset()
    state.readdirSync.mockReset()
    state.readFile.mockReset()
    state.getMediaDuration.mockReset()

    state.downloadFile.mockImplementation(async (_url: string, options?: { filepath?: string }) => {
      if (options?.filepath) {
        state.files.set(options.filepath, Buffer.from('downloaded-media'))
      }
    })
    state.axiosGet.mockResolvedValue({ data: '平台字幕文本' })
    state.axiosPost.mockResolvedValue({
      data: {
        text: '云端转写文本'
      }
    })
    state.existsSync.mockImplementation((value: string) => {
      if (state.files.has(value)) return true
      if (value.includes('missing')) return false
      return value.endsWith('.bin') ||
        value.endsWith('.exe') ||
        value.endsWith('whisper-cli') ||
        value.endsWith('ffmpeg') ||
        /summary_parse_transcript_.*\.txt$/.test(value) ||
        /summary_parse_transcript_.*\.wav$/.test(value)
    })
    state.readFileSync.mockImplementation((value: string) => {
      if (state.files.has(value)) return state.files.get(value)
      if (/summary_parse_transcript_.*\.txt$/.test(value)) return '转写文本'
      return ''
    })
    state.writeFileSync.mockImplementation((value: string, content: string | Buffer) => {
      state.files.set(value, content)
    })
    state.unlinkSync.mockImplementation((value: string) => {
      state.files.delete(value)
    })
    state.readdirSync.mockImplementation((directory: string) => {
      const normalizedDirectory = String(directory).replace(/\\/g, '/').replace(/\/+$/, '')
      const names = new Set<string>()
      for (const filePath of state.files.keys()) {
        const normalizedPath = String(filePath).replace(/\\/g, '/')
        if (path.dirname(normalizedPath) === normalizedDirectory) {
          names.add(path.basename(normalizedPath))
        }
      }
      return [...names]
    })
    state.readFile.mockResolvedValue(Buffer.from('audio-data'))
    state.getMediaDuration.mockResolvedValue(30)
  })

  it('builds a compressed audio extraction command invocation', () => {
    expect(buildExtractAudioCommand(
      createConfig({
        asr: {
          ...createConfig().asr,
          ffmpegPath: 'ffmpeg',
          audioBitrateKbps: 48
        }
      }),
      'D:/tmp/source.mp4',
      'D:/tmp/audio.mp3'
    )).toEqual({
      file: 'ffmpeg',
      args: [
        '-y',
        '-i',
        'D:/tmp/source.mp4',
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '48k',
        'D:/tmp/audio.mp3'
      ]
    })
  })

  it('parses ffmpeg progress snapshots into percentage updates', () => {
    const snapshots: Array<{
      percent?: number
      outTimeSeconds?: number
      speedText?: string
      status?: string
    }> = []
    const parser = createFfmpegProgressParser(120, snapshot => {
      snapshots.push(snapshot)
    })

    parser.push('out_time=00:01:00.00\nspeed=1.50x\nprogress=continue\n')
    parser.push('out_time_ms=120000000\nspeed=1.20x\nprogress=end\n')

    expect(snapshots).toEqual([
      {
        outTimeSeconds: 60,
        speedText: '1.50x',
        status: 'continue',
        percent: 50
      },
      {
        outTimeSeconds: 120,
        speedText: '1.20x',
        status: 'end',
        percent: 100
      }
    ])
  })

  it('extracts local ASR progress percentages from stdout or stderr text', () => {
    expect(extractProgressPercentFromText('whisper_print_progress_callback: progress = 42%')).toBe(42)
    expect(extractProgressPercentFromText('processed 99.5% of samples')).toBe(99.5)
    expect(extractProgressPercentFromText('no percent here')).toBeUndefined()
  })

  it('reports missing ASR prerequisites for direct configuration checks', () => {
    expect(checkSummaryAsrAvailability(createConfig({
      asr: {
        ...createConfig().asr,
        mode: 'local',
        whisperCppPath: 'D:/missing/whisper-cli.exe',
        modelPath: 'D:/missing/ggml-small-q8_0.bin',
        ffmpegPath: 'D:/missing/ffmpeg.exe',
        cloud: {
          baseUrl: '',
          apiKey: '',
          model: '',
          timeoutMs: 45000
        }
      }
    }))).toEqual({
      ok: false,
      issues: [
        'ffmpeg 可执行文件不存在：D:/missing/ffmpeg.exe',
        'whisper.cpp 可执行文件不存在：D:/missing/whisper-cli.exe',
        'whisper.cpp 模型文件不存在：D:/missing/ggml-small-q8_0.bin'
      ]
    })
  })

  it('uses subtitle text even when no ASR provider is configured', async () => {
    const runner = vi.fn()

    const result = await enrichSummaryInputWithAsr(
      createConfig({
        asr: {
          ...createConfig().asr,
          whisperCppPath: '',
          modelPath: '',
          ffmpegPath: '',
          cloud: {
            baseUrl: '',
            apiKey: '',
            model: '',
            timeoutMs: 45000
          }
        }
      }),
      createInput([
        createVideo({
          subtitles: [{
            source: 'bilibili',
            language: 'zh-CN',
            label: '中文（自动生成）',
            text: '平台字幕文本'
          }]
        })
      ]),
      runner,
      createProgress()
    )

    expect(result.asrTexts).toEqual([
      {
        title: '视频一',
        text: '平台字幕文本'
      }
    ])
    expect(runner).not.toHaveBeenCalled()
    expect(state.downloadFile).not.toHaveBeenCalled()
    expect(state.axiosPost).not.toHaveBeenCalled()
    expect(state.loggerMark).toHaveBeenCalledWith(expect.stringContaining('检测到平台字幕，跳过 ASR'))
  })

  it('normalizes subtitle text to simplified Chinese before caching and reuses the cache on repeat triggers', async () => {
    state.axiosGet.mockResolvedValueOnce({
      data: '這裡是臺灣的資訊，後臺還會顯示畫面。'
    })

    const input = createInput([
      createVideo({
        subtitles: [{
          type: 'subtitle',
          source: 'bilibili',
          language: 'zh-TW',
          label: '中文字幕',
          url: 'https://example.com/subtitle.json'
        }]
      })
    ])

    const first = await enrichSummaryInputWithAsr(
      createConfig(),
      input,
      vi.fn(),
      createProgress()
    )

    const second = await enrichSummaryInputWithAsr(
      createConfig(),
      input,
      vi.fn(),
      createProgress()
    )

    expect(first.asrTexts).toEqual([
      {
        title: '视频一',
        text: '这里是台湾的资讯，后台还会显示画面。'
      }
    ])
    expect(second.asrTexts).toEqual(first.asrTexts)
    expect(state.axiosGet).toHaveBeenCalledTimes(1)

    const cacheWrites = state.writeFileSync.mock.calls.filter(([value]) => String(value).includes('summary_parse_subtitle_cache_'))
    expect(cacheWrites).toHaveLength(1)
    expect(String(cacheWrites[0]?.[0])).toContain(state.tempDir)
    expect(String(cacheWrites[0]?.[1])).toContain('这里是台湾的资讯，后台还会显示画面。')
  })

  it('reuses subtitle cache when the same video is revisited through an equivalent canonical url', async () => {
    state.axiosGet.mockResolvedValueOnce({
      data: '這是同一條 B 站字幕，只是入口鏈接不同。'
    })

    const first = await enrichSummaryInputWithAsr(
      createConfig(),
      createInput([
        createVideo({
          subtitles: [{
            type: 'subtitle',
            source: 'bilibili',
            language: 'zh-CN',
            label: '中文（自动生成）',
            url: 'https://i0.hdslb.com/bfs/subtitle/test.json?auth=first'
          }]
        })
      ], {
        platform: 'bilibili',
        platformLabel: 'B站',
        rawSource: {
          mode: 'video',
          platform: 'bilibili',
          platformLabel: 'B站',
          title: '标题',
          url: 'https://www.bilibili.com/video/BV1Z3jc6rEQi?p=1',
          videos: [],
          subtype: 'video',
          raw: {
            idData: {
              type: 'one_video',
              bvid: 'BV1Z3jc6rEQi',
              p: 1
            }
          }
        } as any
      }),
      vi.fn(),
      createProgress()
    )

    const second = await enrichSummaryInputWithAsr(
      createConfig(),
      createInput([
        createVideo({
          subtitles: [{
            type: 'subtitle',
            source: 'bilibili',
            language: 'zh-CN',
            label: '中文（自动生成）',
            url: 'https://i0.hdslb.com/bfs/subtitle/test.json?auth=second'
          }]
        })
      ], {
        platform: 'bilibili',
        platformLabel: 'B站',
        rawSource: {
          mode: 'video',
          platform: 'bilibili',
          platformLabel: 'B站',
          title: '标题',
          url: 'https://www.bilibili.com/video/BV1Z3jc6rEQi',
          videos: [],
          subtype: 'video',
          raw: {
            idData: {
              type: 'one_video',
              bvid: 'BV1Z3jc6rEQi'
            }
          }
        } as any
      }),
      vi.fn(),
      createProgress()
    )

    expect(first.asrTexts).toHaveLength(1)
    expect(first.asrTexts[0]).toMatchObject({
      title: '视频一'
    })
    expect(first.asrTexts[0]?.text).toContain('同一')
    expect(first.asrTexts[0]?.text).toContain('B 站字幕')
    expect(second.asrTexts).toEqual(first.asrTexts)
    expect(state.axiosGet).toHaveBeenCalledTimes(1)
    expect(state.loggerMark).toHaveBeenCalledWith(expect.stringContaining('命中平台字幕缓存'))
  })

  it('reuses subtitle cache for the same bilibili work even when media urls rotate', async () => {
    state.axiosGet.mockResolvedValueOnce({
      data: '这是同一个 B 站视频的正确字幕文本。'
    })

    const first = await enrichSummaryInputWithAsr(
      createConfig(),
      createInput([
        createVideo({
          url: 'https://cdn.example.com/video-a.m4s?token=first',
          audioUrl: 'https://cdn.example.com/audio-a.m4s?token=first',
          subtitles: [{
            type: 'subtitle',
            source: 'bilibili',
            language: 'zh-CN',
            label: '中文（自动生成）',
            url: 'https://aisubtitle.hdslb.com/bfs/ai_subtitle/prod/sub-a?auth=first'
          }]
        })
      ], {
        platform: 'bilibili',
        platformLabel: 'B站',
        rawSource: {
          mode: 'video',
          platform: 'bilibili',
          platformLabel: 'B站',
          title: '标题',
          url: 'https://www.bilibili.com/video/BV1Z3jc6rEQi?p=1',
          videos: [],
          subtype: 'video',
          raw: {
            idData: {
              type: 'one_video',
              bvid: 'BV1Z3jc6rEQi',
              p: 1
            }
          }
        } as any
      }),
      vi.fn(),
      createProgress()
    )

    const second = await enrichSummaryInputWithAsr(
      createConfig(),
      createInput([
        createVideo({
          url: 'https://cdn.example.com/video-b.m4s?token=second',
          audioUrl: 'https://cdn.example.com/audio-b.m4s?token=second',
          subtitles: [{
            type: 'subtitle',
            source: 'bilibili',
            language: 'zh-CN',
            label: '中文（自动生成）',
            url: 'https://aisubtitle.hdslb.com/bfs/ai_subtitle/prod/sub-b?auth=second'
          }]
        })
      ], {
        platform: 'bilibili',
        platformLabel: 'B站',
        rawSource: {
          mode: 'video',
          platform: 'bilibili',
          platformLabel: 'B站',
          title: '标题',
          url: 'https://www.bilibili.com/video/BV1Z3jc6rEQi',
          videos: [],
          subtype: 'video',
          raw: {
            idData: {
              type: 'one_video',
              bvid: 'BV1Z3jc6rEQi'
            }
          }
        } as any
      }),
      vi.fn(),
      createProgress()
    )

    expect(first.asrTexts[0]?.text).toContain('正确字幕文本')
    expect(second.asrTexts).toEqual(first.asrTexts)
    expect(state.axiosGet).toHaveBeenCalledTimes(1)
    expect(state.loggerMark).toHaveBeenCalledWith(expect.stringContaining('命中平台字幕缓存'))
  })

  it('does not reuse bilibili subtitle cache across different pages of the same bvid', async () => {
    state.axiosGet
      .mockResolvedValueOnce({
        data: '这是第一页的字幕。'
      })
      .mockResolvedValueOnce({
        data: '这是第二页的字幕。'
      })

    const first = await enrichSummaryInputWithAsr(
      createConfig(),
      createInput([
        createVideo({
          subtitles: [{
            type: 'subtitle',
            source: 'bilibili',
            language: 'zh-CN',
            label: '中文（自动生成）',
            url: 'https://aisubtitle.hdslb.com/bfs/ai_subtitle/prod/sub-p1?auth=first'
          }]
        })
      ], {
        platform: 'bilibili',
        platformLabel: 'B站',
        rawSource: {
          mode: 'video',
          platform: 'bilibili',
          platformLabel: 'B站',
          title: '标题',
          url: 'https://www.bilibili.com/video/BV1Z3jc6rEQi?p=1',
          videos: [],
          subtype: 'video',
          raw: {
            idData: {
              type: 'one_video',
              bvid: 'BV1Z3jc6rEQi',
              p: 1
            }
          }
        } as any
      }),
      vi.fn(),
      createProgress()
    )

    const second = await enrichSummaryInputWithAsr(
      createConfig(),
      createInput([
        createVideo({
          subtitles: [{
            type: 'subtitle',
            source: 'bilibili',
            language: 'zh-CN',
            label: '中文（自动生成）',
            url: 'https://aisubtitle.hdslb.com/bfs/ai_subtitle/prod/sub-p2?auth=second'
          }]
        })
      ], {
        platform: 'bilibili',
        platformLabel: 'B站',
        rawSource: {
          mode: 'video',
          platform: 'bilibili',
          platformLabel: 'B站',
          title: '标题',
          url: 'https://www.bilibili.com/video/BV1Z3jc6rEQi?p=2',
          videos: [],
          subtype: 'video',
          raw: {
            idData: {
              type: 'one_video',
              bvid: 'BV1Z3jc6rEQi',
              p: 2
            }
          }
        } as any
      }),
      vi.fn(),
      createProgress()
    )

    expect(first.asrTexts[0]?.text).toContain('第一页')
    expect(second.asrTexts[0]?.text).toContain('第二页')
    expect(second.asrTexts).not.toEqual(first.asrTexts)
    expect(state.axiosGet).toHaveBeenCalledTimes(2)
  })

  it('does not reuse bilibili subtitle cache across different bvids even when subtitle labels and media locators look similar', async () => {
    state.axiosGet
      .mockResolvedValueOnce({
        data: '这是 BV1AAAAAA111 的字幕。'
      })
      .mockResolvedValueOnce({
        data: '这是 BV1BBBBBB222 的字幕。'
      })

    const first = await enrichSummaryInputWithAsr(
      createConfig(),
      createInput([
        createVideo({
          url: 'https://upos-sz-mirrorcoso1.bilivideo.com/upgcxcode/11/11/11111/11111_nb2-1-30080.m4s?e=ig8euxZM',
          audioUrl: 'https://upos-sz-mirrorcoso1.bilivideo.com/upgcxcode/11/11/11111/11111_nb2-1-30280.m4s?e=ig8euxZM',
          subtitles: [{
            type: 'subtitle',
            source: 'bilibili',
            language: 'zh-CN',
            label: '中文（自动生成）',
            url: 'https://aisubtitle.hdslb.com/bfs/ai_subtitle/prod/11111/11111.json?auth=first'
          }]
        })
      ], {
        platform: 'bilibili',
        platformLabel: 'B站',
        rawSource: {
          mode: 'video',
          platform: 'bilibili',
          platformLabel: 'B站',
          title: '标题A',
          url: 'https://www.bilibili.com/video/BV1AAAAAA111',
          videos: [],
          subtype: 'video',
          raw: {
            idData: {
              type: 'one_video',
              bvid: 'BV1AAAAAA111',
              p: 1
            },
            selectedCid: 11111
          }
        } as any
      }),
      vi.fn(),
      createProgress()
    )

    const second = await enrichSummaryInputWithAsr(
      createConfig(),
      createInput([
        createVideo({
          url: 'https://upos-sz-mirrorcoso1.bilivideo.com/upgcxcode/11/11/11111/11111_nb2-1-30080.m4s?e=ig8euxZM',
          audioUrl: 'https://upos-sz-mirrorcoso1.bilivideo.com/upgcxcode/11/11/11111/11111_nb2-1-30280.m4s?e=ig8euxZM',
          subtitles: [{
            type: 'subtitle',
            source: 'bilibili',
            language: 'zh-CN',
            label: '中文（自动生成）',
            url: 'https://aisubtitle.hdslb.com/bfs/ai_subtitle/prod/11111/11111.json?auth=second'
          }]
        })
      ], {
        platform: 'bilibili',
        platformLabel: 'B站',
        rawSource: {
          mode: 'video',
          platform: 'bilibili',
          platformLabel: 'B站',
          title: '标题B',
          url: 'https://www.bilibili.com/video/BV1BBBBBB222',
          videos: [],
          subtype: 'video',
          raw: {
            idData: {
              type: 'one_video',
              bvid: 'BV1BBBBBB222',
              p: 1
            },
            selectedCid: 22222
          }
        } as any
      }),
      vi.fn(),
      createProgress()
    )

    expect(first.asrTexts[0]?.text).toContain('BV1AAAAAA111')
    expect(second.asrTexts[0]?.text).toContain('BV1BBBBBB222')
    expect(second.asrTexts).not.toEqual(first.asrTexts)
    expect(state.axiosGet).toHaveBeenCalledTimes(2)
  })

  it('extracts video frames even when platform subtitles skip ASR', async () => {
    const runner = createExecRunner()
    const result = await enrichSummaryInputWithAsr(
      createFrameConfig(),
      createInput([
        createVideo({
          subtitles: [{
            source: 'bilibili',
            language: 'zh-CN',
            label: '中文（自动生成）',
            text: '平台字幕文本'
          }],
          durationSeconds: 30
        })
      ]),
      runner,
      createProgress()
    )

    expect(result.asrTexts).toEqual([
      {
        title: '视频一',
        text: '平台字幕文本'
      }
    ])
    expect(result.videoFrames).toHaveLength(1)
    expect(result.videoFrames[0]?.images).toHaveLength(3)
    expect(result.videoFrames[0]?.images[0]?.url).toMatch(/^file:\/\//)
    expect(state.axiosPost).not.toHaveBeenCalled()
    expect(runner).toHaveBeenCalledTimes(3)
    expect(runner.mock.calls.every(([invocation]) => invocation.args.includes('-frames:v'))).toBe(true)
  })

  it('limits long video frames by max image count and records per-frame progress', async () => {
    state.getMediaDuration.mockResolvedValueOnce(1800)
    const runner = createExecRunner()

    const result = await enrichSummaryInputWithAsr(
      createFrameConfig({
        minIntervalSeconds: 10,
        maxImages: 10
      }),
      createInput([
        createVideo({
          durationSeconds: 1800
        })
      ]),
      runner,
      createProgress()
    )

    const frameCalls = runner.mock.calls.filter(([invocation]) => invocation.args.includes('-frames:v'))
    expect(result.videoFrames[0]?.images).toHaveLength(10)
    expect(frameCalls).toHaveLength(10)
    expect(state.loggerMark).toHaveBeenCalledWith(expect.stringContaining('视频抽帧'))
    expect(state.loggerMark).toHaveBeenCalledWith(expect.stringContaining('抽帧 第 1/10 张'))
    expect(state.loggerMark).toHaveBeenCalledWith(expect.stringContaining('抽帧 第 10/10 张'))
  })

  it('forces parsed content source for frame extraction when parsed content replay is enabled', async () => {
    const runner = createExecRunner()

    await enrichSummaryInputWithAsr(
      {
        ...createFrameConfig(),
        sendParsedContent: true
      },
      createInput([
        createVideo({
          url: 'https://example.com/video-main.mp4',
          asrSourceType: 'video',
          asrSourceUrl: 'https://example.com/video-small.mp4',
          backupUrls: ['https://example.com/video-main-backup.mp4']
        })
      ]),
      runner,
      createProgress()
    )

    expect(state.downloadFile).toHaveBeenCalledWith(
      'https://example.com/video-main.mp4',
      expect.objectContaining({
        backupUrls: ['https://example.com/video-main-backup.mp4']
      })
    )
  })

  it('falls back to main video source for frames when summary optimized source is audio only', async () => {
    const runner = createExecRunner()

    await enrichSummaryInputWithAsr(
      createFrameConfig({
        sourceMode: 'summary_optimized'
      }),
      createInput([
        createVideo({
          url: 'https://example.com/video-main.mp4',
          asrSourceType: 'audio',
          asrSourceUrl: 'https://example.com/audio.m4a',
          audioUrl: 'https://example.com/audio.m4a',
          backupUrls: ['https://example.com/video-main-backup.mp4']
        })
      ]),
      runner,
      createProgress()
    )

    expect(state.downloadFile).toHaveBeenCalledWith(
      'https://example.com/video-main.mp4',
      expect.objectContaining({
        backupUrls: ['https://example.com/video-main-backup.mp4']
      })
    )
  })

  it('reuses cached video frames on repeat triggers without downloading or extracting again', async () => {
    const runner = createExecRunner()
    const config = createFrameConfig()
    const input = createInput([
      createVideo({
        url: 'https://cdn.example.com/video.mp4?token=first',
        backupUrls: ['https://cdn.example.com/video-backup.mp4?token=aaa']
      })
    ])

    const first = await enrichSummaryInputWithAsr(
      config,
      input,
      runner,
      createProgress()
    )
    const second = await enrichSummaryInputWithAsr(
      config,
      input,
      runner,
      createProgress()
    )

    expect(first.videoFrames[0]?.images).toHaveLength(3)
    expect(second.videoFrames).toEqual(first.videoFrames)
    expect(state.downloadFile).toHaveBeenCalledTimes(1)
    expect(runner.mock.calls.filter(([invocation]) => invocation.args.includes('-frames:v')).length).toBeGreaterThanOrEqual(3)
    expect(state.loggerMark).toHaveBeenCalledWith(expect.stringContaining('命中抽帧缓存，跳过抽帧'))
  })

  it('falls back to cloud when local prerequisites are missing in local-first mode', async () => {
    const runner = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })

    const result = await enrichSummaryInputWithAsr(
      createConfig({
        asr: {
          ...createConfig().asr,
          mode: 'local',
          whisperCppPath: 'D:/missing/whisper-cli.exe',
          modelPath: 'D:/missing/ggml-small-q8_0.bin',
          ffmpegPath: 'ffmpeg'
        }
      }),
      createInput([createVideo()]),
      runner,
      createProgress()
    )

    expect(result.asrTexts).toEqual([
      {
        title: '视频一',
        text: '云端转写文本'
      }
    ])
    expect(runner).toHaveBeenCalledTimes(1)
    expect(runner.mock.calls[0]?.[0]).toMatchObject({
      file: 'ffmpeg'
    })
    expect(state.loggerWarn).toHaveBeenCalledWith(expect.stringContaining('本地 ASR 不可用，将回退云端'))
  })

  it('uses injected runner for audioUrl extraction and local transcription', async () => {
    const runner = vi.fn()
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    const result = await enrichSummaryInputWithAsr(
      createConfig({
        asr: {
          ...createConfig().asr,
          mode: 'local',
          cloud: {
            baseUrl: '',
            apiKey: '',
            model: '',
            timeoutMs: 45000
          }
        }
      }),
      createInput([
        createVideo({
          audioUrl: 'https://example.com/audio.m4a',
          audioBackupUrls: ['https://example.com/audio-backup.m4a'],
          backupUrls: ['https://example.com/video-backup.mp4'],
          headers: {
            Referer: 'https://example.com'
          },
          title: undefined
        })
      ]),
      runner,
      createProgress()
    )

    expect(state.downloadFile).toHaveBeenCalledWith(
      'https://example.com/audio.m4a',
      expect.objectContaining({
        headers: expect.objectContaining({ Referer: 'https://example.com' }),
        backupUrls: ['https://example.com/audio-backup.m4a']
      })
    )
    expect(runner).toHaveBeenCalledTimes(3)
    expect(runner.mock.calls[0]?.[0]).toMatchObject({
      file: '/usr/local/bin/ffmpeg',
      args: expect.arrayContaining(['-vn', '-c:a', 'libmp3lame', '-b:a', '24k'])
    })
    expect(runner.mock.calls[1]?.[0]).toMatchObject({
      file: '/usr/local/bin/ffmpeg',
      args: expect.arrayContaining(['-c:a', 'pcm_s16le', '-f', 'wav'])
    })
    expect(runner.mock.calls[2]?.[0]).toMatchObject({
      file: '/usr/local/bin/whisper-cli'
    })
    expect(result.asrTexts).toEqual([
      {
        title: undefined,
        text: '转写文本'
      }
    ])
  })

  it('prefers explicit ASR source video over the default playback URL', async () => {
    const runner = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })

    const result = await enrichSummaryInputWithAsr(
      createConfig(),
      createInput([
        createVideo({
          url: 'https://example.com/video-main.mp4',
          asrSourceType: 'video',
          asrSourceUrl: 'https://example.com/video-small.mp4',
          asrSourceBackupUrls: ['https://example.com/video-small-backup.mp4']
        })
      ]),
      runner,
      createProgress()
    )

    expect(state.downloadFile).toHaveBeenCalledWith(
      'https://example.com/video-small.mp4',
      expect.objectContaining({
        backupUrls: ['https://example.com/video-small-backup.mp4']
      })
    )
    expect(result.asrTexts).toEqual([
      {
        title: '视频一',
        text: '云端转写文本'
      }
    ])
  })

  it('uses cloud ASR first and sends multipart request', async () => {
    const runner = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })

    const result = await enrichSummaryInputWithAsr(
      createConfig({
        asr: {
          ...createConfig().asr,
          audioBitrateKbps: 32
        }
      }),
      createInput([createVideo()]),
      runner,
      createProgress()
    )

    expect(runner).toHaveBeenCalledTimes(1)
    expect(runner.mock.calls[0]?.[0]).toMatchObject({
      file: '/usr/local/bin/ffmpeg',
      args: expect.arrayContaining(['-b:a', '32k'])
    })
    expect(state.axiosPost).toHaveBeenCalledTimes(1)
    expect(state.axiosPost.mock.calls[0]?.[0]).toBe('https://api.siliconflow.cn/v1/audio/transcriptions')
    expect(state.axiosPost.mock.calls[0]?.[2]).toMatchObject({
      timeout: 45000,
      headers: {
        Authorization: 'Bearer asr-secret'
      }
    })
    expect(result.asrTexts).toEqual([
      {
        title: '视频一',
        text: '云端转写文本'
      }
    ])
  })

  it('reuses the ASR text cache on repeat triggers and skips download/transcode/transcription', async () => {
    const runner = createExecRunner()
    const input = createInput([
      createVideo({
        asrSourceType: 'video',
        asrSourceUrl: 'https://cdn-1.example.com/media/video123.mp4?token=first',
        asrSourceBackupUrls: [
          'https://backup-2.example.com/media/video123.mp4?token=bbb',
          'https://backup-1.example.com/media/video123.mp4?token=aaa'
        ]
      })
    ])

    const first = await enrichSummaryInputWithAsr(
      createConfig(),
      input,
      runner,
      createProgress()
    )

    const second = await enrichSummaryInputWithAsr(
      createConfig(),
      input,
      runner,
      createProgress()
    )

    expect(first.asrTexts).toEqual([
      {
        title: '视频一',
        text: '云端转写文本'
      }
    ])
    expect(second.asrTexts).toEqual(first.asrTexts)
    expect(state.downloadFile).toHaveBeenCalledTimes(1)
    expect(runner).toHaveBeenCalledTimes(1)
    expect(state.axiosPost).toHaveBeenCalledTimes(1)
  })

  it('reuses cached media and extracted audio even when ASR text cache is invalidated', async () => {
    const runner = createExecRunner()
    const firstInput = createInput([
      createVideo({
        asrSourceType: 'video',
        asrSourceUrl: 'https://cdn-1.example.com/media/video123.mp4?token=first',
        asrSourceBackupUrls: [
          'https://backup-2.example.com/media/video123.mp4?token=bbb',
          'https://backup-1.example.com/media/video123.mp4?token=aaa'
        ]
      })
    ])
    const secondInput = createInput([
      createVideo({
        asrSourceType: 'video',
        asrSourceUrl: 'https://cdn-2.example.com/another-path/video123.mp4?token=second',
        asrSourceBackupUrls: [
          'https://backup-1.example.com/media/video123.mp4?token=aaa',
          'https://backup-2.example.com/media/video123.mp4?token=bbb'
        ]
      })
    ])

    await enrichSummaryInputWithAsr(
      createConfig(),
      firstInput,
      runner,
      createProgress()
    )

    await enrichSummaryInputWithAsr(
      createConfig({
        asr: {
          ...createConfig().asr,
          cloud: {
            ...createConfig().asr.cloud,
            model: 'AnotherCloudModel'
          }
        }
      }),
      secondInput,
      runner,
      createProgress()
    )

    expect(state.downloadFile).toHaveBeenCalledTimes(1)
    expect(runner).toHaveBeenCalledTimes(1)
    expect(state.axiosPost).toHaveBeenCalledTimes(2)
  })

  it('falls back to local ASR when cloud transcription fails', async () => {
    state.axiosPost.mockRejectedValueOnce(new Error('cloud failed'))
    const runner = vi.fn()
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    const result = await enrichSummaryInputWithAsr(
      createConfig(),
      createInput([createVideo()]),
      runner,
      createProgress()
    )

    expect(state.axiosPost).toHaveBeenCalledTimes(1)
    expect(runner).toHaveBeenCalledTimes(3)
    expect(runner.mock.calls.some(([invocation]) => invocation.file === '/usr/local/bin/whisper-cli')).toBe(true)
    expect(result.asrTexts).toEqual([
      {
        title: '视频一',
        text: '转写文本'
      }
    ])
  })

  it('retries cloud ASR before succeeding', async () => {
    state.axiosPost
      .mockRejectedValueOnce(new Error('timeout of 45000ms exceeded'))
      .mockResolvedValueOnce({ data: { text: '云端重试成功' } })

    const runner = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })

    const result = await enrichSummaryInputWithAsr(
      createConfig(),
      createInput([createVideo()]),
      runner,
      createProgress()
    )

    expect(state.axiosPost).toHaveBeenCalledTimes(2)
    expect(result.asrTexts).toEqual([
      {
        title: '视频一',
        text: '云端重试成功'
      }
    ])
    expect(state.loggerWarn).toHaveBeenCalledWith(expect.stringContaining('云端 ASR 请求失败，准备重试'))
  })

  it('normalizes cloud ASR text before caching and reuses the cache without redownloading or retranscribing', async () => {
    state.axiosPost.mockResolvedValueOnce({
      data: {
        text: '這裡有雲端辨識結果，還會帶著後臺資訊。'
      }
    })

    const runner = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })
    const input = createInput([createVideo()])
    const config = createConfig()

    const first = await enrichSummaryInputWithAsr(
      config,
      input,
      runner,
      createProgress()
    )

    const second = await enrichSummaryInputWithAsr(
      config,
      input,
      runner,
      createProgress()
    )

    expect(first.asrTexts).toEqual([
      {
        title: '视频一',
        text: '这里有云端辨识结果，还会带着后台资讯。'
      }
    ])
    expect(second.asrTexts).toEqual(first.asrTexts)
    expect(state.downloadFile).toHaveBeenCalledTimes(1)
    expect(runner).toHaveBeenCalledTimes(1)
    expect(state.axiosPost).toHaveBeenCalledTimes(1)

    const cacheWrites = state.writeFileSync.mock.calls.filter(([value]) => String(value).includes('summary_parse_asr_cache_'))
    expect(cacheWrites).toHaveLength(1)
    expect(String(cacheWrites[0]?.[0])).toContain(state.tempDir)
    expect(String(cacheWrites[0]?.[1])).toContain('这里有云端辨识结果，还会带着后台资讯。')
  })

  it('does not reuse ASR cache when key configuration changes', async () => {
    state.axiosPost
      .mockResolvedValueOnce({ data: { text: '第一次结果' } })
      .mockResolvedValueOnce({ data: { text: '第二次结果' } })

    const runner = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })
    const input = createInput([createVideo()])

    const first = await enrichSummaryInputWithAsr(
      createConfig({
        asr: {
          ...createConfig().asr,
          audioBitrateKbps: 24
        }
      }),
      input,
      runner
    )

    const second = await enrichSummaryInputWithAsr(
      createConfig({
        asr: {
          ...createConfig().asr,
          audioBitrateKbps: 48
        }
      }),
      input,
      runner
    )

    expect(first.asrTexts[0]?.text).toBe('第一次结果')
    expect(second.asrTexts[0]?.text).toBe('第二次结果')
    expect(state.downloadFile).toHaveBeenCalledTimes(1)
    expect(runner).toHaveBeenCalledTimes(2)
    expect(state.axiosPost).toHaveBeenCalledTimes(2)
  })

  it('falls back to cloud ASR when local transcription fails in local-first mode', async () => {
    const runner = vi.fn()
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockRejectedValueOnce(new Error('local whisper failed'))

    const result = await enrichSummaryInputWithAsr(
      createConfig({
        asr: {
          ...createConfig().asr,
          mode: 'local'
        }
      }),
      createInput([createVideo()]),
      runner
    )

    expect(runner).toHaveBeenCalledTimes(3)
    expect(runner.mock.calls.some(([invocation]) => invocation.file === '/usr/local/bin/whisper-cli')).toBe(true)
    expect(state.axiosPost).toHaveBeenCalledTimes(1)
    expect(result.asrTexts).toEqual([
      {
        title: '视频一',
        text: '云端转写文本'
      }
    ])
  })

  it('treats empty local transcript as a failure and falls back to cloud', async () => {
    state.readFileSync.mockReturnValueOnce('   ')
    const runner = vi.fn()
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    const result = await enrichSummaryInputWithAsr(
      createConfig({
        asr: {
          ...createConfig().asr,
          mode: 'local'
        }
      }),
      createInput([createVideo()]),
      runner
    )

    expect(result.asrTexts).toEqual([
      {
        title: '视频一',
        text: '云端转写文本'
      }
    ])
    expect(state.loggerWarn).toHaveBeenCalledWith(expect.stringContaining('本地 ASR 失败'))
  })

  it('cuts long audio into multiple segments and joins cloud transcripts', async () => {
    const runner = createExecRunner()

    state.axiosPost
      .mockResolvedValueOnce({ data: { text: '第一段' } })
      .mockResolvedValueOnce({ data: { text: '第二段' } })

    const result = await enrichSummaryInputWithAsr(
      createConfig(),
      createInput([
        createVideo({
          durationSeconds: 3500
        })
      ]),
      runner,
      createProgress()
    )

    expect(runner).toHaveBeenCalledTimes(2)
    expect(runner.mock.calls[1]?.[0]).toMatchObject({
      file: '/usr/local/bin/ffmpeg',
      args: expect.arrayContaining(['-f', 'segment', '-segment_time', '1800'])
    })
    expect(state.axiosPost).toHaveBeenCalledTimes(2)
    expect(result.asrTexts).toEqual([
      {
        title: '视频一',
        text: '第一段\n第二段'
      }
    ])
    expect(state.loggerMark).toHaveBeenCalledWith(expect.stringContaining('切片'))
    expect(state.loggerMark).toHaveBeenCalledWith(expect.stringContaining('ASR 第 1/2 段'))
    expect(state.loggerMark).toHaveBeenCalledWith(expect.stringContaining('ASR 第 2/2 段'))
    expect(state.loggerMark).toHaveBeenCalledWith(expect.stringContaining('ASR 完成'))
  })

  it('uses only real generated segment files when platform duration overestimates the segment count', async () => {
    const runner = createExecRunner()

    state.getMediaDuration.mockRejectedValueOnce(new Error('probe failed'))
    state.axiosPost
      .mockResolvedValueOnce({ data: { text: '第一段' } })
      .mockResolvedValueOnce({ data: { text: '第二段' } })

    const result = await enrichSummaryInputWithAsr(
      createConfig(),
      createInput([
        createVideo({
          durationSeconds: 5401
        })
      ]),
      runner,
      createProgress()
    )

    expect(result.asrTexts).toEqual([
      {
        title: '视频一',
        text: '第一段\n第二段'
      }
    ])
    expect(state.axiosPost).toHaveBeenCalledTimes(2)
  })

  it('skips the current ASR item when splitting reports zero generated segments', async () => {
    const runner = vi.fn()
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockImplementationOnce(async () => ({ stdout: '', stderr: '' }))

    const result = await enrichSummaryInputWithAsr(
      createConfig(),
      createInput([
        createVideo({
          durationSeconds: 3500
        })
      ]),
      runner
    )

    expect(result.asrTexts).toEqual([])
    expect(state.loggerWarn).toHaveBeenCalledWith(expect.stringContaining('视频 ASR 失败'))
    expect(state.axiosPost).not.toHaveBeenCalled()
  })

  it('reuses ASR cache when signed media URLs only differ by query parameters', async () => {
    state.axiosPost.mockResolvedValueOnce({
      data: {
        text: '云端缓存结果'
      }
    })

    const runner = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })
    const config = createConfig()

    const first = await enrichSummaryInputWithAsr(
      config,
      createInput([
        createVideo({
          url: 'https://cdn.example.com/video.mp4?token=first'
        })
      ]),
      runner,
      createProgress()
    )

    const second = await enrichSummaryInputWithAsr(
      config,
      createInput([
        createVideo({
          url: 'https://cdn.example.com/video.mp4?token=second'
        })
      ]),
      runner,
      createProgress()
    )

    expect(first.asrTexts).toEqual([
      {
        title: '视频一',
        text: '云端缓存结果'
      }
    ])
    expect(second.asrTexts).toEqual(first.asrTexts)
    expect(state.downloadFile).toHaveBeenCalledTimes(1)
    expect(runner).toHaveBeenCalledTimes(1)
    expect(state.axiosPost).toHaveBeenCalledTimes(1)
    expect(state.loggerMark).toHaveBeenCalledWith(expect.stringContaining('命中 ASR 缓存'))
  })

  it('ignores segment cache manifests that point outside the cache root', async () => {
    const runner = createExecRunner()
    state.axiosPost
      .mockResolvedValueOnce({ data: { text: '第一段' } })
      .mockResolvedValueOnce({ data: { text: '第二段' } })

    await enrichSummaryInputWithAsr(
      createConfig(),
      createInput([
        createVideo({
          durationSeconds: 3500
        })
      ]),
      runner,
      createProgress()
    )

    const manifestWrite = state.writeFileSync.mock.calls.find(([value]) => String(value).endsWith('.json') && String(value).includes('summary_parse_audio_segments_cache_'))
    const manifestPath = String(manifestWrite?.[0] ?? '')
    expect(manifestPath).toContain('summary_parse_audio_segments_cache_')

    state.files.set(manifestPath, JSON.stringify({
      segmentPaths: ['/tmp/escape-segment-000.mp3', '/tmp/escape-segment-001.mp3']
    }))
    state.files.set('/tmp/escape-segment-000.mp3', Buffer.from('bad'))
    state.files.set('/tmp/escape-segment-001.mp3', Buffer.from('bad'))

    state.axiosPost.mockClear()
    state.writeFileSync.mockClear()
    await enrichSummaryInputWithAsr(
      createConfig({
        asr: {
          ...createConfig().asr,
          cloud: {
            ...createConfig().asr.cloud,
            model: 'ChangedModelToBustAsrTextCache'
          }
        }
      }),
      createInput([
        createVideo({
          durationSeconds: 3500
        })
      ]),
      runner,
      createProgress()
    )

    expect(state.axiosPost).toHaveBeenCalledTimes(2)
  })

  it('reuses media cache when ASR cache misses because config changes', async () => {
    state.axiosPost
      .mockResolvedValueOnce({ data: { text: '第一次结果' } })
      .mockResolvedValueOnce({ data: { text: '第二次结果' } })

    const runner = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })

    await enrichSummaryInputWithAsr(
      createConfig({
        asr: {
          ...createConfig().asr,
          audioBitrateKbps: 24
        }
      }),
      createInput([
        createVideo({
          url: 'https://cdn.example.com/video.mp4?token=first'
        })
      ]),
      runner,
      createProgress()
    )

    await enrichSummaryInputWithAsr(
      createConfig({
        asr: {
          ...createConfig().asr,
          audioBitrateKbps: 48
        }
      }),
      createInput([
        createVideo({
          url: 'https://cdn.example.com/video.mp4?token=second'
        })
      ]),
      runner,
      createProgress()
    )

    expect(state.downloadFile).toHaveBeenCalledTimes(1)
    expect(runner).toHaveBeenCalledTimes(2)
    expect(state.axiosPost).toHaveBeenCalledTimes(2)
    expect(state.loggerMark).toHaveBeenCalledWith(expect.stringContaining('命中媒体缓存，跳过下载'))
  })

  it('cleans up decoded wav files and per-segment transcript artifacts', async () => {
    const runner = createExecRunner()

    await enrichSummaryInputWithAsr(
      createConfig({
        asr: {
          ...createConfig().asr,
          mode: 'local',
          cloud: {
            baseUrl: '',
            apiKey: '',
            model: '',
            timeoutMs: 45000
          }
        }
      }),
      createInput([
        createVideo({
          durationSeconds: 3500
        })
      ]),
      runner
    )

    const removedPaths = state.unlinkSync.mock.calls.map(([value]) => String(value))
    expect(removedPaths.some(value => /summary_parse_transcript_.*_0\.txt$/.test(value))).toBe(true)
    expect(removedPaths.some(value => /summary_parse_transcript_.*_1\.txt$/.test(value))).toBe(true)
    expect(removedPaths.some(value => /summary_parse_transcript_.*_0\.wav$/.test(value))).toBe(true)
    expect(removedPaths.some(value => /summary_parse_transcript_.*_1\.wav$/.test(value))).toBe(true)
  })

  it('skips failed ASR items and continues without throwing', async () => {
    const runner = vi.fn().mockRejectedValue(new Error('ffmpeg failed'))

    const result = await enrichSummaryInputWithAsr(
      createConfig(),
      createInput([createVideo()]),
      runner
    )

    expect(result.asrTexts).toEqual([])
    expect(state.loggerWarn).toHaveBeenCalledWith(expect.stringContaining('视频 ASR 失败'))
  })

  it('does not let progress rendering failures interrupt local ASR', async () => {
    const chalkRgb = (await import('node-karin')).logger.chalk.rgb as unknown as ReturnType<typeof vi.fn>
    chalkRgb.mockImplementationOnce(function () {
      throw new Error(`Cannot read properties of undefined (reading 'Symbol(STYLER)')`)
    })

    const runner = vi.fn()
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: 'whisper_print_progress_callback: progress = 42%' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    const result = await enrichSummaryInputWithAsr(
      createConfig({
        asr: {
          ...createConfig().asr,
          mode: 'local',
          cloud: {
            baseUrl: '',
            apiKey: '',
            model: '',
            timeoutMs: 45000
          }
        }
      }),
      createInput([createVideo()]),
      runner,
      createProgress()
    )

    expect(result.asrTexts).toEqual([
      {
        title: '视频一',
        text: '转写文本'
      }
    ])
    expect(state.loggerWarn).not.toHaveBeenCalledWith(expect.stringContaining('Cannot read properties of undefined'))
  })
})
