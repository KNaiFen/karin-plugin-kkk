import { logger, type Message, segment } from 'node-karin'

import {
  Base,
  baseHeaders,
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
import type { ZhihuIdData } from './types'

type ZhihuRuntimeConfig = typeof Config & {
  zhihu?: {
    sendContent?: string[]
    renderCard?: {
      enable?: boolean
      includeImages?: boolean
    }
  }
}
type ZhihuCookieConfig = typeof Config.cookies & { zhihu?: string }

const getSendContent = (): string[] => {
  return ((Config as ZhihuRuntimeConfig).zhihu?.sendContent ?? ['info', 'image', 'video'])
}

const getRenderCardConfig = (): { enable: boolean, includeImages: boolean } => {
  const renderCard = (Config as ZhihuRuntimeConfig).zhihu?.renderCard
  return {
    enable: renderCard?.enable !== false,
    includeImages: renderCard?.includeImages === true
  }
}

const getZhihuCookie = (): string => {
  return ((Config.cookies as ZhihuCookieConfig).zhihu ?? '').trim()
}

export class Zhihu extends Base {
  e: Message
  data: ZhihuIdData
  plainVideoTitle: PlainVideoTitleContext

  constructor (e: Message, data: ZhihuIdData, options?: { plainVideoTitle?: PlainVideoTitleContext }) {
    super(e)
    this.e = e
    this.data = data
    this.plainVideoTitle = options?.plainVideoTitle ?? createPlainVideoTitleContext(false, '知乎')
    this.headers = {
      ...baseHeaders,
      Cookie: getZhihuCookie(),
      Referer: 'https://www.zhihu.com/'
    }
  }

  async ZhihuHandler (): Promise<boolean | undefined> {
    Config.app.parseTip && await this.e.reply('检测到知乎链接，开始解析')

    const { parsedPost: post } = await resolveParsedPostWithCache({
      platform: 'zhihu',
      url: this.data.url
    })
    await replyPlainVideoTitle(
      this.e,
      this.plainVideoTitle,
      post.title,
      post.author?.name,
      post.primaryVideo ? 'video' : post.images.length > 0 ? 'image' : 'text'
    )

    const sendContent = getSendContent()
    const renderCard = getRenderCardConfig()
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
      if (!infoCardSent) {
        for (const image of await buildParsedPostImageReplyElements(post)) {
          await replyAndRecordLongTaskCompletionAnchor(this.e, image)
        }
      }
    }

    if (sendContent.includes('video')) {
      if ((post.raw.detail as { richContent?: { lensIds?: string[]; videos?: unknown[] } } | undefined)?.richContent?.lensIds?.length &&
        post.videos.length === 0) {
        await this.e.reply('检测到知乎内嵌视频，但暂未获取到可下载播放地址')
      }

      let sent = false
      for (const entry of buildParsedPostVideoDownloadEntries(post)) {
        logger.info(`[Zhihu] 开始下载内嵌视频：${entry.video.title || post.title}，备用地址 ${entry.video.backupUrls?.length ?? 0} 个`)
        sent = await downloadVideo(
          this.e,
          {
            ...entry.options,
            headers: {
              ...baseHeaders,
              Cookie: getZhihuCookie(),
              Referer: post.url,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              ...(entry.options.headers ?? {})
            }
          },
          {
            message_id: this.e.messageId
          }
        ) || sent
      }
      return sent || undefined
    }

    return true
  }
}
