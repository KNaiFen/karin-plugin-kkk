import { logger, type Message } from 'node-karin'

import {
  Base,
  createPlainVideoTitleContext,
  type PlainVideoTitleContext,
  replyPlainVideoTitle } from '@/module'
import { resolveParsedPostWithCache } from '@/module/summaryParse/parsedPostCache'
import { Config } from '@/module/utils/Config'
import { replyAndRecordLongTaskCompletionAnchor } from '@/module/utils/LongTaskCompletionNotify'

import { renderExternalPostCard } from '../externalPostCard'
import {
  buildExternalPostCardFromParsedPost,
  buildParsedPostImageReplyElements,
  buildParsedPostInfoText
} from '../parsedPostAdapters'
import type { WechatIdData } from './getID'

type WechatRuntimeConfig = typeof Config & {
  wechat?: {
    sendContent?: string[]
    renderCard?: {
      enable?: boolean
      includeImages?: boolean
    }
  }
}

const getSendContent = (): string[] => {
  return ((Config as WechatRuntimeConfig).wechat?.sendContent ?? ['info', 'image'])
}

const getRenderCardConfig = (): { enable: boolean, includeImages: boolean } => {
  const renderCard = (Config as WechatRuntimeConfig).wechat?.renderCard
  return {
    enable: renderCard?.enable !== false,
    includeImages: renderCard?.includeImages === true
  }
}

export class Wechat extends Base {
  e: Message
  data: WechatIdData
  plainVideoTitle: PlainVideoTitleContext

  constructor (e: Message, data: WechatIdData, options?: { plainVideoTitle?: PlainVideoTitleContext }) {
    super(e)
    this.e = e
    this.data = data
    this.plainVideoTitle = options?.plainVideoTitle ?? createPlainVideoTitleContext(false, '微信公众号')
  }

  async WechatHandler (data = this.data): Promise<boolean> {
    Config.app.parseTip && await this.e.reply('检测到微信公众号链接，开始解析')

    const { parsedPost: post } = await resolveParsedPostWithCache({
      platform: 'wechat',
      url: data.url
    })
    const sendContent = getSendContent()
    const renderCard = getRenderCardConfig()
    const contentType = post.images.length > 0 ? 'image' : 'text'

    await replyPlainVideoTitle(
      this.e,
      this.plainVideoTitle,
      post.title,
      post.author?.name,
      contentType
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

    if (sendContent.includes('image') && (!infoCardSent || renderCard.includeImages)) {
      if (!infoCardSent && post.images.length > 0) {
        await replyAndRecordLongTaskCompletionAnchor(this.e, await buildParsedPostImageReplyElements(post))
      }
    }

    logger.info(`[Wechat] 文章解析完成：${post.title}`)
    return true
  }
}
