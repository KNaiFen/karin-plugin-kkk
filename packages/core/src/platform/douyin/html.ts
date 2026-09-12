import type {
  ArticleWork,
  DyImageAlbumWork,
  DySlidesWork,
  DyVideoWork,
  Result
} from '@ikenxuan/amagi'

import { parseDouyinArticleContentValue } from './articleContent'
import type { DouyinIdData } from './getID'
import {
  normalizeDouyinVideoUri,
  resolveDouyinPlayableMusicUrls,
  resolveDouyinPlayableVideoUrls
} from './workType'

export type DouyinWorkDetail = DyVideoWork | DyImageAlbumWork | DySlidesWork | (DyImageAlbumWork & ArticleWork)
export type DouyinWorkResult = Result<DouyinWorkDetail>

export type DouyinResolvedTypeHint = 'video' | 'article' | 'note' | 'slides'

export type DouyinHtmlComment = {
  text: string
  images: string[]
  createTime: number
  diggCount: number
  replyCount: number
  user: {
    nickname: string
    avatar: string
    ipLabel?: string
  }
}

export type DouyinHtmlImage = {
  urlList: string[]
  downloadUrlList: string[]
  width: number
  height: number
  clipType: number
  video?: {
    uri?: string
    playUrl: string
    backupUrls: string[]
    coverUrl: string
    duration: number
    width: number
    height: number
    ratio: string
  }
}

export type DouyinHtmlVideo = {
  uri?: string
  playUrl: string
  backupUrls: string[]
  coverUrl: string
  dynamicCoverUrl: string
  duration: number
  width: number
  height: number
  ratio: string
  fps: number
}

export type DouyinHtmlArticle = {
  title: string
  markdown: string
  images: Array<{ url: string }>
}

export type DouyinHtmlWork = {
  awemeId: string
  subtype: 'video' | 'article' | 'image'
  shareUrl: string
  title: string
  desc: string
  previewTitle: string
  createTime: number
  isSlides: boolean
  author: {
    nickname: string
    avatar: string
    secUid: string
    uniqueId: string
    shortId: string
    followerCount: number
    followingCount: number
    totalFavorited: number
  }
  stats: {
    diggCount: number
    commentCount: number
    collectCount: number
    shareCount: number
    playCount: number
    recommendCount: number
  }
  images: DouyinHtmlImage[]
  video?: DouyinHtmlVideo
  music?: {
    author: string
    title: string
    playUrl: string
    backupUrls: string[]
    coverUrl: string
    extra: string
  }
  comments: DouyinHtmlComment[]
  textExtra: Array<string | { hashtag_name?: string }>
  article?: DouyinHtmlArticle
  raw: {
    source: 'router' | 'pace' | 'detail'
    payload: unknown
  }
}

export const DOUYIN_VERIFY_PAGE_PATTERN = /安全验证|滑块验证|请完成验证|验证后继续访问|验证码/
export const DOUYIN_ANTI_BOT_HTML_PATTERN = /byted_acrawler|__ac_signature|window\.location\.reload\(\)/

const pickFirstString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

const toNumber = (value: unknown): number => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

const dedupe = <T> (items: T[]): T[] => {
  return Array.from(new Set(items))
}

const normalizeRatio = (width: number, height: number, ratio?: unknown): string => {
  if (typeof ratio === 'string' && ratio.trim()) return ratio.trim()
  if (width > 0 && height > 0) return `${width}:${height}`
  return ''
}

const buildImageResource = (url: string, width: number, height: number) => ({
  uri: url,
  url_list: url ? [url] : [],
  width,
  height
})

const buildVideoPlayAddr = (
  primaryUrl: string,
  backupUrls: string[],
  width: number,
  height: number,
  dataSize: number = 0,
  uri = ''
) => {
  const urls = dedupe([primaryUrl, ...backupUrls].filter(Boolean))
  return {
    uri: normalizeDouyinVideoUri(uri),
    url_list: urls,
    width,
    height,
    data_size: dataSize,
    file_cs: '',
    file_hash: '',
    url_key: ''
  }
}

const extractBalancedSegment = (
  source: string,
  startIndex: number,
  openChar: string,
  closeChar: string
): string | null => {
  if (startIndex < 0 || source[startIndex] !== openChar) return null

  let depth = 0
  let inString = false
  let stringChar = ''
  let escaped = false

  for (let index = startIndex; index < source.length; index++) {
    const char = source[index]

    if (escaped) {
      escaped = false
      continue
    }

    if (inString) {
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === stringChar) {
        inString = false
        stringChar = ''
      }
      continue
    }

    if (char === '"' || char === '\'') {
      inString = true
      stringChar = char
      continue
    }

    if (char === openChar) {
      depth++
    } else if (char === closeChar) {
      depth--
      if (depth === 0) {
        return source.slice(startIndex, index + 1)
      }
    }
  }

  return null
}

