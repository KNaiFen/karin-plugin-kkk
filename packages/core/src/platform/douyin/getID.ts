import { logger, type Message } from 'node-karin'
import axios from 'node-karin/axios'

import type { DouyinDataTypes } from '@/types'

import { Config } from '../../module/utils/Config'
import { recordFailureTraceStep } from '../../module/utils/ErrorTrace'
import { buildConfiguredRequestOptions } from '../../module/utils/RequestConfig'
import { DouyinWorkMainType } from './workType'

export interface DouyinIdData {
  type: DouyinDataTypes[keyof DouyinDataTypes]
  /** 该作品是否为视频（已废弃，使用 work_type） */
  is_mp4?: boolean
  /** 作品主类型 */
  work_type?: DouyinWorkMainType
  /** 短链解析后的最终落地地址 */
  resolvedUrl?: string
  /** HTML 主链使用的作品类型提示 */
  typeHint?: 'video' | 'article' | 'note' | 'slides'
  /** 这次短链重定向链路上拿到的临时 Cookie */
  transientCookieHeader?: string
  [key: string]: any
}

export const extractDouyinLiveRoomId = (longLink: string): string | undefined => {
  try {
    return new URL(longLink).pathname.split('/').filter(Boolean).pop()
  } catch {
    return longLink.split('?')[0].split('/').filter(Boolean).pop()
  }
}

export const parseDouyinLongLink = (longLink: string): DouyinIdData => {
  let result = {} as DouyinIdData
  switch (true) {
    case longLink.includes('webcast.amemv.com'):
    case longLink.includes('live.douyin.com'): {
      if (longLink.includes('webcast.amemv.com')) {
        const sec_uid = /sec_user_id=([^&]+)/.exec(longLink)
        result = {
          type: 'live_room_detail',
          room_id: extractDouyinLiveRoomId(longLink),
          sec_uid: sec_uid ? decodeURIComponent(sec_uid[1]) : undefined,
          source: 'webcast_reflow'
        }
      } else if (longLink.includes('live.douyin.com')) {
        result = {
          type: 'live_room_detail',
          room_id: extractDouyinLiveRoomId(longLink)
        }
      }
      break
    }

    case /video\/(\d+)/.test(longLink):
    case /article\/(\d+)/.test(longLink):
    case /note\/(\d+)/.test(longLink): {
      const match = /(?:video|article|note)\/(\d+)/.exec(longLink)
      result = {
        type: 'one_work',
        aweme_id: match ? match[1] : undefined
      }
      break
    }
    case /modal_id=(\d+)/.test(longLink): {
      const modalMatch = /modal_id=(\d+)/.exec(longLink)
      result = {
        type: 'one_work',
        aweme_id: modalMatch ? modalMatch[1] : undefined,
        is_mp4: true,
        work_type: DouyinWorkMainType.VIDEO
      }
      break
    }
    case /https:\/\/(?:www\.douyin\.com|www\.iesdouyin\.com)\/(?:share\/)?user\/(\S+)/.test(longLink): {
      const userMatch = /user\/([a-zA-Z0-9_-]+)/.exec(longLink)
      result = {
        type: 'user_dynamic',
        sec_uid: userMatch ? userMatch[1] : undefined
      }
      break
    }
    case /music\/(\d+)/.test(longLink): {
      const musicMatch = /music\/(\d+)/.exec(longLink)
      result = {
        type: 'music_work',
        music_id: musicMatch ? musicMatch[1] : undefined
      }
      break
    }
    default:
      break
  }

  return result
}

