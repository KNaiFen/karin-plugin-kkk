import { describe, expect, it, vi } from 'vitest'

const loadAdminModule = async (removeCache: boolean) => {
  vi.resetModules()

  const task = vi.fn()
  const command = vi.fn(() => null)

  vi.doMock('node-karin', () => ({
    default: {
      task,
      command,
      contactGroup: vi.fn(),
      contactFriend: vi.fn(),
      sendMsg: vi.fn()
    },
    logger: {
      debug: vi.fn(),
      trace: vi.fn(),
      info: vi.fn(),
      mark: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn()
    }
  }))

  vi.doMock('@/module', () => ({
    Common: {
      tempDri: {
        video: '/tmp/video/',
        images: '/tmp/images/',
        cache: {
          parsedPost: '/tmp/cache/parsed-post/',
          workBundle: '/tmp/cache/work-bundle/',
          media: '/tmp/cache/media/',
          renderAssets: '/tmp/cache/render-assets/',
          derived: '/tmp/cache/derived/'
        }
      }
    }
  }))

  vi.doMock('@/module/utils/Config', () => ({
    Config: {
      app: {
        removeCache,
        sharedCacheTtlHours: 24
      },
      upload: {
        imageSendMode: 'file'
      },
      bilibili: {
        loginPerm: 'master'
      },
      douyin: {
        loginPerm: 'master'
      }
    }
  }))

  vi.doMock('@/module/utils/ErrorHandler', () => ({
    wrapWithErrorHandler: (fn: (...args: any[]) => any) => fn
  }))

  vi.doMock('@/platform', () => ({
    bilibiliLogin: vi.fn()
  }))

  vi.doMock('@/platform/douyin/login', () => ({
    douyinLogin: vi.fn()
  }))

  vi.doMock('@/module/utils/sharedCache', () => ({
    getSharedCacheTtlMs: vi.fn(() => 24 * 60 * 60 * 1000),
    removeExpiredFilesRecursively: vi.fn(() => 0)
  }))

  vi.doMock('node:fs', () => ({
    default: {
      readdirSync: vi.fn(() => []),
      statSync: vi.fn(),
      rmdirSync: vi.fn(),
      unlinkSync: vi.fn()
    }
  }))

  await import('../src/apps/admin')
  return { task, command }
}

describe('admin shared cache cleanup task', () => {
  it('still registers the shared cache cleanup task when removeCache is false', async () => {
    const { task } = await loadAdminModule(false)

    expect(task).toHaveBeenCalledTimes(1)
    expect(task.mock.calls[0]?.[0]).toBe('[kkk-共享缓存自动删除]')
  })

  it('registers both temporary-file cleanup and shared-cache cleanup when removeCache is true', async () => {
    const { task } = await loadAdminModule(true)

    expect(task).toHaveBeenCalledTimes(2)
    expect(task.mock.calls[0]?.[0]).toBe('[kkk-缓存自动删除]')
    expect(task.mock.calls[1]?.[0]).toBe('[kkk-共享缓存自动删除]')
  })
})
