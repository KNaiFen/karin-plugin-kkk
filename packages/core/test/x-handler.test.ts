import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createPlainVideoTitleContext } from '../src/module/utils/PlainTitleReply'

const state = vi.hoisted(() => ({
  buildXNetworkOptions: vi.fn(),
  downloadVideo: vi.fn(),
  fetchXDetail: vi.fn(),
  render: vi.fn()
}))

vi.mock('node-karin', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  },
  segment: {
    image: vi.fn((url: string) => ({ type: 'image', url }))
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
  buildConfiguredRequestOptions: vi.fn(() => ({
    timeout: 10000,
    headers: {
      'User-Agent': 'Base UA'
    }
  })),
  createPlainVideoTitleContext: (enabled: boolean, platformLabel: 'X') => ({
    enabled,
    platformLabel,
    sent: false
  }),
  downloadVideo: (...args: unknown[]) => state.downloadVideo(...args),
  Render: (...args: unknown[]) => state.render(...args),
  replyRenderedImages: vi.fn(async (event: any, images: unknown[]) => {
    await event.reply(images)
    return true
  }),
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
      parseTip: true,
      longTaskCompletionNotify: true,
      longTaskCompletionNotifyThresholdMs: 300000
    },
    cookies: {
      douyin: '',
      bilibili: '',
      kuaishou: '',
      xiaohongshu: '',
      weibo: '',
      zhihu: '',
      heybox: ''
    },
    request: {
      timeout: 10000,
      'User-Agent': 'Unit Test UA',
      proxy: {
        switch: false
      }
    },
    x: {
      sendContent: ['info', 'image', 'video'],
      proxy: {
        switch: true,
        host: '127.0.0.1',
        port: 7890,
        protocol: 'http',
        auth: {
          username: 'x-user',
          password: 'x-pass'
        }
      },
      plainTitleReply: {
        switch: true,
        types: ['video', 'image', 'text']
      },
      renderCard: {
        enable: true,
        includeImages: false
      }
    }
  }
}))

vi.mock('@/platform/x/api', () => ({
  fetchXDetail: (...args: unknown[]) => state.fetchXDetail(...args)
}))

vi.mock('@/platform/x/request', () => ({
  buildXNetworkOptions: () => state.buildXNetworkOptions()
}))

vi.mock('../src/platform/resolveParsedPost', () => ({
  resolveXParsedPost: async (url: string) => {
    const detail = await state.fetchXDetail(url)
    const status = detail.status
    return {
      platform: 'x',
      platformLabel: 'X',
      subtype: 'status',
      title: String(status.text).split('\n')[0],
      summary: String(status.text),
      url: detail.url,
      author: {
        name: status.author.name
      },
      contentBlocks: [{ type: 'text', text: status.text }],
      images: status.images ?? [],
      videos: status.video ? [{ url: status.video.url, title: String(status.text).split('\n')[0] }] : [],
      primaryVideo: status.video ? { url: status.video.url, cover: status.video.cover, title: String(status.text).split('\n')[0] } : null,
      stats: [],
      meta: [],
      raw: detail
    }
  }
}))

vi.mock('@/module/summaryParse/parsedPostCache', () => ({
  resolveParsedPostWithCache: async (link: { url: string }) => {
    const detail = await state.fetchXDetail(link.url)
    const status = detail.status
    return {
      parsedPost: {
        platform: 'x',
        platformLabel: 'X',
        subtype: 'status',
        title: String(status.text).split('\n')[0],
        summary: String(status.text),
        url: detail.url,
        author: {
          name: status.author.name
        },
        contentBlocks: [{ type: 'text', text: status.text }],
        images: status.images ?? [],
        videos: status.video ? [{ url: status.video.url, title: String(status.text).split('\n')[0] }] : [],
        primaryVideo: status.video ? { url: status.video.url, cover: status.video.cover, title: String(status.text).split('\n')[0] } : null,
        stats: [],
        meta: [],
        raw: detail
      },
      cacheHit: false
    }
  }
}))

vi.mock('../src/platform/parsedPostAssets', () => ({
  prepareParsedPostForCardRender: async (post: unknown) => post
}))

