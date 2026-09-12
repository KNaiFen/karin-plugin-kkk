import fs from 'node:fs'
import path from 'node:path'

import { logger as karinLogger, mkdirSync } from 'node-karin'
import axios from 'node-karin/axios'
import { karinPathBase } from 'node-karin/root'

import { Root } from '../../root'
import type { guestCookieConfig, guestCookiePlatformConfig } from '../../types/config/guestCookie'
import {
  applyBrowserProxyToLaunchOptions,
  closeBrowserSafely,
  configureRequestBlocking,
  createInjectedPage,
  getBrowserLaunchOptions,
  getBrowserProxyCredentials } from './BrowserRuntime'
import { Config } from './Config'
import {
  type GuestCookieAuditEvent,
  GuestCookieAuditLogger,
  summarizeCookieHeader } from './GuestCookieAuditLogger'
import { baseHeaders } from './Networks'
import { buildConfiguredRequestOptions } from './RequestConfig'

export type { GuestCookieAuditEvent } from './GuestCookieAuditLogger'

export const GUEST_COOKIE_PLATFORMS = ['douyin', 'xiaohongshu', 'tiktok', 'heybox', 'zhihu', 'weibo'] as const
export type GuestCookiePlatform = typeof GUEST_COOKIE_PLATFORMS[number]

type GuestCookieRefreshReason = 'startup' | 'scheduled' | 'manual' | 'ensure'

type GuestCookieStateItem = {
  cookie: string
  source: 'auto'
  updatedAt: number
}

export type GuestCookieState = Partial<Record<GuestCookiePlatform, GuestCookieStateItem>>

type PendingGuestCookieReload = {
  cookie: string
  reason: GuestCookieRefreshReason
  startedAt: number
}

type TimerHandle = {
  unref?: () => void
}

type GuestCookieLogger = Pick<typeof karinLogger, 'debug' | 'info' | 'warn' | 'error'>

type BrowserCookie = {
  name: string
  value: string
}

type GuestCookieBrowserIdentity = {
  webId?: string
  verifyFp?: string
  heyboxTokenId?: string
}

export type GuestCookieRuntimePlatformConfig = {
  switch: boolean
  pageUrl: string
  testUrl: string
  requiredCookies: string[]
}

export type GuestCookieRuntimeConfig = {
  switch: boolean
  refreshIntervalMs: number
  refreshJitterMs: number
  minRefreshAgeMs: number
  httpTimeoutMs: number
  browserTimeoutMs: number
  pageSettleMs: number
  blockMedia: boolean
  blockFont: boolean
  logging: {
    switch: boolean
    retentionDays: number
    maxFileSizeMB: number
  }
  platform: Record<GuestCookiePlatform, GuestCookieRuntimePlatformConfig>
}

export type GuestCookieEnsureOptions = {
  waitForStale?: boolean
}

type PartialGuestCookiePlatformConfig = Partial<guestCookiePlatformConfig> & {
  requiredCookies?: string[] | string
}

type PartialGuestCookieConfig = Partial<Omit<guestCookieConfig, 'douyin' | 'xiaohongshu' | 'tiktok' | 'heybox' | 'zhihu' | 'weibo'>> & {
  douyin?: PartialGuestCookiePlatformConfig
  xiaohongshu?: PartialGuestCookiePlatformConfig
  tiktok?: PartialGuestCookiePlatformConfig
  heybox?: PartialGuestCookiePlatformConfig
  zhihu?: PartialGuestCookiePlatformConfig
  weibo?: PartialGuestCookiePlatformConfig
}

export type GuestCookieManagerOptions = {
  getCookie: (platform: GuestCookiePlatform) => string | undefined | null
  setCookie: (platform: GuestCookiePlatform, cookie: string) => void
  fetchPageCookies: (platform: GuestCookiePlatform) => Promise<string[]>
  getConfig?: () => GuestCookieRuntimeConfig
  auditLogger?: {
    record: (event: GuestCookieAuditEvent) => void
  }
  reload: () => void | Promise<void>
  loadState: () => GuestCookieState
  saveState: (state: GuestCookieState) => void
  setTimer: (callback: () => void | Promise<void>, delay: number) => TimerHandle
  random: () => number
  now: () => number
  logger: GuestCookieLogger
}

const VERIFY_PAGE_PATTERN = /安全验证|滑块验证|请完成验证/

const INTERNAL_COOKIE_PREFIX = '__kkk_guest_'
const DOUYIN_BROWSER_WEB_ID_COOKIE = `${INTERNAL_COOKIE_PREFIX}douyin_web_id`
const STARTUP_REFRESH_DELAY_MS = 30_000

