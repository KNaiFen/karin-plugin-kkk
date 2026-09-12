import axios from 'node-karin/axios'

import { baseHeaders, buildConfiguredRequestOptions } from '@/module'
import { Config } from '@/module/utils/Config'
import { retryWithGuestCookieRecovery } from '@/module/utils/GuestCookieRecovery'
import {
  executeSafeAxiosRequest,
  isTrustedWeiboMediaUrl,
  sanitizeWeiboCredentialHeaders
} from '@/module/utils/OutboundRequest'

import type { WeiboAuthor, WeiboDetail, WeiboIdData, WeiboShowDetail, WeiboStatus, WeiboVideoInfo } from './types'

const WEIBO_ORIGIN = 'https://weibo.com'
const WEIBO_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'

type WeiboCookieConfig = typeof Config.cookies & { weibo?: string }

const getWeiboCookie = (): string => {
  return ((Config.cookies as WeiboCookieConfig).weibo ?? '').trim()
}

const requestOptions = () => buildConfiguredRequestOptions(Config.request, {
  maxRedirects: 5,
  userAgentFallback: WEIBO_USER_AGENT,
  outboundProfile: 'weibo-page',
  maxContentLength: 2 * 1024 * 1024
})

export const buildWeiboCredentialHeaders = (
  targetUrl: string,
  referer = WEIBO_ORIGIN
): Record<string, string> => {
  const cookie = getWeiboCookie()
  const headers = {
    ...baseHeaders,
    Accept: 'application/json, text/plain, */*',
    Cookie: cookie,
    Referer: referer,
    'User-Agent': WEIBO_USER_AGENT,
    'X-Requested-With': 'XMLHttpRequest'
  } as Record<string, string>

  return sanitizeWeiboCredentialHeaders(headers, targetUrl)
}

const getWeiboHeaders = (targetUrl: string, referer = WEIBO_ORIGIN): Record<string, string> => {
  return buildWeiboCredentialHeaders(targetUrl, referer)
}

const normalizeWeiboStatusUrl = (url: string): string => {
  try {
    const parsed = new URL(url)
    if (parsed.hostname.toLowerCase() !== 'm.weibo.cn') return url
    const segments = parsed.pathname.split('/').filter(Boolean)
    const bid = segments.at(-1)?.trim()
    if (!bid) return url
    return `${WEIBO_ORIGIN}/status/${bid}`
  } catch {
    return url
  }
}

const asRecord = (value: unknown): Record<string, any> => {
  return value && typeof value === 'object' ? value as Record<string, any> : {}
}

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const decodeHtmlEntities = (value: string): string => {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: '\'',
    nbsp: ' '
  }

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity: string) => {
    const lower = entity.toLowerCase()
    if (lower.startsWith('#x')) {
      const codePoint = Number.parseInt(lower.slice(2), 16)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _
    }
    if (lower.startsWith('#')) {
      const codePoint = Number.parseInt(lower.slice(1), 10)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _
    }
    return named[lower] ?? _
  })
}

const htmlToText = (value: unknown): string => {
  const source = String(value ?? '')
  const normalized = decodeHtmlEntities(
    source
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p\s*>/gi, '\n')
      .replace(/<\/div\s*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )

  return normalized
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
}

const toTimestamp = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? Math.trunc(value / 1000) : value
  }

  if (typeof value !== 'string' || !value.trim()) return undefined

  const numeric = Number(value)
  if (Number.isFinite(numeric)) {
    return numeric > 1e12 ? Math.trunc(numeric / 1000) : numeric
  }

  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed / 1000) : undefined
}

const uniquePush = (target: string[], value: unknown): void => {
  if (typeof value !== 'string') return
  const normalized = safeDecode(value).trim()
  if (!/^https?:\/\//i.test(normalized)) return
  if (!target.includes(normalized)) target.push(normalized)
}

const weiboImageVariantKeys = [
  'original',
  'largest',
  'large',
  'mw2000',
  'mw690',
  'bmiddle',
  'middleplus',
  'pic_big',
  'pic_middle',
  'pic_small'
] as const

const weiboImageVariantRank: Record<string, number> = {
  original: 0,
  largest: 1,
  large: 2,
  mw2000: 3,
  mw690: 4,
  orj360: 5,
  bmiddle: 6,
  middleplus: 7,
  pic_big: 8,
  pic_middle: 9,
  pic_small: 10,
  url: 11
}

const normalizeHttpUrl = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = safeDecode(value).trim()
  return /^https?:\/\//i.test(normalized) ? normalized : undefined
}