const shouldResolveDouyinRedirect = (url: string): boolean => {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`)
    const hostname = parsed.hostname.toLowerCase()
    return hostname === 'v.douyin.com' ||
      hostname === 'jx.douyin.com' ||
      hostname === 'jingxuan.douyin.com'
  } catch {
    return true
  }
}

const isDouyinRedirectStatus = (status?: number): boolean => {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

const normalizeSetCookieHeaders = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map(item => String(item)).filter(Boolean)
  }
  if (typeof value === 'string' && value.trim()) {
    return [value]
  }
  return []
}

const appendSetCookiePairs = (
  cookieMap: Map<string, string>,
  setCookieHeaders: string[]
) => {
  for (const header of setCookieHeaders) {
    const firstPair = header.split(';')[0]?.trim()
    if (!firstPair) continue

    const index = firstPair.indexOf('=')
    if (index <= 0) continue

    const name = firstPair.slice(0, index).trim()
    const value = firstPair.slice(index + 1).trim()
    if (!name || !value) continue

    cookieMap.set(name, `${name}=${value}`)
  }
}

const buildTransientCookieHeader = (cookieMap: Map<string, string>): string | undefined => {
  const values = Array.from(cookieMap.values()).filter(Boolean)
  return values.length > 0 ? values.join('; ') : undefined
}

const getDouyinTypeHintFromLink = (url: string): DouyinIdData['typeHint'] => {
  if (/\/(?:share\/)?article\/\d+/i.test(url)) return 'article'
  if (/\/(?:share\/)?note\/\d+/i.test(url)) return 'note'
  if (/\/(?:share\/)?slides\/\d+/i.test(url)) return 'slides'
  if (/\/(?:share\/)?video\/\d+/i.test(url)) return 'video'
  return undefined
}

const resolveDouyinShortRedirect = async (url: string): Promise<{ finalUrl: string, transientCookieHeader?: string }> => {
  let currentUrl = url
  const cookieMap = new Map<string, string>()

  for (let hop = 0; hop < 10; hop++) {
    const response = await axios.get(currentUrl, {
      ...buildConfiguredRequestOptions(Config.request, {
        maxRedirects: 0,
        maxContentLength: 512 * 1024
      }),
      validateStatus: (status: number) => status >= 200 && status < 400
    })

    appendSetCookiePairs(cookieMap, normalizeSetCookieHeaders(response.headers?.['set-cookie']))

    if (isDouyinRedirectStatus(response.status) && response.headers?.location) {
      currentUrl = new URL(String(response.headers.location), currentUrl).toString()
      continue
    }

    return {
      finalUrl: response.request?.res?.responseUrl || response.request?.responseURL || currentUrl,
      transientCookieHeader: buildTransientCookieHeader(cookieMap)
    }
  }

  return {
    finalUrl: currentUrl,
    transientCookieHeader: buildTransientCookieHeader(cookieMap)
  }
}

/**
 * 获取抖音作品ID
 * @param event 消息事件
 * @param url 分享链接
 * @param log 输出日志，默认true
 */
export const getDouyinID = async (event: Message, url: string, log = true): Promise<DouyinIdData> => {
  const shouldResolveRedirect = shouldResolveDouyinRedirect(url)
  recordFailureTraceStep('douyin.id.resolve.start', {
    url,
    shouldResolveRedirect
  })

  if (!shouldResolveRedirect) {
    const directResult = parseDouyinLongLink(url)
    if (directResult.type) {
      if (directResult.type === 'one_work') {
        directResult.resolvedUrl = url
        directResult.typeHint = getDouyinTypeHintFromLink(url)
      }
      recordFailureTraceStep('douyin.id.resolve.direct', directResult)
      log && logger.debug('[Douyin] 链接解析结果:', directResult)
      return directResult
    }
  }

  recordFailureTraceStep('douyin.id.resolve.redirect.request', {
    url
  })
  const { finalUrl: longLink, transientCookieHeader } = await resolveDouyinShortRedirect(url)
  recordFailureTraceStep('douyin.id.resolve.redirect.response', {
    finalUrl: longLink
  })
  const result = parseDouyinLongLink(longLink)
  if (!result.type) logger.warn('无法获取作品ID')

  if (result.type === 'one_work') {
    result.resolvedUrl = longLink
    result.typeHint = getDouyinTypeHintFromLink(longLink)
    result.transientCookieHeader = transientCookieHeader
  }

  recordFailureTraceStep('douyin.id.resolve.result', result)
  log && logger.debug('[Douyin] 链接解析结果:', result)
  return result
}
