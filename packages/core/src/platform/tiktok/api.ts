import { randomBytes } from 'node:crypto'

import { logger } from 'node-karin'
import axios from 'node-karin/axios'

import { Config } from '@/module/utils/Config'
import { retryWithGuestCookieRecovery } from '@/module/utils/GuestCookieRecovery'
import {
  executeSafeAxiosRequest,
  isTrustedTikTokUrl
} from '@/module/utils/OutboundRequest'
import { buildConfiguredRequestOptions } from '@/module/utils/RequestConfig'

import { applyTikTokProxyAgent } from './proxy'
import { TikTokXBogus } from './xBogus'

export const TIKTOK_ORIGIN = 'https://www.tiktok.com'
export const TIKTOK_POST_DETAIL_ENDPOINT = `${TIKTOK_ORIGIN}/api/item/detail/`
export const TIKTOK_TTWID_CHECK_ENDPOINT = `${TIKTOK_ORIGIN}/ttwid/check/`
export const TIKTOK_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36'

export type TikTokVideoDetail = {
  item: Record<string, any>
  urls: string[]
  cookie: string
  pageUrl: string
  userAgent: string
}

type BuildPostDetailUrlOptions = {
  itemId: string
  userAgent?: string
  cookie?: string
  nowSeconds?: number
}

type FetchTikTokVideoDetailOptions = {
  itemId: string
  pageUrl?: string
  pageCookie?: string
}

type MergeCookieOptions = {
  configuredCookie?: string | null
  pageCookie?: string | null
  responseMsToken?: string | null
}

const randomTokenChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export const generateFallbackMsToken = (): string => {
  const bytes = randomBytes(146)
  let token = ''
  for (const byte of bytes) {
    token += randomTokenChars[byte % randomTokenChars.length]
  }
  return `${token}==`
}

export const parseTikTokCookieHeader = (cookie: string | null | undefined = ''): Map<string, string> => {
  const map = new Map<string, string>()
  for (const part of String(cookie ?? '').split(';')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const separator = trimmed.indexOf('=')
    if (separator <= 0) continue
    const name = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim()
    if (name) map.set(name, value)
  }
  return map
}

export const extractTikTokCookieFromSetCookie = (setCookie?: string[] | string): string => {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []
  return cookies
    .map(cookie => cookie.split(';')[0]?.trim() ?? '')
    .filter(Boolean)
    .join('; ')
}

export const mergeTikTokCookieHeaders = ({
  configuredCookie,
  pageCookie,
  responseMsToken
}: MergeCookieOptions): string => {
  const merged = parseTikTokCookieHeader(configuredCookie)
  for (const [name, value] of parseTikTokCookieHeader(pageCookie)) {
    merged.set(name, value)
  }
  if (responseMsToken) {
    merged.set('msToken', responseMsToken)
  }
  if (!merged.has('msToken')) {
    merged.set('msToken', generateFallbackMsToken())
  }

  return Array.from(merged.entries())
    .filter(([name]) => !name.startsWith('__kkk_'))
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
}

const getCookieValue = (cookie: string, name: string): string | undefined => {
  return parseTikTokCookieHeader(cookie).get(name)
}

const serializeParams = (params: Record<string, string | number>): string => {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('&')
}

export const buildTikTokPostDetailParams = (
  itemId: string,
  msToken = generateFallbackMsToken(),
  nowSeconds = Math.floor(Date.now() / 1000)
): Record<string, string | number> => {
  return {
    WebIdLastTime: String(nowSeconds),
    aid: '1988',
    app_language: 'en',
    app_name: 'tiktok_web',
    browser_language: 'en-US',
    browser_name: 'Mozilla',
    browser_online: 'true',
    browser_platform: 'Win32',
    browser_version: '5.0%20%28Windows%29',
    channel: 'tiktok_web',
    cookie_enabled: 'true',
    device_id: '7380187414842836523',
    odinId: '7404669909585003563',
    device_platform: 'web_pc',
    focus_state: 'true',
    from_page: 'user',
    history_len: 4,
    is_fullscreen: 'false',
    is_page_visible: 'true',
    itemId,
    language: 'en',
    os: 'windows',
    priority_region: 'US',
    referer: '',
    region: 'US',
    root_referer: 'https%3A%2F%2Fwww.tiktok.com%2F',
    screen_height: 1080,
    screen_width: 1920,
    webcast_language: 'en',
    tz_name: 'America%2FTijuana',
    msToken: encodeURIComponent(msToken)
  }
}

