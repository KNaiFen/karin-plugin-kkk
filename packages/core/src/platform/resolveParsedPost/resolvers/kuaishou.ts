import { type ExtendedKuaishouOptionsType, fetchKuaishouData, getKuaishouID } from '@/platform/kuaishou'
import type { ParsedPost } from '@/platform/parsedPost'
import type { KuaishouDataTypes } from '@/types'

import { buildAuthor, buildParsedPost, buildVideo, normalizeTitle, textBlock, toStats } from '../shared'

export const resolveKuaishouParsedPost = async (url: string): Promise<ParsedPost> => {
  const idData = await getKuaishouID(url)
  const data = await fetchKuaishouData(idData.type as keyof KuaishouDataTypes, idData as ExtendedKuaishouOptionsType)
  if (!data || !('VideoData' in data)) {
    throw new Error('快手解析失败')
  }

  const detail = data.VideoData.data.data.visionVideoDetail
  const title = normalizeTitle(detail.photo.caption, `快手_${idData.photoId}`)
  const authorName = detail.author?.name || ''
  const primaryVideo = buildVideo(detail.photo.photoUrl, {
    title
  })

  return buildParsedPost({
    platform: 'kuaishou',
    platformLabel: '快手',
    subtype: 'video',
    title,
    author: authorName ? buildAuthor(authorName) : undefined,
    summary: detail.photo.caption || '',
    url,
    contentBlocks: textBlock(detail.photo.caption),
    images: [],
    videos: primaryVideo ? [primaryVideo] : [],
    primaryVideo: primaryVideo ?? undefined,
    stats: toStats([
      ['播放', detail.photo.viewCount],
      ['点赞', detail.photo.likeCount]
    ]),
    meta: [],
    raw: {
      accentColor: '#ff6600',
      detail: data,
      idData
    }
  })
}
