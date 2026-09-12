import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  downloadCalls: [] as string[],
  networkOptionsCalls: [] as unknown[],
  linkCalls: [] as Array<[string, string]>,
  copyCalls: [] as Array<[string, string]>,
  unlinkCalls: [] as string[],
  existingFiles: new Set<string>(),
  pendingPrimaryResolve: null as null | (() => void)
}))

vi.mock('node-karin', () => ({
  default: {},
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    mark: vi.fn(),
    warn: vi.fn(),
    chalk: {
      rgb: () => (text: string) => text
    }
  },
  Message: class {},
  segment: {
    reply: vi.fn(),
    text: vi.fn(),
    video: vi.fn()
  }
}))

vi.mock('@/module/utils/Config', () => ({
  Config: {
    app: {
      removeCache: false
    },
    upload: {
      downloadAutoReduce: false,
      downloadMaxSpeed: 10,
      downloadMinSpeed: 1,
      downloadThrottle: false
    }
  }
}))

vi.mock('node:fs', () => ({
  default: {
    existsSync: (value: string) => state.existingFiles.has(value),
    readFileSync: vi.fn(),
    promises: {
      unlink: async (value: string) => {
        state.unlinkCalls.push(value)
        state.existingFiles.delete(value)
      },
      link: async (source: string, target: string) => {
        state.linkCalls.push([source, target])
        state.existingFiles.add(target)
      },
      copyFile: async (source: string, target: string) => {
        state.copyCalls.push([source, target])
        state.existingFiles.add(target)
      }
    }
  }
}))

vi.mock('@/module/utils', () => ({
  baseHeaders: {},
  Common: {
    tempDri: {
      video: '/tmp/',
      cache: {
        media: '/tmp/shared-cache/media/'
      }
    }
  },
  compressVideo: vi.fn(),
  extractTotalBytesFromHeaders: vi.fn(),
  getMediaDuration: vi.fn(),
  Networks: class {
    private readonly url: string
    private readonly filepath: string

    constructor (data: { url: string, filepath: string, networkOptions?: unknown }) {
      this.url = data.url
      this.filepath = data.filepath
      state.networkOptionsCalls.push(data.networkOptions)
    }

    async downloadStream () {
      state.downloadCalls.push(this.url)
      if (this.url.endsWith('/slow-primary')) {
        await new Promise<void>(resolve => {
          state.pendingPrimaryResolve = resolve
        })
      }
      if (this.url.endsWith('/primary')) {
        throw new Error('HTTP 404')
      }
      state.existingFiles.add(this.filepath)
      return {
        filepath: this.filepath,
        totalBytes: 2048
      }
    }
  }
}))

