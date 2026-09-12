import type { Message } from 'node-karin'
import type { PlainTitleReplyType, plainTitleReplyConfig, plainTitleReplyConfigCompat } from '@/types/config/plainTitleReply'

export type PlainVideoTitlePlatform = 'B站' | '抖音' | '小红书' | 'TikTok' | '小黑盒' | 'GitHub' | '快手' | 'X' | '知乎' | '贴吧' | '微信公众号' | '微博'

export type PlainVideoTitleContext = {
  enabled: boolean
  platformLabel: PlainVideoTitlePlatform
  types: PlainTitleReplyType[]
  sent: boolean
}

export type { PlainTitleReplyType, plainTitleReplyConfig, plainTitleReplyConfigCompat }

const plainTitleReplyTypes: PlainTitleReplyType[] = ['video', 'image', 'article', 'live', 'text']

export const isPlainTitleReplyType = (value: unknown): value is PlainTitleReplyType => {
  return plainTitleReplyTypes.includes(value as PlainTitleReplyType)
}

export const normalizePlainTitleReplyConfig = (
  config: plainTitleReplyConfigCompat | undefined,
  defaultTypes: PlainTitleReplyType[]
): plainTitleReplyConfig => {
  const normalizedDefaultTypes = defaultTypes.filter(isPlainTitleReplyType)

  if (typeof config === 'boolean') {
    return {
      switch: config,
      types: normalizedDefaultTypes
    }
  }

  if (!config || typeof config !== 'object') {
    return {
      switch: true,
      types: normalizedDefaultTypes
    }
  }

  const configuredTypes = Array.isArray(config.types)
    ? config.types.filter(isPlainTitleReplyType).filter(type => normalizedDefaultTypes.includes(type))
    : normalizedDefaultTypes

  return {
    switch: config.switch !== false,
    types: configuredTypes
  }
}

export const createPlainVideoTitleContext = (
  enabled: boolean,
  platformLabel: PlainVideoTitlePlatform,
  types: PlainTitleReplyType[] = plainTitleReplyTypes
): PlainVideoTitleContext => ({
  enabled,
  platformLabel,
  types: types.filter(isPlainTitleReplyType),
  sent: false
})

const normalizePlainText = (value: unknown): string => {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

export const replyPlainVideoTitle = async (
  event: Message,
  context: PlainVideoTitleContext,
  title: unknown,
  author?: unknown,
  type: PlainTitleReplyType = 'video'
): Promise<boolean> => {
  if (!context.enabled || context.sent) return false
  if (!context.types.includes(type)) return false

  const normalizedTitle = normalizePlainText(title)
  if (!normalizedTitle) return false

  const normalizedAuthor = normalizePlainText(author)
  const message = normalizedAuthor
    ? `【${context.platformLabel}】${normalizedAuthor}：${normalizedTitle}`
    : `${context.platformLabel}标题：${normalizedTitle}`

  context.sent = true
  await event.reply(message)
  return true
}