const extractAssignedObject = (html: string, marker: string): string | null => {
  const markerIndex = html.indexOf(marker)
  if (markerIndex < 0) return null

  const objectStart = html.indexOf('{', markerIndex + marker.length)
  return extractBalancedSegment(html, objectStart, '{', '}')
}

const tryParseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const findPacePayloadObject = (value: unknown): Record<string, any> | null => {
  if (!value) return null

  if (typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, any>
    if (typeof record.awemeId === 'string' && record.aweme) {
      return record
    }

    for (const nested of Object.values(record)) {
      const resolved = findPacePayloadObject(nested)
      if (resolved) return resolved
    }
    return null
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = findPacePayloadObject(item)
      if (resolved) return resolved
    }
    return null
  }

  if (typeof value === 'string' && value.includes('awemeId') && value.includes('"aweme"')) {
    const objectMarker = value.indexOf('{"awemeId"')
    if (objectMarker >= 0) {
      const objectText = extractBalancedSegment(value, objectMarker, '{', '}')
      if (!objectText) return null

      const direct = tryParseJson(objectText)
      if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
        return direct as Record<string, any>
      }

      const repairedText = objectText
        .replace(/\\"/g, '"')
        .replace(/\\\\u/g, '\\u')
        .replace(/\\\\\//g, '\\/')

      const repaired = tryParseJson(repairedText)
      if (repaired && typeof repaired === 'object' && !Array.isArray(repaired)) {
        return repaired as Record<string, any>
      }
    }
  }

  return null
}

const extractPacePayload = (html: string): Record<string, any> | null => {
  const marker = 'self.__pace_f.push('
  let searchIndex = 0

  while (searchIndex >= 0 && searchIndex < html.length) {
    const markerIndex = html.indexOf(marker, searchIndex)
    if (markerIndex < 0) return null

    const argsStart = html.indexOf('(', markerIndex)
    const args = extractBalancedSegment(html, argsStart, '(', ')')
    if (args) {
      const parsed = tryParseJson(args.slice(1, -1))
      const payload = findPacePayloadObject(parsed)
      if (payload) return payload
    }

    searchIndex = markerIndex + marker.length
  }

  return null
}

const pickRouterPage = (loaderData: Record<string, any>): Record<string, any> | null => {
  const keys = Object.keys(loaderData)
  const preferredKeys = keys.filter(key => /(?:video|article|note)_\(id\)\/page/.test(key))

  for (const key of [...preferredKeys, ...keys]) {
    const page = loaderData[key]
    const item = page?.videoInfoRes?.item_list?.[0] ?? page?.aweme_detail
    if (item?.aweme_id) return page
  }

  return null
}

const normalizeTextExtra = (value: unknown): Array<string | { hashtag_name?: string }> => {
  if (!Array.isArray(value)) return []

  return value.reduce<Array<string | { hashtag_name?: string }>>((items, item) => {
    if (typeof item === 'string') {
      items.push(item)
      return items
    }
    if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).hashtag_name === 'string') {
      items.push({ hashtag_name: String((item as Record<string, unknown>).hashtag_name) })
    }
    return items
  }, [])
}

const normalizeAuthor = (value: Record<string, any> | undefined, fallback?: Record<string, any>) => ({
  nickname: pickFirstString(value?.nickname, fallback?.nickname, '未知作者'),
  avatar: pickFirstString(
    value?.avatar_thumb?.url_list?.[0],
    value?.avatar_medium?.url_list?.[0],
    fallback?.avatarUri,
    fallback?.avatar_thumb?.url_list?.[0]
  ),
  secUid: pickFirstString(value?.sec_uid, fallback?.uid),
  uniqueId: pickFirstString(value?.unique_id),
  shortId: pickFirstString(value?.short_id),
  followerCount: toNumber(value?.follower_count),
  followingCount: toNumber(value?.following_count),
  totalFavorited: toNumber(value?.total_favorited)
})

const normalizeStats = (value: Record<string, any> | undefined, fallback?: Record<string, any>) => ({
  diggCount: toNumber(value?.digg_count ?? fallback?.diggCount),
  commentCount: toNumber(value?.comment_count ?? fallback?.commentCount),
  collectCount: toNumber(value?.collect_count ?? fallback?.collectCount),
  shareCount: toNumber(value?.share_count ?? fallback?.shareCount),
  playCount: toNumber(value?.play_count),
  recommendCount: toNumber(value?.recommend_count)
})

