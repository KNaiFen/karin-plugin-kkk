import { logger } from 'node-karin'

import { baseHeaders } from '@/module'
import type { DouyinWorkResult } from '@/module/utils'
import { amagiClient } from '@/module/utils/amagiClient'
import { Config } from '@/module/utils/Config'
import { recordFailureTraceStep } from '@/module/utils/ErrorTrace'
import { fetchDouyinOneWork, getDouyinID } from '@/platform/douyin'
import { normalizeDouyinArticleContent } from '@/platform/douyin/articleContent'
import { getDouyinPlayableVideoUrl, resolveDouyinPlayableVideoUrls } from '@/platform/douyin/workType'
import {
  buildDouyinLiveInfoHeaders,
  fetchDouyinLiveDataFromReflow,
  fetchDouyinLiveReflowInfo,
  fetchDouyinLiveWebEnterInfo,
  getDouyinLiveContainer,
  getDouyinLiveItem,
  isDouyinLiveStatusActive,
  selectDouyinLiveStream
} from '@/platform/douyin/liveRecorder'
import type { ParsedPost } from '@/platform/parsedPost'

import {
  buildAuthor,
  buildParsedPost,
  buildVideo,
  createHeaders,
  imageBlocks,
  normalizeTitle,
  textBlock,
  toMeta,
  toStats
} from '../shared'

const pickDouyinAsrVideoCandidate = (
  aweme: DouyinWorkResult['data']['aweme_detail']
): {
    url: string
    backupUrls: string[]
  } | null => {
  type DouyinAsrCandidate = {
    size: number
    urls: string[]
  }

  const candidates: DouyinAsrCandidate[] = (aweme.video?.bit_rate ?? [])
    .filter((item: NonNullable<typeof aweme.video>['bit_rate'][number]) => item?.format !== 'dash' && item?.play_addr?.url_list?.length)
    .map((item: NonNullable<typeof aweme.video>['bit_rate'][number]) => ({
      size: Number(item.play_addr?.data_size ?? Number.MAX_SAFE_INTEGER),
      urls: resolveDouyinPlayableVideoUrls({
        play_addr: item.play_addr
      })
    }))
    .filter((item: DouyinAsrCandidate) => item.urls.length > 0)
    .sort((left: DouyinAsrCandidate, right: DouyinAsrCandidate) => left.size - right.size)

  const selected = candidates[0]
  if (!selected) return null

  return {
    url: selected.urls[0],
    backupUrls: selected.urls.slice(1)
  }
}

const getDouyinLiveFirstUrl = (value: any): string => value?.url_list?.[0] || ''

const getDouyinLiveAvatarUrl = (user: any, owner: any): string => {
  return getDouyinLiveFirstUrl(user?.avatar_larger) ||
    getDouyinLiveFirstUrl(user?.avatar_large) ||
    getDouyinLiveFirstUrl(user?.avatar_thumb) ||
    getDouyinLiveFirstUrl(owner?.avatar_larger) ||
    getDouyinLiveFirstUrl(owner?.avatar_large) ||
    getDouyinLiveFirstUrl(owner?.avatar_thumb)
}

