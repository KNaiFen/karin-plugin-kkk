import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  files: new Map<string, string>(),
  readCount: 0,
  watchCallbacks: new Map<string, () => void>(),
  errors: [] as string[]
}))

const defaultDir = '/tmp/plugin-root/config/default_config'
const userDir = '/tmp/karin-base/karin-plugin-kkk/config'
const defaultPath = (name: string) => `${defaultDir}/${name}.yaml`
const userPath = (name: string) => `${userDir}/${name}.yaml`

vi.mock('node-karin', () => ({
  copyConfigSync: vi.fn(),
  filesByExt: vi.fn((_dir: string, _ext: string, mode: string) => {
    if (mode === 'name') return []
    return [userPath('app'), userPath('request')]
  }),
  logger: {
    debug: vi.fn(),
    error: vi.fn((message: unknown) => state.errors.push(String(message)))
  },
  watch: vi.fn((file: string, callback: () => void) => {
    state.watchCallbacks.set(file, callback)
  })
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
      readdirSync: vi.fn(() => ['app.yaml', 'request.yaml']),
      readFileSync: vi.fn((filePath: string) => {
        state.readCount++
        const normalizedPath = String(filePath).replace(/\/$/, '')
        if (state.files.has(normalizedPath)) return state.files.get(normalizedPath)!

        const error = new Error(`ENOENT: ${normalizedPath}`) as NodeJS.ErrnoException
        error.code = 'ENOENT'
        throw error
      }),
      writeFileSync: vi.fn()
    }
  }
})

describe('config in-memory snapshot', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    state.readCount = 0
    state.watchCallbacks.clear()
    state.errors = []
    state.files = new Map([
      [defaultPath('app'), 'removeCache: true\npriority: 800\n'],
      [userPath('app'), 'removeCache: false\npriority: 600\n'],
      [defaultPath('request'), 'timeout: 30000\n'],
      [userPath('request'), 'timeout: 45000\n']
    ])
  })

  it('parses each config file once per snapshot rebuild, not once per getter', async () => {
    const { Config } = await import('../src/module/utils/Config')

    expect(Config.app.removeCache).toBe(false)
    const readsAfterInitialization = state.readCount

    expect(Config.app.priority).toBe(600)
    expect(Config.request.timeout).toBe(45000)
    expect(Config.app.removeCache).toBe(false)
    expect(state.readCount).toBe(readsAfterInitialization)
  })

  it('returns detached values so callers cannot mutate the cached snapshot', async () => {
    const { Config } = await import('../src/module/utils/Config')
    const app = Config.app
    app.priority = 123

    expect(Config.app.priority).toBe(600)
  })

  it('rebuilds the complete snapshot on file changes and falls back to defaults for removed values or files', async () => {
    const { Config } = await import('../src/module/utils/Config')
    expect(Config.app).toMatchObject({ removeCache: false, priority: 600 })

    await vi.advanceTimersByTimeAsync(2000)
    state.files.set(userPath('app'), 'priority: 700\n')
    state.watchCallbacks.get(userPath('app'))?.()
    expect(Config.app).toMatchObject({ removeCache: true, priority: 700 })

    state.files.delete(userPath('app'))
    state.watchCallbacks.get(userPath('app'))?.()
    expect(Config.app).toEqual({ removeCache: true, priority: 800 })
  })

  it('keeps the last complete good snapshot when any watched YAML file is invalid', async () => {
    const { Config } = await import('../src/module/utils/Config')
    expect(Config.app.priority).toBe(600)
    expect(Config.request.timeout).toBe(45000)

    await vi.advanceTimersByTimeAsync(2000)
    state.files.set(userPath('app'), 'priority: 700\n')
    state.files.set(userPath('request'), 'timeout: [invalid\n')
    state.watchCallbacks.get(userPath('app'))?.()

    expect(Config.app.priority).toBe(600)
    expect(Config.request.timeout).toBe(45000)
    expect(state.errors.some(message => message.includes('request.yaml'))).toBe(true)
  })
})
