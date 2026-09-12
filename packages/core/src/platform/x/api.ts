import axios from 'node-karin/axios'

import { baseHeaders } from '@/module'

import type { XAuthor, XDetail, XIdData, XStatus, XStatusStats, XVideoInfo } from './types'
import { buildXConfiguredRequestOptions } from './request'

const EASYCOMMENT_API = 'https://easycomment.ai/api/twitter/v1/free/get-tweet-detail'
const FALLBACK_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'

type TimelineEntry = {
  content?: {
    __typename?: string
    itemContent?: {
      __typename?: string
      tweet_results?: {
        result?: unknown
      }
    }
  }
}

type UnwrappedTweet = {
  tweet: Record<string, any>
  sensitive: boolean
}

const toNumber = (value: unknown): number | undefined => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const toTrimmedString = (value: unknown): string => {
  return String(value ?? '').trim()
}

const getDisplayText = (legacy: Record<string, any>): string => {
  const fullText = String(legacy.full_text ?? '')
  const displayRange = Array.isArray(legacy.display_text_range) ? legacy.display_text_range : []
  const start = Number(displayRange[0] ?? 0)
  const end = Number(displayRange[1] ?? fullText.length)
  const sliced = fullText.slice(Number.isFinite(start) ? start : 0, Number.isFinite(end) ? end : fullText.length)
  return sliced.trim()
}

const parseCreatedAt = (value: unknown): number | undefined => {
  const createdAt = toTrimmedString(value)
  if (!createdAt) return undefined
  const timestamp = Date.parse(createdAt)
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : undefined
}

const normalizeImageUrl = (value: unknown): string => {
  const url = toTrimmedString(value)
  if (!url) return ''
  return url.endsWith(':orig') ? url : `${url}:orig`
}

const pickBestVideo = (media: Record<string, any>): XVideoInfo | undefined => {
  const variants = Array.isArray(media.video_info?.variants) ? media.video_info.variants : []
  const candidates: Array<{ bitrate: number, url: string }> = variants
    .filter((variant: Record<string, any>) => variant?.content_type === 'video/mp4' && toTrimmedString(variant.url))
    .map((variant: Record<string, any>) => ({
      bitrate: toNumber(variant.bitrate) ?? 0,
      url: toTrimmedString(variant.url)
    }))
    .sort((left: { bitrate: number }, right: { bitrate: number }) => right.bitrate - left.bitrate)

  if (candidates.length === 0) return undefined

  return {
    url: candidates[0].url,
    backupUrls: candidates.slice(1).map((item: { url: string }) => item.url),
    cover: toTrimmedString(media.media_url_https) || undefined,
    duration: Math.floor((toNumber(media.video_info?.duration_millis) ?? 0) / 1000)
  }
}

const parseAuthor = (tweet: Record<string, any>): XAuthor => {
  const user = tweet.core?.user_results?.result ?? {}
  return {
    name: toTrimmedString(user.core?.name) || toTrimmedString(user.legacy?.name) || '未知作者',
    screenName: toTrimmedString(user.core?.screen_name) || 'unknown',
    avatar: toTrimmedString(user.avatar?.image_url) || undefined,
    description: toTrimmedString(user.legacy?.description) || undefined
  }
}

const unwrapTweetResult = (result: unknown): UnwrappedTweet | null => {
  if (!result || typeof result !== 'object') return null
  const record = result as Record<string, any>

  if (record.__typename === 'TweetWithVisibilityResults' && record.tweet && typeof record.tweet === 'object') {
    const sensitive = Boolean(
      record.tweet?.legacy?.possibly_sensitive
      || record.mediaVisibilityResults?.blurred_image_interstitial?.title?.text
    )

    return {
      tweet: record.tweet,
      sensitive
    }
  }

  if ((record.__typename === 'Tweet' || record.rest_id) && record.core && record.legacy) {
    return {
      tweet: record,
      sensitive: Boolean(record.legacy?.possibly_sensitive)
    }
  }

  return null
}

const getTweetRestId = (result: unknown): string => {
  return unwrapTweetResult(result)?.tweet.rest_id ? String(unwrapTweetResult(result)?.tweet.rest_id) : ''
}

