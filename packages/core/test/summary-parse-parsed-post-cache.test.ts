import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ParsedPost } from '../src/platform/parsedPost'
import { buildSummaryInputFromParsedPost } from '../src/platform/parsedPostAdapters'

const state = vi.hoisted(() => ({
  tempDir: '/tmp/kkk-summary-parse-cache-test',
  files: new Map<string, string>(),
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  loggerDebug: vi.fn(),
  loggerInfo: vi.fn(),
  loggerMark: vi.fn(),
  loggerWarn: vi.fn(),
  resolveParsedPostFromResolvedLink: vi.fn(),
  getBilibiliID: vi.fn(),
  getDouyinID: vi.fn(),
  getTikTokID: vi.fn(),
  getKuaishouID: vi.fn(),
  getXiaohongshuID: vi.fn(),
  getHeyboxID: vi.fn(),
  getXID: vi.fn(),
  getZhihuID: vi.fn(),
  getTiebaID: vi.fn(),
  getWechatID: vi.fn(),
  getWeiboID: vi.fn(),
  fetchBilibiliSubtitleReferences: vi.fn()
}))

vi.mock('node:fs', () => ({
  default: {
    existsSync: (...args: unknown[]) => state.existsSync(...args),
    readFileSync: (...args: unknown[]) => state.readFileSync(...args),
    writeFileSync: (...args: unknown[]) => state.writeFileSync(...args)
  }
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
    tempDri: {
      video: state.tempDir,
      cache: {
        root: `${state.tempDir}/shared-cache`,
        parsedPost: `${state.tempDir}/shared-cache/parsed-post`,
        workBundle: `${state.tempDir}/shared-cache/work-bundle`,
        media: `${state.tempDir}/shared-cache/media`,
        renderAssets: `${state.tempDir}/shared-cache/render-assets`,
        derived: `${state.tempDir}/shared-cache/derived`
      }
    }
  }
}))

vi.mock('@/module/utils/Config', () => ({
  Config: {
    cookies: {
      bilibili: 'SESSDATA=test'
    }
  }
}))

vi.mock('@/module/utils/Network', () => ({
  baseHeaders: {
    'User-Agent': 'kkk-test'
  }
}))

vi.mock('../src/platform/resolveParsedPost', () => ({
  resolveParsedPostFromResolvedLink: (...args: unknown[]) => state.resolveParsedPostFromResolvedLink(...args)
}))

vi.mock('@/platform/bilibili/getID', () => ({
  getBilibiliID: (...args: unknown[]) => state.getBilibiliID(...args)
}))

vi.mock('@/platform/douyin/getID', () => ({
  getDouyinID: (...args: unknown[]) => state.getDouyinID(...args)
}))

vi.mock('@/platform/tiktok/getID', () => ({
  getTikTokID: (...args: unknown[]) => state.getTikTokID(...args)
}))

vi.mock('@/platform/kuaishou/getID', () => ({
  getKuaishouID: (...args: unknown[]) => state.getKuaishouID(...args)
}))

vi.mock('@/platform/xiaohongshu/getID', () => ({
  getXiaohongshuID: (...args: unknown[]) => state.getXiaohongshuID(...args)
}))

vi.mock('@/platform/heybox/getID', () => ({
  getHeyboxID: (...args: unknown[]) => state.getHeyboxID(...args)
}))

vi.mock('@/platform/x/getID', () => ({
  getXID: (...args: unknown[]) => state.getXID(...args)
}))

vi.mock('@/platform/zhihu/getID', () => ({
  getZhihuID: (...args: unknown[]) => state.getZhihuID(...args)
}))

vi.mock('@/platform/tieba/getID', () => ({
  getTiebaID: (...args: unknown[]) => state.getTiebaID(...args)
}))

vi.mock('@/platform/wechat/getID', () => ({
  getWechatID: (...args: unknown[]) => state.getWechatID(...args)
}))

vi.mock('@/platform/weibo/getID', () => ({
  getWeiboID: (...args: unknown[]) => state.getWeiboID(...args)
}))

vi.mock('@/module/summaryParse/bilibiliSubtitles', () => ({
  fetchBilibiliSubtitleReferences: (...args: unknown[]) => state.fetchBilibiliSubtitleReferences(...args)
}))