const inferWeiboImageUrlRank = (url: string): number => {
  try {
    const parsed = new URL(url)
    const variant = parsed.pathname.split('/').filter(Boolean).at(-2)?.toLowerCase() ?? ''
    return weiboImageVariantRank[variant] ?? 99
  } catch {
    return 99
  }
}

const getWeiboImageIdentity = (url: string): string => {
  try {
    const parsed = new URL(url)
    return parsed.pathname.split('/').filter(Boolean).at(-1)?.toLowerCase() ?? url.toLowerCase()
  } catch {
    return url.split('?')[0].split('/').filter(Boolean).at(-1)?.toLowerCase() ?? url.toLowerCase()
  }
}

const rankWeiboImageCandidate = (url: string, fieldKey?: string): number => {
  const fieldRank = fieldKey ? (weiboImageVariantRank[fieldKey] ?? 99) : 99
  return Math.min(fieldRank, inferWeiboImageUrlRank(url))
}

const getBestWeiboImageUrl = (value: unknown): string | undefined => {
  const record = asRecord(value)
  const candidates: Array<{ url: string, rank: number }> = []

  const directUrl = normalizeHttpUrl(record.url)
  if (directUrl) {
    candidates.push({ url: directUrl, rank: rankWeiboImageCandidate(directUrl, 'url') })
  }

  for (const key of weiboImageVariantKeys) {
    const url = normalizeHttpUrl(asRecord(record[key]).url)
    if (url) {
      candidates.push({ url, rank: rankWeiboImageCandidate(url, key) })
    }
  }

  const picInfo = asRecord(record.pic_info)
  for (const key of weiboImageVariantKeys) {
    const url = normalizeHttpUrl(asRecord(picInfo[key]).url)
    if (url) {
      candidates.push({ url, rank: rankWeiboImageCandidate(url, key) })
    }
  }

  if (candidates.length === 0) return undefined

  candidates.sort((left, right) => left.rank - right.rank)
  return candidates[0].url
}

const dedupeWeiboImageUrls = (urls: string[]): string[] => {
  const bestByIdentity = new Map<string, { url: string, rank: number }>()
  const order: string[] = []

  for (const url of urls) {
    const normalized = normalizeHttpUrl(url)
    if (!normalized) continue

    const identity = getWeiboImageIdentity(normalized)
    const rank = rankWeiboImageCandidate(normalized)
    const existing = bestByIdentity.get(identity)

    if (!existing) {
      bestByIdentity.set(identity, { url: normalized, rank })
      order.push(identity)
      continue
    }

    if (rank < existing.rank) {
      bestByIdentity.set(identity, { url: normalized, rank })
    }
  }

  return order
    .map(identity => bestByIdentity.get(identity)?.url)
    .filter((url): url is string => Boolean(url))
}

const normalizeAuthor = (value: unknown): WeiboAuthor => {
  const record = asRecord(value)
  return {
    id: String(record.idstr ?? record.id ?? '').trim() || undefined,
    name: String(record.screen_name ?? record.name ?? '微博用户'),
    avatar: typeof record.profile_image_url === 'string' ? record.profile_image_url : undefined,
    description: typeof record.description === 'string' ? record.description : undefined
  }
}

const collectImageUrls = (pics: unknown): string[] => {
  const images: string[] = []

  const visit = (value: unknown): void => {
    if (!value) return

    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }

    const directUrl = normalizeHttpUrl(value)
    if (directUrl) {
      images.push(directUrl)
      return
    }

    const preferred = getBestWeiboImageUrl(value)
    if (preferred) {
      images.push(preferred)
      return
    }

    const record = asRecord(value)
    for (const item of Object.values(record)) {
      visit(item)
    }
  }

  visit(pics)
  return dedupeWeiboImageUrls(images)
}

const collectMixMediaImageUrls = (value: unknown): string[] => {
  const images: string[] = []
  const items = asRecord(value).items
  if (!Array.isArray(items)) return images

  for (const item of items) {
    const record = asRecord(item)
    const data = asRecord(record.data)
    const type = String(record.type ?? record.category ?? '').toLowerCase()

    if (type.includes('pic') || type.includes('image') || (!type && Object.keys(data).length > 0)) {
      images.push(...collectImageUrls(data))
    }
  }

  return dedupeWeiboImageUrls(images)
}

const getPageInfoImageUrl = (value: unknown): string | undefined => {
  const record = asRecord(value)
  const picInfo = asRecord(record.pic_info)

  for (const candidate of [
    asRecord(record.page_pic).url,
    asRecord(picInfo.pic_big).url,
    asRecord(picInfo.pic_middle).url,
    asRecord(picInfo.pic_small).url
  ]) {
    if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) {
      return candidate
    }
  }

  return undefined
}

