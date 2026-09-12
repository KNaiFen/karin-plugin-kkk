import { baseHeaders } from '@/module'
import { Config } from '@/module/utils/Config'
import type { ParsedPost } from '@/platform/parsedPost'
import { getXiaohongshuID } from '@/platform/xiaohongshu'
import { fetchXiaohongshuNoteBundle } from '@/platform/xiaohongshu/noteBundle'
import { type XhsVideoStream, xiaohongshuProcessVideos } from '@/platform/xiaohongshu/xiaohongshu'

import { buildAuthor, buildParsedPost, buildVideo, createHeaders, imageBlocks, normalizeTitle, textBlock, toMeta } from '../shared'

const pickSmallestXiaohongshuAsrVideo = (
  streamData: Record<string, XhsVideoStream[]> | undefined
): XhsVideoStream | null => {
  if (!streamData) return null

  const allVideos: XhsVideoStream[] = []
  for (const value of Object.values(streamData)) {
    if (Array.isArray(value)) allVideos.push(...value)
  }

  const candidates = allVideos
    .filter(video => String(video?.master_url ?? '').trim())
    .sort((left, right) => left.size - right.size)

  return candidates[0] ?? null
}

export const resolveXiaohongshuParsedPost = async (url: string): Promise<ParsedPost> => {
  const idData = await getXiaohongshuID(url)
  if (idData.type !== 'note' || !idData.note_id || !idData.xsec_token) {
    throw new Error('未获取到有效的小红书笔记信息')
  }
  const noteData = await fetchXiaohongshuNoteBundle({
    note_id: idData.note_id,
    xsec_token: idData.xsec_token
  })
  const noteCard = noteData.data.data.items?.[0]?.note_card
  if (!noteCard) {
    throw new Error('小红书笔记详情为空')
  }

  const title = normalizeTitle(noteCard.title, '小红书笔记')
  const summary = String(noteCard.desc ?? '').trim()
  const authorName = noteCard.user?.nickname || ''
  const postUrl = `https://www.xiaohongshu.com/discovery/item/${idData.note_id}?xsec_token=${idData.xsec_token}`
  const images = (noteCard.image_list ?? [])
    .map((item: { url_default?: string }) => item.url_default)
    .filter((item: string | undefined): item is string => Boolean(item))
    .map((imageUrl: string) => ({ url: imageUrl }))

  if (noteCard.video) {
    const smallestVideo = pickSmallestXiaohongshuAsrVideo(noteCard.video.media?.stream)
    const selectedVideo = xiaohongshuProcessVideos(
      noteCard.video.media?.stream,
      Config.xiaohongshu.videoQuality,
      Config.xiaohongshu.maxAutoVideoSize
    )
    const fallbackVideoUrl = String(noteCard.video.url_default ?? '').trim()
    const primaryVideo = buildVideo(selectedVideo?.master_url || fallbackVideoUrl, {
      title: selectedVideo?.stream_desc || title,
      backupUrls: selectedVideo?.backup_urls ?? [],
      asrSourceType: smallestVideo?.master_url ? 'video' : undefined,
      asrSourceUrl: smallestVideo?.master_url,
      asrSourceBackupUrls: smallestVideo?.backup_urls ?? [],
      headers: createHeaders({
        ...baseHeaders,
        Referer: 'https://www.xiaohongshu.com',
        Cookie: Config.cookies.xiaohongshu
      })
    })

    return buildParsedPost({
      platform: 'xiaohongshu',
      platformLabel: '小红书',
      subtype: 'video',
      title,
      author: authorName ? buildAuthor(authorName, { avatar: noteCard.user?.avatar }) : undefined,
      summary,
      url: postUrl,
      contentBlocks: [
        ...textBlock(summary),
        ...imageBlocks(images, '笔记图片')
      ],
      images,
      videos: primaryVideo ? [primaryVideo] : [],
      primaryVideo: primaryVideo ?? undefined,
      stats: [],
      meta: toMeta([
        ['类型', '视频笔记']
      ]),
      raw: {
        accentColor: '#ff2442',
        detail: noteData,
        idData
      }
    })
  }

  return buildParsedPost({
    platform: 'xiaohongshu',
    platformLabel: '小红书',
    subtype: 'image',
    title,
    author: authorName ? buildAuthor(authorName, { avatar: noteCard.user?.avatar }) : undefined,
    summary: summary || '该笔记暂无可提取纯文本内容',
    url: postUrl,
    contentBlocks: [
      ...textBlock(summary),
      ...imageBlocks(images, '笔记图片')
    ],
    images,
    videos: [],
    stats: [],
    meta: toMeta([
      ['类型', '图文笔记']
    ]),
    raw: {
      accentColor: '#ff2442',
      detail: noteData,
      idData
    }
  })
}
