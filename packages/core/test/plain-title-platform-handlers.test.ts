import fs from 'node:fs'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildDouyinHtmlWorkFromAwemeDetail,
  buildDouyinWorkResultFromHtmlWork,
  parseDouyinHtmlWork
} from '../src/platform/douyin/html'

const state = vi.hoisted(() => {
  const fetchBiliDynamicDetail = vi.fn(async () => ({
    data: {
      item: {
        id_str: 'dynamic-1',
        type: 'DYNAMIC_TYPE_DRAW',
        modules: {
          module_author: {
            mid: 123,
            face: 'https://example.com/bili-author.jpg',
            pendant: { image: '' },
            pub_ts: 1780000000,
            decoration_card: null
          },
          module_dynamic: {
            major: {
              opus: {
                title: 'B站图文标题',
                pics: [{ url: 'https://example.com/bili-draw.jpg' }],
                summary: { text: 'B站图文正文', rich_text_nodes: [] }
              }
            },
            additional: null
          },
          module_stat: {
            like: { count: 1 },
            comment: { count: 2 },
            forward: { count: 3 }
          }
        },
        basic: { rid_str: 'cv1' }
      }
    }
  }))
  const fetchBiliUserCard = vi.fn(async () => ({
    data: {
      data: {
        follower: 1,
        like_num: 1,
        card: {
          name: '主播',
          face: 'https://example.com/avatar.jpg',
          fans: 1,
          attention: 1,
          pendant: { image: '' }
        }
      }
    }
  }))
  const fetchXhsNoteDetail = vi.fn()
  const fetchXhsNoteBundle = vi.fn()
  const fetchXhsEmojiList = vi.fn()
  const config = {
    app: {
      parseTip: false,
      removeCache: true,
      livePhotoMode: 'video_and_livephoto',
      fakeForward: false
    },
    upload: {
      groupfilevalue: 100,
      usefilelimit: false,
      filelimit: 100,
      compress: false,
      videoSendMode: 'file',
      imageSendMode: 'file',
      compressPreset: 'cpu',
      compressCustomArgs: ''
    },
    cookies: {
      bilibili: 'bili-cookie',
      douyin: 'douyin-cookie',
      xiaohongshu: 'xhs-cookie'
    },
    bilibili: {
      sendContent: ['video'],
      liveRecordSeconds: 10,
      liveQuality: 10000,
      videoQuality: 16,
      burnDanmaku: false,
      videoCodec: 'h264',
      danmakuArea: 0,
      verticalMode: false,
      danmakuFontSize: 24,
      danmakuOpacity: 0.8
    },
    douyin: {
      sendContent: ['video'],
      videoInfoMode: 'image',
      longTitleFullText: false,
      longTitleFullTextThreshold: 25,
      displayContent: ['title', 'author', 'stats'],
      videoQuality: 'adapt',
      maxAutoVideoSize: 100,
      liveRecordSeconds: 10,
      liveQuality: 'FULL_HD1',
      burnDanmaku: false,
      videoCodec: 'h264',
      danmakuArea: 0,
      verticalMode: false,
      danmakuFontSize: 24,
      danmakuOpacity: 0.8
    },
    xiaohongshu: {
      sendContent: ['video'],
      videoQuality: 'adapt',
      maxAutoVideoSize: 100
    }
  }

  return {
    config,
    downloadFile: vi.fn(),
    downloadVideo: vi.fn(),
    buildGoogleMotionPhoto: vi.fn(),
    fetchDouyinOneWork: vi.fn(),
    fetchDouyinLiveWebEnterInfo: vi.fn(),
    fetchDouyinComments: vi.fn(),
    fetchDouyinEmojiList: vi.fn(),
    fetchDouyinUserProfile: vi.fn(),
    fetchBiliDynamicDetail,
    fetchBiliUserCard,
    fetchXhsNoteDetail,
    fetchXhsNoteBundle,
    fetchXhsEmojiList,
    amagiClient: {
      bilibili: {
        fetcher: {
          fetchDynamicDetail: fetchBiliDynamicDetail,
          fetchUserCard: fetchBiliUserCard
        }
      },
      xiaohongshu: {
        fetcher: {
          fetchNoteDetail: fetchXhsNoteDetail,
          fetchEmojiList: fetchXhsEmojiList
        }
      }
    },
    getDouyinLiveContainer: vi.fn(),
    getDouyinLiveItem: vi.fn(),
    networkGetLongLink: vi.fn(async (url: string) => url),
    douyinComments: vi.fn(),
    uploadFile: vi.fn(),
    recordBilibiliLiveStream: vi.fn(),
    recordDouyinLiveStream: vi.fn(),
    render: vi.fn(),
    selectBilibiliLiveStream: vi.fn(),
    selectDouyinLiveStream: vi.fn()
  }
})

const createContext = (
  enabled: boolean,
  platformLabel: 'B站' | '抖音' | '小红书',
  types: Array<'video' | 'image' | 'article' | 'live' | 'text'> = ['video', 'image', 'article', 'live', 'text']
) => ({
  enabled,
  platformLabel,
  types,
  sent: false
})

const replyTitle = async (
  event: any,
  context: ReturnType<typeof createContext>,
  title: unknown,
  author?: unknown,
  type: 'video' | 'image' | 'article' | 'live' | 'text' = 'video'
) => {
  if (!context.enabled || context.sent) return false
  if (!context.types.includes(type)) return false
  const normalizedTitle = String(title ?? '').replace(/\s+/g, ' ').trim()
  if (!normalizedTitle) return false
  const normalizedAuthor = String(author ?? '').replace(/\s+/g, ' ').trim()
  context.sent = true
  await event.reply(normalizedAuthor
    ? `【${context.platformLabel}】${normalizedAuthor}：${normalizedTitle}`
    : `${context.platformLabel}标题：${normalizedTitle}`)
  return true
}

const makeBase = () => class {
  e: any
  headers = { 'User-Agent': 'Unit Test UA' }
  amagi = {
    bilibili: {
      fetcher: {
        fetchLiveRoomInfo: vi.fn(async () => ({
          data: {
            data: {
              title: 'B站直播标题',
              user_cover: 'https://example.com/bili-cover.jpg',
              area_name: '分区',
              room_id: '8139918',
              live_time: '2026-05-30 11:00:00'
            }
          }
        })),
        fetchLiveRoomInitInfo: vi.fn(async () => ({ data: { data: { live_status: 1, uid: 123 } } })),
        fetchDynamicDetail: (...args: unknown[]) => state.fetchBiliDynamicDetail(...args),
        fetchUserCard: (...args: unknown[]) => state.fetchBiliUserCard(...args)
      }
    },
    douyin: {
      fetcher: {
        parseWork: vi.fn(async () => ({
          data: {
            aweme_detail: {
              aweme_id: '123',
              aweme_type: 0,
              desc: '抖音视频标题',
              preview_title: '抖音预览标题',
              is_slides: false,
              images: null,
              share_url: 'https://www.douyin.com/video/123',
              statistics: {},
              suggest_words: { suggest_words: [] },
              author: {
                nickname: '作者',
                avatar_thumb: { url_list: ['https://example.com/author.jpg'] }
              },
              video: {
                play_addr: {
                  uri: 'douyin-video-uri'
                },
                bit_rate: [{
                  FPS: 30,
                  bit_rate: 1000,
                  gear_name: 'normal_720',
                  quality_type: 720,
                  play_addr: {
                    data_size: 1024,
                    url_list: ['https://example.com/douyin.mp4'],
                    width: 1080,
                    height: 1920
                  }
                }]
              }
            }
          }
        })),
        fetchWorkComments: (...args: unknown[]) => state.fetchDouyinComments(...args),
        fetchEmojiList: (...args: unknown[]) => state.fetchDouyinEmojiList(...args),
        fetchUserProfile: (...args: unknown[]) => state.fetchDouyinUserProfile(...args)
      }
    },
    xiaohongshu: {
      fetcher: {
        fetchNoteDetail: state.fetchXhsNoteDetail,
        fetchEmojiList: state.fetchXhsEmojiList
      }
    }
  }

  constructor (e: any) {
    this.e = e
  }
}

const defaultXhsNoteDetail = () => ({
  data: {
    data: {
      items: [{
        note_card: {
          title: '小红书视频标题',
          desc: 'desc',
          note_id: 'note-1',
          interact_info: {},
          user: { nickname: '小红书作者' },
          image_list: [{ url_default: 'https://example.com/cover.jpg' }],
          time: 0,
          ip_location: '',
          video: {
            media: {
              stream: {
                h264: [{
                  master_url: 'https://example.com/xhs.mp4',
                  backup_urls: [],
                  stream_desc: '清晰度',
                  size: 1024
                }]
              }
            },
            url_default: 'https://example.com/xhs-fallback.mp4'
          }
        }
      }]
    }
  }
})

const createBilibiliDrawDynamicDetailResult = (dynamicId: string) => ({
  data: {
    item: {
      id_str: dynamicId,
      type: 'DYNAMIC_TYPE_DRAW',
      modules: {
        module_author: {
          mid: 123,
          face: 'https://example.com/bili-author.jpg',
          pendant: { image: '' },
          pub_ts: 1780000000,
          decoration_card: null
        },
        module_dynamic: {
          major: {
            opus: {
              title: 'B站图文标题',
              pics: [{ url: 'https://example.com/bili-draw.jpg' }],
              summary: { text: 'B站图文正文', rich_text_nodes: [] }
            }
          },
          additional: null
        },
        module_stat: {
          like: { count: 1 },
          comment: { count: 2 },
          forward: { count: 3 }
        }
      },
      basic: { rid_str: 'cv1' }
    }
  }
})

