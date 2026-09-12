import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  axiosGet: vi.fn(),
  axiosPost: vi.fn(),
  config: {
    cookies: {
      tiktok: ''
    },
    request: {
      'User-Agent': 'UnitTest UA',
      proxy: { switch: false },
      timeout: 10000
    }
  },
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn()
}))

vi.mock('node-karin/axios', () => ({
  default: {
    get: state.axiosGet,
    post: state.axiosPost
  }
}))

vi.mock('node-karin', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: state.loggerInfo,
    mark: vi.fn(),
    warn: state.loggerWarn
  }
}))

vi.mock('@/module/utils/Config', () => ({
  Config: state.config
}))

const { fetchTikTokVideoDetail } = await import('../src/platform/tiktok/api')

describe('TikTok detail fetch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.config.cookies.tiktok = ''
    state.axiosPost.mockResolvedValue({
      headers: {}
    })
  })

  it('retries item/detail without short-link page cookies when the primary response has no item', async () => {
    state.axiosGet
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: {}
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: {
          itemInfo: {
            itemStruct: {
              id: '7643493503778966797',
              desc: 'fallback detail',
              video: {
                playAddr: 'https://video.example/fallback.mp4'
              }
            }
          }
        }
      })

    const detail = await fetchTikTokVideoDetail({
      itemId: '7643493503778966797',
      pageUrl: 'https://www.tiktok.com/@good.ball21/video/7643493503778966797',
      pageCookie: 'ttwid=short-link-ttwid; msToken=short-link-ms-token'
    })

    expect(detail.urls).toEqual(['https://video.example/fallback.mp4'])
    expect(state.axiosGet).toHaveBeenCalledTimes(2)
    expect(state.axiosPost).toHaveBeenCalledTimes(1)
    expect(state.loggerWarn).toHaveBeenCalledWith(expect.stringContaining('基础 Cookie 重试一次'))
  })

  it('falls back to anonymous HTML parsing when configured TikTok cookies return empty pages', async () => {
    state.config.cookies.tiktok = 'ttwid=auto-tt; msToken=auto-ms; delay_guest_mode_vid=guest'
    state.axiosGet
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: {}
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: {}
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: '<html><body>guest mode</body></html>'
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({
          __DEFAULT_SCOPE__: {
            'webapp.video-detail': {
              itemInfo: {
                itemStruct: {
                  id: '7643493503778966797',
                  desc: 'anonymous fallback',
                  video: {
                    playAddr: 'https://video.example/anonymous.mp4'
                  }
                }
              }
            }
          }
        })}</script>`
      })

    const detail = await fetchTikTokVideoDetail({
      itemId: '7643493503778966797',
      pageUrl: 'https://www.tiktok.com/@good.ball21/video/7643493503778966797',
      pageCookie: 'msToken=page-ms-token'
    })

    expect(detail.urls).toEqual(['https://video.example/anonymous.mp4'])
    expect(state.axiosGet).toHaveBeenCalledTimes(4)
    expect(state.loggerWarn).toHaveBeenCalledWith(expect.stringContaining('匿名 Cookie 重试一次'))
  })

  it('rejects non-tiktok page urls before html fallback requests', async () => {
    state.axiosGet.mockResolvedValue({
      status: 200,
      headers: {},
      data: {}
    })

    await expect(fetchTikTokVideoDetail({
      itemId: '7643493503778966797',
      pageUrl: 'https://evil.example/@good.ball21/video/7643493503778966797',
      pageCookie: 'ttwid=short-link-ttwid; msToken=short-link-ms-token'
    })).rejects.toThrow(/TikTok/i)
  })
})
