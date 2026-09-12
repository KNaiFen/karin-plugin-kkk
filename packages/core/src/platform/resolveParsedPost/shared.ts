import type { ExternalPostContentBlock } from '@/platform/externalPostCard'
import type {
  ParsedPost,
  ParsedPostAuthor,
  ParsedPostBlock,
  ParsedPostImage,
  ParsedPostMetaItem,
  ParsedPostStatsItem,
  ParsedPostVideo
} from '@/platform/parsedPost'

export const normalizeTitle = (value: unknown, fallback: string): string => {
  const result = String(value ?? '').trim()
  return result || fallback
}

export const createHeaders = (headers: Record<string, unknown>): Record<string, unknown> => headers

export const toStats = (entries: Array<[string, unknown]>): ParsedPostStatsItem[] => {
  return entries
    .map(([label, value]) => ({ label, value: String(value ?? '').trim() }))
    .filter(item => item.value && item.value !== '0')
}

export const toMeta = (entries: Array<[string, unknown]>): ParsedPostMetaItem[] => {
  return entries
    .map(([label, value]) => ({ label, value: String(value ?? '').trim() }))
    .filter(item => item.value)
}

export const buildParsedPost = (post: ParsedPost): ParsedPost => {
  return {
    ...post,
    contentBlocks: post.contentBlocks.filter(Boolean),
    images: post.images.filter(image => image?.url),
    videos: post.videos.filter(video => video?.url),
    stats: post.stats.filter(item => item.label && item.value),
    meta: post.meta.filter(item => item.label && item.value),
    raw: {
      ...post.raw,
      videos: post.videos
    }
  }
}

export const buildVideo = (
  url: string | undefined,
  options: Omit<ParsedPostVideo, 'url'> = {}
): ParsedPostVideo | null => {
  if (!url) return null
  return {
    url,
    ...options
  }
}

export const buildAuthor = (name: string, extra?: Omit<ParsedPostAuthor, 'name'>): ParsedPostAuthor => ({
  name,
  ...extra
})

export const textBlock = (text: string | undefined): ParsedPostBlock[] => {
  const normalized = String(text ?? '').trim()
  return normalized ? [{ type: 'text', text: normalized }] : []
}

export const imageBlocks = (images: ParsedPostImage[], alt: string): ParsedPostBlock[] => {
  return images.map(image => ({ type: 'image', url: image.url, alt: image.alt || alt }))
}

export const cardToParsedPost = (
  card: {
    summary: string
    images: string[]
    stats: ParsedPostStatsItem[]
    meta: ParsedPostMetaItem[]
    content?: ExternalPostContentBlock[]
  },
  base: Omit<ParsedPost, 'contentBlocks' | 'images' | 'stats' | 'meta'>
): ParsedPost => {
  const contentBlocks: ParsedPostBlock[] = []
  for (const block of card.content ?? []) {
    if (block.type === 'text') {
      contentBlocks.push({ type: 'text', text: block.text })
      continue
    }
    if (block.type === 'html') {
      contentBlocks.push({ type: 'html', html: block.html })
      continue
    }
    contentBlocks.push({ type: 'image', url: block.url, alt: block.alt })
  }

  return buildParsedPost({
    ...base,
    summary: base.summary || card.summary,
    contentBlocks,
    images: card.images.map(url => ({ url })),
    stats: card.stats,
    meta: card.meta
  })
}