const collectPlaybackListUrls = (value: unknown, urls: string[]): void => {
  if (Array.isArray(value)) {
    for (const item of value) collectPlaybackListUrls(item, urls)
    return
  }

  const record = asRecord(value)
  uniquePush(urls, record.url)
  uniquePush(urls, record.play_info?.url)
  uniquePush(urls, record.play_info?.play_url)

  for (const nested of Object.values(record)) {
    if (nested && typeof nested === 'object') {
      collectPlaybackListUrls(nested, urls)
    }
  }
}

const collectWeiboVideo = (pageInfo: unknown): WeiboVideoInfo | undefined => {
  const record = asRecord(pageInfo)
  const mediaInfo = asRecord(record.media_info)
  const urls: string[] = []

  for (const key of [
    'mp4_720p_mp4',
    'mp4_hd_url',
    'mp4_sd_url',
    'stream_url_hd',
    'stream_url',
    'mp4_hd_mp4',
    'mp4_ld_mp4'
  ]) {
    uniquePush(urls, mediaInfo[key])
  }

  collectPlaybackListUrls(mediaInfo.playback_list, urls)
  collectPlaybackListUrls(record.playback_list, urls)
  collectPlaybackListUrls(record.urls, urls)

  if (urls.length === 0) return undefined

  return {
    url: urls[0],
    backupUrls: urls.slice(1),
    cover: getPageInfoImageUrl(record) ?? (
      typeof mediaInfo.kol_title_card?.pic === 'string'
        ? mediaInfo.kol_title_card.pic
        : undefined
    ),
    title: typeof record.page_title === 'string' ? record.page_title : undefined
  }
}

const normalizeRegionName = (value: unknown): string | undefined => {
  const text = String(value ?? '').trim()
  if (!text) return undefined
  return text.replace(/^发布于\s*/u, '').trim() || undefined
}

const buildStatusUrl = (raw: Record<string, any>, fallbackUrl?: string): string => {
  const authorId = String(raw.user?.idstr ?? raw.user?.id ?? '').trim()
  const bid = String(raw.mblogid ?? raw.bid ?? '').trim()
  if (authorId && bid) return `${WEIBO_ORIGIN}/${authorId}/${bid}`
  return fallbackUrl ?? WEIBO_ORIGIN
}

const buildStatusTitle = (raw: Record<string, any>, text: string, repostedStatus?: WeiboStatus): string | undefined => {
  const explicit = String(raw.page_info?.page_title ?? raw.status_title?.text ?? '').trim()
  if (explicit) return explicit

  const firstLine = text.split('\n').find(line => line.trim())
  if (firstLine) return firstLine.slice(0, 60)

  if (repostedStatus?.author.name) {
    return `转发 @${repostedStatus.author.name} 的微博`
  }

  return undefined
}

const looksLikeStatusPayload = (value: Record<string, any>): boolean => {
  return Boolean(
    value.id ??
    value.idstr ??
    value.mid ??
    value.mblogid ??
    value.bid ??
    value.text ??
    value.text_raw ??
    value.longTextContent_raw
  )
}

const unwrapStatusPayload = (value: unknown): Record<string, any> => {
  const record = asRecord(value)
  if (looksLikeStatusPayload(record)) return record

  const nested = asRecord(record.data)
  return looksLikeStatusPayload(nested) ? nested : record
}

const assertWeiboStatusResponse = (value: unknown): void => {
  const record = asRecord(value)
  const ok = typeof record.ok === 'number' ? record.ok : Number(record.ok)

  if (Number.isFinite(ok) && ok < 0) {
    const loginUrl = String(record.url ?? '').trim()
    if (loginUrl.includes('login.php')) {
      throw new Error('微博详情接口要求登录，当前未获取到可用微博 Cookie；请配置微博 Cookie 或开启 guestCookie.weibo 自动获取。')
    }

    throw new Error(`微博详情接口返回异常状态: ok=${ok}`)
  }
}

