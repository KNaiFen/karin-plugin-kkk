import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const parseWork = vi.fn()
  const fetchDouyinOneWork = vi.fn()
  const fetchDouyinWorkByBrowser = vi.fn()
  const replyPlainVideoTitle = vi.fn(async () => true)
  const processImageUrl = vi.fn(async (url: string) => url)
  const reply = vi.fn()
  const resolveDouyinParsedPostFromWorkData = vi.fn(async (_url: string, workData: any) => ({
    platform: 'douyin',
    platformLabel: '抖音',
    subtype: 'video',
    title: workData.data.aweme_detail.desc,
    author: {
      name: workData.data.aweme_detail.author.nickname
    },
    summary: workData.data.aweme_detail.desc,
    url: workData.data.aweme_detail.share_url,
    contentBlocks: [{ type: 'text', text: workData.data.aweme_detail.desc }],
    images: [],
    videos: [{
      url: workData.data.aweme_detail.video.bit_rate[0].play_addr.url_list[0],
      title: workData.data.aweme_detail.desc
    }],
    primaryVideo: {
      url: workData.data.aweme_detail.video.bit_rate[0].play_addr.url_list[0],
      title: workData.data.aweme_detail.desc
    },
    stats: [],
    meta: [],
    raw: {
      detail: workData
    }
  }))

  return {
    parseWork,
    fetchDouyinOneWork,
    fetchDouyinWorkByBrowser,
    replyPlainVideoTitle,
    processImageUrl,
    reply,
    resolveDouyinParsedPostFromWorkData
  }
})

const workData = {
  data: {
    aweme_detail: {
      aweme_id: '123',
      aweme_type: 0,
      desc: '跨世纪大型回旋镖',
      preview_title: '跨世纪大型回旋镖',
      share_url: 'https://www.douyin.com/video/123',
      create_time: 1710000000,
      is_slides: false,
      statistics: {
        digg_count: 1,
        share_count: 2,
        collect_count: 3,
        comment_count: 4,
        recommend_count: 5
      },
      author: {
        nickname: '作者甲',
        sec_uid: 'sec_uid_1',
        short_id: 'short',
        unique_id: 'unique',
        avatar_thumb: {
          url_list: ['https://example.com/avatar.jpg']
        }
      },
      video: {
        bit_rate: [{
          FPS: 30,
          format: 'mp4',
          gear_name: '1080p',
          play_addr: {
            data_size: 1024,
            url_list: ['https://example.com/video.mp4']
          }
        }],
        animated_cover: {
          url_list: ['https://example.com/cover.gif']
        },
        cover: {
          url_list: ['https://example.com/cover.jpg']
        },
        cover_original_scale: {
          url_list: ['https://example.com/cover-origin.jpg'],
          width: 1080,
          height: 1920
        }
      }
    }
  }
}

vi.mock('node-karin', () => ({
  default: {},
  common: {
    makeForward: vi.fn()
  },
  logger: {
    blue: (value: unknown) => String(value),
    debug: vi.fn(),
    error: vi.fn(),
    green: (value: unknown) => String(value),
    info: vi.fn(),
    mark: vi.fn(),
    warn: vi.fn(),
    yellow: (value: unknown) => String(value)
  },
  Message: class {},
  mkdirSync: vi.fn(),
  segment: {
    image: vi.fn((file: string) => ({ type: 'image', file })),
    record: vi.fn(),
    text: vi.fn((text: string) => ({ type: 'text', text }))
  }
}))

vi.mock('@/module/utils/Config', () => ({
  Config: {
    app: {
      parseTip: false,
      removeCache: true
    },
    douyin: {
      sendContent: ['info'],
      displayContent: ['title', 'stats'],
      videoInfoMode: 'text',
      plainTitleReply: {
        switch: false,
        types: ['video', 'image', 'article', 'live']
      },
      commentImageCollection: false,
      numcomment: 0,
      subCommentLimit: 0,
      videoQuality: 'adapt',
      maxAutoVideoSize: 50,
      burnDanmaku: false,
      danmakuArea: 0.5,
      danmakuFontSize: 'medium',
      danmakuOpacity: 80,
      verticalMode: 'off',
      videoCodec: 'h264',
      liveImageMergeMode: 'independent',
      liveQuality: 'auto',
      liveRecordSeconds: 10
    },
    upload: {
      groupfilevalue: 100,
      compress: false,
      compressPreset: '',
      compressCustomArgs: '',
      usefilelimit: false
    }
  }
}))

