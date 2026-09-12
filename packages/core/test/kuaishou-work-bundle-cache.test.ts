import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  files: new Map<string, string>(),
  fetchVideoWork: vi.fn(),
  fetchWorkComments: vi.fn(),
  fetchEmojiList: vi.fn()
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
    renameSync: (source: string, target: string) => {
      const content = state.files.get(source)
      if (content === undefined) throw new Error('missing source')
      state.files.set(target, content)
      state.files.delete(source)
    },
    rmSync: (filePath: string) => {
      state.files.delete(filePath)
    },
    unlinkSync: vi.fn(),
    rmdirSync: vi.fn()
  }
}))

vi.mock('@/module/utils/amagiClient', () => ({
  kuaishouFetcher: {
    fetchVideoWork: (...args: unknown[]) => state.fetchVideoWork(...args),
    fetchWorkComments: (...args: unknown[]) => state.fetchWorkComments(...args),
    fetchEmojiList: (...args: unknown[]) => state.fetchEmojiList(...args)
  }
}))

const { fetchKuaishouData } = await import('../src/platform/kuaishou/getdata')

describe('fetchKuaishouData shared bundle cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.files = new Map()
    state.fetchVideoWork.mockResolvedValue({ success: true, data: { data: { visionVideoDetail: { status: 1, photo: { photoUrl: 'https://example.com/video.mp4' } } } } })
    state.fetchWorkComments.mockResolvedValue({ success: true, data: { data: { visionCommentList: { rootComments: [] } } } })
    state.fetchEmojiList.mockResolvedValue({ success: true, data: { data: { visionBaseEmoticons: { iconUrls: { '[smile]': '//example.com/smile.png' } } } } })
  })

  it('reuses the one_work bundle on repeated calls for the same photoId', async () => {
    const first = await fetchKuaishouData('one_work', { photoId: 'abc123' })
    const second = await fetchKuaishouData('one_work', { photoId: 'abc123' })

    expect(first).toEqual(second)
    expect(state.fetchVideoWork).toHaveBeenCalledTimes(1)
    expect(state.fetchWorkComments).toHaveBeenCalledTimes(1)
    expect(state.fetchEmojiList).toHaveBeenCalledTimes(1)
  })

  it('does not cache a temporary strict API failure and retries after recovery', async () => {
    state.fetchVideoWork
      .mockResolvedValueOnce({
        success: false,
        code: 401,
        message: 'cookie expired',
        error: 'UNAUTHORIZED'
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          data: {
            visionVideoDetail: {
              status: 1,
              photo: { photoUrl: 'https://example.com/recovered.mp4' }
            }
          }
        }
      })

    const first = await fetchKuaishouData('one_work', { photoId: 'recover-video' })
    const second = await fetchKuaishouData('one_work', { photoId: 'recover-video' })

    expect(first.VideoData.success).toBe(false)
    expect(second.VideoData.success).toBe(true)
    expect(state.fetchVideoWork).toHaveBeenCalledTimes(2)
    expect(state.fetchWorkComments).toHaveBeenCalledTimes(2)
    expect(state.fetchEmojiList).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['comments', 'fetchWorkComments', {
      success: true,
      data: { data: {} }
    }],
    ['emoji', 'fetchEmojiList', {
      success: true,
      data: { data: { visionBaseEmoticons: null } }
    }]
  ] as const)('does not cache an invalid %s payload', async (_label, method, failure) => {
    state[method].mockResolvedValueOnce(failure)

    await fetchKuaishouData('one_work', { photoId: `recover-${method}` })
    await fetchKuaishouData('one_work', { photoId: `recover-${method}` })

    expect(state[method]).toHaveBeenCalledTimes(2)
  })
})