vi.mock('@/module/utils/Common', () => ({
  Common: {
    tempDri: {
      video: '/tmp/',
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

vi.mock('@/module/utils/FFmpeg', () => ({
  compressVideo: vi.fn(),
  getMediaDuration: vi.fn()
}))

vi.mock('@/module/utils/Network/constants', () => ({
  BASE_HEADERS: {}
}))

vi.mock('@/module/utils/Network/helpers', () => ({
  extractTotalBytesFromHeaders: vi.fn()
}))

vi.mock('@/module/utils/Network/Network', () => ({
  Network: class {
    private readonly url: string
    private readonly filepath: string

    constructor (data: { url: string, filepath: string, networkOptions?: unknown }) {
      this.url = data.url
      this.filepath = data.filepath
      state.networkOptionsCalls.push(data.networkOptions)
    }

    async downloadStream () {
      state.downloadCalls.push(this.url)
      if (this.url.endsWith('/slow-primary')) {
        await new Promise<void>(resolve => {
          state.pendingPrimaryResolve = resolve
        })
      }
      if (this.url.endsWith('/primary')) {
        throw new Error('HTTP 404')
      }
      state.existingFiles.add(this.filepath)
      return {
        filepath: this.filepath,
        totalBytes: 2048
      }
    }
  }
}))

vi.mock('../src/module/utils/amagiClient', () => ({
  AmagiBase: class {}
}))

const { downloadFile } = await import('../src/module/utils/Base')

describe('downloadFile backup URLs', () => {
  beforeEach(() => {
    state.downloadCalls = []
    state.networkOptionsCalls = []
    state.linkCalls = []
    state.copyCalls = []
    state.unlinkCalls = []
    state.existingFiles = new Set()
    state.pendingPrimaryResolve = null
  })

  it('downloads from a backup URL when the primary URL fails', async () => {
    await expect(downloadFile('https://cdn.example/primary', {
      title: 'video.mp4',
      backupUrls: ['https://cdn.example/backup'],
      maxRetries: 0
    })).resolves.toMatchObject({
      filepath: '/tmp/video.mp4',
      totalBytes: 2048
    })

    expect(state.downloadCalls).toEqual([
      'https://cdn.example/primary',
      'https://cdn.example/backup'
    ])
  })

  it('passes network options to each attempted download URL', async () => {
    const networkOptions = { proxy: false }

    await expect(downloadFile('https://cdn.example/primary', {
      title: 'video.mp4',
      backupUrls: ['https://cdn.example/backup'],
      maxRetries: 0,
      networkOptions
    })).resolves.toMatchObject({
      filepath: '/tmp/video.mp4'
    })

    expect(state.networkOptionsCalls).toEqual([networkOptions, networkOptions])
  })

  it('coalesces concurrent downloads for the same resource and reuses the first file locally', async () => {
    const firstDownload = downloadFile('https://cdn.example/slow-primary', {
      title: 'first.mp4',
      filepath: '/tmp/first.mp4',
      maxRetries: 0
    })
    const secondDownload = downloadFile('https://cdn.example/slow-primary', {
      title: 'second.mp4',
      filepath: '/tmp/second.mp4',
      maxRetries: 0
    })

    expect(state.downloadCalls).toEqual(['https://cdn.example/slow-primary'])
    state.pendingPrimaryResolve?.()

    await expect(firstDownload).resolves.toMatchObject({
      filepath: '/tmp/first.mp4',
      totalBytes: 2048
    })
    await expect(secondDownload).resolves.toMatchObject({
      filepath: '/tmp/second.mp4',
      totalBytes: 2048
    })

    expect(state.downloadCalls).toEqual(['https://cdn.example/slow-primary'])
    expect(state.linkCalls).toEqual([['/tmp/first.mp4', '/tmp/second.mp4']])
    expect(state.copyCalls).toEqual([])
  })

  it('reuses a completed download for later calls to the same resource', async () => {
    await expect(downloadFile('https://cdn.example/reused', {
      title: 'first.mp4',
      filepath: '/tmp/first.mp4',
      maxRetries: 0
    })).resolves.toMatchObject({
      filepath: '/tmp/first.mp4',
      totalBytes: 2048
    })

    await expect(downloadFile('https://cdn.example/reused', {
      title: 'second.mp4',
      filepath: '/tmp/second.mp4',
      maxRetries: 0
    })).resolves.toMatchObject({
      filepath: '/tmp/second.mp4',
      totalBytes: 2048
    })

    expect(state.downloadCalls).toEqual(['https://cdn.example/reused'])
    expect(state.linkCalls).toEqual([['/tmp/first.mp4', '/tmp/second.mp4']])
    expect(state.copyCalls).toEqual([])
  })

  it('reuses a stable media cache when the direct url changes but cacheIdentity stays the same', async () => {
    await expect(downloadFile('https://cdn.example/reused?token=first', {
      title: 'first.mp4',
      filepath: '/tmp/first.mp4',
      maxRetries: 0,
      cacheIdentity: {
        scope: 'media',
        key: 'douyin:aweme:123:video:0'
      }
    } as any)).resolves.toMatchObject({
      filepath: '/tmp/first.mp4',
      totalBytes: 2048
    })

    await expect(downloadFile('https://cdn.example/reused?token=second', {
      title: 'second.mp4',
      filepath: '/tmp/second.mp4',
      maxRetries: 0,
      cacheIdentity: {
        scope: 'media',
        key: 'douyin:aweme:123:video:0'
      }
    } as any)).resolves.toMatchObject({
      filepath: '/tmp/second.mp4',
      totalBytes: 2048
    })

    expect(state.downloadCalls).toEqual(['https://cdn.example/reused?token=first'])
    expect(state.linkCalls).toEqual([
      ['/tmp/shared-cache/media/douyin_aweme_123_video_0.mp4', '/tmp/first.mp4'],
      ['/tmp/shared-cache/media/douyin_aweme_123_video_0.mp4', '/tmp/second.mp4']
    ])
  })
})