const collectTimelineTweets = (instructions: Array<Record<string, any>>): Map<string, unknown> => {
  const tweetMap = new Map<string, unknown>()

  for (const instruction of instructions) {
    const entries = Array.isArray(instruction?.entries) ? instruction.entries as TimelineEntry[] : []
    for (const entry of entries) {
      const content = entry.content
      if (content?.__typename !== 'TimelineTimelineItem' || content.itemContent?.__typename !== 'TimelineTweet') continue

      const result = content.itemContent?.tweet_results?.result
      const restId = getTweetRestId(result)
      if (!restId) continue
      tweetMap.set(restId, result)
    }
  }

  return tweetMap
}

const parseStatusStats = (tweet: Record<string, any>): XStatusStats => {
  const legacy = tweet.legacy ?? {}
  return {
    view: toNumber(tweet.views?.count),
    like: toNumber(legacy.favorite_count),
    comment: toNumber(legacy.reply_count),
    bookmark: toNumber(legacy.bookmark_count),
    share: (toNumber(legacy.quote_count) ?? 0) + (toNumber(legacy.retweet_count) ?? 0)
  }
}

const parseStatus = (
  result: unknown,
  tweetMap: Map<string, unknown>,
  stack = new Set<string>()
): XStatus => {
  const unwrapped = unwrapTweetResult(result)
  if (!unwrapped) {
    throw new Error('X 推文数据结构无效')
  }

  const tweet = unwrapped.tweet
  const statusId = toTrimmedString(tweet.rest_id)
  if (!statusId) {
    throw new Error('X 推文缺少 rest_id')
  }

  if (stack.has(statusId)) {
    throw new Error(`X 推文引用链存在循环：${statusId}`)
  }

  const nextStack = new Set(stack)
  nextStack.add(statusId)

  const legacy = tweet.legacy ?? {}
  const mediaList = Array.isArray(legacy.extended_entities?.media) ? legacy.extended_entities.media : []
  const images = mediaList
    .filter((media: Record<string, any>) => media?.type === 'photo')
    .map((media: Record<string, any>) => normalizeImageUrl(media.media_url_https))
    .filter(Boolean)

  const video = mediaList
    .map((media: Record<string, any>) => pickBestVideo(media))
    .find(Boolean)

  let quotedResult = tweet.quoted_status_result?.result
  if (!quotedResult) {
    const parentId = toTrimmedString(legacy.in_reply_to_status_id_str) || toTrimmedString(legacy.conversation_id_str)
    if (parentId && parentId !== statusId) {
      quotedResult = tweetMap.get(parentId)
    }
  }

  const retweetedResult = tweet.retweeted_status_result?.result

  return {
    id: statusId,
    text: getDisplayText(legacy),
    sensitive: unwrapped.sensitive,
    createdAt: parseCreatedAt(legacy.created_at),
    author: parseAuthor(tweet),
    images,
    video,
    stats: parseStatusStats(tweet),
    quotedStatus: quotedResult ? parseStatus(quotedResult, tweetMap, nextStack) : undefined,
    retweetedStatus: retweetedResult ? parseStatus(retweetedResult, tweetMap, nextStack) : undefined
  }
}

const buildRequestOptions = () => {
  const requestOptions = buildXConfiguredRequestOptions({
    userAgentFallback: FALLBACK_USER_AGENT
  })

  return {
    ...requestOptions,
    headers: {
      ...baseHeaders,
      ...requestOptions.headers,
      Host: 'easycomment.ai',
      'Content-Type': 'application/json'
    }
  }
}

export const fetchXDetail = async (idData: XIdData): Promise<XDetail> => {
  if (idData.type !== 'status' || !idData.statusId) {
    throw new Error('暂不支持解析该 X 链接')
  }

  const response = await axios.post(EASYCOMMENT_API, { pid: idData.statusId }, buildRequestOptions())
  const payload = response.data

  if (payload?.code !== 100000) {
    throw new Error(`X 详情接口返回异常：${JSON.stringify(payload)}`)
  }

  const instructions = payload?.data?.data?.threaded_conversation_with_injections_v2?.instructions
  if (!Array.isArray(instructions)) {
    throw new Error('X 详情接口未返回推文时间线')
  }

  const tweetMap = collectTimelineTweets(instructions)
  const rootResult = tweetMap.get(idData.statusId)
  if (!rootResult) {
    throw new Error(`未找到推文 ${idData.statusId} 的详情`)
  }

  return {
    type: 'status',
    url: idData.url,
    status: parseStatus(rootResult, tweetMap)
  }
}
