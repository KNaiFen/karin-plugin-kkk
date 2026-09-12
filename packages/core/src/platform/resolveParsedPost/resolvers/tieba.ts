import { createExternalPostContentFromParts } from '@/platform/externalPostCard'
import type { ParsedPost, ParsedPostBlock } from '@/platform/parsedPost'
import { getTiebaID } from '@/platform/tieba'
import { getTiebaContentText, getTiebaPostDetail, tiebaMediaHeaders } from '@/platform/tieba/api'

import { buildAuthor, buildParsedPost, toMeta, toStats } from '../shared'

export const resolveTiebaParsedPost = async (url: string): Promise<ParsedPost> => {
  const idData = await getTiebaID(url)
  const detail = await getTiebaPostDetail(idData.tid!, idData.pid)
  const images = detail.content
    .filter((part): part is Extract<typeof detail.content[number], { type: 'image' }> => part.type === 'image')
    .map(part => ({ url: part.url }))
  const videos = detail.content
    .filter((part): part is Extract<typeof detail.content[number], { type: 'video' }> => part.type === 'video')
    .map(part => ({
      url: part.url,
      title: detail.title,
      headers: tiebaMediaHeaders()
    }))

  return buildParsedPost({
    platform: 'tieba',
    platformLabel: '贴吧',
    subtype: 'post',
    title: detail.title,
    author: buildAuthor(detail.author.name, {
      avatar: detail.author.avatar,
      location: detail.author.location
    }),
    summary: getTiebaContentText(detail.content) || '这个帖子暂无可提取纯文本内容',
    url: detail.url,
    contentBlocks: createExternalPostContentFromParts(detail.content)
      .map((block): ParsedPostBlock => {
        if (block.type === 'text') return { type: 'text', text: block.text }
        if (block.type === 'html') return { type: 'html', html: block.html }
        return { type: 'image', url: block.url, alt: block.alt }
      }),
    images,
    videos,
    primaryVideo: videos[0],
    stats: toStats([
      ['浏览', detail.stats.view],
      ['点赞', detail.stats.like],
      ['回复', detail.stats.comment],
      ['分享', detail.stats.share]
    ]),
    meta: toMeta([
      ['吧名', detail.forum.name],
      ['帖子', detail.tid],
      ['IP', detail.author.location]
    ]),
    raw: {
      accentColor: '#3388ff',
      detail,
      idData
    }
  })
}
