import { type Message } from 'node-karin'

import {
  Base,
  createPlainVideoTitleContext,
  replyPlainVideoTitle,
  type PlainVideoTitleContext
} from '@/module'
import { resolveParsedPostWithCache } from '@/module/summaryParse/parsedPostCache'
import { Config } from '@/module/utils/Config'
import { replyAndRecordLongTaskCompletionAnchor } from '@/module/utils/LongTaskCompletionNotify'

import { renderExternalPostCard } from '../externalPostCard'
import {
  buildExternalPostCardFromParsedPost,
  buildParsedPostImageReplyElements,
  buildParsedPostInfoText
} from '../parsedPostAdapters'
import { prepareParsedPostForCardRender } from '../parsedPostAssets'
import type { GithubRepositoryIdData } from './types'

type GithubRuntimeConfig = typeof Config & {
  github?: {
    sendContent?: Array<'info' | 'image'>
    renderCard?: {
      enable?: boolean
      includeImages?: boolean
    }
  }
}

const getSendContent = (): Array<'info' | 'image'> => {
  return ((Config as GithubRuntimeConfig).github?.sendContent ?? ['info', 'image'])
}

const getRenderCardConfig = (): { enable: boolean, includeImages: boolean } => {
  const renderCard = (Config as GithubRuntimeConfig).github?.renderCard
  return {
    enable: renderCard?.enable !== false,
    includeImages: renderCard?.includeImages === true
  }
}

export class Github extends Base {
  e: Message
  data: GithubRepositoryIdData
  plainVideoTitle: PlainVideoTitleContext

  constructor (e: Message, data: GithubRepositoryIdData, options?: { plainVideoTitle?: PlainVideoTitleContext }) {
    super(e)
    this.e = e
    this.data = data
    this.plainVideoTitle = options?.plainVideoTitle ?? createPlainVideoTitleContext(false, 'GitHub', ['text', 'image'])
  }

  async GithubHandler (): Promise<boolean | undefined> {
    Config.app.parseTip && await this.e.reply('检测到 GitHub 仓库链接，开始解析')

    const { parsedPost } = await resolveParsedPostWithCache({
      platform: 'github',
      url: this.data.url
    })
    const post = await prepareParsedPostForCardRender(parsedPost)
    await replyPlainVideoTitle(
      this.e,
      this.plainVideoTitle,
      post.title,
      undefined,
      post.images.length > 0 ? 'image' : 'text'
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
        const images = await buildParsedPostImageReplyElements(post)
        if (images.length > 0) {
          await replyAndRecordLongTaskCompletionAnchor(this.e, images)
        }
      }
    }

    return true
  }
}
