import { baseHeaders } from '@/module'
import { Config } from '@/module/utils/Config'
import { createExternalPostContentFromParts } from '@/platform/externalPostCard'
import { getHeyboxID } from '@/platform/heybox'
import { fetchHeyboxDetail } from '@/platform/heybox/api'
import type { ParsedPost, ParsedPostBlock } from '@/platform/parsedPost'

import { buildAuthor, buildParsedPost, buildVideo, createHeaders, toMeta, toStats } from '../shared'

export const resolveHeyboxParsedPost = async (url: string): Promise<ParsedPost> => {
  const idData = await getHeyboxID(url)
  const detail = await fetchHeyboxDetail({
    linkId: idData.link_id!,
    cookie: Config.cookies.heybox
  })
  const contentImages = detail.content
    .filter((part): part is Extract<typeof detail.content[number], { type: 'image' }> => part.type === 'image')
    .map(part => ({ url: part.url }))
  const images = detail.images.length > 0 ? detail.images.map(image => ({ url: image })) : contentImages
  const video = detail.video?.url ? buildVideo(detail.video.url, {
    title: detail.title,
    cover: detail.video.cover,
    headers: createHeaders({
      ...baseHeaders,
      Cookie: Config.cookies.heybox,
      Referer: detail.url
    })
  }) : null

  return buildParsedPost({
    platform: 'heybox',
    platformLabel: '小黑盒',
    subtype: 'post',
    title: detail.title,
    author: buildAuthor(detail.author.name, {
      avatar: detail.author.avatar,
      location: detail.author.location
    }),
    summary: detail.content.filter(part => part.type === 'text').map(part => part.text).join('\n') || detail.description || '这个小黑盒帖子暂无可提取纯文本内容',
    url: detail.url,
    contentBlocks: createExternalPostContentFromParts(detail.content)
      .map((block): ParsedPostBlock => {
        if (block.type === 'text') return { type: 'text', text: block.text }
        if (block.type === 'html') return { type: 'html', html: block.html }
        return { type: 'image', url: block.url, alt: block.alt }
      }),
    images,
    videos: video ? [video] : [],
    primaryVideo: video ?? undefined,
    stats: toStats([
      ['浏览', detail.stats.view],
      ['点赞', detail.stats.like],
      ['评论', detail.stats.comment],
      ['收藏', detail.stats.collect],
      ['分享', detail.stats.share]
    ]),
    meta: toMeta([
      ['帖子', detail.linkId],
      ['IP', detail.author.location]
    ]),
    raw: {
      accentColor: '#ffb000',
      detail,
      idData
    }
  })
}
