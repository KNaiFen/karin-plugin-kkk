import { logger, type Message, segment } from 'node-karin'

import {
  Base,
  createPlainVideoTitleContext,
  downloadVideo,
  type PlainVideoTitleContext,
  replyPlainVideoTitle } from '@/module'
import { resolveParsedPostWithCache } from '@/module/summaryParse/parsedPostCache'
import { Config } from '@/module/utils/Config'
import { replyAndRecordLongTaskCompletionAnchor } from '@/module/utils/LongTaskCompletionNotify'
import { executeSafeAxiosRequest } from '@/module/utils/OutboundRequest'

import type { ExternalPostContentBlock } from '../externalPostCard'
import { renderExternalPostCard } from '../externalPostCard'
import {
  buildExternalPostCardFromParsedPost,
  buildParsedPostImageReplyElements,
  buildParsedPostInfoText,
  buildParsedPostVideoDownloadEntries
} from '../parsedPostAdapters'
import { prepareParsedPostForCardRender } from '../parsedPostAssets'
import {
  buildWeiboCredentialHeaders,
  shouldPrefetchWeiboMedia
} from './api'
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

const normalizeImageContentType = (value: unknown): string => {
  const contentType = String(value ?? '').trim().toLowerCase()
  if (contentType.startsWith('image/')) return contentType.split(';')[0]
  return 'image/jpeg'
}

const isEmbeddedRenderableImage = (value: string): boolean => {
  return value.startsWith('data:image/') || value.startsWith('base64://') || value.startsWith('file://')
}

const toRenderDataUrl = async (url: string, referer: string): Promise<string> => {
  if (!url || isEmbeddedRenderableImage(url)) return url
  if (!shouldPrefetchWeiboMedia(url)) {
    throw new Error(`微博媒体地址不在白名单内，已拒绝预取: ${url}`)
  }

  const { response } = await executeSafeAxiosRequest({
    url,
    method: 'GET',
    responseType: 'arraybuffer',
    timeout: 15000,
    headers: buildWeiboCredentialHeaders(url, referer)
  }, {
    profile: 'weibo-media'
  })
  const mime = normalizeImageContentType(response.headers?.['content-type'])
  const buffer = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data)
  return `data:${mime};base64,${buffer.toString('base64')}`
}

const toReplyImageUrl = async (url: string, referer: string): Promise<string> => {
  const dataUrl = await toRenderDataUrl(url, referer)
  const base64Prefix = ';base64,'
  if (!dataUrl.startsWith('data:image/') || !dataUrl.includes(base64Prefix)) return dataUrl
  return `base64://${dataUrl.slice(dataUrl.indexOf(base64Prefix) + base64Prefix.length)}`
}

type WeiboRenderAssetResolver = (url: string) => Promise<string>

const createRenderAssetResolver = (referer: string): WeiboRenderAssetResolver => {
  const cache = new Map<string, Promise<string>>()

  return async (url: string) => {
    if (!url || isEmbeddedRenderableImage(url)) return url

    const cached = cache.get(url)
    if (cached) return await cached

    const task = toRenderDataUrl(url, referer)
    cache.set(url, task)
    return await task
  }
}

const normalizeTitle = (value: string, fallback: string): string => {
  const safeTitle = value.substring(0, 80).replace(/[\\/:*?"<>|\r\n]/g, ' ').trim()
  return safeTitle || fallback
}

const getWeiboImageIdentity = (value: string): string => {
  const normalized = value.trim()
  if (!normalized) return ''
  if (normalized.startsWith('data:image/') || normalized.startsWith('base64://') || normalized.startsWith('file://')) {
    return normalized
  }

  try {
    const parsed = new URL(normalized)
    return parsed.pathname.split('/').filter(Boolean).at(-1)?.toLowerCase() ?? normalized.toLowerCase()
  } catch {
    return normalized.split('?')[0].split('/').filter(Boolean).at(-1)?.toLowerCase() ?? normalized.toLowerCase()
  }
}

const dedupeWeiboImages = (images: string[]): string[] => {
  const seen = new Set<string>()
  const deduped: string[] = []

  for (const image of images) {
    const identity = getWeiboImageIdentity(image)
    if (!identity || seen.has(identity)) continue
    seen.add(identity)
    deduped.push(image)
  }

  return deduped
}

const dedupeWeiboImageBlocks = (blocks: ExternalPostContentBlock[]): ExternalPostContentBlock[] => {
  const seen = new Set<string>()
  const deduped: ExternalPostContentBlock[] = []

  for (const block of blocks) {
    if (block.type !== 'image') {
      deduped.push(block)
      continue
    }

    const identity = getWeiboImageIdentity(block.url)
    if (!identity || seen.has(identity)) continue
    seen.add(identity)
    deduped.push(block)
  }

  return deduped
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
