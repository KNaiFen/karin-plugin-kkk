import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  files: new Map<string, string>(),
  axiosGet: vi.fn(),
  parseWork: vi.fn(),
  fetchBrowserHtmlWork: vi.fn()
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

vi.mock('@/module/utils/Config', () => ({
  Config: {
    app: {
      sharedCacheTtlHours: 24
    },
    cookies: {
      douyin: 'cookie'
    },
    request: {
      headers: {}
    }
  }
}))

vi.mock('node:fs', () => ({
  default: {
    existsSync: (filePath: string) => state.files.has(filePath),
    mkdirSync: vi.fn(),
    readFileSync: (filePath: string) => state.files.get(filePath) ?? '',
    writeFileSync: (filePath: string, content: string) => {
      state.files.set(filePath, String(content))
    },
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({ isDirectory: () => false, birthtimeMs: Date.now(), mtimeMs: Date.now() })),
    unlinkSync: vi.fn(),
    rmdirSync: vi.fn()
  }
}))

vi.mock('node-karin', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('node-karin/axios', () => ({
  default: {
    get: (...args: unknown[]) => state.axiosGet(...args)
  }
}))

vi.mock('@/module/utils/amagiClient', () => ({
  amagiClient: {
    douyin: {
      fetcher: {
        parseWork: (...args: unknown[]) => state.parseWork(...args)
      }
    }
  }
}))

vi.mock('@/module/utils/DouyinBrowserFallback', () => ({
  fetchDouyinHtmlWorkByBrowser: (...args: unknown[]) => state.fetchBrowserHtmlWork(...args)
}))

vi.mock('@/module/utils/RequestConfig', () => ({
  buildConfiguredRequestOptions: vi.fn(() => ({
    headers: {}
  }))
}))

vi.mock('@/module/utils/ErrorTrace', () => ({
  persistFailureTrace: vi.fn(),
  recordFailureTraceStep: vi.fn()
}))

const { fetchDouyinOneWork } = await import('../src/platform/douyin/oneWork')

describe('fetchDouyinOneWork shared bundle cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.files = new Map()
    state.axiosGet.mockRejectedValue(new Error('network fail'))
    state.fetchBrowserHtmlWork.mockResolvedValue({
      awemeId: '718181',
      subtype: 'video',
      title: '测试抖音视频',
      previewTitle: '测试抖音视频',
      description: '测试抖音视频',
      desc: '测试抖音视频',
      shareUrl: 'https://www.douyin.com/video/718181',
      createTime: 1710000000,
      isSlides: false,
      images: [],
      author: {
        nickname: '作者',
        secUid: 'sec-uid',
        uniqueId: 'author-id',
        shortId: 'author-short',
        followerCount: 10,
        followingCount: 2,
        totalFavorited: 88,
        avatar: 'https://cdn.example.com/avatar.jpg'
      },
      stats: {
        playCount: 99,
        commentCount: 1,
        diggCount: 2,
        collectCount: 4,
        shareCount: 3,
        recommendCount: 5
      },
      video: {
        playUrl: 'https://cdn.example.com/video.mp4',
        backupUrls: ['https://cdn.example.com/video.mp4?backup=1'],
        coverUrl: 'https://cdn.example.com/cover.jpg',
        width: 720,
        height: 1280
      }
    })
    state.parseWork.mockResolvedValue({
      data: {
        aweme_detail: {
          aweme_id: '718181',
          aweme_type: 0,
          share_url: 'https://www.douyin.com/video/718181',
          desc: '测试抖音视频',
          author: {
            nickname: '作者'
          },
          statistics: {
            comment_count: 1,
            digg_count: 2,
            share_count: 3
          },
          video: {
            play_addr: {
              url_list: ['https://cdn.example.com/video.mp4']
            }
          }
        }
      }
    })
  })

  it('reuses the one_work bundle on repeated calls for the same aweme_id', async () => {
    const idData = {
      aweme_id: '718181',
      resolvedUrl: 'https://www.douyin.com/video/718181',
      typeHint: 'video'
    } as any

    const first = await fetchDouyinOneWork(idData)
    const axiosCallsAfterFirst = state.axiosGet.mock.calls.length
    const second = await fetchDouyinOneWork({
      ...idData,
      resolvedUrl: 'https://www.douyin.com/video/718181?share_token=changed'
    })

    expect(first).toEqual(second)
    expect(state.axiosGet).toHaveBeenCalledTimes(axiosCallsAfterFirst)
    expect(state.parseWork).toHaveBeenCalledTimes(0)
    expect(state.fetchBrowserHtmlWork).toHaveBeenCalledTimes(1)
    expect(Array.from(state.files.keys())).toContain(
      '/tmp/shared-cache/work-bundle/douyin_one_work_v4_718181.json'
    )
  })
})
