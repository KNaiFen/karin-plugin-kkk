import crypto from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  assertSmokeResponse,
  buildPackSmokePuppeteerConfig,
  buildSmokeRequestPath,
  createSignedRequestHeaders,
  inferSmokePlatformsFromChangedFiles,
  selectSmokeSamples
} from '../scripts/pack-smoke-lib.mjs'

const encodeSignature = (hex: string): string => {
  const offset = Array.from(hex).map(char => String.fromCharCode(char.charCodeAt(0) + 5)).join('')
  const asHex = Buffer.from(offset, 'utf8').toString('hex')
  const reversed = asHex.split('').reverse().join('')
  const base64Inner = Buffer.from(reversed, 'utf8').toString('base64')
  const urlEncoded = encodeURIComponent(base64Inner)
  return Buffer.from(urlEncoded, 'utf8').toString('base64')
}

describe('pack smoke helpers', () => {
  it('targets only directly changed platforms when the diff scope is narrow', () => {
    expect(inferSmokePlatformsFromChangedFiles([
      'packages/core/src/platform/douyin/douyin.ts'
    ])).toEqual({
      requiresFullRun: false,
      platforms: ['douyin']
    })
  })

  it('expands to a full platform run when shared parse surfaces change', () => {
    const result = inferSmokePlatformsFromChangedFiles([
      'packages/core/src/module/server/api/index.ts'
    ])

    expect(result.requiresFullRun).toBe(true)
    expect(result.platforms).toEqual(expect.arrayContaining([
      'douyin',
      'bilibili',
      'tiktok',
      'kuaishou',
      'xiaohongshu',
      'heybox',
      'x',
      'github',
      'zhihu',
      'tieba',
      'wechat',
      'weibo'
    ]))
  })

  it('filters selected samples by explicit platforms even after a shared-file full expansion', () => {
    const samples = selectSmokeSamples({
      changedFiles: ['packages/core/src/module/server/api/index.ts'],
      explicitPlatforms: ['github', 'wechat']
    })

    expect(samples.every(sample => ['github', 'wechat'].includes(sample.platform))).toBe(true)
    expect(samples.map(sample => sample.platform)).toEqual(expect.arrayContaining(['github', 'wechat']))
  })

  it('builds request signatures compatible with the server middleware', () => {
    const body = { input: 'https://v.douyin.com/Br9x2Q4WNfQ/' }
    const timestamp = 1710000000000
    const nonce = 'nonce-pack-smoke'
    const token = 'token-pack-smoke'
    const headers = createSignedRequestHeaders({
      method: 'POST',
      urlPath: '/api/kkk/v1/platforms/douyin/parse-by-url',
      body,
      timestamp,
      nonce,
      token
    })

    const signatureString = `POST|/api/kkk/v1/platforms/douyin/parse-by-url|${JSON.stringify(body)}|${timestamp}|${nonce}`
    const expected = encodeSignature(
      crypto.createHmac('sha256', token).update(signatureString).digest('hex')
    )

    expect(headers.authorization).toBe(`Bearer ${token}`)
    expect(headers['x-signature']).toBe(expected)
    expect(headers['x-timestamp']).toBe(String(timestamp))
    expect(headers['x-nonce']).toBe(nonce)
  })

  it('builds simulate-handler-by-url endpoints for handler smoke mode', () => {
    expect(buildSmokeRequestPath('douyin', 'parse')).toBe('/api/kkk/v1/platforms/douyin/parse-by-url')
    expect(buildSmokeRequestPath('douyin', 'handler')).toBe('/api/kkk/v1/platforms/douyin/simulate-handler-by-url')
  })

  it('forces pack smoke puppeteer to use an explicit local browser when available', () => {
    expect(buildPackSmokePuppeteerConfig('')).toBeNull()

    expect(buildPackSmokePuppeteerConfig('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')).toEqual({
      protocol: 'cdp',
      headless: 'new',
      findBrowser: false,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      download: {
        enable: false
      }
    })
  })

  it('requires image plus record for douyin graphic handler smoke samples', () => {
    const sample = {
      id: 'douyin-note-graphic',
      platform: 'douyin',
      input: 'https://v.douyin.com/Y_X0PQLygTY/',
      expectSubtypes: ['image', 'note'],
      expectedHandler: {
        contains: {
          image: true,
          record: true
        }
      }
    }

    expect(() => assertSmokeResponse(sample as any, 'handler', {
      platform: 'douyin',
      extractedUrl: 'https://www.douyin.com/note/7655935692011496546',
      simulation: {
        outputs: [{ channel: 'reply', elementTypes: ['video'] }],
        contains: {
          image: false,
          record: false,
          video: true
        }
      }
    })).toThrow('handler 输出缺少 image')

    expect(() => assertSmokeResponse(sample as any, 'handler', {
      platform: 'douyin',
      extractedUrl: 'https://www.douyin.com/note/7655935692011496546',
      simulation: {
        outputs: [
          { channel: 'reply', elementTypes: ['record'] },
          { channel: 'forward', elementTypes: ['image'] }
        ],
        contains: {
          image: true,
          record: true,
          video: false
        }
      }
    })).not.toThrow()
  })

  it('expects image-only handler output for douyin article smoke samples by default', () => {
    const articleSample = selectSmokeSamples({
      full: true,
      explicitPlatforms: ['douyin']
    }).find(sample => sample.id === 'douyin-article-graphic')

    expect(articleSample?.expectedHandler?.contains).toEqual({
      image: true
    })
  })
})
