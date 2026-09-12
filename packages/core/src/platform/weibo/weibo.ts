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
import { prepareParsedPostForCardRender } from '../parsedPostAssets'
import { buildWeiboCredentialHeaders } from './api'
import type { WeiboIdData } from './types'

type WeiboRuntimeConfig = typeof Config & {
  weibo?: {
    sendContent?: Array<'info' | 'image' | 'video'>
    renderCard?: {
      enable?: boolean
      includeImages?: boolean
    }
  }
}

const defaultPlainTitleContext = (): PlainVideoTitleContext => createPlainVideoTitleContext(
  Config.weibo.plainTitleReply !== false && (typeof Config.weibo.plainTitleReply === 'boolean' ? Config.weibo.plainTitleReply : Config.weibo.plainTitleReply?.switch !== false),
  '微博',
  typeof Config.weibo.plainTitleReply === 'object' && Array.isArray(Config.weibo.plainTitleReply.types)
    ? Config.weibo.plainTitleReply.types
    : ['text', 'image', 'video']
)

const getSendContent = (): Array<'info' | 'image' | 'video'> => {
  return ((Config as WeiboRuntimeConfig).weibo?.sendContent ?? ['info', 'image', 'video'])
}

const getRenderCardConfig = (): { enable: boolean, includeImages: boolean } => {
  const renderCard = (Config as WeiboRuntimeConfig).weibo?.renderCard
  return {
    enable: renderCard?.enable !== false,
    includeImages: renderCard?.includeImages === true
  }
}

export class Weibo extends Base {
  e: Message
  data: WeiboIdData
  plainVideoTitle: PlainVideoTitleContext

  constructor (e: Message, data: WeiboIdData, options?: { plainVideoTitle?: PlainVideoTitleContext }) {
    super(e)
    this.e = e
    this.data = data
    this.plainVideoTitle = options?.plainVideoTitle ?? defaultPlainTitleContext()
  }

  async WeiboHandler (): Promise<boolean | undefined> {
    Config.app.parseTip && await this.e.reply('检测到微博链接，开始解析')

    const { parsedPost } = await resolveParsedPostWithCache({
      platform: 'weibo',
      url: this.data.url
    })
    const post = await prepareParsedPostForCardRender(parsedPost)
    const sendContent = getSendContent()
    const renderCard = getRenderCardConfig()
    await replyPlainVideoTitle(
      this.e,
      this.plainVideoTitle,
      post.title,
      post.author?.name,
      post.primaryVideo ? 'video' : post.images.length > 0 ? 'image' : 'text'
    )
    const replyImages = sendContent.includes('image') && renderCard.includeImages
      ? await buildParsedPostImageReplyElements(post)
      : []

    let infoCardSent = false
    if (sendContent.includes('info')) {
      if (renderCard.enable) {
        infoCardSent = await renderExternalPostCard(this.e, buildExternalPostCardFromParsedPost(post), {
          extraImages: replyImages
        })
        if (!infoCardSent) {
          await replyAndRecordLongTaskCompletionAnchor(this.e, buildParsedPostInfoText(post))
        }
      } else {
        await replyAndRecordLongTaskCompletionAnchor(this.e, buildParsedPostInfoText(post))
      }
    }

    if (sendContent.includes('image') && (!infoCardSent || renderCard.includeImages) && post.images.length > 0) {
      if (!infoCardSent) {
        const images = replyImages.length > 0 ? replyImages : await buildParsedPostImageReplyElements(post)
        if (images.length > 0) {
          await replyAndRecordLongTaskCompletionAnchor(this.e, images)
        }
      }
    }

    if (sendContent.includes('video') && post.primaryVideo?.url) {
      const entry = buildParsedPostVideoDownloadEntries(post)[0]
      if (!entry) return true
      return await downloadVideo(
        this.e,
        {
          ...entry.options,
          headers: {
            ...buildWeiboCredentialHeaders(entry.options.video_url, post.url),
            ...(entry.options.headers ?? {})
          }
        },
        {
          message_id: this.e.messageId
        }
      )
    }

    return true
  }
}
