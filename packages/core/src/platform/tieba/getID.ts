import { logger } from 'node-karin'

import { Networks } from '@/module/utils/Networks'

export interface TiebaIdData {
  type: 'post' | 'unknown'
  tid?: string
  pid?: string
  cid?: string
  url?: string
}

const normalizeUrlLikeText = (text: string): string => {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

export const parseTiebaLongLink = (link: string): TiebaIdData => {
  const normalized = normalizeUrlLikeText(link)
  const match = /(?:tieba|tiebac)\.baidu\.com\/p\/(\d+)|jump\.bdimg\.com\/p\/(\d+)/i.exec(normalized)
  const tidFromPath = match?.[1] ?? match?.[2]

  try {
    const parsed = new URL(normalized)
    const tid = tidFromPath ?? parsed.searchParams.get('kz') ?? undefined
    if (!tid) return { type: 'unknown', url: normalized }

    return {
      type: 'post',
      tid,
      pid: parsed.searchParams.get('pid') ?? undefined,
      cid: parsed.searchParams.get('cid') ?? undefined,
      url: normalized
    }
  } catch {
    const kz = /[?&]kz=(\d+)/i.exec(normalized)?.[1]
    const tid = tidFromPath ?? kz
    if (!tid) return { type: 'unknown', url: normalized }

    return {
      type: 'post',
      tid,
      pid: /[?&]pid=(\d+)/i.exec(normalized)?.[1],
      cid: /[?&]cid=(\d+)/i.exec(normalized)?.[1],
      url: normalized
    }
  }
}

export const getTiebaID = async (url: string, log = true): Promise<TiebaIdData> => {
  const direct = parseTiebaLongLink(url)
  if (direct.type === 'post') {
    log && logger.debug(`[Tieba] 解析到帖子ID: ${direct.tid}`)
    return direct
  }

  const longLink = await new Networks({ url, outboundProfile: 'tieba-redirect' }).getLongLink()
  const result = parseTiebaLongLink(longLink)
  if (result.type === 'unknown') {
    throw new Error('无法从链接中提取贴吧帖子ID')
  }

  log && logger.debug(`[Tieba] 解析到帖子ID: ${result.tid}`)
  return result
}