const resolveDouyinLiveRoomIds = async (idData: Awaited<ReturnType<typeof getDouyinID>>) => {
  const directRoomId = typeof idData.room_id === 'string' ? idData.room_id.trim() : ''
  const isWebcastReflow = idData.source === 'webcast_reflow'
  let roomId = directRoomId
  let webRid = isWebcastReflow ? '' : directRoomId
  let user: any
  let roomData: any

  if (idData.sec_uid && !directRoomId) {
    const userInfo = await amagiClient.douyin.fetcher.fetchUserProfile({
      sec_uid: idData.sec_uid,
      typeMode: 'strict'
    })
    user = userInfo.data.user

    if (user?.room_data) {
      try {
        roomData = JSON.parse(user.room_data)
      } catch (error) {
        logger.warn(`[Douyin] 直播间 room_data 解析失败: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    webRid = String(roomData?.owner?.web_rid ?? user?.room_id_str ?? '').trim()
    roomId = String(user?.room_id_str ?? webRid).trim()
  }

  return {
    directRoomId,
    isWebcastReflow,
    roomId,
    webRid,
    user
  }
}

const fetchDouyinLiveParsedPostData = async (
  idData: Awaited<ReturnType<typeof getDouyinID>>
): Promise<{ liveData: any, roomId: string, webRid: string, user?: any }> => {
  const liveIds = await resolveDouyinLiveRoomIds(idData)
  const headers = buildDouyinLiveInfoHeaders({
    userAgent: String((baseHeaders as Record<string, unknown> | undefined)?.['User-Agent'] ?? ''),
    cookie: Config.cookies.douyin
  })

  if (!liveIds.roomId || (!liveIds.webRid && !liveIds.isWebcastReflow)) {
    throw new Error('未获取到直播间信息')
  }

  let liveData: any
  if (liveIds.isWebcastReflow) {
    liveData = await fetchDouyinLiveDataFromReflow({
      roomId: liveIds.roomId,
      headers,
      onFreshFetchError: (error, resolvedWebRid) => {
        logger.warn(`[Douyin] reflow 直播间实时接口失败，使用 room_id 兜底数据: web_rid=${resolvedWebRid}, ${error instanceof Error ? error.message : String(error)}`)
      }
    })
  } else {
    try {
      liveData = await fetchDouyinLiveWebEnterInfo(liveIds.roomId, liveIds.webRid, headers)
    } catch (error) {
      logger.warn(`[Douyin] 直播间实时接口失败，尝试 Amagi 接口: ${error instanceof Error ? error.message : String(error)}`)
      try {
        liveData = await amagiClient.douyin.fetcher.fetchLiveRoomInfo({
          room_id: liveIds.roomId,
          web_rid: liveIds.webRid,
          typeMode: 'strict'
        })
      } catch (amagiError) {
        logger.warn(`[Douyin] 直播间详情接口失败，尝试 room_id reflow 兜底: ${amagiError instanceof Error ? amagiError.message : String(amagiError)}`)
        liveData = await fetchDouyinLiveReflowInfo(liveIds.roomId, headers)
      }
    }
  }

  const liveItem = getDouyinLiveItem(liveData)
  const liveContainer = getDouyinLiveContainer(liveData)
  const owner: any = liveItem?.owner ?? {}
  const user = liveIds.user ?? liveContainer?.user ?? owner
  const roomId = liveIds.roomId || String(liveItem?.id_str ?? liveItem?.id ?? '').trim()
  const webRid = liveIds.webRid || String(owner?.web_rid ?? liveItem?.web_rid ?? '').trim()

  return {
    liveData,
    roomId,
    webRid,
    user
  }
}

const resolveDouyinLiveParsedPost = async (
  url: string,
  idData: Awaited<ReturnType<typeof getDouyinID>>
): Promise<ParsedPost> => {
  const { liveData, roomId, webRid, user } = await fetchDouyinLiveParsedPostData(idData)
  const liveItem: any = getDouyinLiveItem(liveData)
  if (!liveItem) {
    throw new Error('未获取到直播间信息')
  }
  if (!isDouyinLiveStatusActive(liveItem)) {
    throw new Error(`「${user?.nickname || liveItem?.owner?.nickname || '该用户'}」未开播，正在休息中~`)
  }

  const owner = liveItem.owner ?? {}
  const title = normalizeTitle(liveItem.title ?? liveItem.room?.title, '抖音直播间')
  const cover = getDouyinLiveFirstUrl(liveItem.cover) ||
    getDouyinLiveFirstUrl(liveItem.cover_dynamic_map?.origin) ||
    getDouyinLiveFirstUrl(liveItem?.background?.url_list)
  const avatar = getDouyinLiveAvatarUrl(user, owner)
  const displayRoomId = webRid || roomId
  const selectedStream = selectDouyinLiveStream(liveItem, Config.douyin?.liveQuality ?? 'auto')
  const primaryVideo = selectedStream?.url
    ? buildVideo(selectedStream.url, {
        title,
        cover,
        headers: createHeaders({
          ...baseHeaders,
          Referer: 'https://live.douyin.com'
        })
      })
    : null

  return buildParsedPost({
    platform: 'douyin',
    platformLabel: '抖音',
    subtype: 'live',
    title,
    author: buildAuthor(String(user?.nickname || owner?.nickname || '抖音主播'), {
      avatar
    }),
    summary: String(liveItem?.title ?? '').trim() || '抖音直播间',
    url: `https://live.douyin.com/${displayRoomId || roomId}`,
    contentBlocks: textBlock(String(liveItem?.title ?? '').trim()),
    images: cover ? [{ url: cover }] : [],
    videos: primaryVideo ? [primaryVideo] : [],
    primaryVideo: primaryVideo ?? undefined,
    stats: toStats([
      ['在线', liveItem?.stats?.total_user_str ?? liveItem?.user_count_str ?? liveItem?.room_view_stats?.display_value],
      ['状态', liveItem?.status ?? liveItem?.room_status]
    ]),
    meta: toMeta([
      ['房间号', displayRoomId || roomId],
      ['主播昵称', user?.nickname || owner?.nickname]
    ]),
    raw: {
      accentColor: '#161823',
      detail: liveData,
      idData
    }
  })
}

export const resolveDouyinParsedPost = async (url: string): Promise<ParsedPost> => {
  recordFailureTraceStep('douyin.parsed-post.resolve.start', {
    url
  })
  const idData = await getDouyinID({} as any, url, false)
  recordFailureTraceStep('douyin.parsed-post.resolve.id', idData)
  if (idData.type === 'live_room_detail') {
    return await resolveDouyinLiveParsedPost(url, idData)
  }
  let workData: DouyinWorkResult
  recordFailureTraceStep('douyin.parsed-post.resolve.work.start', {
    awemeId: idData.aweme_id
  })
  const oneWorkResult = await fetchDouyinOneWork(idData)
  workData = oneWorkResult.workData
  recordFailureTraceStep('douyin.parsed-post.resolve.work.success', {
    awemeId: idData.aweme_id,
    awemeType: workData.data.aweme_detail?.aweme_type,
    source: oneWorkResult.source,
    subtype: oneWorkResult.htmlWork.subtype
  })
  return resolveDouyinParsedPostFromWorkData(url, workData as DouyinWorkResult, idData)
}

export const resolveDouyinParsedPostFromWorkData = async (
  url: string,
  workData: DouyinWorkResult,
  idData?: Awaited<ReturnType<typeof getDouyinID>>
): Promise<ParsedPost> => {
  const aweme = workData.data.aweme_detail
  const resolvedIdData = idData ?? await getDouyinID({} as any, url, false)
  const isArticle = aweme.aweme_type === 163
  const isVideo = aweme.aweme_type === 0 || aweme.aweme_type === 55
  const title = normalizeTitle(
    isArticle
      ? aweme.article_info?.article_title || aweme.preview_title || aweme.desc
      : aweme.desc || aweme.preview_title,
    `抖音_${aweme.aweme_id}`
  )
  const authorName = aweme.author?.nickname || ''
  const stats = toStats([
    ['点赞', aweme.statistics?.digg_count],
    ['评论', aweme.statistics?.comment_count],
    ['收藏', aweme.statistics?.collect_count],
    ['分享', aweme.statistics?.share_count]
  ])
  const postUrl = aweme.share_url || url

  if (isVideo && aweme.video?.bit_rate?.[0]?.play_addr?.url_list?.length) {
    const smallestVideo = pickDouyinAsrVideoCandidate(aweme)
    const videoUrl = getDouyinPlayableVideoUrl(aweme.video)
    const primaryVideo = videoUrl
      ? buildVideo(videoUrl, {
          title,
          asrSourceType: smallestVideo?.url ? 'video' : undefined,
          asrSourceUrl: smallestVideo?.url,
          asrSourceBackupUrls: smallestVideo?.backupUrls ?? [],
          headers: createHeaders({
            ...baseHeaders,
            Referer: 'https://www.douyin.com'
          })
        })
      : null

    return buildParsedPost({
      platform: 'douyin',
      platformLabel: '抖音',
      subtype: 'video',
      title,
      author: authorName ? buildAuthor(authorName, { avatar: aweme.author?.avatar_thumb?.url_list?.[0] }) : undefined,
      summary: aweme.desc || aweme.preview_title,
      url: postUrl,
      contentBlocks: textBlock(aweme.desc),
      images: [],
      videos: primaryVideo ? [primaryVideo] : [],
      primaryVideo: primaryVideo ?? undefined,
      stats,
      meta: [],
      raw: {
        accentColor: '#161823',
        detail: workData,
        idData: resolvedIdData
      }
    })
  }

  if (isArticle) {
    const article = normalizeDouyinArticleContent(aweme, {
      title,
      summary: String(aweme.desc || aweme.preview_title || '').trim()
    })
    const images = article.images
      .map((image) => image.high_image_url || image.origin_image_url)
      .filter((item): item is string => Boolean(item))
      .map((image) => ({ url: image }))

    return buildParsedPost({
      platform: 'douyin',
      platformLabel: '抖音',
      subtype: 'article',
      title,
      author: authorName ? buildAuthor(authorName, { avatar: aweme.author?.avatar_thumb?.url_list?.[0] }) : undefined,
      summary: article.markdownOrText,
      url: postUrl,
      contentBlocks: [
        ...textBlock(article.markdownOrText),
        ...imageBlocks(images, '文章图片')
      ],
      images,
      videos: [],
      stats,
      meta: toMeta([
        ['类型', '文章']
      ]),
      raw: {
        accentColor: '#161823',
        detail: workData,
        idData: resolvedIdData
      }
    })
  }

  const images = (aweme.images ?? [])
    .map((item: { url_list?: string[] }) => item.url_list?.[0])
    .filter((item: string | undefined): item is string => Boolean(item))
    .map(image => ({ url: image }))

  return buildParsedPost({
    platform: 'douyin',
    platformLabel: '抖音',
    subtype: 'image',
    title,
    author: authorName ? buildAuthor(authorName, { avatar: aweme.author?.avatar_thumb?.url_list?.[0] }) : undefined,
    summary: aweme.desc || aweme.preview_title || '该图文暂无可提取纯文本内容',
    url: postUrl,
    contentBlocks: [
      ...textBlock(aweme.desc),
      ...imageBlocks(images, '图集图片')
    ],
    images,
    videos: [],
    stats,
    meta: toMeta([
      ['类型', '图集']
    ]),
    raw: {
      accentColor: '#161823',
      detail: workData,
      idData: resolvedIdData
    }
  })
}
