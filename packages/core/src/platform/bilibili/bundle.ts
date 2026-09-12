import { BiliBiliVideoPlayurlNoLogin, BiliDynamicInfoUnion, BiliOneWork, BiliVideoPlayurlIsLogin, DynamicType, Result } from '@ikenxuan/amagi'
import { bilibiliApiUrls } from '@ikenxuan/amagi'

import { fetchBilibiliSubtitleReferences } from '@/module/summaryParse/bilibiliSubtitles'
import {
  resolveBilibiliVideoAid,
  resolveBilibiliVideoCid,
  resolveBilibiliVideoPage
} from '@/module/summaryParse/bilibiliVideoIdentity'
import { baseHeaders, Networks } from '@/module/utils'
import { amagiClient, SOFT_ERROR_CODES, softFetch } from '@/module/utils/amagiClient'
import { Config } from '@/module/utils/Config'
import {
  type CacheIdentity,
  resolveSharedJsonCacheWithMerge,
  writeSharedJsonCache } from '@/module/utils/sharedCache'
import {
  getBilibiliDynamicItem,
  getBilibiliDynamicType,
  normalizeBilibiliDynamicDetailResult
} from '@/platform/bilibili/dynamicDetail'

type BilibiliOneVideoBundleNeed = {
  infoData?: boolean
  playUrlData?: boolean
  subtitles?: boolean
  userCardData?: boolean
  commentsData?: boolean
  emojiData?: boolean
  html5PlayUrlData?: boolean
}

type BilibiliDynamicBundleNeed = {
  dynamicDetail?: boolean
  userCardData?: boolean
  commentsData?: boolean
  emojiData?: boolean
  avVideoInfo?: boolean
  avPlayUrlData?: boolean
  avSubtitles?: boolean
  articleInfoBase?: boolean
  articleContent?: boolean
}

export type BilibiliOneVideoBundle = {
  infoData?: Result<BiliOneWork>
  playUrlData?: Result<BiliVideoPlayurlIsLogin>
  subtitles?: Array<Record<string, unknown>>
  userCardData?: any
  commentsData?: any
  emojiData?: any
  html5PlayUrlData?: Result<BiliBiliVideoPlayurlNoLogin>
  selectedCid?: number
  selectedPage?: number
}

export type BilibiliDynamicBundle = {
  dynamicDetail?: Result<BiliDynamicInfoUnion>
  userCardData?: any
  commentsData?: any
  emojiData?: any
  avVideoInfo?: Result<BiliOneWork>
  avPlayUrlData?: Result<BiliVideoPlayurlIsLogin>
  avSubtitles?: Array<Record<string, unknown>>
  articleInfoBase?: any
  articleContent?: any
  dynamicType?: string
}

const VIDEO_COMMENT_FETCH_COUNT = 50
const DYNAMIC_COMMENT_FETCH_COUNT = 50

const mergeBundle = <T extends Record<string, unknown>> (
  cached: T | null,
  loaded: T | Partial<T>
): T => {
  return {
    ...(cached ?? {}),
    ...Object.fromEntries(
      Object.entries(loaded).filter(([, value]) => value !== undefined)
    )
  } as T
}

const needsOneVideoBundleFields = (
  cached: BilibiliOneVideoBundle,
  need: BilibiliOneVideoBundleNeed
): boolean => {
  if (need.infoData && !cached.infoData) return false
  if (need.playUrlData && !cached.playUrlData) return false
  if (need.subtitles && !cached.subtitles) return false
  if (need.userCardData && !cached.userCardData) return false
  if (need.commentsData && !cached.commentsData) return false
  if (need.emojiData && !cached.emojiData) return false
  if (need.html5PlayUrlData && !cached.html5PlayUrlData) return false
  return true
}

const needsDynamicBundleFields = (
  cached: BilibiliDynamicBundle,
  need: BilibiliDynamicBundleNeed
): boolean => {
  const normalizedDetail = normalizeBilibiliDynamicDetailResult(cached.dynamicDetail)
  if (cached.dynamicType === DynamicType.LIVE_RCMD) return false
  if (need.dynamicDetail && !getBilibiliDynamicItem(normalizedDetail)) return false
  if (need.userCardData && !cached.userCardData) return false
  if (need.commentsData && !cached.commentsData) return false
  if (need.emojiData && !cached.emojiData) return false
  if (need.avVideoInfo && !cached.avVideoInfo) return false
  if (need.avPlayUrlData && !cached.avPlayUrlData) return false
  if (need.avSubtitles && !cached.avSubtitles) return false
  if (need.articleInfoBase && !cached.articleInfoBase) return false
  if (need.articleContent && !cached.articleContent) return false
  return true
}