const DEFAULT_GUEST_COOKIE_CONFIG: guestCookieConfig = {
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
  douyin: {
    switch: true,
    pageUrl: 'https://www.douyin.com/jingxuan?enter=guide',
    testUrl: 'https://v.douyin.com/pGDQzKiWtBM/',
    requiredCookies: ['ttwid', 's_v_web_id']
  },
  xiaohongshu: {
    switch: true,
    pageUrl: 'https://www.xiaohongshu.com/explore',
    testUrl: 'http://xhslink.cn/o/1wPOQ9a9RyI',
    requiredCookies: ['a1', 'webId', 'web_session']
  },
  tiktok: {
    switch: true,
    pageUrl: 'https://www.tiktok.com/',
    testUrl: 'https://vt.tiktok.com/ZSxVY1Gos/',
    requiredCookies: ['ttwid', 'msToken']
  },
  heybox: {
    switch: true,
    pageUrl: 'https://www.xiaoheihe.cn/',
    testUrl: 'https://www.xiaoheihe.cn/app/bbs/link/4a9471857e40',
    requiredCookies: ['x_xhh_tokenid']
  },
  zhihu: {
    switch: true,
    pageUrl: 'https://www.zhihu.com/',
    testUrl: 'https://www.zhihu.com/question/19550283/answer/122329247',
    requiredCookies: ['_zap', 'd_c0']
  },
  weibo: {
    switch: true,
    pageUrl: 'https://m.weibo.cn/',
    testUrl: 'https://weibo.com/5955106173/R2YQog7Pb',
    requiredCookies: ['SUB', 'SUBP']
  }
}

const getGuestCookieProxy = (platform: GuestCookiePlatform) => {
  return platform === 'tiktok' ? Config.tiktok?.proxy : Config.request.proxy
}

const getGuestCookieRequestConfig = (platform: GuestCookiePlatform) => {
  return {
    ...Config.request,
    proxy: getGuestCookieProxy(platform)
  }
}

const dataDir = () => path.join(karinPathBase, Root.pluginName, 'data')
const statePath = () => path.join(dataDir(), 'guest-cookie-state.json')
const auditLogDir = () => path.join(dataDir(), 'guest-cookie-logs')

let auditLoggerCache: {
  key: string
  logger: GuestCookieAuditLogger
} | undefined

const toBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') return value
  return fallback
}

const toNumberInRange = (value: unknown, fallback: number, min: number, max: number): number => {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, num))
}

const toStringValue = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed || fallback
}

const getAutoRefreshValidationCookieNames = (
  platform: GuestCookiePlatform,
  requiredCookies: string[]
): string[] => {
  const names = [...requiredCookies]
  if (platform === 'douyin' && !names.includes(DOUYIN_BROWSER_WEB_ID_COOKIE)) {
    names.push(DOUYIN_BROWSER_WEB_ID_COOKIE)
  }
  return names
}

const getCurrentCookieValidationNames = (
  platform: GuestCookiePlatform,
  requiredCookies: string[],
  currentCookie: string,
  stateItem?: GuestCookieStateItem
): string[] => {
  if (
    platform === 'douyin' &&
    stateItem?.source === 'auto' &&
    stateItem.cookie.trim() === currentCookie.trim()
  ) {
    return getAutoRefreshValidationCookieNames(platform, requiredCookies)
  }

  return requiredCookies
}

const resolvePlatformConfig = (
  platform: GuestCookiePlatform,
  config?: PartialGuestCookiePlatformConfig
): GuestCookieRuntimePlatformConfig => {
  const defaults = DEFAULT_GUEST_COOKIE_CONFIG[platform]

  return {
    switch: toBoolean(config?.switch, defaults.switch),
    pageUrl: toStringValue(config?.pageUrl, defaults.pageUrl),
    testUrl: toStringValue(config?.testUrl, defaults.testUrl),
    requiredCookies: [...defaults.requiredCookies]
  }
}

const resolveLoggingConfig = (config?: Partial<guestCookieConfig['logging']>) => {
  const defaults = DEFAULT_GUEST_COOKIE_CONFIG.logging

  return {
    switch: toBoolean(config?.switch, defaults.switch),
    retentionDays: Math.round(toNumberInRange(config?.retentionDays, defaults.retentionDays, 1, 365)),
    maxFileSizeMB: toNumberInRange(config?.maxFileSizeMB, defaults.maxFileSizeMB, 1, 200)
  }
}