const {
  resolveParsedPostCacheKey,
  readCachedParsedPost,
  writeCachedParsedPost,
  resolveParsedPostWithCache
} = await import('../src/module/summaryParse/parsedPostCache')

const getParsedPostCachePath = (key: string): string => `${state.tempDir}/shared-cache/parsed-post/summary_parse_parsed_post_cache_${key}.json`

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

const createVideoParsedPost = (overrides: Partial<ParsedPost> = {}): ParsedPost => createParsedPost({
  videos: [{
    url: 'https://cdn.example.com/video.mp4',
    title: undefined,
    cover: undefined,
    backupUrls: undefined,
    audioUrl: 'https://cdn.example.com/audio.m4a',
    audioBackupUrls: undefined,
    asrSourceType: 'audio',
    asrSourceUrl: 'https://cdn.example.com/audio.m4a',
    asrSourceBackupUrls: undefined,
    durationSeconds: 42,
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
    cover: undefined,
    backupUrls: undefined,
    audioUrl: 'https://cdn.example.com/audio.m4a',
    audioBackupUrls: undefined,
    asrSourceType: 'audio',
    asrSourceUrl: 'https://cdn.example.com/audio.m4a',
    asrSourceBackupUrls: undefined,
    durationSeconds: 42,
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
    title: '共享引用缓存作品',
    videos: [sharedVideo],
    primaryVideo: sharedVideo,
    contentBlocks: [{
      type: 'video',
      ...sharedVideo
    }],
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

describe('summary parse parsed post cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.files.clear()

    state.existsSync.mockImplementation((value: string) => state.files.has(value))
    state.readFileSync.mockImplementation((value: string) => {
      const content = state.files.get(value)
      if (content === undefined) {
        throw new Error(`missing file: ${value}`)
      }
      return content
    })
    state.writeFileSync.mockImplementation((value: string, content: string) => {
      state.files.set(value, content)
    })

    state.getBilibiliID.mockImplementation(async (url: string) => ({
      type: 'one_video',
      bvid: 'BV1xx411c7mD',
      ...(url.includes('p=1') ? { p: 1 } : {})
    }))
    state.getDouyinID.mockResolvedValue({ type: 'one_work', aweme_id: '123456' })
    state.getTikTokID.mockResolvedValue({ type: 'one_work', item_id: '123456', url: 'https://www.tiktok.com/@user/video/123456' })
    state.getKuaishouID.mockResolvedValue({ type: 'one_work', photoId: 'abc123' })
    state.getXiaohongshuID.mockResolvedValue({ type: 'note', note_id: 'xhs123', xsec_token: 'token' })
    state.getHeyboxID.mockResolvedValue({ type: 'link', link_id: 'heybox123' })
    state.getXID.mockResolvedValue({ type: 'status', statusId: '1234567890', screenName: 'tester', url: 'https://x.com/tester/status/1234567890' })
    state.getZhihuID.mockResolvedValue({ type: 'answer', questionId: '1', answerId: '2', url: 'https://www.zhihu.com/question/1/answer/2' })
    state.getTiebaID.mockResolvedValue({ type: 'post', tid: '123', pid: '456', url: 'https://tieba.baidu.com/p/123?pid=456' })
    state.getWechatID.mockImplementation(async (url: string) => ({
      url: url.replace(/#.*$/, ''),
      path: '/s/abc123',
      articleId: 'abc123'
    }))
    state.getWeiboID.mockResolvedValue({ type: 'status', statusId: 'M12345', url: 'https://weibo.com/123/M12345' })
    state.fetchBilibiliSubtitleReferences.mockResolvedValue([{
      type: 'subtitle',
      source: 'bilibili',
      language: 'zh-CN',
      label: '中文（自动生成）',
      url: 'https://cdn.example.com/refreshed-subtitle.json',
      headers: {
        Referer: 'https://www.bilibili.com'
      }
    }])
  })

  it('normalizes bilibili p=1 and omitted page into the same cache key', async () => {
    const first = await resolveParsedPostCacheKey({
      platform: 'bilibili',
      url: 'https://www.bilibili.com/video/BV1xx411c7mD'
    })
    const second = await resolveParsedPostCacheKey({
      platform: 'bilibili',
      url: 'https://www.bilibili.com/video/BV1xx411c7mD?p=1'
    })

    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
    expect(first).toBe(second)
  })

  it('normalizes equivalent wechat article links into the same cache key', async () => {
    const first = await resolveParsedPostCacheKey({
      platform: 'wechat',
      url: 'https://mp.weixin.qq.com/s/abc123'
    })
    const second = await resolveParsedPostCacheKey({
      platform: 'wechat',
      url: 'https://mp.weixin.qq.com/s/abc123#wechat_redirect'
    })

    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
    expect(first).toBe(second)
  })

  it('normalizes xiaohongshu note links with different xsec tokens into the same cache key', async () => {
    state.getXiaohongshuID
      .mockResolvedValueOnce({ type: 'note', note_id: 'xhs123', xsec_token: 'token-a' })
      .mockResolvedValueOnce({ type: 'note', note_id: 'xhs123', xsec_token: 'token-b' })

    const first = await resolveParsedPostCacheKey({
      platform: 'xiaohongshu',
      url: 'https://www.xiaohongshu.com/discovery/item/xhs123?xsec_token=token-a'
    })
    const second = await resolveParsedPostCacheKey({
      platform: 'xiaohongshu',
      url: 'https://www.xiaohongshu.com/discovery/item/xhs123?xsec_token=token-b'
    })

    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
    expect(first).toBe(second)
  })

  it('writes and reads cached parsed posts as json-safe data', async () => {
    const key = await resolveParsedPostCacheKey({
      platform: 'bilibili',
      url: 'https://www.bilibili.com/video/BV1xx411c7mD'
    })

    expect(key).toBeTruthy()

    writeCachedParsedPost(key!, createParsedPost({
      raw: {
        idData: {
          type: 'one_video',
          bvid: 'BV1xx411c7mD'
        },
        detail: {
          nested: ['a', 'b']
        }
      }
    }))

    const cached = readCachedParsedPost(key!)
    expect(cached).toMatchObject({
      platform: 'bilibili',
      title: '默认标题',
      raw: {
        idData: {
          type: 'one_video',
          bvid: 'BV1xx411c7mD'
        }
      }
    })
  })

  it('reads back realistic video cache payloads produced by the writer', async () => {
    const key = await resolveParsedPostCacheKey({
      platform: 'bilibili',
      url: 'https://www.bilibili.com/video/BV1xx411c7mD'
    })

    expect(key).toBeTruthy()

    writeCachedParsedPost(key!, createVideoParsedPost({
      title: '真实视频缓存'
    }))

    const cached = readCachedParsedPost(key!)
    expect(cached).toMatchObject({
      title: '真实视频缓存',
      videos: [{
        url: 'https://cdn.example.com/video.mp4',
        audioUrl: 'https://cdn.example.com/audio.m4a',
        asrSourceType: 'audio'
      }],
      primaryVideo: {
        url: 'https://cdn.example.com/video.mp4',
        audioUrl: 'https://cdn.example.com/audio.m4a',
        asrSourceType: 'audio'
      }
    })
  })

  it('preserves shared references instead of serializing them as circular placeholders', async () => {
    const key = await resolveParsedPostCacheKey({
      platform: 'bilibili',
      url: 'https://www.bilibili.com/video/BV1xx411c7mD'
    })

    expect(key).toBeTruthy()

    writeCachedParsedPost(key!, createSharedReferenceParsedPost())

    const cached = readCachedParsedPost(key!)
    expect(cached).toMatchObject({
      title: '共享引用缓存作品',
      videos: [{
        url: 'https://cdn.example.com/shared-video.mp4',
        subtitles: [{
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
        url: 'https://cdn.example.com/shared-video.mp4'
      }
    })
    expect(JSON.parse(state.files.get(getParsedPostCachePath(key)) || '{}')).not.toContain?.('[circular]')
    expect(state.files.get(getParsedPostCachePath(key))).not.toContain('[circular]')
  })

  it('ignores invalid cache files and falls back to direct parsing', async () => {
    const key = await resolveParsedPostCacheKey({
      platform: 'bilibili',
      url: 'https://www.bilibili.com/video/BV1xx411c7mD'
    })

    expect(key).toBeTruthy()

    state.files.set(getParsedPostCachePath(key), '{invalid json')
    state.resolveParsedPostFromResolvedLink.mockResolvedValue(createParsedPost({
      title: '回退解析结果'
    }))

    const result = await resolveParsedPostWithCache({
      platform: 'bilibili',
      url: 'https://www.bilibili.com/video/BV1xx411c7mD'
    })

    expect(result).toEqual({
      parsedPost: expect.objectContaining({
        title: '回退解析结果'
      }),
      cacheHit: false
    })
    expect(state.resolveParsedPostFromResolvedLink).toHaveBeenCalledTimes(1)
  })

  it('uses cached parsed posts without re-running direct platform parsing', async () => {
    const link = {
      platform: 'bilibili' as const,
      url: 'https://www.bilibili.com/video/BV1xx411c7mD'
    }

    state.resolveParsedPostFromResolvedLink.mockResolvedValue(createParsedPost({
      title: '第一次解析'
    }))

    const first = await resolveParsedPostWithCache(link)
    const second = await resolveParsedPostWithCache(link)

    expect(first.cacheHit).toBe(false)
    expect(second).toEqual({
      parsedPost: expect.objectContaining({
        title: '第一次解析'
      }),
      cacheHit: true
    })
    expect(state.resolveParsedPostFromResolvedLink).toHaveBeenCalledTimes(1)
  })

  it('does not persist bilibili LIVE_RCMD parsed posts into reusable cache', async () => {
    const link = {
      platform: 'bilibili' as const,
      url: 'https://t.bilibili.com/999999'
    }

    state.getBilibiliID.mockResolvedValue({
      type: 'dynamic_info',
      dynamic_id: '999999'
    })
    state.resolveParsedPostFromResolvedLink.mockResolvedValue(createParsedPost({
      subtype: 'live',
      title: '直播动态',
      url: 'https://t.bilibili.com/999999',
      raw: {
        idData: {
          type: 'dynamic_info',
          dynamic_id: '999999'
        },
        detail: {
          data: {
            item: {
              type: 'DYNAMIC_TYPE_LIVE_RCMD'
            }
          }
        }
      }
    }))

    const first = await resolveParsedPostWithCache(link)
    const second = await resolveParsedPostWithCache(link)

    expect(first.cacheHit).toBe(false)
    expect(second.cacheHit).toBe(false)
    expect(state.resolveParsedPostFromResolvedLink).toHaveBeenCalledTimes(2)
  })

  it('hits link cache for realistic video parsed posts with nullable optional fields', async () => {
    const link = {
      platform: 'bilibili' as const,
      url: 'https://www.bilibili.com/video/BV1xx411c7mD'
    }

    state.resolveParsedPostFromResolvedLink.mockResolvedValue(createVideoParsedPost({
      title: '视频缓存命中'
    }))

    const first = await resolveParsedPostWithCache(link)
    const second = await resolveParsedPostWithCache(link)

    expect(first.cacheHit).toBe(false)
    expect(second).toEqual({
      parsedPost: expect.objectContaining({
        title: '视频缓存命中'
      }),
      cacheHit: true
    })
    expect(state.resolveParsedPostFromResolvedLink).toHaveBeenCalledTimes(1)
  })

  it('hits link cache for parsed posts that reuse shared video and subtitle references', async () => {
    const link = {
      platform: 'bilibili' as const,
      url: 'https://www.bilibili.com/video/BV1xx411c7mD'
    }

    state.resolveParsedPostFromResolvedLink.mockResolvedValue(createSharedReferenceParsedPost())

    const first = await resolveParsedPostWithCache(link)
    const second = await resolveParsedPostWithCache(link)

    expect(first.cacheHit).toBe(false)
    expect(second.cacheHit).toBe(true)
    expect(second.parsedPost.primaryVideo?.subtitles?.[0]?.headers).toEqual({
      Referer: 'https://www.bilibili.com'
    })
    expect(state.resolveParsedPostFromResolvedLink).toHaveBeenCalledTimes(1)
  })

  it('does not refresh bilibili subtitle references when serving a cached bilibili video parsed post that already has bilibili subtitles', async () => {
    const link = {
      platform: 'bilibili' as const,
      url: 'https://www.bilibili.com/video/BV1xx411c7mD'
    }

    state.resolveParsedPostFromResolvedLink.mockResolvedValue(createVideoParsedPost({
      raw: {
        idData: {
          type: 'one_video',
          bvid: 'BV1xx411c7mD'
        },
        detail: {
          cid: 39213992018
        }
      }
    }))

    await resolveParsedPostWithCache(link)
    const second = await resolveParsedPostWithCache(link)

    expect(second.cacheHit).toBe(true)
    expect(state.fetchBilibiliSubtitleReferences).not.toHaveBeenCalled()
    expect(second.parsedPost.primaryVideo?.subtitles?.[0]?.url).toBe('https://cdn.example.com/subtitle.json')
  })

  it('backfills bilibili subtitle references with the current page cid when the cached parsed post has no bilibili subtitles', async () => {
    const link = {
      platform: 'bilibili' as const,
      url: 'https://www.bilibili.com/video/BV1xx411c7mD?p=2'
    }

    state.resolveParsedPostFromResolvedLink.mockResolvedValue(createVideoParsedPost({
      videos: [{
        url: 'https://cdn.example.com/video.mp4',
        title: undefined,
        cover: undefined,
        backupUrls: undefined,
        audioUrl: 'https://cdn.example.com/audio.m4a',
        audioBackupUrls: undefined,
        asrSourceType: 'audio',
        asrSourceUrl: 'https://cdn.example.com/audio.m4a',
        asrSourceBackupUrls: undefined,
        durationSeconds: 84,
        subtitles: [],
        headers: {
          Referer: 'https://www.bilibili.com'
        }
      }],
      primaryVideo: {
        url: 'https://cdn.example.com/video.mp4',
        title: undefined,
        cover: undefined,
        backupUrls: undefined,
        audioUrl: 'https://cdn.example.com/audio.m4a',
        audioBackupUrls: undefined,
        asrSourceType: 'audio',
        asrSourceUrl: 'https://cdn.example.com/audio.m4a',
        asrSourceBackupUrls: undefined,
        durationSeconds: 84,
        subtitles: [],
        headers: {
          Referer: 'https://www.bilibili.com'
        }
      },
      raw: {
        idData: {
          type: 'one_video',
          bvid: 'BV1xx411c7mD',
          p: 2
        },
        detail: {
          data: {
            data: {
              cid: 39213992018,
              pages: [
                { cid: 39213992018, duration: 42 },
                { cid: 39213992019, duration: 84 }
              ]
            }
          }
        }
      }
    }))

    await resolveParsedPostWithCache(link)
    const second = await resolveParsedPostWithCache(link)

    expect(state.fetchBilibiliSubtitleReferences).toHaveBeenCalledWith(expect.objectContaining({
      aid: 0,
      bvid: 'BV1xx411c7mD',
      cid: 39213992019
    }))
    expect(second.cacheHit).toBe(true)
    expect(second.parsedPost.primaryVideo?.subtitles?.[0]?.url).toBe('https://cdn.example.com/refreshed-subtitle.json')
  })

  it('does not cache realtime live room snapshots', async () => {
    state.getBilibiliID.mockResolvedValue({
      type: 'live_room_detail',
      room_id: '2233'
    })
    state.resolveParsedPostFromResolvedLink.mockResolvedValue(createParsedPost({
      subtype: 'live',
      title: '直播间快照'
    }))

    const link = {
      platform: 'bilibili' as const,
      url: 'https://live.bilibili.com/2233'
    }

    const first = await resolveParsedPostWithCache(link)
    const second = await resolveParsedPostWithCache(link)

    expect(first.cacheHit).toBe(false)
    expect(second.cacheHit).toBe(false)
    expect(state.resolveParsedPostFromResolvedLink).toHaveBeenCalledTimes(2)
    expect(state.writeFileSync).not.toHaveBeenCalled()
  })

  it('does not cache douyin live room snapshots', async () => {
    state.getDouyinID.mockResolvedValue({
      type: 'live_room_detail',
      room_id: '9988'
    })
    state.resolveParsedPostFromResolvedLink.mockResolvedValue(createParsedPost({
      platform: 'douyin',
      platformLabel: '抖音',
      subtype: 'live',
      title: '抖音直播间快照'
    }))

    const link = {
      platform: 'douyin' as const,
      url: 'https://live.douyin.com/9988'
    }

    const first = await resolveParsedPostWithCache(link)
    const second = await resolveParsedPostWithCache(link)

    expect(first.cacheHit).toBe(false)
    expect(second.cacheHit).toBe(false)
    expect(state.resolveParsedPostFromResolvedLink).toHaveBeenCalledTimes(2)
    expect(state.writeFileSync).not.toHaveBeenCalled()
  })

  it('rebuilds summary inputs from cached parsed posts without reusing old shareContext', async () => {
    const link = {
      platform: 'bilibili' as const,
      url: 'https://www.bilibili.com/video/BV1xx411c7mD'
    }

    state.resolveParsedPostFromResolvedLink.mockResolvedValue(createParsedPost({
      title: '缓存作品'
    }))

    const first = await resolveParsedPostWithCache(link)
    const second = await resolveParsedPostWithCache(link)

    const firstInput = buildSummaryInputFromParsedPost(first.parsedPost, '第一次附带说明')
    const secondInput = buildSummaryInputFromParsedPost(second.parsedPost, '第二次附带说明')

    expect(first.cacheHit).toBe(false)
    expect(second.cacheHit).toBe(true)
    expect(firstInput.shareContext).toBe('第一次附带说明')
    expect(secondInput.shareContext).toBe('第二次附带说明')
  })

  it('ignores structurally invalid cache payloads and falls back to direct parsing', async () => {
    const key = await resolveParsedPostCacheKey({
      platform: 'bilibili',
      url: 'https://www.bilibili.com/video/BV1xx411c7mD'
    })

    expect(key).toBeTruthy()

    state.files.set(getParsedPostCachePath(key), JSON.stringify({
      platform: 'bilibili',
      title: '只有标题'
    }))
    state.resolveParsedPostFromResolvedLink.mockResolvedValue(createParsedPost({
      title: '结构回退结果'
    }))

    const result = await resolveParsedPostWithCache({
      platform: 'bilibili',
      url: 'https://www.bilibili.com/video/BV1xx411c7mD'
    })

    expect(result).toEqual({
      parsedPost: expect.objectContaining({
        title: '结构回退结果'
      }),
      cacheHit: false
    })
    expect(state.resolveParsedPostFromResolvedLink).toHaveBeenCalledTimes(1)
    expect(state.loggerWarn).toHaveBeenCalledWith(expect.stringContaining('缓存结构无效'))
  })

  it('ignores nested invalid cache payloads and falls back to direct parsing', async () => {
    const key = await resolveParsedPostCacheKey({
      platform: 'bilibili',
      url: 'https://www.bilibili.com/video/BV1xx411c7mD'
    })

    expect(key).toBeTruthy()

    state.files.set(getParsedPostCachePath(key), JSON.stringify({
      platform: 'bilibili',
      platformLabel: 'B站',
      subtype: 'video',
      title: '坏缓存',
      url: 'https://www.bilibili.com/video/BV1xx411c7mD',
      contentBlocks: [null],
      images: [],
      videos: [null],
      stats: [null],
      meta: [null],
      raw: {}
    }))
    state.resolveParsedPostFromResolvedLink.mockResolvedValue(createParsedPost({
      title: '嵌套结构回退结果'
    }))

    const result = await resolveParsedPostWithCache({
      platform: 'bilibili',
      url: 'https://www.bilibili.com/video/BV1xx411c7mD'
    })

    expect(result).toEqual({
      parsedPost: expect.objectContaining({
        title: '嵌套结构回退结果'
      }),
      cacheHit: false
    })
    expect(state.resolveParsedPostFromResolvedLink).toHaveBeenCalledTimes(1)
    expect(state.loggerWarn).toHaveBeenCalledWith(expect.stringContaining('缓存结构无效'))
  })
})
