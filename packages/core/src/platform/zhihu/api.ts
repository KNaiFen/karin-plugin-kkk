import { logger } from 'node-karin'
import axios from 'node-karin/axios'

import { baseHeaders, buildConfiguredRequestOptions } from '@/module'
import { Config } from '@/module/utils/Config'
import { retryWithGuestCookieRecovery } from '@/module/utils/GuestCookieRecovery'

import type {
  ZhihuAnswerDetail,
  ZhihuArticleDetail,
  ZhihuAuthor,
  ZhihuDetail,
  ZhihuIdData,
  ZhihuQuestion,
  ZhihuRichContent,
  ZhihuVideoInfo
} from './types'

const ZHIHU_ORIGIN = 'https://www.zhihu.com'
const ZHIHU_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

type ZhihuCookieConfig = typeof Config.cookies & { zhihu?: string }

const getZhihuCookie = (): string => {
  return ((Config.cookies as ZhihuCookieConfig).zhihu ?? '').trim()
}

const getZhihuHeaders = (referer = ZHIHU_ORIGIN): Record<string, string> => {
  const cookie = getZhihuCookie()
  return {
    ...baseHeaders,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    Cookie: cookie,
    Referer: referer,
    'User-Agent': ZHIHU_USER_AGENT
  } as Record<string, string>
}

const requestOptions = () => buildConfiguredRequestOptions(Config.request, {
  maxRedirects: 5,
  userAgentFallback: ZHIHU_USER_AGENT
})

const isAccessBlockedError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error)
  return /status code 403|status code 401|forbidden|unauthorized/i.test(message)
}

const decodeHtmlEntities = (value: string): string => {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' '
  }
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity: string) => {
    const lower = entity.toLowerCase()
    if (lower.startsWith('#x')) {
      const codePoint = Number.parseInt(lower.slice(2), 16)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _
    }
    if (lower.startsWith('#')) {
      const codePoint = Number.parseInt(lower.slice(1), 10)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _
    }
    return named[lower] ?? _
  })
}

