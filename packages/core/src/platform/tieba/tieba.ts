import type { Message } from 'node-karin'

import {
  Base,
  createPlainVideoTitleContext,
  downloadVideo,
  type PlainVideoTitleContext,
  replyPlainVideoTitle } from '@/module'
import { resolveParsedPostWithCache } from '@/module/summaryParse/parsedPostCache'
import { Config } from '@/module/utils/Config'
import { replyAndRecordLongTaskCompletionAnchor } from '@/module/utils/LongTaskCompletionNotify'

import { renderExternalPostCard } from '../externalPostCard'
import {
  buildExternalPostCardFromParsedPost,
  buildParsedPostImageReplyElements,
  buildParsedPostInfoText,
  buildParsedPostVideoDownloadEntries
} from '../parsedPostAdapters'
import {
  getTiebaContentText,
  getTiebaPostDetail,
  type TiebaComment,
  tiebaMediaHeaders } from './api'
import type { TiebaIdData } from './getID'

const defaultPlainTitleContext = (): PlainVideoTitleContext => createPlainVideoTitleContext(
  Config.tieba.plainTitleReply !== false && (typeof Config.tieba.plainTitleReply === 'boolean' ? Config.tieba.plainTitleReply : Config.tieba.plainTitleReply?.switch !== false),
  '贴吧',
  typeof Config.tieba.plainTitleReply === 'object' && Array.isArray(Config.tieba.plainTitleReply.types)
    ? Config.tieba.plainTitleReply.types
    : ['text', 'image', 'video']
)

const formatCommentLine = (comment: TiebaComment): string => {
  const text = getTiebaContentText(comment.content)
  const floor = comment.floor ? `${comment.floor}楼 ` : ''
  const like = comment.stats.like ? ` (${comment.stats.like}赞)` : ''
  return `${floor}${comment.author.name}${like}：${text || '[媒体内容]'}`
}

const getRenderCardConfig = (): { enable: boolean, includeImages: boolean } => {
  const renderCard = Config.tieba.renderCard
  return {
    enable: renderCard?.enable !== false,
    includeImages: renderCard?.includeImages === true
  }
}

export class Tieba extends Base {
  e: Message
  type: TiebaIdData['type']
  plainVideoTitle: PlainVideoTitleContext

  constructor (e: Message, iddata: TiebaIdData, options?: { plainVideoTitle?: PlainVideoTitleContext }) {
    super(e)
    this.e = e
    this.type = iddata?.type
    this.plainVideoTitle = options?.plainVideoTitle ?? defaultPlainTitleContext()
  }

  async TiebaHandler (data: TiebaIdData) {
    if (!data.tid) {
      await this.e.reply('无法从链接中提取贴吧帖子ID')
      return true
    }

    Config.app.parseTip && await this.e.reply('检测到贴吧链接，开始解析')
    const detail = await getTiebaPostDetail(data.tid, data.pid)
    const { parsedPost: post } = await resolveParsedPostWithCache({
      platform: 'tieba',
      url: data.url ?? `https://tieba.baidu.com/p/${data.tid}`
    })
    const contentTypes = Config.tieba.sendContent ?? ['info', 'image', 'video']
    const renderCard = getRenderCardConfig()
    const hasVideo = post.videos.length > 0
    const hasImage = post.images.length > 0
    const replyImages = contentTypes.includes('image') && renderCard.includeImages
      ? await buildParsedPostImageReplyElements(post)
      : []
    await replyPlainVideoTitle(
      this.e,
      this.plainVideoTitle,
      post.title,
      post.author?.name,
      hasVideo ? 'video' : hasImage ? 'image' : 'text'
    )

    let infoCardSent = false
    if (contentTypes.includes('info')) {
      if (renderCard.enable) {
        infoCardSent = await renderExternalPostCard(this.e, buildExternalPostCardFromParsedPost(post), {
          extraImages: contentTypes.includes('image') && renderCard.includeImages ? replyImages : []
        })
        if (!infoCardSent) {
          await replyAndRecordLongTaskCompletionAnchor(this.e, buildParsedPostInfoText(post))
        }
      } else {
        await replyAndRecordLongTaskCompletionAnchor(this.e, buildParsedPostInfoText(post))
      }
    }

    if (contentTypes.includes('comment')) {
      if (detail.comments.length === 0) {
        await replyAndRecordLongTaskCompletionAnchor(this.e, '这个帖子没有可展示的评论 ~')
      } else {
        await replyAndRecordLongTaskCompletionAnchor(this.e, [
          `【贴吧评论】${detail.title}`,
          ...detail.comments.map(formatCommentLine)
        ].join('\n'))
      }
    }

    if (contentTypes.includes('image') && (!infoCardSent || renderCard.includeImages)) {
      if (!infoCardSent && replyImages.length > 0) {
        await replyAndRecordLongTaskCompletionAnchor(this.e, replyImages)
      }
    }

    if (contentTypes.includes('video')) {
      for (const entry of buildParsedPostVideoDownloadEntries(post)) {
        await downloadVideo(this.e, {
          ...entry.options,
          headers: {
            ...tiebaMediaHeaders(),
            ...(entry.options.headers ?? {})
          }
        })
      }
    }

    return true
  }
}