export const resolveGuestCookieRuntimeConfig = (
  config: PartialGuestCookieConfig | null | undefined = {}
): GuestCookieRuntimeConfig => {
  const refreshIntervalHours = toNumberInRange(config?.refreshIntervalHours, DEFAULT_GUEST_COOKIE_CONFIG.refreshIntervalHours, 1, 24 * 14)
  const refreshJitterMinutes = toNumberInRange(config?.refreshJitterMinutes, DEFAULT_GUEST_COOKIE_CONFIG.refreshJitterMinutes, 0, refreshIntervalHours * 60)
  const minRefreshAgeHours = toNumberInRange(config?.minRefreshAgeHours, DEFAULT_GUEST_COOKIE_CONFIG.minRefreshAgeHours, 0, 24 * 14)
  const httpTimeoutSeconds = toNumberInRange(config?.httpTimeoutSeconds, DEFAULT_GUEST_COOKIE_CONFIG.httpTimeoutSeconds, 1, 120)
  const browserTimeoutSeconds = toNumberInRange(config?.browserTimeoutSeconds, DEFAULT_GUEST_COOKIE_CONFIG.browserTimeoutSeconds, 5, 180)
  const pageSettleSeconds = toNumberInRange(config?.pageSettleSeconds, DEFAULT_GUEST_COOKIE_CONFIG.pageSettleSeconds, 0, 30)

  return {
    switch: toBoolean(config?.switch, DEFAULT_GUEST_COOKIE_CONFIG.switch),
    refreshIntervalMs: Math.round(refreshIntervalHours * 60 * 60 * 1000),
    refreshJitterMs: Math.round(refreshJitterMinutes * 60 * 1000),
    minRefreshAgeMs: Math.round(minRefreshAgeHours * 60 * 60 * 1000),
    httpTimeoutMs: Math.round(httpTimeoutSeconds * 1000),
    browserTimeoutMs: Math.round(browserTimeoutSeconds * 1000),
    pageSettleMs: Math.round(pageSettleSeconds * 1000),
    blockMedia: toBoolean(config?.blockMedia, DEFAULT_GUEST_COOKIE_CONFIG.blockMedia),
    blockFont: toBoolean(config?.blockFont, DEFAULT_GUEST_COOKIE_CONFIG.blockFont),
    logging: resolveLoggingConfig(config?.logging),
    platform: {
      douyin: resolvePlatformConfig('douyin', config?.douyin),
      xiaohongshu: resolvePlatformConfig('xiaohongshu', config?.xiaohongshu),
      tiktok: resolvePlatformConfig('tiktok', config?.tiktok),
      heybox: resolvePlatformConfig('heybox', config?.heybox),
      zhihu: resolvePlatformConfig('zhihu', config?.zhihu),
      weibo: resolvePlatformConfig('weibo', config?.weibo)
    }
  }
}

const getGuestCookieRuntimeConfig = (): GuestCookieRuntimeConfig => {
  return resolveGuestCookieRuntimeConfig(Config.guestCookie as PartialGuestCookieConfig)
}

const createGuestCookieAuditLogger = (config: GuestCookieRuntimeConfig): GuestCookieAuditLogger => {
  return new GuestCookieAuditLogger({
    enabled: config.logging.switch,
    directory: auditLogDir(),
    retentionDays: config.logging.retentionDays,
    maxFileSizeBytes: Math.round(config.logging.maxFileSizeMB * 1024 * 1024)
  })
}

const getGuestCookieAuditLogger = (config: GuestCookieRuntimeConfig): GuestCookieAuditLogger => {
  const key = JSON.stringify({
    enabled: config.logging.switch,
    directory: auditLogDir(),
    retentionDays: config.logging.retentionDays,
    maxFileSizeMB: config.logging.maxFileSizeMB
  })

  if (!auditLoggerCache || auditLoggerCache.key !== key) {
    auditLoggerCache = {
      key,
      logger: createGuestCookieAuditLogger(config)
    }
  }

  return auditLoggerCache.logger
}

const recordGuestCookieAudit = (event: GuestCookieAuditEvent) => {
  const config = getGuestCookieRuntimeConfig()
  if (!config.logging.switch) return
  getGuestCookieAuditLogger(config).record(event)
}

const toAuditError = (error: unknown): GuestCookieAuditEvent['error'] => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    }
  }

  return {
    name: 'Error',
    message: String(error)
  }
}

const normalizeSetCookie = (setCookie: unknown): string[] => {
  if (Array.isArray(setCookie)) {
    return setCookie.filter((item): item is string => typeof item === 'string')
  }

  if (typeof setCookie === 'string') {
    return [setCookie]
  }

  return []
}

const getGuestCookieReferer = (platform: GuestCookiePlatform): string => {
  if (platform === 'douyin') return 'https://www.douyin.com/'
  if (platform === 'tiktok') return 'https://www.tiktok.com/'
  if (platform === 'heybox') return 'https://www.xiaoheihe.cn/'
  if (platform === 'zhihu') return 'https://www.zhihu.com/'
  if (platform === 'weibo') return 'https://m.weibo.cn/'
  return 'https://www.xiaohongshu.com/'
}

