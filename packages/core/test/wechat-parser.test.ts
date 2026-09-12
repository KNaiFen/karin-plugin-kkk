import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  axiosGet: vi.fn(),
  getBrowserLaunchOptions: vi.fn(() => ({}))
}))

vi.mock('node-karin/axios', () => ({
  default: {
    get: (...args: unknown[]) => state.axiosGet(...args)
  }
}))

vi.mock('@/module', () => ({
  baseHeaders: {
    'User-Agent': 'Unit Test UA'
  }
}))

vi.mock('@/module/utils/Config', () => ({
  Config: {
    request: {
      timeout: 30000,
      'User-Agent': 'Unit Test UA',
      proxy: {
        switch: false
      }
    }
  }
}))

vi.mock('@/module/utils/BrowserRuntime', () => ({
  applyBrowserProxyToLaunchOptions: vi.fn((options: unknown) => options),
  closeBrowserSafely: vi.fn(),
  configureRequestBlocking: vi.fn(),
  createInjectedPage: vi.fn(),
  getBrowserLaunchOptions: (...args: unknown[]) => state.getBrowserLaunchOptions(...args),
  getBrowserProxyCredentials: vi.fn()
}))

const { fetchWechatArticleHtml, isWechatVerifyPage, parseWechatArticleHtml } = await import('../src/platform/wechat/api')

const articleHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="测试公众号文章标题">
  <meta property="og:description" content="这是一篇用于测试的公众号文章摘要。">
  <meta property="og:image" content="https://mmbiz.qpic.cn/mmbiz_jpg/test-cover/640?wx_fmt=jpeg">
  <script>
    var nickname = htmlDecode("测试公众号");
    var hd_head_img = "https://mmbiz.qpic.cn/mmbiz_png/test-avatar/0?wx_fmt=png";
    var profile_signature = "只做高质量内容测试";
    var oriCreateTime = '1718716800';
    var new_service_type = "2";
    var biz = "MzA3OTk1MjczNQ==";
    var mid = "2651234567";
    var idx = "1";
    var sn = "abcdef";
    var item_show_type = '0' * 1;
    var appmsg_type = "9";
    window.picture_page_info_list = [
      { cdn_url: 'https://mmbiz.qpic.cn/mmbiz_jpg/article-payload-image/0?wx_fmt=jpeg' }
    ];
  </script>
</head>
<body>
  <div id="img-content">
    <div class="rich_media_content" id="js_content">
      <p>第一段文字。</p>
      <p><img data-src="https://mmbiz.qpic.cn/mmbiz_jpg/test-image/640?wx_fmt=jpeg" data-alt="正文配图"></p>
      <section><p>第二段文字，包含<strong>重点</strong>信息。</p></section>
    </div>
    <div class="original_page">
      <a id="js_view_source" href="https://example.com/source">阅读原文</a>
    </div>
  </div>
</body>
</html>
`

const imageMessageUrl = 'https://mp.weixin.qq.com/s/belo8XXTO1b850I-ttDuhg'
const imageMessageDescription = '#爱国 #李光耀永不磨灭的信念'
const imageMessageUrls = [
  'https://mmbiz.qpic.cn/sz_mmbiz_png/test-image-1/0?wx_fmt=png',
  'https://mmbiz.qpic.cn/mmbiz_png/test-image-2/0?wx_fmt=png',
  'https://mmbiz.qpic.cn/sz_mmbiz_png/test-image-3/0?wx_fmt=png',
  'https://mmbiz.qpic.cn/mmbiz_png/test-image-4/0?wx_fmt=png',
  'https://mmbiz.qpic.cn/mmbiz_png/test-image-5/0?wx_fmt=png'
]

const picturePageInfoList = `[
  {
    cdn_url: '${imageMessageUrls[0]}',
    watermark_info: { cdn_url: 'https://mmbiz.qpic.cn/watermark-image-1' },
    share_cover: { cdn_url: 'https://mmbiz.qpic.cn/share-cover-1' },
    original_info: { cdn_url: 'https://example.com/original-download-1' }
  },
  { width: '1408' * 1, cdn_url: '${imageMessageUrls[1]}' },
  { cdn_url: '${imageMessageUrls[2]}' },
  { cdn_url: '${imageMessageUrls[3]}' },
  { cdn_url: '${imageMessageUrls[4]}' },
  { cdn_url: '${imageMessageUrls[1]}' },
  { cdn_url: 'javascript:alert(1)' }
]`

const imageMessageMeta = `
  <meta property="og:title" content="自豪！全世界都在说中国话！">
  <meta property="og:description" content="\\x26lt;a class=\\x26quot;wx_topic_link\\x26quot;\\x26gt;#爱国\\x26lt;/a\\x26gt; \\x26lt;a class=\\x26quot;wx_topic_link\\x26quot;\\x26gt;#李光耀永不磨灭的信念\\x26lt;/a\\x26gt;">
  <meta property="og:image" content="https://mmbiz.qpic.cn/test-cover/0?wx_fmt=jpeg">
  <meta name="author" content="永不磨灭的信念">
`

const rawImageMessageHtml = `
<!DOCTYPE html>
<html>
<head>
  ${imageMessageMeta}
  <script>
    window.cgiData = {
      item_show_type: '8' * 1,
      picture_page_info_list: ${picturePageInfoList}
    };
    window.appmsg_type = '10002';
  </script>
