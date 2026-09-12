import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { logger } from 'node-karin'

import { Common } from '@/module/utils/Common'
import { baseHeaders } from '@/module/utils/Network'
import { Config } from '@/module/utils/Config'
import type { ParsedPost } from '@/platform/parsedPost'
import { resolveParsedPostFromResolvedLink } from '@/platform/resolveParsedPost'
import { getBilibiliID } from '@/platform/bilibili/getID'
import { getDouyinID } from '@/platform/douyin/getID'
import { getGithubID } from '@/platform/github/getID'
import { getHeyboxID } from '@/platform/heybox/getID'
import { getKuaishouID } from '@/platform/kuaishou/getID'
import { getTiebaID } from '@/platform/tieba/getID'
import { getTikTokID } from '@/platform/tiktok/getID'
import { getWechatID } from '@/platform/wechat/getID'
import { getWeiboID } from '@/platform/weibo/getID'
import { getXID } from '@/platform/x/getID'
import { getXiaohongshuID } from '@/platform/xiaohongshu/getID'
import { getZhihuID } from '@/platform/zhihu/getID'
import { fetchBilibiliSubtitleReferences } from '@/module/summaryParse/bilibiliSubtitles'
import {
  resolveBilibiliVideoAid,
  resolveBilibiliVideoCid
} from '@/module/summaryParse/bilibiliVideoIdentity'

import type { SummaryResolvedLink } from './types'

const parsedPostCacheVersion = 'summary-parse-parsed-post-cache-v2'

const normalizePrimitive = (value: unknown): string | number | boolean | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return value
  return String(value)
}

const normalizeStructuredValue = (
  value: unknown,
  depth = 0,
  ancestors: object[] = []
): unknown => {
  if (depth >= 8) {
    return normalizePrimitive(value)
  }

  if (value === null || value === undefined) return null

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return normalizePrimitive(value)
  }

  if (Array.isArray(value)) {
    return value.map(item => normalizeStructuredValue(item, depth + 1, ancestors))
  }

  if (typeof value === 'object') {
    if (ancestors.includes(value)) return '[circular]'

    if (value instanceof Date) {
      return value.toISOString()
    }

    const nextAncestors = [...ancestors, value]
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nestedValue]) => typeof nestedValue !== 'function' && typeof nestedValue !== 'symbol')
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, normalizeStructuredValue(nestedValue, depth + 1, nextAncestors)])
    )
  }

  return normalizePrimitive(value)
}

const stableStringify = (value: unknown): string => JSON.stringify(normalizeStructuredValue(value))

const buildCacheHash = (payload: unknown): string => {
  return createHash('sha1')
    .update(parsedPostCacheVersion)
    .update(stableStringify(payload))
    .digest('hex')
}

const buildCachePath = (cacheKey: string): string => {
  return path.join(Common.tempDri.cache.parsedPost, `summary_parse_parsed_post_cache_${cacheKey}.json`)
}

const normalizeBilibiliIdData = (value: Record<string, unknown>): Record<string, unknown> => {
  if (value.type !== 'one_video') {
    return normalizeStructuredValue(value) as Record<string, unknown>
  }

  const page = Number(value.p ?? 1)
  return normalizeStructuredValue({
    ...value,
    p: Number.isFinite(page) && page > 1 ? page : 1
  }) as Record<string, unknown>
}

const isRealtimeIdData = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false
  return String((value as Record<string, unknown>).type ?? '').trim() === 'live_room_detail'
}

const shouldSkipParsedPostCache = (parsedPost: ParsedPost): boolean => {
  if (parsedPost.platform !== 'bilibili') return false
  const detail = parsedPost.raw?.detail as { data?: { item?: { type?: string } }, item?: { type?: string } } | undefined
  const dynamicType = String(detail?.data?.item?.type ?? detail?.item?.type ?? '').trim()
  return dynamicType === 'DYNAMIC_TYPE_LIVE_RCMD'
}

