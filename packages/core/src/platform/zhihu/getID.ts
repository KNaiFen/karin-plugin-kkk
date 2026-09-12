import { logger } from 'node-karin'

import { Networks } from '@/module/utils/Networks'

import type { ZhihuIdData } from './types'

const ZHIHU_HOSTS = new Set([
  'zhihu.com',
  'www.zhihu.com',
  'm.zhihu.com',
  'zhuanlan.zhihu.com'
])

const isZhihuHost = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase()
  return normalized === 'zhihu.com' || normalized.endsWith('.zhihu.com')
}

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export const parseZhihuLongLink = (rawUrl: string): ZhihuIdData => {
  const normalized = safeDecode(rawUrl.trim())
  let url: URL
  try {
    url = new URL(normalized)
  } catch {
    return { type: 'unknown', url: rawUrl }
  }

  if (url.hostname.toLowerCase() === 'link.zhihu.com') {
    const target = url.searchParams.get('target')
    if (!target) return { type: 'unknown', url: normalized }
    const decodedTarget = safeDecode(target)
    let targetUrl: URL
    try {
      targetUrl = new URL(decodedTarget)
    } catch {
      return { type: 'unknown', url: normalized }
    }
    if (!isZhihuHost(targetUrl.hostname)) {
      return { type: 'unknown', url: normalized }
    }
    return parseZhihuLongLink(decodedTarget)
  }

  const hostname = url.hostname.toLowerCase()
  if (!ZHIHU_HOSTS.has(hostname) && !isZhihuHost(hostname)) {
    return { type: 'unknown', url: normalized }
  }

  const questionAnswer = /^\/question\/(\d+)\/answer\/(\d+)\/?$/.exec(url.pathname)
  if (questionAnswer) {
    return {
      type: 'answer',
      url: url.href,
      questionId: questionAnswer[1],
      answerId: questionAnswer[2]
    }
  }

  const article = /^\/p\/(\d+)\/?$/.exec(url.pathname)
  if (hostname === 'zhuanlan.zhihu.com' && article) {
    return {
      type: 'article',
      url: url.href,
      articleId: article[1]
    }
  }

  const zvideo = /^\/zvideo\/(\d+)\/?$/.exec(url.pathname)
  if ((hostname === 'www.zhihu.com' || hostname === 'zhihu.com') && zvideo) {
    return {
      type: 'zvideo',
      url: url.href,
      videoId: zvideo[1]
    }
  }

  return { type: 'unknown', url: normalized }
}

const assertAllowedZhihuLinkTarget = (rawUrl: string): void => {
  let url: URL
  try {
    url = new URL(safeDecode(rawUrl.trim()))
  } catch {
    return
  }

  if (url.hostname.toLowerCase() !== 'link.zhihu.com') return

  const target = url.searchParams.get('target')
  if (!target) return

  let targetUrl: URL
  try {
    targetUrl = new URL(safeDecode(target))
  } catch {
    throw new Error('知乎跳转链接 target 无效，无法解析')
  }

  if (!isZhihuHost(targetUrl.hostname)) {
    throw new Error('知乎跳转链接 target 不是知乎域名，已拒绝解析')
  }
}

export const getZhihuID = async (url: string, log = true): Promise<ZhihuIdData> => {
  const direct = parseZhihuLongLink(url)
  if (direct.type !== 'unknown') {
    log && logger.info(`[Zhihu] 链接解析结果：${JSON.stringify(direct)}`)
    return direct
  }

  assertAllowedZhihuLinkTarget(url)
  const longLink = await new Networks({ url, outboundProfile: 'zhihu-redirect' }).getLongLink()
  const result = parseZhihuLongLink(longLink)
  if (result.type === 'unknown') {
    throw new Error('无法从链接中提取知乎内容 ID')
  }

  log && logger.info(`[Zhihu] 链接解析结果：${JSON.stringify(result)}`)
  return result
}
