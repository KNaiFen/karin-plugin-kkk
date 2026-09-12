import { baseHeaders } from '@/module'
import type { ParsedPost } from '@/platform/parsedPost'
import { getXID } from '@/platform/x'
import { fetchXDetail } from '@/platform/x/api'
import { buildXExternalPostCard, pickPrimaryVideo as pickXPrimaryVideo } from '@/platform/x/summaryBlocks'

import { buildAuthor, buildVideo, cardToParsedPost, createHeaders } from '../shared'

export const resolveXParsedPost = async (url: string): Promise<ParsedPost> => {
  const idData = await getXID(url)
  const detail = await fetchXDetail(idData)
  const status = detail.status
  const title = status.text.split('\n').map(item => item.trim()).find(Boolean) || `@${status.author.screenName} 的 X 动态`
  const primaryVideo = pickXPrimaryVideo(status)
  const asrVideoUrl = primaryVideo?.backupUrls?.at(-1) || primaryVideo?.url
  const card = buildXExternalPostCard(detail)

  return cardToParsedPost(card, {
    platform: 'x',
    platformLabel: 'X',
    subtype: 'status',
    title,
    author: buildAuthor(status.author.name, {
      avatar: status.author.avatar,
      description: status.author.description,
      screenName: status.author.screenName
    }),
    summary: status.text || card.summary,
    url: detail.url,
    videos: primaryVideo?.url ? [
      buildVideo(primaryVideo.url, {
        title,
        cover: primaryVideo.cover,
        backupUrls: primaryVideo.backupUrls,
        asrSourceType: asrVideoUrl ? 'video' : undefined,
        asrSourceUrl: asrVideoUrl,
        headers: createHeaders({
          ...baseHeaders,
          Referer: detail.url
        })
      })!
    ] : [],
    primaryVideo: primaryVideo?.url ? buildVideo(primaryVideo.url, {
      title,
      cover: primaryVideo.cover,
      backupUrls: primaryVideo.backupUrls,
      asrSourceType: asrVideoUrl ? 'video' : undefined,
      asrSourceUrl: asrVideoUrl,
      headers: createHeaders({
        ...baseHeaders,
        Referer: detail.url
      })
    })! : undefined,
    raw: {
      accentColor: '#1d9bf0',
      detail,
      idData
    }
  })
}
