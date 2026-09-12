/**
 * 抖音作品类型工具模块
 * 提供统一的作品类型判断和处理逻辑
 */

/**
 * 抖音作品主类型
 */
import { normalizeDouyinArticleContent } from './articleContent'

export enum DouyinWorkMainType {
  /** 视频作品 */
  VIDEO = 'video',
  /** 图文作品（包含图集和合辑） */
  IMAGE = 'image',
  /** 文章作品 */
  ARTICLE = 'article',
  /** 直播 */
  LIVE = 'live',
  /** 音乐 */
  MUSIC = 'music',
  /** 未知类型 */
  UNKNOWN = 'unknown'
}

/**
 * 图文作品子类型
 */
export enum DouyinImageSubType {
  /** 图集（纯静态图片或包含 live 图） */
  GALLERY = 'gallery',
  /** 合辑（图片+视频混合） */
  COLLECTION = 'collection'
}

/**
 * 作品类型详细信息
 */
export interface DouyinWorkTypeInfo {
  /** 主类型 */
  mainType: DouyinWorkMainType
  /** 子类型（仅图文作品有） */
  subType?: DouyinImageSubType
  /** 是否为视频 */
  isVideo: boolean
  /** 是否为图文 */
  isImage: boolean
  /** 是否为文章 */
  isArticle: boolean
  /** 是否为直播 */
  isLive: boolean
  /** 是否为图集 */
  isGallery: boolean
  /** 是否为合辑 */
  isCollection: boolean
  /** 模板路径 */
  templatePath: 'douyin/video-work' | 'douyin/image-work' | 'douyin/article-work' | 'douyin/live'
}

type DouyinVideoAddr = {
  uri?: string
  url_list?: string[]
}

type DouyinVideoLike = {
  play_addr_h264?: DouyinVideoAddr
  play_addr?: DouyinVideoAddr
  bit_rate?: Array<{
    play_addr?: DouyinVideoAddr
  }>
}

type DouyinMusicAddr = {
  uri?: string
  url_list?: string[]
}

type DouyinMusicLike = {
  play_url?: DouyinMusicAddr
  playUrl?: {
    uri?: string
    urlList?: string[]
  }
  extra?: string
}

/**
 * 从 URL 路径判断作品类型
 */