const normalizeCacheIdentityPayload = async (
  link: SummaryResolvedLink
): Promise<Record<string, unknown> | null> => {
  switch (link.platform) {
    case 'bilibili': {
      const idData = await getBilibiliID(link.url)
      if (isRealtimeIdData(idData)) return null
      return {
        platform: link.platform,
        idData: normalizeBilibiliIdData(idData as Record<string, unknown>)
      }
    }
    case 'douyin': {
      const idData = await getDouyinID({} as any, link.url, false)
      if (isRealtimeIdData(idData)) return null
      return {
        platform: link.platform,
        idData: normalizeStructuredValue({
          type: idData.type,
          aweme_id: idData.aweme_id ?? null,
          room_id: idData.room_id ?? null,
          sec_uid: idData.sec_uid ?? null,
          music_id: idData.music_id ?? null
        })
      }
    }
    case 'tiktok': {
      const idData = await getTikTokID(link.url, false)
      if (!idData.item_id) return null
      return {
        platform: link.platform,
        idData: normalizeStructuredValue({
          type: idData.type,
          item_id: idData.item_id
        })
      }
    }
    case 'kuaishou': {
      const idData = await getKuaishouID(link.url, false)
      if (!idData.photoId) return null
      return {
        platform: link.platform,
        idData: normalizeStructuredValue({
          type: idData.type,
          photoId: idData.photoId
        })
      }
    }
    case 'xiaohongshu': {
      const idData = await getXiaohongshuID(link.url, false)
      if (idData.type !== 'note' || !idData.note_id) return null
      return {
        platform: link.platform,
        idData: normalizeStructuredValue({
          type: idData.type,
          note_id: idData.note_id
        })
      }
    }
    case 'heybox': {
      const idData = await getHeyboxID(link.url, false)
      if (!idData.link_id) return null
      return {
        platform: link.platform,
        idData: normalizeStructuredValue({
          type: idData.type,
          link_id: idData.link_id
        })
      }
    }
    case 'github': {
      const idData = await getGithubID(link.url, false)
      if (idData.type === 'unknown' || !idData.owner || !idData.repo) return null
      return {
        platform: link.platform,
        idData: normalizeStructuredValue({
          type: idData.type,
          owner: idData.owner,
          repo: idData.repo,
          branch: idData.branch ?? null
        })
      }
    }
    case 'x': {
      const idData = await getXID(link.url, false)
      if (idData.type === 'unknown' || !idData.statusId) return null
      return {
        platform: link.platform,
        idData: normalizeStructuredValue({
          type: idData.type,
          statusId: idData.statusId
        })
      }
    }
    case 'zhihu': {
      const idData = await getZhihuID(link.url, false)
      if (idData.type === 'unknown') return null
      return {
        platform: link.platform,
        idData: normalizeStructuredValue({
          type: idData.type,
          questionId: 'questionId' in idData ? idData.questionId ?? null : null,
          answerId: 'answerId' in idData ? idData.answerId ?? null : null,
          articleId: 'articleId' in idData ? idData.articleId ?? null : null,
          videoId: 'videoId' in idData ? idData.videoId ?? null : null
        })
      }
    }
    case 'tieba': {
      const idData = await getTiebaID(link.url, false)
      if (idData.type === 'unknown' || !idData.tid) return null
      return {
        platform: link.platform,
        idData: normalizeStructuredValue({
          type: idData.type,
          tid: idData.tid,
          pid: idData.pid ?? null
        })
      }
    }
    case 'wechat': {
      const idData = await getWechatID(link.url)
      return {
        platform: link.platform,
        idData: normalizeStructuredValue({
          articleId: idData.articleId ?? null,
          canonicalUrl: idData.articleId ? null : idData.url
        })
      }
    }
    case 'weibo': {
      const idData = await getWeiboID(link.url, false)
      if (idData.type === 'unknown') return null
      return {
        platform: link.platform,
        idData: normalizeStructuredValue({
          type: idData.type,
          statusId: 'statusId' in idData ? idData.statusId ?? null : null,
          fid: 'fid' in idData ? idData.fid ?? null : null
        })
      }
    }
    default:
      return null
  }
}

const sanitizeParsedPostForCache = (parsedPost: ParsedPost): ParsedPost => {
  return normalizeStructuredValue(parsedPost) as ParsedPost
}

const cloneParsedPost = (parsedPost: ParsedPost): ParsedPost => {
  return normalizeStructuredValue(parsedPost) as ParsedPost
}

const shouldBackfillBilibiliSubtitles = (parsedPost: ParsedPost): boolean => {
  if (parsedPost.platform !== 'bilibili' || parsedPost.subtype !== 'video') return false
  return !parsedPost.videos.some(video => video.subtitles?.some(subtitle => subtitle.source === 'bilibili'))
}

