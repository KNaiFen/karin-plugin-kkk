import { describe, expect, it, vi } from 'vitest'

import {
  assertPathWithinRoot,
  assertSafeFileUrlWithinRoot,
  executeSafeAxiosRequest,
  isTrustedTikTokUrl
} from '../src/module/utils/OutboundRequest'

describe('outbound request guards', () => {
  it('accepts trusted TikTok page hosts only', () => {
    expect(isTrustedTikTokUrl('https://www.tiktok.com/@user/video/1')).toBe(true)
    expect(isTrustedTikTokUrl('https://vt.tiktok.com/ZSxVY1Gos/')).toBe(true)
    expect(isTrustedTikTokUrl('https://evil.example/video/1')).toBe(false)
  })

  it('rejects file urls outside of the declared cache root', () => {
    expect(() => assertSafeFileUrlWithinRoot('file:///tmp/kkk-safe/a.jpg', '/tmp/kkk-safe')).not.toThrow()
    expect(() => assertSafeFileUrlWithinRoot('file:///tmp/other/a.jpg', '/tmp/kkk-safe')).toThrow(/越界/)
  })

  it('rejects plain paths outside of the declared root', () => {
    expect(() => assertPathWithinRoot('/tmp/kkk-safe/cache/a.json', '/tmp/kkk-safe')).not.toThrow()
    expect(() => assertPathWithinRoot('/tmp/kkk-safe/../escape/a.json', '/tmp/kkk-safe')).toThrow(/越界/)
  })

  it('allows manual redirect handling even when requester uses default axios status semantics', async () => {
    const resolveLikeAxios = async (response: any, config?: { validateStatus?: (status: number) => boolean }) => {
      const validateStatus = config?.validateStatus ?? ((status: number) => status >= 200 && status < 300)
      if (!validateStatus(response.status)) {
        const error = Object.assign(new Error(`Request failed with status code ${response.status}`), {
          config,
          request: response.request,
          response,
          status: response.status
        })
        throw error
      }
      return response
    }

    const requester = vi.fn()
      .mockImplementationOnce(async (config: any) => await resolveLikeAxios({
        status: 301,
        headers: {
          location: 'https://www.tiktok.com/@user/video/1234567890?_r=1'
        },
        config: {
          url: 'https://vt.tiktok.com/ZS-test/'
        },
        request: {
          res: {
            responseUrl: 'https://vt.tiktok.com/ZS-test/'
          }
        }
      }, config))
      .mockImplementationOnce(async (config: any) => await resolveLikeAxios({
        status: 200,
        headers: {},
        config: {
          url: 'https://www.tiktok.com/@user/video/1234567890?_r=1'
        },
        request: {
          res: {
            responseUrl: 'https://www.tiktok.com/@user/video/1234567890?_r=1'
          }
        }
      }, config))

    const result = await executeSafeAxiosRequest({
      url: 'https://vt.tiktok.com/ZS-test/',
      method: 'GET'
    }, {
      profile: 'tiktok-page',
      maxRedirects: 10,
      requester
    })

    expect(result.finalUrl).toBe('https://www.tiktok.com/@user/video/1234567890?_r=1')
    expect(requester).toHaveBeenCalledTimes(2)
  })

  it('follows redirects even when a custom requester always throws on 3xx responses', async () => {
    const requester = vi.fn()
      .mockImplementationOnce(async () => {
        const response = {
          status: 301,
          headers: {
            location: 'https://www.tiktok.com/@user/video/1234567890?_r=1'
          },
          config: {
            url: 'https://vt.tiktok.com/ZS-test/'
          },
          request: {
            res: {
              responseUrl: 'https://vt.tiktok.com/ZS-test/'
            }
          }
        }
        throw Object.assign(new Error('Request failed with status code 301'), {
          response,
          status: 301
        })
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        config: {
          url: 'https://www.tiktok.com/@user/video/1234567890?_r=1'
        },
        request: {
          res: {
            responseUrl: 'https://www.tiktok.com/@user/video/1234567890?_r=1'
          }
        }
      })

    const result = await executeSafeAxiosRequest({
      url: 'https://vt.tiktok.com/ZS-test/',
      method: 'GET'
    }, {
      profile: 'tiktok-page',
      maxRedirects: 10,
      requester
    })

    expect(result.finalUrl).toBe('https://www.tiktok.com/@user/video/1234567890?_r=1')
    expect(requester).toHaveBeenCalledTimes(2)
  })

  it('allows xhslink.cn only through the Xiaohongshu redirect profile', async () => {
    const shortLink = 'http://xhslink.cn/o/1wPOQ9a9RyI'
    const longLink = 'https://www.xiaohongshu.com/discovery/item/6a7df5b50000000025000cb6?xsec_token=test-token'
    const requester = vi.fn()
      .mockResolvedValueOnce({
        status: 302,
        headers: { location: longLink },
        config: { url: shortLink },
        request: { res: { responseUrl: shortLink } }
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        config: { url: longLink },
        request: { res: { responseUrl: longLink } }
      })

    const result = await executeSafeAxiosRequest({
      url: shortLink,
      method: 'HEAD'
    }, {
      profile: 'xiaohongshu-redirect',
      requester
    })

    expect(result.finalUrl).toBe(longLink)
    expect(requester).toHaveBeenCalledTimes(2)

    await expect(executeSafeAxiosRequest({
      url: 'http://xhslink.cn.evil.example/o/1wPOQ9a9RyI',
      method: 'HEAD'
    }, {
      profile: 'xiaohongshu-redirect',
      requester
    })).rejects.toThrow('目标主机不在白名单内')
    expect(requester).toHaveBeenCalledTimes(2)
  })
})
