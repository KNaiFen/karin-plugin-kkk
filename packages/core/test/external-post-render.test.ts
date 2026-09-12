import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  config: {
    app: {
      parseTip: false
    },
    request: {
      timeout: 10000,
      'User-Agent': 'Unit Test UA',
      proxy: {
        switch: false
      }
    },
    cookies: {
      heybox: 'x_xhh_tokenid=token;',
      zhihu: '',
      tieba: '',
      weibo: ''
    },
    heybox: {
      sendContent: ['info', 'image'],
      renderCard: {
        enable: true,
        includeImages: false
      }
    },
    tieba: {
      sendContent: ['info', 'image'],
      plainTitleReply: false,
      renderCard: {
        enable: true,
        includeImages: false
      }
    },
    weibo: {
      sendContent: ['info', 'image'],
      plainTitleReply: false,
      renderCard: {
        enable: true,
        includeImages: false
      }
    },
    zhihu: {
      sendContent: ['info', 'image'],
      plainTitleReply: false,
      renderCard: {
        enable: true,
        includeImages: false
      }
    }
  },
  fetchHeyboxDetail: vi.fn(),
  fetchTiebaDetail: vi.fn(),
  fetchWeiboDetail: vi.fn(),
  fetchZhihuDetail: vi.fn(),
  executeSafeAxiosRequest: vi.fn(),
  axiosGet: vi.fn(),
  render: vi.fn(),
  downloadVideo: vi.fn()
}))

vi.mock('node-karin/axios', () => ({
  default: {
    create: vi.fn(() => ({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      }
    })),
    get: (...args: unknown[]) => state.axiosGet(...args)
  }
}))

vi.mock('node-karin', () => ({
  common: {
    makeForward: vi.fn((elements: unknown[]) => elements)
  },
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  segment: {
    image: vi.fn((url: string) => ({ type: 'image', url }))
  }
}))

vi.mock('@/module', () => ({
  Base: class {
    e: any
    headers = {}

    constructor (e: any) {
      this.e = e
    }
  },
  baseHeaders: { 'User-Agent': 'Unit Test UA' },
  buildConfiguredRequestOptions: vi.fn(() => ({
    headers: {
      'User-Agent': 'Unit Test UA'
    },
    timeout: 10000,
    proxy: false,
    maxRedirects: 5
  })),
  createPlainVideoTitleContext: () => ({ enabled: false, sent: false, types: [] }),
  downloadVideo: (...args: unknown[]) => state.downloadVideo(...args),
  Render: (...args: unknown[]) => state.render(...args),
  replyRenderedImages: vi.fn(async (event: any, images: unknown[], options?: Record<string, unknown>) => {
    if (Array.isArray(images) && images.length > 3) {
      await event.bot.sendForwardMsg(event.contact, images, options)
      return true
    }
    await event.reply(images)
    return true
  }),
  replyPlainVideoTitle: vi.fn()
}))

vi.mock('@/module/utils/Config', () => ({
  Config: state.config
}))

