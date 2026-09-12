import { describe, expect, it, vi } from 'vitest'

const realLinkDescribe = process.env.KKK_REAL_LINK_SMOKE === '1' ? describe : describe.skip

const state = vi.hoisted(() => {
  const config: any = {
    app: {
      parseTip: false
    },
    cookies: {
      douyin: '',
      bilibili: '',
      kuaishou: '',
      xiaohongshu: '',
      tiktok: '',
      heybox: '',
      zhihu: '',
      tieba: ''
    },
    request: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      proxy: { switch: false },
      timeout: 30000,
      headers: {}
    },
    upload: {
      usefilelimit: false,
      compress: false
    },
    zhihu: {
      sendContent: ['info', 'image'],
      plainTitleReply: true,
      renderCard: {
        enable: true,
        includeImages: false
      }
    },
    tieba: {
      sendContent: ['info', 'image'],
      plainTitleReply: true,
      renderCard: {
        enable: true,
        includeImages: false
      }
    },
    heybox: {
      sendContent: ['info', 'image', 'comment'],
      plainTitleReply: true,
      renderCard: {
        enable: true,
        includeImages: false
      }
    },
    weibo: {
      sendContent: ['info', 'image'],
      plainTitleReply: true,
      renderCard: {
        enable: true,
        includeImages: false
      }
    },
    guestCookie: {
      switch: true,
      refreshIntervalHours: 24,
      refreshJitterMinutes: 0,
      minRefreshAgeMinutes: 0,
      httpTimeoutMs: 30000,
      browserTimeoutMs: 30000,
      pageSettleSeconds: 1,
      blockMedia: true,
      blockFont: true,
      logging: {
        switch: false,
        retentionDays: 1,
        maxFileSizeMB: 1
      },
      douyin: { switch: false, pageUrl: 'https://www.douyin.com/', testUrl: '', requiredCookies: ['ttwid'] },
      xiaohongshu: { switch: false, pageUrl: 'https://www.xiaohongshu.com/explore', testUrl: '', requiredCookies: ['a1'] },
      tiktok: { switch: false, pageUrl: 'https://www.tiktok.com/', testUrl: '', requiredCookies: ['ttwid'] },
      heybox: {
        switch: true,
        pageUrl: 'https://www.xiaoheihe.cn/',
        testUrl: 'https://www.xiaoheihe.cn/app/bbs/link/77f871fa97e9',
        requiredCookies: ['x_xhh_tokenid']
      },
      zhihu: { switch: false, pageUrl: 'https://www.zhihu.com/', testUrl: '', requiredCookies: ['_zap'] }
    }
  }
  config.Modify = vi.fn((section: string, key: string, value: string) => {
    if (!config[section]) config[section] = {}
    config[section][key] = value
  })

  return {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    config
  }
})

vi.mock('node-karin', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    mark: vi.fn()
  },
  segment: {
    image: (url: string) => ({ type: 'image', url }),
    video: (url: string) => ({ type: 'video', url })
  }
}))

vi.mock('@ikenxuan/amagi', () => ({
  default: Object.assign(vi.fn(() => ({
    reload: vi.fn(),
    bilibili: { fetcher: {} },
    douyin: { fetcher: {} },
    kuaishou: { fetcher: {} },
    xiaohongshu: { fetcher: {} }
  })), {
    bilibiliFetcher: {
      convertAvToBv: vi.fn()
    }
  })
}))

vi.mock('@/module/utils/Config', () => ({
  Config: state.config
}))

vi.mock('@/module', () => ({
  Base: class {
    e: any
    headers: Record<string, string> = {}

    constructor (e: any) {
      this.e = e
    }
  },
  baseHeaders: {
    'User-Agent': state.userAgent
  },
  buildConfiguredRequestOptions: (request: any, options: any = {}) => ({
    timeout: request?.timeout ?? 30000,
    maxRedirects: options.maxRedirects,
    proxy: request?.proxy?.switch
      ? {
        host: request.proxy.host,
        port: Number(request.proxy.port),
        protocol: request.proxy.protocol || 'http'
      }
      : false,
    headers: {
      ...(request?.headers ?? {})
    }
  }),
  createPlainVideoTitleContext: (enabled: boolean, platform: string, types = ['text', 'image', 'video']) => ({
    enabled,
    platform,
    types,
    sent: false
  }),
  Render: vi.fn(async () => ['rendered-card']),
  replyRenderedImages: vi.fn(async (event: any, images: unknown[]) => {
    await event.reply(images)
    return true
  }),
  replyPlainVideoTitle: async (e: any, context: any, title: string, author?: string, type?: string) => {
    if (!context?.enabled || context.sent) return
    if (Array.isArray(context.types) && type && !context.types.includes(type)) return
    context.sent = true
    await e.reply(`【${context.platform}】${author ? `${author}：` : ''}${title}`)
  },
  downloadVideo: vi.fn(async () => true)
}))

