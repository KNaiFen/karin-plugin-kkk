import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  imageSendMode: 'file' as 'file' | 'base64' | 'url',
  removeCache: false,
  files: new Map<string, Buffer>(),
  axiosGet: vi.fn()
}))

vi.mock('node-karin', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('../src/module/utils/Config', () => ({
  Config: {
    app: {
      get removeCache () {
        return state.removeCache
      }
    },
    upload: {
      get imageSendMode () {
        return state.imageSendMode
      }
    }
  }
}))

vi.mock('@/module/utils/Common', () => ({
  Common: {
    tempDri: {
      cache: {
        root: '/tmp/shared-cache/',
        parsedPost: '/tmp/shared-cache/parsed-post/',
        workBundle: '/tmp/shared-cache/work-bundle/',
        media: '/tmp/shared-cache/media/',
        renderAssets: '/tmp/shared-cache/render-assets/',
        derived: '/tmp/shared-cache/derived/'
      }
    }
  }
}))

vi.mock('node:fs', () => ({
  default: {
    existsSync: (filePath: string) => state.files.has(filePath),
    mkdirSync: vi.fn(),
    writeFileSync: (filePath: string, content: Buffer) => {
      state.files.set(filePath, Buffer.from(content))
    },
    readFileSync: (filePath: string) => state.files.get(filePath) ?? Buffer.from(''),
    unlinkSync: (filePath: string) => {
      state.files.delete(filePath)
    },
    linkSync: (source: string, target: string) => {
      const buffer = state.files.get(source)
      if (!buffer) throw new Error(`missing source: ${source}`)
      state.files.set(target, Buffer.from(buffer))
    },
    copyFileSync: (source: string, target: string) => {
      const buffer = state.files.get(source)
      if (!buffer) throw new Error(`missing source: ${source}`)
      state.files.set(target, Buffer.from(buffer))
    }
  }
}))

const { ImageDownloader } = await import('../src/module/utils/Network/ImageDownloader')

describe('ImageDownloader shared cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.imageSendMode = 'file'
    state.removeCache = false
    state.files = new Map()
    state.axiosGet.mockResolvedValue({
      data: Buffer.from('image-bytes')
    })
  })

  it('reuses a stable cached image file when cacheIdentity matches and url changes', async () => {
    const downloader = new ImageDownloader({
      get: (...args: unknown[]) => state.axiosGet(...args)
    } as any, '/tmp/images/', '/tmp/shared-cache/media/')

    const first = await downloader.processImage(
      'https://cdn.example.com/image.jpg?token=1',
      '作品',
      0,
      { scope: 'media', key: 'xiaohongshu:note:xhs123:image:0' } as any
    )
    const second = await downloader.processImage(
      'https://cdn.example.com/image.jpg?token=2',
      '作品',
      0,
      { scope: 'media', key: 'xiaohongshu:note:xhs123:image:0' } as any
    )

    expect(first).toBe('file:///tmp/images/作品_0.jpg')
    expect(second).toBe('file:///tmp/images/作品_0.jpg')
    expect(state.axiosGet).toHaveBeenCalledTimes(1)
  })

  it('reuses a stable cached image for base64 mode when cacheIdentity matches and url changes', async () => {
    state.imageSendMode = 'base64'
    const downloader = new ImageDownloader({
      get: (...args: unknown[]) => state.axiosGet(...args)
    } as any, '/tmp/images/', '/tmp/shared-cache/media/')

    const first = await downloader.processImage(
      'https://cdn.example.com/image.jpg?token=1',
      '作品',
      0,
      { scope: 'media', key: 'xiaohongshu:note:xhs123:image:0' } as any
    )
    const second = await downloader.processImage(
      'https://cdn.example.com/image.jpg?token=2',
      '作品',
      0,
      { scope: 'media', key: 'xiaohongshu:note:xhs123:image:0' } as any
    )

    expect(first).toBe(second)
    expect(first).toBe(`base64://${Buffer.from('image-bytes').toString('base64')}`)
    expect(state.axiosGet).toHaveBeenCalledTimes(1)
  })
})
