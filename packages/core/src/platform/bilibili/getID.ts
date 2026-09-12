import amagi from '@ikenxuan/amagi'
import { logger } from 'node-karin'
import axios from 'node-karin/axios'

import type { BilibiliDataTypes } from '@/types'

import { Config } from '../../module/utils/Config'
import { buildConfiguredRequestOptions } from '../../module/utils/RequestConfig'

export interface BilibiliId {
  type: BilibiliDataTypes[keyof BilibiliDataTypes]
  [x: string]: any
}

const normalizeBilibiliInput = (url: string): string => {
  const cleaned = url.replace(/\\/g, '').trim()
  if (/^BV[1-9a-zA-Z]{10}$/i.test(cleaned) || /^av\d+$/i.test(cleaned)) {
    return `https://www.bilibili.com/video/${cleaned}`
  }
  if (/^(?:www\.|m\.|t\.|live\.)?bilibili\.com\//i.test(cleaned) || /^b23\.tv\//i.test(cleaned) || /^bili2233\.cn\//i.test(cleaned)) {
    return `https://${cleaned}`
  }
  return cleaned
}

const shouldResolveRedirect = (url: string): boolean => {
  try {
    const hostname = new URL(normalizeBilibiliInput(url)).hostname.toLowerCase()
    return hostname === 'b23.tv' || hostname === 'bili2233.cn'
  } catch {
    return true
  }
}

const resolveAvIfNeeded = async (result: BilibiliId): Promise<BilibiliId> => {
  const bvid = typeof result.bvid === 'string' ? result.bvid : undefined
  if (!bvid?.toLowerCase().startsWith('av')) return result

  const avid = parseInt(bvid.replace(/^av/i, ''))
  const convertResult = await amagi.bilibiliFetcher.convertAvToBv({ avid, typeMode: 'strict' })
  return {
    ...result,
    bvid: convertResult.data.data.bvid
  }
}

export const parseBilibiliLongLink = (url: string): BilibiliId => {
  const longLink = normalizeBilibiliInput(url)
  let result = {} as BilibiliId
  let parsedUrl: URL

  try {
    parsedUrl = new URL(longLink)
  } catch {
    return result
  }

  let pValue: number | undefined
  const pParam = parsedUrl.searchParams.get('p')
  if (pParam) {
    pValue = parseInt(pParam, 10)
    if (isNaN(pValue)) {
      pValue = undefined
    }
  }
  const pathname = parsedUrl.pathname
  const hostname = parsedUrl.hostname

  switch (true) {
    case (hostname === 't.bilibili.com' && /^\/\d+/.test(pathname)) || (hostname === 'www.bilibili.com' && /^\/opus\/\d+/.test(pathname)): {
      const tMatch = hostname === 't.bilibili.com' ? pathname.match(/^\/(\d+)/) : null
      const opusMatch = hostname === 'www.bilibili.com' ? pathname.match(/^\/opus\/(\d+)/) : null
      const dynamic_id = tMatch ?? opusMatch
      result = {
        type: 'dynamic_info',
        dynamic_id: dynamic_id ? dynamic_id[1] : undefined
      }
      break
    }
    case /\/read\/cv(\d+)/.test(longLink): {
      const cvMatch = /\/read\/cv(\d+)/.exec(longLink)
      result = {
        type: 'dynamic_info',
        dynamic_id: cvMatch ? cvMatch[1] : undefined
      }
      break
    }
    case /\/bangumi\/play\/(\w+)/.test(longLink): {
      const playMatch = /\/bangumi\/play\/(\w+)/.exec(longLink)
      const id = playMatch ? playMatch[1] : ''
      let realid = ''
      let isEpid = false
      if (id.startsWith('ss')) {
        realid = id
      } else if (id.startsWith('ep')) {
        realid = id
        isEpid = true
      }
      result = {
        type: 'bangumi_video_info',
        isEpid,
        realid
      }
      break
    }
    case /(video\/|video-)([A-Za-z0-9]+)/.test(longLink): {
      const bvideoMatch = /video\/([A-Za-z0-9]+)|bvid=([A-Za-z0-9]+)/.exec(longLink)
      const bvid = bvideoMatch ? bvideoMatch[1] || bvideoMatch[2] : undefined

      result = {
        type: 'one_video',
        bvid,
        ...(pValue !== undefined && { p: pValue })
      }
      break
    }
    case /festival\/([A-Za-z0-9]+)/.test(longLink): {
      const festivalMatch = /festival\/([A-Za-z0-9]+)\?bvid=([A-Za-z0-9]+)/.exec(longLink)
      result = {
        type: 'one_video',
        bvid: festivalMatch ? festivalMatch[2] : undefined
      }
      break
    }
    case /play\/(\S+?)\??/.test(longLink): {
      const playMatch = /play\/(\w+)/.exec(longLink)
      const id = playMatch ? playMatch[1] : ''
      const isEpid = false
      if (id.startsWith('ss')) {
        result.realid = 'season_id'
      } else if (id.startsWith('ep')) {
        result.realid = 'ep_id'
      }
      result = {
        type: 'bangumi_video_info',
        isEpid,
        realid: playMatch ? playMatch[1] : ''
      }
      break
    }
    case /^https:\/\/t\.bilibili\.com\/(\d+)/.test(longLink) || /^https:\/\/www\.bilibili\.com\/opus\/(\d+)/.test(longLink): {
      const tMatch = /^https:\/\/t\.bilibili\.com\/(\d+)/.exec(longLink)
      const opusMatch = /^https:\/\/www\.bilibili\.com\/opus\/(\d+)/.exec(longLink)
      const dynamic_id = tMatch ?? opusMatch
      result = {
        type: 'dynamic_info',
        dynamic_id: dynamic_id ? dynamic_id[1] : dynamic_id
      }
      break
    }
    case longLink.includes('live.bilibili.com'): {
      const match = /https?:\/\/live\.bilibili\.com\/(\d+)/.exec(longLink)
      result = {
        type: 'live_room_detail',
        room_id: match ? match[1] : undefined
      }
      break
    }
    default:
      break
  }

  return result
}

/**
 * return aweme_id
 * @param {string} url 分享连接
 * @returns
 */
export const getBilibiliID = async (url: string) => {
  // 如果是专栏链接且带有 opus_fallback 参数，先去掉参数让它自然重定向
  if (/\/read\/cv\d+/.test(url) && url.includes('opus_fallback')) {
    url = url.split('?')[0]
  }
  if (!shouldResolveRedirect(url)) {
    const directResult = parseBilibiliLongLink(url)
    if (directResult.type) {
      return await resolveAvIfNeeded(directResult)
    }
  }

  const resp = await axios.get(url, buildConfiguredRequestOptions(Config.request, { maxRedirects: 10 }))
  const longLink = resp?.request?.res?.responseUrl ?? resp?.config?.url ?? url
  const result = parseBilibiliLongLink(longLink)
  if (!result.type) logger.warn('无法获取作品ID')
  logger.debug('[Bilibili] 链接解析结果:', result)
  return await resolveAvIfNeeded(result)
}
