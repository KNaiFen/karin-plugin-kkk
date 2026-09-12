import { describe, expect, it, vi } from 'vitest'

import {
  extractCookieHeader,
  type GuestCookieAuditEvent,
  GuestCookieManager,
  type GuestCookieManagerOptions,
  type GuestCookiePlatform,
  hasCookieName,
  resolveDouyinBrowserWebId,
  resolveGuestCookieRuntimeConfig } from '../src/module/utils/GuestCookieManager'

const createDeferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

const setCookie = [
  'a1=guest-a1; Path=/; Domain=.xiaohongshu.com; Secure; HttpOnly',
  'webId=douyin-web-id; Path=/; Domain=.douyin.com',
  'invalid-cookie-without-equals; Path=/',
  'msToken=token-value; Path=/; HttpOnly'
]

const createManager = (overrides: Partial<GuestCookieManagerOptions> = {}) => {
  const cookies: Record<GuestCookiePlatform, string> = {
    douyin: '',
    xiaohongshu: '',
    tiktok: '',
    heybox: '',
    zhihu: '',
    weibo: ''
  }
  const writes: Array<{ platform: GuestCookiePlatform, cookie: string }> = []
  const timers: Array<{ delay: number, callback: () => void | Promise<void> }> = []
  const auditEvents: GuestCookieAuditEvent[] = []
  const stateStore: Partial<Record<GuestCookiePlatform, { cookie: string, source: 'auto', updatedAt: number }>> = {}

  const manager = new GuestCookieManager({
    getCookie: platform => cookies[platform],
    setCookie: (platform, cookie) => {
      cookies[platform] = cookie
      writes.push({ platform, cookie })
    },
    loadState: () => ({ ...stateStore }),
    saveState: state => {
      Object.assign(stateStore, state)
    },
    reload: vi.fn(),
    fetchPageCookies: vi.fn(async platform => {
      if (platform === 'douyin') {
        return [
          'ttwid=auto-dy; Path=/; Domain=.douyin.com',
          's_v_web_id=verify_guest_fp; Path=/',
          'msToken=dy-token; Path=/',
          '__kkk_guest_douyin_web_id=7000000000000000001; Path=/',
          '__kkk_guest_douyin_verify_fp=verify_guest_fp; Path=/'
        ]
      }

      if (platform === 'tiktok') {
        return [
          'ttwid=auto-tt; Path=/; Domain=.tiktok.com',
          'msToken=tt-ms-token; Path=/',
          'tt_chain_token=tt-chain; Path=/'
        ]
      }

      if (platform === 'heybox') {
        return [
          'x_xhh_tokenid=heybox-token; Path=/; Domain=.xiaoheihe.cn'
        ]
      }

      if (platform === 'zhihu') {
        return [
          '_zap=zhihu-zap; Path=/; Domain=.zhihu.com',
          'd_c0=zhihu-dc0; Path=/; Domain=.zhihu.com'
        ]
      }

      return [
        'a1=auto-xhs; Path=/; Domain=.xiaohongshu.com',
        'webId=xhs-web; Path=/',
        'web_session=xhs-session; Path=/'
      ]
    }),
    setTimer: (callback, delay) => {
      timers.push({ delay, callback })
      return { unref: vi.fn() }
    },
    getConfig: () => resolveGuestCookieRuntimeConfig(),
    auditLogger: {
      record: vi.fn((event: GuestCookieAuditEvent) => {
        auditEvents.push(event)
      })
    },
    random: () => 0.5,
    now: () => 1_000,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    },
    ...overrides
  })

  return { manager, cookies, writes, timers, auditEvents }
}

describe('guest cookie helpers', () => {
  it('extracts a Cookie header from Set-Cookie values', () => {
    expect(extractCookieHeader(setCookie)).toBe('a1=guest-a1; webId=douyin-web-id; msToken=token-value')
  })

  it('preserves internal guest metadata when normalizing browser cookie values', () => {
    expect(
      extractCookieHeader([
        'ttwid=guest-ttwid',
        '__kkk_guest_douyin_web_id=7000000000000000001',
        '__kkk_guest_douyin_verify_fp=verify_guest_fp'
      ])
    ).toBe('ttwid=guest-ttwid; __kkk_guest_douyin_web_id=7000000000000000001; __kkk_guest_douyin_verify_fp=verify_guest_fp')
  })

  it('detects cookie names in a cookie header', () => {
    expect(hasCookieName('foo=1; a1=guest-a1; bar=2', ['a1'])).toBe(true)
    expect(hasCookieName('foo=1; bar=2', ['a1', 'webId'])).toBe(false)
  })

  it('prefers douyin web_id over user_unique_id when both are present', () => {
    expect(resolveDouyinBrowserWebId([
      JSON.stringify({
        user_unique_id: '7000000000000000003',
        web_id: '7000000000000000002'
      })
    ])).toBe('7000000000000000002')
  })

  it('falls back to user_unique_id when web_id is absent', () => {
    expect(resolveDouyinBrowserWebId([
      JSON.stringify({
        user_unique_id: '7000000000000000002'
      })
    ])).toBe('7000000000000000002')
  })
})

