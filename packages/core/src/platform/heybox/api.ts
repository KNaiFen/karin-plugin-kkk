import axios from 'node-karin/axios'

import { buildConfiguredRequestOptions } from '@/module/utils/RequestConfig'
import { Config } from '@/module/utils/Config'
import { retryWithGuestCookieRecovery } from '@/module/utils/GuestCookieRecovery'

import { buildHeyboxUrl } from './encrypt'
import type {
  HeyboxApiCommentItem,
  HeyboxApiCommentData,
  HeyboxApiImage,
  HeyboxApiLink,
  HeyboxApiResponse,
  HeyboxAuthor,
  HeyboxComment,
  HeyboxContentPart,
  HeyboxDetail
} from './types'

export const HEYBOX_WEB_ORIGIN = 'https://www.xiaoheihe.cn'
export const HEYBOX_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

export type FetchHeyboxDetailOptions = {
  linkId: string
  cookie: string
  nowSeconds?: number
}

type ConfigWithHeyboxCookie = typeof Config & {
  cookies: typeof Config.cookies & {
    heybox?: string
  }
}

export const buildHeyboxHeaders = (cookie: string): Record<string, string> => ({
  Referer: `${HEYBOX_WEB_ORIGIN}/`,
  Host: 'api.xiaoheihe.cn',
  Origin: HEYBOX_WEB_ORIGIN,
  Accept: 'application/json, text/plain, */*',
  'User-Agent': HEYBOX_USER_AGENT,
  Cookie: cookie
})

const normalizeUrl = (url: unknown): string => {
  const value = String(url ?? '').trim()
  if (!value) return ''
  if (value.startsWith('//')) return `https:${value}`
  return value.replace(/\\+$/, '')
}

const stripHtml = (html: string): string => {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const extractHtmlParts = (html: string): HeyboxContentPart[] => {
  const normalized = html.replace(/\\"/g, '"')
  const parts: HeyboxContentPart[] = []
  const imageRegex = /<img\b[^>]*(?:data-original|data-actualsrc|data-default-watermark-src|src)=["']([^"']+)["'][^>]*>/gi
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = imageRegex.exec(normalized)) !== null) {
    const text = stripHtml(normalized.slice(cursor, match.index))
    if (text) parts.push({ type: 'text', text })
    const url = normalizeUrl(match[1])
    if (url) parts.push({ type: 'image', url })
    cursor = match.index + match[0].length
  }

  const tail = stripHtml(normalized.slice(cursor))
  if (tail) parts.push({ type: 'text', text: tail })
  return parts
}

const parseJsonTextParts = (text: string): HeyboxContentPart[] | null => {
  try {
    const value = JSON.parse(text) as unknown
    if (!Array.isArray(value)) return null
    const parts: HeyboxContentPart[] = []
    for (const item of value) {
      if (!item || typeof item !== 'object') continue
      const record = item as Record<string, unknown>
      if (record.type === 'html' && typeof record.text === 'string') {
        parts.push(...extractHtmlParts(record.text))
      } else if (record.type === 'text' && typeof record.text === 'string') {
        const content = record.text.trim()
        if (content) parts.push({ type: 'text', text: content })
      } else if (record.type === 'img') {
        const url = normalizeUrl(record.url)
        if (url) parts.push({ type: 'image', url })
      }
    }
    return parts
  } catch {
    return null
  }
}

export const parseHeyboxContentParts = (text: unknown): HeyboxContentPart[] => {
  const value = String(text ?? '').trim()
  if (!value) return []
  const jsonParts = parseJsonTextParts(value)
  if (jsonParts) return jsonParts
  if (/<[a-z][\s\S]*>/i.test(value)) return extractHtmlParts(value)
  return [{ type: 'text', text: value }]
}

const toNumber = (value: unknown): number => Number.isFinite(Number(value)) ? Number(value) : 0

const normalizeAuthor = (user: unknown, location?: string): HeyboxAuthor => {
  const record = user && typeof user === 'object' ? user as Record<string, unknown> : {}
  return {
    id: record.userid === undefined ? undefined : String(record.userid),
    name: String(record.username ?? '小黑盒用户'),
    avatar: normalizeUrl(record.avatar),
    location
  }
}

const imagePartsFromApiImages = (images: HeyboxApiImage[] | undefined): HeyboxContentPart[] => {
  return (images ?? [])
    .map(image => normalizeUrl(image.url))
    .filter(Boolean)
    .map(url => ({ type: 'image', url }))
}

