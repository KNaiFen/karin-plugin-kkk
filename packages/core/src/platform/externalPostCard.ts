import { logger, type ElementTypes, type Message } from 'node-karin'

import { Render, replyRenderedImages } from '@/module'

export type ExternalPostPlatformKey =
  | 'zhihu'
  | 'tieba'
  | 'heybox'
  | 'weibo'
  | 'x'
  | 'bilibili'
  | 'douyin'
  | 'wechat'
  | 'xiaohongshu'
  | 'tiktok'
  | 'kuaishou'
  | 'github'

export type ExternalPostContentBlock =
  | { type: 'html', html: string, trusted?: boolean }
  | { type: 'text', text: string }
  | { type: 'image', url: string, alt?: string }

export type ExternalPostPagination = {
  pageIndex: number
  pageCount: number
}

export type ExternalPostCardData = {
  platform: {
    key: ExternalPostPlatformKey
    label: string
    accentColor: string
  }
  title: string
  author: {
    name: string
    avatar?: string
  }
  summary: string
  url: string
  images: string[]
  content?: ExternalPostContentBlock[]
  stats: Array<{
    label: string
    value: string
  }>
  meta: Array<{
    label: string
    value: string
  }>
  pagination?: ExternalPostPagination
}

export const normalizeExternalPostText = (value: unknown): string => {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

export const truncateExternalPostText = (value: unknown, maxLength = 900): string => {
  const normalized = normalizeExternalPostText(value)
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength)}...`
}

const normalizeExternalPostUrl = (value: unknown): string => {
  const url = String(value ?? '').trim().replace(/\\+$/, '')
  if (!url) return ''
  if (url.startsWith('//')) return `https:${url}`
  return url
}

const escapeExternalPostAttribute = (value: string): string => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const decodeExternalPostEntities = (value: string): string => {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
}

const imageAttributePattern = /(?:data-original|data-actualsrc|data-default-watermark-src|data-src|src)\s*=\s*(["'])(.*?)\1/i

const extractExternalPostImageUrl = (html: string): string => {
  const match = html.match(imageAttributePattern)
  return normalizeExternalPostUrl(match?.[2])
}

const unsafeElementPattern = /<\s*(script|style|iframe|object|embed|svg|math|canvas|form|input|button|textarea|select)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi
const allowedHtmlTags = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ul', 'ol', 'li',
  'blockquote', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'code', 'pre',
  'div', 'span', 'figcaption'
])

const githubAllowedHtmlTags = new Set([
  ...allowedHtmlTags,
  'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr',
  'details', 'summary', 'kbd', 'sub', 'sup', 'figure', 'picture', 'source'
])

const sanitizeExternalPostHref = (attrs: string): string => {
  const hrefMatch = attrs.match(/\bhref\s*=\s*(["'])(.*?)\1/i)
  const href = normalizeExternalPostUrl(hrefMatch?.[2])
  if (!href || /^(?:javascript|data|vbscript):/i.test(href)) return ''
  return ` href="${escapeExternalPostAttribute(href)}"`
}

export const sanitizeExternalPostHtml = (
  value: unknown,
  options?: {
    trustedPlatform?: ExternalPostPlatformKey
  }
): string => {
  const trustedGithub = options?.trustedPlatform === 'github'
  const currentAllowedTags = trustedGithub ? githubAllowedHtmlTags : allowedHtmlTags
  const source = String(value ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(unsafeElementPattern, '')
    .replace(trustedGithub ? /$^/ : /<img\b[^>]*>/gi, '')

  return source
    .replace(/<\s*(\/?)\s*([a-z0-9-]+)([^>]*)>/gi, (full, close: string, tagName: string, attrs: string) => {
      const tag = tagName.toLowerCase()
      if (!currentAllowedTags.has(tag)) return ''
      if (tag === 'br') return '<br>'
      if (close) return `</${tag}>`
      if (tag === 'a') return `<a${sanitizeExternalPostHref(attrs)}>`
      if (trustedGithub && tag === 'img') {
        const srcMatch = attrs.match(/\bsrc\s*=\s*(["'])(.*?)\1/i)
        const altMatch = attrs.match(/\balt\s*=\s*(["'])(.*?)\1/i)
        const titleMatch = attrs.match(/\btitle\s*=\s*(["'])(.*?)\1/i)
        const src = normalizeExternalPostUrl(srcMatch?.[2])
        if (!src || /^(?:javascript|data|vbscript):/i.test(src)) return ''
        const alt = altMatch?.[2] ? ` alt="${escapeExternalPostAttribute(String(altMatch[2]))}"` : ''
        const title = titleMatch?.[2] ? ` title="${escapeExternalPostAttribute(String(titleMatch[2]))}"` : ''
        return `<img src="${escapeExternalPostAttribute(src)}"${alt}${title}>`
      }
      return `<${tag}>`
    })
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/<div>\s*<\/div>/gi, '')
    .trim()
}

const hasVisibleExternalPostHtml = (html: string): boolean => {
  return decodeExternalPostEntities(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .length > 0
}

const pushHtmlBlock = (
  blocks: ExternalPostContentBlock[],
  html: string,
  options?: {
    trustedPlatform?: ExternalPostPlatformKey
  }
): void => {
  const sanitized = sanitizeExternalPostHtml(html, options)
  if (hasVisibleExternalPostHtml(sanitized)) {
    blocks.push({ type: 'html', html: sanitized, trusted: Boolean(options?.trustedPlatform) })
  }
}

const imageWrapperPattern = /(?:<figure\b[^>]*>\s*)?<img\b[^>]*(?:data-original|data-actualsrc|data-default-watermark-src|data-src|src)\s*=\s*(["'])(.*?)\1[^>]*>(?:\s*<\/figure>)?/gi

export const createExternalPostContentFromHtml = (
  html: unknown,
  fallbackImages: string[] = []
): ExternalPostContentBlock[] => {
  const source = String(html ?? '').replace(/\\"/g, '"')
  const blocks: ExternalPostContentBlock[] = []
  const usedImages = new Set<string>()
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = imageWrapperPattern.exec(source)) !== null) {
    pushHtmlBlock(blocks, source.slice(cursor, match.index))
    const imageUrl = normalizeExternalPostUrl(match[2] || extractExternalPostImageUrl(match[0]))
    if (imageUrl) {
      usedImages.add(imageUrl)
      blocks.push({ type: 'image', url: imageUrl })
    }
    cursor = match.index + match[0].length
  }

  pushHtmlBlock(blocks, source.slice(cursor))

  for (const image of fallbackImages) {
    const url = normalizeExternalPostUrl(image)
    if (url && !usedImages.has(url)) {
      usedImages.add(url)
      blocks.push({ type: 'image', url })
    }
  }

  return blocks
}

type ExternalPostPartLike =
  | { type: 'text', text?: unknown }
  | { type: 'image', url?: unknown }
  | { type: 'sticker', url?: unknown, desc?: unknown }
  | { type: 'link', url?: unknown, title?: unknown }
  | { type: 'video', cover?: unknown }

export const createExternalPostContentFromParts = (
  parts: ExternalPostPartLike[]
): ExternalPostContentBlock[] => {
  const blocks: ExternalPostContentBlock[] = []

  for (const part of parts) {
    if (part.type === 'text') {
      const text = String(part.text ?? '').trim()
      if (text) blocks.push({ type: 'text', text })
      continue
    }

    if (part.type === 'image') {
      const url = normalizeExternalPostUrl(part.url)
      if (url) blocks.push({ type: 'image', url })
      continue
    }

    if (part.type === 'sticker') {
      const url = normalizeExternalPostUrl(part.url)
      if (url) blocks.push({ type: 'image', url, alt: normalizeExternalPostText(part.desc || '表情') })
      continue
    }

    if (part.type === 'link') {
      const url = normalizeExternalPostUrl(part.url)
      const title = normalizeExternalPostText(part.title || url)
      if (url && title) {
        blocks.push({ type: 'html', html: `<p><a href="${escapeExternalPostAttribute(url)}">${title}</a></p>` })
      }
      continue
    }

    if (part.type === 'video') {
      const cover = normalizeExternalPostUrl(part.cover)
      if (cover) blocks.push({ type: 'image', url: cover, alt: '视频封面' })
    }
  }

  return blocks
}

export const createExternalPostStats = (
  entries: Array<[string, unknown]>
): ExternalPostCardData['stats'] => {
  return entries
    .map(([label, value]) => [label, normalizeExternalPostText(value)] as const)
    .filter(([, value]) => value && value !== '0')
    .map(([label, value]) => ({ label, value }))
}

export const createExternalPostMeta = (
  entries: Array<[string, unknown]>
): ExternalPostCardData['meta'] => {
  return entries
    .map(([label, value]) => [label, normalizeExternalPostText(value)] as const)
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => ({ label, value }))
}

export const paginateExternalPostCardData = (data: ExternalPostCardData): ExternalPostCardData[] => {
  return [data]
}

export const renderExternalPostCard = async (
  event: Message,
  data: ExternalPostCardData,
  options?: {
    extraImages?: ElementTypes[]
  }
): Promise<boolean> => {
  try {
    const startedAt = Date.now()
    logger.debug(`[ExternalPostCard] ${data.platform.label} 开始渲染完整长卡`)
    const renderedPages = await Render(event, 'other/external-post', data, { multiPage: true })
    logger.debug(`[ExternalPostCard] ${data.platform.label} 完整长卡渲染完成，共 ${renderedPages.length} 页，耗时 ${Date.now() - startedAt}ms`)

    const img = [
      ...renderedPages,
      ...((options?.extraImages ?? []).filter(Boolean))
    ]
    await replyRenderedImages(event, img, {
      source: '图片合集',
      summary: `查看${img.length}张图片消息`,
      prompt: `${data.platform.label}解析结果`,
      news: [{ text: `点击查看${data.platform.label}解析结果` }]
    })
    return true
  } catch (error) {
    logger.warn(`[ExternalPostCard] ${data.platform.label} 渲染卡生成失败，回退文本/原图发送: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}