const normalizeWeiboStatus = (value: unknown, fallbackUrl?: string): WeiboStatus => {
  const record = asRecord(value)
  const repostedStatus = record.retweeted_status ? normalizeWeiboStatus(record.retweeted_status) : undefined
  const text = String(record.longTextContent_raw ?? record.text_raw ?? '').trim() || htmlToText(record.longTextContent ?? record.text)
  const images = dedupeWeiboImageUrls([
    ...collectImageUrls(record.pics),
    ...collectImageUrls(record.pic_infos),
    ...collectMixMediaImageUrls(record.mix_media_info)
  ])
  const video = collectWeiboVideo(record.page_info)

  return {
    id: String(record.idstr ?? record.id ?? ''),
    bid: String(record.mblogid ?? record.bid ?? record.idstr ?? record.id ?? ''),
    title: buildStatusTitle(record, text, repostedStatus),
    text,
    source: typeof record.source === 'string' ? record.source : undefined,
    regionName: normalizeRegionName(record.region_name),
    createdAt: toTimestamp(record.created_at),
    author: normalizeAuthor(record.user),
    images,
    video,
    stats: {
      repost: Number(record.reposts_count) || undefined,
      comment: Number(record.comments_count) || undefined,
      like: Number(record.attitudes_count) || undefined
    },
    repostedStatus
  }
}

const normalizeStatusDetail = (value: unknown, url: string): WeiboDetail => {
  const payload = unwrapStatusPayload(value)
  return {
    type: 'status',
    url: buildStatusUrl(payload, url),
    status: normalizeWeiboStatus(payload, url)
  }
}

const normalizeShowDetail = (value: unknown, url: string, fid: string): WeiboDetail => {
  const record = asRecord(value)
  const videoUrl = String(record.video_url ?? '').trim()
  if (!videoUrl) {
    throw new Error('微博视频号未返回可下载视频地址')
  }

  const detail: WeiboShowDetail = {
    fid,
    title: String(record.title ?? '微博视频'),
    text: String(record.text ?? '').trim(),
    createdAt: toTimestamp(record.real_date),
    author: {
      name: String(record.name ?? '微博用户'),
      avatar: typeof record.avatar === 'string' ? record.avatar : undefined,
      description: typeof record.description === 'string' ? record.description : undefined
    },
    video: {
      url: videoUrl,
      backupUrls: [],
      cover: typeof record.cover_url === 'string' ? record.cover_url : undefined,
      title: typeof record.title === 'string' ? record.title : undefined
    }
  }

  return {
    type: 'video_show',
    url,
    show: detail
  }
}

export const fetchWeiboDetail = async (data: WeiboIdData): Promise<WeiboDetail> => {
  return await retryWithGuestCookieRecovery('weibo', async () => {
    if (data.type === 'status') {
      if (!data.statusId) {
        throw new Error('微博状态 ID 为空，无法解析')
      }

      const options = requestOptions()
      const detailUrl = `${WEIBO_ORIGIN}/ajax/statuses/show`
      const normalizedSourceUrl = normalizeWeiboStatusUrl(data.url || WEIBO_ORIGIN)
      const { response } = await executeSafeAxiosRequest({
        url: detailUrl,
        method: 'GET',
        ...options,
        params: { id: data.statusId },
        headers: {
          ...options.headers,
          ...getWeiboHeaders(detailUrl, WEIBO_ORIGIN),
          Origin: WEIBO_ORIGIN,
          Referer: normalizedSourceUrl
        }
      }, {
        profile: 'weibo-page',
        maxBytes: 2 * 1024 * 1024
      })

      assertWeiboStatusResponse(response.data)
      return normalizeStatusDetail(response.data, normalizedSourceUrl)
    }

    if (data.type === 'video_show') {
      if (!data.fid) {
        throw new Error('微博视频号 fid 为空，无法解析')
      }

      const options = requestOptions()
      const payload = {
        Component_Play_Playinfo: {
          oid: data.fid
        }
      }
      const componentUrl = `https://h5.video.weibo.com/api/component?page=/show/${data.fid}`

      const { response } = await executeSafeAxiosRequest({
        url: componentUrl,
        method: 'POST',
        ...options,
        data: new URLSearchParams({ data: JSON.stringify(payload) }).toString(),
        headers: {
          ...options.headers,
          ...getWeiboHeaders(componentUrl, data.url || `https://h5.video.weibo.com/show/${data.fid}`),
          Referer: data.url || `https://h5.video.weibo.com/show/${data.fid}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }, {
        profile: 'weibo-page',
        maxBytes: 2 * 1024 * 1024
      })

      const component = asRecord(response.data?.data)?.Component_Play_Playinfo ?? asRecord(response.data)?.Component_Play_Playinfo
      return normalizeShowDetail(component, data.url, data.fid)
    }

    throw new Error('暂不支持该微博链接类型')
  }, {
    context: '获取微博详情'
  })
}

export const shouldPrefetchWeiboMedia = (url: string): boolean => {
  return isTrustedWeiboMediaUrl(url)
}