const normalizeComment = (item: HeyboxApiCommentItem): HeyboxComment => {
  const content = [
    ...parseHeyboxContentParts(item.text),
    ...imagePartsFromApiImages(item.imgs)
  ]

  if (item.is_cy) {
    content.push({ type: 'text', text: '[插眼]' })
  }

  return {
    author: normalizeAuthor(item.user, item.ip_location),
    content,
    createdAt: item.create_at,
    location: item.ip_location,
    stats: {
      like: toNumber(item.up),
      reply: toNumber(item.child_num)
    },
    replies: []
  }
}

const normalizeComments = (comments?: HeyboxApiCommentData[]): HeyboxComment[] => {
  if (!Array.isArray(comments)) return []
  const result: HeyboxComment[] = []
  for (const wrapper of comments) {
    const items = wrapper?.comment
    if (!Array.isArray(items) || items.length === 0) continue
    const [rootItem, ...replyItems] = items
    const root = normalizeComment(rootItem)
    root.replies = replyItems.map(normalizeComment)
    result.push(root)
  }
  return result
}

const collectImages = (parts: HeyboxContentPart[]): string[] => {
  return parts.flatMap(part => part.type === 'image' ? [part.url] : [])
}

export const normalizeHeyboxDetail = (linkId: string, response: HeyboxApiResponse): HeyboxDetail => {
  if (response.status !== 'ok') {
    throw new Error(`小黑盒解析失败: ${response.msg ?? response.message ?? JSON.stringify(response)}`)
  }

  const link = response.result?.link as HeyboxApiLink | undefined
  if (!link) {
    throw new Error('小黑盒解析失败: 接口未返回帖子详情')
  }

  const content = parseHeyboxContentParts(link.text)
  const videoUrl = normalizeUrl(link.video_url)
  const videoCover = normalizeUrl(link.video_thumb)
  if (link.has_video && videoUrl) {
    content.push({ type: 'video', url: videoUrl, cover: videoCover || undefined })
  }

  return {
    linkId,
    url: `${HEYBOX_WEB_ORIGIN}/app/bbs/link/${linkId}`,
    title: String(link.title ?? '').trim() || String(link.description ?? '').trim() || `小黑盒_${linkId}`,
    description: String(link.description ?? '').trim(),
    author: normalizeAuthor(link.user, link.ip_location),
    createdAt: link.create_at,
    content,
    images: collectImages(content),
    video: videoUrl ? { url: videoUrl, cover: videoCover || undefined } : undefined,
    stats: {
      view: toNumber(link.click),
      like: toNumber(link.link_award_num),
      comment: toNumber(link.comment_num),
      share: toNumber(link.forward_num),
      collect: toNumber(link.favour_count)
    },
    comments: normalizeComments(response.result?.comments),
    raw: response
  }
}

export const fetchHeyboxDetail = async ({ linkId, cookie, nowSeconds }: FetchHeyboxDetailOptions): Promise<HeyboxDetail> => {
  const resolveActiveCookie = () => {
    const configuredCookie = ((Config as ConfigWithHeyboxCookie).cookies.heybox ?? '').trim()
    return configuredCookie || cookie.trim()
  }

  return await retryWithGuestCookieRecovery('heybox', async () => {
    const activeCookie = resolveActiveCookie()
    if (!activeCookie) {
      throw new Error('我还没有小黑盒 Cookie，暂时无法解析；请先配置包含 x_xhh_tokenid 的 Config.cookies.heybox。')
    }
    if (!/(?:^|;\s*)x_xhh_tokenid=/.test(activeCookie)) {
      throw new Error('小黑盒 Cookie 缺少 x_xhh_tokenid，暂时无法解析。')
    }

    const requestOptions = buildConfiguredRequestOptions(Config.request, {
      userAgentFallback: HEYBOX_USER_AGENT
    })
    const response = await axios.get<HeyboxApiResponse>(
      buildHeyboxUrl({ linkId, nowSeconds }),
      {
        ...requestOptions,
        headers: {
          ...requestOptions.headers,
          ...buildHeyboxHeaders(activeCookie)
        }
      }
    )

    return normalizeHeyboxDetail(linkId, response.data)
  }, {
    context: '获取小黑盒帖子详情'
  })
}
