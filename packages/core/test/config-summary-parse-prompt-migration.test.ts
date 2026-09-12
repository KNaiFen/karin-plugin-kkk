import fs from 'node:fs'

import YAML from 'node-karin/yaml'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  userAppYaml: '',
  defaultAppYaml: '',
  writes: [] as Array<{ path: string, content: string }>,
  reloadAmagiConfig: vi.fn()
}))

vi.mock('node-karin', () => ({
  copyConfigSync: vi.fn(),
  filesByExt: vi.fn((_dir: string, _ext: string, mode: string) => mode === 'name' ? ['app.yaml'] : []),
  logger: {
    debug: vi.fn(),
    error: vi.fn()
  },
  requireFileSync: vi.fn(),
  watch: vi.fn()
}))

vi.mock('node-karin/root', () => ({
  karinPathBase: '/tmp/karin-base'
}))

vi.mock('@/root', () => ({
  Root: {
    pluginName: 'karin-plugin-kkk',
    pluginPath: '/tmp/plugin-root'
  }
}))

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    default: {
      ...actual.default,
      readFileSync: vi.fn((filePath: string) => {
        if (String(filePath).includes('/config/app.yaml')) return state.userAppYaml
        return state.defaultAppYaml
      }),
      writeFileSync: vi.fn((filePath: string, content: string) => {
        state.writes.push({ path: String(filePath), content: String(content) })
      }),
      readdirSync: vi.fn(() => ['app.yaml'])
    }
  }
})

describe('summary parse prompt config migration', () => {
  beforeEach(() => {
    vi.resetModules()
    state.writes = []
    state.defaultAppYaml = YAML.stringify({
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
          retryDelayMs: 1500
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
      }
    })
    state.userAppYaml = YAML.stringify({
      summaryParse: {
        switch: true,
        keywords: ['总结'],
        sendParsedContent: true,
        prompt: {
          system: '旧的自定义提示词'
        }
      }
    })
  })

  it('removes legacy summaryParse.prompt from app config during init', async () => {
    const { Config } = await import('../src/module/utils/Config')

    void Config.app.switch

    expect(state.writes).toHaveLength(1)
    const written = YAML.parse(state.writes[0]!.content) as {
      summaryParse?: Record<string, unknown>
    }

    expect(written.summaryParse).toBeDefined()
    expect(written.summaryParse).not.toHaveProperty('prompt')
  })
})