const normalizeRouterComments = (value: unknown): DouyinHtmlComment[] => {
  if (!Array.isArray(value)) return []

  return value.map((item: any) => ({
    text: pickFirstString(item?.text),
    images: Array.isArray(item?.image_list)
      ? item.image_list
        .map((image: any) => pickFirstString(
          image?.origin_url?.url_list?.[0],
          image?.origin_url?.url_list?.[1],
          image?.origin_url?.url_list?.[2],
          image?.origin_url?.url_list?.[3]
        ))
        .filter(Boolean)
      : [],
    createTime: toNumber(item?.createTime ?? item?.create_time),
    diggCount: toNumber(item?.digg_count),
    replyCount: toNumber(item?.reply_comment_total),
    user: {
      nickname: pickFirstString(item?.user?.nickname, '匿名用户'),
      avatar: pickFirstString(
        item?.user?.avatar_thumb?.url_list?.[0],
        item?.user?.avatar_medium?.url_list?.[0]
      ),
      ipLabel: pickFirstString(item?.ip_label)
    }
  }))
}

const normalizePaceComments = (value: unknown): DouyinHtmlComment[] => {
  if (!Array.isArray(value)) return []

  return value.map((item: any) => ({
    text: pickFirstString(item?.text),
    images: Array.isArray(item?.imageList)
      ? item.imageList
        .map((image: any) => pickFirstString(image?.originUrl?.urlList?.[0]))
        .filter(Boolean)
      : [],
    createTime: toNumber(item?.createTime),
    diggCount: toNumber(item?.diggCount),
    replyCount: toNumber(item?.replyTotal),
    user: {
      nickname: pickFirstString(item?.user?.nickname, '匿名用户'),
      avatar: pickFirstString(item?.user?.avatarUri),
      ipLabel: pickFirstString(item?.ipLabel)
    }
  }))
}

const normalizeRouterImages = (value: unknown): DouyinHtmlImage[] => {
  if (!Array.isArray(value)) return []

  return value
    .map((item: any) => {
      const urlList = toStringArray(item?.url_list)
      const downloadUrlList = toStringArray(item?.download_url_list)
      const width = toNumber(item?.width)
      const height = toNumber(item?.height)
      const clipType = toNumber(item?.clip_type) || 2
      const playableUrls = resolveDouyinPlayableVideoUrls(item?.video)
      const videoUrl = playableUrls[0] ?? ''
      const backupUrls = playableUrls.slice(1)

      return {
        urlList,
        downloadUrlList: downloadUrlList.length > 0 ? downloadUrlList : urlList,
        width,
        height,
        clipType,
        ...(videoUrl
          ? {
            video: {
              uri: normalizeDouyinVideoUri(item?.video?.play_addr_h264?.uri) ||
                  normalizeDouyinVideoUri(item?.video?.play_addr?.uri),
              playUrl: videoUrl,
              backupUrls,
              coverUrl: pickFirstString(urlList[0]),
              duration: toNumber(item?.video?.duration),
              width: toNumber(item?.video?.width ?? item?.video?.play_addr?.width),
              height: toNumber(item?.video?.height ?? item?.video?.play_addr?.height),
              ratio: normalizeRatio(
                toNumber(item?.video?.width ?? item?.video?.play_addr?.width),
                toNumber(item?.video?.height ?? item?.video?.play_addr?.height),
                item?.video?.ratio
              )
            }
          }
          : {})
      }
    })
    .filter(item => item.urlList.length > 0)
}

const normalizePaceImages = (value: unknown): DouyinHtmlImage[] => {
  if (!Array.isArray(value)) return []

  return value
    .map((item: any) => {
      const urlList = toStringArray(item?.urlList)
      const livePhotoType = item?.livePhotoType === 1 || item?.livePhotoType === '1'
      const videoUrl = pickFirstString(item?.video?.playAddr?.[0]?.src)
      const backupUrls = Array.isArray(item?.video?.playAddr)
        ? item.video.playAddr
          .map((entry: any) => pickFirstString(entry?.src))
          .filter((entry: string) => Boolean(entry))
          .slice(videoUrl ? 1 : 0)
        : []

      return {
        urlList,
        downloadUrlList: urlList,
        width: 0,
        height: 0,
        clipType: livePhotoType ? 5 : 2,
        ...(videoUrl
          ? {
            video: {
              playUrl: videoUrl,
              backupUrls,
              coverUrl: pickFirstString(item?.video?.cover, urlList[0]),
              duration: toNumber(item?.video?.duration),
              width: 0,
              height: 0,
              ratio: ''
            }
          }
          : {})
      }
    })
    .filter(item => item.urlList.length > 0)
}

