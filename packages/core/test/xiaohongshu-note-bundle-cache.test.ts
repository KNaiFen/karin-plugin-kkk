import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  files: new Map<string, string>(),
  getXiaohongshuID: vi.fn(),
  fetchNoteDetail: vi.fn()
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
    xiaohongshu: {
      videoQuality: 'adapt',
      maxAutoVideoSize: 100
    },
    cookies: {
      xiaohongshu: 'cookie'
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

vi.mock('@/module', () => ({
  baseHeaders: {}
}))

vi.mock('@/module/utils/amagiClient', () => ({
  amagiClient: {
    xiaohongshu: {
      fetcher: {
        fetchNoteDetail: (...args: unknown[]) => state.fetchNoteDetail(...args)
      }
    }
  }
}))

vi.mock('@/module/utils/ErrorTrace', () => ({
  recordFailureTraceStep: vi.fn()
}))

vi.mock('@/module/utils/GuestCookieRecovery', () => ({
  getGuestCookieRecoveryStatus: vi.fn(() => ({
    generation: 0,
    refreshInFlight: false,
    inCooldown: false,
    cooldownRemainingMs: 0
  }))
}))

vi.mock('@/platform/xiaohongshu', () => ({
  getXiaohongshuID: (...args: unknown[]) => state.getXiaohongshuID(...args)
}))

vi.mock('@/platform/xiaohongshu/xiaohongshu', () => ({
  xiaohongshuProcessVideos: vi.fn(() => null)
}))

const { fetchXiaohongshuNoteBundle } = await import('../src/platform/xiaohongshu/noteBundle')

describe('fetchXiaohongshuNoteBundle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.files = new Map()
    state.fetchNoteDetail.mockResolvedValue({
      data: {
        data: {
          items: [{
            note_card: {
              title: '笔记标题',
              desc: '正文',
              user: {
                nickname: '作者'
              },
              image_list: []
            }
          }]
        }
      }
    })
  })

  it('reuses note bundles for the same note_id even when xsec_token changes', async () => {
    const first = await fetchXiaohongshuNoteBundle({
      type: 'note',
      note_id: 'xhs123',
      xsec_token: 'token-a'
    } as any)
    const second = await fetchXiaohongshuNoteBundle({
      type: 'note',
      note_id: 'xhs123',
      xsec_token: 'token-b'
    } as any)

    expect(first).toEqual(second)
    expect(state.fetchNoteDetail).toHaveBeenCalledTimes(1)
  })

  it('does not cache an empty note detail and retries it on the next request', async () => {
    state.fetchNoteDetail
      .mockResolvedValueOnce({
        data: {
          data: {
            items: [{}]
          }
        }
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            items: [{
              note_card: {
                title: '恢复后的笔记',
                desc: '正文',
                user: { nickname: '作者' },
                image_list: []
              }
            }]
          }
        }
      })

    await expect(fetchXiaohongshuNoteBundle({
      note_id: 'xhs-empty-note',
      xsec_token: 'token-a'
    })).rejects.toMatchObject({
      code: 'XIAOHONGSHU_NOTE_DETAIL_EMPTY',
      retryable: true
    })

    await expect(fetchXiaohongshuNoteBundle({
      note_id: 'xhs-empty-note',
      xsec_token: 'token-b'
    })).resolves.toMatchObject({
      data: {
        data: {
          items: [{
            note_card: { title: '恢复后的笔记' }
          }]
        }
      }
    })

    expect(state.fetchNoteDetail).toHaveBeenCalledTimes(2)
  })
})