vi.mock('@/module/utils/LongTaskCompletionNotify', () => ({
  replyAndRecordLongTaskCompletionAnchor: vi.fn(async (event: any, payload: unknown) => {
    await event.reply(Array.isArray(payload) && payload.length === 1 ? payload[0] : payload)
  })
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

vi.mock('@/module/utils/OutboundRequest', () => ({
  executeSafeAxiosRequest: (...args: unknown[]) => state.executeSafeAxiosRequest(...args)
}))

vi.mock('@/module/utils/sharedCache', () => ({
  buildSharedCacheHash: (...parts: string[]) => parts.join(':'),
  buildSharedCachePath: (identity: { key: string }) => `/tmp/shared-cache/render-assets/${identity.key}.txt`,
  isSharedCacheFileFresh: vi.fn(() => false),
  onSharedCacheFileRemoved: vi.fn(() => () => {}),
  writeSharedCacheFileAtomically: vi.fn(() => true)
}))

vi.mock('@/module/summaryParse/parsedPostCache', async () => {
  const { resolveParsedPostFromResolvedLink } = await vi.importActual<any>('@/platform/resolveParsedPost/registry')
  const { createExternalPostContentFromHtml } = await vi.importActual<any>('@/platform/externalPostCard')
  return {
    resolveParsedPostWithCache: async (link: { platform: string, url: string }) => {
      const parsedPost = await resolveParsedPostFromResolvedLink(link)
      if (link.platform !== 'zhihu') {
        return { parsedPost, cacheHit: false }
      }

      const detail = parsedPost.raw.detail
      const html = detail.type === 'article' ? detail.article.content : detail.answer.content
      const contentBlocks = createExternalPostContentFromHtml(html, detail.richContent.images)
        .map((block: any) => block.type === 'html'
          ? { type: 'html', html: block.html }
          : block)
      return {
        parsedPost: { ...parsedPost, contentBlocks },
        cacheHit: false
      }
    }
  }
})

vi.mock('@/platform/heybox', () => ({
  getHeyboxID: vi.fn(async (url: string) => {
    const linkId = /\/(?:app\/bbs\/link|bbs\/app\/link)\/([A-Za-z0-9_-]+)/.exec(new URL(url).pathname)?.[1]
    return linkId
      ? { type: 'link', link_id: linkId, url }
      : { type: 'unknown', url }
  })
}))

vi.mock('../src/platform/heybox/api', () => ({
  fetchHeyboxDetail: (...args: unknown[]) => state.fetchHeyboxDetail(...args)
}))

vi.mock('../src/platform/tieba/api', () => ({
  getTiebaContentText: (parts: any[]) => parts
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join(''),
  getTiebaPostDetail: (...args: unknown[]) => state.fetchTiebaDetail(...args),
  tiebaMediaHeaders: vi.fn(() => ({}))
}))

vi.mock('../src/platform/weibo/api', () => ({
  buildWeiboCredentialHeaders: vi.fn(() => ({})),
  fetchWeiboDetail: (...args: unknown[]) => state.fetchWeiboDetail(...args),
  shouldPrefetchWeiboMedia: vi.fn(() => true)
}))

vi.mock('../src/platform/zhihu/api', () => ({
  fetchZhihuDetail: (...args: unknown[]) => state.fetchZhihuDetail(...args)
}))

const { Heybox } = await import('../src/platform/heybox/heybox')
const { Tieba } = await import('../src/platform/tieba/tieba')
const { Weibo } = await import('../src/platform/weibo/weibo')
const { Zhihu } = await import('../src/platform/zhihu/zhihu')

const createEvent = () => {
  const replies: unknown[] = []
  const sendForwardMsg = vi.fn(async (_contact: unknown, payload: unknown) => ({ payload }))
  return {
    replies,
    sendForwardMsg,
    event: {
      messageId: 'msg-1',
      contact: { scene: 'group', peer: '1000' },
      sender: { userId: '2000', nick: 'tester' },
      bot: {
        account: { name: 'bot', selfId: 'bot' },
        sendForwardMsg
      },
      reply: vi.fn(async (payload: unknown) => {
        replies.push(payload)
        return true
      })
    } as any
  }
}

const expectExternalPostRenderCalledWith = (event: any, data: Record<string, unknown>) => {
  expect(state.render).toHaveBeenCalledWith(
    event,
    'other/external-post',
    expect.objectContaining(data),
    { multiPage: true }
  )
}

describe('external post render cards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.executeSafeAxiosRequest.mockImplementation(async (config: any) => ({
      response: await state.axiosGet(config.url)
    }))
    state.axiosGet.mockImplementation(async (url: string) => {
      const source = String(url)
      if (source.includes('shared-image-a')) {
        return {
          data: Buffer.from('render-image-a'),
          headers: {
            'content-type': 'image/jpeg'
          }
        }
      }

      if (source.includes('shared-image-b')) {
        return {
          data: Buffer.from('render-image-b'),
          headers: {
            'content-type': 'image/jpeg'
          }
        }
      }

      if (source.includes('weibo-image')) {
        return {
          data: Buffer.from('render-weibo-image'),
          headers: {
            'content-type': 'image/jpeg'
          }
        }
      }

      if (source.includes('repost-image')) {
        return {
          data: Buffer.from('render-repost-image'),
          headers: {
            'content-type': 'image/jpeg'
          }
        }
      }

      if (source.includes('avatar') && source.endsWith('.png')) {
        return {
          data: Buffer.from('avatar-png'),
          headers: {
            'content-type': 'image/png'
          }
        }
      }

      if (source.includes('cover') && source.endsWith('.webp')) {
        return {
          data: Buffer.from('cover-webp'),
          headers: {
            'content-type': 'image/webp'
          }
        }
      }

      return {
        data: Buffer.from('render-image'),
        headers: {
          'content-type': 'image/jpeg'
        }
      }
    })
    state.render.mockResolvedValue(['rendered-card'])
    state.downloadVideo.mockResolvedValue(true)
    state.config.heybox.sendContent = ['info', 'image']
    state.config.tieba.sendContent = ['info', 'image']
    state.config.weibo.sendContent = ['info', 'image']
    state.config.zhihu.sendContent = ['info', 'image']
    state.config.heybox.renderCard = { enable: true, includeImages: false }
    state.config.tieba.renderCard = { enable: true, includeImages: false }
    state.config.weibo.renderCard = { enable: true, includeImages: false }
    state.config.zhihu.renderCard = { enable: true, includeImages: false }
  })

  it('renders Zhihu rich text and inline images in source order when info card is enabled', async () => {
    state.fetchZhihuDetail.mockResolvedValue({
      type: 'article',
      url: 'https://zhuanlan.zhihu.com/p/1',
      article: {
        id: '1',
        title: '知乎标题',
        author: { name: '知乎作者', avatarUrl: 'https://example.com/zhihu-avatar.jpg' },
        content: '<p><strong>重点</strong>知乎正文</p><figure><img src="https://example.com/zhihu-1.jpg" /></figure><p>下一段</p>',
        voteupCount: 10,
        commentCount: 2,
        ipInfo: '北京'
      },
      richContent: {
        text: '重点知乎正文\n下一段',
        images: ['https://example.com/zhihu-1.jpg'],
        lensIds: [],
        videos: []
      }
    })
    const { event, replies } = createEvent()

    await new Zhihu(event, { type: 'article', articleId: '1', url: 'https://zhuanlan.zhihu.com/p/1' } as any).ZhihuHandler()

    expectExternalPostRenderCalledWith(event, {
      platform: expect.objectContaining({ label: '知乎' }),
      title: '知乎标题',
      images: ['https://example.com/zhihu-1.jpg'],
      content: [
        expect.objectContaining({ type: 'html', html: expect.stringContaining('<strong>重点</strong>') }),
        { type: 'image', url: 'https://example.com/zhihu-1.jpg' },
        expect.objectContaining({ type: 'html', html: expect.stringContaining('下一段') })
      ]
    })
    expect(replies).toEqual([['rendered-card']])
  })

  it('renders Tieba text and images in source order when info card is enabled', async () => {
    state.fetchTiebaDetail.mockResolvedValue({
      tid: '10772909650',
      url: 'https://tieba.baidu.com/p/10772909650',
      title: '贴吧标题',
      forum: { name: '测试吧' },
      author: { name: '贴吧作者', avatar: 'https://example.com/tieba-avatar.jpg' },
      stats: { view: 1, like: 2, comment: 3, share: 4 },
      content: [
        { type: 'text', text: '贴吧第一段' },
        { type: 'image', url: 'https://example.com/tieba-1.jpg' },
        { type: 'text', text: '贴吧第二段' }
      ],
      comments: []
    })
    const { event, replies } = createEvent()

    await new Tieba(event, { type: 'post', tid: '10772909650', url: 'https://tieba.baidu.com/p/10772909650' } as any).TiebaHandler({ type: 'post', tid: '10772909650' } as any)

    expectExternalPostRenderCalledWith(event, {
      platform: expect.objectContaining({ label: '贴吧' }),
      title: '贴吧标题',
      images: ['https://example.com/tieba-1.jpg'],
      content: [
        { type: 'text', text: '贴吧第一段' },
        { type: 'image', url: 'https://example.com/tieba-1.jpg' },
        { type: 'text', text: '贴吧第二段' }
      ]
    })
    expect(replies).toEqual([['rendered-card']])
  })

  it('renders Heybox text and images in source order when info card is enabled', async () => {
    state.fetchHeyboxDetail.mockResolvedValue({
      linkId: '77f871fa97e9',
      url: 'https://www.xiaoheihe.cn/app/bbs/link/77f871fa97e9',
      title: '小黑盒标题',
      description: '小黑盒描述',
      author: { name: '小黑盒作者', avatar: 'https://example.com/heybox-avatar.jpg' },
      content: [
        { type: 'text', text: '小黑盒第一段' },
        { type: 'image', url: 'https://example.com/heybox-1.jpg' },
        { type: 'text', text: '小黑盒第二段' }
      ],
      images: ['https://example.com/heybox-1.jpg'],
      stats: { view: 1, like: 2, comment: 3, share: 4, collect: 5 },
      comments: [],
      raw: {}
    })
    const { event, replies } = createEvent()

    await new Heybox(event, { type: 'link', link_id: '77f871fa97e9' } as any).HeyboxHandler()

    expectExternalPostRenderCalledWith(event, {
      platform: expect.objectContaining({ label: '小黑盒' }),
      title: '小黑盒标题',
      images: ['https://example.com/heybox-1.jpg'],
      content: [
        { type: 'text', text: '小黑盒第一段' },
        { type: 'image', url: 'https://example.com/heybox-1.jpg' },
        { type: 'text', text: '小黑盒第二段' }
      ]
    })
    expect(replies).toEqual([['rendered-card']])
  })

  it('renders Weibo post and repost content when info card is enabled', async () => {
    state.fetchWeiboDetail.mockResolvedValue({
      type: 'status',
      url: 'https://weibo.com/1980237443/Qeq3Dpa2b',
      status: {
        id: '5234367615996775',
        bid: 'Qeq3Dpa2b',
        title: '微博标题',
        text: '主微博第一段\n主微博第二段',
        source: '微博网页版',
        regionName: '河南',
        createdAt: 1763453952,
        author: {
          id: '1980237443',
          name: '青冥童子',
          avatar: 'https://example.com/weibo-avatar.jpg'
        },
        images: ['https://example.com/weibo-image.jpg'],
        stats: {
          repost: 30,
          comment: 2,
          like: 21
        },
        repostedStatus: {
          id: '5234001406855704',
          bid: 'QegwYsLtS',
          text: '转发原文第一段',
          author: {
            id: '5819071204',
            name: '野比大雄',
            avatar: 'https://example.com/repost-avatar.jpg'
          },
          images: ['https://example.com/repost-image.jpg'],
          stats: {
            repost: 1670,
            comment: 386,
            like: 9890
          }
        }
      }
    })
    const { event, replies } = createEvent()

    await new Weibo(event, { type: 'status', statusId: 'Qeq3Dpa2b', url: 'https://weibo.com/1980237443/Qeq3Dpa2b' } as any).WeiboHandler()

    const primaryImage = 'data:image/jpeg;base64,cmVuZGVyLXdlaWJvLWltYWdl'
    const repostImage = 'data:image/jpeg;base64,cmVuZGVyLXJlcG9zdC1pbWFnZQ=='
    expect(state.render).toHaveBeenCalledTimes(1)
    const renderedCard = state.render.mock.calls[0]?.[2]
    expect(renderedCard).toEqual(expect.objectContaining({
      platform: expect.objectContaining({ label: '微博' }),
      title: '微博标题',
      author: expect.objectContaining({
        avatar: 'data:image/jpeg;base64,cmVuZGVyLWltYWdl'
      }),
      images: [primaryImage, repostImage],
      stats: expect.arrayContaining([{ label: '转发', value: '30' }]),
      meta: expect.arrayContaining([{ label: '来源', value: '微博网页版' }])
    }))
    expect(state.render.mock.calls[0]?.[3]).toEqual({ multiPage: true })
    const mergedContent = renderedCard.content ?? []
    expect(mergedContent).toEqual(expect.arrayContaining([
      { type: 'text', text: '主微博第一段\n主微博第二段' },
      { type: 'image', url: primaryImage },
      expect.objectContaining({ type: 'html', html: expect.stringContaining('转发 @野比大雄') }),
      { type: 'image', url: repostImage }
    ]))
    expect(state.axiosGet).toHaveBeenCalled()
    expect(replies).toEqual([['rendered-card']])
  })

  it('deduplicates Weibo images after render asset localization', async () => {
    state.fetchWeiboDetail.mockResolvedValue({
      type: 'status',
      url: 'https://weibo.com/5177612153/R34sAiuo6',
      status: {
        id: '5234367615996775',
        bid: 'R34sAiuo6',
        title: '微博多图去重',
        text: '主微博正文',
        author: {
          id: '5177612153',
          name: '测试作者',
          avatar: 'https://example.com/weibo-avatar.jpg'
        },
        images: [
          'https://wx1.sinaimg.cn/large/shared-image-a.jpg',
          'https://wx1.sinaimg.cn/original/shared-image-a.jpg',
          'https://wx2.sinaimg.cn/large/shared-image-b.jpg'
        ],
        video: {
          url: 'https://example.com/weibo-video.mp4',
          backupUrls: [],
          cover: 'https://wx1.sinaimg.cn/mw2000/shared-image-a.jpg'
        },
        stats: {
          repost: 1,
          comment: 2,
          like: 3
        },
        repostedStatus: {
          id: '5234001406855704',
          bid: 'repost1',
          text: '转发正文',
          author: {
            id: '5819071204',
            name: '转发作者'
          },
          images: [
            'https://wx1.sinaimg.cn/mw690/shared-image-a.jpg',
            'https://wx2.sinaimg.cn/original/shared-image-b.jpg'
          ],
          stats: {
            repost: 4,
            comment: 5,
            like: 6
          }
        }
      }
    })
    const { event, replies } = createEvent()

    await new Weibo(event, { type: 'status', statusId: 'R34sAiuo6', url: 'https://weibo.com/5177612153/R34sAiuo6' } as any).WeiboHandler()

    expect(state.render).toHaveBeenCalledTimes(1)
    const renderedCard = state.render.mock.calls[0]?.[2]
    expect(renderedCard.images).toEqual([
      'data:image/jpeg;base64,cmVuZGVyLWltYWdlLWE=',
      'data:image/jpeg;base64,cmVuZGVyLWltYWdlLWI='
    ])
    expect(state.render.mock.calls[0]?.[3]).toEqual({ multiPage: true })
    const mergedContent = renderedCard.content ?? []
    expect(mergedContent).toEqual([
      { type: 'text', text: '主微博正文' },
      { type: 'image', url: 'data:image/jpeg;base64,cmVuZGVyLWltYWdlLWE=', alt: '视频封面' },
      { type: 'image', url: 'data:image/jpeg;base64,cmVuZGVyLWltYWdlLWI=' },
      expect.objectContaining({ type: 'html', html: expect.stringContaining('转发 @转发作者') })
    ])
    expect(renderedCard).toEqual(expect.objectContaining({
      title: '微博多图去重',
      stats: expect.arrayContaining([{ label: '转发', value: '1' }])
    }))
    expect(replies).toEqual([['rendered-card']])
  })

  it('renders long Weibo mixed media cards once and leaves pagination to Render', async () => {
    state.render.mockResolvedValue(['rendered-card-1', 'rendered-card-2'])
    state.fetchWeiboDetail.mockResolvedValue({
      type: 'status',
      url: 'https://weibo.com/5177612153/R34sAiuo6',
      status: {
        id: '5234367615996775',
        bid: 'R34sAiuo6',
        title: '微博长图文分页测试',
        text: Array.from({ length: 18 }, (_, index) => `这是第 ${index + 1} 段微博正文，用于撑高卡片并验证分页不会切开标题空白或图片。`).join('\n'),
        source: '微博网页版',
        regionName: '上海',
        author: {
          id: '5177612153',
          name: '测试作者',
          avatar: 'https://example.com/weibo-avatar.jpg'
        },
        images: [
          'https://wx1.sinaimg.cn/large/shared-image-a.jpg',
          'https://wx2.sinaimg.cn/large/shared-image-b.jpg'
        ],
        stats: {
          repost: 12,
          comment: 34,
          like: 56
        },
        repostedStatus: {
          id: 'repost-2',
          bid: 'repost2',
          text: '转发微博正文也很长。'.repeat(60),
          author: {
            id: '5819071204',
            name: '转发作者'
          },
          images: [
            'https://wx1.sinaimg.cn/original/shared-image-a.jpg',
            'https://wx2.sinaimg.cn/original/shared-image-b.jpg'
          ],
          stats: {
            repost: 4,
            comment: 5,
            like: 6
          }
        }
      }
    })
    const { event, replies } = createEvent()

    await new Weibo(event, { type: 'status', statusId: 'R34sAiuo6', url: 'https://weibo.com/5177612153/R34sAiuo6' } as any).WeiboHandler()

    expect(state.render).toHaveBeenCalledTimes(1)
    expect(state.render.mock.calls[0]?.[0]).toBe(event)
    expect(state.render.mock.calls[0]?.[1]).toBe('other/external-post')
    expect(state.render.mock.calls[0]?.[3]).toEqual({ multiPage: true })

    const renderedCard = state.render.mock.calls[0]?.[2]
    expect(renderedCard.content.every((block: any) => block.type !== 'image' || block.url.startsWith('data:image/'))).toBe(true)
    expect(renderedCard).toEqual(expect.objectContaining({
      stats: expect.arrayContaining([{ label: '转发', value: '12' }]),
      meta: expect.arrayContaining([{ label: '来源', value: '微博网页版' }])
    }))
    expect(replies).toEqual([['rendered-card-1', 'rendered-card-2']])
  })

  it('falls back to embedded Weibo images when card rendering fails', async () => {
    state.render.mockRejectedValueOnce(new Error('render failed'))
    state.fetchWeiboDetail.mockResolvedValue({
      type: 'status',
      url: 'https://weibo.com/1980237443/Qeq3Dpa2b',
      status: {
        id: '5234367615996775',
        bid: 'Qeq3Dpa2b',
        title: '微博标题',
        text: '主微博第一段\n主微博第二段',
        author: {
          id: '1980237443',
          name: '青冥童子',
          avatar: 'https://example.com/weibo-avatar.jpg'
        },
        images: ['https://example.com/weibo-image.jpg'],
        stats: {
          repost: 30,
          comment: 2,
          like: 21
        },
        repostedStatus: {
          id: '5234001406855704',
          bid: 'QegwYsLtS',
          text: '转发原文第一段',
          author: {
            id: '5819071204',
            name: '野比大雄',
            avatar: 'https://example.com/repost-avatar.jpg'
          },
          images: ['https://example.com/repost-image.jpg'],
          stats: {
            repost: 1670,
            comment: 386,
            like: 9890
          }
        }
      }
    })
    const { event, replies } = createEvent()

    await new Weibo(event, { type: 'status', statusId: 'Qeq3Dpa2b', url: 'https://weibo.com/1980237443/Qeq3Dpa2b' } as any).WeiboHandler()

    expect(replies[0]).toEqual(expect.stringContaining('微博标题'))
    expect(replies[1]).toEqual([
      { type: 'image', url: 'base64://cmVuZGVyLXdlaWJvLWltYWdl' },
      { type: 'image', url: 'base64://cmVuZGVyLXJlcG9zdC1pbWFnZQ==' }
    ])
  })

  it('renders Weibo video_show card with localized cover and avatar', async () => {
    state.fetchWeiboDetail.mockResolvedValue({
      type: 'video_show',
      url: 'https://video.weibo.com/show?fid=1034:123456',
      show: {
        fid: '1034:123456',
        title: '微博视频号标题',
        text: '视频号正文',
        author: {
          name: '视频作者',
          avatar: 'https://example.com/weibo-video-avatar.png',
          description: '作者简介'
        },
        video: {
          url: 'https://example.com/weibo-video.mp4',
          backupUrls: ['https://example.com/weibo-video-backup.mp4'],
          cover: 'https://example.com/weibo-video-cover.webp',
          title: '微博视频号标题'
        }
      }
    })
    const { event, replies } = createEvent()

    await new Weibo(event, { type: 'video_show', fid: '1034:123456', url: 'https://video.weibo.com/show?fid=1034:123456' } as any).WeiboHandler()

    expectExternalPostRenderCalledWith(event, {
      platform: expect.objectContaining({ label: '微博' }),
      title: '微博视频号标题',
      author: expect.objectContaining({
        avatar: 'data:image/png;base64,YXZhdGFyLXBuZw=='
      }),
      images: ['data:image/webp;base64,Y292ZXItd2VicA=='],
      content: expect.arrayContaining([
        { type: 'text', text: '视频号正文' },
        { type: 'image', url: 'data:image/webp;base64,Y292ZXItd2VicA==', alt: '视频封面' }
      ])
    })
    expect(replies).toEqual([['rendered-card']])
  })

  it('falls back to original Weibo video_show cover and still downloads video when cover prefetch fails', async () => {
    state.config.weibo.sendContent = ['info', 'image', 'video']
    state.render.mockRejectedValueOnce(new Error('render failed'))
    state.axiosGet
      .mockRejectedValueOnce(new Error('cover fetch failed'))
      .mockResolvedValueOnce({
        data: Buffer.from('avatar-jpeg'),
        headers: {
          'content-type': 'image/jpeg'
        }
      })
      .mockResolvedValueOnce({
        data: Buffer.from('cover-jpeg'),
        headers: {
          'content-type': 'image/jpeg'
        }
      })
    state.fetchWeiboDetail.mockResolvedValue({
      type: 'video_show',
      url: 'https://video.weibo.com/show?fid=1034:654321',
      show: {
        fid: '1034:654321',
        title: '微博视频号回退标题',
        text: '视频号回退正文',
        author: {
          name: '回退作者',
          avatar: 'https://example.com/weibo-video-avatar.jpg'
        },
        video: {
          url: 'https://example.com/weibo-video.mp4',
          backupUrls: ['https://example.com/weibo-video-backup.mp4'],
          cover: 'https://example.com/weibo-video-cover.jpg',
          title: '微博视频号回退标题'
        }
      }
    })
    const { event, replies } = createEvent()

    await new Weibo(event, { type: 'video_show', fid: '1034:654321', url: 'https://video.weibo.com/show?fid=1034:654321' } as any).WeiboHandler()

    expect(replies[0]).toEqual(expect.stringContaining('微博视频号回退标题'))
    expect(replies[1]).toEqual({ type: 'image', url: 'https://example.com/weibo-video-cover.jpg' })
    expect(state.downloadVideo).toHaveBeenCalledWith(
      event,
      expect.objectContaining({
        video_url: 'https://example.com/weibo-video.mp4',
        backupUrls: ['https://example.com/weibo-video-backup.mp4']
      }),
      expect.any(Object)
    )
  })

  it('falls back to text and separate images when card rendering fails', async () => {
    state.render.mockRejectedValueOnce(new Error('render failed'))
    state.fetchZhihuDetail.mockResolvedValue({
      type: 'article',
      url: 'https://zhuanlan.zhihu.com/p/1',
      article: {
        id: '1',
        title: '知乎标题',
        author: { name: '知乎作者' },
        content: '<p>知乎正文</p>'
      },
      richContent: {
        text: '知乎正文',
        images: ['https://example.com/zhihu-1.jpg'],
        lensIds: [],
        videos: []
      }
    })
    const { event, replies } = createEvent()

    await new Zhihu(event, { type: 'article', articleId: '1', url: 'https://zhuanlan.zhihu.com/p/1' } as any).ZhihuHandler()

    expect(replies[0]).toEqual(expect.stringContaining('知乎标题'))
    expect(replies[1]).toEqual({ type: 'image', url: 'https://example.com/zhihu-1.jpg' })
  })

  it('sends Zhihu text and separate images when render card is disabled', async () => {
    state.config.zhihu.renderCard = { enable: false, includeImages: false }
    state.fetchZhihuDetail.mockResolvedValue({
      type: 'article',
      url: 'https://zhuanlan.zhihu.com/p/1',
      article: {
        id: '1',
        title: '知乎标题',
        author: { name: '知乎作者' },
        content: '<p>知乎正文</p>'
      },
      richContent: {
        text: '知乎正文',
        images: ['https://example.com/zhihu-1.jpg'],
        lensIds: [],
        videos: []
      }
    })
    const { event, replies } = createEvent()

    await new Zhihu(event, { type: 'article', articleId: '1', url: 'https://zhuanlan.zhihu.com/p/1' } as any).ZhihuHandler()

    expect(state.render).not.toHaveBeenCalled()
    expect(replies[0]).toEqual(expect.stringContaining('知乎标题'))
    expect(replies[1]).toEqual({ type: 'image', url: 'https://example.com/zhihu-1.jpg' })
  })

  it('sends rendered Weibo card and original images in one merged album when includeImages is enabled', async () => {
    state.config.weibo.renderCard = { enable: true, includeImages: true }
    state.render.mockResolvedValue(['rendered-card-a', 'rendered-card-b'])
    state.fetchWeiboDetail.mockResolvedValue({
      type: 'status',
      url: 'https://weibo.com/1980237443/Qeq3Dpa2b',
      status: {
        id: '5234367615996775',
        bid: 'Qeq3Dpa2b',
        title: '微博标题',
        text: '主微博第一段\n主微博第二段',
        author: {
          id: '1980237443',
          name: '青冥童子',
          avatar: 'https://example.com/weibo-avatar.jpg'
        },
        images: ['https://example.com/weibo-image.jpg'],
        stats: {
          repost: 30,
          comment: 2,
          like: 21
        },
        repostedStatus: {
          id: '5234001406855704',
          bid: 'QegwYsLtS',
          text: '转发原文第一段',
          author: {
            id: '5819071204',
            name: '野比大雄',
            avatar: 'https://example.com/repost-avatar.jpg'
          },
          images: ['https://example.com/repost-image.jpg'],
          stats: {
            repost: 1670,
            comment: 386,
            like: 9890
          }
        }
      }
    })
    const { event, replies, sendForwardMsg } = createEvent()

    await new Weibo(event, { type: 'status', statusId: 'Qeq3Dpa2b', url: 'https://weibo.com/1980237443/Qeq3Dpa2b' } as any).WeiboHandler()

    expect(state.render).toHaveBeenCalled()
    expect(replies).toHaveLength(0)
    expect(sendForwardMsg).toHaveBeenCalledTimes(1)
    expect(sendForwardMsg.mock.calls[0]?.[1]).toEqual([
      'rendered-card-a',
      'rendered-card-b',
      { type: 'image', url: 'base64://cmVuZGVyLXdlaWJvLWltYWdl' },
      { type: 'image', url: 'base64://cmVuZGVyLXJlcG9zdC1pbWFnZQ==' }
    ])
  })

  it('merges extra images into the rendered external-post album', async () => {
    const { renderExternalPostCard } = await import('../src/platform/externalPostCard')
    const { event, replies } = createEvent()

    const result = await renderExternalPostCard(event, {
      platform: { key: 'weibo', label: '微博', accentColor: '#e6162d' },
      title: '测试标题',
      author: { name: '测试作者' },
      summary: '测试摘要',
      url: 'https://weibo.com/test',
      images: [],
      stats: [],
      meta: []
    }, {
      extraImages: [
        { type: 'image', url: 'https://example.com/extra-a.jpg' },
        { type: 'image', url: 'https://example.com/extra-b.jpg' }
      ] as any
    })

    expect(result).toBe(true)
    expect(replies).toHaveLength(1)
    expect(replies[0]).toEqual([
      'rendered-card',
      { type: 'image', url: 'https://example.com/extra-a.jpg' },
      { type: 'image', url: 'https://example.com/extra-b.jpg' }
    ])
  })

  it('sends forwarded album when rendered card pagination exceeds three pages', async () => {
    state.render.mockResolvedValue([
      { type: 'image', file: 'base64://1', name: 'page-1.jpg', width: 100, height: 200 },
      { type: 'image', file: 'base64://2', name: 'page-2.jpg', width: 100, height: 200 },
      { type: 'image', file: 'base64://3', name: 'page-3.jpg', width: 100, height: 200 },
      { type: 'image', file: 'base64://4', name: 'page-4.jpg', width: 100, height: 200 }
    ])
    state.fetchZhihuDetail.mockResolvedValue({
      type: 'article',
      url: 'https://zhuanlan.zhihu.com/p/1',
      article: {
        id: '1',
        title: '知乎标题',
        author: { name: '知乎作者', avatarUrl: 'https://example.com/zhihu-avatar.jpg' },
        content: '<p>知乎正文</p>',
        voteupCount: 10,
        commentCount: 2,
        ipInfo: '北京'
      },
      richContent: {
        text: '知乎正文',
        images: [],
        lensIds: [],
        videos: []
      }
    })
    const { event, replies, sendForwardMsg } = createEvent()

    await new Zhihu(event, { type: 'article', articleId: '1', url: 'https://zhuanlan.zhihu.com/p/1' } as any).ZhihuHandler()

    expect(replies).toEqual([])
    expect(sendForwardMsg).toHaveBeenCalledTimes(1)
    expect(sendForwardMsg).toHaveBeenCalledWith(
      event.contact,
      expect.any(Array),
      expect.objectContaining({
        source: '图片合集',
        summary: '查看4张图片消息'
      })
    )
  })
})