const normalizeVideo = (value: Record<string, any> | undefined, fallbackImages: DouyinHtmlImage[] = []): DouyinHtmlVideo | undefined => {
  if (!value) return undefined

  const primaryBitrate = Array.isArray(value.bit_rate) ? value.bit_rate[0] : undefined
  const playableUrls = resolveDouyinPlayableVideoUrls(value)
  const primaryUrl = playableUrls[0] ?? ''
  const backupUrls = playableUrls.slice(1)
  const uri = normalizeDouyinVideoUri(primaryBitrate?.play_addr?.uri) ||
    normalizeDouyinVideoUri(value.play_addr_h264?.uri) ||
    normalizeDouyinVideoUri(value.play_addr?.uri)

  const coverUrl = pickFirstString(
    value.origin_cover?.url_list?.[0],
    value.cover_original_scale?.url_list?.[0],
    value.cover?.url_list?.[0],
    value.dynamic_cover?.url_list?.[0],
    value.animated_cover?.url_list?.[0],
    fallbackImages[0]?.urlList?.[0]
  )

  const width = toNumber(value.width ?? primaryBitrate?.play_addr?.width ?? value.play_addr?.width)
  const height = toNumber(value.height ?? primaryBitrate?.play_addr?.height ?? value.play_addr?.height)
  const ratio = normalizeRatio(width, height, value.ratio)

  if (!primaryUrl && !coverUrl) return undefined

  return {
    uri,
    playUrl: primaryUrl,
    backupUrls,
    coverUrl,
    dynamicCoverUrl: pickFirstString(
      value.animated_cover?.url_list?.[0],
      value.dynamic_cover?.url_list?.[0],
      value.cover?.url_list?.[0],
      coverUrl
    ),
    duration: toNumber(value.duration),
    width,
    height,
    ratio,
    fps: toNumber(primaryBitrate?.FPS)
  }
}

const normalizeMusic = (value: Record<string, any> | undefined) => {
  if (!value) return undefined

  const extra = typeof value.extra === 'string' ? value.extra : ''
  const musicCandidates = resolveDouyinPlayableMusicUrls(value)
  const [playUrl = '', ...backupUrls] = musicCandidates
  const author = pickFirstString(value.author)
  const title = pickFirstString(value.title)

  const coverUrl = pickFirstString(
    value.cover_hd?.url_list?.[0],
    value.cover_large?.url_list?.[0],
    value.coverHd?.urlList?.[0],
    value.coverLarge?.urlList?.[0]
  )

  if (!playUrl && !extra && !author && !title && !coverUrl) return undefined

  return {
    author,
    title,
    playUrl,
    backupUrls,
    coverUrl,
    extra
  }
}

const appendDouyinArticleSourceAwemeId = (value: string, awemeId: string): string => {
  if (!value || !awemeId) return value

  try {
    const parsed = new URL(value)
    if (!/\/obj\/tos-cn-ve-2774\//i.test(parsed.pathname)) {
      return value
    }

    if (!parsed.searchParams.has('__vid')) {
      parsed.searchParams.set('__vid', awemeId)
    }

    return parsed.toString()
  } catch {
    return value
  }
}

const inferSubtype = (
  item: Record<string, any>,
  images: DouyinHtmlImage[],
  context: { url?: string, typeHint?: DouyinResolvedTypeHint } = {}
): 'video' | 'article' | 'image' => {
  if (toNumber(item.aweme_type) === 163 || item.article_info) return 'article'
  const shareUrl = pickFirstString(item.share_url, context.url)
  const isNoteLikeRoute = context.typeHint === 'note' ||
    context.typeHint === 'slides' ||
    /\/(?:share\/)?note\//i.test(shareUrl)

  if (images.length > 0 && isNoteLikeRoute) return 'image'
  if (images.length > 0 && !item.video?.bit_rate?.length && !item.video?.play_addr?.url_list?.length) return 'image'
  return 'video'
}