export const extractCookieHeader = (setCookie: string[] | string | undefined): string => {
  return normalizeSetCookie(setCookie)
    .map(item => item.split(';')[0]?.trim() ?? '')
    .filter(item => item.includes('=') && !item.startsWith('='))
    .join('; ')
}

const normalizeDouyinBrowserWebId = (value: unknown): string | undefined => {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') {
    return undefined
  }

  const normalized = String(value).trim()
  return /^\d{15,25}$/.test(normalized) ? normalized : undefined
}

export const resolveDouyinBrowserWebId = (teaTokenValues: Array<string | null | undefined>): string | undefined => {
  let fallbackUserUniqueId: string | undefined

  for (const rawValue of teaTokenValues) {
    if (!rawValue) continue

    try {
      const parsed = JSON.parse(rawValue) as { web_id?: unknown, user_unique_id?: unknown }
      const webId = normalizeDouyinBrowserWebId(parsed.web_id)
      if (webId) return webId

      if (!fallbackUserUniqueId) {
        fallbackUserUniqueId = normalizeDouyinBrowserWebId(parsed.user_unique_id)
      }
    } catch {
      continue
    }
  }

  return fallbackUserUniqueId
}

export const hasCookieName = (cookie: string | undefined | null, names: string[]): boolean => {
  if (!cookie) return false

  const cookieNames = new Set(
    cookie
      .split(';')
      .map(item => item.trim().split('=')[0])
      .filter(Boolean)
  )

  return names.some(name => cookieNames.has(name))
}

const hasAllCookieNames = (cookie: string | undefined | null, names: string[]): boolean => {
  if (!cookie) return false

  const cookieValues = new Map(
    cookie
      .split(';')
      .map(item => item.trim())
      .map(item => {
        const separatorIndex = item.indexOf('=')
        if (separatorIndex <= 0) return null
        return [
          item.slice(0, separatorIndex).trim(),
          item.slice(separatorIndex + 1).trim()
        ] as const
      })
      .filter((item): item is readonly [string, string] => Boolean(item?.[0]))
  )

  return names.every(name => Boolean(cookieValues.get(name)))
}

const isUsableGuestCookie = (cookie: string | undefined | null, requiredCookies: string[]): boolean => {
  return Boolean(cookie?.trim()) && hasAllCookieNames(cookie, requiredCookies)
}

export const loadGuestCookieState = (): GuestCookieState => {
  try {
    const file = statePath()
    if (!fs.existsSync(file)) return {}

    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!parsed || typeof parsed !== 'object') return {}

    const state: GuestCookieState = {}
    for (const platform of GUEST_COOKIE_PLATFORMS) {
      const item = (parsed as GuestCookieState)[platform]
      if (
        item &&
        item.source === 'auto' &&
        typeof item.cookie === 'string' &&
        typeof item.updatedAt === 'number'
      ) {
        state[platform] = item
      }
    }

    return state
  } catch (error) {
    karinLogger.warn(`[GuestCookie] 读取游客 Cookie 状态失败: ${error}`)
    return {}
  }
}

export const saveGuestCookieState = (state: GuestCookieState) => {
  try {
    mkdirSync(dataDir())
    fs.writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf8')
  } catch (error) {
    karinLogger.warn(`[GuestCookie] 保存游客 Cookie 状态失败: ${error}`)
  }
}

