import type {
  DouyinLongTextWorkCreator,
  DouyinLongTextWorkData,
  DouyinLongTextWorkType
} from '@kkk/template-contracts'

import { getWorkCoverUrl, getWorkTypeDisplayName, getWorkTypeInfo } from './workType'

export const DOUYIN_LONG_TEXT_THRESHOLD = 25

const graphemeSegmenter = new Intl.Segmenter('zh-CN', {
  granularity: 'grapheme'
})

const pickFirstString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed) return trimmed
  }
  return ''
}

const pickFirstText = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value !== 'string') continue
    if (value.trim()) return value
  }
  return ''
}

const toFiniteNumber = (value: unknown): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizeAvatarUrl = (value: Record<string, any> | null | undefined): string => {
  const directUrl = pickFirstString(
    value?.url_list?.[0],
    value?.urlList?.[0],
    value?.url
  )
  if (directUrl) return directUrl

  const uri = pickFirstString(value?.uri)
  return uri ? `https://p3-pc.douyinpic.com/aweme/1080x1080/${uri}` : ''
}

const isSameDouyinUser = (
  left: Record<string, any> | null | undefined,
  right: Record<string, any> | null | undefined
): boolean => {
  if (!left || !right) return false

  const pairs: Array<[unknown, unknown]> = [
    [left.uid, right.uid],
    [left.sec_uid, right.sec_uid],
    [left.nickname, right.nickname]
  ]

  return pairs.some(([leftValue, rightValue]) => {
    const normalizedLeft = pickFirstString(leftValue)
    const normalizedRight = pickFirstString(rightValue)
    return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight)
  })
}

const normalizeCooperationInfo = (
  aweme: Record<string, any>,
  profile?: Record<string, any>
): DouyinLongTextWorkData['cooperation_info'] => {
  const raw = aweme?.cooperation_info
  if (!raw) return undefined

  const author = (aweme?.author ?? {}) as Record<string, any>
  const rawCreators = Array.isArray(raw.co_creators)
    ? raw.co_creators as Array<Record<string, any>>
    : []
  const coCreators: DouyinLongTextWorkCreator[] = rawCreators.map(creator => ({
    avatar_url: normalizeAvatarUrl(creator.avatar_thumb),
    nickname: pickFirstString(creator.nickname, '未提供'),
    role_title: pickFirstString(creator.role_title, '共创')
  }))

  if (pickFirstString(author.nickname) && !rawCreators.some(creator => isSameDouyinUser(creator, author))) {
    coCreators.unshift({
      avatar_url: normalizeAvatarUrl(author.avatar_thumb),
      nickname: pickFirstString(author.nickname, '未提供'),
      role_title: '作者'
    })
  }

  const profileCreator = rawCreators.find(creator => isSameDouyinUser(creator, profile))
  const subscriberRole = pickFirstString(
    profileCreator?.role_title,
    isSameDouyinUser(profile, author) ? '作者' : ''
  )
  const coCreatorCount = Math.max(toFiniteNumber(raw.co_creator_nums), coCreators.length)

  if (!coCreatorCount && coCreators.length === 0) return undefined

  return {
    co_creator_nums: coCreatorCount,
    co_creators: coCreators,
    subscriber_role: subscriberRole || undefined
  }
}

export const resolveDouyinWorkDisplayText = (
  aweme: Record<string, any>,
  resolvedTitle?: unknown
): string => {
  return pickFirstText(resolvedTitle, aweme?.desc, aweme?.preview_title)
}

export const countDouyinTitleGraphemes = (value: unknown): number => {
  const normalized = String(value ?? '').trim()
  if (!normalized) return 0
  return Array.from(graphemeSegmenter.segment(normalized)).length
}

export const shouldUseDouyinLongTextCard = (
  aweme: Record<string, any>,
  resolvedTitle?: unknown,
  threshold: unknown = DOUYIN_LONG_TEXT_THRESHOLD
): boolean => {
  const workTypeInfo = getWorkTypeInfo(aweme)
  if (workTypeInfo.isArticle || workTypeInfo.isLive) return false

  const parsedThreshold = Number(threshold)
  const normalizedThreshold = Number.isFinite(parsedThreshold) && parsedThreshold >= 1
    ? Math.floor(parsedThreshold)
    : DOUYIN_LONG_TEXT_THRESHOLD

  return countDouyinTitleGraphemes(
    resolveDouyinWorkDisplayText(aweme, resolvedTitle)
  ) > normalizedThreshold
}

export const buildDouyinLongTextWorkData = (
  aweme: Record<string, any>,
  options: {
    title?: unknown
    profile?: Record<string, any>
    createTime: string
    shareUrl?: string
    dynamicType?: string
  }
): DouyinLongTextWorkData => {
  const workTypeInfo = getWorkTypeInfo(aweme)
  const profile = options.profile ?? {}
  const author = (aweme?.author ?? {}) as Record<string, any>
  const coverUrl = getWorkCoverUrl(workTypeInfo, aweme)
  const workType = getWorkTypeDisplayName(workTypeInfo) as DouyinLongTextWorkType
  const music = aweme?.music
  const video = workTypeInfo.isVideo ? aweme?.video : undefined

  return {
    text: resolveDouyinWorkDisplayText(aweme, options.title),
    work_type: workType,
    image_url: coverUrl || undefined,
    create_time: options.createTime,
    author: {
      name: pickFirstString(author.nickname, profile.nickname, '未知作者'),
      avatar: pickFirstString(
        normalizeAvatarUrl(author.avatar_thumb),
        normalizeAvatarUrl(profile.avatar_larger),
        normalizeAvatarUrl(profile.avatar_thumb)
      ),
      douyin_id: pickFirstString(
        profile.unique_id,
        profile.short_id,
        author.unique_id,
        author.short_id
      ),
      follower_count: toFiniteNumber(profile.follower_count ?? author.follower_count),
      total_favorited: toFiniteNumber(profile.total_favorited ?? author.total_favorited),
      following_count: toFiniteNumber(profile.following_count ?? author.following_count)
    },
    statistics: {
      digg_count: toFiniteNumber(aweme?.statistics?.digg_count),
      comment_count: toFiniteNumber(aweme?.statistics?.comment_count),
      collect_count: toFiniteNumber(aweme?.statistics?.collect_count),
      share_count: toFiniteNumber(aweme?.statistics?.share_count)
    },
    music: music
      ? {
        author: pickFirstString(music.author, '未知作者'),
        title: pickFirstString(music.title, '原声'),
        cover: pickFirstString(
          music.cover_hd?.url_list?.[0],
          music.cover_large?.url_list?.[0],
          music.cover_medium?.url_list?.[0]
        ) || undefined
      }
      : undefined,
    video: video
      ? {
        duration: toFiniteNumber(video.duration),
        width: toFiniteNumber(video.width),
        height: toFiniteNumber(video.height),
        ratio: pickFirstString(video.ratio) || undefined
      }
      : undefined,
    cooperation_info: normalizeCooperationInfo(aweme, profile),
    dynamicTYPE: options.dynamicType,
    share_url: pickFirstString(options.shareUrl, aweme?.share_url)
  }
}