const { extractHeyBoxMessageUrl, extractTiebaMessageUrl, extractWeiboMessageUrl, extractZhihuMessageUrl } = await import('../src/apps/linkExtractors')
const { Config } = await import('@/module/utils/Config')
const { guestCookieManager } = await import('@/module/utils/GuestCookieManager')
const { getHeyboxID, Heybox } = await import('../src/platform/heybox')
const { getTiebaID, Tieba } = await import('../src/platform/tieba')
const { getWeiboID, Weibo } = await import('../src/platform/weibo')
const { getZhihuID, Zhihu } = await import('../src/platform/zhihu')

const links = {
  zhihu: 'https://zhuanlan.zhihu.com/p/2010754233901737586',
  tieba: 'https://tieba.baidu.com/p/5281940476',
  heybox: 'https://api.xiaoheihe.cn/v3/bbs/app/api/web/share?h_camp=link&h_src=YXBwX3NoYXJl&link_id=77f871fa97e9',
  weibo: 'https://weibo.com/5177612153/R34sAiuo6'
}

const createEvent = (msg: string) => {
  const replies: unknown[] = []
  return {
    replies,
    event: {
      msg,
      messageId: 'real-link-smoke',
      isGroup: false,
      userId: 'codex',
      contact: { peer: 'codex' },
      async reply (payload: unknown) {
        replies.push(payload)
        return true
      }
    } as any
  }
}

realLinkDescribe('real link smoke', () => {
  it('parses provided Zhihu, Tieba, Heybox and Weibo links through handlers', async () => {
    Config.app.parseTip = false
    Config.zhihu.sendContent = ['info', 'image']
    Config.tieba.sendContent = ['info', 'image']
    Config.heybox.sendContent = ['info', 'image', 'comment']
    Config.weibo.sendContent = ['info', 'image']

    const zhihuUrl = extractZhihuMessageUrl(links.zhihu)
    expect(zhihuUrl).toBe(links.zhihu)
    const zhihuId = await getZhihuID(zhihuUrl, true)
    expect(zhihuId).toMatchObject({ type: 'article', articleId: '2010754233901737586' })
    const zhihu = createEvent(links.zhihu)
    await new Zhihu(zhihu.event, zhihuId).ZhihuHandler()
    expect(zhihu.replies.length).toBeGreaterThan(0)

    const tiebaUrl = extractTiebaMessageUrl(links.tieba)
    expect(tiebaUrl).toBe(links.tieba)
    const tiebaId = await getTiebaID(tiebaUrl, true)
    expect(tiebaId).toMatchObject({ type: 'post', tid: '5281940476' })
    const tieba = createEvent(links.tieba)
    await new Tieba(tieba.event, tiebaId).TiebaHandler(tiebaId)
    expect(tieba.replies.length).toBeGreaterThan(0)

    const heyboxUrl = extractHeyBoxMessageUrl(links.heybox)
    expect(heyboxUrl).toBe(links.heybox)
    const heyboxId = await getHeyboxID(heyboxUrl, true)
    expect(heyboxId).toMatchObject({ type: 'link', link_id: '77f871fa97e9' })
    await guestCookieManager.ensureFreshCookie('heybox', { waitForStale: true })
    expect(Config.cookies.heybox).toContain('x_xhh_tokenid=')
    const heybox = createEvent(links.heybox)
    await new Heybox(heybox.event, heyboxId).HeyboxHandler(heyboxId)
    expect(heybox.replies.length).toBeGreaterThan(0)

    const weiboUrl = extractWeiboMessageUrl(links.weibo)
    expect(weiboUrl).toBe(links.weibo)
    const weiboId = await getWeiboID(weiboUrl, true)
    expect(weiboId).toMatchObject({ type: 'status', statusId: 'R34sAiuo6' })
    const weibo = createEvent(links.weibo)
    await new Weibo(weibo.event, weiboId).WeiboHandler()
    expect(weibo.replies.length).toBeGreaterThan(0)
  }, 120000)
})
