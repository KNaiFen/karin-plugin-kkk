import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  fetchWechatArticleDetail: vi.fn(),
  getWechatID: vi.fn(),
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
      zhihu: '',
      wechat: ''
    }
  }
}))

vi.mock('@/module/utils/amagiClient', () => ({
  amagiClient: {
    douyin: {
      fetcher: {
        parseWork: vi.fn()
      }
    }
  }
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
  getBilibiliID: vi.fn()
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
  getWechatID: (...args: unknown[]) => state.getWechatID(...args),
  fetchWechatArticleDetail: (...args: unknown[]) => state.fetchWechatArticleDetail(...args)
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

const { resolveWechatParsedPost } = await import('../src/platform/resolveParsedPost')

describe('resolveWechatParsedPost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.getWechatID.mockResolvedValue({
      url: 'https://mp.weixin.qq.com/s/tAJ1B8ClOjQ41TWYJbIFTA',
      path: '/s/tAJ1B8ClOjQ41TWYJbIFTA',
      articleId: 'tAJ1B8ClOjQ41TWYJbIFTA'
    })
    state.fetchWechatArticleDetail.mockResolvedValue({
      contentType: 'article',
      url: 'https://mp.weixin.qq.com/s/tAJ1B8ClOjQ41TWYJbIFTA',
      title: '测试公众号文章标题',
      summary: '这是一篇用于测试的公众号文章摘要。',
      accountName: '测试公众号',
      accountAlias: 'gh_test',
      accountAvatar: 'https://mmbiz.qpic.cn/avatar',
      accountSignature: '只做高质量内容测试',
      publishTime: '2024-06-18 16:00:00',
      serviceType: '服务号',
      sourceUrl: 'https://example.com/source',
      contentBlocks: [
        { type: 'text', text: '第一段文字。' },
        { type: 'image', url: 'https://mmbiz.qpic.cn/mmbiz_jpg/test-image/640?wx_fmt=jpeg', alt: '正文配图' },
        { type: 'text', text: '第二段文字。' }
      ],
      images: ['https://mmbiz.qpic.cn/mmbiz_jpg/test-image/640?wx_fmt=jpeg'],
      text: '第一段文字。\n第二段文字。',
      contentHtml: '<p>第一段文字。</p>',
      via: 'http'
    })
  })

  it('maps WeChat article detail to ParsedPost', async () => {
    const result = await resolveWechatParsedPost('https://mp.weixin.qq.com/s/tAJ1B8ClOjQ41TWYJbIFTA')

    expect(state.getWechatID).toHaveBeenCalledWith('https://mp.weixin.qq.com/s/tAJ1B8ClOjQ41TWYJbIFTA')
    expect(state.fetchWechatArticleDetail).toHaveBeenCalledWith('https://mp.weixin.qq.com/s/tAJ1B8ClOjQ41TWYJbIFTA')
    expect(result).toMatchObject({
      platform: 'wechat',
      platformLabel: '微信公众号',
      subtype: 'article',
      title: '测试公众号文章标题',
      author: {
        name: '测试公众号',
        avatar: 'https://mmbiz.qpic.cn/avatar',
        description: '只做高质量内容测试',
        screenName: 'gh_test'
      },
      images: [
        { url: 'https://mmbiz.qpic.cn/mmbiz_jpg/test-image/640?wx_fmt=jpeg', alt: '文章配图' }
      ],
      meta: [
        { label: '账号别名', value: 'gh_test' },
        { label: '发布时间', value: '2024-06-18 16:00:00' },
        { label: '账号类型', value: '服务号' },
        { label: '原文来源', value: 'https://example.com/source' }
      ]
    })
    expect(result.contentBlocks).toEqual([
      { type: 'text', text: '第一段文字。' },
      { type: 'image', url: 'https://mmbiz.qpic.cn/mmbiz_jpg/test-image/640?wx_fmt=jpeg', alt: '正文配图' },
      { type: 'text', text: '第二段文字。' }
    ])
  })

  it('maps WeChat image-message detail to an image ParsedPost', async () => {
    const images = [
      'https://mmbiz.qpic.cn/image-message-1',
      'https://mmbiz.qpic.cn/image-message-2'
    ]
    state.fetchWechatArticleDetail.mockResolvedValue({
      contentType: 'image',
      url: 'https://mp.weixin.qq.com/s/tAJ1B8ClOjQ41TWYJbIFTA',
      title: '测试公众号图片消息',
      summary: '图片消息说明',
      description: '图片消息说明',
      accountName: '测试公众号',
      contentBlocks: [
        { type: 'text', text: '图片消息说明' },
        { type: 'image', url: images[0], alt: '图片消息第 1 张' },
        { type: 'image', url: images[1], alt: '图片消息第 2 张' }
      ],
      images,
      text: '图片消息说明',
      contentHtml: '',
      via: 'http'
    })

    const result = await resolveWechatParsedPost('https://mp.weixin.qq.com/s/tAJ1B8ClOjQ41TWYJbIFTA')

    expect(result).toMatchObject({
      platform: 'wechat',
      subtype: 'image',
      title: '测试公众号图片消息',
      summary: '图片消息说明',
      images: [
        { url: images[0], alt: '图片消息第 1 张' },
        { url: images[1], alt: '图片消息第 2 张' }
      ]
    })
    expect(result.contentBlocks).toEqual([
      { type: 'text', text: '图片消息说明' },
      { type: 'image', url: images[0], alt: '图片消息第 1 张' },
      { type: 'image', url: images[1], alt: '图片消息第 2 张' }
    ])
  })
})