const fetchGuestPageCookies = async (platform: GuestCookiePlatform): Promise<string[]> => {
  const config = getGuestCookieRuntimeConfig()
  const platformConfig = config.platform[platform]
  const validationNames = getAutoRefreshValidationCookieNames(platform, platformConfig.requiredCookies)
  const browserCookies = await fetchGuestPageBrowserCookies(platform, config)
  const browserCookieHeader = extractCookieHeader(browserCookies)
  if (isUsableGuestCookie(browserCookieHeader, validationNames)) {
    return browserCookies
  }
  if (browserCookieHeader) {
    recordGuestCookieAudit({
      level: 'warn',
      event: 'fetch.browser.incomplete',
      platform,
      source: 'browser',
      cookieSummary: summarizeCookieHeader(browserCookieHeader, validationNames)
    })
  }

  const startedAt = Date.now()
  recordGuestCookieAudit({
    level: 'info',
    event: 'fetch.http.start',
    platform,
    source: 'http'
  })

  const url = platformConfig.pageUrl
  let response: any
  try {
    const requestOptions = buildConfiguredRequestOptions(getGuestCookieRequestConfig(platform), {
      maxRedirects: 5,
      userAgentFallback: baseHeaders?.['User-Agent']
    })
    response = await axios.get(url, {
      ...requestOptions,
      timeout: config.httpTimeoutMs,
      validateStatus: status => status >= 200 && status < 500,
      headers: {
        ...baseHeaders,
        ...requestOptions.headers,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        Referer: getGuestCookieReferer(platform),
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      }
    })
  } catch (error) {
    recordGuestCookieAudit({
      level: 'warn',
      event: 'fetch.http.failure',
      platform,
      source: 'http',
      durationMs: Date.now() - startedAt,
      error: toAuditError(error)
    })
    throw error
  }

  if (response.status >= 400) {
    recordGuestCookieAudit({
      level: 'warn',
      event: 'fetch.http.failure',
      platform,
      source: 'http',
      status: response.status,
      durationMs: Date.now() - startedAt
    })
    throw new Error(`${platform} guest page returned HTTP ${response.status}`)
  }

  const data = typeof response.data === 'string' ? response.data : ''
  if (VERIFY_PAGE_PATTERN.test(data)) {
    karinLogger.warn(`[GuestCookie] ${platform} 游客页面疑似出现验证内容，本次不会更新 Cookie`)
    recordGuestCookieAudit({
      level: 'warn',
      event: 'fetch.http.verify_page',
      platform,
      source: 'http',
      status: response.status,
      durationMs: Date.now() - startedAt
    })
    return []
  }

  const cookies = normalizeSetCookie(response.headers['set-cookie'])
  const cookieHeader = extractCookieHeader(cookies)
  recordGuestCookieAudit({
    level: isUsableGuestCookie(cookieHeader, validationNames) ? 'info' : 'warn',
    event: isUsableGuestCookie(cookieHeader, validationNames) ? 'fetch.http.success' : 'fetch.http.incomplete',
    platform,
    source: 'http',
    status: response.status,
    durationMs: Date.now() - startedAt,
    cookieSummary: summarizeCookieHeader(cookieHeader, validationNames)
  })
  return cookies
}

const fetchGuestPageBrowserCookies = async (
  platform: GuestCookiePlatform,
  config: GuestCookieRuntimeConfig = getGuestCookieRuntimeConfig()
): Promise<string[]> => {
  let puppeteer: Awaited<ReturnType<typeof import('@snapka/puppeteer')['snapka']['launch']>> | undefined
  const startedAt = Date.now()

  try {
    const platformConfig = config.platform[platform]
    recordGuestCookieAudit({
      level: 'info',
      event: 'fetch.browser.start',
      platform,
      source: 'browser'
    })

    const { snapka } = await import('@snapka/puppeteer')

    const proxy = getGuestCookieProxy(platform)
    puppeteer = await snapka.launch(applyBrowserProxyToLaunchOptions(
      getBrowserLaunchOptions(config.browserTimeoutMs),
      proxy
    ))

    const page = await createInjectedPage(puppeteer.browser)
    const proxyCredentials = getBrowserProxyCredentials(proxy)
    if (proxyCredentials && typeof page.authenticate === 'function') {
      await page.authenticate(proxyCredentials)
    }

    const blockedResourceTypes = new Set<string>()
    if (config.blockMedia) blockedResourceTypes.add('media')
    if (config.blockFont) blockedResourceTypes.add('font')

    await configureRequestBlocking(page, blockedResourceTypes)

    await page.goto(platformConfig.pageUrl, {
      timeout: config.browserTimeoutMs,
      waitUntil: 'domcontentloaded'
    })
    await new Promise(resolve => setTimeout(resolve, config.pageSettleMs))

    const content = await page.content().catch(() => '')
    if (VERIFY_PAGE_PATTERN.test(content)) {
      karinLogger.warn(`[GuestCookie] ${platform} 浏览器页面疑似出现验证内容，本次不会使用浏览器 Cookie`)
      recordGuestCookieAudit({
        level: 'warn',
        event: 'fetch.browser.verify_page',
        platform,
        source: 'browser',
        durationMs: Date.now() - startedAt
      })
      return []
    }

    const [cookies, identity] = await Promise.all([
      puppeteer.browser.cookies(),
      getBrowserIdentity(platform, page)
    ])
    const cookieHeaderList = cookiesToCookieHeaderList(cookies, platform, identity)
    recordGuestCookieAudit({
      level: 'info',
      event: 'fetch.browser.success',
      platform,
      source: 'browser',
      durationMs: Date.now() - startedAt,
      cookieSummary: summarizeCookieHeader(
        extractCookieHeader(cookieHeaderList),
        getAutoRefreshValidationCookieNames(platform, platformConfig.requiredCookies)
      )
    })
    return cookieHeaderList
  } catch (error) {
    karinLogger.warn(`[GuestCookie] ${platform} 浏览器游客 Cookie 获取失败，回退 HTTP: ${error instanceof Error ? error.message : String(error)}`)
    recordGuestCookieAudit({
      level: 'warn',
      event: 'fetch.browser.failure',
      platform,
      source: 'browser',
      durationMs: Date.now() - startedAt,
      error: toAuditError(error)
    })
    return []
  } finally {
    await closeBrowserSafely(puppeteer)
  }
}

