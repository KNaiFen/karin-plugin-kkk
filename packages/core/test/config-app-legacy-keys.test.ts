import { beforeEach, describe, expect, it, vi } from 'vitest'
import YAML from 'node-karin/yaml'

const state = vi.hoisted(() => ({
  userAppYaml: '',
  defaultAppYaml: '',
  writes: [] as Array<{ path: string, content: string }>
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

describe('app config legacy api server key migration', () => {
  beforeEach(() => {
    vi.resetModules()
    state.writes = []
    state.defaultAppYaml = YAML.stringify({
      videoTool: true,
      priority: 800,
      removeCache: true,
      renderScale: 100,
      Theme: 0,
      RenderWaitTime: 60
    })
    state.userAppYaml = YAML.stringify({
      APIServer: true,
      APIServerPort: 4567,
      APIServerMount: false,
      videoTool: false,
      priority: 600
    })
  })

  it('removes legacy APIServer keys from app config during init while keeping other values', async () => {
    const { Config } = await import('../src/module/utils/Config')

    void Config.app.videoTool

    expect(state.writes).toHaveLength(1)
    const written = YAML.parse(state.writes[0]!.content) as Record<string, unknown>

    expect(written).not.toHaveProperty('APIServer')
    expect(written).not.toHaveProperty('APIServerPort')
    expect(written).not.toHaveProperty('APIServerMount')
    expect(written.videoTool).toBe(false)
    expect(written.priority).toBe(600)
  })
})
