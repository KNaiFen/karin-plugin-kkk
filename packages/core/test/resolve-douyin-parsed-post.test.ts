import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  fetchDouyinOneWork: vi.fn(),
  getDouyinID: vi.fn(),
  fetchUserProfile: vi.fn(),
  fetchLiveRoomInfo: vi.fn(),
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn()
  }
}))

const workData = {
  data: {
    aweme_detail: {
      aweme_id: '123',
      aweme_type: 0,
      desc: '跨世纪大型回旋镖',
      preview_title: '跨世纪大型回旋镖',
      share_url: 'https://www.douyin.com/video/123',
      statistics: {
        digg_count: 1,
        comment_count: 2,
        collect_count: 3,
        share_count: 4
      },
      author: {
        nickname: '作者甲',
        avatar_thumb: {
          url_list: ['https://example.com/avatar.jpg']
        }
      },
      video: {
        bit_rate: [{
          play_addr: {
            url_list: ['https://example.com/video.mp4']
          }
        }]
      }
    }
  }
}

vi.mock('node-karin', () => ({
  logger: state.logger
}))

vi.mock('@ikenxuan/amagi', () => ({
  DynamicType: {
    AV: 'DYNAMIC_TYPE_AV'
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
      bilibili: '',
      heybox: '',
      zhihu: ''
    }
  }
}))

vi.mock('@/module/utils/amagiClient', () => ({
  amagiClient: {
    douyin: {
      fetcher: {
        fetchUserProfile: (...args: unknown[]) => state.fetchUserProfile(...args),
        fetchLiveRoomInfo: (...args: unknown[]) => state.fetchLiveRoomInfo(...args)
      }
    }
  }
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
  getBilibiliID: vi.fn()
}))

vi.mock('@/platform/douyin', () => ({
  getDouyinID: (...args: unknown[]) => state.getDouyinID(...args),
  fetchDouyinOneWork: (...args: unknown[]) => state.fetchDouyinOneWork(...args)
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
  fetchBilibiliSubtitleReferences: vi.fn(async () => [])
}))

vi.mock('@/platform/douyin/liveRecorder', () => ({
  buildDouyinLiveInfoHeaders: vi.fn(() => ({ Referer: 'https://live.douyin.com' })),
  fetchDouyinLiveDataFromReflow: vi.fn(),
  fetchDouyinLiveReflowInfo: vi.fn(),
  fetchDouyinLiveWebEnterInfo: vi.fn(async () => ({
    data: {
      data: {
        room: {
          id: '767768667211',
          status: 2,
          title: '直播间标题',
          cover: {
            url_list: ['https://example.com/live-cover.jpg']
          },
          owner: {
            nickname: '主播甲',
            web_rid: '767768667211',
            avatar_thumb: {
              url_list: ['https://example.com/live-avatar.jpg']
            }
          },
          stats: {
            total_user_str: '12.3万'
          }
        }
      }
    }
  })),
  getDouyinLiveContainer: vi.fn((input: any) => input?.data?.data ?? input?.data ?? input),
  getDouyinLiveItem: vi.fn((input: any) => input?.data?.data?.room ?? input?.data?.room ?? input?.room ?? input),
  isDouyinLiveStatusActive: vi.fn(() => true),
  selectDouyinLiveStream: vi.fn(() => ({
    url: 'https://example.com/live-stream.m3u8',
    format: 'hls',
    quality: 'HD1'
  }))
}))

const { resolveDouyinParsedPost } = await import('../src/platform/resolveParsedPost')

