import { EventEmitter } from 'node:events'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DOUYIN_USER_PAGE_BLOCKED_RESOURCE_TYPES,
  DOUYIN_WORK_BROWSER_FALLBACK_TIMEOUT_MS,
  parseCookieHeader,
  runDouyinWorkBrowserFallback,
  waitForDouyinUserPostResponse,
  waitForDouyinUserProfileResponse,
  waitForDouyinWorkPageReady } from '../src/module/utils/DouyinBrowserFallback'

const createResponse = (url: string, data: unknown) => ({
  url: () => url,
  json: vi.fn(async () => data)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Douyin browser fallback response waiting', () => {
  it('does not block images on user pages so the post list can load', () => {
    expect(DOUYIN_USER_PAGE_BLOCKED_RESOURCE_TYPES).toEqual(['media', 'font'])
    expect(DOUYIN_USER_PAGE_BLOCKED_RESOURCE_TYPES).not.toContain('image')
  })

  it('does not fail browser fallback when Douyin cookie is empty', () => {
    expect(parseCookieHeader(null)).toEqual([])
    expect(parseCookieHeader('')).toEqual([])
  })

  it('resolves when the page HTML contains parseable router data', async () => {
    vi.useFakeTimers()
    const html = `
      <script>
        window._ROUTER_DATA = {"loaderData":{"video_(id)/page":{"videoInfoRes":{"item_list":[{"aweme_id":"7643744539958136955","aweme_type":0,"desc":"测试视频","preview_title":"测试视频","share_url":"https://www.douyin.com/video/7643744539958136955","create_time":1,"author":{"nickname":"作者","sec_uid":"sec","avatar_thumb":{"url_list":["https://example.com/avatar.jpg"]}},"statistics":{"digg_count":1,"comment_count":2,"collect_count":3,"share_count":4},"video":{"duration":1000,"width":720,"height":1280,"ratio":"720:1280","bit_rate":[{"FPS":25,"play_addr":{"url_list":["https://example.com/video.mp4"],"width":720,"height":1280}}],"cover":{"url_list":["https://example.com/cover.jpg"]}}}]}}}}
      </script>
    `
    const page = {
      content: vi.fn(async () => html),
      url: vi.fn(() => 'https://www.douyin.com/video/7643744539958136955')
    }

    const result = await waitForDouyinWorkPageReady(page as any, {
      aweme_id: '7643744539958136955',
      typeHint: 'video'
    }, 30_000)

    expect(result).toMatchObject({
      awemeId: '7643744539958136955',
      subtype: 'video',
      title: '测试视频'
    })
  })

  it('keeps polling until the page HTML becomes parseable', async () => {
    vi.useFakeTimers()
    const html = `
      <script>
        window._ROUTER_DATA = {"loaderData":{"video_(id)/page":{"videoInfoRes":{"item_list":[{"aweme_id":"7643744539958136955","aweme_type":0,"desc":"测试视频","preview_title":"测试视频","share_url":"https://www.douyin.com/video/7643744539958136955","create_time":1,"author":{"nickname":"作者","sec_uid":"sec","avatar_thumb":{"url_list":["https://example.com/avatar.jpg"]}},"statistics":{"digg_count":1,"comment_count":2,"collect_count":3,"share_count":4},"video":{"duration":1000,"width":720,"height":1280,"ratio":"720:1280","bit_rate":[{"FPS":25,"play_addr":{"url_list":["https://example.com/video.mp4"],"width":720,"height":1280}}],"cover":{"url_list":["https://example.com/cover.jpg"]}}}]}}}}
      </script>
    `
    const page = {
      content: vi
        .fn()
        .mockResolvedValueOnce('<html><body>loading</body></html>')
        .mockResolvedValueOnce('<html><body>still loading</body></html>')
        .mockResolvedValueOnce(html),
      url: vi.fn(() => 'https://www.douyin.com/video/7643744539958136955')
    }

    const promise = waitForDouyinWorkPageReady(page as any, {
      aweme_id: '7643744539958136955',
      typeHint: 'video'
    }, 5_000)

    await vi.advanceTimersByTimeAsync(600)
    await expect(promise).resolves.toMatchObject({
      awemeId: '7643744539958136955',
      subtype: 'video'
    })
    expect(page.content).toHaveBeenCalledTimes(3)
  })

  it('falls back to captured aweme detail work when article HTML never becomes parseable', async () => {
    vi.useFakeTimers()
    const page = {
      content: vi
        .fn()
        .mockResolvedValueOnce('<html><body>loading</body></html>')
        .mockResolvedValueOnce('<html><body>still loading</body></html>')
        .mockResolvedValueOnce('<html><body>app shell only</body></html>'),
      url: vi.fn(() => 'https://www.douyin.com/article/7636333515160484072')
    }
    const capturedWork = {
      awemeId: '7636333515160484072',
      subtype: 'article',
      title: '纪念 #马克思',
      desc: '纪念 #马克思',
      previewTitle: '纪念 #马克思',
      shareUrl: 'https://www.douyin.com/article/7636333515160484072',
      createTime: 1,
      isSlides: false,
      author: {
        nickname: '作者',
        avatar: '',
        secUid: '',
        uniqueId: '',
        shortId: '',
        followerCount: 0,
        followingCount: 0,
        totalFavorited: 0
      },
      stats: {
        diggCount: 1,
        commentCount: 2,
        collectCount: 3,
        shareCount: 4,
        playCount: 0,
        recommendCount: 0
      },
      images: [{ index: 0, urlList: ['https://example.com/article-image.jpg'] }],
      comments: [],
      textExtra: [],
      article: {
        title: '纪念 #马克思',
        markdown: '正文'
      },
      raw: {
        source: 'detail',
        payload: {}
      }
    } as any
    let pollCount = 0

    const promise = waitForDouyinWorkPageReady(page as any, {
      aweme_id: '7636333515160484072',
      typeHint: 'article'
    }, 5_000, () => {
      pollCount += 1
      return pollCount >= 3 ? capturedWork : null
    })

    await vi.advanceTimersByTimeAsync(600)
    await expect(promise).resolves.toMatchObject({
      awemeId: '7636333515160484072',
      subtype: 'article'
    })
  })

  it('rejects on timeout and removes listeners', async () => {
    vi.useFakeTimers()
    const page = {
      content: vi.fn(async () => '<html><body>loading</body></html>')
    }

    const promise = waitForDouyinWorkPageReady(page as any, {
      aweme_id: '7643744539958136955'
    }, 1_000)
    const expectation = expect(promise).rejects.toThrow('等待 Douyin 浏览器页面 HTML 解析超时')
    await vi.advanceTimersByTimeAsync(1_000)

    await expectation
  })

  it('retries with a clean session after configured-cookie timeout', async () => {
    const result = {
      awemeId: '7643744539958136955',
      subtype: 'video',
      title: '测试视频',
      desc: '测试视频',
      previewTitle: '测试视频',
      shareUrl: 'https://www.douyin.com/video/7643744539958136955',
      createTime: 1,
      isSlides: false,
      author: {
        nickname: '作者',
        avatar: '',
        secUid: '',
        uniqueId: '',
        shortId: '',
        followerCount: 0,
        followingCount: 0,
        totalFavorited: 0
      },
      stats: {
        diggCount: 1,
        commentCount: 2,
        collectCount: 3,
        shareCount: 4,
        playCount: 5,
        recommendCount: 0
      },
      images: [],
      comments: [],
      textExtra: [],
      video: {
        playUrl: 'https://example.com/video.mp4',
        backupUrls: [],
        coverUrl: 'https://example.com/cover.jpg',
        dynamicCoverUrl: 'https://example.com/cover.jpg',
        duration: 1000,
        width: 720,
        height: 1280,
        ratio: '720:1280',
        fps: 25
      },
      raw: {
        source: 'router',
        payload: {}
      }
    }
    const attempt = vi.fn<
      ({ idData, cookieHeader, timeoutMs }: { idData: { type: string, aweme_id: string }, cookieHeader: string, timeoutMs: number }) => Promise<typeof result>
    >(async ({ cookieHeader }) => {
      if (cookieHeader) {
        throw new Error('等待 Douyin 浏览器页面 HTML 解析超时')
      }
      return result
    })

    await expect(
      runDouyinWorkBrowserFallback(
        {
          type: 'one_work',
          aweme_id: '7643744539958136955'
        },
        attempt,
        'ttwid=stale; s_v_web_id=verify_stale'
      )
    ).resolves.toBe(result)

    expect(attempt).toHaveBeenCalledTimes(2)
    expect(attempt).toHaveBeenNthCalledWith(1, expect.objectContaining({
      idData: {
        type: 'one_work',
        aweme_id: '7643744539958136955'
      },
      cookieHeader: 'ttwid=stale; s_v_web_id=verify_stale'
    }))
    expect(attempt).toHaveBeenNthCalledWith(2, expect.objectContaining({
      idData: {
        type: 'one_work',
        aweme_id: '7643744539958136955'
      },
      cookieHeader: ''
    }))
    expect(attempt.mock.calls[0]?.[0].timeoutMs).toBeLessThanOrEqual(DOUYIN_WORK_BROWSER_FALLBACK_TIMEOUT_MS)
    expect(attempt.mock.calls[1]?.[0].timeoutMs).toBeLessThanOrEqual(DOUYIN_WORK_BROWSER_FALLBACK_TIMEOUT_MS)
  })

  it('does not retry clean session when there is no usable configured cookie', async () => {
    const attempt = vi.fn<
      ({ idData, cookieHeader, timeoutMs }: { idData: { type: string, aweme_id: string }, cookieHeader: string, timeoutMs: number }) => Promise<never>
    >(async () => {
      throw new Error('等待 Douyin 浏览器页面 HTML 解析超时')
    })

    await expect(
      runDouyinWorkBrowserFallback(
        {
          type: 'one_work',
          aweme_id: '7643744539958136955'
        },
        attempt,
        '__kkk_guest_douyin_web_id=123'
      )
    ).rejects.toThrow('等待 Douyin 浏览器页面 HTML 解析超时')

    expect(attempt).toHaveBeenCalledTimes(1)
    expect(attempt).toHaveBeenCalledWith(expect.objectContaining({
      idData: {
        type: 'one_work',
        aweme_id: '7643744539958136955'
      },
      cookieHeader: '__kkk_guest_douyin_web_id=123'
    }))
  })

  it('shares one time budget across the cookie and clean-session attempts', async () => {
    let currentTime = 0
    const attempt = vi.fn(async ({ timeoutMs }: { timeoutMs: number }) => {
      currentTime += timeoutMs
      throw new Error('等待 Douyin 浏览器页面 HTML 解析超时')
    })

    await expect(runDouyinWorkBrowserFallback(
      {
        type: 'one_work',
        aweme_id: '7643744539958136955'
      },
      attempt,
      'ttwid=stale; s_v_web_id=verify_stale',
      {
        timeoutMs: DOUYIN_WORK_BROWSER_FALLBACK_TIMEOUT_MS,
        now: () => currentTime
      }
    )).rejects.toThrow('等待 Douyin 浏览器页面 HTML 解析超时')

    expect(attempt).toHaveBeenCalledTimes(1)
    expect(attempt.mock.calls[0]?.[0].timeoutMs).toBe(DOUYIN_WORK_BROWSER_FALLBACK_TIMEOUT_MS)
  })

  it('resolves when the matching user profile response arrives', async () => {
    vi.useFakeTimers()
    const page = new EventEmitter()
    const secUid = 'MS4wLjABAAAATEST'
    const profile = {
      status_code: 0,
      user: {
        sec_uid: secUid,
        nickname: 'tester'
      }
    }

    const promise = waitForDouyinUserProfileResponse(page as any, secUid, 30_000)

    page.emit('response', createResponse(`https://www.douyin.com/aweme/v1/web/user/profile/other/?sec_user_id=${encodeURIComponent('wrong')}`, {
      status_code: 0,
      user: {
        sec_uid: 'wrong'
      }
    }))
    await Promise.resolve()

    expect(page.listenerCount('response')).toBe(1)

    page.emit('response', createResponse(`https://www.douyin.com/aweme/v1/web/user/profile/other/?sec_user_id=${encodeURIComponent(secUid)}`, profile))

    await expect(promise).resolves.toBe(profile)
    expect(page.listenerCount('response')).toBe(0)
  })

  it('resolves when the matching user post response arrives', async () => {
    vi.useFakeTimers()
    const page = new EventEmitter()
    const secUid = 'MS4wLjABAAAATEST'
    const postList = {
      status_code: 0,
      aweme_list: [
        { aweme_id: '1' },
        { aweme_id: '2' }
      ]
    }

    const promise = waitForDouyinUserPostResponse(page as any, secUid, 30_000)

    page.emit('response', createResponse(`https://www.douyin.com/aweme/v1/web/aweme/post/?sec_user_id=${encodeURIComponent(secUid)}`, postList))

    await expect(promise).resolves.toBe(postList)
    expect(page.listenerCount('response')).toBe(0)
  })
})
