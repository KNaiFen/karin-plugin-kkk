import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ParsedPost } from '../src/platform/parsedPost'

const state = vi.hoisted(() => ({
  enrichSummaryInputWithAsr: vi.fn(),
  resolveParsedPostWithCache: vi.fn(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    mark: vi.fn(),
    warn: vi.fn()
  }
}))

vi.mock('node-karin', () => ({
  logger: state.logger,
  segment: {}
}))

vi.mock('../src/module/summaryParse/parsedPostCache', () => ({
  resolveParsedPostWithCache: (...args: unknown[]) => state.resolveParsedPostWithCache(...args)
}))

vi.mock('../src/module/summaryParse/asr', () => ({
  enrichSummaryInputWithAsr: (...args: unknown[]) => state.enrichSummaryInputWithAsr(...args)
}))

const { resolveSummaryInputWithAsr } = await import('../src/module/summaryParse/workflow')

const parsedPost: ParsedPost = {
  platform: 'weibo',
  platformLabel: '微博',
  subtype: 'status',
  title: '共享工作流',
  author: { name: '作者' },
  summary: '摘要',
  url: 'https://weibo.com/1',
  contentBlocks: [{ type: 'text', text: '正文' }],
  images: [],
  videos: [],
  stats: [],
  meta: [],
  raw: {}
}

describe('summary input workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves, reports cache state, builds and enriches each link exactly once in order', async () => {
    const calls: string[] = []
    state.resolveParsedPostWithCache.mockImplementation(async () => {
      calls.push('resolve')
      return {
        parsedPost,
        cacheHit: true
      }
    })
    state.enrichSummaryInputWithAsr.mockImplementation(async (_config, input) => {
      calls.push('asr')
      return input
    })

    const result = await resolveSummaryInputWithAsr({
      config: {} as any,
      link: { platform: 'weibo', url: 'https://weibo.com/1' },
      shareContext: '用户说明',
      taskProgress: { taskId: 'task-1', totalLinks: 3 },
      linkIndex: 2,
      onParsedPostResolved: cacheHit => {
        calls.push(`cache:${cacheHit}`)
      }
    })

    expect(calls).toEqual(['resolve', 'cache:true', 'asr'])
    expect(state.resolveParsedPostWithCache).toHaveBeenCalledTimes(1)
    expect(state.resolveParsedPostWithCache).toHaveBeenCalledWith({
      platform: 'weibo',
      url: 'https://weibo.com/1'
    })
    expect(state.enrichSummaryInputWithAsr).toHaveBeenCalledTimes(1)
    expect(state.enrichSummaryInputWithAsr).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: '共享工作流',
        shareContext: '用户说明'
      }),
      undefined,
      {
        taskId: 'task-1',
        totalLinks: 3,
        linkIndex: 2,
        platform: '微博',
        title: '共享工作流'
      }
    )
    expect(result).toEqual(expect.objectContaining({
      title: '共享工作流',
      shareContext: '用户说明'
    }))
  })
})