const createDouyinOneWorkResult = (awemeOverrides: Partial<any> = {}) => {
  const awemeDetail = {
    aweme_id: '123',
    aweme_type: 0,
    desc: '抖音视频标题',
    preview_title: '抖音预览标题',
    is_slides: false,
    images: null,
    share_url: 'https://www.douyin.com/video/123',
    statistics: {},
    suggest_words: { suggest_words: [] },
    author: {
      nickname: '作者',
      avatar_thumb: { url_list: ['https://example.com/author.jpg'] }
    },
    video: {
      duration: 12000,
      width: 1080,
      height: 1920,
      ratio: '1080p',
      cover: { url_list: ['https://example.com/douyin-cover.jpg'] },
      cover_original_scale: {
        url_list: ['https://example.com/douyin-cover.jpg'],
        width: 1080,
        height: 1920
      },
      play_addr: {
        uri: 'douyin-video-uri'
      },
      bit_rate: [{
        FPS: 30,
        bit_rate: 1000,
        gear_name: 'normal_720',
        quality_type: 720,
        play_addr: {
          data_size: 1024,
          url_list: ['https://example.com/douyin.mp4'],
          width: 1080,
          height: 1920
        }
      }]
    },
    ...awemeOverrides
  }

  const subtype = awemeDetail.aweme_type === 163
    ? 'article'
    : awemeDetail.is_slides
      ? 'slides'
      : awemeDetail.images
        ? 'note'
        : 'video'

  return {
    htmlWork: {
      awemeId: awemeDetail.aweme_id,
      subtype
    },
    workData: {
      data: {
        aweme_detail: awemeDetail
      }
    },
    source: 'html',
    enrichment: null
  }
}

const moduleMock = () => ({
  Base: makeBase(),
  baseHeaders: { 'User-Agent': 'Unit Test UA' },
  buildGoogleMotionPhoto: (...args: unknown[]) => state.buildGoogleMotionPhoto(...args),
  Common: {
    tempDri: {
      video: '/tmp/',
      images: '/tmp/'
    },
    removeFile: vi.fn()
  },
  Count: (value: unknown) => String(value),
  createPlainVideoTitleContext: createContext,
  downloadFile: (...args: unknown[]) => state.downloadFile(...args),
  downloadVideo: (...args: unknown[]) => state.downloadVideo(...args),
  extractTotalBytesFromHeaders: vi.fn(() => 1024),
  fixM4sFile: vi.fn(async (input: string) => input),
  loopVideoWithTransition: vi.fn(async () => ({ success: true })),
  mergeVideoAudio: vi.fn(async () => true),
  Networks: class {
    private readonly url: string

    constructor (data?: { url?: string }) {
      this.url = data?.url ?? ''
    }

    async getData () {
      return { data: { durl: [{ size: 1024, url: 'https://example.com/bili.mp4' }] } }
    }

    async getLongLink () {
      return await state.networkGetLongLink(this.url)
    }
  },
  processImageUrl: vi.fn(async (url: string) => url),
  recordFailureTraceStep: vi.fn(),
  Render: (...args: unknown[]) => state.render(...args),
  replyRenderedImages: vi.fn(async (event: any, images: unknown[]) => {
    await event.reply(images)
    return true
  }),
  replyPlainVideoTitle: replyTitle,
  sendRenderedImagesToContact: vi.fn(async (_event: unknown, images: unknown[], options: Record<string, any>) => {
    return await options.sendDirect(images)
  }),
  uploadFile: (...args: unknown[]) => state.uploadFile(...args)
})

vi.mock('node-karin', () => ({
  common: {
    makeForward: vi.fn((items: unknown[]) => items)
  },
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    green: (value: unknown) => String(value),
    info: vi.fn(),
    mark: vi.fn(),
    warn: vi.fn(),
    yellow: (value: unknown) => String(value)
  },
  Message: class {},
  segment: {
    image: vi.fn((url: string) => ({ type: 'image', url })),
    record: vi.fn((url: string) => ({ type: 'record', url })),
    text: vi.fn((text: string) => ({ type: 'text', text })),
    video: vi.fn((url: string) => ({ type: 'video', url }))
  }
}))

vi.mock('@ikenxuan/amagi', () => ({
  bilibiliApiUrls: {
    getVideoStream: vi.fn(() => 'https://api.example/playurl')
  },
  DynamicType: {
    AV: 'DYNAMIC_TYPE_AV',
    DRAW: 'DYNAMIC_TYPE_DRAW',
    FORWARD: 'DYNAMIC_TYPE_FORWARD',
    LIVE_RCMD: 'DYNAMIC_TYPE_LIVE_RCMD',
    WORD: 'DYNAMIC_TYPE_WORD'
  }
}))

vi.mock('@/module', () => moduleMock())
vi.mock('@/module/utils', () => moduleMock())

vi.mock('@/module/utils/Config', () => ({
  Config: state.config
}))

vi.mock('@/module/utils/amagiClient', () => ({
  amagiClient: state.amagiClient,
  bilibiliFetcher: {},
  SOFT_ERROR_CODES: {},
  softFetch: vi.fn()
}))

vi.mock('@/platform/bilibili', () => ({
  bilibiliComments: vi.fn(() => ({ comments: [], image_urls: [] })),
  checkCk: vi.fn(async () => ({ Status: 'notLogin', isVIP: false })),
  genParams: vi.fn()
}))

vi.mock('@/platform/bilibili/cdnSelector', () => ({
  collectBilibiliCdnBackupUrls: vi.fn(() => []),
  preferBilibiliNonMcdnUrls: vi.fn((item: unknown) => item),
  rewriteBilibiliCdnUrlCarrier: vi.fn((item: unknown) => item)
}))

vi.mock('@/platform/bilibili/danmaku', () => ({
  burnBiliDanmaku: vi.fn(async () => true),
  mergeAndBurnBili: vi.fn(async () => true)
}))

vi.mock('@/platform/bilibili/dynamic-text', () => ({
  buildBilibiliArticleRichText: vi.fn((text: string) => text),
  buildBilibiliDynamicRichText: vi.fn((text: string) => text),
  buildBilibiliVideoDescRichText: vi.fn((text: string) => text),
  getUsernameMetadata: vi.fn(() => ({}))
}))

vi.mock('@/platform/bilibili/liveRecorder', () => ({
  buildBilibiliLiveApiHeaders: vi.fn(() => ({})),
  buildBilibiliLiveRecordHeaders: vi.fn(() => ({})),
  fetchBilibiliLivePlayInfo: vi.fn(async () => ({})),
  normalizeBilibiliLiveQuality: vi.fn((value: number) => value),
  normalizeBilibiliLiveRecordSeconds: vi.fn((value: number) => value),
  recordBilibiliLiveStream: (...args: unknown[]) => state.recordBilibiliLiveStream(...args),
  selectBilibiliLiveStream: (...args: unknown[]) => state.selectBilibiliLiveStream(...args)
}))

vi.mock('@/platform/douyin', () => ({
  douyinComments: (...args: unknown[]) => state.douyinComments(...args)
}))

vi.mock('@/platform/douyin/comments', () => ({
  douyinComments: (...args: unknown[]) => state.douyinComments(...args)
}))

vi.mock('@/platform/douyin/oneWork', () => ({
  fetchDouyinOneWork: (...args: unknown[]) => state.fetchDouyinOneWork(...args)
}))

vi.mock('@/platform/douyin/danmaku', () => ({
  burnDouyinDanmaku: vi.fn(async () => true)
}))

vi.mock('@/platform/douyin/liveRecorder', () => ({
  buildDouyinLiveInfoHeaders: vi.fn(() => ({})),
  buildDouyinLiveRecordHeaders: vi.fn(() => ({})),
  fetchDouyinLiveDataFromReflow: vi.fn(),
  fetchDouyinLiveReflowInfo: vi.fn(),
  fetchDouyinLiveWebEnterInfo: (...args: unknown[]) => state.fetchDouyinLiveWebEnterInfo(...args),
  getDouyinLiveContainer: (...args: unknown[]) => state.getDouyinLiveContainer(...args),
  getDouyinLiveItem: (...args: unknown[]) => state.getDouyinLiveItem(...args),
  isDouyinLiveStatusActive: vi.fn(() => true),
  normalizeDouyinLiveQuality: vi.fn((value: string) => value),
  normalizeDouyinLiveRecordSeconds: vi.fn((value: number) => value),
  recordDouyinLiveStream: (...args: unknown[]) => state.recordDouyinLiveStream(...args),
  selectDouyinLiveStream: (...args: unknown[]) => state.selectDouyinLiveStream(...args)
}))

vi.mock('@/platform/xiaohongshu/comments', () => ({
  buildXiaohongshuRichText: vi.fn((text: string) => text),
  xiaohongshuComments: vi.fn()
}))

vi.mock('@/platform/xiaohongshu/noteBundle', () => ({
  fetchXiaohongshuNoteBundle: (...args: unknown[]) => state.fetchXhsNoteBundle(...args)
}))

vi.mock('@/module/summaryParse/parsedPostCache', async () => {
  const { resolveParsedPostFromResolvedLink } = await vi.importActual<any>('@/platform/resolveParsedPost/registry')
  return {
    resolveParsedPostWithCache: async (link: { platform: string, url: string }) => {
      if (link.platform !== 'xiaohongshu') {
        return {
          parsedPost: await resolveParsedPostFromResolvedLink(link),
          cacheHit: false
        }
      }

      const latestFetch = state.fetchXhsNoteBundle.mock.results.at(-1)
      const noteData = await latestFetch?.value
      const noteCard = noteData?.data?.data?.items?.[0]?.note_card
      if (!noteCard) throw new Error('小红书笔记详情为空')

      const images = (noteCard.image_list ?? [])
        .map((item: { url_default?: string }) => item.url_default)
        .filter(Boolean)
        .map((url: string) => ({ url }))
      const primaryVideo = noteCard.video
        ? {
          url: noteCard.video.media?.stream?.h264?.[0]?.master_url ?? noteCard.video.url_default,
          title: noteCard.title
        }
        : undefined

      return {
        parsedPost: {
          platform: 'xiaohongshu',
          platformLabel: '小红书',
          subtype: primaryVideo ? 'video' : 'image',
          title: noteCard.title,
          author: { name: noteCard.user?.nickname },
          summary: noteCard.desc,
          url: link.url,
          contentBlocks: [],
          images,
          videos: primaryVideo ? [primaryVideo] : [],
          primaryVideo,
          stats: [],
          meta: [],
          raw: { detail: noteData }
        },
        cacheHit: false
      }
    }
  }
})

const { Bilibili } = await import('../src/platform/bilibili/bilibili')
const { DouYin } = await import('../src/platform/douyin/douyin')
const { Xiaohongshu, xiaohongshuProcessVideos } = await import('../src/platform/xiaohongshu/xiaohongshu')

