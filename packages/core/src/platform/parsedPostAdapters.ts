import { segment } from 'node-karin'

import type { SummaryInput } from '@/module/summaryParse/types'
import { buildSharedCacheHash, type CacheIdentity } from '@/module/utils/sharedCache'

import type { ExternalPostCardData, ExternalPostContentBlock } from './externalPostCard'
import type {
  ParsedPost,
  ParsedPostBlock,
  ParsedPostStatsItem,
  ParsedPostVideo
} from './parsedPost'

const decodeHtmlToText = (html: string): string => {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|blockquote|h[1-6]|figcaption)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

const sanitizeExternalPostHtml = (
  value: string,
  options?: {
    trustedPlatform?: string
  }
): string => {
  const trustedGithub = options?.trustedPlatform === 'github'
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
  const currentAllowedTags = trustedGithub ? githubAllowedHtmlTags : allowedHtmlTags

  const escapeAttribute = (input: string): string => {
    return input
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  const sanitizeHref = (attrs: string): string => {
    const hrefMatch = attrs.match(/\bhref\s*=\s*(["'])(.*?)\1/i)
    const href = String(hrefMatch?.[2] ?? '').trim()
    if (!href || /^(?:javascript|data|vbscript):/i.test(href)) return ''
    return ` href="${escapeAttribute(href)}"`
  }

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
      if (tag === 'a') return `<a${sanitizeHref(attrs)}>`
      if (trustedGithub && tag === 'img') {
        const srcMatch = attrs.match(/\bsrc\s*=\s*(["'])(.*?)\1/i)
        const altMatch = attrs.match(/\balt\s*=\s*(["'])(.*?)\1/i)
        const titleMatch = attrs.match(/\btitle\s*=\s*(["'])(.*?)\1/i)
        const src = String(srcMatch?.[2] ?? '').trim()
        if (!src || /^(?:javascript|data|vbscript):/i.test(src)) return ''
        const alt = altMatch?.[2] ? ` alt="${escapeAttribute(String(altMatch[2]))}"` : ''
        const title = titleMatch?.[2] ? ` title="${escapeAttribute(String(titleMatch[2]))}"` : ''
        return `<img src="${escapeAttribute(src)}"${alt}${title}>`
      }
      return `<${tag}>`
    })
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/<div>\s*<\/div>/gi, '')
    .trim()
}

const normalizeStatItems = (items: ParsedPostStatsItem[]): ParsedPostStatsItem[] => {
  return items.filter(item => item.label && item.value)
}

const getTrustedPlatform = (post: ParsedPost): string | undefined => {
  return typeof post.raw.trustedRichTextPlatform === 'string' ? post.raw.trustedRichTextPlatform : undefined
}

const normalizeSummaryBlock = (
  block: ParsedPostBlock,
  options?: {
    trustedPlatform?: string
  }
): SummaryInput['blocks'][number] | null => {
  if (block.type === 'text') {
    const text = block.text.trim()
    return text ? { type: 'text', text } : null
  }

  if (block.type === 'html') {
    const html = sanitizeExternalPostHtml(block.html, options)
    const text = block.text?.trim() || decodeHtmlToText(html)
    return html && text ? { type: 'html', html, text } : null
  }

  if (block.type === 'image') {
    return block.url ? { type: 'image', url: block.url, alt: block.alt } : null
  }

  return block.url
    ? {
      type: 'video',
      url: block.url,
      title: block.title,
      cover: block.cover
    }
    : null
}

const normalizeContentBlock = (
  block: ParsedPostBlock,
  options?: {
    trustedPlatform?: string
  }
): ExternalPostContentBlock | null => {
  if (block.type === 'text') {
    const text = block.text.trim()
    return text ? { type: 'text', text } : null
  }

  if (block.type === 'html') {
    const html = sanitizeExternalPostHtml(block.html, options)
    return html
      ? {
        type: 'html',
        html,
        ...(options?.trustedPlatform ? { trusted: true } : {})
      }
      : null
  }

  if (block.type === 'image') {
    return block.url ? { type: 'image', url: block.url, alt: block.alt } : null
  }

  return block.cover ? { type: 'image', url: block.cover, alt: '视频封面' } : null
}

export const buildSummaryInputFromParsedPost = (
  post: ParsedPost,
  shareContext?: string
): SummaryInput => {
  const trustedPlatform = getTrustedPlatform(post)
  return {
    platform: post.platform,
    platformLabel: post.platformLabel,
    title: post.title,
    author: post.author?.name,
    summary: post.summary,
    blocks: post.contentBlocks
      .map(block => {
        if (block.type !== 'html') return normalizeSummaryBlock(block, { trustedPlatform })
        const html = sanitizeExternalPostHtml(block.html, { trustedPlatform })
        const text = block.text?.trim() || decodeHtmlToText(html)
        return html && text ? { type: 'html', html, text } : null
      })
      .filter((item): item is SummaryInput['blocks'][number] => Boolean(item)),
    videos: post.videos.map(video => ({
      type: 'video',
      url: video.url,
      title: video.title,
      cover: video.cover,
      backupUrls: video.backupUrls,
      audioUrl: video.audioUrl,
      audioBackupUrls: video.audioBackupUrls,
      asrSourceType: video.asrSourceType,
      asrSourceUrl: video.asrSourceUrl,
      asrSourceBackupUrls: video.asrSourceBackupUrls,
      durationSeconds: video.durationSeconds,
      subtitles: video.subtitles,
      headers: video.headers
    })),
    stats: normalizeStatItems(post.stats),
    meta: normalizeStatItems(post.meta),
    shareContext,
    asrTexts: [],
    videoFrames: [],
    rawSource: post
  }
}

export const buildExternalPostCardFromParsedPost = (post: ParsedPost): ExternalPostCardData => {
  const trustedPlatform = getTrustedPlatform(post)
  return {
    platform: {
      key: post.platform,
      label: post.platformLabel,
      accentColor: String(post.raw.accentColor ?? '#3b82f6')
    },
    title: post.title,
    author: {
      name: post.author?.name || post.platformLabel,
      avatar: post.author?.avatar
    },
    summary: post.summary || '',
    url: post.url,
    images: post.images.map(image => image.url),
    content: post.contentBlocks
      .map(block => normalizeContentBlock(block, { trustedPlatform }))
      .filter((item): item is ExternalPostContentBlock => Boolean(item)),
    stats: normalizeStatItems(post.stats),
    meta: normalizeStatItems(post.meta)
  }
}

export const buildParsedPostImageReplyElements = async (post: ParsedPost) => {
  const replyImages = Array.isArray(post.raw.replyImages) && post.raw.replyImages.length > 0
    ? post.raw.replyImages
    : post.images.map(image => image.url)

  return replyImages
    .filter((item): item is string => typeof item === 'string' && item.length > 0)
    .map(url => segment.image(url))
}

const sanitizeTitle = (title: string, fallback: string): string => {
  const safeTitle = title.substring(0, 80).replace(/[\\/:*?"<>|\r\n]/g, ' ').trim()
  return safeTitle || fallback
}

const normalizeUrlWithoutQuery = (value: string | undefined): string => {
  const normalized = String(value ?? '').trim()
  if (!normalized) return ''

  try {
    const parsed = new URL(normalized)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return normalized.split('#')[0].split('?')[0]
  }
}

const resolveParsedPostStableMediaBaseKey = (post: ParsedPost): string | null => {
  const rawIdData = post.raw?.idData
  if (!rawIdData || typeof rawIdData !== 'object') return null

  const idData = rawIdData as Record<string, unknown>

  switch (post.platform) {
    case 'bilibili': {
      if (idData.type === 'one_video' && typeof idData.bvid === 'string' && idData.bvid.trim()) {
        const page = Number(idData.p ?? 1)
        const normalizedPage = Number.isFinite(page) && page > 1 ? page : 1
        const cid = String(idData.cid ?? post.raw?.selectedCid ?? '').trim()
        return cid
          ? `bilibili:one_video:${idData.bvid.trim()}:p:${normalizedPage}:cid:${cid}`
          : `bilibili:one_video:${idData.bvid.trim()}:p:${normalizedPage}`
      }
      if (typeof idData.dynamic_id === 'string' && idData.dynamic_id.trim()) {
        return `bilibili:dynamic:${idData.dynamic_id.trim()}`
      }
      if (typeof idData.realid === 'string' && idData.realid.trim()) {
        return `bilibili:bangumi:${idData.realid.trim()}`
      }
      return null
    }
    case 'douyin':
      return typeof idData.aweme_id === 'string' && idData.aweme_id.trim()
        ? `douyin:one_work:${idData.aweme_id.trim()}`
        : null
    case 'tiktok':
      return typeof idData.item_id === 'string' && idData.item_id.trim()
        ? `tiktok:item:${idData.item_id.trim()}`
        : null
    case 'kuaishou':
      return typeof idData.photoId === 'string' && idData.photoId.trim()
        ? `kuaishou:one_work:${idData.photoId.trim()}`
        : null
    case 'xiaohongshu':
      return typeof idData.note_id === 'string' && idData.note_id.trim()
        ? `xiaohongshu:note:${idData.note_id.trim()}`
        : null
    case 'heybox':
      return typeof idData.link_id === 'string' && idData.link_id.trim()
        ? `heybox:link:${idData.link_id.trim()}`
        : null
    case 'github': {
      const owner = String(idData.owner ?? '').trim()
      const repo = String(idData.repo ?? '').trim()
      if (!owner || !repo) return null
      const type = String(idData.type ?? 'repo').trim() || 'repo'
      const branch = String(idData.branch ?? '').trim()
      return branch
        ? `github:${type}:${owner}/${repo}:branch:${branch}`
        : `github:${type}:${owner}/${repo}`
    }
    case 'x':
      return typeof idData.statusId === 'string' && idData.statusId.trim()
        ? `x:status:${idData.statusId.trim()}`
        : null
    case 'zhihu': {
      const answerId = String(idData.answerId ?? '').trim()
      const articleId = String(idData.articleId ?? '').trim()
      const videoId = String(idData.videoId ?? '').trim()
      const questionId = String(idData.questionId ?? '').trim()
      if (answerId) return `zhihu:answer:${answerId}`
      if (articleId) return `zhihu:article:${articleId}`
      if (videoId) return `zhihu:video:${videoId}`
      if (questionId) return `zhihu:question:${questionId}`
      return null
    }
    case 'tieba': {
      const tid = String(idData.tid ?? '').trim()
      if (!tid) return null
      const pid = String(idData.pid ?? '').trim()
      return pid ? `tieba:thread:${tid}:post:${pid}` : `tieba:thread:${tid}`
    }
    case 'wechat': {
      const articleId = String(idData.articleId ?? '').trim()
      if (articleId) return `wechat:article:${articleId}`
      const canonicalUrl = normalizeUrlWithoutQuery(String(idData.canonicalUrl ?? idData.url ?? post.url))
      return canonicalUrl ? `wechat:url:${buildSharedCacheHash(canonicalUrl)}` : null
    }
    case 'weibo': {
      const statusId = String(idData.statusId ?? '').trim()
      const fid = String(idData.fid ?? '').trim()
      if (statusId) return `weibo:status:${statusId}`
      if (fid) return `weibo:feed:${fid}`
      return null
    }
    default:
      return null
  }
}

const buildParsedPostVideoCacheIdentity = (
  post: ParsedPost,
  video: ParsedPostVideo,
  index: number
): CacheIdentity => {
  const stableBaseKey = resolveParsedPostStableMediaBaseKey(post)
  if (stableBaseKey) {
    return {
      scope: 'media',
      key: `${stableBaseKey}:video:${index}`
    }
  }

  return {
    scope: 'media',
    key: `url-fallback:${post.platform}:${buildSharedCacheHash(
      normalizeUrlWithoutQuery(post.url),
      normalizeUrlWithoutQuery(video.url),
      String(index)
    )}`
  }
}

export const buildParsedPostVideoDownloadEntries = (
  post: ParsedPost
): Array<{
  video: ParsedPostVideo
  options: {
    video_url: string
    backupUrls?: string[]
    title: {
      timestampTitle: string
      originTitle: string
    }
    headers?: Record<string, unknown>
    cacheIdentity?: CacheIdentity
  }
}> => {
  return post.videos
    .filter(video => video.url)
    .map((video, index) => ({
      video,
      options: {
        video_url: video.url,
        backupUrls: video.backupUrls,
        title: {
          timestampTitle: `${post.platform}_${Date.now()}_${index}.mp4`,
          originTitle: `${sanitizeTitle(video.title || post.title, `${post.platform}_${Date.now()}`)}.mp4`
        },
        headers: video.headers,
        cacheIdentity: buildParsedPostVideoCacheIdentity(post, video, index)
      }
    }))
}

export const buildParsedPostVideoDownloadOptions = (
  post: ParsedPost
) => buildParsedPostVideoDownloadEntries(post)[0]?.options ?? null

export const buildParsedPostInfoText = (post: ParsedPost): string => {
  const lines: string[] = [
    `【${post.platformLabel}】${post.title}`
  ]

  if (post.author?.name) lines.push(`作者：${post.author.name}`)
  if (post.stats.length > 0) {
    lines.push(`统计：${post.stats.map(item => `${item.label} ${item.value}`).join(' / ')}`)
  }
  if (post.meta.length > 0) {
    lines.push(...post.meta.map(item => `${item.label}：${item.value}`))
  }

  const contentText = post.contentBlocks
    .flatMap(block => {
      if (block.type === 'text') return [block.text]
      if (block.type === 'html') return [block.text?.trim() || decodeHtmlToText(block.html)]
      return []
    })
    .filter(Boolean)
    .join('\n')

  if (contentText) lines.push(contentText)
  else if (post.summary) lines.push(post.summary)

  lines.push(post.url)
  return lines.filter(Boolean).join('\n')
}

export const buildParsedPostTextModeReply = (
  post: ParsedPost,
  displayContent: string[],
  options?: {
    coverUrl?: string
    statsText?: string
    descText?: string
    descLabel?: string
  }
) => {
  const content = displayContent ?? []
  const reply = []

  const titleText = post.title ? `\n📺 标题: ${post.title}\n` : ''
  const authorText = post.author?.name ? `\n👤 作者: ${post.author.name}\n` : ''
  const descSource = options?.descText ?? post.summary ?? ''
  const descLabel = String(options?.descLabel ?? '简介').trim() || '简介'
  const descText = descSource ? `\n\n📝 ${descLabel}: ${descSource}` : ''

  const contentMap = {
    cover: options?.coverUrl ? segment.image(options.coverUrl) : null,
    title: titleText ? segment.text(titleText) : null,
    author: authorText ? segment.text(authorText) : null,
    stats: options?.statsText ? segment.text(options.statsText) : null,
    desc: descText ? segment.text(descText) : null
  } satisfies Record<string, ReturnType<typeof segment.text> | ReturnType<typeof segment.image> | null>

  for (const key of content as Array<keyof typeof contentMap>) {
    const item = contentMap[key]
    if (item) reply.push(item)
  }

  return reply
}