vi.mock('../src/platform/parsedPostAdapters', () => ({
  buildExternalPostCardFromParsedPost: (post: unknown) => post,
  buildParsedPostImageReplyElements: async (post: any) => post.images.map((image: string) => ({ type: 'image', file: image })),
  buildParsedPostInfoText: (post: any) => `info:${post.title}`,
  buildParsedPostVideoDownloadEntries: (post: any) => {
    const primaryVideo = post.primaryVideo ?? post.video ?? post.videos?.[0]
    return primaryVideo ? [{ video: primaryVideo, options: { video_url: primaryVideo.url } }] : []
  }
}))

vi.mock('../src/platform/externalPostCard', () => ({
  renderExternalPostCard: vi.fn(async (event: any, card: any) => {
    await state.render(event, 'other/external-post', card, { multiPage: true })
    await event.reply([{ type: 'image', file: 'render-x-1' }])
    return true
  })
}))

const { X } = await import('../src/platform/x/x')

describe('X handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.buildXNetworkOptions.mockReturnValue({
      proxy: {
        host: '127.0.0.1',
        port: 7890,
        protocol: 'http',
        auth: {
          username: 'x-user',
          password: 'x-pass'
        }
      }
    })
    state.render.mockResolvedValue([{ type: 'image', file: 'render-x-1' }])
    state.downloadVideo.mockResolvedValue(true)
  })

  it('renders an external post card and downloads the primary X video', async () => {
    state.fetchXDetail.mockResolvedValue({
      type: 'status',
      url: 'https://x.com/cakedochi/status/2050564108114899179',
      status: {
        id: '2050564108114899179',
        text: '主帖标题\n第二行',
        sensitive: false,
        author: {
          name: 'saki ❤︎',
          screenName: 'cakedochi',
          avatar: 'https://pbs.twimg.com/profile_images/root_normal.jpg'
        },
        images: ['https://pbs.twimg.com/media/root-image.jpg:orig'],
        video: {
          url: 'https://video.twimg.com/root-1280.mp4',
          cover: 'https://pbs.twimg.com/amplify_video_thumb/root-cover.jpg',
          duration: 6
        },
        stats: {
          view: 12345,
          like: 88,
          comment: 6,
          bookmark: 2144,
          share: 13
        },
        quotedStatus: {
          id: '2050797873684762975',
          text: '引用帖',
          sensitive: false,
          author: {
            name: 'みらつ',
            screenName: 'miratsu169'
          },
          images: ['https://pbs.twimg.com/media/quoted.jpg:orig'],
          stats: {
            view: 456,
            like: 20,
            comment: 2,
            bookmark: 1,
            share: 3
          }
        }
      }
    })

    const event = {
      messageId: 'msg-1',
      reply: vi.fn(async () => true)
    } as any

    const result = await new X(event, {
      type: 'status',
      statusId: '2050564108114899179',
      screenName: 'cakedochi',
      url: 'https://x.com/cakedochi/status/2050564108114899179'
    }, {
      plainVideoTitle: createPlainVideoTitleContext(true, 'X')
    }).XHandler()

    expect(result).toBe(true)
    expect(event.reply).toHaveBeenCalledWith('检测到 X 链接，开始解析')
    expect(event.reply).toHaveBeenCalledWith('【X】saki ❤︎：主帖标题')
    expect(state.render).toHaveBeenCalledWith(
      event,
      'other/external-post',
      expect.objectContaining({
        title: '主帖标题',
        url: 'https://x.com/cakedochi/status/2050564108114899179'
      }),
      { multiPage: true }
    )
    expect(state.downloadVideo).toHaveBeenCalledWith(
      event,
      expect.objectContaining({
        video_url: 'https://video.twimg.com/root-1280.mp4',
        headers: expect.objectContaining({
          Referer: 'https://x.com/cakedochi/status/2050564108114899179',
          'User-Agent': 'Base UA'
        }),
        networkOptions: {
          proxy: {
            host: '127.0.0.1',
            port: 7890,
            protocol: 'http',
            auth: {
              username: 'x-user',
              password: 'x-pass'
            }
          }
        }
      }),
      {
        message_id: 'msg-1'
      }
    )
  })
})
