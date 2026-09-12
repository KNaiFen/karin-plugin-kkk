import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createPlainVideoTitleContext } from '../src/module/utils/PlainTitleReply'

const state = vi.hoisted(() => ({
  buildTikTokNetworkOptions: vi.fn(),
  downloadVideo: vi.fn(),
  fetchTikTokVideoDetail: vi.fn()
}))

vi.mock('node-karin', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    mark: vi.fn(),
    warn: vi.fn()
  },
  Message: class {}
}))

vi.mock('@/module', () => ({
  Base: class {
    e: any

    constructor (e: any) {
      this.e = e
    }
  },
  baseHeaders: {
    'User-Agent': 'Base UA'
  },
  createPlainVideoTitleContext: (enabled: boolean, platformLabel: 'TikTok') => ({
    enabled,
    platformLabel,
    sent: false
  }),
  downloadVideo: (...args: unknown[]) => state.downloadVideo(...args),
  replyPlainVideoTitle: async (event: any, context: { enabled: boolean, platformLabel: string, sent: boolean }, title: unknown, author?: unknown) => {
    if (!context.enabled || context.sent) return false
    const normalizedTitle = String(title ?? '').replace(/\s+/g, ' ').trim()
    if (!normalizedTitle) return false
    const normalizedAuthor = String(author ?? '').replace(/\s+/g, ' ').trim()
    context.sent = true
    await event.reply(normalizedAuthor
      ? `【${context.platformLabel}】${normalizedAuthor}：${normalizedTitle}`
      : `${context.platformLabel}标题：${normalizedTitle}`)
    return true
  }
}))

vi.mock('@/module/utils/Config', () => ({
  Config: {
    app: {
      parseTip: true
    },
    request: {
      timeout: 10000,
      'User-Agent': 'Unit Test UA',
      proxy: {
        switch: false
      },
      headers: {}
    },
    cookies: {
      tiktok: 'ttwid=config-ttwid'
    }
  }
}))

vi.mock('@/platform/tiktok/api', () => ({
  allowEnvironmentProxyForTikTok: vi.fn(() => ({ proxy: false })),
  buildTikTokConfiguredRequestOptions: vi.fn(() => ({ headers: {}, proxy: false })),
  buildTikTokNetworkOptions: () => state.buildTikTokNetworkOptions(),
  fetchTikTokVideoDetail: (...args: unknown[]) => state.fetchTikTokVideoDetail(...args)
}))

vi.mock('@/module/summaryParse/parsedPostCache', () => ({
  resolveParsedPostWithCache: async (link: { url: string }) => {
    const detail = await state.fetchTikTokVideoDetail(link.url)
    const title = String(detail.item?.desc ?? '')
    const author = detail.item?.author?.nickname
    const [url, ...backupUrls] = detail.urls ?? []
    const video = {
      url,
      backupUrls,
      title,
      headers: {
        Cookie: detail.cookie,
        Referer: 'https://www.tiktok.com/',
        'User-Agent': detail.userAgent
      }
    }
    return {
      parsedPost: {
        platform: 'tiktok',
        platformLabel: 'TikTok',
        subtype: 'video',
        title,
        author: author ? { name: author } : undefined,
        summary: title,
        url: detail.pageUrl,
        contentBlocks: [{ type: 'text', text: title }],
        images: [],
        videos: [video],
        primaryVideo: video,
        stats: [],
        meta: [],
        raw: detail
      },
      cacheHit: false
    }
  }
}))

const { TikTok } = await import('../src/platform/tiktok/tiktok')

describe('TikTok handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.buildTikTokNetworkOptions.mockReturnValue({ proxy: false })
    state.downloadVideo.mockResolvedValue(true)
  })

  it('downloads the resolved TikTok video with backup URLs and TikTok headers', async () => {
    state.fetchTikTokVideoDetail.mockResolvedValue({
      item: {
        id: '7643493503778966797',
        desc: 'A TikTok title'
      },
      urls: [
        'https://video.example/main.mp4',
        'https://video.example/backup.mp4'
      ],
      cookie: 'ttwid=page-ttwid; msToken=page-ms-token',
      pageUrl: 'https://www.tiktok.com/@good.ball21/video/7643493503778966797',
      userAgent: 'TikTok UA'
    })
    const event = {
      messageId: 'msg-1',
      reply: vi.fn(async () => ({ messageId: 'tip-1' }))
    } as any

    const result = await new TikTok(event, {
      type: 'one_work',
      item_id: '7643493503778966797',
      url: 'https://www.tiktok.com/@good.ball21/video/7643493503778966797',
      cookie: 'ttwid=page-ttwid'
    }).TikTokHandler()

    expect(result).toBe(true)
    expect(event.reply).toHaveBeenCalledWith('检测到 TikTok 链接，开始解析')
    expect(state.downloadVideo).toHaveBeenCalledWith(
      event,
      expect.objectContaining({
        video_url: 'https://video.example/main.mp4',
        backupUrls: ['https://video.example/backup.mp4'],
        headers: expect.objectContaining({
          Cookie: 'ttwid=page-ttwid; msToken=page-ms-token',
          Referer: 'https://www.tiktok.com/',
          'User-Agent': 'TikTok UA'
        }),
        networkOptions: { proxy: false }
      }),
      {
        message_id: 'msg-1'
      }
    )
  })

  it('replies the TikTok author and title before downloading for a link-only parse', async () => {
    const order: string[] = []
    state.fetchTikTokVideoDetail.mockResolvedValue({
      item: {
        id: '7643493503778966797',
        desc: 'A TikTok title',
        author: {
          nickname: 'TikTok Creator'
        }
      },
      urls: [
        'https://video.example/main.mp4'
      ],
      cookie: 'ttwid=page-ttwid; msToken=page-ms-token',
      pageUrl: 'https://www.tiktok.com/@good.ball21/video/7643493503778966797',
      userAgent: 'TikTok UA'
    })
    state.downloadVideo.mockImplementation(async () => {
      order.push('download')
      return true
    })
    const event = {
      messageId: 'msg-1',
      reply: vi.fn(async (message: unknown) => {
        order.push(`reply:${String(message)}`)
        return { messageId: 'reply-1' }
      })
    } as any

    await new TikTok(event, {
      type: 'one_work',
      item_id: '7643493503778966797',
      url: 'https://www.tiktok.com/@good.ball21/video/7643493503778966797',
      cookie: 'ttwid=page-ttwid'
    }, {
      plainVideoTitle: createPlainVideoTitleContext(true, 'TikTok')
    }).TikTokHandler()

    expect(event.reply).toHaveBeenCalledWith('【TikTok】TikTok Creator：A TikTok title')
    expect(order).toEqual([
      'reply:检测到 TikTok 链接，开始解析',
      'reply:【TikTok】TikTok Creator：A TikTok title',
      'download'
    ])
  })
})
