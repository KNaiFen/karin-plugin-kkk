import { logger } from 'node-karin'

export type DouyinArticleImage = {
  ai_high_image_url: string
  high_image_url: string
  markdown_url: string
  origin_image_url: string
}

export type DouyinNormalizedArticleContent = {
  title: string
  markdownOrText: string
  images: DouyinArticleImage[]
  readTime: number
  coverUrl: string
}

type DouyinArticleFallback = {
  title?: string
  summary?: string
}

const pickFirstString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed) return trimmed
  }
  return ''
}

const safeParseJson = <T> (value: unknown, fieldName?: string): T | null => {
  if (typeof value !== 'string' || !value.trim()) return null

  try {
    return JSON.parse(value) as T
  } catch {
    if (fieldName) {
      logger.warn(`[ParsedPost] 抖音文章字段解析失败: ${fieldName}`)
    }
    return null
  }
}

const toNumber = (value: unknown): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const dedupeByUrl = (images: DouyinArticleImage[]): DouyinArticleImage[] => {
  const seen = new Set<string>()
  const result: DouyinArticleImage[] = []

  for (const image of images) {
    const key = pickFirstString(
      image.high_image_url,
      image.origin_image_url,
      image.markdown_url,
      image.ai_high_image_url
    )
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(image)
  }

  return result
}

const normalizeArticleImage = (value: Record<string, unknown>): DouyinArticleImage | null => {
  const primaryUrl = pickFirstString(
    value.high_image_url,
    value.origin_image_url,
    value.ai_high_image_url,
    value.markdown_url,
    value.url,
    Array.isArray(value.url_list) ? value.url_list[0] : '',
    Array.isArray(value.download_url_list) ? value.download_url_list[0] : '',
    value.high_url,
    value.origin_url
  )

  if (!primaryUrl) return null

  return {
    ai_high_image_url: pickFirstString(value.ai_high_image_url, primaryUrl),
    high_image_url: pickFirstString(value.high_image_url, primaryUrl),
    markdown_url: pickFirstString(value.markdown_url, primaryUrl),
    origin_image_url: pickFirstString(value.origin_image_url, value.url, primaryUrl)
  }
}

const createSingleImage = (url: string): DouyinArticleImage[] => {
  const normalized = normalizeArticleImage({ url })
  return normalized ? [normalized] : []
}

const pickGraphicImageUrl = (item: Record<string, any>): string => {
  return pickFirstString(
    item.url_list?.[2],
    item.url_list?.[1],
    item.url_list?.[0],
    item.download_url_list?.[0]
  )
}

export const parseDouyinArticleContentValue = (value: unknown): {
  markdownOrText: string
  headPosterUrl: string
  readTime: number
} => {
  const raw = String(value ?? '').trim()
  if (!raw) {
    return {
      markdownOrText: '',
      headPosterUrl: '',
      readTime: 0
    }
  }

  const parsed = safeParseJson<Record<string, unknown> | string>(raw, /^[{\[]/.test(raw) ? 'article_content' : undefined)
  if (typeof parsed === 'string') {
    return {
      markdownOrText: parsed.trim(),
      headPosterUrl: '',
      readTime: 0
    }
  }

  if (parsed && typeof parsed === 'object') {
    return {
      markdownOrText: pickFirstString(parsed.markdown, parsed.text, parsed.content, parsed.desc),
      headPosterUrl: pickFirstString(
        (parsed.head_poster_list as { url_list?: unknown[] } | undefined)?.url_list?.[0],
        parsed.pre_cover
      ),
      readTime: toNumber(parsed.read_time)
    }
  }

  if (/^[{\[]/.test(raw)) {
    return {
      markdownOrText: '',
      headPosterUrl: '',
      readTime: 0
    }
  }

  return {
    markdownOrText: raw,
    headPosterUrl: '',
    readTime: 0
  }
}

export const normalizeDouyinArticleContent = (
  aweme: Record<string, any>,
  fallback: DouyinArticleFallback = {}
): DouyinNormalizedArticleContent => {
  const articleInfo = (aweme?.article_info ?? {}) as Record<string, unknown>
  const title = pickFirstString(
    articleInfo.article_title,
    aweme?.preview_title,
    aweme?.desc,
    fallback.title,
    '抖音文章'
  )

  const feData = safeParseJson<Record<string, unknown>>(articleInfo.fe_data, 'fe_data') ?? {}
  const parsedArticleContent = parseDouyinArticleContentValue(articleInfo.article_content)

  const imageList = dedupeByUrl(
    (Array.isArray(feData.image_list) ? feData.image_list : [])
      .map(item => normalizeArticleImage((item ?? {}) as Record<string, unknown>))
      .filter((item): item is DouyinArticleImage => Boolean(item))
  )

  const feHeadPosterUrl = pickFirstString(
    (feData.head_poster_list as { url_list?: unknown[] } | undefined)?.url_list?.[0],
    feData.pre_cover
  )
  const awemeImageList = dedupeByUrl(
    (Array.isArray(aweme?.images) ? aweme.images : [])
      .map((item) => normalizeArticleImage({ url: pickGraphicImageUrl(item ?? {}) }))
      .filter((item): item is DouyinArticleImage => Boolean(item))
  )
  const coverUrl = pickFirstString(
    aweme?.video?.origin_cover?.url_list?.[0],
    aweme?.video?.cover_original_scale?.url_list?.[0],
    aweme?.video?.cover?.url_list?.[0],
    aweme?.video?.animated_cover?.url_list?.[0],
    aweme?.video?.dynamic_cover?.url_list?.[0]
  )

  const images = imageList.length > 0
    ? imageList
    : feHeadPosterUrl
      ? createSingleImage(feHeadPosterUrl)
      : parsedArticleContent.headPosterUrl
        ? createSingleImage(parsedArticleContent.headPosterUrl)
        : awemeImageList.length > 0
          ? awemeImageList
          : createSingleImage(coverUrl)

  return {
    title,
    markdownOrText: pickFirstString(
      parsedArticleContent.markdownOrText,
      aweme?.desc,
      aweme?.preview_title,
      fallback.summary,
      '该文章暂无可提取纯文本内容'
    ),
    images,
    readTime: Math.max(0, toNumber(feData.read_time) || parsedArticleContent.readTime),
    coverUrl: pickFirstString(images[0]?.high_image_url, images[0]?.origin_image_url, coverUrl)
  }
}