export const buildTikTokPostDetailUrl = ({
  itemId,
  userAgent = TIKTOK_USER_AGENT,
  cookie = '',
  nowSeconds
}: BuildPostDetailUrlOptions): string => {
  const msToken = getCookieValue(cookie, 'msToken') ?? generateFallbackMsToken()
  const params = buildTikTokPostDetailParams(itemId, msToken, nowSeconds)
  const paramString = serializeParams(params)
  const xBogus = new TikTokXBogus(userAgent).getXBogus(paramString).xBogus
  return `${TIKTOK_POST_DETAIL_ENDPOINT}?${paramString}&X-Bogus=${xBogus}`
}

export const allowEnvironmentProxyForTikTok = applyTikTokProxyAgent

export const buildTikTokConfiguredRequestOptions = (
  options: Parameters<typeof buildConfiguredRequestOptions>[1] = {}
): ReturnType<typeof buildConfiguredRequestOptions> => {
  return allowEnvironmentProxyForTikTok(buildConfiguredRequestOptions({
    ...Config.request,
    proxy: Config.tiktok?.proxy
  }, options))
}

export const buildTikTokNetworkOptions = () => {
  return allowEnvironmentProxyForTikTok({}, Config.tiktok?.proxy)
}

export const extractTikTokItemFromApi = (data: any): Record<string, any> | null => {
  return data?.itemInfo?.itemStruct ??
    data?.item_info?.item_struct ??
    data?.itemStruct ??
    data?.item ??
    null
}

const readJsonScript = (html: string, id: string): any | null => {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = html.match(new RegExp(`<script[^>]+id=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/script>`, 'i'))
  if (!match?.[1]) return null
  try {
    return JSON.parse(match[1])
  } catch {
    return null
  }
}

const findItemStruct = (value: any, seen = new Set<any>()): Record<string, any> | null => {
  if (!value || typeof value !== 'object' || seen.has(value)) return null
  seen.add(value)

  if (value.itemStruct?.id) return value.itemStruct
  if (value.itemInfo?.itemStruct?.id) return value.itemInfo.itemStruct
  if (value.ItemModule && typeof value.ItemModule === 'object') {
    const first = Object.values(value.ItemModule).find((item: any) => item?.id)
    if (first) return first as Record<string, any>
  }

  for (const child of Object.values(value)) {
    const found = findItemStruct(child, seen)
    if (found) return found
  }

  return null
}

export const extractTikTokItemFromHtml = (html: string): Record<string, any> | null => {
  const universal = readJsonScript(html, '__UNIVERSAL_DATA_FOR_REHYDRATION__')
  const fromUniversal = findItemStruct(universal)
  if (fromUniversal) return fromUniversal

  const sigiState = readJsonScript(html, 'SIGI_STATE')
  return findItemStruct(sigiState)
}

const pushUrlCandidate = (result: string[], value: unknown): void => {
  if (!value) return

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^https?:\/\//i.test(trimmed) && !result.includes(trimmed)) {
      result.push(trimmed)
    }
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) pushUrlCandidate(result, item)
    return
  }

  if (typeof value === 'object') {
    const object = value as Record<string, unknown>
    pushUrlCandidate(result, object.UrlList)
    pushUrlCandidate(result, object.urlList)
    pushUrlCandidate(result, object.url_list)
    pushUrlCandidate(result, object.urls)
  }
}

export const extractTikTokVideoCandidates = (item: Record<string, any>): string[] => {
  const result: string[] = []
  const video = item?.video ?? item?.itemStruct?.video
  if (!video) return result

  pushUrlCandidate(result, video.playAddr)
  pushUrlCandidate(result, video.playAddrH264)
  pushUrlCandidate(result, video.downloadAddr)

  const bitrateInfo = Array.isArray(video.bitrateInfo) ? video.bitrateInfo : []
  for (const bitrate of bitrateInfo) {
    pushUrlCandidate(result, bitrate?.PlayAddr)
    pushUrlCandidate(result, bitrate?.playAddr)
    pushUrlCandidate(result, bitrate?.play_addr)
  }

  return result
}