const getDouyinBrowserIdentity = async (page: { evaluate: <T>(pageFunction: () => T | Promise<T>) => Promise<T> }): Promise<GuestCookieBrowserIdentity> => {
  try {
    const identity = await page.evaluate(() => {
      const preferredKeys = ['__tea_cache_tokens_6383', '__tea_cache_tokens_3722', '__tea_cache_tokens_7497']

      return {
        teaTokenValues: preferredKeys.map(key => window.localStorage.getItem(key)),
        verifyFp: document.cookie
          .split(';')
          .map(item => item.trim())
          .find(item => item.startsWith('s_v_web_id='))
          ?.slice('s_v_web_id='.length)
      }
    })

    return {
      webId: resolveDouyinBrowserWebId(identity.teaTokenValues),
      verifyFp: identity.verifyFp
    }
  } catch {
    return {}
  }
}

const getHeyBoxBrowserIdentity = async (page: { evaluate: <T>(pageFunction: () => T | Promise<T>) => Promise<T> }): Promise<GuestCookieBrowserIdentity> => {
  try {
    return await page.evaluate(() => {
      const smsdk = (window as any).SMSdk
      const tokenId = smsdk?.getDeviceId?.()
      return {
        heyboxTokenId: typeof tokenId === 'string' && tokenId.trim()
          ? tokenId.trim()
          : undefined
      }
    })
  } catch {
    return {}
  }
}

const getBrowserIdentity = (
  platform: GuestCookiePlatform,
  page: { evaluate: <T>(pageFunction: () => T | Promise<T>) => Promise<T> }
): Promise<GuestCookieBrowserIdentity> => {
  if (platform === 'douyin') return getDouyinBrowserIdentity(page)
  if (platform === 'heybox') return getHeyBoxBrowserIdentity(page)
  return Promise.resolve({})
}

const cookiesToCookieHeaderList = (
  cookies: BrowserCookie[],
  platform: GuestCookiePlatform,
  identity: GuestCookieBrowserIdentity = {}
): string[] => {
  const cookieHeaderList = cookies
    .filter(cookie => cookie.name && cookie.value)
    .map(cookie => `${cookie.name}=${cookie.value}`)

  if (platform === 'douyin') {
    if (identity.webId) cookieHeaderList.push(`${INTERNAL_COOKIE_PREFIX}douyin_web_id=${identity.webId}`)
    if (identity.verifyFp) cookieHeaderList.push(`${INTERNAL_COOKIE_PREFIX}douyin_verify_fp=${identity.verifyFp}`)
  }
  if (platform === 'heybox' && identity.heyboxTokenId) {
    cookieHeaderList.push(`x_xhh_tokenid=${identity.heyboxTokenId}`)
  }

  return cookieHeaderList
}

export class GuestCookieManager {
  private readonly options: GuestCookieManagerOptions
  private state: GuestCookieState
  private readonly inFlight = new Map<GuestCookiePlatform, Promise<boolean>>()
  private readonly pendingReload = new Map<GuestCookiePlatform, PendingGuestCookieReload>()
  private started = false

  constructor (options: GuestCookieManagerOptions) {
    this.options = options
    this.state = options.loadState()
  }

  private getConfig () {
    return this.options.getConfig?.() ?? getGuestCookieRuntimeConfig()
  }

  private recordAudit (event: GuestCookieAuditEvent) {
    if (!this.getConfig().logging.switch) return
    this.options.auditLogger?.record(event)
  }

  start () {
    if (this.started) return
    this.started = true
    this.scheduleNextRefresh()

    const startupTimer = this.options.setTimer(async () => {
      await this.ensureFreshCookiesInOrder()
        .catch((error: unknown) => {
          this.options.logger.warn(`[GuestCookie] 启动检查游客 Cookie 失败: ${error instanceof Error ? error.message : String(error)}`)
        })
    }, STARTUP_REFRESH_DELAY_MS)
    startupTimer.unref?.()
  }

  async refreshAll (reason: GuestCookieRefreshReason): Promise<boolean> {
    const results: boolean[] = []
    for (const platform of GUEST_COOKIE_PLATFORMS) {
      results.push(await this.refreshPlatform(platform, reason))
    }

    return results.some(Boolean)
  }