const buildBilibiliHeaders = (): Record<string, string> => ({
  ...Object.fromEntries(
    Object.entries(baseHeaders ?? {}).filter(([, value]) => typeof value === 'string')
  ) as Record<string, string>,
  Cookie: Config.cookies.bilibili,
  Referer: 'https://www.bilibili.com'
})

const buildOneVideoBundleIdentity = (idData: {
  bvid?: string
  p?: number
  cid?: number | string
}): CacheIdentity | null => {
  const bvid = String(idData.bvid ?? '').trim()
  if (!bvid) return null
  const page = resolveBilibiliVideoPage(idData)
  const cid = String(idData.cid ?? '').trim()
  return {
    scope: 'work-bundle',
    key: cid
      ? `bilibili:one_video:${bvid}:cid:${cid}`
      : `bilibili:one_video:${bvid}:p:${page}`
  }
}

const buildDynamicBundleIdentity = (idData: {
  dynamic_id?: string
}): CacheIdentity | null => {
  const dynamicId = String(idData.dynamic_id ?? '').trim()
  if (!dynamicId) return null
  return {
    scope: 'work-bundle',
    key: `bilibili:dynamic:${dynamicId}`
  }
}

const loadOneVideoBundle = async (
  idData: {
    bvid?: string
    p?: number
    cid?: number | string
  },
  need: BilibiliOneVideoBundleNeed,
  cached: BilibiliOneVideoBundle | null
): Promise<Partial<BilibiliOneVideoBundle>> => {
  const next: Partial<BilibiliOneVideoBundle> = {}
  const shouldLoadInfo = need.infoData || need.playUrlData || need.subtitles || need.userCardData || need.commentsData
  const infoData = cached?.infoData ?? (
    shouldLoadInfo
      ? await amagiClient.bilibili.fetcher.fetchVideoInfo({
        bvid: String(idData.bvid ?? ''),
        typeMode: 'strict'
      }) as Result<BiliOneWork>
      : undefined
  )
  if (infoData && !cached?.infoData) {
    next.infoData = infoData
  }

  const selectedPage = cached?.selectedPage ?? resolveBilibiliVideoPage(idData)
  const selectedCid = cached?.selectedCid ?? resolveBilibiliVideoCid({
    idData,
    detail: infoData ?? cached?.infoData
  })
  if (selectedCid && !cached?.selectedCid) {
    next.selectedCid = selectedCid
  }
  if (selectedPage && !cached?.selectedPage) {
    next.selectedPage = selectedPage
  }

  const videoData = infoData?.data?.data
  if (need.playUrlData && !cached?.playUrlData && videoData && selectedCid) {
    next.playUrlData = await amagiClient.bilibili.fetcher.fetchVideoStreamUrl({
      avid: videoData.aid,
      cid: selectedCid,
      typeMode: 'strict'
    }) as Result<BiliVideoPlayurlIsLogin>
  }

  if (need.subtitles && !cached?.subtitles && videoData && selectedCid) {
    next.subtitles = await fetchBilibiliSubtitleReferences({
      aid: Number(videoData.aid ?? 0),
      bvid: videoData.bvid,
      cid: selectedCid,
      headers: buildBilibiliHeaders()
    })
  }

  if (need.userCardData && !cached?.userCardData && videoData?.owner?.mid) {
    next.userCardData = await amagiClient.bilibili.fetcher.fetchUserCard({
      host_mid: videoData.owner.mid,
      typeMode: 'strict'
    })
  }

  if (need.commentsData && !cached?.commentsData && videoData?.aid) {
    next.commentsData = await softFetch(
      () => amagiClient.bilibili.fetcher.fetchComments({
        number: Math.max(Number(Config.bilibili.numcomment ?? 0), VIDEO_COMMENT_FETCH_COUNT),
        type: 1,
        oid: String(videoData.aid),
        typeMode: 'strict'
      }),
      [SOFT_ERROR_CODES.BILIBILI_COMMENTS_DISABLED]
    )
  }

  if (need.emojiData && !cached?.emojiData) {
    next.emojiData = await amagiClient.bilibili.fetcher.fetchEmojiList({ typeMode: 'strict' })
  }

  if (need.html5PlayUrlData && !cached?.html5PlayUrlData && videoData?.aid && selectedCid) {
    next.html5PlayUrlData = await new Networks({
      url: bilibiliApiUrls.getVideoStream({
        avid: videoData.aid,
        cid: selectedCid
      }) + '&platform=html5',
      headers: buildBilibiliHeaders()
    }).getData() as Result<BiliBiliVideoPlayurlNoLogin>
  }

  return next
}