const buildTikTokRequestHeaders = (cookie: string, userAgent = TIKTOK_USER_AGENT, referer = `${TIKTOK_ORIGIN}/`) => {
  return {
    Accept: 'application/json, text/plain, */*',
    Referer: referer,
    'User-Agent': userAgent,
    ...(cookie ? { Cookie: cookie } : {})
  }
}

const prepareTikTokCookie = async (
  pageCookie: string,
  userAgent: string,
  options: { includeConfiguredCookie?: boolean } = {}
): Promise<string> => {
  const includeConfiguredCookie = options.includeConfiguredCookie ?? true
  let cookie = mergeTikTokCookieHeaders({
    configuredCookie: includeConfiguredCookie ? Config.cookies.tiktok : '',
    pageCookie
  })

  if (!getCookieValue(cookie, 'ttwid')) {
    const ttwidCookie = await fetchTikTokTtwidCookie(cookie, userAgent)
    cookie = mergeTikTokCookieHeaders({
      configuredCookie: cookie,
      pageCookie: ttwidCookie
    })
  }

  return cookie
}

const fetchTikTokItemDetailWithCookie = async (
  itemId: string,
  pageUrl: string,
  cookie: string,
  userAgent: string,
  requestOptions: ReturnType<typeof buildConfiguredRequestOptions>,
  label: string
): Promise<{ item: Record<string, any> | null, cookie: string }> => {
  let nextCookie = cookie
  try {
    const detailUrl = buildTikTokPostDetailUrl({ itemId, userAgent, cookie })
    const { response, finalUrl } = await executeSafeAxiosRequest({
      url: detailUrl,
      method: 'GET',
      ...requestOptions,
      headers: {
        ...requestOptions.headers,
        ...buildTikTokRequestHeaders(cookie, userAgent, pageUrl)
      }
    }, {
      profile: 'tiktok-page',
      maxRedirects: 5,
      maxBytes: 2 * 1024 * 1024,
      requester: async (config) => await axios.get(config.url ?? '', config)
    })
    if (isTrustedTikTokUrl(finalUrl)) {
      const responseCookie = extractTikTokCookieFromSetCookie(response.headers?.['set-cookie'])
      nextCookie = mergeTikTokCookieHeaders({
        configuredCookie: cookie,
        pageCookie: responseCookie,
        responseMsToken: response.headers?.['x-ms-token']
      })
    }
    const item = extractTikTokItemFromApi(response.data)
    if (!item) {
      logger.warn(`[TikTok] item/detail ${label} 未返回作品数据：status=${response.status ?? 'unknown'}`)
    }
    return { item, cookie: nextCookie }
  } catch (error) {
    logger.warn(`[TikTok] item/detail ${label} 请求失败: ${error instanceof Error ? error.message : String(error)}`)
    return { item: null, cookie: nextCookie }
  }
}

const fetchTikTokTtwidCookie = async (cookie: string, userAgent: string): Promise<string> => {
  try {
    const requestOptions = buildTikTokConfiguredRequestOptions({
      maxRedirects: 3,
      userAgentFallback: userAgent
    })
    const response = await axios.post(
      TIKTOK_TTWID_CHECK_ENDPOINT,
      '{"aid":1988,"service":"www.tiktok.com","union":false,"unionHost":"","needFid":false,"fid":"","migrate_priority":0}',
      {
        ...requestOptions,
        headers: {
          ...requestOptions.headers,
          'Content-Type': 'text/plain',
          Cookie: cookie
        }
      }
    )

    return extractTikTokCookieFromSetCookie(response.headers?.['set-cookie'])
  } catch (error) {
    logger.warn(`[TikTok] ttwid/check 获取 Cookie 失败，继续使用现有 Cookie: ${error instanceof Error ? error.message : String(error)}`)
    return ''
  }
}

