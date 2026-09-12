import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  fetchDouyinOneWork: vi.fn(),
  getDouyinID: vi.fn(),
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
      douyin: '',
      heybox: '',
      zhihu: ''
    }
  }
}))

vi.mock('@/module/utils/amagiClient', () => ({
  amagiClient: {
    douyin: {
      fetcher: {
        fetchUserProfile: vi.fn(),
        fetchLiveRoomInfo: vi.fn()
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

const { resolveDouyinParsedPost } = await import('../src/platform/resolveParsedPost')

const createArticleWorkData = (overrides: Partial<any> = {}) => ({
  data: {
    aweme_detail: {
      aweme_id: 'article-123',
      aweme_type: 163,
      desc: '文章描述回退',
      preview_title: '文章预览标题',
      share_url: 'https://www.douyin.com/note/article-123',
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
      article_info: {
        article_title: '文章标题',
        article_content: JSON.stringify({ markdown: '文章正文' }),
        fe_data: JSON.stringify({
          image_list: [
            { url: 'https://example.com/article-1.jpg' }
          ]
        })
      },
      ...overrides
    }
  }
})

const createFetchDouyinOneWorkResult = (overrides: Partial<any> = {}) => ({
  htmlWork: {
    awemeId: 'article-123',
    subtype: 'article'
  },
  workData: createArticleWorkData(overrides),
  source: 'html',
  enrichment: null
})

describe('resolveDouyinParsedPost article fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.getDouyinID.mockResolvedValue({
      aweme_id: 'article-123'
    })
    state.fetchDouyinOneWork.mockResolvedValue(createFetchDouyinOneWorkResult())
  })

  it('falls back to description text when article_content is dirty json', async () => {
    state.fetchDouyinOneWork.mockResolvedValueOnce(createFetchDouyinOneWorkResult({
      article_info: {
        article_title: '文章标题',
        article_content: '{bad json',
        fe_data: JSON.stringify({
          image_list: [
            { url: 'https://example.com/article-1.jpg' }
          ]
        })
      }
    }))

    const result = await resolveDouyinParsedPost('https://v.douyin.com/article')

    expect(result).toMatchObject({
      platform: 'douyin',
      subtype: 'article',
      title: '文章标题',
      summary: '文章描述回退'
    })
    expect(result.contentBlocks).toEqual([
      { type: 'text', text: '文章描述回退' },
      { type: 'image', url: 'https://example.com/article-1.jpg', alt: '文章图片' }
    ])
    expect(state.logger.warn).toHaveBeenCalledWith(expect.stringContaining('抖音文章字段解析失败'))
  })

  it('keeps article parsing successful when fe_data is dirty json', async () => {
    state.fetchDouyinOneWork.mockResolvedValueOnce(createFetchDouyinOneWorkResult({
      article_info: {
        article_title: '文章标题',
        article_content: JSON.stringify({ markdown: '文章正文' }),
        fe_data: '{bad json'
      }
    }))

    const result = await resolveDouyinParsedPost('https://v.douyin.com/article')

    expect(result).toMatchObject({
      platform: 'douyin',
      subtype: 'article',
      title: '文章标题',
      summary: '文章正文'
    })
    expect(result.images).toEqual([])
    expect(result.contentBlocks).toEqual([
      { type: 'text', text: '文章正文' }
    ])
    expect(state.logger.warn).toHaveBeenCalledWith(expect.stringContaining('抖音文章字段解析失败'))
  })

  it('falls back to article head poster when image_list is empty', async () => {
    state.fetchDouyinOneWork.mockResolvedValueOnce(createFetchDouyinOneWorkResult({
      article_info: {
        article_title: '文章标题',
        article_content: JSON.stringify({
          markdown: '文章正文',
          head_poster_list: {
            url_list: ['https://example.com/article-head-from-content.jpg']
          }
        }),
        fe_data: JSON.stringify({
          image_list: [],
          head_poster_list: {
            url_list: ['https://example.com/article-head.jpg']
          }
        })
      }
    }))

    const result = await resolveDouyinParsedPost('https://v.douyin.com/article')

    expect(result.images).toEqual([
      { url: 'https://example.com/article-head.jpg' }
    ])
    expect(result.contentBlocks).toEqual([
      { type: 'text', text: '文章正文' },
      { type: 'image', url: 'https://example.com/article-head.jpg', alt: '文章图片' }
    ])
  })

  it('falls back to plain article_content text when markdown json is unavailable', async () => {
    state.fetchDouyinOneWork.mockResolvedValueOnce(createFetchDouyinOneWorkResult({
      desc: '文章描述回退',
      article_info: {
        article_title: '文章标题',
        article_content: '纯文本正文内容',
        fe_data: JSON.stringify({
          image_list: [
            { url: 'https://example.com/article-1.jpg' }
          ]
        })
      }
    }))

    const result = await resolveDouyinParsedPost('https://v.douyin.com/article')

    expect(result).toMatchObject({
      platform: 'douyin',
      subtype: 'article',
      title: '文章标题',
      summary: '纯文本正文内容'
    })
    expect(result.contentBlocks).toEqual([
      { type: 'text', text: '纯文本正文内容' },
      { type: 'image', url: 'https://example.com/article-1.jpg', alt: '文章图片' }
    ])
  })
})
