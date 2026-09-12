import { logger, type Message } from 'node-karin'

import {
  Base,
  baseHeaders,
  buildConfiguredRequestOptions,
  createPlainVideoTitleContext,
  downloadVideo,
  type PlainVideoTitleContext,
  replyPlainVideoTitle } from '@/module'
import { resolveParsedPostWithCache } from '@/module/summaryParse/parsedPostCache'
import { Config } from '@/module/utils/Config'
import { replyAndRecordLongTaskCompletionAnchor } from '@/module/utils/LongTaskCompletionNotify'

import {
  renderExternalPostCard
} from '../externalPostCard'
import {
  buildExternalPostCardFromParsedPost,
  buildParsedPostImageReplyElements,
  buildParsedPostInfoText,
  buildParsedPostVideoDownloadEntries
} from '../parsedPostAdapters'
import { prepareParsedPostForCardRender } from '../parsedPostAssets'
import { buildXNetworkOptions } from './request'
import type { XIdData } from './types'

type XRuntimeConfig = typeof Config & {
  x?: {
    sendContent?: Array<'info' | 'image' | 'video'>
    renderCard?: {
      enable?: boolean
      includeImages?: boolean
    }
  }
}

const getSendContent = (): Array<'info' | 'image' | 'video'> => {
  return ((Config as XRuntimeConfig).x?.sendContent ?? ['info', 'image', 'video'])
}

const getRenderCardConfig = (): { enable: boolean, includeImages: boolean } => {
  const renderCard = (Config as XRuntimeConfig).x?.renderCard
  return {
    enable: renderCard?.enable !== false,
    includeImages: renderCard?.includeImages === true
  }
}

export class X extends Base {
  e: Message
  data: XIdData
  plainVideoTitle: PlainVideoTitleContext

  constructor (e: Message, data: XIdData, options?: { plainVideoTitle?: PlainVideoTitleContext }) {
    super(e)
    this.e = e
    this.data = data
    this.plainVideoTitle = options?.plainVideoTitle ?? createPlainVideoTitleContext(false, 'X')
  }

  async XHandler (): Promise<boolean | undefined> {
    Config.app.parseTip && await this.e.reply('检测到 X 链接，开始解析')

    const { parsedPost: post } = await resolveParsedPostWithCache({
      platform: 'x',
      url: this.data.url
    })
    const preparedPost = await prepareParsedPostForCardRender(post)
    const title = preparedPost.title
    const contentType = preparedPost.primaryVideo ? 'video' : preparedPost.images.length > 0 ? 'image' : 'text'

    await replyPlainVideoTitle(this.e, this.plainVideoTitle, title, preparedPost.author?.name, contentType)

    const sendContent = getSendContent()
    const renderCard = getRenderCardConfig()
    const replyImages = sendContent.includes('image') && renderCard.includeImages
      ? await buildParsedPostImageReplyElements(preparedPost)
      : []
    let infoCardSent = false

    if (sendContent.includes('info')) {
      if (renderCard.enable) {
        infoCardSent = await renderExternalPostCard(this.e, buildExternalPostCardFromParsedPost(preparedPost), {
          extraImages: replyImages
        })
        if (!infoCardSent) {
          await replyAndRecordLongTaskCompletionAnchor(this.e, buildParsedPostInfoText(preparedPost))
        }
      } else {
        await replyAndRecordLongTaskCompletionAnchor(this.e, buildParsedPostInfoText(preparedPost))
      }
    }

    if (sendContent.includes('image') && (!infoCardSent || renderCard.includeImages)) {
      if (!infoCardSent) {
        for (const image of await buildParsedPostImageReplyElements(preparedPost)) {
          await replyAndRecordLongTaskCompletionAnchor(this.e, image)
        }
      }
    }

    if (sendContent.includes('video')) {
      const entry = buildParsedPostVideoDownloadEntries(preparedPost)[0]
      if (!entry) return true

      logger.info(`[X] 开始下载视频：${entry.video.url}`)
      const requestOptions = buildConfiguredRequestOptions(Config.request)
      return await downloadVideo(
        this.e,
        {
          ...entry.options,
          headers: {
            ...baseHeaders,
            ...requestOptions.headers,
            ...(entry.options.headers ?? {}),
            Referer: preparedPost.url
          },
          networkOptions: buildXNetworkOptions()
        },
        {
          message_id: this.e.messageId
        }
      )
    }

    return true
  }
}
