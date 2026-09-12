import { logger, type Message } from 'node-karin'
import axios from 'node-karin/axios'

import {
  TIKTOK_USER_AGENT,
  buildTikTokConfiguredRequestOptions,
  extractTikTokCookieFromSetCookie,
  mergeTikTokCookieHeaders
} from './api'
import {
  executeSafeAxiosRequest,
  isTrustedTikTokUrl
} from '@/module/utils/OutboundRequest'

export interface TikTokIdData {
  type: 'one_work'
  item_id: string
  url: string
  cookie?: string
}

export const extractTikTokItemId = (input: string): string | undefined => {
  const patterns = [
    /\/video\/(\d+)/,
    /\/v\/(\d+)\.html/,
    /[?&](?:item_id|itemId)=(\d+)/
  ]

  for (const pattern of patterns) {
    const match = pattern.exec(input)
    if (match?.[1]) return match[1]
  }
}

export const parseTikTokLongLink = (longLink: string, cookie?: string): TikTokIdData => {
  const itemId = extractTikTokItemId(longLink)
  return {
    type: 'one_work',
    item_id: itemId ?? '',
    url: longLink,
    ...(cookie ? { cookie } : {})
  }
}

export const sanitizeTikTokIdDataForLog = (data: TikTokIdData): Omit<TikTokIdData, 'cookie'> & { cookie?: string } => {
  return {
    ...data,
    ...(data.cookie ? { cookie: `[len:${data.cookie.length}]` } : {})
  }
}

export const getTikTokID = async (
  eventOrUrl: Message | string | undefined,
  urlOrLog?: string | boolean,
  log = true
): Promise<TikTokIdData> => {
  const url = typeof eventOrUrl === 'string' ? eventOrUrl : String(urlOrLog ?? '')
  const shouldLog = typeof eventOrUrl === 'string'
    ? (typeof urlOrLog === 'boolean' ? urlOrLog : true)
    : log

  const requestOptions = buildTikTokConfiguredRequestOptions({
    maxRedirects: 10,
    userAgentFallback: TIKTOK_USER_AGENT,
    outboundProfile: 'tiktok-page',
    maxContentLength: 512 * 1024
  })
  const trustedTargets = new Set<string>()
  const { response, finalUrl } = await executeSafeAxiosRequest({
    url,
    method: 'GET',
    ...requestOptions,
    headers: {
      ...requestOptions.headers,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Referer: 'https://www.tiktok.com/',
      'User-Agent': TIKTOK_USER_AGENT
    }
  }, {
    profile: 'tiktok-page',
    maxRedirects: 10,
    maxBytes: 512 * 1024,
    requester: async (config) => {
      const resp = await axios.get(config.url ?? '', config)
      const responseUrl = resp.request?.res?.responseUrl ?? resp.request?.responseURL ?? resp.config?.url ?? config.url ?? ''
      if (isTrustedTikTokUrl(responseUrl)) {
        trustedTargets.add(responseUrl)
      }
      return resp
    },
  })

  const longLink =
    finalUrl ||
    response.request?.res?.responseUrl ||
    response.request?.responseURL ||
    response.config?.url ||
    url
  const trustedResponse = isTrustedTikTokUrl(longLink) || trustedTargets.size > 0
  const pageCookie = trustedResponse
    ? extractTikTokCookieFromSetCookie(response.headers?.['set-cookie'])
    : ''
  const cookie = trustedResponse
    ? mergeTikTokCookieHeaders({
        pageCookie,
        responseMsToken: response.headers?.['x-ms-token']
      })
    : ''
  const result = parseTikTokLongLink(longLink, cookie)

  if (!result.item_id) {
    logger.warn(`无法获取 TikTok 作品 ID: ${longLink}`)
  }

  shouldLog && logger.info(`[TikTok] 链接解析结果：${JSON.stringify(sanitizeTikTokIdDataForLog(result))}`)
  return result
}
