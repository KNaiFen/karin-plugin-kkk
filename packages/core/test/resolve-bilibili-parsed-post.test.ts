import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  fetchVideoInfo: vi.fn(),
  fetchVideoStreamUrl: vi.fn(),
  fetchDynamicDetail: vi.fn(),
  fetchBilibiliOneVideoBundle: vi.fn(),
  fetchBilibiliDynamicBundle: vi.fn(),
  fetchBilibiliSubtitleReferences: vi.fn(),
  getBilibiliID: vi.fn(),
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('node-karin', () => ({
  logger: state.logger
}))

vi.mock('@ikenxuan/amagi', () => ({
  DynamicType: {
    AV: 'DYNAMIC_TYPE_AV',
    ARTICLE: 'DYNAMIC_TYPE_ARTICLE',
    LIVE_RCMD: 'DYNAMIC_TYPE_LIVE_RCMD'
  }
}))

vi.mock('@/module', () => ({
  baseHeaders: {
    'User-Agent': 'Unit Test UA'
  }
}))

vi.mock('@/module/utils/Config', () => ({
  Config: {
    cookies: {
      bilibili: 'SESSDATA=test',
      heybox: '',
      zhihu: '',
      wechat: '',
      weibo: ''
    }
  }
}))

vi.mock('@/module/utils/amagiClient', () => ({
  amagiClient: {
    bilibili: {
      fetcher: {
        fetchVideoInfo: (...args: unknown[]) => state.fetchVideoInfo(...args),
        fetchVideoStreamUrl: (...args: unknown[]) => state.fetchVideoStreamUrl(...args),
        fetchDynamicDetail: (...args: unknown[]) => state.fetchDynamicDetail(...args)
      }
    },
    douyin: {
      fetcher: {
        parseWork: vi.fn()
      }
    }
  }
}))

vi.mock('@/platform/bilibili/bundle', () => ({
  fetchBilibiliOneVideoBundle: (...args: unknown[]) => state.fetchBilibiliOneVideoBundle(...args),
  fetchBilibiliDynamicBundle: (...args: unknown[]) => state.fetchBilibiliDynamicBundle(...args)
}))

vi.mock('@/module/utils/DouyinBrowserFallback', () => ({
  fetchDouyinWorkByBrowser: vi.fn()
}))

vi.mock('@/platform/heybox/api', () => ({
  fetchHeyboxDetail: vi.fn()
}))

vi.mock('@/platform/tieba/api', () => ({
  getTiebaContentText: vi.fn(),
  getTiebaPostDetail: vi.fn(),
  tiebaMediaHeaders: vi.fn(() => ({}))
}))

vi.mock('@/platform/tiktok/api', () => ({
  fetchTikTokVideoDetail: vi.fn()
}))

vi.mock('@/platform/weibo/api', () => ({
  fetchWeiboDetail: vi.fn()
}))

vi.mock('@/platform/weibo/summaryBlocks', () => ({
  buildWeiboShowCard: vi.fn(),
  buildWeiboStatusCard: vi.fn(),
  pickPrimaryVideo: vi.fn()
}))

vi.mock('@/platform/x/api', () => ({
  fetchXDetail: vi.fn()
}))

vi.mock('@/platform/x/summaryBlocks', () => ({
  buildXExternalPostCard: vi.fn(),
  pickPrimaryVideo: vi.fn()
}))

vi.mock('@/platform/xiaohongshu/xiaohongshu', () => ({
  xiaohongshuProcessVideos: vi.fn()
}))

vi.mock('@/platform/zhihu/api', () => ({
  fetchZhihuDetail: vi.fn()
}))

vi.mock('@/platform/bilibili', () => ({
  getBilibiliID: (...args: unknown[]) => state.getBilibiliID(...args)
}))

vi.mock('@/platform/douyin', () => ({
  getDouyinID: vi.fn()
}))

vi.mock('@/platform/kuaishou', () => ({
  fetchKuaishouData: vi.fn(),
  getKuaishouID: vi.fn()
}))

vi.mock('@/platform/heybox', () => ({
  getHeyboxID: vi.fn()
}))

vi.mock('@/platform/tieba', () => ({
  getTiebaID: vi.fn()
}))

vi.mock('@/platform/tiktok', () => ({
  getTikTokID: vi.fn()
}))

vi.mock('@/platform/wechat', () => ({
  getWechatID: vi.fn(),
  fetchWechatArticleDetail: vi.fn()
}))

