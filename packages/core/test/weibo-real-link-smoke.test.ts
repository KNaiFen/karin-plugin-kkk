import { describe, expect, it, vi } from 'vitest'

const realLinkDescribe = process.env.KKK_WEIBO_REAL_LINK_SMOKE === '1' ? describe : describe.skip

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
      weibo: ''
    },
    request: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      proxy: { switch: false },
      timeout: 30000,
      headers: {}
    },
    guestCookie: {
      switch: true,
      refreshIntervalHours: 24,
      refreshJitterMinutes: 0,
      minRefreshAgeHours: 0,
      httpTimeoutSeconds: 20,
      browserTimeoutSeconds: 30,
      pageSettleSeconds: 1,
      blockMedia: true,
      blockFont: true,
      logging: {
        switch: false,
        retentionDays: 1,
        maxFileSizeMB: 1
      },
      douyin: { switch: false, pageUrl: 'https://www.douyin.com/', testUrl: '', requiredCookies: ['ttwid', 's_v_web_id'] },
      xiaohongshu: { switch: false, pageUrl: 'https://www.xiaohongshu.com/explore', testUrl: '', requiredCookies: ['a1', 'webId', 'web_session'] },
      tiktok: { switch: false, pageUrl: 'https://www.tiktok.com/', testUrl: '', requiredCookies: ['ttwid', 'msToken'] },
      heybox: { switch: false, pageUrl: 'https://www.xiaoheihe.cn/', testUrl: '', requiredCookies: ['x_xhh_tokenid'] },
      zhihu: { switch: false, pageUrl: 'https://www.zhihu.com/', testUrl: '', requiredCookies: ['_zap', 'd_c0'] },
      weibo: {
        switch: true,
        pageUrl: 'https://m.weibo.cn/',
        testUrl: 'https://weibo.com/5177612153/R34sAiuo6',
        requiredCookies: ['SUB', 'SUBP']
      }
    },
    weibo: {
      sendContent: ['info'],
      plainTitleReply: true,
      renderCard: {
        enable: false,
        includeImages: false
      }
    }
  }
  config.Modify = vi.fn((section: string, key: string, value: string) => {
    if (!config[section]) config[section] = {}
    config[section][key] = value
  })

  return { config }
})

vi.mock('node-karin', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    mark: vi.fn()
  },
  mkdirSync: vi.fn(),
  segment: {
    image: (url: string) => ({ type: 'image', url }),
    video: (url: string) => ({ type: 'video', url })
  }
}))

vi.mock('node-karin/root', () => ({
  karinPathBase: '/private/tmp',
  karinPathTemp: '/private/tmp'
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
    'User-Agent': state.config.request['User-Agent']
  },
  buildConfiguredRequestOptions: (request: any, options: any = {}) => ({
    timeout: request?.timeout ?? 30000,
    maxRedirects: options.maxRedirects,
    proxy: false,
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
  downloadVideo: vi.fn(async () => true),
  replyPlainVideoTitle: async (e: any, context: any, title: string, author?: string, type?: string) => {
    if (!context?.enabled || context.sent) return
    if (Array.isArray(context.types) && type && !context.types.includes(type)) return
    context.sent = true
    await e.reply(`【${context.platform}】${author ? `${author}：` : ''}${title}`)
  },
  replyRenderedImages: vi.fn(async (event: any, images: unknown[]) => {
    await event.reply(images)
    return true
  })
}))

const { fetchWeiboDetail } = await import('../src/platform/weibo/api')
const { guestCookieManager } = await import('@/module/utils/GuestCookieManager')
const { getWeiboID } = await import('../src/platform/weibo/getID')
const { Weibo } = await import('../src/platform/weibo/weibo')

const createEvent = (msg: string) => {
  const replies: unknown[] = []
  return {
    replies,
    event: {
      msg,
      messageId: 'weibo-real-link-smoke',
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

realLinkDescribe('weibo real link smoke', () => {
  it('extracts images from the provided public Weibo link and handles it successfully', async () => {
    const link = 'https://weibo.com/5177612153/R34sAiuo6'
    const id = await getWeiboID(link, true)
    expect(id).toMatchObject({ type: 'status', statusId: 'R34sAiuo6' })

    await guestCookieManager.ensureFreshCookie('weibo', { waitForStale: true })
    expect(state.config.cookies.weibo).toContain('SUB=')
    expect(state.config.cookies.weibo).toContain('SUBP=')

    const detail = await fetchWeiboDetail(id)
    expect(detail.type).toBe('status')
    expect(detail.status.images.length).toBeGreaterThan(0)
    expect(detail.status.text.length).toBeGreaterThan(0)

    const weibo = createEvent(link)
    await new Weibo(weibo.event, id).WeiboHandler()
    expect(weibo.replies.length).toBeGreaterThan(0)
  }, 120000)

  it('merges rendered card output and original images into one album for the provided public Weibo link', async () => {
    state.config.weibo.sendContent = ['info', 'image']
    state.config.weibo.plainTitleReply = false
    state.config.weibo.renderCard = {
      enable: true,
      includeImages: true
    }

    const link = 'https://weibo.com/5177612153/R34sAiuo6'
    const id = await getWeiboID(link, true)
    expect(id).toMatchObject({ type: 'status', statusId: 'R34sAiuo6' })

    await guestCookieManager.ensureFreshCookie('weibo', { waitForStale: true })
    expect(state.config.cookies.weibo).toContain('SUB=')
    expect(state.config.cookies.weibo).toContain('SUBP=')

    const detail = await fetchWeiboDetail(id)
    expect(detail.type).toBe('status')
    expect(detail.status.images.length).toBeGreaterThan(0)

    const weibo = createEvent(link)
    await new Weibo(weibo.event, id).WeiboHandler()

    expect(weibo.replies).toHaveLength(1)
    const album = weibo.replies[0]
    expect(Array.isArray(album)).toBe(true)
    expect((album as unknown[]).includes('rendered-card')).toBe(true)
    expect((album as Array<any>).some(item => item?.type === 'image')).toBe(true)
  }, 120000)
})
