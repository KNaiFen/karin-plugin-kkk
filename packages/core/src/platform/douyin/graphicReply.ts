import { normalizeDouyinArticleContent } from './articleContent'
import { resolveDouyinPlayableMusicUrls } from './workType'

export type DouyinGraphicBaseImage = {
  index: number
  url: string
}

export type DouyinGraphicLiveItem = {
  index: number
  clipType: number
  imageUrl: string
  video: Record<string, any>
}

export type DouyinGraphicReplyPlan = {
  title: string
  isArticleLike: boolean
  isLiveGraphic: boolean
  baseImages: DouyinGraphicBaseImage[]
  liveItems: DouyinGraphicLiveItem[]
  bgmUrl: string
  bgmBackupUrls: string[]
}

const pickFirstString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed) return trimmed
  }
  return ''
}

const pickGraphicImageUrl = (item: Record<string, any>): string => {
  return pickFirstString(
    item.url_list?.[2],
    item.url_list?.[1],
    item.url_list?.[0],
    item.download_url_list?.[0]
  )
}

export const resolveDouyinMusicUrl = (music: Record<string, any> | null | undefined): string => {
  return resolveDouyinPlayableMusicUrls(music)[0] ?? ''
}

export const buildDouyinGraphicReplyPlan = (
  aweme: Record<string, any>,
  parsedPost?: { title?: unknown }
): DouyinGraphicReplyPlan => {
  const isArticleLike = aweme?.aweme_type === 163 || Boolean(aweme?.article_info)
  const title = pickFirstString(
    aweme?.preview_title,
    aweme?.desc,
    typeof parsedPost?.title === 'string' ? parsedPost.title : ''
  )

  if (isArticleLike) {
    const bgmCandidates = resolveDouyinPlayableMusicUrls(aweme?.music)
    const article = normalizeDouyinArticleContent(aweme, {
      title: typeof parsedPost?.title === 'string' ? parsedPost.title : ''
    })
    const baseImages = article.images
      .map((image, index) => ({
        index,
        url: image.high_image_url || image.origin_image_url
      }))

    return {
      title: article.title || title,
      isArticleLike: true,
      isLiveGraphic: false,
      baseImages,
      liveItems: [],
      bgmUrl: bgmCandidates[0] ?? '',
      bgmBackupUrls: bgmCandidates.slice(1)
    }
  }

  const rawImages = Array.isArray(aweme?.images) ? aweme.images : []
  const baseImages = rawImages
    .map((item, index) => ({
      index,
      url: pickGraphicImageUrl(item ?? {})
    }))
    .filter((item) => Boolean(item.url))

  const liveItems = rawImages
    .map((item, index) => {
      const clipType = Number(item?.clip_type ?? 2)
      if (clipType === 2 || !item?.video) return null

      return {
        index,
        clipType,
        imageUrl: pickFirstString(item?.url_list?.[0], pickGraphicImageUrl(item ?? {})),
        video: item.video as Record<string, any>
      }
    })
    .filter((item): item is DouyinGraphicLiveItem => Boolean(item))

  const bgmCandidates = resolveDouyinPlayableMusicUrls(aweme?.music)

  return {
    title,
    isArticleLike: false,
    isLiveGraphic: liveItems.length > 0,
    baseImages,
    liveItems,
    bgmUrl: bgmCandidates[0] ?? '',
    bgmBackupUrls: bgmCandidates.slice(1)
  }
}