const buildRouterArticle = (
  item: Record<string, any>,
  images: DouyinHtmlImage[]
): DouyinHtmlArticle | undefined => {
  const parsedArticleContent = parseDouyinArticleContentValue(item.article_info?.article_content)
  const title = pickFirstString(item.article_info?.article_title, item.preview_title, item.desc)
  const markdown = pickFirstString(parsedArticleContent.markdownOrText, item.desc)
  const articleInfoImages = (() => {
    const raw = item.article_info?.fe_data
    if (typeof raw !== 'string' || !raw.trim()) return []

    try {
      const parsed = JSON.parse(raw) as {
        image_list?: Array<Record<string, unknown>>
        head_poster_list?: { url_list?: unknown[] }
        pre_cover?: unknown
      }
      const images = (parsed.image_list ?? [])
        .map(image => pickFirstString(
          image?.url,
          Array.isArray(image?.url_list) ? image.url_list[0] : '',
          Array.isArray(image?.download_url_list) ? image.download_url_list[0] : ''
        ))
        .filter(Boolean)
        .map(url => ({ url }))
      if (images.length > 0) return images

      return [
        pickFirstString(
          parsed?.head_poster_list?.url_list?.[0],
          parsed?.pre_cover,
          parsedArticleContent.headPosterUrl
        )
      ]
        .filter(Boolean)
        .map(url => ({ url }))
    } catch {
      return parsedArticleContent.headPosterUrl ? [{ url: parsedArticleContent.headPosterUrl }] : []
    }
  })()
  const htmlImages = (articleInfoImages.length > 0 ? articleInfoImages : images
    .map(image => pickFirstString(image.urlList[0]))
    .filter(Boolean)
    .map(url => ({ url })))

  if (!title && !markdown && htmlImages.length === 0) return undefined

  return {
    title,
    markdown,
    images: htmlImages
  }
}

export const buildDouyinHtmlWorkFromAwemeDetail = (
  item: Record<string, any>,
  context: { url?: string, awemeId?: string, typeHint?: DouyinResolvedTypeHint } = {},
  options: {
    comments?: DouyinHtmlComment[]
    rawSource?: DouyinHtmlWork['raw']['source']
    rawPayload?: unknown
  } = {}
): DouyinHtmlWork | null => {
  const awemeId = pickFirstString(item?.aweme_id, context.awemeId)
  if (!awemeId) return null

  const images = normalizeRouterImages(item.images)
  const subtype = inferSubtype(item, images, context)
  const video = normalizeVideo(item.video, images)
  const article = subtype === 'article' ? buildRouterArticle(item, images) : undefined
  const title = pickFirstString(
    article?.title,
    item.preview_title,
    item.desc,
    `抖音_${awemeId}`
  )
  const desc = pickFirstString(item.desc, item.preview_title, article?.markdown)
  const previewTitle = pickFirstString(item.preview_title, title, desc)
  const shareUrl = pickFirstString(
    item.share_url,
    context.url,
    `https://www.douyin.com/${subtype === 'image' ? 'note' : subtype}/${awemeId}`
  )
  const music = normalizeMusic(item.music)
  if (subtype === 'article' && music?.playUrl) {
    music.playUrl = appendDouyinArticleSourceAwemeId(music.playUrl, awemeId)
    music.backupUrls = music.backupUrls.map(url => appendDouyinArticleSourceAwemeId(url, awemeId))
  }

  return {
    awemeId,
    subtype,
    shareUrl,
    title,
    desc,
    previewTitle,
    createTime: toNumber(item.create_time ?? item.createTime),
    isSlides: item.is_slides === true,
    author: normalizeAuthor(item.author),
    stats: normalizeStats(item.statistics),
    images,
    ...(video ? { video } : {}),
    ...(music ? { music } : {}),
    comments: options.comments ?? [],
    textExtra: normalizeTextExtra(item.text_extra),
    ...(article ? { article } : {}),
    raw: {
      source: options.rawSource ?? 'detail',
      payload: options.rawPayload ?? item
    }
  }
}

const parseRouterHtmlWork = (
  html: string,
  context: { url?: string, awemeId?: string }
): DouyinHtmlWork | null => {
  const raw = extractAssignedObject(html, 'window._ROUTER_DATA')
  if (!raw) return null

  const routerData = tryParseJson(raw) as Record<string, any> | null
  const loaderData = routerData?.loaderData
  if (!loaderData || typeof loaderData !== 'object') return null

  const page = pickRouterPage(loaderData)
  const item = page?.videoInfoRes?.item_list?.[0] ?? page?.aweme_detail
  return buildDouyinHtmlWorkFromAwemeDetail(item, context, {
    comments: normalizeRouterComments(page?.commentListData?.comments),
    rawSource: 'router',
    rawPayload: page
  })
}

const parsePaceHtmlWork = (
  html: string,
  context: { url?: string, awemeId?: string }
): DouyinHtmlWork | null => {
  const payload = extractPacePayload(html)
  if (!payload?.aweme || !payload?.awemeId) return null

  const detail = payload.aweme.detail ?? {}
  const stats = payload.aweme.stats ?? detail.stats ?? {}
  const images = normalizePaceImages(detail.images)
  const desc = pickFirstString(detail.desc, `抖音_${payload.awemeId}`)
  const title = desc
  const previewTitle = desc
  const shareUrl = pickFirstString(
    context.url,
    `https://www.douyin.com/note/${payload.awemeId}`
  )

  const music = normalizeMusic(payload.aweme.music ?? detail.music)

  return {
    awemeId: String(payload.awemeId),
    subtype: 'image',
    shareUrl,
    title,
    desc,
    previewTitle,
    createTime: toNumber(detail.createTime),
    isSlides: false,
    author: normalizeAuthor(undefined, detail.authorInfo),
    stats: normalizeStats(undefined, stats),
    images,
    ...(music ? { music } : {}),
    comments: normalizePaceComments(payload.comment?.comments),
    textExtra: [],
    article: undefined,
    raw: {
      source: 'pace',
      payload
    }
  }
}