  async ensureFreshCookie (platform: GuestCookiePlatform, options: GuestCookieEnsureOptions = {}): Promise<boolean> {
    const config = this.getConfig()
    const platformConfig = config.platform[platform]
    if (!config.switch || !platformConfig.switch) return false

    const currentCookie = this.options.getCookie(platform)?.trim() ?? ''
    const updatedAt = this.state[platform]?.updatedAt ?? 0
    const stale = !updatedAt || this.options.now() - updatedAt > config.minRefreshAgeMs
    const usable = isUsableGuestCookie(
      currentCookie,
      getCurrentCookieValidationNames(platform, platformConfig.requiredCookies, currentCookie, this.state[platform])
    )

    if (!usable) {
      return this.refreshPlatform(platform, 'ensure')
    }

    if (stale) {
      if (options.waitForStale) {
        return this.refreshPlatform(platform, 'ensure')
      }

      void this.refreshPlatform(platform, 'ensure')
        .catch(error => {
          this.options.logger.warn(`[GuestCookie] 后台刷新 ${platform} 游客 Cookie 失败: ${error instanceof Error ? error.message : String(error)}`)
        })
      return false
    }

    return false
  }

  private async ensureFreshCookiesInOrder (): Promise<boolean> {
    const results: boolean[] = []
    for (const platform of GUEST_COOKIE_PLATFORMS) {
      const config = this.getConfig()
      const platformConfig = config.platform[platform]
      if (!config.switch || !platformConfig.switch) {
        results.push(false)
        continue
      }

      const currentCookie = this.options.getCookie(platform)?.trim() ?? ''
      const updatedAt = this.state[platform]?.updatedAt ?? 0
      const stale = !updatedAt || this.options.now() - updatedAt > config.minRefreshAgeMs
      const usable = isUsableGuestCookie(
        currentCookie,
        getCurrentCookieValidationNames(platform, platformConfig.requiredCookies, currentCookie, this.state[platform])
      )

      results.push(!usable || stale ? await this.refreshPlatform(platform, 'startup') : false)
    }

    return results.some(Boolean)
  }

  refreshPlatform (platform: GuestCookiePlatform, reason: GuestCookieRefreshReason): Promise<boolean> {
    const existing = this.inFlight.get(platform)
    if (existing) return existing

    const task = this.refreshPlatformOnce(platform, reason)
      .finally(() => {
        this.inFlight.delete(platform)
      })

    this.inFlight.set(platform, task)
    return task
  }

  private async refreshPlatformOnce (platform: GuestCookiePlatform, reason: GuestCookieRefreshReason): Promise<boolean> {
    const config = this.getConfig()
    const platformConfig = config.platform[platform]
    if (!config.switch || !platformConfig.switch) {
      this.pendingReload.delete(platform)
      this.options.logger.debug(`[GuestCookie] ${platform} 游客 Cookie 自动获取已关闭，跳过刷新`)
      this.recordAudit({
        level: 'debug',
        event: 'refresh.skip_disabled',
        platform,
        reason
      })
      return false
    }

    const pendingReload = this.pendingReload.get(platform)
    if (pendingReload) {
      const currentCookie = this.options.getCookie(platform)?.trim() ?? ''
      if (currentCookie === pendingReload.cookie) {
        this.options.logger.debug(`[GuestCookie] ${platform} 存在待完成的客户端重载，仅重试重载`)
        return await this.completePendingReload(platform, pendingReload)
      }

      this.pendingReload.delete(platform)
      this.options.logger.debug(`[GuestCookie] ${platform} Cookie 已在重载失败后变化，丢弃待重载状态`)
    }

    const startingCookie = this.options.getCookie(platform)?.trim() ?? ''
    const startedAt = this.options.now()
    this.recordAudit({
      level: 'info',
      event: 'refresh.start',
      platform,
      reason
    })

    let nextCookie = ''
    try {
      nextCookie = extractCookieHeader(await this.options.fetchPageCookies(platform))
    } catch (error) {
      this.options.logger.warn(`[GuestCookie] 获取 ${platform} 游客 Cookie 失败: ${error instanceof Error ? error.message : String(error)}`)
      this.recordAudit({
        level: 'warn',
        event: 'refresh.fetch_failed',
        platform,
        reason,
        durationMs: Math.max(0, this.options.now() - startedAt),
        error: toAuditError(error)
      })
      return false
    }

    const latestConfig = this.getConfig()
    const latestPlatformConfig = latestConfig.platform[platform]
    const currentCookie = this.options.getCookie(platform)?.trim() ?? ''
    if (!latestConfig.switch || !latestPlatformConfig.switch || currentCookie !== startingCookie) {
      this.options.logger.debug(`[GuestCookie] ${platform} 配置在刷新期间已变化，丢弃本次刷新结果`)
      this.recordAudit({
        level: 'debug',
        event: 'refresh.skip_disabled',
        platform,
        reason
      })
      return false
    }

    const validationNames = getAutoRefreshValidationCookieNames(platform, latestPlatformConfig.requiredCookies)
    const cookieSummary = summarizeCookieHeader(nextCookie, validationNames)
    if (!nextCookie || !hasAllCookieNames(nextCookie, validationNames)) {
      this.options.logger.warn(`[GuestCookie] ${platform} 游客 Cookie 不完整，本次不会更新`)
      this.recordAudit({
        level: 'warn',
        event: 'refresh.incomplete',
        platform,
        reason,
        durationMs: Math.max(0, this.options.now() - startedAt),
        cookieSummary
      })
      return false
    }

    this.options.setCookie(platform, nextCookie)
    const pending: PendingGuestCookieReload = {
      cookie: nextCookie,
      reason,
      startedAt
    }
    this.pendingReload.set(platform, pending)
    return await this.completePendingReload(platform, pending)
  }

