import { describe, expect, it } from 'vitest'

import {
  allowEnvironmentProxyForTikTok,
  buildTikTokPostDetailParams,
  buildTikTokPostDetailUrl,
  extractTikTokItemFromHtml,
  extractTikTokVideoCandidates,
  mergeTikTokCookieHeaders,
  TIKTOK_USER_AGENT
} from '../src/platform/tiktok/api'
import { resolveTikTokProxyUrl } from '../src/platform/tiktok/proxy'

describe('TikTok API helpers', () => {
  it('keeps the TikTok Web user agent aligned with the reference crawler', () => {
    expect(TIKTOK_USER_AGENT).toContain('Chrome/90.0.4430.212')
  })

  it('builds TikTok post detail params with reference web defaults', () => {
    const params = buildTikTokPostDetailParams('7643493503778966797', 'ms-token')

    expect(params.itemId).toBe('7643493503778966797')
    expect(params.aid).toBe('1988')
    expect(params.app_name).toBe('tiktok_web')
    expect(params.device_platform).toBe('web_pc')
    expect(params.msToken).toBe('ms-token')
  })

  it('signs post detail endpoint with X-Bogus', () => {
    const url = buildTikTokPostDetailUrl({
      itemId: '7643493503778966797',
      userAgent: 'Mozilla/5.0 UnitTest',
      cookie: 'msToken=ms-token'
    })
    const parsed = new URL(url)

    expect(`${parsed.origin}${parsed.pathname}`).toBe('https://www.tiktok.com/api/item/detail/')
    expect(parsed.searchParams.get('itemId')).toBe('7643493503778966797')
    expect(parsed.searchParams.get('X-Bogus')).toMatch(/^[\w\-/=]+$/)
  })

  it('merges configured cookies, page cookies and response msToken without leaking metadata', () => {
    const cookie = mergeTikTokCookieHeaders({
      configuredCookie: 'ttwid=config-ttwid; sessionid=secret',
      pageCookie: 'ttwid=page-ttwid; tt_csrf_token=csrf',
      responseMsToken: 'header-ms-token'
    })

    expect(cookie).toContain('ttwid=page-ttwid')
    expect(cookie).toContain('sessionid=secret')
    expect(cookie).toContain('tt_csrf_token=csrf')
    expect(cookie).toContain('msToken=header-ms-token')
  })

  it('treats blank YAML cookies as empty values', () => {
    const cookie = mergeTikTokCookieHeaders({
      configuredCookie: null,
      pageCookie: 'ttwid=page-ttwid'
    })

    expect(cookie).toContain('ttwid=page-ttwid')
    expect(cookie).toContain('msToken=')
  })

  it('does not disable environment proxy when no TikTok proxy is configured', () => {
    expect(allowEnvironmentProxyForTikTok({ timeout: 1000, proxy: false }, undefined, {})).toEqual({ timeout: 1000 })

    const proxied = allowEnvironmentProxyForTikTok({
      timeout: 1000,
      proxy: { protocol: 'http', host: '127.0.0.1', port: 7890 }
    }, undefined, {})

    expect(proxied.proxy).toBe(false)
    expect(proxied.httpsAgent).toBeTruthy()
  })

  it('keeps numeric legacy TikTok proxy credentials as strings', () => {
    expect(resolveTikTokProxyUrl({
      switch: true,
      host: '127.0.0.1',
      port: 7890,
      protocol: 'http',
      auth: {
        username: 123456,
        password: 654321
      }
    } as any, {})).toBe('http://123456:654321@127.0.0.1:7890')
  })

  it('extracts video URLs in the planned priority order', () => {
    const urls = extractTikTokVideoCandidates({
      video: {
        playAddr: 'https://video.example/play.mp4',
        downloadAddr: 'https://video.example/download.mp4',
        bitrateInfo: [
          {
            PlayAddr: {
              UrlList: [
                'https://video.example/backup-a.mp4',
                'https://video.example/play.mp4',
                'https://video.example/backup-b.mp4'
              ]
            }
          }
        ]
      }
    })

    expect(urls).toEqual([
      'https://video.example/play.mp4',
      'https://video.example/download.mp4',
      'https://video.example/backup-a.mp4',
      'https://video.example/backup-b.mp4'
    ])
  })

  it('extracts item detail from TikTok HTML hydration data', () => {
    const html = `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({
      __DEFAULT_SCOPE__: {
        'webapp.video-detail': {
          itemInfo: {
            itemStruct: {
              id: '7643493503778966797',
              desc: 'fixture video'
            }
          }
        }
      }
    })}</script>`

    expect(extractTikTokItemFromHtml(html)).toEqual({
      id: '7643493503778966797',
      desc: 'fixture video'
    })
  })
})