const normalizeHtmlMediaUrl = (value: string): string => {
  const decoded = value
    .replace(/&amp;/gi, '&')
    .replace(/&#0*38;/gi, '&')
    .replace(/&#x0*26;/gi, '&')

  try {
    const parsed = new URL(decoded)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.toString()
      : ''
  } catch {
    return ''
  }
}

const extractDouyinMusicUrlFromHtml = (html: string): string => {
  const audioMatch = html.match(
    /<audio\b[^>]*\ssrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i
  )
  const audioUrl = normalizeHtmlMediaUrl(pickFirstString(
    audioMatch?.[1],
    audioMatch?.[2],
    audioMatch?.[3]
  ))
  if (audioUrl) return audioUrl

  const legacyMatch = html.match(
    /https?:\/\/[^"'\s<>]+\/obj\/ies-music\/[^"'\s<>]+\.mp3(?:\?[^"'\s<>]*)?/i
  )
  return normalizeHtmlMediaUrl(pickFirstString(legacyMatch?.[0]))
}

export const parseDouyinHtmlWork = (
  html: string,
  context: { url?: string, awemeId?: string, typeHint?: DouyinResolvedTypeHint } = {}
): DouyinHtmlWork => {
  const tryOrder = context.typeHint === 'note' ? ['pace', 'router'] as const : ['router', 'pace'] as const
  const musicUrlFromHtml = extractDouyinMusicUrlFromHtml(html)
  const sourceUrlFromHtml = (() => {
    const match = html.match(/<source[^>]+src=["'](https?:\/\/[^"']+)["']/i)
    return pickFirstString(match?.[1])
  })()
  const normalizeComparableUrl = (value: string): string => {
    try {
      const parsed = new URL(value)
      parsed.search = ''
      parsed.hash = ''
      return parsed.toString()
    } catch {
      return value
    }
  }

  for (const source of tryOrder) {
    const result = source === 'router'
      ? parseRouterHtmlWork(html, context)
      : parsePaceHtmlWork(html, context)
    if (result) {
      if (musicUrlFromHtml) {
        const backupUrls = [
          pickFirstString(result.music?.playUrl),
          ...(result.music?.backupUrls ?? [])
        ].filter(url => url && url !== musicUrlFromHtml)
        result.music = {
          author: result.music?.author ?? '',
          title: result.music?.title ?? '',
          playUrl: musicUrlFromHtml,
          backupUrls,
          coverUrl: result.music?.coverUrl ?? '',
          extra: result.music?.extra ?? ''
        }
      } else if (result.subtype === 'article' && sourceUrlFromHtml) {
        const currentPlayUrl = pickFirstString(result.music?.playUrl)
        if (!currentPlayUrl || normalizeComparableUrl(currentPlayUrl) === normalizeComparableUrl(sourceUrlFromHtml)) {
          const backupUrls = [
            currentPlayUrl,
            ...(result.music?.backupUrls ?? [])
          ].filter(url => url && url !== sourceUrlFromHtml)
          result.music = {
            author: result.music?.author ?? '',
            title: result.music?.title ?? '',
            playUrl: sourceUrlFromHtml,
            backupUrls,
            coverUrl: result.music?.coverUrl ?? '',
            extra: result.music?.extra ?? ''
          }
        }
      }
      return result
    }
  }

  if (DOUYIN_VERIFY_PAGE_PATTERN.test(html)) {
    throw new Error('抖音分享页未返回可解析数据，疑似风控/验证')
  }

  if (DOUYIN_ANTI_BOT_HTML_PATTERN.test(html)) {
    throw new Error('抖音分享页返回反爬重载页')
  }

  throw new Error('抖音分享页未返回可解析数据')
}

export const getDouyinTypeHintFromUrl = (url?: string): DouyinResolvedTypeHint | undefined => {
  if (!url) return undefined
  if (/\/(?:share\/)?article\/\d+/i.test(url)) return 'article'
  if (/\/(?:share\/)?note\/\d+/i.test(url)) return 'note'
  if (/\/(?:share\/)?slides\/\d+/i.test(url)) return 'slides'
  if (/\/(?:share\/)?video\/\d+/i.test(url)) return 'video'
  return undefined
}

export const buildDouyinWorkCandidateUrls = (
  idData: { aweme_id?: string, resolvedUrl?: string, typeHint?: DouyinIdData['typeHint'] }
): string[] => {
  const awemeId = String(idData.aweme_id ?? '').trim()
  if (!awemeId) return []

  const urls = [
    idData.typeHint === 'video' ? `https://m.douyin.com/share/video/${awemeId}` : '',
    idData.typeHint === 'article' ? `https://m.douyin.com/share/article/${awemeId}` : '',
    idData.typeHint === 'note' || idData.typeHint === 'slides' ? `https://m.douyin.com/share/note/${awemeId}` : '',
    idData.typeHint === 'video' ? `https://www.iesdouyin.com/share/video/${awemeId}` : '',
    idData.typeHint === 'article' ? `https://www.iesdouyin.com/share/article/${awemeId}` : '',
    idData.typeHint === 'note' || idData.typeHint === 'slides' ? `https://www.iesdouyin.com/share/note/${awemeId}` : '',
    idData.resolvedUrl,
    `https://m.douyin.com/share/video/${awemeId}`,
    `https://m.douyin.com/share/article/${awemeId}`,
    `https://m.douyin.com/share/note/${awemeId}`,
    `https://www.iesdouyin.com/share/video/${awemeId}`,
    `https://www.iesdouyin.com/share/article/${awemeId}`,
    `https://www.iesdouyin.com/share/note/${awemeId}`,
    `https://www.douyin.com/note/${awemeId}`,
    `https://www.douyin.com/video/${awemeId}`,
    `https://www.douyin.com/article/${awemeId}`
  ]

  return dedupe(urls.filter((item): item is string => typeof item === 'string' && item.trim().length > 0))
}

const buildPseudoArticleInfo = (work: DouyinHtmlWork) => ({
  article_title: pickFirstString(work.article?.title, work.title, work.previewTitle),
  article_content: JSON.stringify({
    markdown: pickFirstString(work.article?.markdown, work.desc, work.title)
  }),
  fe_data: JSON.stringify({
    image_list: (work.article?.images ?? work.images.map(image => ({ url: pickFirstString(image.urlList[0]) })))
      .filter(item => item.url)
  })
})

export const buildDouyinWorkResultFromHtmlWork = (work: DouyinHtmlWork): DouyinWorkResult => {
  const coverSource = pickFirstString(
    work.video?.coverUrl,
    work.video?.dynamicCoverUrl,
    work.images[0]?.urlList?.[0]
  )
  const coverWidth = toNumber(work.video?.width ?? work.images[0]?.width)
  const coverHeight = toNumber(work.video?.height ?? work.images[0]?.height)
  const videoPlayAddr = buildVideoPlayAddr(
    pickFirstString(work.video?.playUrl),
    work.video?.backupUrls ?? [],
    toNumber(work.video?.width),
    toNumber(work.video?.height),
    0,
    work.video?.uri
  )
  const videoCover = buildImageResource(coverSource, coverWidth, coverHeight)
  const awemeType = work.subtype === 'article' ? 163 : work.subtype === 'video' ? 0 : 68
  const articleInfo = work.subtype === 'article' ? buildPseudoArticleInfo(work) : undefined

  const awemeDetail: Record<string, any> = {
    aweme_id: work.awemeId,
    aweme_type: awemeType,
    desc: work.desc,
    preview_title: work.previewTitle || work.title || work.desc,
    share_url: work.shareUrl,
    create_time: work.createTime,
    is_slides: work.isSlides,
    region: '',
    author: {
      nickname: work.author.nickname,
      sec_uid: work.author.secUid,
      unique_id: work.author.uniqueId,
      short_id: work.author.shortId,
      follower_count: work.author.followerCount,
      following_count: work.author.followingCount,
      total_favorited: work.author.totalFavorited,
      avatar_thumb: {
        uri: work.author.avatar,
        url_list: work.author.avatar ? [work.author.avatar] : [],
        width: 0,
        height: 0
      }
    },
    statistics: {
      aweme_id: work.awemeId,
      play_count: work.stats.playCount,
      digg_count: work.stats.diggCount,
      comment_count: work.stats.commentCount,
      collect_count: work.stats.collectCount,
      share_count: work.stats.shareCount,
      recommend_count: work.stats.recommendCount
    },
    text_extra: work.textExtra,
    suggest_words: {
      suggest_words: []
    },
    music: work.music
      ? {
        author: work.music.author,
        title: work.music.title,
        extra: work.music.extra,
        play_url: {
          uri: work.music.playUrl,
          url_list: work.music.playUrl ? [work.music.playUrl, ...(work.music.backupUrls ?? [])] : [],
          url_key: '',
          width: 0,
          height: 0
        },
        cover_hd: buildImageResource(work.music.coverUrl, 0, 0),
        cover_large: buildImageResource(work.music.coverUrl, 0, 0)
      }
      : null,
    video: {
      duration: toNumber(work.video?.duration),
      width: toNumber(work.video?.width),
      height: toNumber(work.video?.height),
      ratio: pickFirstString(work.video?.ratio),
      bit_rate: work.video?.playUrl
        ? [{
          format: 'mp4',
          FPS: toNumber(work.video?.fps),
          gear_name: 'html_primary',
          HDR_bit: '',
          HDR_type: '',
          is_bytevc1: 0,
          is_h265: 0,
          quality_type: 0,
          video_extra: '',
          play_addr: videoPlayAddr
        }]
        : [],
      play_addr: videoPlayAddr,
      play_addr_h264: videoPlayAddr,
      cover: videoCover,
      cover_original_scale: videoCover,
      origin_cover: videoCover,
      animated_cover: buildImageResource(
        pickFirstString(work.video?.dynamicCoverUrl, coverSource),
        coverWidth,
        coverHeight
      ),
      dynamic_cover: buildImageResource(
        pickFirstString(work.video?.dynamicCoverUrl, coverSource),
        coverWidth,
        coverHeight
      )
    },
    images: work.images.length > 0
      ? work.images.map((image) => {
        const primaryUrl = pickFirstString(image.urlList[0])
        const primaryVideoUrl = pickFirstString(image.video?.playUrl)
        const imageVideoAddr = buildVideoPlayAddr(
          primaryVideoUrl,
          image.video?.backupUrls ?? [],
          toNumber(image.video?.width),
          toNumber(image.video?.height),
          0,
          image.video?.uri
        )

        return {
          url_list: image.urlList,
          download_url_list: image.downloadUrlList,
          width: image.width,
          height: image.height,
          clip_type: image.clipType,
          ...(image.video
            ? {
              video: {
                duration: image.video.duration,
                width: image.video.width,
                height: image.video.height,
                ratio: image.video.ratio,
                play_addr: imageVideoAddr,
                play_addr_h264: imageVideoAddr,
                cover: buildImageResource(
                  pickFirstString(image.video.coverUrl, primaryUrl),
                  image.video.width,
                  image.video.height
                )
              }
            }
            : {})
        }
      })
      : null
  }

  if (articleInfo) {
    awemeDetail.article_info = articleInfo
  }

  return {
    success: true,
    code: 200,
    message: '获取成功',
    data: {
      status_code: 0,
      log_pb: {
        impr_id: ''
      },
      aweme_detail: awemeDetail
    } as DouyinWorkDetail,
    error: undefined as never
  } as unknown as DouyinWorkResult
}

const mergeNested = (baseValue: any, enrichmentValue: any) => {
  if (baseValue === null || baseValue === undefined || baseValue === '') return enrichmentValue
  if (Array.isArray(baseValue)) return baseValue.length > 0 ? baseValue : enrichmentValue
  if (typeof baseValue !== 'object') return baseValue
  if (!enrichmentValue || typeof enrichmentValue !== 'object') return baseValue

  const merged: Record<string, any> = { ...enrichmentValue }
  for (const [key, value] of Object.entries(baseValue)) {
    merged[key] = mergeNested(value, enrichmentValue[key])
  }
  return merged
}

export const mergeDouyinWorkResults = (
  base: DouyinWorkResult,
  enrichment?: DouyinWorkResult | null
): DouyinWorkResult => {
  if (!enrichment?.data?.aweme_detail) return base

  const mergedAweme = mergeNested(base.data.aweme_detail, enrichment.data.aweme_detail)
  const baseArticleInfo = (base.data.aweme_detail as Record<string, any>)?.article_info
  const enrichmentArticleInfo = (enrichment.data.aweme_detail as Record<string, any>)?.article_info

  if (baseArticleInfo || enrichmentArticleInfo) {
    mergedAweme.article_info = {
      ...baseArticleInfo,
      ...enrichmentArticleInfo,
      article_title: pickFirstString(
        baseArticleInfo?.article_title,
        enrichmentArticleInfo?.article_title
      ),
      article_content: pickFirstString(
        enrichmentArticleInfo?.article_content,
        baseArticleInfo?.article_content
      ),
      fe_data: pickFirstString(
        enrichmentArticleInfo?.fe_data,
        baseArticleInfo?.fe_data
      )
    }
  }

  return {
    ...base,
    message: enrichment.message || base.message,
    data: {
      ...enrichment.data,
      ...base.data,
      aweme_detail: mergedAweme
    } as DouyinWorkDetail
  } as unknown as DouyinWorkResult
}
