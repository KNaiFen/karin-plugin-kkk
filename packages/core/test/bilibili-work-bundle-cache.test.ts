import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  files: new Map<string, string>(),
  fetchVideoInfo: vi.fn(),
  fetchVideoStreamUrl: vi.fn(),
  fetchDynamicDetail: vi.fn(),
  fetchUserCard: vi.fn(),
  fetchComments: vi.fn(),
  fetchEmojiList: vi.fn(),
  fetchArticleInfo: vi.fn(),
  fetchArticleContent: vi.fn(),
  fetchBilibiliSubtitleReferences: vi.fn()
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
    bilibili: {
      numcomment: 20
    },
    cookies: {
      bilibili: 'SESSDATA=test'
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
  baseHeaders: {
    'User-Agent': 'kkk-test'
  }
}))

vi.mock('@/module/utils', () => ({
  baseHeaders: {
    'User-Agent': 'kkk-test'
  },
  Networks: class {
    async getData () {
      return {
        data: {
          accept_description: ['360P'],
          durl: [{ url: 'https://cdn.example.com/html5.mp4', size: 1024 }]
        }
      }
    }
  }
}))

vi.mock('@/module/utils/amagiClient', () => ({
  amagiClient: {
    bilibili: {
      fetcher: {
        fetchVideoInfo: (...args: unknown[]) => state.fetchVideoInfo(...args),
        fetchVideoStreamUrl: (...args: unknown[]) => state.fetchVideoStreamUrl(...args),
        fetchDynamicDetail: (...args: unknown[]) => state.fetchDynamicDetail(...args),
        fetchUserCard: (...args: unknown[]) => state.fetchUserCard(...args),
        fetchComments: (...args: unknown[]) => state.fetchComments(...args),
        fetchEmojiList: (...args: unknown[]) => state.fetchEmojiList(...args),
        fetchArticleInfo: (...args: unknown[]) => state.fetchArticleInfo(...args),
        fetchArticleContent: (...args: unknown[]) => state.fetchArticleContent(...args)
      }
    }
  },
  SOFT_ERROR_CODES: {
    BILIBILI_COMMENTS_DISABLED: 'BILIBILI_COMMENTS_DISABLED'
  },
  softFetch: async (loader: () => Promise<unknown>) => await loader()
}))

vi.mock('@/module/summaryParse/bilibiliSubtitles', () => ({
  fetchBilibiliSubtitleReferences: (...args: unknown[]) => state.fetchBilibiliSubtitleReferences(...args)
}))

