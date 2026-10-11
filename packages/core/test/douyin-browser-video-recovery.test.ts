import { EventEmitter } from 'node:events'

import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  page: null as any,
  close: vi.fn()
}))

vi.mock('node-karin', () => ({ logger: { warn: vi.fn() } }))
vi.mock('@/module/utils/Config', () => ({ Config: { cookies: { douyin: '' } } }))
vi.mock('@/module/utils/ErrorTrace', () => ({ recordFailureTraceStep: vi.fn() }))
vi.mock('@/module/utils/BrowserRuntime', () => ({
  closeBrowserSafely: async () => state.close(),
  configureRequestBlocking: vi.fn(),
  createInjectedPage: async () => state.page,
  getBrowserLaunchOptions: () => ({})
}))
vi.mock('@snapka/puppeteer', () => ({
  snapka: { launch: async () => ({ browser: {} }) }
}))

const { fetchDouyinHtmlWorkByBrowser, waitForDouyinWorkPageReady } = await import('../src/module/utils/DouyinBrowserFallback')
const awemeId = '7681623817793342771'
const wrapperUrl = 'https://aweme.snssdk.com/aweme/v1/playwm/?video_id=v02033g10000dad9obnog65v0t8thf60&ratio=720p&line=0'
const detail = {
  aweme_id: awemeId,
  aweme_type: 4,
  desc: '测试视频',
  author: { nickname: '作者' },
  video: {
    duration: 19343,
    width: 720,
    height: 1280,
    play_addr: { url_list: [wrapperUrl] }
  }
}
const weakHtml = `<script>window._ROUTER_DATA = ${JSON.stringify({
  loaderData: { 'video_(id)/page': { videoInfoRes: { item_list: [detail] } } }
})}</script>`

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('Douyin browser video recovery', () => {
  it('starts at the desktop page and waits past wrapper-only HTML for its video detail response', async () => {
    vi.useFakeTimers()
    const page = Object.assign(new EventEmitter(), {
      url: () => `https://www.douyin.com/video/${awemeId}`,
      content: vi.fn(async () => weakHtml),
      goto: vi.fn(async () => {})
    })
    state.page = page
    const promise = fetchDouyinHtmlWorkByBrowser({ type: 'one_work', aweme_id: awemeId, typeHint: 'video' })
    await vi.advanceTimersByTimeAsync(250)
    expect(page.goto).toHaveBeenCalledWith(`https://www.douyin.com/video/${awemeId}`, expect.any(Object))
    expect(page.content).toHaveBeenCalled()

    const directUrl = 'https://example.com/browser-video.mp4'
    page.emit('response', {
      url: () => `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${awemeId}`,
      json: async () => ({ status_code: 0, aweme_detail: {
        ...detail, aweme_id: 'other-work', video: { ...detail.video, play_addr: { url_list: [directUrl] } }
      } })
    })
    await vi.advanceTimersByTimeAsync(250)
    expect(page.listenerCount('response')).toBe(1)
    expect(state.close).not.toHaveBeenCalled()

    page.emit('response', {
      url: () => `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${awemeId}`,
      json: async () => ({ status_code: 0, aweme_detail: {
        ...detail, video: { ...detail.video, play_addr: { url_list: [directUrl] } }
      } })
    })
    await vi.advanceTimersByTimeAsync(250)

    await expect(promise).resolves.toMatchObject({
      awemeId, subtype: 'video', video: { playUrl: directUrl }, raw: { source: 'detail' }
    })
    expect(page.goto).toHaveBeenCalledTimes(1)
    expect(page.listenerCount('response')).toBe(0)
    expect(state.close).toHaveBeenCalledTimes(1)
  })

  it('rejects a parseable page that never provides a video direct URL', async () => {
    vi.useFakeTimers()
    const promise = waitForDouyinWorkPageReady({ content: async () => weakHtml }, { aweme_id: awemeId }, 1000)
    const expectation = expect(promise).rejects.toThrow('未取得视频直链')
    await vi.advanceTimersByTimeAsync(1000)
    await expectation
  })
})
