import { type Message, segment } from 'node-karin'

import {
  Base,
  baseHeaders,
  createPlainVideoTitleContext,
  downloadVideo,
  replyPlainVideoTitle,
  type PlainVideoTitleContext
} from '@/module'
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
import { fetchHeyboxDetail } from './api'
import type { HeyboxConfig, HeyboxDetail, HeyboxIdData, HeyboxSendContent } from './types'

type ConfigWithHeybox = typeof Config & {
  heybox?: HeyboxConfig
  cookies: typeof Config.cookies & {
    heybox?: string
  }
}

const getHeyboxSendContent = (): HeyboxSendContent[] => {
  const config = Config as ConfigWithHeybox
  return config.heybox?.sendContent?.length
    ? config.heybox.sendContent
    : ['info', 'image', 'video', 'comment']
}

const getRenderCardConfig = (): { enable: boolean, includeImages: boolean } => {
  const renderCard = (Config as ConfigWithHeybox).heybox?.renderCard
  return {
    enable: renderCard?.enable !== false,
    includeImages: renderCard?.includeImages === true
  }
}

const getHeyboxCookie = (): string => {
  const cookie = (Config as ConfigWithHeybox).cookies.heybox ?? ''
  if (!cookie.trim()) {
    throw new Error('我还没有小黑盒 Cookie，暂时无法解析；请先配置包含 x_xhh_tokenid 的 Config.cookies.heybox。')
  }
  if (!/(?:^|;\s*)x_xhh_tokenid=/.test(cookie)) {
    throw new Error('小黑盒 Cookie 缺少 x_xhh_tokenid，暂时无法解析。')
  }
  return cookie
}

const countText = (value: number): string => {
  if (value >= 10000) return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万`
  return String(value)
}

const buildInfoText = (detail: HeyboxDetail): string => {
  const lines = [
    `小黑盒：${detail.title}`,
    `作者：${detail.author.name}`,
    `浏览 ${countText(detail.stats.view)} / 点赞 ${countText(detail.stats.like)} / 评论 ${countText(detail.stats.comment)} / 收藏 ${countText(detail.stats.collect)}`,
    detail.url
  ]
  const texts = detail.content.filter(part => part.type === 'text').map(part => part.text).join('\n').trim()
  if (texts) {
    lines.splice(2, 0, texts.length > 500 ? `${texts.slice(0, 500)}...` : texts)
  } else if (detail.description) {
    lines.splice(2, 0, detail.description)
  }
  return lines.filter(Boolean).join('\n')
}

const buildCommentText = (detail: HeyboxDetail): string => {
  if (detail.comments.length === 0) return '这个小黑盒帖子没有评论 ~'
  const lines = [`小黑盒热评（${detail.comments.length}）`]
  for (const [index, comment] of detail.comments.slice(0, 5).entries()) {
    const text = comment.content
      .filter(part => part.type === 'text')
      .map(part => part.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    lines.push(`${index + 1}. ${comment.author.name}：${text || '[图片]'}（赞 ${countText(comment.stats.like)} / 回复 ${countText(comment.stats.reply)}）`)
  }
  return lines.join('\n')
}

const safeVideoTitle = (title: string, linkId: string): string => {
  const safeTitle = title.substring(0, 80).replace(/[\\/:*?"<>|\r\n]/g, ' ').trim()
  return safeTitle || `Heybox_${linkId}`
}

export class Heybox extends Base {
  e: Message
  data: HeyboxIdData
  plainVideoTitle: PlainVideoTitleContext

  constructor (e: Message, data: HeyboxIdData, options?: { plainVideoTitle?: PlainVideoTitleContext }) {
    super(e)
    this.e = e
    this.data = data
    this.plainVideoTitle = options?.plainVideoTitle ?? createPlainVideoTitleContext(false, '小黑盒')
  }

  async HeyboxHandler (data = this.data): Promise<boolean> {
    Config.app.parseTip && await this.e.reply('检测到小黑盒链接，开始解析')

    if (!data.link_id) {
      throw new Error('小黑盒帖子 ID 为空，无法解析')
    }

    const cookie = getHeyboxCookie()
    const detail = await fetchHeyboxDetail({ linkId: data.link_id, cookie })
    const { parsedPost: post } = await resolveParsedPostWithCache({
      platform: 'heybox',
      url: data.url ?? `https://api.xiaoheihe.cn/bbs/app/link/${data.link_id}`
    })
    const sendContent = getHeyboxSendContent()
    const renderCard = getRenderCardConfig()
    const extraImages = sendContent.includes('image') && renderCard.includeImages
      ? await buildParsedPostImageReplyElements(post)
      : []

    await replyPlainVideoTitle(
      this.e,
      this.plainVideoTitle,
      post.title,
      post.author?.name,
      post.primaryVideo ? 'video' : post.images.length > 0 ? 'image' : 'text'
    )

    let infoCardSent = false
    if (sendContent.includes('info')) {
      if (renderCard.enable) {
        infoCardSent = await renderExternalPostCard(this.e, buildExternalPostCardFromParsedPost(post), {
          extraImages
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
        await replyAndRecordLongTaskCompletionAnchor(this.e, await buildParsedPostImageReplyElements(post))
      }
    }

    if (sendContent.includes('comment')) {
      await replyAndRecordLongTaskCompletionAnchor(this.e, buildCommentText(detail))
    }

    if (sendContent.includes('video') && post.primaryVideo?.url) {
      const entry = buildParsedPostVideoDownloadEntries(post)[0]
      if (!entry) return true
      return await downloadVideo(
        this.e,
        {
          ...entry.options,
          headers: {
            ...baseHeaders,
            Cookie: cookie,
            Referer: post.url,
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

export type { HeyboxSendContent }
