import { baseHeaders } from '@/module'
import type { ParsedPost } from '@/platform/parsedPost'
import { getTikTokID } from '@/platform/tiktok'
import { fetchTikTokVideoDetail } from '@/platform/tiktok/api'

import { buildAuthor, buildParsedPost, buildVideo, createHeaders, normalizeTitle, textBlock } from '../shared'

export const resolveTikTokParsedPost = async (url: string): Promise<ParsedPost> => {
  const idData = await getTikTokID(url)
  const detail = await fetchTikTokVideoDetail({
    itemId: idData.item_id,
    pageUrl: idData.url,
    pageCookie: idData.cookie
  })
  const [videoUrl, ...backupUrls] = detail.urls
  const title = normalizeTitle(detail.item.desc || detail.item.description, `TikTok_${idData.item_id}`)
  const authorName = detail.item.author?.nickname || detail.item.author?.uniqueId || detail.item.authorInfo?.nickname || ''
  const primaryVideo = buildVideo(videoUrl, {
    title,
    backupUrls,
    headers: createHeaders({
      ...baseHeaders,
      Cookie: detail.cookie,
      Referer: 'https://www.tiktok.com/',
      'User-Agent': detail.userAgent
    })
  })

  return buildParsedPost({
    platform: 'tiktok',
    platformLabel: 'TikTok',
    subtype: 'video',
    title,
    author: authorName ? buildAuthor(authorName) : undefined,
    summary: detail.item.description || detail.item.desc,
    url: idData.url || url,
    contentBlocks: textBlock(detail.item.description || detail.item.desc),
    images: [],
    videos: primaryVideo ? [primaryVideo] : [],
    primaryVideo: primaryVideo ?? undefined,
    stats: [],
    meta: [],
    raw: {
      accentColor: '#111111',
      detail,
      idData
    }
  })
}