describe('GuestCookieManager refresh policy', () => {
  it('refreshes an empty platform cookie and reloads clients', async () => {
    const reload = vi.fn()
    const { manager, cookies, writes } = createManager({ reload })

    await manager.refreshPlatform('douyin', 'manual')

    expect(cookies.douyin).toBe('ttwid=auto-dy; s_v_web_id=verify_guest_fp; msToken=dy-token; __kkk_guest_douyin_web_id=7000000000000000001; __kkk_guest_douyin_verify_fp=verify_guest_fp')
    expect(writes).toEqual([{ platform: 'douyin', cookie: 'ttwid=auto-dy; s_v_web_id=verify_guest_fp; msToken=dy-token; __kkk_guest_douyin_web_id=7000000000000000001; __kkk_guest_douyin_verify_fp=verify_guest_fp' }])
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('waits for async client reload before resolving a successful refresh', async () => {
    const reload = vi.fn()
    const deferred = createDeferred<void>()
    reload.mockImplementation(async () => await deferred.promise)
    const { manager, cookies } = createManager({ reload })

    const pending = manager.refreshPlatform('douyin', 'manual')
      .then(value => ({ status: 'resolved' as const, value }))
    const result = await Promise.race([
      pending,
      new Promise(resolve => setTimeout(() => resolve({ status: 'pending' as const }), 10))
    ])

    expect(result).toEqual({ status: 'pending' })
    expect(reload).toHaveBeenCalledTimes(1)
    expect(cookies.douyin).toBe('ttwid=auto-dy; s_v_web_id=verify_guest_fp; msToken=dy-token; __kkk_guest_douyin_web_id=7000000000000000001; __kkk_guest_douyin_verify_fp=verify_guest_fp')

    deferred.resolve()

    await expect(pending).resolves.toEqual({ status: 'resolved', value: true })
  })

  it('retries only the pending client reload after a reload failure', async () => {
    const reloadError = new Error('reload failed')
    const reload = vi.fn()
      .mockRejectedValueOnce(reloadError)
      .mockResolvedValueOnce(undefined)
    const fetchPageCookies = vi.fn(async () => [
      'a1=auto-xhs; Path=/',
      'webId=xhs-web; Path=/',
      'web_session=xhs-session; Path=/'
    ])
    const saveState = vi.fn()
    const { manager, cookies, writes, auditEvents } = createManager({
      fetchPageCookies,
      reload,
      saveState
    })

    await expect(manager.refreshPlatform('xiaohongshu', 'manual')).rejects.toBe(reloadError)

    expect(cookies.xiaohongshu).toBe('a1=auto-xhs; webId=xhs-web; web_session=xhs-session')
    expect(fetchPageCookies).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(saveState).not.toHaveBeenCalled()
    expect(auditEvents).toContainEqual(expect.objectContaining({
      event: 'refresh.reload_failed',
      platform: 'xiaohongshu'
    }))

    await expect(manager.refreshPlatform('xiaohongshu', 'scheduled')).resolves.toBe(true)

    expect(fetchPageCookies).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(2)
    expect(writes).toHaveLength(1)
    expect(saveState).toHaveBeenCalledTimes(1)
  })

  it('overwrites an existing platform cookie during scheduled refresh', async () => {
    const { manager, cookies, writes } = createManager()
    cookies.xiaohongshu = 'old=expired'

    await manager.refreshPlatform('xiaohongshu', 'scheduled')

    expect(cookies.xiaohongshu).toBe('a1=auto-xhs; webId=xhs-web; web_session=xhs-session')
    expect(writes).toEqual([{ platform: 'xiaohongshu', cookie: 'a1=auto-xhs; webId=xhs-web; web_session=xhs-session' }])
  })

  it('refreshes TikTok guest cookies using the shared guest cookie manager', async () => {
    const { manager, cookies, writes } = createManager()

    await expect(manager.refreshPlatform('tiktok', 'manual')).resolves.toBe(true)

    expect(cookies.tiktok).toBe('ttwid=auto-tt; msToken=tt-ms-token; tt_chain_token=tt-chain')
    expect(writes).toEqual([{ platform: 'tiktok', cookie: 'ttwid=auto-tt; msToken=tt-ms-token; tt_chain_token=tt-chain' }])
  })

  it('overwrites a cookie previously written by the manager', async () => {
    const { manager, cookies } = createManager()

    await manager.refreshPlatform('xiaohongshu', 'manual')
    await manager.refreshPlatform('xiaohongshu', 'scheduled')

    expect(cookies.xiaohongshu).toBe('a1=auto-xhs; webId=xhs-web; web_session=xhs-session')
  })

  it('restores auto refresh state after a restart from persisted state', async () => {
    const first = createManager()

    await first.manager.refreshPlatform('douyin', 'manual')

    const second = createManager({
      loadState: () => ({
        douyin: {
          cookie: 'ttwid=auto-dy; s_v_web_id=verify_guest_fp; msToken=dy-token; __kkk_guest_douyin_web_id=7000000000000000001; __kkk_guest_douyin_verify_fp=verify_guest_fp',
          source: 'auto',
          updatedAt: 1_000
        }
      })
    })
    second.cookies.douyin = 'ttwid=auto-dy; s_v_web_id=verify_guest_fp; msToken=dy-token; __kkk_guest_douyin_web_id=7000000000000000001; __kkk_guest_douyin_verify_fp=verify_guest_fp'

    await second.manager.refreshPlatform('douyin', 'scheduled')

    expect(second.cookies.douyin).toBe('ttwid=auto-dy; s_v_web_id=verify_guest_fp; msToken=dy-token; __kkk_guest_douyin_web_id=7000000000000000001; __kkk_guest_douyin_verify_fp=verify_guest_fp')
    expect(second.writes.length).toBe(1)
  })

  it('keeps the previous cookie when fetching returns no usable cookie', async () => {
    const { manager, cookies, writes } = createManager({
      fetchPageCookies: vi.fn(async () => [])
    })
    cookies.douyin = 'old=expired'

    await expect(manager.refreshPlatform('douyin', 'manual')).resolves.toBe(false)

    expect(cookies.douyin).toBe('old=expired')
    expect(writes).toEqual([])
  })

  it('rejects required cookies whose values are empty', async () => {
    const reload = vi.fn()
    const { manager, cookies, writes, auditEvents } = createManager({
      reload,
      fetchPageCookies: vi.fn(async () => [
        'SUB=; Path=/',
        'SUBP=weibo-subp; Path=/'
      ])
    })
    cookies.weibo = 'SUB=old-sub; SUBP=old-subp'

    await expect(manager.refreshPlatform('weibo', 'manual')).resolves.toBe(false)

    expect(cookies.weibo).toBe('SUB=old-sub; SUBP=old-subp')
    expect(writes).toEqual([])
    expect(reload).not.toHaveBeenCalled()
    expect(auditEvents).toContainEqual(expect.objectContaining({
      event: 'refresh.incomplete',
      platform: 'weibo'
    }))
  })

  it('discards fetched cookies when the user changes the cookie during refresh', async () => {
    const deferred = createDeferred<string[]>()
    const fetchPageCookies = vi.fn(() => deferred.promise)
    const { manager, cookies, writes } = createManager({ fetchPageCookies })
    cookies.xiaohongshu = 'a1=old; webId=old; web_session=old'

    const refresh = manager.refreshPlatform('xiaohongshu', 'manual')
    await Promise.resolve()
    cookies.xiaohongshu = 'a1=user; webId=user; web_session=user'
    deferred.resolve([
      'a1=auto-xhs; Path=/',
      'webId=xhs-web; Path=/',
      'web_session=xhs-session; Path=/'
    ])

    await expect(refresh).resolves.toBe(false)
    expect(cookies.xiaohongshu).toBe('a1=user; webId=user; web_session=user')
    expect(writes).toEqual([])
  })

  it('discards fetched cookies when auto refresh is disabled during refresh', async () => {
    const deferred = createDeferred<string[]>()
    const fetchPageCookies = vi.fn(() => deferred.promise)
    let enabled = true
    const { manager, cookies, writes } = createManager({
      fetchPageCookies,
      getConfig: () => resolveGuestCookieRuntimeConfig({
        xiaohongshu: { switch: enabled }
      })
    })
    cookies.xiaohongshu = 'a1=old; webId=old; web_session=old'

    const refresh = manager.refreshPlatform('xiaohongshu', 'manual')
    await Promise.resolve()
    enabled = false
    deferred.resolve([
      'a1=auto-xhs; Path=/',
      'webId=xhs-web; Path=/',
      'web_session=xhs-session; Path=/'
    ])

    await expect(refresh).resolves.toBe(false)
    expect(cookies.xiaohongshu).toBe('a1=old; webId=old; web_session=old')
    expect(writes).toEqual([])
  })

  it('keeps the previous douyin cookie when browser identity has no real cookie', async () => {
    const { manager, cookies, writes } = createManager({
      fetchPageCookies: vi.fn(async () => ['__kkk_guest_douyin_web_id=7000000000000000001; Path=/'])
    })
    cookies.douyin = 'old=expired'

    await expect(manager.refreshPlatform('douyin', 'manual')).resolves.toBe(false)

    expect(cookies.douyin).toBe('old=expired')
    expect(writes).toEqual([])
  })

  it('rejects douyin auto cookies that do not carry browser web id metadata', async () => {
    const { manager, cookies, writes, auditEvents } = createManager({
      fetchPageCookies: vi.fn(async () => [
        'ttwid=auto-dy; Path=/',
        's_v_web_id=verify_guest_fp; Path=/'
      ])
    })
    cookies.douyin = 'old=expired'

    await expect(manager.refreshPlatform('douyin', 'manual')).resolves.toBe(false)

    expect(cookies.douyin).toBe('old=expired')
    expect(writes).toEqual([])
    expect(auditEvents).toContainEqual(expect.objectContaining({
      level: 'warn',
      event: 'refresh.incomplete',
      platform: 'douyin',
      reason: 'manual',
      cookieSummary: expect.objectContaining({
        missingRequired: ['__kkk_guest_douyin_web_id']
      })
    }))
  })
})

describe('GuestCookieManager scheduling and freshness', () => {
  it('exposes safe defaults for guest cookie pages and parse test URLs', () => {
    const config = resolveGuestCookieRuntimeConfig()

    expect(config.platform.douyin.pageUrl).toBe('https://www.douyin.com/jingxuan?enter=guide')
    expect(config.platform.douyin.testUrl).toBe('https://v.douyin.com/pGDQzKiWtBM/')
    expect(config.platform.douyin.requiredCookies).toEqual(['ttwid', 's_v_web_id'])
    expect(config.platform.xiaohongshu.pageUrl).toBe('https://www.xiaohongshu.com/explore')
    expect(config.platform.xiaohongshu.testUrl).toBe('http://xhslink.cn/o/1wPOQ9a9RyI')
    expect(config.platform.tiktok.pageUrl).toBe('https://www.tiktok.com/')
    expect(config.platform.tiktok.testUrl).toBe('https://vt.tiktok.com/ZSxVY1Gos/')
    expect(config.platform.tiktok.requiredCookies).toEqual(['ttwid', 'msToken'])
    expect(config.platform.heybox.pageUrl).toBe('https://www.xiaoheihe.cn/')
    expect(config.platform.heybox.testUrl).toBe('https://www.xiaoheihe.cn/app/bbs/link/4a9471857e40')
    expect(config.platform.heybox.requiredCookies).toEqual(['x_xhh_tokenid'])
    expect(config.platform.zhihu.pageUrl).toBe('https://www.zhihu.com/')
    expect(config.platform.zhihu.testUrl).toBe('https://www.zhihu.com/question/19550283/answer/122329247')
    expect(config.platform.zhihu.requiredCookies).toEqual(['_zap', 'd_c0'])
    expect(config.logging).toEqual({
      switch: true,
      retentionDays: 30,
      maxFileSizeMB: 10
    })
  })

  it('ignores guest cookie requiredCookies overrides and keeps built-in defaults', () => {
    const config = resolveGuestCookieRuntimeConfig({
      douyin: {
        requiredCookies: ['ttwid', '__kkk_guest_douyin_web_id']
      }
    })

    expect(config.platform.douyin.requiredCookies).toEqual(['ttwid', 's_v_web_id'])
  })

  it('schedules the next refresh around half a day with randomized jitter', () => {
    const { manager, timers } = createManager()

    void manager.start()

    expect(timers.map(timer => timer.delay)).toContain(12 * 60 * 60 * 1000)
  })

  it('uses configurable refresh interval and jitter for scheduled refreshes', () => {
    const { manager, timers } = createManager({
      getConfig: () => resolveGuestCookieRuntimeConfig({
        refreshIntervalHours: 8,
        refreshJitterMinutes: 30
      }),
      random: () => 1
    })

    void manager.start()

    expect(timers.map(timer => timer.delay)).toContain((8 * 60 + 30) * 60 * 1000)
  })

  it('delays startup freshness checks and runs them separately from the scheduled interval', async () => {
    const fetchPageCookies = vi.fn(async () => [
      'ttwid=auto-dy; Path=/',
      's_v_web_id=verify_guest_fp; Path=/'
    ])
    const { manager, timers } = createManager({ fetchPageCookies })

    manager.start()

    expect(fetchPageCookies).not.toHaveBeenCalled()
    expect(timers.map(timer => timer.delay).sort((a, b) => a - b)).toEqual([
      30_000,
      12 * 60 * 60 * 1000
    ])

    await timers.find(timer => timer.delay === 30_000)!.callback()

    expect(fetchPageCookies).toHaveBeenCalledWith('douyin')
    expect(fetchPageCookies).toHaveBeenCalledWith('xiaohongshu')
    expect(fetchPageCookies).toHaveBeenCalledWith('tiktok')
    expect(fetchPageCookies).toHaveBeenCalledWith('heybox')
    expect(fetchPageCookies).toHaveBeenCalledWith('zhihu')
  })

  it('does not refresh fresh persisted cookies on startup', async () => {
    const fetchPageCookies = vi.fn(async () => [
      'ttwid=auto-dy; Path=/',
      's_v_web_id=verify_guest_fp; Path=/',
      '__kkk_guest_douyin_web_id=7000000000000000001; Path=/',
      '__kkk_guest_douyin_verify_fp=verify_guest_fp; Path=/'
    ])
    const { manager, cookies } = createManager({
      fetchPageCookies,
      loadState: () => ({
        douyin: {
          cookie: 'ttwid=fresh-dy; s_v_web_id=verify_guest_fp; __kkk_guest_douyin_web_id=7000000000000000001; __kkk_guest_douyin_verify_fp=verify_guest_fp',
          source: 'auto',
          updatedAt: 1_000
        },
        xiaohongshu: {
          cookie: 'a1=fresh-xhs; webId=xhs-web; web_session=xhs-session',
          source: 'auto',
          updatedAt: 1_000
        }
      }),
      getConfig: () => resolveGuestCookieRuntimeConfig({
        tiktok: { switch: false },
        heybox: { switch: false },
        zhihu: { switch: false }
      }),
      now: () => 1_000 + 60 * 60 * 1000
    })
    cookies.douyin = 'ttwid=fresh-dy; s_v_web_id=verify_guest_fp; __kkk_guest_douyin_web_id=7000000000000000001; __kkk_guest_douyin_verify_fp=verify_guest_fp'
    cookies.xiaohongshu = 'a1=fresh-xhs; webId=xhs-web; web_session=xhs-session'

    manager.start()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(fetchPageCookies).not.toHaveBeenCalled()
  })

  it('uses configurable freshness age before parsing', async () => {
    const fetchPageCookies = vi.fn(async () => [
      'a1=auto-xhs; Path=/',
      'webId=xhs-web; Path=/',
      'web_session=xhs-session; Path=/'
    ])
    const { manager, cookies } = createManager({
      fetchPageCookies,
      getConfig: () => resolveGuestCookieRuntimeConfig({
        minRefreshAgeHours: 1
      }),
      loadState: () => ({
        xiaohongshu: {
          cookie: 'a1=old-xhs; webId=xhs-web; web_session=xhs-session',
          source: 'auto',
          updatedAt: 1_000
        }
      }),
      now: () => 1_000 + 2 * 60 * 60 * 1000
    })
    cookies.xiaohongshu = 'a1=old-xhs; webId=xhs-web; web_session=xhs-session'

    await manager.ensureFreshCookie('xiaohongshu')

    expect(fetchPageCookies).toHaveBeenCalledTimes(1)
    expect(cookies.xiaohongshu).toBe('a1=auto-xhs; webId=xhs-web; web_session=xhs-session')
  })

  it('refreshes stale but complete cookies in the background before parsing', async () => {
    const deferred = createDeferred<string[]>()
    const fetchPageCookies = vi.fn(() => deferred.promise)
    const { manager, cookies } = createManager({
      fetchPageCookies,
      getConfig: () => resolveGuestCookieRuntimeConfig({
        minRefreshAgeHours: 1
      }),
      loadState: () => ({
        douyin: {
          cookie: 'ttwid=old-dy; s_v_web_id=verify_guest_fp; __kkk_guest_douyin_web_id=7000000000000000001; __kkk_guest_douyin_verify_fp=verify_guest_fp',
          source: 'auto',
          updatedAt: 1_000
        }
      }),
      now: () => 1_000 + 2 * 60 * 60 * 1000
    })
    cookies.douyin = 'ttwid=old-dy; s_v_web_id=verify_guest_fp; __kkk_guest_douyin_web_id=7000000000000000001; __kkk_guest_douyin_verify_fp=verify_guest_fp'

    const result = await Promise.race([
      manager.ensureFreshCookie('douyin').then(value => ({ status: 'resolved' as const, value })),
      new Promise(resolve => setTimeout(() => resolve({ status: 'pending' as const }), 10))
    ])

    expect(result).toEqual({ status: 'resolved', value: false })
    expect(fetchPageCookies).toHaveBeenCalledTimes(1)
    expect(cookies.douyin).toBe('ttwid=old-dy; s_v_web_id=verify_guest_fp; __kkk_guest_douyin_web_id=7000000000000000001; __kkk_guest_douyin_verify_fp=verify_guest_fp')

    deferred.resolve([
      'ttwid=new-dy; Path=/',
      's_v_web_id=verify_guest_fp; Path=/',
      '__kkk_guest_douyin_web_id=7000000000000000001; Path=/',
      '__kkk_guest_douyin_verify_fp=verify_guest_fp; Path=/'
    ])
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(cookies.douyin).toBe('ttwid=new-dy; s_v_web_id=verify_guest_fp; __kkk_guest_douyin_web_id=7000000000000000001; __kkk_guest_douyin_verify_fp=verify_guest_fp')
  })

  it('can wait for stale but complete cookies before scheduled push tasks', async () => {
    const deferred = createDeferred<string[]>()
    const fetchPageCookies = vi.fn(() => deferred.promise)
    const { manager, cookies } = createManager({
      fetchPageCookies,
      getConfig: () => resolveGuestCookieRuntimeConfig({
        minRefreshAgeHours: 1
      }),
      loadState: () => ({
        douyin: {
          cookie: 'ttwid=old-dy; s_v_web_id=verify_guest_fp; __kkk_guest_douyin_web_id=7000000000000000001; __kkk_guest_douyin_verify_fp=verify_guest_fp',
          source: 'auto',
          updatedAt: 1_000
        }
      }),
      now: () => 1_000 + 2 * 60 * 60 * 1000
    })
    cookies.douyin = 'ttwid=old-dy; s_v_web_id=verify_guest_fp; __kkk_guest_douyin_web_id=7000000000000000001; __kkk_guest_douyin_verify_fp=verify_guest_fp'

    const pending = manager
      .ensureFreshCookie('douyin', { waitForStale: true })
      .then(value => ({ status: 'resolved' as const, value }))
    const result = await Promise.race([
      pending,
      new Promise(resolve => setTimeout(() => resolve({ status: 'pending' as const }), 10))
    ])

    expect(result).toEqual({ status: 'pending' })
    expect(fetchPageCookies).toHaveBeenCalledTimes(1)

    deferred.resolve([
      'ttwid=new-dy; Path=/',
      's_v_web_id=verify_guest_fp; Path=/',
      '__kkk_guest_douyin_web_id=7000000000000000001; Path=/',
      '__kkk_guest_douyin_verify_fp=verify_guest_fp; Path=/'
    ])

    await expect(pending).resolves.toEqual({ status: 'resolved', value: true })
    expect(cookies.douyin).toBe('ttwid=new-dy; s_v_web_id=verify_guest_fp; __kkk_guest_douyin_web_id=7000000000000000001; __kkk_guest_douyin_verify_fp=verify_guest_fp')
  })

  it('blocks before parsing when the current cookie is incomplete even if auto state is fresh', async () => {
    const fetchPageCookies = vi.fn(async () => [
      'ttwid=auto-dy; Path=/',
      's_v_web_id=verify_guest_fp; Path=/',
      '__kkk_guest_douyin_web_id=7000000000000000001; Path=/',
      '__kkk_guest_douyin_verify_fp=verify_guest_fp; Path=/'
    ])
    const { manager, cookies } = createManager({
      fetchPageCookies,
      loadState: () => ({
        douyin: {
          cookie: 'ttwid=old-dy; s_v_web_id=verify_guest_fp; __kkk_guest_douyin_web_id=7000000000000000001; __kkk_guest_douyin_verify_fp=verify_guest_fp',
          source: 'auto',
          updatedAt: 1_000
        }
      }),
      now: () => 1_000 + 60 * 60 * 1000
    })
    cookies.douyin = 'ttwid=incomplete-dy'

    await expect(manager.ensureFreshCookie('douyin')).resolves.toBe(true)

    expect(fetchPageCookies).toHaveBeenCalledTimes(1)
    expect(cookies.douyin).toBe('ttwid=auto-dy; s_v_web_id=verify_guest_fp; __kkk_guest_douyin_web_id=7000000000000000001; __kkk_guest_douyin_verify_fp=verify_guest_fp')
  })

  it('skips refresh when the platform is disabled', async () => {
    const fetchPageCookies = vi.fn(async () => [
      'a1=auto-xhs; Path=/',
      'webId=xhs-web; Path=/',
      'web_session=xhs-session; Path=/'
    ])
    const { manager, cookies, writes } = createManager({
      fetchPageCookies,
      getConfig: () => resolveGuestCookieRuntimeConfig({
        xiaohongshu: {
          switch: false
        }
      })
    })
    cookies.xiaohongshu = 'a1=old-xhs; webId=xhs-web; web_session=xhs-session'

    await expect(manager.refreshPlatform('xiaohongshu', 'manual')).resolves.toBe(false)

    expect(fetchPageCookies).not.toHaveBeenCalled()
    expect(writes).toEqual([])
    expect(cookies.xiaohongshu).toBe('a1=old-xhs; webId=xhs-web; web_session=xhs-session')
  })

  it('does not allow config overrides to weaken douyin required cookie validation', async () => {
    const { manager, cookies, writes } = createManager({
      fetchPageCookies: vi.fn(async () => [
        'custom_guest=ok; Path=/',
        '__kkk_guest_douyin_web_id=7000000000000000001; Path=/'
      ]),
      getConfig: () => resolveGuestCookieRuntimeConfig({
        douyin: {
          requiredCookies: ['custom_guest']
        }
      })
    })
    cookies.douyin = 'old=expired'

    await expect(manager.refreshPlatform('douyin', 'manual')).resolves.toBe(false)

    expect(cookies.douyin).toBe('old=expired')
    expect(writes).toEqual([])
  })

  it('records audit events for a successful refresh without cookie values', async () => {
    const { manager, auditEvents } = createManager()

    await manager.refreshPlatform('douyin', 'manual')

    expect(auditEvents.map(event => event.event)).toContain('refresh.start')
    expect(auditEvents.map(event => event.event)).toContain('refresh.success')

    const success = auditEvents.find(event => event.event === 'refresh.success')
    expect(success).toMatchObject({
      level: 'info',
      platform: 'douyin',
      reason: 'manual',
      cookieSummary: {
        names: ['ttwid', 's_v_web_id', 'msToken', '__kkk_guest_douyin_web_id', '__kkk_guest_douyin_verify_fp'],
        count: 5,
        missingRequired: []
      }
    })

    const serialized = JSON.stringify(auditEvents)
    expect(serialized).not.toContain('auto-dy')
    expect(serialized).not.toContain('dy-token')
    expect(serialized).not.toContain('7000000000000000001')
    expect(serialized).not.toContain('verify_guest_fp')
  })

  it('records missing required cookie names when a refreshed cookie is incomplete', async () => {
    const { manager, auditEvents } = createManager({
      fetchPageCookies: vi.fn(async () => [
        'ttwid=auto-dy; Path=/'
      ])
    })

    await expect(manager.refreshPlatform('douyin', 'manual')).resolves.toBe(false)

    expect(auditEvents).toContainEqual(expect.objectContaining({
      level: 'warn',
      event: 'refresh.incomplete',
      platform: 'douyin',
      reason: 'manual',
      cookieSummary: expect.objectContaining({
        names: ['ttwid'],
        count: 1,
        missingRequired: ['s_v_web_id', '__kkk_guest_douyin_web_id']
      })
    }))
  })

  it('deduplicates concurrent refreshes for the same platform', async () => {
    const fetchPageCookies = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 1))
      return ['ttwid=auto-dy; Path=/']
    })
    const { manager } = createManager({ fetchPageCookies })

    await Promise.all([
      manager.refreshPlatform('douyin', 'manual'),
      manager.refreshPlatform('douyin', 'manual')
    ])

    expect(fetchPageCookies).toHaveBeenCalledTimes(1)
  })

  it('refreshes all platforms sequentially to avoid launching multiple browsers at once', async () => {
    const douyin = createDeferred<string[]>()
    const xiaohongshu = createDeferred<string[]>()
    const tiktok = createDeferred<string[]>()
    const heybox = createDeferred<string[]>()
    const zhihu = createDeferred<string[]>()
    const weibo = createDeferred<string[]>()
    const calls: GuestCookiePlatform[] = []
    const { manager } = createManager({
      fetchPageCookies: vi.fn(platform => {
        calls.push(platform)
        if (platform === 'douyin') return douyin.promise
        if (platform === 'xiaohongshu') return xiaohongshu.promise
        if (platform === 'tiktok') return tiktok.promise
        if (platform === 'heybox') return heybox.promise
        if (platform === 'zhihu') return zhihu.promise
        return weibo.promise
      })
    })

    const refresh = manager.refreshAll('scheduled')
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(calls).toEqual(['douyin'])

    douyin.resolve([
      'ttwid=auto-dy; Path=/',
      's_v_web_id=verify_guest_fp; Path=/'
    ])
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(calls).toEqual(['douyin', 'xiaohongshu'])

    xiaohongshu.resolve([
      'a1=auto-xhs; Path=/',
      'webId=xhs-web; Path=/',
      'web_session=xhs-session; Path=/'
    ])
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(calls).toEqual(['douyin', 'xiaohongshu', 'tiktok'])

    tiktok.resolve([
      'ttwid=auto-tt; Path=/',
      'msToken=tt-ms-token; Path=/'
    ])
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(calls).toEqual(['douyin', 'xiaohongshu', 'tiktok', 'heybox'])

    heybox.resolve([
      'x_xhh_tokenid=heybox-token; Path=/'
    ])
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(calls).toEqual(['douyin', 'xiaohongshu', 'tiktok', 'heybox', 'zhihu'])

    zhihu.resolve([
      '_zap=zhihu-zap; Path=/',
      'd_c0=zhihu-dc0; Path=/'
    ])
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(calls).toEqual(['douyin', 'xiaohongshu', 'tiktok', 'heybox', 'zhihu', 'weibo'])

    weibo.resolve([
      'SUB=weibo-sub; Path=/',
      'SUBP=weibo-subp; Path=/'
    ])

    await expect(refresh).resolves.toBe(true)

    expect(calls).toEqual(['douyin', 'xiaohongshu', 'tiktok', 'heybox', 'zhihu', 'weibo'])
  })

  it('refreshes before parsing when the platform cookie is missing', async () => {
    const fetchPageCookies = vi.fn(async () => [
      'a1=auto-xhs; Path=/',
      'webId=xhs-web; Path=/',
      'web_session=xhs-session; Path=/'
    ])
    const { manager, cookies } = createManager({ fetchPageCookies })

    await manager.ensureFreshCookie('xiaohongshu')

    expect(cookies.xiaohongshu).toBe('a1=auto-xhs; webId=xhs-web; web_session=xhs-session')
    expect(fetchPageCookies).toHaveBeenCalledTimes(1)
  })

  it('refreshes before parsing when an existing cookie has no fresh auto state', async () => {
    const fetchPageCookies = vi.fn(async () => [
      'ttwid=auto-dy; Path=/',
      's_v_web_id=verify_guest_fp; Path=/',
      '__kkk_guest_douyin_web_id=7000000000000000001; Path=/',
      '__kkk_guest_douyin_verify_fp=verify_guest_fp; Path=/'
    ])
    const { manager, cookies } = createManager({ fetchPageCookies })
    cookies.douyin = 'old=expired'

    await manager.ensureFreshCookie('douyin')

    expect(cookies.douyin).toBe('ttwid=auto-dy; s_v_web_id=verify_guest_fp; __kkk_guest_douyin_web_id=7000000000000000001; __kkk_guest_douyin_verify_fp=verify_guest_fp')
    expect(fetchPageCookies).toHaveBeenCalledTimes(1)
  })
})