  private async completePendingReload (
    platform: GuestCookiePlatform,
    pending: PendingGuestCookieReload
  ): Promise<boolean> {
    const config = this.getConfig()
    const platformConfig = config.platform[platform]
    const currentCookie = this.options.getCookie(platform)?.trim() ?? ''
    if (!config.switch || !platformConfig.switch || currentCookie !== pending.cookie) {
      this.pendingReload.delete(platform)
      this.options.logger.debug(`[GuestCookie] ${platform} 配置在客户端重载期间已变化，丢弃待重载状态`)
      this.recordAudit({
        level: 'debug',
        event: 'refresh.skip_disabled',
        platform,
        reason: pending.reason
      })
      return false
    }

    const validationNames = getAutoRefreshValidationCookieNames(platform, platformConfig.requiredCookies)
    const cookieSummary = summarizeCookieHeader(pending.cookie, validationNames)
    try {
      await this.options.reload()
    } catch (error) {
      this.options.logger.warn(`[GuestCookie] 重载 ${platform} 游客 Cookie 客户端失败，将在下次刷新时仅重试重载: ${error instanceof Error ? error.message : String(error)}`)
      this.recordAudit({
        level: 'warn',
        event: 'refresh.reload_failed',
        platform,
        reason: pending.reason,
        durationMs: Math.max(0, this.options.now() - pending.startedAt),
        cookieSummary,
        error: toAuditError(error)
      })
      throw error
    }

    const latestConfig = this.getConfig()
    const latestCookie = this.options.getCookie(platform)?.trim() ?? ''
    if (!latestConfig.switch || !latestConfig.platform[platform].switch || latestCookie !== pending.cookie) {
      this.pendingReload.delete(platform)
      this.options.logger.debug(`[GuestCookie] ${platform} 配置在客户端重载期间已变化，不提交刷新状态`)
      this.recordAudit({
        level: 'debug',
        event: 'refresh.skip_disabled',
        platform,
        reason: pending.reason
      })
      return false
    }

    this.state = {
      ...this.state,
      [platform]: {
        cookie: pending.cookie,
        source: 'auto',
        updatedAt: this.options.now()
      }
    }
    this.options.saveState(this.state)
    this.pendingReload.delete(platform)
    this.options.logger.info(`[GuestCookie] 已更新 ${platform} 游客 Cookie (${pending.reason})`)
    this.recordAudit({
      level: 'info',
      event: 'refresh.success',
      platform,
      reason: pending.reason,
      durationMs: Math.max(0, this.options.now() - pending.startedAt),
      cookieSummary
    })
    return true
  }

  private scheduleNextRefresh () {
    const config = this.getConfig()
    const delay = Math.max(
      60_000,
      config.refreshIntervalMs + Math.round((this.options.random() - 0.5) * 2 * config.refreshJitterMs)
    )
    const timer = this.options.setTimer(() => {
      void this.refreshAll('scheduled')
        .catch(error => {
          this.options.logger.warn(`[GuestCookie] 定时刷新失败: ${error instanceof Error ? error.message : String(error)}`)
        })
        .finally(() => {
          this.scheduleNextRefresh()
        })
    }, delay)

    timer.unref?.()
  }
}

export const guestCookieManager = new GuestCookieManager({
  getCookie: platform => Config.cookies[platform],
  setCookie: (platform, cookie) => {
    Config.Modify('cookies', platform, cookie)
  },
  fetchPageCookies: fetchGuestPageCookies,
  getConfig: getGuestCookieRuntimeConfig,
  auditLogger: {
    record: recordGuestCookieAudit
  },
  reload: async () => {
    try {
      const { reloadAmagiConfig } = await import('./amagiClient')
      reloadAmagiConfig()
    } catch (error) {
      karinLogger.warn(`[GuestCookie] 重载 Amagi Client 失败: ${error}`)
      throw error
    }
  },
  loadState: loadGuestCookieState,
  saveState: saveGuestCookieState,
  setTimer: (callback, delay) => setTimeout(callback, delay),
  random: Math.random,
  now: Date.now,
  logger: karinLogger
})