vi.mock('node-karin', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('@ikenxuan/amagi', () => ({
  DynamicType: {
    AV: 'DYNAMIC_TYPE_AV',
    ARTICLE: 'DYNAMIC_TYPE_ARTICLE',
    LIVE_RCMD: 'DYNAMIC_TYPE_LIVE_RCMD'
  }
}))

const { fetchBilibiliOneVideoBundle, fetchBilibiliDynamicBundle } = await import('../src/platform/bilibili/bundle')

describe('bilibili shared work bundle cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.files = new Map()

    state.fetchVideoInfo.mockResolvedValue({
      data: {
        data: {
          aid: 101,
          bvid: 'BVbundle123',
          cid: 201,
          duration: 60,
          pages: [
            { cid: 201, duration: 60 },
            { cid: 202, duration: 66 }
          ],
          owner: {
            mid: 999
          }
        }
      }
    })
    state.fetchVideoStreamUrl.mockResolvedValue({
      data: {
        data: {
          dash: {
            video: [{ base_url: 'https://cdn.example.com/video.m4s' }],
            audio: [{ base_url: 'https://cdn.example.com/audio.m4s' }]
          }
        }
      }
    })
    state.fetchDynamicDetail.mockResolvedValue({
      data: {
        item: {
          id_str: 'dyn-article-1',
          basic: {
            rid_str: 'cv123'
          },
          type: 'DYNAMIC_TYPE_ARTICLE',
          modules: {
            module_author: {
              mid: 321
            },
            module_dynamic: {
              major: {
                opus: {
                  title: '专栏动态'
                }
              }
            }
          }
        }
      }
    })
    state.fetchUserCard.mockResolvedValue({
      data: {
        data: {
          card: {
            mid: 321,
            name: '作者'
          }
        }
      }
    })
    state.fetchComments.mockResolvedValue({
      data: {
        data: {
          replies: []
        }
      }
    })
    state.fetchEmojiList.mockResolvedValue({
      data: {
        data: {
          packages: []
        }
      }
    })
    state.fetchArticleInfo.mockResolvedValue({
      data: {
        data: {
          title: '文章信息'
        }
      }
    })
    state.fetchArticleContent.mockResolvedValue({
      data: {
        id: 123,
        title: '文章内容'
      }
    })
    state.fetchBilibiliSubtitleReferences.mockResolvedValue([{
      source: 'bilibili',
      language: 'zh-CN',
      label: '中文'
    }])
  })

  it('merges missing one_video fields into the same bundle without refetching existing detail', async () => {
    const idData = {
      type: 'one_video',
      bvid: 'BVbundle123',
      p: 1
    } as any

    const first = await fetchBilibiliOneVideoBundle(idData, {
      infoData: true
    })
    const second = await fetchBilibiliOneVideoBundle(idData, {
      infoData: true,
      playUrlData: true,
      subtitles: true
    })
    const third = await fetchBilibiliOneVideoBundle(idData, {
      infoData: true,
      playUrlData: true,
      subtitles: true
    })

    expect(first.infoData?.data?.data?.bvid).toBe('BVbundle123')
    expect(second.playUrlData?.data?.data?.dash?.video?.[0]?.base_url).toBe('https://cdn.example.com/video.m4s')
    expect(second.subtitles).toHaveLength(1)
    expect(third).toEqual(second)
    expect(state.fetchVideoInfo).toHaveBeenCalledTimes(1)
    expect(state.fetchVideoStreamUrl).toHaveBeenCalledTimes(1)
    expect(state.fetchBilibiliSubtitleReferences).toHaveBeenCalledTimes(1)
  })

  it('does not share one_video bundles across different pages of the same bvid', async () => {
    await fetchBilibiliOneVideoBundle({
      type: 'one_video',
      bvid: 'BVbundle123',
      p: 1
    } as any, {
      infoData: true
    })

    await fetchBilibiliOneVideoBundle({
      type: 'one_video',
      bvid: 'BVbundle123',
      p: 2
    } as any, {
      infoData: true
    })

    expect(state.fetchVideoInfo).toHaveBeenCalledTimes(2)
  })

  it('merges missing dynamic article fields into the same bundle without refetching dynamic detail', async () => {
    const idData = {
      type: 'dynamic_info',
      dynamic_id: 'dyn-article-1'
    } as any

    const first = await fetchBilibiliDynamicBundle(idData, {
      dynamicDetail: true
    })
    const second = await fetchBilibiliDynamicBundle(idData, {
      dynamicDetail: true,
      userCardData: true,
      commentsData: true,
      emojiData: true,
      articleInfoBase: true,
      articleContent: true
    })
    const third = await fetchBilibiliDynamicBundle(idData, {
      dynamicDetail: true,
      userCardData: true,
      commentsData: true,
      emojiData: true,
      articleInfoBase: true,
      articleContent: true
    })

    expect(first.dynamicDetail?.data?.item?.id_str).toBe('dyn-article-1')
    expect(second.userCardData?.data?.data?.card?.name).toBe('作者')
    expect(second.articleInfoBase?.data?.data?.title).toBe('文章信息')
    expect(second.articleContent?.data?.title).toBe('文章内容')
    expect(third).toEqual(second)
    expect(state.fetchDynamicDetail).toHaveBeenCalledTimes(1)
    expect(state.fetchUserCard).toHaveBeenCalledTimes(1)
    expect(state.fetchComments).toHaveBeenCalledTimes(1)
    expect(state.fetchEmojiList).toHaveBeenCalledTimes(1)
    expect(state.fetchArticleInfo).toHaveBeenCalledTimes(1)
    expect(state.fetchArticleContent).toHaveBeenCalledTimes(1)
  })

  it('normalizes cached dynamic detail payloads that were nested one level deeper', async () => {
    state.files.set(
      '/tmp/shared-cache/work-bundle/bilibili_dynamic_dyn-nested.json',
      JSON.stringify({
        dynamicDetail: {
          data: {
            data: {
              item: {
                id_str: 'dyn-nested',
                basic: {
                  rid_str: 'cv999'
                },
                type: 'DYNAMIC_TYPE_DRAW',
                modules: {
                  module_author: {
                    mid: 654
                  },
                  module_dynamic: {
                    major: {
                      opus: {
                        title: '旧缓存图文动态'
                      }
                    }
                  }
                }
              }
            }
          }
        },
        dynamicType: 'DYNAMIC_TYPE_DRAW'
      })
    )

    const result = await fetchBilibiliDynamicBundle({
      type: 'dynamic_info',
      dynamic_id: 'dyn-nested'
    } as any, {
      dynamicDetail: true
    })

    expect(result.dynamicDetail?.data?.item?.id_str).toBe('dyn-nested')
    expect(result.dynamicType).toBe('DYNAMIC_TYPE_DRAW')
    expect(state.fetchDynamicDetail).not.toHaveBeenCalled()
  })

  it('does not persist LIVE_RCMD dynamic bundles as reusable work cache', async () => {
    state.fetchDynamicDetail.mockResolvedValue({
      data: {
        item: {
          id_str: 'dyn-live-1',
          basic: {
            rid_str: 'live-1'
          },
          type: 'DYNAMIC_TYPE_LIVE_RCMD',
          modules: {
            module_author: {
              mid: 456
            },
            module_dynamic: {
              major: {
                live_rcmd: {
                  content: '{}'
                }
              }
            }
          }
        }
      }
    })

    await fetchBilibiliDynamicBundle({
      type: 'dynamic_info',
      dynamic_id: 'dyn-live-1'
    } as any, {
      dynamicDetail: true
    })
    await fetchBilibiliDynamicBundle({
      type: 'dynamic_info',
      dynamic_id: 'dyn-live-1'
    } as any, {
      dynamicDetail: true
    })

    expect(state.fetchDynamicDetail).toHaveBeenCalledTimes(2)
  })
})
