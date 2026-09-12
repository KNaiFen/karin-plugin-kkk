import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  render: vi.fn(),
  resolveGithubParsedPost: vi.fn(),
  prepareParsedPostForCardRender: vi.fn()
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
  }
}))

vi.mock('@/module', () => ({
  Base: class {
    e: any

    constructor (e: any) {
      this.e = e
    }
  },
  createPlainVideoTitleContext: () => ({ enabled: false, sent: false, types: [] }),
  replyPlainVideoTitle: vi.fn()
}))

vi.mock('@/module/utils/Config', () => ({
  Config: {
    app: {
      parseTip: false
    },
    github: {
      sendContent: ['info'],
      renderCard: {
        enable: true,
        includeImages: false
      }
    }
  }
}))

vi.mock('@/module/utils/LongTaskCompletionNotify', () => ({
  replyAndRecordLongTaskCompletionAnchor: vi.fn()
}))

vi.mock('../src/platform/resolveParsedPost', () => ({
  resolveGithubParsedPost: (...args: unknown[]) => state.resolveGithubParsedPost(...args)
}))

vi.mock('@/module/summaryParse/parsedPostCache', () => ({
  resolveParsedPostWithCache: async (link: { url: string }) => ({
    parsedPost: await state.resolveGithubParsedPost(link.url),
    cacheHit: false
  })
}))

vi.mock('../src/platform/parsedPostAssets', () => ({
  prepareParsedPostForCardRender: (...args: unknown[]) => state.prepareParsedPostForCardRender(...args)
}))

vi.mock('../src/platform/parsedPostAdapters', () => ({
  buildExternalPostCardFromParsedPost: (post: unknown) => post,
  buildParsedPostImageReplyElements: async () => [],
  buildParsedPostInfoText: (post: any) => `info:${post.title}`
}))

vi.mock('../src/platform/externalPostCard', () => ({
  renderExternalPostCard: vi.fn(async (event: any, card: any) => {
    await state.render(event, 'other/external-post', card, { multiPage: true })
    return true
  })
}))

const { Github } = await import('../src/platform/github/github')

describe('GitHub handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const post = {
      platform: 'github',
      platformLabel: 'GitHub',
      subtype: 'article',
      title: 'owner/repo',
      summary: 'summary',
      url: 'https://github.com/owner/repo',
      contentBlocks: [],
      images: [],
      videos: [],
      stats: [],
      meta: [],
      raw: {}
    }
    state.resolveGithubParsedPost.mockResolvedValue(post)
    state.prepareParsedPostForCardRender.mockResolvedValue(post)
    state.render.mockResolvedValue([{ type: 'image', file: 'render-github-1' }])
  })

  it('prepares parsed post assets before rendering the GitHub card', async () => {
    const event = {
      reply: vi.fn(async () => true)
    } as any

    await new Github(event, {
      type: 'repository',
      owner: 'owner',
      repo: 'repo',
      url: 'https://github.com/owner/repo'
    } as any).GithubHandler()

    expect(state.resolveGithubParsedPost).toHaveBeenCalledWith('https://github.com/owner/repo')
    expect(state.prepareParsedPostForCardRender).toHaveBeenCalledTimes(1)
    expect(state.prepareParsedPostForCardRender.mock.calls[0]?.[0]).toMatchObject({
      platform: 'github',
      title: 'owner/repo'
    })
    expect(state.render).toHaveBeenCalledWith(
      event,
      'other/external-post',
      expect.objectContaining({
        platform: 'github',
        platformLabel: 'GitHub',
        title: 'owner/repo'
      }),
      { multiPage: true }
    )
  })
})
