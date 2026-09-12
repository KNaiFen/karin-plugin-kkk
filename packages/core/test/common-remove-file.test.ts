import path from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  unlink: vi.fn(),
  existsSync: vi.fn(() => true),
  config: {
    app: {
      removeCache: false,
      Theme: 2
    }
  },
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    mark: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('node:fs', () => ({
  default: {
    existsSync: (...args: unknown[]) => state.existsSync(...args),
    promises: {
      unlink: (...args: unknown[]) => state.unlink(...args)
    }
  }
}))

vi.mock('node-karin', () => ({
  createNotFoundResponse: vi.fn(),
  logger: state.logger
}))

vi.mock('node-karin/root', () => ({
  karinPathTemp: '/tmp/karin-temp'
}))

vi.mock('@/module/utils/Config', () => ({
  Config: state.config
}))

vi.mock('@/module/utils/QRCodeScanner', () => ({
  QRCodeScanner: {
    scanFromUrl: vi.fn(),
    isSupportedPlatform: vi.fn(() => false)
  }
}))

vi.mock('../src/root', () => ({
  Root: {
    pluginName: 'karin-plugin-kkk'
  }
}))

vi.mock('../src/module', () => ({
  Count: {}
}))

const { Common } = await import('../src/module/utils/Common')

describe('Common.removeFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.config.app.removeCache = false
    state.unlink.mockResolvedValue(undefined)
  })

  it('allows deleting files inside the plugin temp directory', async () => {
    const safePath = path.join(Common.tempDri.video, 'safe.mp4')

    await expect(Common.removeFile(safePath, true)).resolves.toBe(true)
    expect(state.unlink).toHaveBeenCalledWith(safePath.replace(/\\/g, '/'))
  })

  it('rejects deleting files outside the plugin temp directory even when force is true', async () => {
    const outsidePath = '/tmp/unrelated-file.mp4'

    await expect(Common.removeFile(outsidePath, true)).resolves.toBe(false)
    expect(state.unlink).not.toHaveBeenCalled()
    expect(state.logger.warn).toHaveBeenCalledWith(expect.stringContaining('拒绝删除非插件缓存目录文件'))
  })
})