describe('resolveDouyinParsedPost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.getDouyinID.mockResolvedValue({
      aweme_id: '123'
    })
    state.fetchDouyinOneWork.mockResolvedValue({
      htmlWork: {
        awemeId: '123',
        subtype: 'video',
        shareUrl: 'https://www.douyin.com/video/123',
        title: '跨世纪大型回旋镖',
        desc: '跨世纪大型回旋镖',
        previewTitle: '跨世纪大型回旋镖',
        createTime: 1710000000,
        isSlides: false,
        author: {
          nickname: '作者甲',
          avatar: 'https://example.com/avatar.jpg',
          secUid: '',
          uniqueId: '',
          shortId: '',
          followerCount: 0,
          followingCount: 0,
          totalFavorited: 0
        },
        stats: {
          diggCount: 1,
          commentCount: 2,
          collectCount: 3,
          shareCount: 4,
          playCount: 0,
          recommendCount: 0
        },
        images: [],
        comments: [],
        textExtra: [],
        video: {
          playUrl: 'https://example.com/video.mp4',
          backupUrls: [],
          coverUrl: 'https://example.com/cover.jpg',
          dynamicCoverUrl: 'https://example.com/cover.jpg',
          duration: 1000,
          width: 720,
          height: 1280,
          ratio: '720:1280',
          fps: 25
        },
        raw: {
          source: 'router',
          payload: {}
        }
      },
      workData,
      source: 'html',
      enrichment: null
    })
    state.fetchUserProfile.mockReset()
    state.fetchLiveRoomInfo.mockReset()
  })

  it('uses html-first one_work fetch when resolving parsed posts', async () => {
    const result = await resolveDouyinParsedPost('https://v.douyin.com/Wdv0YPvpaYg')

    expect(state.fetchDouyinOneWork).toHaveBeenCalledWith(expect.objectContaining({
      aweme_id: '123'
    }))
    expect(result).toMatchObject({
      platform: 'douyin',
      title: '跨世纪大型回旋镖',
      url: 'https://www.douyin.com/video/123'
    })
  })

  it('unwraps broken note-video wrapper urls when building parsed posts', async () => {
    const directUrl = 'https://sf6-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/oA1uoDVLXAUIrBiszAxMNjNQBCWmwvfELEYBi3'
    const wrappedUrl = `${'https://aweme.snssdk.com/aweme/v1/playwm/?video_id='}${directUrl}&ratio=720p&line=0`

    state.fetchDouyinOneWork.mockResolvedValueOnce({
      htmlWork: {
        awemeId: '123',
        subtype: 'video',
        shareUrl: 'https://www.douyin.com/note/123',
        title: '跨世纪大型回旋镖',
        desc: '跨世纪大型回旋镖',
        previewTitle: '跨世纪大型回旋镖',
        createTime: 1710000000,
        isSlides: false,
        author: {
          nickname: '作者甲',
          avatar: 'https://example.com/avatar.jpg',
          secUid: '',
          uniqueId: '',
          shortId: '',
          followerCount: 0,
          followingCount: 0,
          totalFavorited: 0
        },
        stats: {
          diggCount: 1,
          commentCount: 2,
          collectCount: 3,
          shareCount: 4,
          playCount: 0,
          recommendCount: 0
        },
        images: [],
        comments: [],
        textExtra: [],
        video: {
          playUrl: directUrl,
          backupUrls: [],
          coverUrl: 'https://example.com/cover.jpg',
          dynamicCoverUrl: 'https://example.com/cover.jpg',
          duration: 1000,
          width: 720,
          height: 1280,
          ratio: '720:1280',
          fps: 25
        },
        raw: {
          source: 'router',
          payload: {}
        }
      },
      workData: {
        data: {
          aweme_detail: {
            ...workData.data.aweme_detail,
            share_url: 'https://www.douyin.com/note/123',
            video: {
              ...workData.data.aweme_detail.video,
              play_addr: {
                url_list: [wrappedUrl]
              },
              bit_rate: [{
                play_addr: {
                  url_list: [wrappedUrl]
                }
              }]
            }
          }
        }
      },
      source: 'html',
      enrichment: null
    })

    const result = await resolveDouyinParsedPost('https://www.douyin.com/note/123')

    expect(result.primaryVideo?.url).toBe(directUrl)
  })

  it('routes live_room_detail through live resolver without parseWork or browser fallback', async () => {
    state.getDouyinID.mockResolvedValue({
      type: 'live_room_detail',
      room_id: '767768667211'
    })

    const result = await resolveDouyinParsedPost('https://live.douyin.com/767768667211')

    expect(state.fetchDouyinOneWork).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      platform: 'douyin',
      subtype: 'live',
      title: '直播间标题',
      url: 'https://live.douyin.com/767768667211',
      author: {
        name: '主播甲'
      },
      primaryVideo: {
        url: 'https://example.com/live-stream.m3u8'
      }
    })
  })
})