const refreshCachedBilibiliSubtitles = async (parsedPost: ParsedPost): Promise<ParsedPost> => {
  if (!shouldBackfillBilibiliSubtitles(parsedPost)) return parsedPost

  const idData = parsedPost.raw?.idData
  if (!idData || typeof idData !== 'object') return parsedPost

  const bvid = String((idData as Record<string, unknown>).bvid ?? '').trim()
  if (!bvid) return parsedPost

  const primaryVideo = parsedPost.primaryVideo
  const durationSeconds = primaryVideo?.durationSeconds
  const aid = resolveBilibiliVideoAid({
    idData,
    detail: parsedPost.raw?.detail
  })
  const cid = resolveBilibiliVideoCid({
    idData,
    detail: parsedPost.raw?.detail
  })
  if (!cid) return parsedPost

  try {
    const subtitles = await fetchBilibiliSubtitleReferences({
      aid,
      bvid,
      cid,
      headers: {
        ...baseHeaders,
        Cookie: Config.cookies.bilibili,
        Referer: 'https://www.bilibili.com'
      }
    })

    if (subtitles.length === 0) {
      return parsedPost
    }

    const next = cloneParsedPost(parsedPost)
    next.videos = next.videos.map((video, videoIndex) => {
      if (videoIndex !== 0 && video !== next.primaryVideo) {
        return video
      }
      return {
        ...video,
        subtitles
      }
    })
    if (next.primaryVideo) {
      next.primaryVideo = {
        ...next.primaryVideo,
        subtitles
      }
    }
    next.raw = {
      ...next.raw,
      videos: next.videos
    }
    if (durationSeconds && next.primaryVideo) {
      next.primaryVideo.durationSeconds = durationSeconds
    }
    return next
  } catch (error) {
    logger.debug(`[SummaryParse] B站缓存字幕引用刷新失败，保留旧缓存：${error instanceof Error ? error.message : String(error)}`)
    return parsedPost
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

const isNullable = (value: unknown): boolean => value === undefined || value === null

const isOptionalString = (value: unknown): boolean => isNullable(value) || typeof value === 'string'

const isStringArray = (value: unknown): boolean => {
  return isNullable(value) || (Array.isArray(value) && value.every(item => typeof item === 'string'))
}

const isOptionalNumber = (value: unknown): boolean => isNullable(value) || typeof value === 'number'

const isOptionalRecord = (value: unknown): boolean => isNullable(value) || isPlainObject(value)

const isParsedPostAuthorLike = (value: unknown): boolean => {
  if (isNullable(value)) return true
  if (!isPlainObject(value)) return false
  return typeof value.name === 'string' &&
    isOptionalString(value.id) &&
    isOptionalString(value.avatar) &&
    isOptionalString(value.description) &&
    isOptionalString(value.screenName) &&
    isOptionalString(value.location)
}

const isParsedPostSubtitleLike = (value: unknown): boolean => {
  if (!isPlainObject(value)) return false
  return isOptionalString(value.source) &&
    isOptionalString(value.language) &&
    isOptionalString(value.label) &&
    isOptionalString(value.text) &&
    isOptionalString(value.url) &&
    isOptionalRecord(value.headers)
}

const isParsedPostVideoLike = (value: unknown): boolean => {
  if (!isPlainObject(value)) return false
  return typeof value.url === 'string' &&
    isOptionalString(value.title) &&
    isOptionalString(value.cover) &&
    isStringArray(value.backupUrls) &&
    isOptionalString(value.audioUrl) &&
    isStringArray(value.audioBackupUrls) &&
    (isNullable(value.asrSourceType) || value.asrSourceType === 'audio' || value.asrSourceType === 'video') &&
    isOptionalString(value.asrSourceUrl) &&
    isStringArray(value.asrSourceBackupUrls) &&
    isOptionalNumber(value.durationSeconds) &&
    (isNullable(value.subtitles) || (Array.isArray(value.subtitles) && value.subtitles.every(isParsedPostSubtitleLike))) &&
    isOptionalRecord(value.headers)
}

const isParsedPostImageLike = (value: unknown): boolean => {
  if (!isPlainObject(value)) return false
  return typeof value.url === 'string' && isOptionalString(value.alt)
}

const isParsedPostStatsLike = (value: unknown): boolean => {
  if (!isPlainObject(value)) return false
  return typeof value.label === 'string' && typeof value.value === 'string'
}

const isParsedPostBlockLike = (value: unknown): boolean => {
  if (!isPlainObject(value) || typeof value.type !== 'string') return false

  switch (value.type) {
    case 'text':
      return typeof value.text === 'string'
    case 'html':
      return typeof value.html === 'string' && isOptionalString(value.text)
    case 'image':
      return isParsedPostImageLike(value)
    case 'video':
      return isParsedPostVideoLike(value)
    default:
      return false
  }
}

const isParsedPostLike = (value: unknown): value is ParsedPost => {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Record<string, unknown>

  return typeof candidate.platform === 'string' &&
    typeof candidate.platformLabel === 'string' &&
    typeof candidate.subtype === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.url === 'string' &&
    isOptionalString(candidate.summary) &&
    isParsedPostAuthorLike(candidate.author) &&
    Array.isArray(candidate.contentBlocks) &&
    candidate.contentBlocks.every(isParsedPostBlockLike) &&
    Array.isArray(candidate.images) &&
    candidate.images.every(isParsedPostImageLike) &&
    Array.isArray(candidate.videos) &&
    candidate.videos.every(isParsedPostVideoLike) &&
    (isNullable(candidate.primaryVideo) || isParsedPostVideoLike(candidate.primaryVideo)) &&
    Array.isArray(candidate.stats) &&
    candidate.stats.every(isParsedPostStatsLike) &&
    Array.isArray(candidate.meta) &&
    candidate.meta.every(isParsedPostStatsLike) &&
    candidate.raw !== null &&
    typeof candidate.raw === 'object'
}

export const resolveParsedPostCacheKey = async (
  link: SummaryResolvedLink
): Promise<string | null> => {
  try {
    const payload = await normalizeCacheIdentityPayload(link)
    if (!payload) return null
    return buildCacheHash(payload)
  } catch (error) {
    logger.debug(`[SummaryParse] 链接级解析缓存 key 生成失败，已回退直解析：${link.platform} ${link.url} ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

export const readCachedParsedPost = (
  cacheKey: string
): ParsedPost | null => {
  const cachePath = buildCachePath(cacheKey)
  if (!fs.existsSync(cachePath)) return null

  try {
    const raw = String(fs.readFileSync(cachePath, 'utf8') ?? '').trim()
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!isParsedPostLike(parsed)) {
      logger.warn('[SummaryParse] 链接级解析缓存结构无效，已忽略')
      return null
    }
    return parsed
  } catch (error) {
    logger.warn(`[SummaryParse] 链接级解析缓存读取失败，已忽略：${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

export const writeCachedParsedPost = (
  cacheKey: string,
  parsedPost: ParsedPost
): void => {
  const cachePath = buildCachePath(cacheKey)

  try {
    fs.writeFileSync(
      cachePath,
      JSON.stringify(sanitizeParsedPostForCache(parsedPost)),
      'utf8'
    )
  } catch (error) {
    logger.warn(`[SummaryParse] 链接级解析缓存写入失败，已忽略：${error instanceof Error ? error.message : String(error)}`)
  }
}

export const resolveParsedPostWithCache = async (
  link: SummaryResolvedLink
): Promise<{ parsedPost: ParsedPost; cacheHit: boolean }> => {
  const cacheKey = await resolveParsedPostCacheKey(link)
  if (!cacheKey) {
    const parsedPost = await resolveParsedPostFromResolvedLink(link)
    return {
      parsedPost,
      cacheHit: false
    }
  }

  const cached = readCachedParsedPost(cacheKey)
  if (cached) {
    const refreshed = await refreshCachedBilibiliSubtitles(cached)
    if (refreshed !== cached) writeCachedParsedPost(cacheKey, refreshed)
    return {
      parsedPost: refreshed,
      cacheHit: true
    }
  }

  const parsedPost = await resolveParsedPostFromResolvedLink(link)
  if (!shouldSkipParsedPostCache(parsedPost)) {
    writeCachedParsedPost(cacheKey, parsedPost)
  }

  return {
    parsedPost,
    cacheHit: false
  }
}
