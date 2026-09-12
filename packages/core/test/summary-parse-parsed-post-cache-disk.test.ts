import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ParsedPost } from '../src/platform/parsedPost'
import { buildSummaryInputFromParsedPost } from '../src/platform/parsedPostAdapters'

const state = vi.hoisted(() => ({
  tempDir: '',
  resolveParsedPostFromResolvedLink: vi.fn(),
  getBilibiliID: vi.fn(),
  loggerDebug: vi.fn(),
  loggerInfo: vi.fn(),
  loggerMark: vi.fn(),
  loggerWarn: vi.fn()
}))

vi.mock('node-karin', () => ({
  logger: {
    debug: (...args: unknown[]) => state.loggerDebug(...args),
    info: (...args: unknown[]) => state.loggerInfo(...args),
    mark: (...args: unknown[]) => state.loggerMark(...args),
    warn: (...args: unknown[]) => state.loggerWarn(...args)
  }
}))

vi.mock('@/module/utils/Common', () => ({
  Common: {
    get tempDri () {
      return {
        cache: {
          parsedPost: state.tempDir
        },
        video: state.tempDir
      }
    }
  }
}))

vi.mock('../src/platform/resolveParsedPost', () => ({
  resolveParsedPostFromResolvedLink: (...args: unknown[]) => state.resolveParsedPostFromResolvedLink(...args)
}))

vi.mock('@/platform/bilibili/getID', () => ({
  getBilibiliID: (...args: unknown[]) => state.getBilibiliID(...args)
}))

vi.mock('@/platform/douyin/getID', () => ({
  getDouyinID: vi.fn()
}))

vi.mock('@/platform/tiktok/getID', () => ({
  getTikTokID: vi.fn()
}))

vi.mock('@/platform/kuaishou/getID', () => ({
  getKuaishouID: vi.fn()
}))

vi.mock('@/platform/xiaohongshu/getID', () => ({
  getXiaohongshuID: vi.fn()
}))

vi.mock('@/platform/heybox/getID', () => ({
  getHeyboxID: vi.fn()
}))

vi.mock('@/platform/x/getID', () => ({
  getXID: vi.fn()
}))

vi.mock('@/platform/zhihu/getID', () => ({
  getZhihuID: vi.fn()
}))

vi.mock('@/platform/tieba/getID', () => ({
  getTiebaID: vi.fn()
}))

vi.mock('@/platform/wechat/getID', () => ({
  getWechatID: vi.fn()
}))

vi.mock('@/platform/weibo/getID', () => ({
  getWeiboID: vi.fn()
}))

const { resolveParsedPostWithCache } = await import('../src/module/summaryParse/parsedPostCache')

const createParsedPost = (overrides: Partial<ParsedPost> = {}): ParsedPost => ({
  platform: 'bilibili',
  platformLabel: 'B站',
  subtype: 'video',
  title: '默认标题',
  author: {
    name: '默认作者'
  },
  summary: '默认摘要',
  url: 'https://www.bilibili.com/video/BV1xx411c7mD',
  contentBlocks: [{ type: 'text', text: '默认正文' }],
  images: [],
  videos: [],
  stats: [],
  meta: [],
  raw: {
    idData: {
      type: 'one_video',
      bvid: 'BV1xx411c7mD'
    }
  },
  ...overrides
})

const createSharedReferenceParsedPost = (overrides: Partial<ParsedPost> = {}): ParsedPost => {
  const sharedHeaders = {
    Referer: 'https://www.bilibili.com'
  }
  const sharedSubtitle = {
    source: 'bilibili',
    language: 'zh-CN',
    label: '中文',
    text: undefined,
    url: 'https://cdn.example.com/subtitle.json',
    headers: sharedHeaders
  }
  const sharedVideo = {
    url: 'https://cdn.example.com/shared-video.mp4',
    title: undefined,
    audioUrl: 'https://cdn.example.com/shared-audio.m4a',
    asrSourceType: 'audio' as const,
    asrSourceUrl: 'https://cdn.example.com/shared-audio.m4a',
    subtitles: [sharedSubtitle],
    headers: sharedHeaders
  }

  return createParsedPost({
    title: '共享引用磁盘缓存作品',
    videos: [sharedVideo],
    primaryVideo: sharedVideo,
    raw: {
      idData: {
        type: 'one_video',
        bvid: 'BV1xx411c7mD'
      },
      detail: {
        sharedVideo,
        sharedSubtitle,
        sharedHeaders
      }
    },
    ...overrides
  })
}