vi.mock('@/module/utils', () => ({
  Base: class {
    e: any
    headers = {}
    amagi = {
      douyin: {
        fetcher: {
          parseWork: state.parseWork,
          fetchWorkComments: vi.fn(async () => ({ comments: [] })),
          fetchUserProfile: vi.fn(async () => ({
            success: true,
            data: {
              user: {
                ip_location: '',
                follower_count: 0,
                total_favorited: 0,
                aweme_count: 0,
                gender: 0,
                user_age: 0
              }
            }
          }))
        }
      }
    }

    constructor (e: any) {
      this.e = e
    }
  },
  baseHeaders: {},
  buildGoogleMotionPhoto: vi.fn(),
  Common: {
    tempDri: {
      images: '/tmp/',
      video: '/tmp/'
    }
  },
  Count: (value: unknown) => String(value),
  createPlainVideoTitleContext: vi.fn(() => ({ enabled: false, platformLabel: '抖音', sent: false })),
  downloadFile: vi.fn(),
  downloadVideo: vi.fn(),
  fetchDouyinWorkByBrowser: state.fetchDouyinWorkByBrowser,
  fileInfo: class {},
  loopVideoWithTransition: vi.fn(),
  Networks: class {},
  processImageUrl: state.processImageUrl,
  recordFailureTraceStep: vi.fn(),
  Render: vi.fn(),
  replyPlainVideoTitle: state.replyPlainVideoTitle,
  replyRenderedImages: vi.fn(),
  uploadFile: vi.fn()
}))

vi.mock('@/module/utils/Base', () => ({
  Base: class {
    e: any
    headers = {}
    amagi = {
      douyin: {
        fetcher: {
          parseWork: state.parseWork,
          fetchWorkComments: vi.fn(async () => ({ comments: [] })),
          fetchUserProfile: vi.fn(async () => ({
            success: true,
            data: {
              user: {
                ip_location: '',
                follower_count: 0,
                total_favorited: 0,
                aweme_count: 0,
                gender: 0,
                user_age: 0
              }
            }
          }))
        }
      }
    }

    constructor (e: any) {
      this.e = e
    }
  },
  downloadFile: vi.fn(),
  downloadVideo: vi.fn(),
  uploadFile: vi.fn()
}))

vi.mock('@/module/utils/EmojiReaction', () => ({
  EmojiReactionManager: class {},
  getEmojiId: vi.fn()
}))

vi.mock('@/platform/douyin', () => ({
  douyinComments: vi.fn(() => [])
}))

vi.mock('@/platform/douyin/comments', () => ({
  douyinComments: vi.fn(() => [])
}))

vi.mock('@/platform/douyin/oneWork', () => ({
  fetchDouyinOneWork: (...args: unknown[]) => state.fetchDouyinOneWork(...args)
}))

vi.mock('@/platform/douyin/danmaku', () => ({
  burnDouyinDanmaku: vi.fn()
}))

vi.mock('@/platform/douyin/liveRecorder', () => ({
  buildDouyinLiveInfoHeaders: vi.fn(),
  buildDouyinLiveRecordHeaders: vi.fn(),
  fetchDouyinLiveDataFromReflow: vi.fn(),
  fetchDouyinLiveReflowInfo: vi.fn(),
  fetchDouyinLiveWebEnterInfo: vi.fn(),
  getDouyinLiveContainer: vi.fn(),
  getDouyinLiveItem: vi.fn(),
  isDouyinLiveStatusActive: vi.fn(),
  normalizeDouyinLiveQuality: vi.fn(),
  normalizeDouyinLiveRecordSeconds: vi.fn(),
  recordDouyinLiveStream: vi.fn(),
  selectDouyinLiveStream: vi.fn()
}))

vi.mock('@/platform/resolveParsedPost', () => ({
  resolveDouyinParsedPostFromWorkData: state.resolveDouyinParsedPostFromWorkData
}))

const { DouYin } = await import('../src/platform/douyin/douyin')

describe('douyin parsed post regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.parseWork.mockRejectedValue(new Error('parse failed'))
    state.fetchDouyinOneWork.mockResolvedValue({
      htmlWork: {
        awemeId: '123',
        subtype: 'video'
      },
      workData,
      source: 'html',
      enrichment: null
    })
    state.reply.mockReset()
  })

  it('reuses one_work 聚合结果而不是再次直连 parseWork', async () => {
    const event = { reply: state.reply, messageId: '1' } as any

    await new DouYin(event, { type: 'one_work', aweme_id: '123' } as any)
      .DouyinHandler({ type: 'one_work', aweme_id: '123' } as any)

    expect(state.fetchDouyinOneWork).toHaveBeenCalledTimes(1)
    expect(state.parseWork).not.toHaveBeenCalled()
    expect(state.fetchDouyinWorkByBrowser).not.toHaveBeenCalled()
    expect(state.replyPlainVideoTitle).toHaveBeenCalledWith(
      event,
      expect.anything(),
      '跨世纪大型回旋镖',
      '作者甲',
      'video'
    )
  })

  it('respects displayContent in text info mode after parsed post refactor', async () => {
    const event = { reply: state.reply, messageId: '1' } as any

    await new DouYin(event, { type: 'one_work', aweme_id: '123' } as any)
      .DouyinHandler({ type: 'one_work', aweme_id: '123' } as any)

    expect(state.processImageUrl).not.toHaveBeenCalled()
    const payload = state.reply.mock.calls[0]?.[0]
    expect(payload).toHaveLength(2)
    expect(payload[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('标题: 跨世纪大型回旋镖')
    })
    expect(payload[1]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('评论: 4')
    })
    expect(payload.some((item: any) => item.type === 'image')).toBe(false)
    expect(payload.some((item: any) => item.text?.includes('作者'))).toBe(false)
  })
})
