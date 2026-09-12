import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  executeSafeAxiosRequest: vi.fn(),
  files: new Map<string, string>(),
  mtimes: new Map<string, number>(),
  now: Date.now()
}))

vi.mock('node-karin', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('node:fs', () => ({
  default: {
    existsSync: (filePath: string) => state.files.has(filePath),
    readFileSync: (filePath: string) => state.files.get(filePath) ?? '',
    writeFileSync: (filePath: string, content: string) => {
      state.files.set(filePath, String(content))
      state.mtimes.set(filePath, state.now)
    },
    statSync: (filePath: string) => ({
      mtimeMs: state.mtimes.get(filePath) ?? state.now,
      isDirectory: () => false
    }),
    renameSync: (source: string, target: string) => {
      const content = state.files.get(source)
      if (content === undefined) throw new Error('missing source')
      state.files.set(target, content)
      state.mtimes.set(target, state.mtimes.get(source) ?? state.now)
      state.files.delete(source)
      state.mtimes.delete(source)
    },
    rmSync: (filePath: string) => {
      state.files.delete(filePath)
      state.mtimes.delete(filePath)
    },
    mkdirSync: vi.fn()
  }
}))

vi.mock('@/module/utils/OutboundRequest', () => ({
  executeSafeAxiosRequest: (...args: unknown[]) => state.executeSafeAxiosRequest(...args)
}))

vi.mock('@/module/utils/Config', () => ({
  Config: {
    request: {
      timeout: 10000,
      'User-Agent': 'Unit Test UA',
      proxy: {
        switch: false
      },
      headers: {}
    },
    app: {
      sharedCacheTtlHours: 24
    },
    x: {
      proxy: {
        switch: true,
        host: '127.0.0.1',
        port: 7890,
        protocol: 'http',
        auth: {
          username: 'x-user',
          password: 'x-pass'
        }
      }
    },
    github: {
      proxy: {
        switch: true,
        host: '127.0.0.1',
        port: 7891,
        protocol: 'https',
        auth: {
          username: 'gh-user',
          password: 'gh-pass'
        }
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

vi.mock('../src/platform/weibo/api', () => ({
  buildWeiboCredentialHeaders: vi.fn(() => ({})),
  shouldPrefetchWeiboMedia: vi.fn(() => true)
}))

const { prepareParsedPostForCardRender } = await import('../src/platform/parsedPostAssets')

const createImageResponse = (bufferText: string) => ({
  response: {
    data: Buffer.from(bufferText),
    headers: {
      'content-type': 'image/png'
    }
  }
})

describe('prepareParsedPostForCardRender', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.files = new Map()
    state.mtimes = new Map()
    state.now = Date.now()
    state.executeSafeAxiosRequest.mockResolvedValue(createImageResponse('img'))
  })

  it('localizes github render images and html inline images through the GitHub proxy', async () => {
    const post = await prepareParsedPostForCardRender({
      platform: 'github',
      platformLabel: 'GitHub',
      subtype: 'article',
      title: 'owner/repo',
      summary: 'summary',
      url: 'https://github.com/owner/repo',
      author: {
        name: 'owner',
        avatar: 'https://avatars.githubusercontent.com/u/2'
      },
      contentBlocks: [
        {
          type: 'html',
          html: '<p>README</p><img src="https://raw.githubusercontent.com/owner/repo/main/demo-2.png" alt="demo">'
        }
      ],
      images: [{ url: 'https://img.shields.io/badge/demo-green' }],
      videos: [],
      stats: [],
      meta: [],
      raw: {}
    } as any)

    expect(state.executeSafeAxiosRequest).toHaveBeenCalled()
    const firstCall = state.executeSafeAxiosRequest.mock.calls[0]?.[0]
    expect(firstCall?.proxy).toEqual({
      host: '127.0.0.1',
      port: 7891,
      protocol: 'https',
      auth: {
        username: 'gh-user',
        password: 'gh-pass'
      }
    })
    expect(post.author?.avatar).toMatch(/^data:image\/png;base64,/)
    expect(post.images[0]?.url).toMatch(/^data:image\/png;base64,/)
    expect((post.contentBlocks[0] as any).html).toContain('data:image/png;base64,')
  })

  it('reuses cached github render assets across repeated preparations', async () => {
    const sourcePost = {
      platform: 'github',
      platformLabel: 'GitHub',
      subtype: 'article',
      title: 'owner/repo',
      summary: 'summary',
      url: 'https://github.com/owner/repo',
      author: {
        name: 'owner',
        avatar: 'https://avatars.githubusercontent.com/u/1'
      },
      contentBlocks: [
        {
          type: 'html',
          html: '<p>README</p><img src="https://raw.githubusercontent.com/owner/repo/main/demo.png" alt="demo">'
        }
      ],
      images: [{ url: 'https://img.shields.io/badge/demo-blue' }],
      videos: [],
      stats: [],
      meta: [],
      raw: {}
    } as any

    await prepareParsedPostForCardRender(sourcePost)
    await prepareParsedPostForCardRender(sourcePost)

    expect(state.executeSafeAxiosRequest).toHaveBeenCalledTimes(3)
  })

  it('coalesces concurrent render asset fetches for the same URL', async () => {
    let releaseRequest: (() => void) | null = null
    state.executeSafeAxiosRequest.mockImplementation(async () => {
      await new Promise<void>(resolve => {
        releaseRequest = resolve
      })
      return createImageResponse('same-image')
    })
    const sourcePost = {
      platform: 'github',
      platformLabel: 'GitHub',
      subtype: 'article',
      title: 'owner/repo',
      summary: 'summary',
      url: 'https://github.com/owner/repo',
      contentBlocks: [],
      images: [{ url: 'https://raw.githubusercontent.com/owner/repo/main/shared.png' }],
      videos: [],
      stats: [],
      meta: [],
      raw: {}
    } as any

    const first = prepareParsedPostForCardRender(sourcePost)
    const second = prepareParsedPostForCardRender(sourcePost)
    releaseRequest?.()
    await Promise.all([first, second])

    expect(state.executeSafeAxiosRequest).toHaveBeenCalledTimes(1)
  })

  it('evicts a memory entry when its backing file was removed', async () => {
    const sourcePost = {
      platform: 'github',
      platformLabel: 'GitHub',
      subtype: 'article',
      title: 'owner/repo',
      summary: 'summary',
      url: 'https://github.com/owner/repo',
      contentBlocks: [],
      images: [{ url: 'https://raw.githubusercontent.com/owner/repo/main/removed.png' }],
      videos: [],
      stats: [],
      meta: [],
      raw: {}
    } as any

    await prepareParsedPostForCardRender(sourcePost)
    state.files = new Map()
    state.mtimes = new Map()
    await prepareParsedPostForCardRender(sourcePost)

    expect(state.executeSafeAxiosRequest).toHaveBeenCalledTimes(2)
  })

  it('evicts an expired render asset even while it is still in memory', async () => {
    const sourcePost = {
      platform: 'github',
      platformLabel: 'GitHub',
      subtype: 'article',
      title: 'owner/repo',
      summary: 'summary',
      url: 'https://github.com/owner/repo',
      contentBlocks: [],
      images: [{ url: 'https://raw.githubusercontent.com/owner/repo/main/expired.png' }],
      videos: [],
      stats: [],
      meta: [],
      raw: {}
    } as any

    await prepareParsedPostForCardRender(sourcePost)
    for (const filePath of state.files.keys()) {
      state.mtimes.set(filePath, state.now - 25 * 60 * 60 * 1000)
    }
    await prepareParsedPostForCardRender(sourcePost)

    expect(state.executeSafeAxiosRequest).toHaveBeenCalledTimes(2)
  })

  it('localizes x render images through the X proxy', async () => {
    const post = await prepareParsedPostForCardRender({
      platform: 'x',
      platformLabel: 'X',
      subtype: 'status',
      title: 'tweet',
      summary: 'tweet',
      url: 'https://x.com/user/status/1',
      author: {
        name: 'user',
        avatar: 'https://pbs.twimg.com/profile_images/test.jpg'
      },
      contentBlocks: [
        { type: 'image', url: 'https://pbs.twimg.com/media/test.jpg:orig' }
      ],
      images: [{ url: 'https://pbs.twimg.com/media/test.jpg:orig' }],
      videos: [],
      stats: [],
      meta: [],
      raw: {}
    } as any)

    expect(state.executeSafeAxiosRequest).toHaveBeenCalled()
    const firstCall = state.executeSafeAxiosRequest.mock.calls[0]?.[0]
    expect(firstCall?.proxy).toEqual({
      host: '127.0.0.1',
      port: 7890,
      protocol: 'http',
      auth: {
        username: 'x-user',
        password: 'x-pass'
      }
    })
    expect(post.author?.avatar).toMatch(/^data:image\/png;base64,/)
    expect(post.images[0]?.url).toMatch(/^data:image\/png;base64,/)
    expect((post.contentBlocks[0] as any).url).toMatch(/^data:image\/png;base64,/)
  })
})