describe('renderExternalPostCard', () => {
  it('renders external-post once with renderer-managed multipage enabled', async () => {
    vi.resetModules()

    vi.doMock('node-karin', () => ({
      logger: {
        debug: vi.fn(),
        warn: vi.fn()
      }
    }))

    vi.doMock('@/module', () => ({
      Render: vi.fn(async () => ['rendered-1', 'rendered-2']),
      replyRenderedImages: vi.fn(async () => true)
    }))

    const { renderExternalPostCard } = await import('../src/platform/externalPostCard')

    const result = await renderExternalPostCard({} as any, {
      platform: {
        key: 'weibo',
        label: '微博',
        accentColor: '#e6162d'
      },
      title: '超长微博分页',
      author: {
        name: '测试作者'
      },
      summary: '',
      url: 'https://weibo.com/5177612153/R34sAiuo6',
      images: [],
      content: [
        { type: 'text', text: Array.from({ length: 12 }, (_, index) => `第一页第 ${index + 1} 行，用来占满分页高度。`).join('\n') },
        { type: 'image', url: 'data:image/jpeg;base64,cmVuZGVyLWltYWdlLWE=' },
        { type: 'text', text: Array.from({ length: 10 }, (_, index) => `第二页第 ${index + 1} 行，用来继续撑高分页。`).join('\n') }
      ],
      stats: [{ label: '转发', value: '12' }],
      meta: [{ label: '来源', value: '微博网页版' }]
    })

    expect(result).toBe(true)
    const module = await import('@/module')
    expect(module.Render).toHaveBeenCalledTimes(1)
    expect(module.Render).toHaveBeenCalledWith(
      {} as any,
      'other/external-post',
      expect.objectContaining({
        title: '超长微博分页',
        stats: [{ label: '转发', value: '12' }],
        meta: [{ label: '来源', value: '微博网页版' }]
      }),
      { multiPage: true }
    )
  })
})
