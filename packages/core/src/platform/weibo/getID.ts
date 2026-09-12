import { logger } from 'node-karin'

import { Networks } from '@/module/utils/Networks'

import type { WeiboIdData } from './types'

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const looksLikeStatusId = (value: string): boolean => /^[0-9A-Za-z]+$/.test(value)

const base62Encode = (input: number): string => {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  if (input === 0) return '0'

  let number = input
  let result = ''
  while (number > 0) {
    result = alphabet[number % 62] + result
    number = Math.floor(number / 62)
  }
  return result
}

const midToBid = (mid: string): string => {
  const reversed = mid.split('').reverse().join('')
  const chunks = Math.ceil(reversed.length / 7)
  const result: string[] = []

  for (let index = 0; index < chunks; index += 1) {
    const chunk = reversed.slice(index * 7, (index + 1) * 7).split('').reverse().join('')
    let encoded = base62Encode(Number.parseInt(chunk, 10))
    if (index < chunks - 1 && encoded.length < 4) {
      encoded = `${'0'.repeat(4 - encoded.length)}${encoded}`
    }
    result.push(encoded)
  }

  return result.reverse().join('')
}

export const parseWeiboLongLink = (rawUrl: string): WeiboIdData => {
  const normalized = safeDecode(rawUrl.trim())
  let url: URL

  try {
    url = new URL(normalized)
  } catch {
    return { type: 'unknown', url: rawUrl }
  }

  const hostname = url.hostname.toLowerCase()
  const segments = url.pathname.split('/').filter(Boolean)

  if (hostname === 'video.weibo.com' && segments[0] === 'show') {
    const fid = url.searchParams.get('fid')?.trim()
    if (fid) {
      return { type: 'video_show', fid, url: url.href }
    }
  }

  if ((hostname === 'weibo.com' || hostname === 'www.weibo.com') && segments[0] === 'tv' && segments[1] === 'show') {
    const mid = url.searchParams.get('mid')?.trim()
    if (mid && /^\d+$/.test(mid)) {
      return { type: 'status', statusId: midToBid(mid), url: url.href }
    }
  }

  if (hostname === 'm.weibo.cn') {
    if ((segments[0] === 'status' || segments[0] === 'detail') && segments[1] && looksLikeStatusId(segments[1])) {
      return { type: 'status', statusId: segments[1], url: url.href }
    }

    if (segments.length >= 2 && /^\d+$/.test(segments[0]) && looksLikeStatusId(segments[1])) {
      return { type: 'status', statusId: segments[1], url: url.href }
    }
  }

  if ((hostname === 'weibo.com' || hostname === 'www.weibo.com') && segments.length >= 2 && /^\d+$/.test(segments[0]) && looksLikeStatusId(segments[1])) {
    return { type: 'status', statusId: segments[1], url: url.href }
  }

  return { type: 'unknown', url: normalized }
}

export const getWeiboID = async (url: string, log = true): Promise<WeiboIdData> => {
  const direct = parseWeiboLongLink(url)
  if (direct.type !== 'unknown') {
    log && logger.info(`[Weibo] 链接解析结果：${JSON.stringify(direct)}`)
    return direct
  }

  const longLink = await new Networks({ url, outboundProfile: 'weibo-redirect' }).getLongLink()
  const result = parseWeiboLongLink(longLink)
  if (result.type === 'unknown') {
    throw new Error('无法从链接中提取微博内容 ID')
  }

  log && logger.info(`[Weibo] 链接解析结果：${JSON.stringify(result)}`)
  return result
}