export function getWorkTypeFromUrl(url: string): DouyinWorkMainType {
  if (/\/video\//.test(url)) return DouyinWorkMainType.VIDEO
  if (/\/note\//.test(url)) return DouyinWorkMainType.IMAGE
  if (/\/article\//.test(url)) return DouyinWorkMainType.ARTICLE
  if (/live\.douyin\.com/.test(url) || /webcast\.amemv\.com/.test(url)) return DouyinWorkMainType.LIVE
  if (/\/music\//.test(url)) return DouyinWorkMainType.MUSIC
  return DouyinWorkMainType.UNKNOWN
}

/**
 * 从作品数据判断详细类型信息
 */
export function getWorkTypeInfo(data: {
  aweme_type?: number
  media_type?: number
  images?: any[] | null
  video?: any
  is_slides?: boolean
  article_info?: any
  live_data?: any
}): DouyinWorkTypeInfo {
  // 直播类型（有 live_data 对象）
  if (data.live_data) {
    return {
      mainType: DouyinWorkMainType.LIVE,
      isVideo: false,
      isImage: false,
      isArticle: false,
      isLive: true,
      isGallery: false,
      isCollection: false,
      templatePath: 'douyin/live'
    }
  }

  // 文章类型（aweme_type === 163）
  if (data.aweme_type === 163 || data.article_info) {
    return {
      mainType: DouyinWorkMainType.ARTICLE,
      isVideo: false,
      isImage: false,
      isArticle: true,
      isLive: false,
      isGallery: false,
      isCollection: false,
      templatePath: 'douyin/article-work'
    }
  }

  // 图文类型（有 images 数组）
  if (data.images && data.images.length > 0) {
    const subType = data.is_slides === true 
      ? DouyinImageSubType.COLLECTION 
      : DouyinImageSubType.GALLERY

    return {
      mainType: DouyinWorkMainType.IMAGE,
      subType,
      isVideo: false,
      isImage: true,
      isArticle: false,
      isLive: false,
      isGallery: subType === DouyinImageSubType.GALLERY,
      isCollection: subType === DouyinImageSubType.COLLECTION,
      templatePath: 'douyin/image-work'
    }
  }

  // 视频类型（默认）
  return {
    mainType: DouyinWorkMainType.VIDEO,
    isVideo: true,
    isImage: false,
    isArticle: false,
    isLive: false,
    isGallery: false,
    isCollection: false,
    templatePath: 'douyin/video-work'
  }
}

/**
 * 获取作品封面 URL
 */
export function getWorkCoverUrl(
  workTypeInfo: DouyinWorkTypeInfo,
  data: {
    video?: {
      animated_cover?: { url_list: string[] }
      cover_original_scale?: { url_list: string[] }
      cover?: { url_list: string[] }
    }
    images?: Array<{ url_list: string[] }>
    article_info?: {
      article_content?: string
    }
  }
): string {
  // 视频封面
  if (workTypeInfo.isVideo && data.video) {
    return (
      data.video.animated_cover?.url_list[0] ??
      data.video.cover_original_scale?.url_list[0] ??
      data.video.cover?.url_list[0] ??
      ''
    )
  }

  // 图文封面
  if (workTypeInfo.isImage && data.images && data.images.length > 0) {
    return data.images[0].url_list[0] ?? ''
  }

  // 文章封面
  if (workTypeInfo.isArticle) {
    return normalizeDouyinArticleContent(data as Record<string, any>).coverUrl
  }

  return ''
}

/**
 * 获取作品类型的显示名称
 */
export function getWorkTypeDisplayName(workTypeInfo: DouyinWorkTypeInfo): string {
  if (workTypeInfo.isVideo) return '视频'
  if (workTypeInfo.isGallery) return '图集'
  if (workTypeInfo.isCollection) return '合辑'
  if (workTypeInfo.isArticle) return '文章'
  if (workTypeInfo.isLive) return '直播'
  return '未知'
}

/**
 * 判断是否需要特殊处理（如 live 图）
 */
export function needsSpecialImageProcessing(
  workTypeInfo: DouyinWorkTypeInfo,
  images?: Array<{ clip_type?: number }>
): boolean {
  if (!workTypeInfo.isImage || !images) return false
  
  // 检查是否包含 live 图（clip_type !== 2）
  return images.some(item => item.clip_type !== 2 && item.clip_type !== undefined)
}

const ABSOLUTE_URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i
const DOUYIN_WRAPPED_VIDEO_PATH_PATTERN = /^\/aweme\/v1\/playwm?\/?$/i

const toTrimmedString = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : ''
}

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value
    .map(item => toTrimmedString(item))
    .filter(Boolean)
}

const dedupeStrings = (items: string[]): string[] => {
  return Array.from(new Set(items.filter(Boolean)))
}

const isAbsoluteUrl = (value: string): boolean => ABSOLUTE_URL_PATTERN.test(value)

export function isDouyinWrappedVideoUrl (value: unknown): boolean {
  const normalized = toTrimmedString(value)
  if (!normalized || !isAbsoluteUrl(normalized)) return false

  try {
    return DOUYIN_WRAPPED_VIDEO_PATH_PATTERN.test(new URL(normalized).pathname)
  } catch {
    return false
  }
}

export function normalizeDouyinPlayableVideoUrl (value: unknown): string {
  const normalized = toTrimmedString(value)
  if (!normalized || !isAbsoluteUrl(normalized)) return normalized

  try {
    const parsed = new URL(normalized)
    if (!DOUYIN_WRAPPED_VIDEO_PATH_PATTERN.test(parsed.pathname)) {
      return normalized
    }

    const videoId = toTrimmedString(parsed.searchParams.get('video_id'))
    return isAbsoluteUrl(videoId) ? videoId : normalized
  } catch {
    return normalized
  }
}

export function normalizeDouyinPlayableAbsoluteUrl (value: unknown): string {
  const normalized = normalizeDouyinPlayableVideoUrl(value)
  return isAbsoluteUrl(normalized) ? normalized : ''
}

export function normalizeDouyinPlayableMusicUrl (value: unknown): string {
  const normalized = normalizeDouyinPlayableAbsoluteUrl(value)
  if (!normalized) return ''

  try {
    const parsed = new URL(normalized)
    if (/\/obj\/ies-music\/[^/]+\.mp3$/i.test(parsed.pathname) && !parsed.search) {
      parsed.searchParams.set('is_ssr', '1')
    }
    return parsed.toString()
  } catch {
    return normalized
  }
}

const safeParseDouyinMusicExtra = (value: unknown): { original_song_url?: unknown } => {
  if (typeof value !== 'string' || !value.trim()) return {}

  try {
    return JSON.parse(value) as { original_song_url?: unknown }
  } catch {
    return {}
  }
}

export function resolveDouyinPlayableMusicUrls (music?: DouyinMusicLike | null): string[] {
  const extra = safeParseDouyinMusicExtra(music?.extra)

  return dedupeStrings([
    ...toStringArray(music?.play_url?.url_list).map(item => normalizeDouyinPlayableMusicUrl(item)),
    ...toStringArray(music?.playUrl?.urlList).map(item => normalizeDouyinPlayableMusicUrl(item)),
    normalizeDouyinPlayableMusicUrl(extra.original_song_url),
    normalizeDouyinPlayableMusicUrl(music?.play_url?.uri),
    normalizeDouyinPlayableMusicUrl(music?.playUrl?.uri)
  ].filter(Boolean))
}

const normalizeDirectAbsoluteUri = (value: unknown): string => {
  return normalizeDouyinPlayableAbsoluteUrl(value)
}

const prioritizeDirectPlayableUrls = (urls: string[]): string[] => {
  const unique = dedupeStrings(urls)
  const direct = unique.filter(url => !isDouyinWrappedVideoUrl(url))
  const wrapped = unique.filter(url => isDouyinWrappedVideoUrl(url))
  return [...direct, ...wrapped]
}

export function resolveDouyinPlayableVideoUrls (video?: DouyinVideoLike | null): string[] {
  const wrappedUriCandidates = Array.isArray(video?.bit_rate)
    ? video.bit_rate
      .map(item => normalizeDouyinVideoUri(item?.play_addr?.uri))
      .filter(Boolean)
    : []
  const wrappedUrlCandidates = [
    ...wrappedUriCandidates,
    normalizeDouyinVideoUri(video?.play_addr_h264?.uri),
    normalizeDouyinVideoUri(video?.play_addr?.uri)
  ]
    .filter(Boolean)
    .map(uri => buildDouyinWrappedVideoUrl(uri))
  const bitrateUrlCandidates = Array.isArray(video?.bit_rate)
    ? video.bit_rate.flatMap(item => toStringArray(item?.play_addr?.url_list))
    : []
  const directUriCandidates = Array.isArray(video?.bit_rate)
    ? video.bit_rate
      .map(item => normalizeDirectAbsoluteUri(item?.play_addr?.uri))
      .filter(Boolean)
    : []

  const rawCandidates = [
    ...bitrateUrlCandidates,
    ...toStringArray(video?.play_addr_h264?.url_list),
    ...toStringArray(video?.play_addr?.url_list),
    ...directUriCandidates,
    ...wrappedUrlCandidates,
    normalizeDirectAbsoluteUri(video?.play_addr_h264?.uri),
    normalizeDirectAbsoluteUri(video?.play_addr?.uri)
  ]

  return prioritizeDirectPlayableUrls(
    rawCandidates
      .map(candidate => normalizeDouyinPlayableVideoUrl(candidate))
      .filter(Boolean)
  )
}

/**
 * 获取抖音视频可下载地址。
 * 优先使用接口直接返回的签名直链，缺失时再回退 aweme 包装链接。
 */
export function getDouyinPlayableVideoUrl (video?: {
  bit_rate?: Array<{ play_addr?: { uri?: string, url_list?: string[] } }>
  play_addr_h264?: { uri?: string, url_list?: string[] }
  play_addr?: { uri?: string, url_list?: string[] }
} | null): string {
  const directUrl = resolveDouyinPlayableVideoUrls(video)[0]

  if (directUrl) return directUrl

  const bitrateUri = Array.isArray(video?.bit_rate)
    ? video.bit_rate
      .map(item => normalizeDouyinVideoUri(item?.play_addr?.uri))
      .find(Boolean)
    : ''
  const uri = bitrateUri ||
    normalizeDouyinVideoUri(video?.play_addr_h264?.uri) ||
    normalizeDouyinVideoUri(video?.play_addr?.uri)
  return uri ? buildDouyinWrappedVideoUrl(uri) : ''
}

export function normalizeDouyinVideoUri (value: unknown): string {
  if (typeof value !== 'string') return ''

  const normalized = value.trim()
  if (!normalized) return ''
  if (ABSOLUTE_URL_PATTERN.test(normalized)) return ''
  if (/[/\\?&#=\s]/.test(normalized)) return ''

  return normalized
}

const buildDouyinWrappedVideoUrl = (uri: string): string =>
  `https://aweme.snssdk.com/aweme/v1/play/?video_id=${uri}&ratio=1080p&line=0`

export function getDouyinShareableVideoUrl (video?: {
  play_addr_h264?: { uri?: string, url_list?: string[] }
  play_addr?: { uri?: string, url_list?: string[] }
} | null): string {
  const uri = normalizeDouyinVideoUri(video?.play_addr_h264?.uri) ||
    normalizeDouyinVideoUri(video?.play_addr?.uri)

  if (uri) return buildDouyinWrappedVideoUrl(uri)

  return getDouyinPlayableVideoUrl(video)
}
