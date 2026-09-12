import { describe, expect, it } from 'vitest'

import { createGuestCookieWebConfig, normalizeGuestCookieFrontendConfig } from '../src/module/utils/guestCookieWebConfig'

describe('guest cookie web config helpers', () => {
  it('does not expose required cookie inputs in the web settings form', () => {
    const config = createGuestCookieWebConfig({
      switch: true,
      refreshIntervalHours: 12,
      refreshJitterMinutes: 60,
      minRefreshAgeHours: 6,
      httpTimeoutSeconds: 20,
      browserTimeoutSeconds: 30,
      pageSettleSeconds: 3,
      blockMedia: true,
      blockFont: true,
      logging: {
        switch: true,
        retentionDays: 30,
        maxFileSizeMB: 10
      },
      douyin: { switch: true, pageUrl: 'https://www.douyin.com/jingxuan?enter=guide', testUrl: 'https://v.douyin.com/pGDQzKiWtBM/', requiredCookies: ['ttwid', 's_v_web_id'] },
      xiaohongshu: { switch: true, pageUrl: 'https://www.xiaohongshu.com/explore', testUrl: 'http://xhslink.cn/o/1wPOQ9a9RyI', requiredCookies: ['a1', 'webId', 'web_session'] },
      tiktok: { switch: true, pageUrl: 'https://www.tiktok.com/', testUrl: 'https://vt.tiktok.com/ZSxVY1Gos/', requiredCookies: ['ttwid', 'msToken'] },
      heybox: { switch: true, pageUrl: 'https://www.xiaoheihe.cn/', testUrl: 'https://www.xiaoheihe.cn/app/bbs/link/4a9471857e40', requiredCookies: ['x_xhh_tokenid'] },
      zhihu: { switch: true, pageUrl: 'https://www.zhihu.com/', testUrl: 'https://www.zhihu.com/question/19550283/answer/122329247', requiredCookies: ['_zap', 'd_c0'] },
      weibo: { switch: true, pageUrl: 'https://m.weibo.cn/', testUrl: 'https://weibo.com/5955106173/R2YQog7Pb', requiredCookies: ['SUB', 'SUBP'] }
    })

    expect(JSON.stringify(config)).not.toContain('requiredCookies')
  })

  it('drops legacy required cookie fields submitted by cached web forms', () => {
    const config = {
      douyin: {
        requiredCookies: 'ttwid, __kkk_guest_douyin_web_id'
      },
      xiaohongshu: {
        requiredCookies: 'a1，webId\nweb_session'
      },
      tiktok: {
        requiredCookies: ['ttwid', 'msToken']
      }
    }

    normalizeGuestCookieFrontendConfig(config)

    expect(config.douyin).not.toHaveProperty('requiredCookies')
    expect(config.xiaohongshu).not.toHaveProperty('requiredCookies')
    expect(config.tiktok).not.toHaveProperty('requiredCookies')
  })
})
