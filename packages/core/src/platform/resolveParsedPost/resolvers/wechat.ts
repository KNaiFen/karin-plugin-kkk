import type { ParsedPost } from '@/platform/parsedPost'
import { fetchWechatArticleDetail, getWechatID } from '@/platform/wechat'

import { buildAuthor, buildParsedPost, toMeta } from '../shared'

export const resolveWechatParsedPost = async (url: string): Promise<ParsedPost> => {
  const idData = await getWechatID(url)
  const detail = await fetchWechatArticleDetail(idData.url)

  return buildParsedPost({
    platform: 'wechat',
    platformLabel: '微信公众号',
    subtype: detail.contentType,
    title: detail.title,
    author: detail.accountName ? buildAuthor(detail.accountName, {
      avatar: detail.accountAvatar,
      description: detail.accountSignature,
      screenName: detail.accountAlias
    }) : undefined,
    summary: detail.summary || detail.description || (detail.contentType === 'image'
      ? '该图片消息暂无可提取纯文本内容'
      : '该文章暂无可提取纯文本内容'),
    url: detail.url,
    contentBlocks: detail.contentBlocks,
    images: detail.images.map((image, index) => ({
      url: image,
      alt: detail.contentType === 'image' ? `图片消息第 ${index + 1} 张` : '文章配图'
    })),
    videos: [],
    stats: [],
    meta: toMeta([
      ['账号别名', detail.accountAlias],
      ['发布时间', detail.publishTime],
      ['账号类型', detail.serviceType],
      ['原文来源', detail.sourceUrl]
    ]),
    raw: {
      accentColor: '#07c160',
      detail,
      idData,
      replyImages: detail.images
    }
  })
}
