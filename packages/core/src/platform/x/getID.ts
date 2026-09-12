import { logger } from 'node-karin'

import { Networks } from '@/module/utils/Networks'

import type { XIdData } from './types'
import { buildXNetworkOptions } from './request'

const X_STATUS_PATH = /^\/([A-Za-z0-9_]{1,20})\/status\/(\d+)(?:\/.*)?$/i

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export const parseXLongLink = (rawUrl: string): XIdData => {
  const normalized = safeDecode(rawUrl.trim())
  let url: URL

  try {
    url = new URL(normalized)
  } catch {
    return { type: 'unknown', url: rawUrl }
  }

  const hostname = url.hostname.toLowerCase()
  if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(hostname)) {
    return { type: 'unknown', url: normalized }
  }

  const match = url.pathname.match(X_STATUS_PATH)
  if (!match) {
    return { type: 'unknown', url: normalized }
  }

  return {
    type: 'status',
    statusId: match[2],
    screenName: match[1],
    url: url.href
  }
}

export const getXID = async (url: string, log = true): Promise<XIdData> => {
  const direct = parseXLongLink(url)
  if (direct.type !== 'unknown') {
    log && logger.info(`[X] 链接解析结果：${JSON.stringify(direct)}`)
    return direct
  }

  const longLink = await new Networks({
    url,
    networkOptions: buildXNetworkOptions(),
    outboundProfile: 'x-redirect'
  }).getLongLink()
  const result = parseXLongLink(longLink)
  if (result.type === 'unknown') {
    throw new Error('无法从链接中提取 X 内容 ID')
  }

  log && logger.info(`[X] 链接解析结果：${JSON.stringify(result)}`)
  return result
}