describe('plain title replies in platform video handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.config.app.livePhotoMode = 'video_and_livephoto'
    state.config.douyin.sendContent = ['video']
    state.config.douyin.videoInfoMode = 'image'
    state.config.douyin.longTitleFullText = false
    state.config.douyin.longTitleFullTextThreshold = 25
    state.config.douyin.displayContent = ['title', 'author', 'stats']
    state.buildGoogleMotionPhoto.mockResolvedValue(false)
    state.downloadFile.mockResolvedValue({ filepath: '/tmp/file', totalBytes: 1024 })
    state.downloadVideo.mockResolvedValue(true)
    state.fetchDouyinOneWork.mockResolvedValue(createDouyinOneWorkResult({
      desc: '抖音视频标题',
      preview_title: '抖音预览标题',
      author: {
        nickname: '作者',
        avatar_thumb: { url_list: ['https://example.com/author.jpg'] }
      }
    }))
    state.douyinComments.mockResolvedValue({ CommentsData: [{ id: 'comment-1' }], image_url: [] })
    state.fetchDouyinComments.mockResolvedValue({ data: { comments: [] } })
    state.fetchDouyinEmojiList.mockResolvedValue({ data: { emoji_list: [] } })
    state.fetchDouyinUserProfile.mockResolvedValue({
      success: true,
      data: {
        user: {
          nickname: '作者',
          unique_id: 'author-id',
          short_id: 'author-short-id',
          avatar_larger: { url_list: ['https://example.com/author-large.jpg'] },
          avatar_thumb: { url_list: ['https://example.com/author.jpg'] },
          follower_count: 100,
          total_favorited: 200,
          following_count: 30,
          aweme_count: 40,
          ip_location: '上海',
          gender: 0,
          user_age: 0
        }
      }
    })
    state.fetchDouyinLiveWebEnterInfo.mockResolvedValue({})
    state.fetchXhsNoteBundle.mockResolvedValue(defaultXhsNoteDetail())
    state.fetchXhsEmojiList.mockResolvedValue({ data: { data: { emoji: { tabs: [] } } } })
    state.networkGetLongLink.mockImplementation(async (url: string) => url)
    state.getDouyinLiveContainer.mockReturnValue({
      user: {
        nickname: '抖音主播',
        avatar_thumb: { url_list: ['https://example.com/douyin-avatar.jpg'] }
      }
    })
    state.getDouyinLiveItem.mockReturnValue({
      title: '抖音直播标题',
      cover: { url_list: ['https://example.com/douyin-cover.jpg'] },
      owner: {
        nickname: '抖音主播',
        web_rid: '717267717594',
        avatar_thumb: { url_list: ['https://example.com/douyin-owner.jpg'] }
      },
      stream_url: {
        default_resolution: 'FULL_HD1'
      },
      stats: {},
      room_view_stats: { display_value: '1万' }
    })
    state.uploadFile.mockResolvedValue(true)
    state.recordBilibiliLiveStream.mockResolvedValue(true)
    state.recordDouyinLiveStream.mockResolvedValue(true)
    state.render.mockResolvedValue(['rendered-image'])
    state.selectBilibiliLiveStream.mockReturnValue({ url: 'https://example.com/live.flv', currentQn: 10000 })
    state.selectDouyinLiveStream.mockReturnValue({ url: 'https://example.com/live.flv', quality: 'FULL_HD1' })
    state.config.bilibili.sendContent = ['video']
    state.config.douyin.sendContent = ['video']
    state.config.xiaohongshu.sendContent = ['video']
  })

  it('replies Bilibili title before live video upload for a link-only parse', async () => {
    const event = { reply: vi.fn(), bot: { account: { name: 'bot', selfId: 'bot' } } } as any

    await new Bilibili(event, { type: 'live_room_detail' }, {
      plainVideoTitle: createContext(true, 'B站')
    }).BilibiliHandler({ room_id: '8139918' } as any)

    expect(event.reply).toHaveBeenCalledWith('【B站】主播：B站直播标题')
    expect(state.recordBilibiliLiveStream).toHaveBeenCalled()
  })

  it('does not render Bilibili live info card when only video content is enabled', async () => {
    const event = { reply: vi.fn(), bot: { account: { name: 'bot', selfId: 'bot' } } } as any

    await new Bilibili(event, { type: 'live_room_detail' }, {
      plainVideoTitle: createContext(true, 'B站')
    }).BilibiliHandler({ room_id: '8139918' } as any)

    expect(state.render).not.toHaveBeenCalledWith(
      expect.anything(),
      'bilibili/dynamic/DYNAMIC_TYPE_LIVE_RCMD',
      expect.anything()
    )
    expect(state.recordBilibiliLiveStream).toHaveBeenCalled()
  })

  it('renders Bilibili live info card when info content is enabled', async () => {
    state.config.bilibili.sendContent = ['info', 'video']
    const event = { reply: vi.fn(), bot: { account: { name: 'bot', selfId: 'bot' } } } as any

    await new Bilibili(event, { type: 'live_room_detail' }, {
      plainVideoTitle: createContext(true, 'B站')
    }).BilibiliHandler({ room_id: '8139918' } as any)

    expect(state.render).toHaveBeenCalledWith(
      expect.anything(),
      'bilibili/dynamic/DYNAMIC_TYPE_LIVE_RCMD',
      expect.anything()
    )
  })

  it('does not render Douyin live info card when only video content is enabled', async () => {
    const event = { messageId: 'msg-1', reply: vi.fn() } as any

    await new DouYin(event, { type: 'live_room_detail', room_id: '717267717594' } as any, {
      plainVideoTitle: createContext(true, '抖音')
    }).DouyinHandler({ type: 'live_room_detail', room_id: '717267717594' } as any)

    expect(state.render).not.toHaveBeenCalledWith(
      expect.anything(),
      'douyin/live',
      expect.anything()
    )
    expect(state.recordDouyinLiveStream).toHaveBeenCalled()
  })

  it('renders Douyin live info card when info content is enabled', async () => {
    state.config.douyin.sendContent = ['info', 'video']
    const event = { messageId: 'msg-1', reply: vi.fn() } as any

    await new DouYin(event, { type: 'live_room_detail', room_id: '717267717594' } as any, {
      plainVideoTitle: createContext(true, '抖音')
    }).DouyinHandler({ type: 'live_room_detail', room_id: '717267717594' } as any)

    expect(state.render).toHaveBeenCalledWith(
      expect.anything(),
      'douyin/live',
      expect.anything()
    )
  })

  it('replies Douyin title only when the video branch downloads media', async () => {
    const event = { messageId: 'msg-1', reply: vi.fn() } as any

    await new DouYin(event, { type: 'one_work', aweme_id: '123' } as any, {
      plainVideoTitle: createContext(true, '抖音')
    }).DouyinHandler({ type: 'one_work', aweme_id: '123' } as any)

    expect(event.reply).toHaveBeenCalledWith('【抖音】作者：抖音视频标题')
    expect(state.downloadVideo).toHaveBeenCalledWith(event, expect.objectContaining({
      networkOptions: { proxy: false }
    }), expect.anything())
  })

  it('renders long Douyin video text as a paragraph card and still downloads the video', async () => {
    const longTitle = `妈妈说其实当时我出生的时候爷爷不高兴因为我是个女孩。${'后来才知道这份记忆一直留在家里。'.repeat(3)}`
    state.config.douyin.sendContent = ['info', 'video']
    state.config.douyin.longTitleFullText = true
    state.fetchDouyinOneWork.mockResolvedValueOnce(createDouyinOneWorkResult({
      desc: longTitle,
      preview_title: longTitle,
      create_time: 1784995200,
      author: {
        nickname: '长视频作者',
        sec_uid: 'long-video-sec',
        avatar_thumb: { url_list: ['https://example.com/long-video-author.jpg'] }
      },
      video: {
        duration: 120000,
        width: 1080,
        height: 1920,
        ratio: '1080p',
        animated_cover: { url_list: ['https://example.com/long-video-cover.jpg'] },
        cover_original_scale: { url_list: ['https://example.com/long-video-cover.jpg'] },
        cover: { url_list: ['https://example.com/long-video-cover.jpg'] },
        play_addr: { uri: 'douyin-video-uri' },
        bit_rate: [{
          FPS: 30,
          bit_rate: 1000,
          gear_name: 'normal_1080',
          quality_type: 1080,
          play_addr: {
            data_size: 1024,
            url_list: ['https://example.com/long-video.mp4'],
            width: 1080,
            height: 1920
          }
        }]
      }
    }))
    const event = { messageId: 'msg-long-video', reply: vi.fn() } as any

    await new DouYin(event, { type: 'one_work', aweme_id: '123' } as any, {
      plainVideoTitle: createContext(false, '抖音')
    }).DouyinHandler({ type: 'one_work', aweme_id: '123' } as any)

    expect(state.render).toHaveBeenCalledWith(
      event,
      'douyin/long-text-work',
      expect.objectContaining({
        text: longTitle,
        work_type: '视频',
        author: expect.objectContaining({ name: '长视频作者' }),
        video: expect.objectContaining({ duration: 120000, width: 1080, height: 1920 })
      })
    )
    expect(state.render).not.toHaveBeenCalledWith(
      expect.anything(),
      'douyin/videoInfo',
      expect.anything()
    )
    expect(state.fetchDouyinUserProfile).not.toHaveBeenCalled()
    expect(state.downloadVideo).toHaveBeenCalledWith(event, expect.objectContaining({
      video_url: 'https://example.com/long-video.mp4'
    }), expect.anything())
  })

  it('renders a long title card when video info is disabled', async () => {
    const longTitle = '没有启用视频信息时，这段超过二十五个字的抖音标题也应该独立渲染全文卡片。'
    state.config.douyin.longTitleFullText = true
    state.fetchDouyinOneWork.mockResolvedValueOnce(createDouyinOneWorkResult({
      desc: longTitle,
      preview_title: longTitle
    }))
    const event = { messageId: 'msg-long-without-info', reply: vi.fn() } as any

    await new DouYin(event, { type: 'one_work', aweme_id: '123' } as any, {
      plainVideoTitle: createContext(false, '抖音')
    }).DouyinHandler({ type: 'one_work', aweme_id: '123' } as any)

    expect(state.render).toHaveBeenCalledWith(
      event,
      'douyin/long-text-work',
      expect.objectContaining({ text: longTitle })
    )
    expect(state.fetchDouyinUserProfile).not.toHaveBeenCalled()
  })

  it('keeps titles below a raised custom threshold on the existing info card', async () => {
    const title = '字'.repeat(30)
    state.config.douyin.sendContent = ['info']
    state.config.douyin.longTitleFullText = true
    state.config.douyin.longTitleFullTextThreshold = 40
    state.fetchDouyinOneWork.mockResolvedValueOnce(createDouyinOneWorkResult({
      desc: title,
      preview_title: title
    }))
    const event = { messageId: 'msg-custom-threshold-high', reply: vi.fn() } as any

    await new DouYin(event, { type: 'one_work', aweme_id: '123' } as any, {
      plainVideoTitle: createContext(false, '抖音')
    }).DouyinHandler({ type: 'one_work', aweme_id: '123' } as any)

    expect(state.render).toHaveBeenCalledWith(
      event,
      'douyin/videoInfo',
      expect.objectContaining({ desc: title })
    )
    expect(state.render).not.toHaveBeenCalledWith(
      expect.anything(),
      'douyin/long-text-work',
      expect.anything()
    )
  })

  it('renders titles above a lowered custom threshold without video info enabled', async () => {
    const title = '跟我回去吧 小师弟#师妹 #古风 #剑修'
    state.config.douyin.longTitleFullText = true
    state.config.douyin.longTitleFullTextThreshold = 10
    state.fetchDouyinOneWork.mockResolvedValueOnce(createDouyinOneWorkResult({
      desc: title,
      preview_title: title
    }))
    const event = { messageId: 'msg-custom-threshold-low', reply: vi.fn() } as any

    await new DouYin(event, { type: 'one_work', aweme_id: '123' } as any, {
      plainVideoTitle: createContext(false, '抖音')
    }).DouyinHandler({ type: 'one_work', aweme_id: '123' } as any)

    expect(state.render).toHaveBeenCalledWith(
      event,
      'douyin/long-text-work',
      expect.objectContaining({ text: title })
    )
    expect(state.fetchDouyinUserProfile).not.toHaveBeenCalled()
  })

  it('keeps short Douyin video titles on the existing info card', async () => {
    state.config.douyin.sendContent = ['info']
    const event = { messageId: 'msg-short-video', reply: vi.fn() } as any

    await new DouYin(event, { type: 'one_work', aweme_id: '123' } as any, {
      plainVideoTitle: createContext(false, '抖音')
    }).DouyinHandler({ type: 'one_work', aweme_id: '123' } as any)

    expect(state.render).toHaveBeenCalledWith(
      event,
      'douyin/videoInfo',
      expect.objectContaining({ desc: '抖音视频标题' })
    )
    expect(state.render).not.toHaveBeenCalledWith(
      expect.anything(),
      'douyin/long-text-work',
      expect.anything()
    )
  })

  it('keeps long titles on the existing info card when the full text switch is disabled', async () => {
    const longTitle = '完整标题开关关闭时，这段超过二十五个字的抖音作品仍然应走原有的视频信息卡。'
    state.config.douyin.sendContent = ['info']
    state.fetchDouyinOneWork.mockResolvedValueOnce(createDouyinOneWorkResult({
      desc: longTitle,
      preview_title: longTitle
    }))
    const event = { messageId: 'msg-long-info-card', reply: vi.fn() } as any

    await new DouYin(event, { type: 'one_work', aweme_id: '123' } as any, {
      plainVideoTitle: createContext(false, '抖音')
    }).DouyinHandler({ type: 'one_work', aweme_id: '123' } as any)

    expect(state.render).toHaveBeenCalledWith(
      event,
      'douyin/videoInfo',
      expect.objectContaining({ desc: longTitle })
    )
    expect(state.fetchDouyinUserProfile).toHaveBeenCalledTimes(1)
    expect(state.render).not.toHaveBeenCalledWith(
      expect.anything(),
      'douyin/long-text-work',
      expect.anything()
    )
  })

  it('does not request a profile for the reproduced 20-grapheme title when video info is disabled', async () => {
    const shortTitle = '跟我回去吧 小师弟#师妹 #古风 #剑修'
    state.config.douyin.longTitleFullText = true
    state.fetchDouyinOneWork.mockResolvedValueOnce(createDouyinOneWorkResult({
      desc: shortTitle,
      preview_title: shortTitle
    }))
    const event = { messageId: 'msg-short-without-info', reply: vi.fn() } as any

    await new DouYin(event, { type: 'one_work', aweme_id: '123' } as any, {
      plainVideoTitle: createContext(false, '抖音')
    }).DouyinHandler({ type: 'one_work', aweme_id: '123' } as any)

    expect(state.fetchDouyinUserProfile).not.toHaveBeenCalled()
    expect(state.render).not.toHaveBeenCalledWith(
      expect.anything(),
      'douyin/videoInfo',
      expect.anything()
    )
  })

  it('keeps long Douyin titles in the configured text info mode when the full text switch is disabled', async () => {
    const longTitle = '文本模式下这段超过二十五个字的抖音作品标题仍然应该沿用现有文本输出配置'
    state.config.douyin.sendContent = ['info']
    state.config.douyin.videoInfoMode = 'text'
    state.config.douyin.displayContent = ['title', 'author', 'stats']
    state.fetchDouyinOneWork.mockResolvedValueOnce(createDouyinOneWorkResult({
      desc: longTitle,
      preview_title: longTitle
    }))
    const event = { messageId: 'msg-long-text-mode', reply: vi.fn() } as any

    await new DouYin(event, { type: 'one_work', aweme_id: '123' } as any, {
      plainVideoTitle: createContext(false, '抖音')
    }).DouyinHandler({ type: 'one_work', aweme_id: '123' } as any)

    expect(state.render).not.toHaveBeenCalledWith(
      expect.anything(),
      'douyin/long-text-work',
      expect.anything()
    )
    expect(state.render).not.toHaveBeenCalledWith(
      expect.anything(),
      'douyin/videoInfo',
      expect.anything()
    )
    expect(event.reply).toHaveBeenCalled()
  })

  it('sends the complete long title directly in text mode without rendering or fetching a profile', async () => {
    const longTitle = '第一行是超过阈值的完整抖音标题内容，不能被文本模式压缩。\n第二行也必须原样保留。'
    state.config.douyin.longTitleFullText = true
    state.config.douyin.videoInfoMode = 'text'
    state.fetchDouyinOneWork.mockResolvedValueOnce(createDouyinOneWorkResult({
      desc: longTitle,
      preview_title: longTitle
    }))
    const event = { messageId: 'msg-long-direct-text', reply: vi.fn() } as any

    await new DouYin(event, { type: 'one_work', aweme_id: '123' } as any, {
      plainVideoTitle: createContext(false, '抖音')
    }).DouyinHandler({ type: 'one_work', aweme_id: '123' } as any)

    expect(event.reply).toHaveBeenCalledWith(longTitle)
    expect(state.render).not.toHaveBeenCalled()
    expect(state.fetchDouyinUserProfile).not.toHaveBeenCalled()
  })

  it('uses direct cdn urls for html-first Douyin note videos when uri is unavailable', async () => {
    const noteVideoUrl = 'https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/test-video?is_ssr=1&temp=1'
    state.fetchDouyinOneWork.mockResolvedValueOnce(createDouyinOneWorkResult({
      share_url: 'https://www.douyin.com/note/123',
      video: {
        play_addr: {
          uri: '',
          data_size: 1024,
          url_list: [noteVideoUrl]
        },
        bit_rate: [{
          FPS: 30,
          bit_rate: 1000,
          gear_name: 'normal_720',
          quality_type: 720,
          play_addr: {
            data_size: 1024,
            url_list: [noteVideoUrl],
            width: 1080,
            height: 1920
          }
        }]
      }
    }))
    const event = { messageId: 'msg-1', reply: vi.fn() } as any

    await new DouYin(event, { type: 'one_work', aweme_id: '123' } as any, {
      plainVideoTitle: createContext(true, '抖音')
    }).DouyinHandler({ type: 'one_work', aweme_id: '123' } as any)

    expect(state.downloadVideo).toHaveBeenCalledWith(event, expect.objectContaining({
      video_url: noteVideoUrl
    }), expect.anything())
  })

  it('passes backup CDN candidates to Douyin video downloads', async () => {
    const primaryUrl = 'https://cdn.example.com/douyin-main.mp4'
    const backupUrl = 'https://cdn.example.com/douyin-backup.mp4'
    state.fetchDouyinOneWork.mockResolvedValueOnce(createDouyinOneWorkResult({
      video: {
        play_addr: {
          uri: 'douyin-video-uri',
          data_size: 1024,
          url_list: [primaryUrl, backupUrl]
        },
        bit_rate: [{
          FPS: 30,
          bit_rate: 1000,
          gear_name: 'normal_720',
          quality_type: 720,
          play_addr: {
            data_size: 1024,
            url_list: [primaryUrl, backupUrl],
            width: 1080,
            height: 1920
          }
        }]
      }
    }))
    const event = { messageId: 'msg-1', reply: vi.fn() } as any

    await new DouYin(event, { type: 'one_work', aweme_id: '123' } as any, {
      plainVideoTitle: createContext(true, '抖音')
    }).DouyinHandler({ type: 'one_work', aweme_id: '123' } as any)

    expect(state.networkGetLongLink).not.toHaveBeenCalled()
    expect(state.downloadVideo).toHaveBeenCalledWith(event, expect.objectContaining({
      video_url: primaryUrl,
      backupUrls: expect.arrayContaining([backupUrl]),
      networkOptions: { proxy: false }
    }), expect.anything())
  })

  it('resolves wrapped-only Douyin video urls to direct links before downloading', async () => {
    const wrappedUrl = 'https://aweme.snssdk.com/aweme/v1/playwm/?line=0&ratio=720p&video_id=v1e00fgi0000wrapped'
    state.fetchDouyinOneWork.mockResolvedValueOnce(createDouyinOneWorkResult({
      video: {
        play_addr: {
          uri: 'v1e00fgi0000wrapped',
          data_size: 1024,
          url_list: [wrappedUrl]
        },
        bit_rate: [{
          FPS: 30,
          bit_rate: 1000,
          gear_name: 'normal_720',
          quality_type: 720,
          play_addr: {
            data_size: 1024,
            url_list: [wrappedUrl],
            width: 1080,
            height: 1920
          }
        }]
      }
    }))
    const event = { messageId: 'msg-1', reply: vi.fn() } as any

    await new DouYin(event, { type: 'one_work', aweme_id: '123' } as any, {
      plainVideoTitle: createContext(true, '抖音')
    }).DouyinHandler({ type: 'one_work', aweme_id: '123' } as any)

    expect(state.networkGetLongLink).not.toHaveBeenCalled()
    expect(state.downloadVideo).toHaveBeenCalledWith(event, expect.objectContaining({
      video_url: 'https://aweme.snssdk.com/aweme/v1/play/?video_id=v1e00fgi0000wrapped&ratio=1080p&line=0',
      backupUrls: [wrappedUrl],
      networkOptions: { proxy: false }
    }), expect.anything())
  })

  it('replies Douyin title for image works', async () => {
    const event = {
      messageId: 'msg-1',
      reply: vi.fn(),
      bot: { account: { name: 'bot', selfId: 'bot' } },
      sender: { userId: 'u1', nick: 'nick' }
    } as any
    const handler = new DouYin(event, { type: 'one_work', aweme_id: '123' } as any, {
      plainVideoTitle: createContext(true, '抖音')
    }) as any
    state.fetchDouyinOneWork.mockResolvedValueOnce(createDouyinOneWorkResult({
      aweme_id: '123',
      aweme_type: 68,
      desc: '抖音图集正文',
      preview_title: '抖音图集标题',
      is_slides: false,
      images: [{ clip_type: 2, url_list: ['https://example.com/dy-1.jpg', 'https://example.com/dy-2.jpg', 'https://example.com/dy-3.jpg'] }],
      share_url: 'https://www.douyin.com/note/123',
      statistics: {},
      suggest_words: { suggest_words: [] },
      author: {
        nickname: '抖音图集作者',
        avatar_thumb: { url_list: ['https://example.com/author.jpg'] }
      }
    }))

    await handler.DouyinHandler({ type: 'one_work', aweme_id: '123' } as any)

    expect(event.reply).toHaveBeenCalledWith('【抖音】抖音图集作者：抖音图集正文')
  })

  it('does not reply Douyin title for image works when image type is disabled', async () => {
    const event = {
      messageId: 'msg-1',
      reply: vi.fn(),
      bot: { account: { name: 'bot', selfId: 'bot' } },
      sender: { userId: 'u1', nick: 'nick' }
    } as any
    const handler = new DouYin(event, { type: 'one_work', aweme_id: '123' } as any, {
      plainVideoTitle: createContext(true, '抖音', ['video'])
    }) as any
    state.fetchDouyinOneWork.mockResolvedValueOnce(createDouyinOneWorkResult({
      aweme_id: '123',
      aweme_type: 68,
      desc: '抖音图集正文',
      preview_title: '抖音图集标题',
      is_slides: false,
      images: [{ clip_type: 2, url_list: ['https://example.com/dy-1.jpg', 'https://example.com/dy-2.jpg', 'https://example.com/dy-3.jpg'] }],
      share_url: 'https://www.douyin.com/note/123',
      statistics: {},
      suggest_words: { suggest_words: [] },
      author: {
        nickname: '抖音图集作者',
        avatar_thumb: { url_list: ['https://example.com/author.jpg'] }
      }
    }))

    await handler.DouyinHandler({ type: 'one_work', aweme_id: '123' } as any)

    expect(event.reply).not.toHaveBeenCalledWith('【抖音】抖音图集作者：抖音图集正文')
  })

  it('keeps live-photo derived artifacts when a long slide title uses the paragraph card', async () => {
    const longLivePhotoText = '这是一条超过二十五个字的抖音实况图说明，用来确认卡片切换后派生的实况照片仍然完整发送'
    state.config.app.livePhotoMode = 'livephoto_only'
    state.config.douyin.sendContent = ['info']
    state.config.douyin.longTitleFullText = true
    state.buildGoogleMotionPhoto.mockResolvedValueOnce(true)
    const event = {
      messageId: 'msg-1',
      reply: vi.fn(async () => ({ messageId: 'reply-1' })),
      bot: {
        account: { name: 'bot', selfId: 'bot' },
        sendForwardMsg: vi.fn(async () => ({ messageId: 'forward-1' }))
      },
      contact: { scene: 'group', peer: 'group-1' },
      sender: { userId: 'u1', nick: 'nick' }
    } as any
    const handler = new DouYin(event, { type: 'one_work', aweme_id: '123' } as any, {
      plainVideoTitle: createContext(true, '抖音', ['image'])
    }) as any
    state.fetchDouyinOneWork.mockResolvedValueOnce(createDouyinOneWorkResult({
      aweme_id: '123',
      aweme_type: 68,
      desc: longLivePhotoText,
      preview_title: longLivePhotoText,
      is_slides: true,
      images: [{
        clip_type: 5,
        url_list: ['https://example.com/live-cover.jpg'],
        video: {
          play_addr_h264: {
            uri: 'livephoto-uri',
            url_list: ['https://example.com/livephoto.mp4']
          }
        }
      }],
      share_url: 'https://www.douyin.com/note/123',
      statistics: {},
      suggest_words: { suggest_words: [] },
      author: {
        nickname: '抖音实况图作者',
        avatar_thumb: { url_list: ['https://example.com/author.jpg'] }
      }
    }))

    await handler.DouyinHandler({ type: 'one_work', aweme_id: '123' } as any)

    expect(state.downloadFile).toHaveBeenCalledWith(
      'https://example.com/livephoto.mp4',
      expect.objectContaining({
        headers: expect.objectContaining({
          Referer: 'https://www.douyin.com',
          Cookie: 'douyin-cookie'
        })
      })
    )
    expect(state.buildGoogleMotionPhoto).toHaveBeenCalledWith(expect.objectContaining({
      imagePath: '/tmp/file',
      videoPath: '/tmp/file'
    }))
    expect(event.bot.sendForwardMsg).toHaveBeenCalledWith(
      event.contact,
      expect.arrayContaining([
        expect.objectContaining({
          type: 'image',
          url: expect.stringMatching(/^file:\/\/.*MVIMG_/)
        })
      ]),
      expect.anything()
    )
    expect(state.render).toHaveBeenCalledWith(
      event,
      'douyin/long-text-work',
      expect.objectContaining({ text: longLivePhotoText, work_type: '合辑' })
    )
  })

  it('uses the long text card for HTML-first notes without losing original images or bgm', async () => {
    const longGraphicText = '妈妈说其实当时我出生的时候爷爷不高兴因为我是个女孩。\n后来我才明白，她讲的是一段很长、也很真实的家庭记忆。'
    state.config.douyin.sendContent = ['image', 'info']
    state.config.douyin.longTitleFullText = true
    const audioPath = '/private/tmp/douyin-note-static-bgm-test.mp3'
    fs.writeFileSync(audioPath, 'stub-audio')
    state.downloadFile.mockResolvedValue({ filepath: audioPath, totalBytes: 1024 })
    const event = {
      messageId: 'msg-1',
      reply: vi.fn(async () => ({ messageId: 'reply-1' })),
      bot: {
        account: { name: 'bot', selfId: 'bot' },
        sendForwardMsg: vi.fn(async () => ({ messageId: 'forward-1' }))
      },
      contact: { scene: 'group', peer: 'group-1' },
      sender: { userId: 'u1', nick: 'nick' }
    } as any

    const routerData = {
      loaderData: {
        'note_(id)/page': {
          videoInfoRes: {
            item_list: [{
              aweme_id: 'note-static-001',
              aweme_type: 0,
              desc: longGraphicText,
              preview_title: longGraphicText,
              share_url: 'https://www.douyin.com/note/note-static-001',
              create_time: 1710000275,
              author: {
                nickname: '图文作者',
                sec_uid: 'sec_note_static',
                avatar_thumb: {
                  url_list: ['https://example.com/avatar-note-static.jpg']
                }
              },
              statistics: {},
              images: [{
                url_list: [
                  'https://example.com/note-static-1.jpg',
                  'https://example.com/note-static-1@2x.jpg',
                  'https://example.com/note-static-1@3x.jpg'
                ],
                download_url_list: ['https://example.com/note-static-1.jpg'],
                width: 1080,
                height: 1440,
                clip_type: 2
              }, {
                url_list: [
                  'https://example.com/note-static-2.jpg',
                  'https://example.com/note-static-2@2x.jpg',
                  'https://example.com/note-static-2@3x.jpg'
                ],
                download_url_list: ['https://example.com/note-static-2.jpg'],
                width: 1080,
                height: 1440,
                clip_type: 2
              }],
              video: {
                duration: 12000,
                width: 720,
                height: 1280,
                ratio: '720:1280',
                play_addr: {
                  uri: 'https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/top-level-note-video',
                  url_list: ['https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/top-level-note-video?foo=1'],
                  width: 720,
                  height: 1280
                },
                cover: {
                  url_list: ['https://example.com/note-video-cover.jpg']
                }
              },
              music: {
                author: '配乐作者',
                title: '配乐标题',
                play_url: {
                  uri: '7634223845754407716',
                  url_list: ['https://example.com/note-static-bgm.mp3']
                },
                extra: JSON.stringify({
                  original_song_url: 'https://example.com/note-static-bgm.mp3?fallback=1'
                })
              }
            }]
          }
        }
      }
    }
    const html = `
      <script>
        window._ROUTER_DATA = ${JSON.stringify(routerData)}
      </script>
    `
    const htmlWork = parseDouyinHtmlWork(html, {
      awemeId: 'note-static-001',
      typeHint: 'note',
      url: 'https://www.douyin.com/note/note-static-001'
    })
    const workData = buildDouyinWorkResultFromHtmlWork(htmlWork)
    state.fetchDouyinOneWork.mockResolvedValueOnce({
      htmlWork,
      workData,
      source: 'html',
      enrichment: null
    })

    await new DouYin(event, { type: 'one_work', aweme_id: 'note-static-001' } as any, {
      plainVideoTitle: createContext(true, '抖音', ['image'])
    }).DouyinHandler({ type: 'one_work', aweme_id: 'note-static-001' } as any)

    expect(state.downloadVideo).not.toHaveBeenCalled()
    expect(event.reply).toHaveBeenCalledWith(`【抖音】图文作者：${longGraphicText.replace(/\s+/g, ' ')}`)
    expect(event.bot.sendForwardMsg).toHaveBeenCalledWith(
      event.contact,
      expect.arrayContaining([
        expect.objectContaining({ type: 'image', url: 'https://example.com/note-static-1@3x.jpg' }),
        expect.objectContaining({ type: 'image', url: 'https://example.com/note-static-2@3x.jpg' })
      ]),
      expect.anything()
    )
    expect(event.reply).toHaveBeenCalledWith(expect.objectContaining({
      type: 'record',
      url: expect.stringContaining('base64://')
    }))
    expect(state.render).toHaveBeenCalledWith(
      event,
      'douyin/long-text-work',
      expect.objectContaining({
        text: longGraphicText,
        work_type: '图集',
        image_url: 'https://example.com/note-static-1.jpg',
        music: expect.objectContaining({ title: '配乐标题', author: '配乐作者' })
      })
    )
    expect(state.downloadFile).toHaveBeenCalledWith(
      'https://example.com/note-static-bgm.mp3',
      expect.objectContaining({
        cacheIdentity: expect.objectContaining({
          key: 'douyin:one_work:note-static-001:music:0',
          scope: 'media'
        })
      })
    )

    fs.rmSync(audioPath, { force: true })
  })

  it('replies Douyin article works with article render card in image mode', async () => {
    state.config.douyin.sendContent = []
    state.config.douyin.videoInfoMode = 'image'
    state.render.mockResolvedValue(['rendered-article-card'])
    const event = {
      messageId: 'msg-article-1',
      reply: vi.fn(async () => ({ messageId: 'reply-article-1' })),
      bot: {
        account: { name: 'bot', selfId: 'bot' },
        sendForwardMsg: vi.fn(async () => ({ messageId: 'forward-article-1' }))
      },
      contact: { scene: 'group', peer: 'group-1' },
      sender: { userId: 'u1', nick: 'nick' }
    } as any

    state.fetchDouyinOneWork.mockResolvedValueOnce(createDouyinOneWorkResult({
      aweme_id: 'article-001',
      aweme_type: 163,
      desc: '文章摘要',
      preview_title: '文章标题',
      share_url: 'https://www.douyin.com/article/article-001',
      article_info: {
        article_title: '文章标题',
        article_content: JSON.stringify({ markdown: '正文内容' }),
        fe_data: JSON.stringify({
          image_list: [{ url: 'https://example.com/article-image-1.jpg' }]
        })
      },
      video: {
        origin_cover: {
          url_list: ['https://example.com/article-cover.jpg'],
          width: 1080,
          height: 1440
        },
        cover: {
          url_list: ['https://example.com/article-cover.jpg']
        },
        cover_original_scale: {
          url_list: ['https://example.com/article-cover.jpg'],
          width: 1080,
          height: 1440
        },
        animated_cover: {
          url_list: ['https://example.com/article-cover.jpg']
        },
        dynamic_cover: {
          url_list: ['https://example.com/article-cover.jpg']
        },
        bit_rate: []
      }
    }))

    await new DouYin(event, { type: 'one_work', aweme_id: 'article-001' } as any, {
      plainVideoTitle: createContext(false, '抖音')
    }).DouyinHandler({ type: 'one_work', aweme_id: 'article-001' } as any)

    expect(state.render).toHaveBeenCalledWith(
      expect.anything(),
      'douyin/article-work',
      expect.objectContaining({
        title: '文章标题',
        markdown: '正文内容',
        images: [
          expect.objectContaining({
            high_image_url: 'https://example.com/article-image-1.jpg',
            origin_image_url: 'https://example.com/article-image-1.jpg'
          })
        ]
      })
    )
    expect(event.reply).toHaveBeenCalledWith(['rendered-article-card'])
    expect(event.reply).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'record'
    }))
  })

  it('passes normalized markdown to Douyin article render cards for html-first article payloads', async () => {
    state.config.douyin.sendContent = []
    state.config.douyin.videoInfoMode = 'image'
    state.render.mockResolvedValue(['rendered-article-card'])
    const rawMarkdown = '# 一级标题\n\n第一段正文\n\n第二段正文\n\n![配图](https://example.com/article-md-image.jpg width=1080 height=1440)'
    const rawArticleContent = JSON.stringify({
      markdown: rawMarkdown,
      text: '这是不该传给渲染层的 JSON 包裹文本'
    })
    const event = {
      messageId: 'msg-article-html-1',
      reply: vi.fn(async () => ({ messageId: 'reply-article-html-1' })),
      bot: {
        account: { name: 'bot', selfId: 'bot' },
        sendForwardMsg: vi.fn(async () => ({ messageId: 'forward-article-html-1' }))
      },
      contact: { scene: 'group', peer: 'group-1' },
      sender: { userId: 'u1', nick: 'nick' }
    } as any

    const htmlWork = buildDouyinHtmlWorkFromAwemeDetail({
      aweme_id: 'article-html-001',
      aweme_type: 163,
      desc: '文章摘要',
      preview_title: '文章标题',
      share_url: 'https://www.douyin.com/article/article-html-001',
      article_info: {
        article_title: '文章标题',
        article_content: rawArticleContent,
        fe_data: JSON.stringify({
          image_list: [{ url: 'https://example.com/article-image-1.jpg' }]
        })
      },
      images: [{
        url_list: ['https://example.com/article-image-1.jpg']
      }]
    }, {
      awemeId: 'article-html-001',
      typeHint: 'article',
      url: 'https://www.douyin.com/article/article-html-001'
    })

    state.fetchDouyinOneWork.mockResolvedValueOnce({
      htmlWork,
      workData: buildDouyinWorkResultFromHtmlWork(htmlWork!),
      source: 'html',
      enrichment: null
    })

    await new DouYin(event, { type: 'one_work', aweme_id: 'article-html-001' } as any, {
      plainVideoTitle: createContext(false, '抖音')
    }).DouyinHandler({ type: 'one_work', aweme_id: 'article-html-001' } as any)

    expect(state.render).toHaveBeenCalledWith(
      expect.anything(),
      'douyin/article-work',
      expect.objectContaining({
        title: '文章标题',
        markdown: rawMarkdown
      })
    )
    expect(state.render).not.toHaveBeenCalledWith(
      expect.anything(),
      'douyin/article-work',
      expect.objectContaining({
        markdown: rawArticleContent
      })
    )
  })

  it('falls back to article head poster when rendering Douyin article cards', async () => {
    state.config.douyin.sendContent = []
    state.config.douyin.videoInfoMode = 'image'
    state.render.mockResolvedValue(['rendered-article-head-poster-card'])
    const event = {
      messageId: 'msg-article-2',
      reply: vi.fn(async () => ({ messageId: 'reply-article-2' })),
      bot: {
        account: { name: 'bot', selfId: 'bot' },
        sendForwardMsg: vi.fn(async () => ({ messageId: 'forward-article-2' }))
      },
      contact: { scene: 'group', peer: 'group-1' },
      sender: { userId: 'u1', nick: 'nick' }
    } as any

    state.fetchDouyinOneWork.mockResolvedValueOnce(createDouyinOneWorkResult({
      aweme_id: 'article-002',
      aweme_type: 163,
      desc: '文章摘要',
      preview_title: '文章标题',
      share_url: 'https://www.douyin.com/article/article-002',
      article_info: {
        article_title: '文章标题',
        article_content: JSON.stringify({
          markdown: '正文内容',
          head_poster_list: {
            url_list: ['https://example.com/article-head-poster-from-content.jpg']
          }
        }),
        fe_data: JSON.stringify({
          image_list: [],
          head_poster_list: {
            url_list: ['https://example.com/article-head-poster.jpg']
          }
        })
      },
      video: {
        origin_cover: {
          url_list: ['https://example.com/article-cover.jpg'],
          width: 1080,
          height: 1440
        },
        cover: {
          url_list: ['https://example.com/article-cover.jpg']
        },
        cover_original_scale: {
          url_list: ['https://example.com/article-cover.jpg'],
          width: 1080,
          height: 1440
        },
        animated_cover: {
          url_list: ['https://example.com/article-cover.jpg']
        },
        dynamic_cover: {
          url_list: ['https://example.com/article-cover.jpg']
        },
        bit_rate: []
      }
    }))

    await new DouYin(event, { type: 'one_work', aweme_id: 'article-002' } as any, {
      plainVideoTitle: createContext(false, '抖音')
    }).DouyinHandler({ type: 'one_work', aweme_id: 'article-002' } as any)

    expect(state.render).toHaveBeenCalledWith(
      expect.anything(),
      'douyin/article-work',
      expect.objectContaining({
        images: [
          expect.objectContaining({
            high_image_url: 'https://example.com/article-head-poster.jpg',
            origin_image_url: 'https://example.com/article-head-poster.jpg'
          })
        ]
      })
    )
    expect(event.reply).toHaveBeenCalledWith(['rendered-article-head-poster-card'])
  })

  it('replies Douyin article works with text content in text mode and always includes body text', async () => {
    state.config.douyin.sendContent = []
    state.config.douyin.videoInfoMode = 'text'
    state.config.douyin.displayContent = ['title', 'author', 'stats']
    const event = {
      messageId: 'msg-article-3',
      reply: vi.fn(async () => ({ messageId: 'reply-article-3' })),
      bot: {
        account: { name: 'bot', selfId: 'bot' },
        sendForwardMsg: vi.fn(async () => ({ messageId: 'forward-article-3' }))
      },
      contact: { scene: 'group', peer: 'group-1' },
      sender: { userId: 'u1', nick: 'nick' }
    } as any

    state.fetchDouyinOneWork.mockResolvedValueOnce(createDouyinOneWorkResult({
      aweme_id: 'article-003',
      aweme_type: 163,
      desc: '文章摘要回退',
      preview_title: '文章标题',
      share_url: 'https://www.douyin.com/article/article-003',
      statistics: {
        digg_count: 11,
        comment_count: 22,
        collect_count: 33,
        share_count: 44
      },
      author: {
        nickname: '文章作者',
        avatar_thumb: { url_list: ['https://example.com/article-author.jpg'] }
      },
      article_info: {
        article_title: '文章标题',
        article_content: JSON.stringify({ markdown: '这是文章正文第一段\n这是文章正文第二段' }),
        fe_data: JSON.stringify({
          image_list: [{ url: 'https://example.com/article-image-3.jpg' }]
        })
      },
      video: {
        origin_cover: {
          url_list: ['https://example.com/article-cover.jpg'],
          width: 1080,
          height: 1440
        },
        cover: {
          url_list: ['https://example.com/article-cover.jpg']
        },
        cover_original_scale: {
          url_list: ['https://example.com/article-cover.jpg'],
          width: 1080,
          height: 1440
        },
        animated_cover: {
          url_list: ['https://example.com/article-cover.jpg']
        },
        dynamic_cover: {
          url_list: ['https://example.com/article-cover.jpg']
        },
        bit_rate: []
      }
    }))

    await new DouYin(event, { type: 'one_work', aweme_id: 'article-003' } as any, {
      plainVideoTitle: createContext(false, '抖音')
    }).DouyinHandler({ type: 'one_work', aweme_id: 'article-003' } as any)

    const payload = event.reply.mock.calls[0]?.[0]
    const textPayload = Array.isArray(payload)
      ? payload.filter(item => item?.type === 'text').map(item => item.text).join('\n')
      : ''

    expect(state.render).not.toHaveBeenCalledWith(
      expect.anything(),
      'douyin/article-work',
      expect.anything()
    )
    expect(textPayload).toContain('标题: 文章标题')
    expect(textPayload).toContain('作者: 文章作者')
    expect(textPayload).toContain('这是文章正文第一段')
    expect(textPayload).toContain('这是文章正文第二段')
    expect(textPayload).toContain('点赞')
  })

  it('still sends a standalone bgm record for Douyin live-photo notes before any derived artifacts', async () => {
    state.config.douyin.sendContent = []
    state.config.app.livePhotoMode = 'livephoto_only'
    const audioPath = '/private/tmp/douyin-live-note-bgm-test.mp3'
    fs.writeFileSync(audioPath, 'stub-live-note-audio')
    state.downloadFile.mockImplementation(async (url: string) => {
      if (url.includes('.mp3')) {
        return { filepath: audioPath, totalBytes: 1024 }
      }
      return { filepath: `/tmp/${url.split('/').pop() ?? 'media'}`, totalBytes: 1024 }
    })
    const event = {
      messageId: 'msg-live-note-1',
      reply: vi.fn(async () => ({ messageId: 'reply-live-note-1' })),
      bot: {
        account: { name: 'bot', selfId: 'bot' },
        sendForwardMsg: vi.fn(async () => ({ messageId: 'forward-live-note-1' }))
      },
      contact: { scene: 'group', peer: 'group-1' },
      sender: { userId: 'u1', nick: 'nick' }
    } as any

    state.fetchDouyinOneWork.mockResolvedValueOnce(createDouyinOneWorkResult({
      aweme_id: 'note-live-001',
      aweme_type: 68,
      desc: '实况图正文',
      preview_title: '实况图标题',
      is_slides: true,
      share_url: 'https://www.douyin.com/note/note-live-001',
      music: {
        author: '配乐作者',
        title: '配乐标题',
        play_url: {
          uri: 'https://example.com/note-live-bgm.mp3'
        }
      },
      images: [{
        clip_type: 5,
        url_list: ['https://example.com/note-live-cover.jpg'],
        video: {
          play_addr_h264: {
            uri: 'note-live-uri',
            url_list: ['https://example.com/note-live.mp4']
          }
        }
      }]
    }))

    await new DouYin(event, { type: 'one_work', aweme_id: 'note-live-001' } as any, {
      plainVideoTitle: createContext(false, '抖音')
    }).DouyinHandler({ type: 'one_work', aweme_id: 'note-live-001' } as any)

    expect(event.reply).toHaveBeenCalledWith(expect.objectContaining({
      type: 'record',
      url: expect.stringContaining('base64://')
    }))

    fs.rmSync(audioPath, { force: true })
  })

  it('starts Douyin video download before rendering comments when both are enabled', async () => {
    state.config.douyin.sendContent = ['comment', 'video']
    const order: string[] = []
    state.downloadVideo.mockImplementation(async () => {
      order.push('video')
      return true
    })
    state.render.mockImplementation(async (_event, template) => {
      if (template === 'douyin/comment') order.push('comment')
      return ['rendered-image']
    })
    const event = { messageId: 'msg-1', reply: vi.fn() } as any

    await new DouYin(event, { type: 'one_work', aweme_id: '123' } as any, {
      plainVideoTitle: createContext(true, '抖音')
    }).DouyinHandler({ type: 'one_work', aweme_id: '123' } as any)

    expect(order).toEqual(['video', 'comment'])
  })

  it('falls back to direct share urls in Douyin comment render when video uri is polluted by a cdn url', async () => {
    const noteVideoUrl = 'https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/test-video?is_ssr=1&temp=1'
    state.config.douyin.sendContent = ['comment']
    state.fetchDouyinOneWork.mockResolvedValueOnce(createDouyinOneWorkResult({
      share_url: 'https://www.douyin.com/note/123',
      video: {
        play_addr: {
          uri: 'https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/test-video',
          data_size: 1024,
          url_list: [noteVideoUrl]
        },
        bit_rate: [{
          FPS: 30,
          bit_rate: 1000,
          gear_name: 'normal_720',
          quality_type: 720,
          play_addr: {
            data_size: 1024,
            url_list: [noteVideoUrl],
            width: 1080,
            height: 1920
          }
        }]
      }
    }))
    state.render.mockResolvedValue([{ type: 'image', url: 'rendered-comment-card' }])
    const event = { messageId: 'msg-1', reply: vi.fn() } as any

    await new DouYin(event, { type: 'one_work', aweme_id: '123' } as any, {
      plainVideoTitle: createContext(true, '抖音')
    }).DouyinHandler({ type: 'one_work', aweme_id: '123' } as any)

    const commentRenderCall = state.render.mock.calls.find((call) => call[1] === 'douyin/comment')
    expect(commentRenderCall?.[2]).toMatchObject({
      share_url: noteVideoUrl
    })
    expect(String(commentRenderCall?.[2]?.share_url)).not.toContain('video_id=http')
  })

  it('uses the unwrapped direct video url for Douyin note-video downloads', async () => {
    const directUrl = 'https://sf6-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/oA1uoDVLXAUIrBiszAxMNjNQBCWmwvfELEYBi3'
    const wrappedUrl = `${'https://aweme.snssdk.com/aweme/v1/playwm/?video_id='}${directUrl}&ratio=720p&line=0`
    state.config.douyin.sendContent = ['video']
    state.fetchDouyinOneWork.mockResolvedValueOnce(createDouyinOneWorkResult({
      share_url: 'https://www.douyin.com/note/123',
      video: {
        play_addr: {
          uri: directUrl,
          data_size: 1024,
          url_list: [wrappedUrl]
        },
        bit_rate: [{
          FPS: 30,
          bit_rate: 1000,
          gear_name: 'normal_720',
          quality_type: 720,
          play_addr: {
            data_size: 1024,
            url_list: [wrappedUrl],
            width: 1080,
            height: 1920
          }
        }]
      }
    }))
    const event = { messageId: 'msg-1', reply: vi.fn() } as any

    await new DouYin(event, { type: 'one_work', aweme_id: '123' } as any, {
      plainVideoTitle: createContext(true, '抖音')
    }).DouyinHandler({ type: 'one_work', aweme_id: '123' } as any)

    expect(state.downloadVideo).toHaveBeenCalledWith(
      event,
      expect.objectContaining({
        video_url: directUrl
      }),
      expect.anything()
    )
  })

  it('replies Xiaohongshu title for video notes', async () => {
    const event = { messageId: 'msg-1', reply: vi.fn() } as any

    await new Xiaohongshu(event, { type: 'note', note_id: 'note-1', xsec_token: 'token' } as any, {
      plainVideoTitle: createContext(true, '小红书')
    }).XiaohongshuHandler({ type: 'note', note_id: 'note-1', xsec_token: 'token' } as any)

    expect(event.reply).toHaveBeenCalledWith('【小红书】小红书作者：小红书视频标题')
    expect(state.downloadVideo).toHaveBeenCalled()
  })

  it('selects Xiaohongshu video streams from EF codec buckets', () => {
    const selectedVideo = xiaohongshuProcessVideos({
      EF4: [{
        master_url: 'https://example.com/xhs-ef4.mp4',
        backup_urls: ['https://example.com/xhs-ef4-backup.mp4'],
        stream_desc: 'WM_X264_MP4_web',
        video_codec: 'EF4',
        width: 576,
        height: 1024,
        size: 958688
      }],
      EF5: [{
        master_url: 'https://example.com/xhs-ef5.mp4',
        backup_urls: ['https://example.com/xhs-ef5-backup.mp4'],
        stream_desc: 'WEB_309',
        video_codec: 'EF5',
        width: 576,
        height: 1024,
        size: 760294
      }]
    }, 'adapt', 100)

    expect(selectedVideo).toMatchObject({
      master_url: 'https://example.com/xhs-ef4.mp4',
      backup_urls: ['https://example.com/xhs-ef4-backup.mp4']
    })
  })

  it('downloads an EF codec stream when the cached parsed post has no usable video', async () => {
    const noteId = 'note-video-ef4'
    state.fetchXhsNoteBundle.mockResolvedValueOnce({
      data: {
        data: {
          items: [{
            note_card: {
              title: 'EF4 视频笔记',
              desc: 'desc',
              note_id: noteId,
              interact_info: {},
              user: { nickname: '小红书作者' },
              image_list: [],
              time: 0,
              ip_location: '',
              video: {
                media: {
                  stream: {
                    EF4: [{
                      master_url: 'https://example.com/xhs-ef4.mp4',
                      backup_urls: ['https://example.com/xhs-ef4-backup.mp4'],
                      stream_desc: 'WM_X264_MP4_web',
                      video_codec: 'EF4',
                      width: 576,
                      height: 1024,
                      size: 958688
                    }]
                  }
                }
              }
            }
          }]
        }
      }
    })
    const event = { messageId: 'msg-1', reply: vi.fn() } as any

    await new Xiaohongshu(event, {
      type: 'note',
      note_id: noteId,
      xsec_token: 'token'
    } as any).XiaohongshuHandler({
      type: 'note',
      note_id: noteId,
      xsec_token: 'token'
    } as any)

    expect(state.downloadVideo).toHaveBeenCalledWith(
      event,
      expect.objectContaining({
        video_url: 'https://example.com/xhs-ef4.mp4',
        backupUrls: ['https://example.com/xhs-ef4-backup.mp4'],
        knownFileSizeBytes: 958688
      }),
      { message_id: 'msg-1' }
    )
    expect(event.reply).not.toHaveBeenCalledWith({ type: 'video', url: undefined })
  })

  it('rejects Xiaohongshu video notes without any usable video URL', async () => {
    const noteId = 'note-video-without-url'
    state.fetchXhsNoteBundle.mockResolvedValueOnce({
      data: {
        data: {
          items: [{
            note_card: {
              title: '无地址视频笔记',
              desc: 'desc',
              note_id: noteId,
              interact_info: {},
              user: { nickname: '小红书作者' },
              image_list: [],
              time: 0,
              ip_location: '',
              video: {
                media: {
                  stream: {
                    EF6: []
                  }
                }
              }
            }
          }]
        }
      }
    })
    const event = { messageId: 'msg-1', reply: vi.fn() } as any

    await expect(new Xiaohongshu(event, {
      type: 'note',
      note_id: noteId,
      xsec_token: 'token'
    } as any).XiaohongshuHandler({
      type: 'note',
      note_id: noteId,
      xsec_token: 'token'
    } as any)).rejects.toThrow('小红书视频地址为空')

    expect(event.reply).not.toHaveBeenCalledWith({ type: 'video', url: undefined })
    expect(state.downloadVideo).not.toHaveBeenCalled()
  })

  it('replies Xiaohongshu title for image notes', async () => {
    state.config.xiaohongshu.sendContent = ['image']
    const noteId = 'note-image-1'
    const event = {
      messageId: 'msg-1',
      reply: vi.fn(),
      bot: { account: { name: 'bot', selfId: 'bot' } },
      sender: { userId: 'u1', nick: 'nick' }
    } as any
    const handler = new Xiaohongshu(event, { type: 'note', note_id: noteId, xsec_token: 'token' } as any, {
      plainVideoTitle: createContext(true, '小红书')
    }) as any
    state.fetchXhsNoteBundle.mockResolvedValueOnce({
      data: {
        data: {
          items: [{
            note_card: {
              title: '小红书图文标题',
              desc: 'desc',
              note_id: noteId,
              interact_info: {},
              user: { nickname: '小红书图文作者' },
              image_list: [{ url_default: 'https://example.com/xhs-image.jpg' }],
              time: 0,
              ip_location: ''
            }
          }]
        }
      }
    })

    await handler.XiaohongshuHandler({ type: 'note', note_id: noteId, xsec_token: 'token' } as any)

    expect(event.reply).toHaveBeenCalledWith(expect.stringMatching(/^【小红书】/))
    expect(event.reply).toHaveBeenCalledWith({ type: 'image', url: 'https://example.com/xhs-image.jpg' })
  })

  it('does not reply Xiaohongshu title for image notes when image type is disabled', async () => {
    state.config.xiaohongshu.sendContent = ['image']
    const noteId = 'note-image-2'
    const event = {
      messageId: 'msg-1',
      reply: vi.fn(),
      bot: { account: { name: 'bot', selfId: 'bot' } },
      sender: { userId: 'u1', nick: 'nick' }
    } as any
    const handler = new Xiaohongshu(event, { type: 'note', note_id: noteId, xsec_token: 'token' } as any, {
      plainVideoTitle: createContext(true, '小红书', ['video'])
    }) as any
    state.fetchXhsNoteBundle.mockResolvedValueOnce({
      data: {
        data: {
          items: [{
            note_card: {
              title: '小红书图文标题',
              desc: 'desc',
              note_id: noteId,
              interact_info: {},
              user: { nickname: '小红书图文作者' },
              image_list: [{ url_default: 'https://example.com/xhs-image.jpg' }],
              time: 0,
              ip_location: ''
            }
          }]
        }
      }
    })

    await handler.XiaohongshuHandler({ type: 'note', note_id: noteId, xsec_token: 'token' } as any)

    expect(event.reply).not.toHaveBeenCalledWith('【小红书】小红书图文作者：小红书图文标题')
  })

  it('replies Bilibili title for image dynamics', async () => {
    const dynamicId = 'dynamic-draw-title-1'
    const event = {
      reply: vi.fn(),
      bot: { account: { name: 'bot', selfId: 'bot' } },
      sender: { userId: 'u1', nick: 'nick' }
    } as any
    state.fetchBiliDynamicDetail.mockResolvedValueOnce(createBilibiliDrawDynamicDetailResult(dynamicId))

    await new Bilibili(event, { type: 'dynamic_info' }, {
      plainVideoTitle: createContext(true, 'B站')
    }).BilibiliHandler({ dynamic_id: dynamicId } as any)

    expect(event.reply).toHaveBeenCalledWith('【B站】主播：B站图文标题')
  })

  it('disables multi-page rendering for Bilibili image dynamic cards', async () => {
    const dynamicId = 'dynamic-draw-render-1'
    const event = {
      reply: vi.fn(),
      bot: { account: { name: 'bot', selfId: 'bot' } },
      sender: { userId: 'u1', nick: 'nick' }
    } as any
    state.fetchBiliDynamicDetail.mockResolvedValueOnce(createBilibiliDrawDynamicDetailResult(dynamicId))

    await new Bilibili(event, { type: 'dynamic_info' }, {
      plainVideoTitle: createContext(false, 'B站')
    }).BilibiliHandler({ dynamic_id: dynamicId } as any)

    expect(state.render).toHaveBeenCalledWith(
      event,
      'bilibili/dynamic/DYNAMIC_TYPE_DRAW',
      expect.anything(),
      { multiPage: false }
    )
  })

  it('does not reply Bilibili title for image dynamics when image type is disabled', async () => {
    const dynamicId = 'dynamic-draw-title-2'
    const event = {
      reply: vi.fn(),
      bot: { account: { name: 'bot', selfId: 'bot' } },
      sender: { userId: 'u1', nick: 'nick' }
    } as any
    state.fetchBiliDynamicDetail.mockResolvedValueOnce(createBilibiliDrawDynamicDetailResult(dynamicId))

    await new Bilibili(event, { type: 'dynamic_info' }, {
      plainVideoTitle: createContext(true, 'B站', ['video'])
    }).BilibiliHandler({ dynamic_id: dynamicId } as any)

    expect(event.reply).not.toHaveBeenCalledWith('【B站】主播：B站图文标题')
  })

  it('does not fetch Xiaohongshu emoji data when only video content is enabled', async () => {
    const event = { messageId: 'msg-1', reply: vi.fn() } as any

    await new Xiaohongshu(event, { type: 'note', note_id: 'note-1', xsec_token: 'token' } as any, {
      plainVideoTitle: createContext(true, '小红书')
    }).XiaohongshuHandler({ type: 'note', note_id: 'note-1', xsec_token: 'token' } as any)

    expect(state.fetchXhsEmojiList).not.toHaveBeenCalled()
    expect(state.downloadVideo).toHaveBeenCalled()
  })

  it('fetches Xiaohongshu emoji data when info content is enabled', async () => {
    state.config.xiaohongshu.sendContent = ['info']
    const event = { messageId: 'msg-1', reply: vi.fn() } as any

    await new Xiaohongshu(event, { type: 'note', note_id: 'note-1', xsec_token: 'token' } as any, {
      plainVideoTitle: createContext(false, '小红书')
    }).XiaohongshuHandler({ type: 'note', note_id: 'note-1', xsec_token: 'token' } as any)

    expect(state.fetchXhsEmojiList).toHaveBeenCalled()
  })

  it('does not crash when Xiaohongshu video notes have no cover image list', async () => {
    state.config.xiaohongshu.sendContent = ['info', 'video']
    const noteId = 'note-video-no-cover'
    state.fetchXhsNoteBundle.mockResolvedValueOnce({
      data: {
        data: {
          items: [{
            note_card: {
              title: '无封面视频笔记',
              desc: 'desc',
              note_id: noteId,
              interact_info: {},
              user: { nickname: '小红书作者' },
              image_list: [],
              time: 0,
              ip_location: '',
              video: {
                media: {
                  stream: {
                    h264: [{
                      master_url: 'https://example.com/xhs.mp4',
                      backup_urls: [],
                      stream_desc: '清晰度',
                      size: 1024
                    }]
                  }
                },
                url_default: 'https://example.com/xhs-fallback.mp4'
              }
            }
          }]
        }
      }
    })
    const event = { messageId: 'msg-1', reply: vi.fn() } as any

    await expect(new Xiaohongshu(event, { type: 'note', note_id: noteId, xsec_token: 'token' } as any, {
      plainVideoTitle: createContext(true, '小红书')
    }).XiaohongshuHandler({ type: 'note', note_id: noteId, xsec_token: 'token' } as any)).resolves.toBe(true)

    expect(state.render).not.toHaveBeenCalledWith(
      expect.anything(),
      'xiaohongshu/noteInfo',
      expect.anything()
    )
    expect(state.downloadVideo).toHaveBeenCalled()
  })

  it('throws an explicit error when Xiaohongshu note detail is empty', async () => {
    const noteId = 'note-empty-1'
    state.fetchXhsNoteBundle.mockRejectedValueOnce(new Error('小红书笔记详情为空'))
    const event = { messageId: 'msg-1', reply: vi.fn() } as any

    await expect(new Xiaohongshu(event, { type: 'note', note_id: noteId, xsec_token: 'token' } as any, {
      plainVideoTitle: createContext(true, '小红书')
    }).XiaohongshuHandler({ type: 'note', note_id: noteId, xsec_token: 'token' } as any)).rejects.toThrow('小红书笔记详情为空')
  })

  it('does not reply title when the context is disabled', async () => {
    const event = { messageId: 'msg-1', reply: vi.fn() } as any

    await new DouYin(event, { type: 'one_work', aweme_id: '123' } as any, {
      plainVideoTitle: createContext(false, '抖音')
    }).DouyinHandler({ type: 'one_work', aweme_id: '123' } as any)

    expect(event.reply).not.toHaveBeenCalledWith(expect.stringMatching(/^抖音标题：/))
    expect(state.downloadVideo).toHaveBeenCalled()
  })
})