describe('summary parse parsed post cache disk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'summary-parse-parsed-post-cache-'))
    state.getBilibiliID.mockResolvedValue({
      type: 'one_video',
      bvid: 'BV1xx411c7mD'
    })
  })

  afterEach(() => {
    if (state.tempDir) {
      fs.rmSync(state.tempDir, { recursive: true, force: true })
      state.tempDir = ''
    }
  })

  it('reads cached parsed posts back from disk and rebuilds inputs with the current shareContext', async () => {
    const link = {
      platform: 'bilibili' as const,
      url: 'https://www.bilibili.com/video/BV1xx411c7mD'
    }

    state.resolveParsedPostFromResolvedLink.mockResolvedValue(createParsedPost({
      title: '磁盘缓存作品'
    }))

    const first = await resolveParsedPostWithCache(link)
    const second = await resolveParsedPostWithCache(link)

    const firstInput = buildSummaryInputFromParsedPost(first.parsedPost, '第一次附带说明')
    const secondInput = buildSummaryInputFromParsedPost(second.parsedPost, '第二次附带说明')

    expect(first.cacheHit).toBe(false)
    expect(second.cacheHit).toBe(true)
    expect(state.resolveParsedPostFromResolvedLink).toHaveBeenCalledTimes(1)
    expect(firstInput.shareContext).toBe('第一次附带说明')
    expect(secondInput.shareContext).toBe('第二次附带说明')
  })

  it('reads realistic video parsed posts back from disk and still hits cache', async () => {
    const link = {
      platform: 'bilibili' as const,
      url: 'https://www.bilibili.com/video/BV1xx411c7mD'
    }

    state.resolveParsedPostFromResolvedLink.mockResolvedValue(createParsedPost({
      title: '磁盘视频缓存作品',
      videos: [{
        url: 'https://cdn.example.com/video.mp4',
        title: undefined,
        audioUrl: 'https://cdn.example.com/audio.m4a',
        asrSourceType: 'audio',
        asrSourceUrl: 'https://cdn.example.com/audio.m4a',
        subtitles: [{
          source: 'bilibili',
          language: 'zh-CN',
          label: '中文',
          text: undefined,
          url: 'https://cdn.example.com/subtitle.json',
          headers: {
            Referer: 'https://www.bilibili.com'
          }
        }],
        headers: {
          Referer: 'https://www.bilibili.com'
        }
      }],
      primaryVideo: {
        url: 'https://cdn.example.com/video.mp4',
        title: undefined,
        audioUrl: 'https://cdn.example.com/audio.m4a',
        asrSourceType: 'audio',
        asrSourceUrl: 'https://cdn.example.com/audio.m4a',
        subtitles: [{
          source: 'bilibili',
          language: 'zh-CN',
          label: '中文',
          text: undefined,
          url: 'https://cdn.example.com/subtitle.json',
          headers: {
            Referer: 'https://www.bilibili.com'
          }
        }],
        headers: {
          Referer: 'https://www.bilibili.com'
        }
      }
    }))

    const first = await resolveParsedPostWithCache(link)
    const second = await resolveParsedPostWithCache(link)

    expect(first.cacheHit).toBe(false)
    expect(second.cacheHit).toBe(true)
    expect(second.parsedPost).toMatchObject({
      title: '磁盘视频缓存作品',
      videos: [{
        url: 'https://cdn.example.com/video.mp4',
        audioUrl: 'https://cdn.example.com/audio.m4a',
        asrSourceType: 'audio'
      }]
    })
    expect(state.resolveParsedPostFromResolvedLink).toHaveBeenCalledTimes(1)
  })

  it('reads parsed posts with shared references back from disk and still hits cache', async () => {
    const link = {
      platform: 'bilibili' as const,
      url: 'https://www.bilibili.com/video/BV1xx411c7mD'
    }

    state.resolveParsedPostFromResolvedLink.mockResolvedValue(createSharedReferenceParsedPost())

    const first = await resolveParsedPostWithCache(link)
    const second = await resolveParsedPostWithCache(link)

    expect(first.cacheHit).toBe(false)
    expect(second.cacheHit).toBe(true)
    expect(second.parsedPost.primaryVideo?.headers).toEqual({
      Referer: 'https://www.bilibili.com'
    })
    expect(second.parsedPost.primaryVideo?.subtitles?.[0]?.headers).toEqual({
      Referer: 'https://www.bilibili.com'
    })
    expect(state.resolveParsedPostFromResolvedLink).toHaveBeenCalledTimes(1)
  })
})
