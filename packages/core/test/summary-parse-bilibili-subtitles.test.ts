import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  axiosGet: vi.fn(),
  wbiSign: vi.fn()
}))

vi.mock('node-karin', () => ({
  logger: {
    mark: vi.fn(),
    warn: vi.fn()
  }
}))

vi.mock('node-karin/axios', () => ({
  default: {
    get: (...args: unknown[]) => state.axiosGet(...args)
  }
}))

vi.mock('@ikenxuan/amagi', () => ({
  wbi_sign: (...args: unknown[]) => state.wbiSign(...args)
}))

import { fetchBilibiliSubtitleReferences } from '../src/module/summaryParse/bilibiliSubtitles'

describe('bilibili subtitle references', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.wbiSign.mockResolvedValue('&w_rid=test-wbi-signature&wts=1711111111')
  })

  it('prefers the WBI subtitle endpoint when aid and cookie are available', async () => {
    state.axiosGet.mockResolvedValue({
      data: {
        data: {
          subtitle: {
            subtitles: [
              {
                subtitle_url: '//i0.hdslb.com/bfs/subtitle/test.json',
                lan: 'zh-CN',
                lan_doc: '中文（自动生成）'
              }
            ]
          }
        }
      }
    })

    const subtitles = await fetchBilibiliSubtitleReferences({
      aid: 9527,
      bvid: 'BV1Z3jc6rEQi',
      cid: 39213992018,
      headers: {
        'User-Agent': 'kkk-test',
        Cookie: 'SESSDATA=test',
        Referer: 'https://www.bilibili.com'
      }
    })

    expect(state.wbiSign).toHaveBeenCalledWith(
      'https://api.bilibili.com/x/player/wbi/v2?aid=9527&cid=39213992018',
      'SESSDATA=test'
    )
    expect(state.axiosGet).toHaveBeenCalledWith(
      'https://api.bilibili.com/x/player/wbi/v2',
      expect.objectContaining({
        params: {
          aid: '9527',
          cid: '39213992018',
          w_rid: 'test-wbi-signature',
          wts: '1711111111'
        },
        headers: expect.objectContaining({
          'Cache-Control': 'no-cache',
          Cookie: 'SESSDATA=test',
          Pragma: 'no-cache',
          Referer: 'https://www.bilibili.com',
          'User-Agent': 'kkk-test'
        })
      })
    )
    expect(subtitles).toEqual([
      {
        type: 'subtitle',
        source: 'bilibili',
        language: 'zh-CN',
        label: '中文（自动生成）',
        url: 'https://i0.hdslb.com/bfs/subtitle/test.json',
        headers: {
          'User-Agent': 'kkk-test',
          Cookie: 'SESSDATA=test',
          Referer: 'https://www.bilibili.com'
        }
      }
    ])
  })

  it('returns an empty list when subtitle probing fails', async () => {
    state.axiosGet.mockRejectedValue(new Error('request failed'))

    const subtitles = await fetchBilibiliSubtitleReferences({
      aid: 9527,
      bvid: 'BV1Z3jc6rEQi',
      cid: 39213992018,
      headers: {
        Cookie: 'SESSDATA=test',
        Referer: 'https://www.bilibili.com'
      }
    })

    expect(subtitles).toEqual([])
  })

  it('returns an empty list when WBI prerequisites are missing', async () => {
    const subtitles = await fetchBilibiliSubtitleReferences({
      bvid: 'BV1Z3jc6rEQi',
      cid: 39213992018,
      headers: {
        Referer: 'https://www.bilibili.com'
      }
    })

    expect(state.wbiSign).not.toHaveBeenCalled()
    expect(state.axiosGet).not.toHaveBeenCalled()
    expect(subtitles).toEqual([])
  })

  it('returns an empty list when WBI probing fails', async () => {
    state.wbiSign.mockResolvedValue('aid=9527&cid=39213992018&w_rid=test-wbi-signature&wts=1711111111')
    state.axiosGet.mockRejectedValueOnce(new Error('wbi failed'))

    const subtitles = await fetchBilibiliSubtitleReferences({
      aid: 9527,
      bvid: 'BV1Z3jc6rEQi',
      cid: 39213992018,
      headers: {
        Cookie: 'SESSDATA=test',
        Referer: 'https://www.bilibili.com'
      }
    })

    expect(state.axiosGet).toHaveBeenCalledTimes(1)
    expect(state.axiosGet.mock.calls[0]?.[0]).toBe('https://api.bilibili.com/x/player/wbi/v2')
    expect(subtitles).toEqual([])
  })

  it('falls back to local WBI signing when amagi signing fails', async () => {
    state.wbiSign.mockRejectedValueOnce(new Error('sign failed'))
    state.axiosGet
      .mockResolvedValueOnce({
        data: {
          data: {
            wbi_img: {
              img_url: 'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png',
              sub_url: 'https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png'
            }
          }
        }
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            subtitle: {
              subtitles: [
                {
                  subtitle_url: '//aisubtitle.hdslb.com/bfs/subtitle/test.json',
                  lan: 'ai-zh',
                  lan_doc: '中文'
                }
              ]
            }
          }
        }
      })

    const subtitles = await fetchBilibiliSubtitleReferences({
      aid: 9527,
      bvid: 'BV1Z3jc6rEQi',
      cid: 39213992018,
      headers: {
        'User-Agent': 'kkk-test',
        Cookie: 'SESSDATA=test',
        Referer: 'https://www.bilibili.com'
      }
    })

    expect(state.axiosGet).toHaveBeenNthCalledWith(
      1,
      'https://api.bilibili.com/x/web-interface/nav',
      expect.objectContaining({
        proxy: false,
        headers: expect.objectContaining({
          Cookie: 'SESSDATA=test',
          Referer: 'https://www.bilibili.com',
          'User-Agent': 'kkk-test'
        })
      })
    )
    expect(state.axiosGet).toHaveBeenNthCalledWith(
      2,
      'https://api.bilibili.com/x/player/wbi/v2',
      expect.objectContaining({
        params: expect.objectContaining({
          aid: '9527',
          cid: '39213992018'
        })
      })
    )
    expect(subtitles).toEqual([
      {
        type: 'subtitle',
        source: 'bilibili',
        language: 'ai-zh',
        label: '中文',
        url: 'https://aisubtitle.hdslb.com/bfs/subtitle/test.json',
        headers: {
          'User-Agent': 'kkk-test',
          Cookie: 'SESSDATA=test',
          Referer: 'https://www.bilibili.com'
        }
      }
    ])
  })
})
