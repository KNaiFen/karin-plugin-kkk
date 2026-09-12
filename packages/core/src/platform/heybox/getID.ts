import { logger } from 'node-karin'

import { Networks } from '@/module/utils/Networks'

import type { HeyboxIdData } from './types'

const decodeLink = (url: string): string => {
  try {
    return decodeURIComponent(url)
  } catch {
    return url
  }
}

export const parseHeyboxLongLink = (url: string): HeyboxIdData => {
  const normalized = decodeLink(url)

  try {
    const parsed = new URL(normalized)
    const host = parsed.hostname.replace(/^www\./, '')
    const linkId = parsed.searchParams.get('link_id') ?? undefined

    if (host === 'api.xiaoheihe.cn' && parsed.pathname === '/v3/bbs/app/api/web/share' && linkId) {
      return { type: 'link', link_id: linkId, url: normalized }
    }

    if (host === 'xiaoheihe.cn' && parsed.pathname === '/bbs/post_share' && linkId) {
      return { type: 'link', link_id: linkId, url: normalized }
    }

    const pathMatch = /^\/app\/bbs\/link\/([A-Za-z0-9_-]+)/.exec(parsed.pathname)
    if (host === 'xiaoheihe.cn' && pathMatch?.[1]) {
      return { type: 'link', link_id: pathMatch[1], url: normalized }
    }
  } catch {
    const queryMatch = /(?:api\.xiaoheihe\.cn\/v3\/bbs\/app\/api\/web\/share|xiaoheihe\.cn\/bbs\/post_share)[^#\s]*[?&]link_id=([A-Za-z0-9_-]+)/.exec(normalized)
    if (queryMatch?.[1]) return { type: 'link', link_id: queryMatch[1], url: normalized }

    const pathMatch = /xiaoheihe\.cn\/app\/bbs\/link\/([A-Za-z0-9_-]+)/.exec(normalized)
    if (pathMatch?.[1]) return { type: 'link', link_id: pathMatch[1], url: normalized }
  }

  return { type: 'unknown', url: normalized }
}

export const getHeyboxID = async (url: string, log = true): Promise<HeyboxIdData> => {
  const directResult = parseHeyboxLongLink(url)
  if (directResult.type === 'link' && directResult.link_id) {
    log && logger.debug(`[Heybox] 提取 link_id=${directResult.link_id}`)
    return directResult
  }

  const longLink = await new Networks({ url, outboundProfile: 'heybox-redirect' }).getLongLink()
  const result = parseHeyboxLongLink(longLink)
  if (result.type === 'unknown' || !result.link_id) {
    throw new Error('无法从链接中提取小黑盒帖子 ID')
  }

  log && logger.debug(`[Heybox] 展开链接后提取 link_id=${result.link_id}`)
  return result
}