</head>
<body></body>
</html>
`

const browserImageMessageHtml = `
<!DOCTYPE html>
<html>
<head>
  ${imageMessageMeta}
  <script>
    window.item_show_type = '8';
    window.appmsg_type = '10002';
    window.picture_page_info_list = ${picturePageInfoList};
  </script>
</head>
<body>
  <div id="js_content">
    <h1>自豪！全世界都在说中国话！</h1>
    <p>${imageMessageDescription}</p>
    <div class="reward_area">微信扫一扫赞赏作者 喜欢作者 关闭 加载中 其它金额</div>
    <div id="js_article_bottom_bar">赞 分享 推荐 写留言</div>
  </div>
</body>
</html>
`

describe('wechat parser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses standard WeChat article HTML into ordered blocks', () => {
    const detail = parseWechatArticleHtml('https://mp.weixin.qq.com/s/tAJ1B8ClOjQ41TWYJbIFTA', articleHtml)

    expect(detail).toMatchObject({
      contentType: 'article',
      url: 'https://mp.weixin.qq.com/s/tAJ1B8ClOjQ41TWYJbIFTA',
      title: '测试公众号文章标题',
      summary: '这是一篇用于测试的公众号文章摘要。',
      accountName: '测试公众号',
      accountAvatar: 'https://mmbiz.qpic.cn/mmbiz_png/test-avatar/0?wx_fmt=png',
      accountSignature: '只做高质量内容测试',
      publishTime: '2024-06-18 21:20:00',
      serviceType: '服务号',
      sourceUrl: 'https://example.com/source'
    })
    expect(detail.images).toEqual([
      'https://mmbiz.qpic.cn/mmbiz_jpg/test-image/640?wx_fmt=jpeg'
    ])
    expect(detail.contentBlocks).toEqual([
      { type: 'text', text: '第一段文字。' },
      { type: 'image', url: 'https://mmbiz.qpic.cn/mmbiz_jpg/test-image/640?wx_fmt=jpeg', alt: '正文配图' },
      { type: 'text', text: '第二段文字，包含重点信息。' }
    ])
    expect(detail.text).toContain('第一段文字。')
    expect(detail.text).toContain('第二段文字，包含重点信息。')
  })

  it('falls back to legacy article content when an image-message list is invalid', () => {
    const html = articleHtml
      .replace('var item_show_type = \'0\' * 1;', 'var item_show_type = \'8\' * 1;')
      .replace(
        'https://mmbiz.qpic.cn/mmbiz_jpg/article-payload-image/0?wx_fmt=jpeg',
        'javascript:alert(1)'
      )

    const detail = parseWechatArticleHtml('https://mp.weixin.qq.com/s/tAJ1B8ClOjQ41TWYJbIFTA', html)

    expect(detail.contentType).toBe('article')
    expect(detail.images).toEqual([
      'https://mmbiz.qpic.cn/mmbiz_jpg/test-image/640?wx_fmt=jpeg'
    ])
    expect(detail.text).toContain('第一段文字。')
  })

  it('parses raw WeChat image-message payloads without a legacy article container', () => {
    const detail = parseWechatArticleHtml(imageMessageUrl, rawImageMessageHtml)

    expect(detail).toMatchObject({
      contentType: 'image',
      url: imageMessageUrl,
      title: '自豪！全世界都在说中国话！',
      description: imageMessageDescription,
      summary: imageMessageDescription,
      accountName: '永不磨灭的信念',
      text: imageMessageDescription,
      contentHtml: '',
      via: 'http'
    })
    expect(detail.images).toEqual(imageMessageUrls)
    expect(detail.contentBlocks).toEqual([
      { type: 'text', text: imageMessageDescription },
      ...imageMessageUrls.map((url, index) => ({
        type: 'image' as const,
        url,
        alt: `图片消息第 ${index + 1} 张`
      }))
    ])
    expect(detail.images).not.toContain('https://mmbiz.qpic.cn/watermark-image-1')
    expect(detail.images).not.toContain('https://mmbiz.qpic.cn/share-cover-1')
  })

  it('prefers image-message payloads over browser interaction content', () => {
    const detail = parseWechatArticleHtml(imageMessageUrl, browserImageMessageHtml, 'browser')
    const extractedText = detail.contentBlocks
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')

    expect(detail.contentType).toBe('image')
    expect(detail.images).toEqual(imageMessageUrls)
    expect(extractedText).toBe(imageMessageDescription)
    expect(extractedText).not.toMatch(/喜欢作者|关闭|加载中|其它金额|写留言/)
  })

  it('accepts raw image-message responses without browser fallback', async () => {
    state.axiosGet.mockResolvedValue({
      data: rawImageMessageHtml,
      request: {
        res: {
          responseUrl: imageMessageUrl
        }
      }
    })

    const fetched = await fetchWechatArticleHtml(imageMessageUrl)

    expect(fetched).toEqual({
      html: rawImageMessageHtml,
      finalUrl: imageMessageUrl,
      via: 'http'
    })
    expect(state.getBrowserLaunchOptions).not.toHaveBeenCalled()
  })

  it('detects WeChat verify pages', () => {
    const verifyHtml = '<html><body><div>环境异常，完成验证后即可继续访问</div></body></html>'

    expect(isWechatVerifyPage(verifyHtml)).toBe(true)
    expect(() => parseWechatArticleHtml('https://mp.weixin.qq.com/s/tAJ1B8ClOjQ41TWYJbIFTA', verifyHtml)).toThrow('微信公众号文章访问被微信验证页拦截')
  })
})
