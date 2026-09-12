import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  getGithubID: vi.fn(),
  fetchGithubRepositoryCompositeDetail: vi.fn()
}))

vi.mock('node-karin', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn()
  }
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
      zhihu: ''
    }
  }
}))

vi.mock('@/platform/github', () => ({
  getGithubID: (...args: unknown[]) => state.getGithubID(...args)
}))

vi.mock('@/platform/github/api', async () => {
  const actual = await vi.importActual<typeof import('../src/platform/github/api')>('../src/platform/github/api')
  return {
    ...actual,
    fetchGithubRepositoryCompositeDetail: (...args: unknown[]) => state.fetchGithubRepositoryCompositeDetail(...args)
  }
})

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
vi.mock('@/module/summaryParse/bilibiliVideoIdentity', () => ({
  resolveBilibiliVideoAid: vi.fn(),
  resolveBilibiliVideoCid: vi.fn(),
  resolveBilibiliVideoPage: vi.fn()
}))
vi.mock('@/platform/douyin/liveRecorder', () => ({
  buildDouyinLiveInfoHeaders: vi.fn(() => ({})),
  fetchDouyinLiveDataFromReflow: vi.fn(),
  fetchDouyinLiveReflowInfo: vi.fn(),
  fetchDouyinLiveWebEnterInfo: vi.fn(),
  getDouyinLiveContainer: vi.fn(),
  getDouyinLiveItem: vi.fn(),
  isDouyinLiveStatusActive: vi.fn(),
  selectDouyinLiveStream: vi.fn()
}))
vi.mock('@/module/utils/DouyinBrowserFallback', () => ({
  fetchDouyinWorkByBrowser: vi.fn()
}))
vi.mock('@/module/utils/amagiClient', () => ({
  amagiClient: {
    douyin: {
      fetcher: {
        parseWork: vi.fn(),
        fetchUserProfile: vi.fn(),
        fetchLiveRoomInfo: vi.fn()
      }
    }
  }
}))

const { resolveGithubParsedPost } = await import('../src/platform/resolveParsedPost')
const {
  buildGithubReadmeRenderContent,
  extractGithubReadmeBodyHtml
} = await import('../src/platform/github/api')