const fetchTikTokItemFromHtmlWithCookie = async (
  pageUrl: string,
  cookie: string,
  userAgent: string,
  requestOptions: ReturnType<typeof buildConfiguredRequestOptions>,
  label: string
): Promise<{ item: Record<string, any> | null, cookie: string }> => {
  const { response, finalUrl } = await executeSafeAxiosRequest({
    url: pageUrl,
    method: 'GET',
    ...requestOptions,
    headers: {
      ...requestOptions.headers,
      ...buildTikTokRequestHeaders(cookie, userAgent, pageUrl)
    },
    responseType: 'text'
  }, {
    profile: 'tiktok-page',
    maxRedirects: 5,
    maxBytes: 2 * 1024 * 1024,
    requester: async (config) => await axios.get(config.url ?? '', config)
  })
  const nextCookie = isTrustedTikTokUrl(finalUrl)
    ? mergeTikTokCookieHeaders({
      configuredCookie: cookie,
      pageCookie: extractTikTokCookieFromSetCookie(response.headers?.['set-cookie']),
      responseMsToken: response.headers?.['x-ms-token']
    })
    : cookie
  const item = typeof response.data === 'string' ? extractTikTokItemFromHtml(response.data) : null
  if (!item) {
    logger.warn(`[TikTok] HTML ${label} 未返回作品数据：status=${response.status ?? 'unknown'}`)
  }
  return { item, cookie: nextCookie }
}

export const fetchTikTokVideoDetail = async ({
  itemId,
  pageUrl = `${TIKTOK_ORIGIN}/@unknown/video/${itemId}`,
  pageCookie = ''
}: FetchTikTokVideoDetailOptions): Promise<TikTokVideoDetail> => {
  return await retryWithGuestCookieRecovery('tiktok', async () => {
    if (!isTrustedTikTokUrl(pageUrl)) {
      throw new Error(`TikTok 页面地址不在白名单内，已拒绝访问: ${pageUrl}`)
    }

    const userAgent = TIKTOK_USER_AGENT
    let cookie = await prepareTikTokCookie(pageCookie, userAgent)

    logger.info(`[TikTok] 准备获取作品详情：itemId=${itemId}，cookieConfigured=${Boolean(Config.cookies.tiktok)}，cookieKeys=${Array.from(parseTikTokCookieHeader(cookie).keys()).join(',') || 'none'}`)

    const requestOptions = buildTikTokConfiguredRequestOptions({
      maxRedirects: 5,
      userAgentFallback: userAgent
    })

    const primaryResult = await fetchTikTokItemDetailWithCookie(itemId, pageUrl, cookie, userAgent, requestOptions, 'primary')
    let item = primaryResult.item
    cookie = primaryResult.cookie

    if (!item && pageCookie) {
      logger.warn('[TikTok] item/detail 使用短链页面 Cookie 未返回作品数据，改用基础 Cookie 重试一次')
      const fallbackCookie = await prepareTikTokCookie('', userAgent)
      const fallbackResult = await fetchTikTokItemDetailWithCookie(itemId, pageUrl, fallbackCookie, userAgent, requestOptions, 'fallback')
      item = fallbackResult.item
      cookie = fallbackResult.cookie
    }

    if (!item) {
      const htmlResult = await fetchTikTokItemFromHtmlWithCookie(pageUrl, cookie, userAgent, requestOptions, 'primary')
      item = htmlResult.item
      cookie = htmlResult.cookie
    }

    if (!item && Config.cookies.tiktok) {
      logger.warn('[TikTok] HTML 使用配置 Cookie 未返回作品数据，改用匿名 Cookie 重试一次')
      const anonymousCookie = await prepareTikTokCookie('', userAgent, { includeConfiguredCookie: false })
      const anonymousHtmlResult = await fetchTikTokItemFromHtmlWithCookie(pageUrl, anonymousCookie, userAgent, requestOptions, 'anonymous')
      item = anonymousHtmlResult.item
      cookie = anonymousHtmlResult.cookie
    }

    if (!item) {
      throw new Error(`TikTok 作品详情获取失败: ${itemId}`)
    }

    const urls = extractTikTokVideoCandidates(item)
    if (urls.length === 0) {
      throw new Error(`TikTok 作品未找到可下载视频地址: ${itemId}`)
    }

    logger.info(`[TikTok] 作品详情获取成功：itemId=${itemId}，可用视频地址 ${urls.length} 个`)
    return {
      item,
      urls,
      cookie,
      pageUrl,
      userAgent
    }
  }, {
    context: `获取 TikTok 作品详情(${itemId})`
  })
}
