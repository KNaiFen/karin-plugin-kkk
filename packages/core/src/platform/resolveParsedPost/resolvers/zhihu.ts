import { baseHeaders } from '@/module'
import { Config } from '@/module/utils/Config'
import { getZhihuID } from '@/platform/zhihu'
import { fetchZhihuDetail } from '@/platform/zhihu/api'
import type { ParsedPost } from '@/platform/parsedPost'

import { buildAuthor, buildParsedPost, createHeaders, toMeta, toStats } from '../shared'

export const resolveZhihuParsedPost = async (url: string): Promise<ParsedPost> => {
  const idData = await getZhihuID(url)
  const detail = await fetchZhihuDetail(idData)
  const isArticle = detail.type === 'article'
  const title = isArticle ? detail.article.title : detail.question.title
  const author = isArticle ? detail.article.author : detail.answer.author
  const videos = detail.richContent.videos.map(video => ({
    url: video.url,
    title: video.title || title,
    backupUrls: video.backupUrls,
    headers: createHeaders({
      ...baseHeaders,
      Cookie: Config.cookies.zhihu,
      Referer: detail.url
    })
  }))

  return buildParsedPost({
    platform: 'zhihu',
    platformLabel: '知乎',
    subtype: isArticle ? 'article' : 'answer',
    title,
    author: buildAuthor(author.name, { avatar: author.avatarUrl }),
    summary: detail.richContent.text || (isArticle ? '该文章暂无可提取纯文本内容' : '该回答暂无可提取纯文本内容'),
    url: detail.url,
    contentBlocks: isArticle
      ? [{
          type: 'html',
          html: detail.article.content
        }]
      : [{
          type: 'html',
          html: detail.answer.content
        }],
    images: detail.richContent.images.map(url => ({ url })),
    videos,
    primaryVideo: videos[0],
    stats: toStats([
      ['赞同', isArticle ? detail.article.voteupCount : detail.answer.voteupCount],
      ['评论', isArticle ? detail.article.commentCount : detail.answer.commentCount]
    ]),
    meta: toMeta([
      ['类型', isArticle ? '专栏' : '回答'],
      ['IP', isArticle ? detail.article.ipInfo : detail.answer.ipInfo]
    ]),
    raw: {
      accentColor: '#1772f6',
      detail,
      idData
    }
  })
}