describe('resolveGithubParsedPost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.getGithubID.mockResolvedValue({
      type: 'repository',
      owner: 'openai',
      repo: 'openai-node',
      url: 'https://github.com/openai/openai-node'
    })
  })

  it('builds parsed post from api detail and keeps readme as rendered html', async () => {
    state.fetchGithubRepositoryCompositeDetail.mockResolvedValue({
      source: 'api',
      repository: {
        fullName: 'openai/openai-node',
        owner: {
          login: 'openai',
          avatarUrl: 'https://example.com/avatar.png'
        },
        name: 'openai-node',
        description: 'Official JavaScript library for the OpenAI API',
        homepage: 'https://openai.com',
        language: 'TypeScript',
        defaultBranch: 'main',
        archived: false,
        topics: ['openai', 'sdk'],
        stargazersCount: 100,
        forksCount: 20,
        watchersCount: 5,
        subscribersCount: 3,
        openIssuesCount: 7,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        pushedAt: '2024-01-03T00:00:00Z',
        htmlUrl: 'https://github.com/openai/openai-node',
        license: 'MIT',
        socialPreviewImage: 'https://example.com/social.png'
      },
      readme: {
        content: `# Claude Code & OpenClaw & Codex 中文教程

<div align="center">

<p>
  <a href="https://github.com/openai/openai-node/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/openai/openai-node"></a>
</p>

**AI Coding / Agent 工作流中文实战教程**

</div>

## 项目简介

| 工具 | 说明 |
| --- | --- |
| Codex | Agent |

正文段落`
      },
      readmeHtml: '<h1>Claude Code &amp; OpenClaw &amp; Codex 中文教程</h1><div align="center"><p><a href="https://github.com/openai/openai-node/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/openai/openai-node"></a></p><p><strong>AI Coding / Agent 工作流中文实战教程</strong></p></div><h2>项目简介</h2><table><thead><tr><th>工具</th><th>说明</th></tr></thead><tbody><tr><td>Codex</td><td>Agent</td></tr></tbody></table><p>正文段落</p>',
      readmeHtmlSource: 'page'
    })

    const result = await resolveGithubParsedPost('https://github.com/openai/openai-node')

    expect(result).toMatchObject({
      platform: 'github',
      platformLabel: 'GitHub',
      subtype: 'article',
      title: 'openai/openai-node',
      summary: 'Official JavaScript library for the OpenAI API',
      url: 'https://github.com/openai/openai-node'
    })
    expect(result.images.map(item => item.url)).toEqual([
      'https://example.com/social.png'
    ])
    expect(result.contentBlocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'text', text: 'Official JavaScript library for the OpenAI API' }),
      expect.objectContaining({
        type: 'html',
        html: expect.stringContaining('<div align="center">')
      })
    ]))
    const readmeBlock = result.contentBlocks.find((block) => block.type === 'html')
    expect(readmeBlock).toBeTruthy()
    if (readmeBlock?.type === 'html') {
      expect(readmeBlock.html).toContain('<img alt="Stars" src="https://img.shields.io/github/stars/openai/openai-node">')
      expect(readmeBlock.html).toContain('<strong>AI Coding / Agent 工作流中文实战教程</strong>')
      expect(readmeBlock.html).toContain('<table>')
      expect(readmeBlock.html).toContain('<td>Codex</td>')
    }
  })

  it('builds parsed post from html fallback detail', async () => {
    state.fetchGithubRepositoryCompositeDetail.mockResolvedValue({
      source: 'html',
      repository: {
        url: 'https://github.com/vercel/next.js',
        title: 'next.js',
        fullName: 'vercel/next.js',
        owner: 'vercel',
        repo: 'next.js',
        description: 'The React Framework',
        ogImage: 'https://example.com/og.png',
        stats: [{ label: 'Star', value: '1' }],
        meta: [{ label: '语言', value: 'TypeScript' }]
      }
    })

    const result = await resolveGithubParsedPost('https://github.com/vercel/next.js')

    expect(result).toMatchObject({
      platform: 'github',
      title: 'vercel/next.js',
      summary: 'The React Framework'
    })
    expect(result.images.map(item => item.url)).toEqual(['https://example.com/og.png'])
    expect(result.stats).toEqual([{ label: 'Star', value: '1' }])
  })
})

describe('buildGithubReadmeRenderContent', () => {
  it('keeps raw html and markdown structures for direct rendering', () => {
    const result = buildGithubReadmeRenderContent({
      content: `# Claude Code & OpenClaw & Codex 中文教程

<div align="center">

<p><a href="https://github.com/KimYx0207/AI-Coding-Guide-Zh/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/KimYx0207/AI-Coding-Guide-Zh"></a></p>

AI Coding / Agent 工作流中文实战教程

</div>

正文段落`
    }, {
      idData: {
        type: 'repository',
        owner: 'KimYx0207',
        repo: 'AI-Coding-Guide-Zh',
        url: 'https://github.com/KimYx0207/AI-Coding-Guide-Zh'
      }
    })

    expect(result.html).toContain('<h1>Claude Code &amp; OpenClaw &amp; Codex 中文教程</h1>')
    expect(result.html).toContain('<div align="center">')
    expect(result.html).toContain('<a href="https://github.com/KimYx0207/AI-Coding-Guide-Zh/stargazers">')
    expect(result.html).toContain('<img alt="Stars"')
    expect(result.html).toContain('<p>AI Coding / Agent 工作流中文实战教程</p>')
    expect(result.html).toContain('<p>正文段落</p>')
  })
})

describe('extractGithubReadmeBodyHtml', () => {
  it('extracts article markdown body inner html from rendered document', () => {
    const html = '<!DOCTYPE html><html><head></head><body><article class="markdown-body"><h1>标题</h1><div align="center"><img alt="Stars" src="https://img.shields.io/test.svg"></div></article></body></html>'
    expect(extractGithubReadmeBodyHtml(html)).toBe('<h1>标题</h1><div align="center"><img alt="Stars" src="https://img.shields.io/test.svg"></div>')
  })
})