const getDynamicType = (bundle: BilibiliDynamicBundle | null): string => {
  return String(bundle?.dynamicType ?? getBilibiliDynamicType(bundle?.dynamicDetail) ?? '').trim()
}

const buildDynamicCommentType = (dynamicType: string): number => {
  const mapping: Record<string, number> = {
    [DynamicType.AV]: 1,
    [DynamicType.DRAW]: 11,
    [DynamicType.ARTICLE]: 12,
    [DynamicType.LIVE_RCMD]: 17,
    [DynamicType.FORWARD]: 17,
    [DynamicType.WORD]: 17,
    DYNAMIC_TYPE_COMMON_SQUARE: 17,
    DYNAMIC_TYPE_MEDIALIST: 19
  }
  return mapping[dynamicType] ?? 1
}

const buildDynamicCommentOid = (detail: Result<BiliDynamicInfoUnion>): string => {
  const item = getBilibiliDynamicItem(detail)
  const dynamicType = String(item?.type ?? '').trim()
  if (dynamicType === DynamicType.WORD || dynamicType === DynamicType.FORWARD) {
    return String(item?.id_str ?? '')
  }
  return String(item?.basic?.rid_str ?? item?.id_str ?? '')
}

const normalizeDynamicBundle = (bundle: BilibiliDynamicBundle): BilibiliDynamicBundle => {
  const normalizedDetail = normalizeBilibiliDynamicDetailResult(bundle.dynamicDetail)
  const normalizedType = String(bundle.dynamicType ?? getBilibiliDynamicType(normalizedDetail) ?? '').trim()

  if (normalizedDetail === bundle.dynamicDetail && normalizedType === (bundle.dynamicType ?? '')) {
    return bundle
  }

  return {
    ...bundle,
    dynamicDetail: normalizedDetail,
    dynamicType: normalizedType || bundle.dynamicType
  }
}