const readInitialData = (html: string): any => {
  const match = html.match(/<script[^>]+id=["']js-initialData["'][^>]*type=["']text\/json["'][^>]*>([\s\S]*?)<\/script>/i) ??
    html.match(/<script[^>]+type=["']text\/json["'][^>]*id=["']js-initialData["'][^>]*>([\s\S]*?)<\/script>/i)
  if (!match?.[1]) {
    throw new Error('知乎页面缺少 js-initialData，无法解析回答内容')
  }

  try {
    return JSON.parse(decodeHtmlEntities(match[1]).trim())
  } catch (error) {
    logger.debug(`[Zhihu] js-initialData JSON 解析失败：${(error as Error).message}`)
    throw new Error('知乎页面初始数据解析失败')
  }
}

const findEntityById = (collection: unknown, id: string | undefined): Record<string, any> | undefined => {
  if (!collection || typeof collection !== 'object') return undefined
  const object = collection as Record<string, any>
  if (id && object[id] && typeof object[id] === 'object') return object[id]
  return Object.values(object).find((item: any) => item && typeof item === 'object')
}

const toNumber = (value: unknown): number | undefined => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const normalizeAuthor = (value: any): ZhihuAuthor => {
  return {
    name: String(value?.name || value?.member?.name || '知乎用户'),
    headline: value?.headline || value?.member?.headline,
    urlToken: value?.urlToken || value?.url_token || value?.member?.urlToken || value?.member?.url_token,
    avatarUrl: value?.avatarUrl || value?.avatar_url || value?.member?.avatarUrl || value?.member?.avatar_url
  }
}

const normalizeQuestion = (question: Record<string, any>, questionId?: string): ZhihuQuestion => {
  return {
    id: String(question?.id ?? questionId ?? ''),
    title: String(question?.title ?? '知乎问题'),
    detail: question?.detail,
    answerCount: toNumber(question?.answerCount ?? question?.answer_count),
    followerCount: toNumber(question?.followerCount ?? question?.follower_count),
    commentCount: toNumber(question?.commentCount ?? question?.comment_count),
    voteupCount: toNumber(question?.voteupCount ?? question?.voteup_count)
  }
}

const uniquePush = (target: string[], value: unknown): void => {
  if (typeof value !== 'string') return
  const trimmed = decodeHtmlEntities(value).trim()
  if (/^https?:\/\//i.test(trimmed) && !target.includes(trimmed)) {
    target.push(trimmed)
  }
}

const extractImageUrls = (html: string): string[] => {
  const images: string[] = []
  const imgRegex = /<img\b[^>]*>/gi
  for (const match of html.matchAll(imgRegex)) {
    const tag = match[0]
    for (const attr of ['data-original', 'data-actualsrc', 'src']) {
      const attrMatch = new RegExp(`${attr}=["']([^"']+)["']`, 'i').exec(tag)
      if (attrMatch?.[1]) {
        uniquePush(images, attrMatch[1])
        break
      }
    }
  }
  return images
}

const extractLensIds = (html: string): string[] => {
  const ids: string[] = []
  for (const match of html.matchAll(/\bdata-lens-id=["']([^"']+)["']/gi)) {
    const id = match[1]?.trim()
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

const extractText = (html: string): string => {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
}

const collectVideoUrls = (value: unknown, result: string[] = []): string[] => {
  if (!value) return result
  if (typeof value === 'string') {
    uniquePush(result, value)
    return result
  }
  if (Array.isArray(value)) {
    for (const item of value) collectVideoUrls(item, result)
    return result
  }
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>
    for (const [key, item] of Object.entries(object)) {
      if (/url|play|mp4|src/i.test(key)) collectVideoUrls(item, result)
    }
  }
  return result
}

const getVideoQualityScore = (value: any): number => {
  return toNumber(value?.width) ??
    toNumber(value?.height) ??
    toNumber(value?.bitrate) ??
    toNumber(value?.size) ??
    0
}

const findBestVideoFromPlayInfo = (data: any): { url: string, backupUrls: string[], title?: string, cover?: string } | undefined => {
  const candidates: Array<{ url: string, score: number }> = []
  const visit = (value: unknown): void => {
    if (!value) return
    if (typeof value === 'string') {
      if (/^https?:\/\/.+\.mp4(?:[?#].*)?$/i.test(value) || /^https?:\/\/.+[?&](?:video|mime|format)=/i.test(value)) {
        candidates.push({ url: value, score: 0 })
      }
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    if (typeof value === 'object') {
      const object = value as Record<string, any>
      const urls = collectVideoUrls(object).filter(url => /\.mp4(?:[?#]|$)/i.test(url) || /vzuu|zhihu-video/i.test(url))
      for (const url of urls) {
        candidates.push({ url, score: getVideoQualityScore(object) })
      }
      for (const item of Object.values(object)) visit(item)
    }
  }

  visit(data)
  const deduped = candidates.filter((candidate, index) => {
    return candidates.findIndex(item => item.url === candidate.url) === index
  })
  deduped.sort((a, b) => b.score - a.score)
  const best = deduped[0]
  if (!best) return undefined

  return {
    url: best.url,
    backupUrls: deduped.slice(1).map(item => item.url),
    title: data?.title || data?.video?.title,
    cover: data?.cover || data?.thumbnail || data?.video?.cover
  }
}

export const fetchZhihuVideoPlayInfo = async (lensId: string, referer: string): Promise<ZhihuVideoInfo | undefined> => {
  const options = requestOptions()
  const payloadCandidates = [
    { video_id: lensId },
    { lens_id: lensId },
    { id: lensId }
  ]

  for (const payload of payloadCandidates) {
    try {
      const response = await axios.post(`${ZHIHU_ORIGIN}/api/v4/video/play_info`, payload, {
        ...options,
        headers: {
          ...options.headers,
          ...getZhihuHeaders(referer),
          Accept: 'application/json, text/plain, */*',
          'Content-Type': 'application/json',
          'x-requested-with': 'fetch'
        }
      })
      const best = findBestVideoFromPlayInfo(response.data)
      if (best) {
        return {
          lensId,
          ...best
        }
      }
    } catch (error) {
      logger.debug(`[Zhihu] 视频 play_info 请求失败 lensId=${lensId} payload=${Object.keys(payload)[0]}：${(error as Error).message}`)
    }
  }
}

export const parseZhihuRichContent = async (html: string, referer: string): Promise<ZhihuRichContent> => {
  const images = extractImageUrls(html)
  const lensIds = extractLensIds(html)
  const videos: ZhihuVideoInfo[] = []

  for (const lensId of lensIds) {
    const video = await fetchZhihuVideoPlayInfo(lensId, referer)
    if (video) videos.push(video)
  }

  return {
    text: extractText(html),
    images,
    lensIds,
    videos
  }
}

export const fetchZhihuAnswerDetail = async (data: ZhihuIdData): Promise<ZhihuAnswerDetail> => {
  if (data.type !== 'answer' || !data.questionId || !data.answerId) {
    throw new Error('知乎回答 ID 不完整，无法解析')
  }

  const options = requestOptions()
  const answerApiUrl = `${ZHIHU_ORIGIN}/api/v4/answers/${data.answerId}`
  try {
    const response = await axios.get(answerApiUrl, {
      ...options,
      params: {
        include: 'content,created_time,updated_time,comment_count,voteup_count,ip_info,author,question'
      },
      headers: {
        ...options.headers,
        ...getZhihuHeaders(ZHIHU_ORIGIN),
        Accept: 'application/json, text/plain, */*',
        Referer: undefined
      }
    })

    const answer = response.data ?? {}
    const question = answer.question
    if (!question || !answer?.id) {
      throw new Error('知乎回答 API 未返回有效实体')
    }

    const content = String(answer.content ?? '')
    return {
      type: 'answer',
      url: data.url,
      question: normalizeQuestion(question, data.questionId),
      answer: {
        id: String(answer.id ?? data.answerId),
        author: normalizeAuthor(answer.author),
        content,
        createdTime: toNumber(answer.createdTime ?? answer.created_time),
        updatedTime: toNumber(answer.updatedTime ?? answer.updated_time),
        commentCount: toNumber(answer.commentCount ?? answer.comment_count),
        voteupCount: toNumber(answer.voteupCount ?? answer.voteup_count),
        ipInfo: answer.ipInfo ?? answer.ip_info
      },
      richContent: await parseZhihuRichContent(content, data.url)
    }
  } catch (apiError) {
    logger.debug(`[Zhihu] 回答 API 获取失败，尝试 HTML 回退：${apiError instanceof Error ? apiError.message : String(apiError)}`)
    try {
      const response = await axios.get(data.url, {
        ...options,
        headers: {
          ...options.headers,
          ...getZhihuHeaders(data.url)
        }
      })
      const initialData = readInitialData(String(response.data ?? ''))
      const entities = initialData?.initialState?.entities
      const question = findEntityById(entities?.questions, data.questionId)
      const answer = findEntityById(entities?.answers, data.answerId)

      if (!question || !answer) {
        throw new Error('知乎页面初始数据中缺少问题或回答实体')
      }

      const content = String(answer.content ?? '')
      return {
        type: 'answer',
        url: data.url,
        question: normalizeQuestion(question, data.questionId),
        answer: {
          id: String(answer.id ?? data.answerId),
          author: normalizeAuthor(answer.author),
          content,
          createdTime: toNumber(answer.createdTime ?? answer.created_time),
          updatedTime: toNumber(answer.updatedTime ?? answer.updated_time),
          commentCount: toNumber(answer.commentCount ?? answer.comment_count),
          voteupCount: toNumber(answer.voteupCount ?? answer.voteup_count),
          ipInfo: answer.ipInfo ?? answer.ip_info
        },
        richContent: await parseZhihuRichContent(content, data.url)
      }
    } catch (htmlError) {
      if (isAccessBlockedError(apiError) && isAccessBlockedError(htmlError)) {
        throw new Error('当前回答需要更强登录态或已被知乎拦截')
      }
      throw htmlError
    }
  }
}

export const fetchZhihuArticleDetail = async (data: ZhihuIdData): Promise<ZhihuArticleDetail> => {
  if (data.type !== 'article' || !data.articleId) {
    throw new Error('知乎专栏文章 ID 不完整，无法解析')
  }

  const options = requestOptions()
  const response = await axios.get(data.url, {
    ...options,
    headers: {
      ...options.headers,
      ...getZhihuHeaders(data.url)
    }
  })
  const initialData = readInitialData(String(response.data ?? ''))
  const entities = initialData?.initialState?.entities
  const article = findEntityById(entities?.articles, data.articleId)

  if (!article) {
    throw new Error('知乎页面初始数据中缺少专栏文章实体')
  }

  const content = String(article.content ?? article.excerpt ?? '')
  const articleUrl = String(article.url ?? data.url)
  return {
    type: 'article',
    url: articleUrl,
    article: {
      id: String(article.id ?? data.articleId),
      title: String(article.title ?? '知乎专栏'),
      author: normalizeAuthor(article.author),
      content,
      createdTime: toNumber(article.createdTime ?? article.created_time ?? article.created),
      updatedTime: toNumber(article.updatedTime ?? article.updated_time ?? article.updated),
      commentCount: toNumber(article.commentCount ?? article.comment_count),
      voteupCount: toNumber(article.voteupCount ?? article.voteup_count ?? article.likedCount ?? article.liked_count),
      ipInfo: article.ipInfo ?? article.ip_info
    },
    richContent: await parseZhihuRichContent(content, articleUrl)
  }
}

export const fetchZhihuDetail = async (data: ZhihuIdData): Promise<ZhihuDetail> => {
  return await retryWithGuestCookieRecovery('zhihu', async () => {
    switch (data.type) {
      case 'answer':
        return await fetchZhihuAnswerDetail(data)
      case 'article':
        return await fetchZhihuArticleDetail(data)
      case 'zvideo':
        throw new Error('知乎独立视频解析暂未支持，已识别链接类型，待后续接入视频详情解析')
      default:
        throw new Error('不支持的知乎链接类型')
    }
  }, {
    context: '获取知乎详情'
  })
}
