import { baseHeaders } from '@/module'
import { Config } from '@/module/utils/Config'
import type { ParsedPost } from '@/platform/parsedPost'
import { getWeiboID } from '@/platform/weibo'
import { fetchWeiboDetail } from '@/platform/weibo/api'
import { buildWeiboShowCard, buildWeiboStatusCard, pickPrimaryVideo as pickWeiboPrimaryVideo } from '@/platform/weibo/summaryBlocks'

import { buildAuthor, buildVideo, cardToParsedPost, createHeaders } from '../shared'

export const resolveWeiboParsedPost = async (url: string): Promise<ParsedPost> => {
  const idData = await getWeiboID(url)
  const detail = await fetchWeiboDetail(idData)

  if (detail.type === 'video_show') {
    const card = buildWeiboShowCard(detail)
    const asrVideoUrl = detail.show.video.backupUrls.at(-1) || detail.show.video.url
    const primaryVideo = buildVideo(detail.show.video.url, {
      title: detail.show.title,
      cover: detail.show.video.cover,
      backupUrls: detail.show.video.backupUrls,
      asrSourceType: 'video',
      asrSourceUrl: asrVideoUrl,
      headers: createHeaders({
        ...baseHeaders,
        Cookie: Config.cookies.weibo,
        Referer: detail.url
      })
    })

    return cardToParsedPost(card, {
      platform: 'weibo',
      platformLabel: '微博',
      subtype: 'video_show',
      title: detail.show.title,
      author: buildAuthor(detail.show.author.name, {
        avatar: detail.show.author.avatar,
        description: detail.show.author.description
      }),
      summary: detail.show.text || detail.show.author.description || card.summary,
      url: detail.url,
      videos: primaryVideo ? [primaryVideo] : [],
      primaryVideo: primaryVideo ?? undefined,
      raw: {
        accentColor: '#ff6a4d',
        detail,
        idData
      }
    })
  }

  const status = detail.status
  const title = status.title?.trim() || status.text.split('\n').find(line => line.trim())?.slice(0, 60) || '微博动态'
  const card = buildWeiboStatusCard(detail)
  const video = pickWeiboPrimaryVideo(status)
  const asrVideoUrl = video?.backupUrls?.at(-1) || video?.url
  const primaryVideo = video?.url ? buildVideo(video.url, {
    title,
    cover: video.cover,
    backupUrls: video.backupUrls,
    asrSourceType: asrVideoUrl ? 'video' : undefined,
    asrSourceUrl: asrVideoUrl,
    headers: createHeaders({
      ...baseHeaders,
      Cookie: Config.cookies.weibo,
      Referer: detail.url
    })
  }) : null

  return cardToParsedPost(card, {
    platform: 'weibo',
    platformLabel: '微博',
    subtype: 'status',
    title,
    author: buildAuthor(status.author.name, {
      id: status.author.id,
      avatar: status.author.avatar
    }),
    summary: status.text || card.summary,
    url: detail.url,
    videos: primaryVideo ? [primaryVideo] : [],
    primaryVideo: primaryVideo ?? undefined,
    raw: {
      accentColor: '#ff6a4d',
      detail,
      idData
    }
  })
}