const loadDynamicBundle = async (
  idData: {
    dynamic_id?: string
  },
  need: BilibiliDynamicBundleNeed,
  cached: BilibiliDynamicBundle | null
): Promise<Partial<BilibiliDynamicBundle>> => {
  const next: Partial<BilibiliDynamicBundle> = {}
  const normalizedCachedDetail = normalizeBilibiliDynamicDetailResult(cached?.dynamicDetail)
  const shouldLoadDetail = need.dynamicDetail || need.userCardData || need.commentsData || need.avVideoInfo || need.avPlayUrlData || need.avSubtitles || need.articleInfoBase || need.articleContent
  const dynamicDetail = normalizedCachedDetail ?? (
    shouldLoadDetail
      ? normalizeBilibiliDynamicDetailResult(await amagiClient.bilibili.fetcher.fetchDynamicDetail({
        dynamic_id: String(idData.dynamic_id ?? ''),
        typeMode: 'strict'
      }) as Result<BiliDynamicInfoUnion>)
      : undefined
  )
  if (dynamicDetail && dynamicDetail !== cached?.dynamicDetail) {
    next.dynamicDetail = dynamicDetail
  }

  const dynamicItem = getBilibiliDynamicItem(dynamicDetail)
  const dynamicType = String(dynamicItem?.type ?? cached?.dynamicType ?? '').trim()
  if (dynamicType && !cached?.dynamicType) {
    next.dynamicType = dynamicType
  }
  if (dynamicType === DynamicType.LIVE_RCMD) {
    return next
  }

  const authorMid = dynamicItem?.modules?.module_author?.mid
  if (need.userCardData && !cached?.userCardData && authorMid) {
    next.userCardData = await amagiClient.bilibili.fetcher.fetchUserCard({
      host_mid: authorMid,
      typeMode: 'strict'
    })
  }

  if (need.commentsData && !cached?.commentsData && dynamicDetail) {
    next.commentsData = await softFetch(
      () => amagiClient.bilibili.fetcher.fetchComments({
        type: buildDynamicCommentType(dynamicType),
        oid: buildDynamicCommentOid(dynamicDetail),
        number: Math.max(Number(Config.bilibili.numcomment ?? 0), DYNAMIC_COMMENT_FETCH_COUNT),
        typeMode: 'strict'
      }),
      [SOFT_ERROR_CODES.BILIBILI_COMMENTS_DISABLED]
    )
  }

  if (need.emojiData && !cached?.emojiData) {
    next.emojiData = await amagiClient.bilibili.fetcher.fetchEmojiList({ typeMode: 'strict' })
  }

  const archiveBvid = String(dynamicItem?.modules?.module_dynamic?.major?.archive?.bvid ?? '').trim()
  if ((need.avVideoInfo || need.avPlayUrlData || need.avSubtitles) && dynamicType === DynamicType.AV && archiveBvid) {
    const avVideoInfo = cached?.avVideoInfo ?? (
      need.avVideoInfo || need.avPlayUrlData || need.avSubtitles
        ? await amagiClient.bilibili.fetcher.fetchVideoInfo({
          bvid: archiveBvid,
          typeMode: 'strict'
        }) as Result<BiliOneWork>
        : undefined
    )
    if (avVideoInfo && !cached?.avVideoInfo) {
      next.avVideoInfo = avVideoInfo
    }

    const avCid = resolveBilibiliVideoCid({
      detail: avVideoInfo
    })
    const avAid = resolveBilibiliVideoAid({
      detail: avVideoInfo
    })

    if (need.avPlayUrlData && !cached?.avPlayUrlData && avAid && avCid) {
      next.avPlayUrlData = await amagiClient.bilibili.fetcher.fetchVideoStreamUrl({
        avid: avAid,
        cid: avCid,
        typeMode: 'strict'
      }) as Result<BiliVideoPlayurlIsLogin>
    }

    if (need.avSubtitles && !cached?.avSubtitles && avAid && avCid) {
      next.avSubtitles = await fetchBilibiliSubtitleReferences({
        aid: avAid,
        bvid: archiveBvid,
        cid: avCid,
        headers: buildBilibiliHeaders()
      })
    }
  }

  const articleId = String(dynamicItem?.basic?.rid_str ?? '').trim()
  if (dynamicType === DynamicType.ARTICLE && articleId) {
    if (need.articleInfoBase && !cached?.articleInfoBase) {
      next.articleInfoBase = await amagiClient.bilibili.fetcher.fetchArticleInfo({
        id: articleId,
        typeMode: 'strict'
      })
    }
    if (need.articleContent && !cached?.articleContent) {
      next.articleContent = await amagiClient.bilibili.fetcher.fetchArticleContent({
        id: articleId,
        typeMode: 'strict'
      })
    }
  }

  return next
}

export const fetchBilibiliOneVideoBundle = async (
  idData: {
    bvid?: string
    p?: number
    cid?: number | string
  },
  need: BilibiliOneVideoBundleNeed
): Promise<BilibiliOneVideoBundle> => {
  const identity = buildOneVideoBundleIdentity(idData)
  if (!identity) {
    return mergeBundle(null, await loadOneVideoBundle(idData, need, null))
  }

  const { value } = await resolveSharedJsonCacheWithMerge<BilibiliOneVideoBundle>(identity, {
    isComplete: cached => needsOneVideoBundleFields(cached, need),
    loadMissing: async cached => await loadOneVideoBundle(idData, need, cached),
    merge: mergeBundle
  })

  return value
}

export const fetchBilibiliDynamicBundle = async (
  idData: {
    dynamic_id?: string
  },
  need: BilibiliDynamicBundleNeed
): Promise<BilibiliDynamicBundle> => {
  const identity = buildDynamicBundleIdentity(idData)
  if (!identity) {
    return mergeBundle(null, await loadDynamicBundle(idData, need, null))
  }

  const { value } = await resolveSharedJsonCacheWithMerge<BilibiliDynamicBundle>(identity, {
    isComplete: cached => needsDynamicBundleFields(cached, need),
    loadMissing: async cached => await loadDynamicBundle(idData, need, cached),
    merge: mergeBundle,
    shouldPersist: value => getDynamicType(value) !== DynamicType.LIVE_RCMD
  })

  const normalized = normalizeDynamicBundle(value)
  if (normalized !== value) {
    writeSharedJsonCache(identity, normalized)
  }

  return normalized
}