vi.mock('@/platform/weibo', () => ({
  getWeiboID: vi.fn()
}))

vi.mock('@/platform/x', () => ({
  getXID: vi.fn()
}))

vi.mock('@/platform/xiaohongshu', () => ({
  getXiaohongshuID: vi.fn()
}))

vi.mock('@/platform/zhihu', () => ({
  getZhihuID: vi.fn()
}))

vi.mock('@/module/summaryParse/bilibiliSubtitles', () => ({
  fetchBilibiliSubtitleReferences: (...args: unknown[]) => state.fetchBilibiliSubtitleReferences(...args)
}))

const { resolveBilibiliParsedPost } = await import('../src/platform/resolveParsedPost')

describe('resolveBilibiliParsedPost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.fetchBilibiliSubtitleReferences.mockResolvedValue([])
    state.fetchVideoStreamUrl.mockResolvedValue({
      data: {
        data: {
          dash: {
            video: [{ base_url: 'https://example.com/video.m4s' }],
            audio: [{ base_url: 'https://example.com/audio.m4a' }]
          },
          durl: []
        }
      }
    })
  })

  it('requests subtitles with the selected normal-video bundle', async () => {
    state.getBilibiliID.mockResolvedValue({
      type: 'one_video',
      bvid: 'BV1xx411c7mD',
      p: 2
    })
    state.fetchBilibiliOneVideoBundle.mockResolvedValue({
      infoData: {
        data: {
          data: {
            aid: 112233,
            bvid: 'BV1xx411c7mD',
            cid: 90001,
            title: '测试视频',
            desc: '测试简介',
            duration: 84,
            owner: { name: '测试作者' },
            stat: {},
            tname: '知识',
            pages: [
              { cid: 90001, duration: 42 },
              { cid: 90002, duration: 84 }
            ]
          }
        }
      },
      selectedCid: 90002,
      selectedPage: 2,
      subtitles: [],
      playUrlData: {
        data: {
          data: {
            dash: {
              video: [{ base_url: 'https://example.com/video.m4s' }],
              audio: [{ base_url: 'https://example.com/audio.m4a' }]
            },
            durl: []
          }
        }
      }
    })

    const parsedPost = await resolveBilibiliParsedPost('https://www.bilibili.com/video/BV1xx411c7mD?p=2')

    expect(state.fetchBilibiliOneVideoBundle).toHaveBeenCalledWith({
      bvid: 'BV1xx411c7mD',
      p: 2,
      cid: undefined
    }, {
      infoData: true,
      playUrlData: true,
      subtitles: true
    })
    expect(parsedPost.raw).toMatchObject({
      selectedCid: 90002,
      selectedPage: 2
    })
  })

  it('requests subtitles with the AV dynamic bundle', async () => {
    state.getBilibiliID.mockResolvedValue({
      type: 'dynamic_info',
      dynamic_id: '123456'
    })
    state.fetchBilibiliDynamicBundle.mockResolvedValue({
      dynamicDetail: {
        data: {
          item: {
            id_str: '123456',
            type: 'DYNAMIC_TYPE_AV',
            modules: {
              module_author: {
                name: '测试 UP',
                face: 'https://example.com/avatar.jpg'
              },
              module_dynamic: {
                major: {
                  archive: {
                    aid: 223344,
                    bvid: 'BV1yy411c7mD',
                    title: '动态视频标题',
                    desc: '动态视频简介',
                    jump_url: 'https://www.bilibili.com/video/BV1yy411c7mD'
                  }
                }
              },
              module_stat: {
                forward: { count: 1 },
                like: { count: 2 },
                comment: { count: 3 }
              }
            }
          }
        }
      },
      avVideoInfo: {
        data: {
          data: {
            aid: 223344,
            bvid: 'BV1yy411c7mD',
            cid: 70001,
            duration: 120
          }
        }
      },
      avPlayUrlData: {
        data: {
          data: {
            dash: {
              video: [{ base_url: 'https://example.com/video.m4s' }],
              audio: [{ base_url: 'https://example.com/audio.m4a' }]
            },
            durl: []
          }
        }
      },
      avSubtitles: []
    })

    await resolveBilibiliParsedPost('https://t.bilibili.com/123456')

    expect(state.fetchBilibiliDynamicBundle).toHaveBeenCalledWith({
      dynamic_id: '123456'
    }, {
      dynamicDetail: true,
      avVideoInfo: true,
      avPlayUrlData: true,
      avSubtitles: true
    })
  })
})
