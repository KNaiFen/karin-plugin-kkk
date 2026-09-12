import axios from 'node-karin/axios'
import type { AxiosHeaders, RawAxiosRequestHeaders } from 'node-karin/axios'
import { wbi_sign } from '@ikenxuan/amagi'
import crypto from 'node:crypto'

import { logSummaryMessage } from './progress'
import type { SummaryMediaReference } from './types'

type BilibiliSubtitleApiResponse = {
  data?: {
    subtitle?: {
      subtitles?: Array<{
        subtitle_url?: string
        lan?: string
        lan_doc?: string
      }>
    }
  }
}

type BilibiliNavApiResponse = {
  data?: {
    wbi_img?: {
      img_url?: string
      sub_url?: string
    }
  }
}

const mixinKeyEncTab: readonly number[] = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26,
  17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
]

const toRequestHeaders = (
  headers: Record<string, unknown> | undefined
): AxiosHeaders | (RawAxiosRequestHeaders & Record<string, unknown>) | undefined => {
  if (!headers) return undefined
  return headers as AxiosHeaders | (RawAxiosRequestHeaders & Record<string, unknown>)
}

const buildWbiRequestHeaders = (
  headers: Record<string, unknown> | undefined
): AxiosHeaders | (RawAxiosRequestHeaders & Record<string, unknown>) => ({
  ...(toRequestHeaders(headers) ?? {}),
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache'
})

const normalizeBilibiliSubtitleUrl = (value: string | undefined): string | undefined => {
  if (!value) return undefined
  if (value.startsWith('//')) return `https:${value}`
  return value
}

const buildWbiParamsFromSigned = (
  signed: string,
  aid: number,
  cid: number
): Record<string, string> => {
  const normalizedSigned = String(signed ?? '').trim().replace(/^&+/, '')
  const searchParams = new URLSearchParams(normalizedSigned)
  if (!searchParams.has('aid')) searchParams.set('aid', String(aid))
  if (!searchParams.has('cid')) searchParams.set('cid', String(cid))
  return Object.fromEntries(searchParams)
}

const getMixinKey = (orig: string): string => mixinKeyEncTab.map(n => orig[n]).join('').slice(0, 32)

const extractWbiKey = (value: string | undefined): string => {
  if (!value) return ''
  return value.slice(value.lastIndexOf('/') + 1, value.lastIndexOf('.'))
}

const buildFallbackWbiParams = async (
  aid: number,
  cid: number,
  headers: Record<string, unknown> | undefined
): Promise<Record<string, string>> => {
  const navResponse = await axios.get<BilibiliNavApiResponse>('https://api.bilibili.com/x/web-interface/nav', {
    timeout: 30000,
    proxy: false,
    headers: buildWbiRequestHeaders(headers)
  })
  const imgKey = extractWbiKey(navResponse.data?.data?.wbi_img?.img_url)
  const subKey = extractWbiKey(navResponse.data?.data?.wbi_img?.sub_url)
  if (!imgKey || !subKey) {
    throw new Error('B站 nav 未返回有效 WBI key')
  }

  const mixinKey = getMixinKey(imgKey + subKey)
  const wts = String(Math.round(Date.now() / 1000))
  const chrFilter = /[!'()*]/g
  const params = {
    aid: String(aid),
    cid: String(cid),
    wts
  }
  const query = Object.keys(params)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key as keyof typeof params].replace(chrFilter, ''))}`)
    .join('&')
  const wRid = crypto.createHash('md5').update(query + mixinKey).digest('hex')

  return {
    aid: params.aid,
    cid: params.cid,
    wts,
    w_rid: wRid
  }
}

export const fetchBilibiliSubtitleReferences = async (params: {
  aid?: number
  bvid?: string
  cid: number
  headers?: Record<string, unknown>
}): Promise<Array<Extract<SummaryMediaReference, { type: 'subtitle' }>>> => {
  const requestHeaders = buildWbiRequestHeaders(params.headers)

  const cookie = String(params.headers?.Cookie ?? '').trim()
  if (!params.aid || params.aid <= 0 || !cookie) {
    logSummaryMessage('WBI 不可用，直接回退 ASR', {
      level: 'warn'
    })
    return []
  }

  try {
    let requestParams: Record<string, string>
    try {
      const signed = await wbi_sign(
        `https://api.bilibili.com/x/player/wbi/v2?aid=${params.aid}&cid=${params.cid}`,
        cookie
      )
      requestParams = buildWbiParamsFromSigned(signed, params.aid, params.cid)
    } catch (error) {
      logSummaryMessage(`WBI 签名失败，尝试本地重签名：${error instanceof Error ? error.message : String(error)}`, {
        level: 'warn'
      })
      requestParams = await buildFallbackWbiParams(params.aid, params.cid, params.headers)
    }
    const response = await axios.get<BilibiliSubtitleApiResponse>('https://api.bilibili.com/x/player/wbi/v2', {
      params: requestParams,
      timeout: 30000,
      headers: requestHeaders
    })
    const subtitles = (response.data?.data?.subtitle?.subtitles ?? [])
      .map((item): Extract<SummaryMediaReference, { type: 'subtitle' }> => ({
        type: 'subtitle' as const,
        source: 'bilibili',
        language: item.lan,
        label: item.lan_doc,
        url: normalizeBilibiliSubtitleUrl(item.subtitle_url),
        headers: params.headers
      }))
      .filter((item): item is Extract<SummaryMediaReference, { type: 'subtitle' }> => Boolean(item.url))

    if (subtitles.length > 0) {
      return subtitles
    }

    logSummaryMessage('WBI 字幕探测未返回可用字幕，直接回退 ASR', {
      level: 'warn'
    })
    return []
  } catch (error) {
    logSummaryMessage(`WBI 字幕探测失败，直接回退 ASR：${error instanceof Error ? error.message : String(error)}`, {
      level: 'warn'
    })
    return []
  }
}
