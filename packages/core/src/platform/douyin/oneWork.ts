import { logger } from 'node-karin'
import axios from 'node-karin/axios'

import { amagiClient } from '@/module/utils/amagiClient'
import { Config } from '@/module/utils/Config'
import { fetchDouyinHtmlWorkByBrowser } from '@/module/utils/DouyinBrowserFallback'
import { persistFailureTrace, recordFailureTraceStep } from '@/module/utils/ErrorTrace'
import { buildConfiguredRequestOptions } from '@/module/utils/RequestConfig'
import { resolveSharedJsonCache } from '@/module/utils/sharedCache'

import type { DouyinIdData } from './getID'
import {
  buildDouyinHtmlWorkFromAwemeDetail,
  buildDouyinWorkCandidateUrls,
  buildDouyinWorkResultFromHtmlWork,
  DOUYIN_ANTI_BOT_HTML_PATTERN,
  DOUYIN_VERIFY_PAGE_PATTERN,
  type DouyinHtmlWork,
  type DouyinWorkResult,
  mergeDouyinWorkResults,
  parseDouyinHtmlWork
} from './html'
import { resolveDouyinPlayableMusicUrls } from './workType'

export type DouyinOneWorkFetchResult = {
  htmlWork: DouyinHtmlWork
  workData: DouyinWorkResult
  source: 'html' | 'browser'
  enrichment?: DouyinWorkResult | null
}

const DOUYIN_HTML_IOS_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1 Edg/132.0.0.0'

const mergePublicCookieHeaders = (...cookieHeaders: Array<string | undefined>): string => {
  const cookieMap = new Map<string, string>()

  for (const header of cookieHeaders) {
    if (typeof header !== 'string' || !header.trim()) continue

    for (const pair of header.split(';')) {
      const trimmed = pair.trim()
      if (!trimmed || trimmed.startsWith('__kkk_guest_')) continue

      const separatorIndex = trimmed.indexOf('=')
      if (separatorIndex <= 0) continue

      const name = trimmed.slice(0, separatorIndex).trim()
      const value = trimmed.slice(separatorIndex + 1).trim()
      if (!name || !value) continue

      cookieMap.set(name, `${name}=${value}`)
    }
  }

  return Array.from(cookieMap.values()).join('; ')
}

const normalizeSetCookieHeaders = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map(item => String(item)).filter(Boolean)
  }
  if (typeof value === 'string' && value.trim()) {
    return [value]
  }
  return []
}

const appendSetCookiePairs = (
  cookieMap: Map<string, string>,
  setCookieHeaders: string[]
) => {
  for (const header of setCookieHeaders) {
    const firstPair = header.split(';')[0]?.trim()
    if (!firstPair) continue

    const separatorIndex = firstPair.indexOf('=')
    if (separatorIndex <= 0) continue

    const name = firstPair.slice(0, separatorIndex).trim()
    const value = firstPair.slice(separatorIndex + 1).trim()
    if (!name || !value) continue

    cookieMap.set(name, `${name}=${value}`)
  }
}

const buildTransientCookieHeader = (cookieMap: Map<string, string>): string | undefined => {
  const values = Array.from(cookieMap.values()).filter(Boolean)
  return values.length > 0 ? values.join('; ') : undefined
}

const buildDouyinHtmlRequestConfig = (cookieHeader: string) => {
  const requestOptions = buildConfiguredRequestOptions(Config.request, {
    userAgentFallback: DOUYIN_HTML_IOS_USER_AGENT,
    maxRedirects: 5,
    maxContentLength: 5 * 1024 * 1024
  })

  return {
    ...requestOptions,
    responseType: 'text' as const,
    validateStatus: (status: number) => status >= 200 && status < 400,
    headers: {
      ...requestOptions.headers,
      'User-Agent': DOUYIN_HTML_IOS_USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
      Referer: 'https://www.douyin.com/',
      ...(cookieHeader ? { Cookie: cookieHeader } : {})
    }
  }
}

const fetchDouyinHtmlWorkByHttp = async (
  idData: DouyinIdData
): Promise<{ htmlWork: DouyinHtmlWork, finalUrl: string, transientCookieHeader?: string }> => {
  const candidateUrls = buildDouyinWorkCandidateUrls(idData)
  if (candidateUrls.length === 0) {
    throw new Error('未获取到有效的抖音作品候选地址')
  }

  const cookieHeader = mergePublicCookieHeaders(
    Config.cookies.douyin,
    idData.transientCookieHeader
  )
  const responseCookieMap = new Map<string, string>()
  const attemptErrors: string[] = []

  for (const candidateUrl of candidateUrls) {
    try {
      const response = await axios.get(candidateUrl, buildDouyinHtmlRequestConfig(cookieHeader))
      appendSetCookiePairs(
        responseCookieMap,
        normalizeSetCookieHeaders((response as { headers?: Record<string, unknown> }).headers?.['set-cookie'])
      )
      const html = typeof response.data === 'string' ? response.data : String(response.data ?? '')
      const finalUrl = response.request?.res?.responseUrl || response.request?.responseURL || candidateUrl

      if (DOUYIN_VERIFY_PAGE_PATTERN.test(html)) {
        throw new Error('抖音分享页未返回可解析数据，疑似风控/验证')
      }

      if (DOUYIN_ANTI_BOT_HTML_PATTERN.test(html)) {
        throw new Error('抖音分享页返回反爬重载页')
      }

      return {
        htmlWork: parseDouyinHtmlWork(html, {
          awemeId: idData.aweme_id,
          typeHint: idData.typeHint,
          url: finalUrl
        }),
        finalUrl,
        transientCookieHeader: buildTransientCookieHeader(responseCookieMap)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      attemptErrors.push(`${candidateUrl} => ${message}`)
    }
  }

  const fetchError = new Error(
    attemptErrors.length > 0
      ? `抖音分享页未返回可解析数据: ${attemptErrors.join(' | ')}`
      : '抖音分享页未返回可解析数据'
  )
  ;(fetchError as Error & { transientCookieHeader?: string }).transientCookieHeader = buildTransientCookieHeader(responseCookieMap)
  throw fetchError
}

type DouyinWorkEnrichmentOptions = {
  persistRecoveredTrace?: boolean
  recoveryStage?: string
  transientCookieHeader?: string
  referer?: string
}

const buildDouyinEnrichmentRequestHeaders = (
  options: Pick<DouyinWorkEnrichmentOptions, 'referer' | 'transientCookieHeader'>
): Record<string, string> => {
  const resolveCookieHeader = () => mergePublicCookieHeaders(
    options.transientCookieHeader,
    Config.cookies.douyin
  )
  const headers: Record<string, string> = {
    ...(options.referer ? { Referer: options.referer } : {})
  }

  // The Amagi recovery wrapper retries with the same request arguments after
  // refreshing Config.cookies. Keep this getter live so the retry cannot send
  // a stale explicit Cookie header alongside the new signed query parameters.
  if (resolveCookieHeader()) {
    Object.defineProperty(headers, 'Cookie', {
      configurable: true,
      enumerable: true,
      get: resolveCookieHeader
    })
  }

  return headers
}

const hasNonEmptyUrlList = (value: unknown): boolean => {
  return Array.isArray(value) && value.some(item => typeof item === 'string' && item.trim().length > 0)
}

const hasRenderableDouyinVideo = (video: Record<string, any> | null | undefined): boolean => {
  if (!video || typeof video !== 'object') return false

  if (hasNonEmptyUrlList(video.play_addr?.url_list) || hasNonEmptyUrlList(video.play_addr_h264?.url_list)) {
    return true
  }

  if (!Array.isArray(video.bit_rate)) return false

  return video.bit_rate.some(item => hasNonEmptyUrlList(item?.play_addr?.url_list))
}

const hasRenderableDouyinImages = (images: unknown): boolean => {
  if (!Array.isArray(images) || images.length === 0) return false

  return images.every((image) => {
    if (!image || typeof image !== 'object') return false

    const typedImage = image as Record<string, any>
    if (!hasNonEmptyUrlList(typedImage.url_list)) return false

    if ((typedImage.clip_type ?? 2) === 2) return true

    return hasRenderableDouyinVideo(typedImage.video)
  })
}

const hasDouyinMusicMetadata = (music: Record<string, any> | null | undefined): boolean => {
  if (!music || typeof music !== 'object') return false

  const hasCover = hasNonEmptyUrlList(music.cover_hd?.url_list) ||
    hasNonEmptyUrlList(music.cover_large?.url_list) ||
    hasNonEmptyUrlList(music.cover_medium?.url_list) ||
    hasNonEmptyUrlList(music.cover_thumb?.url_list)

  return Boolean(
    hasCover ||
    (typeof music.title === 'string' && music.title.trim()) ||
    (typeof music.author === 'string' && music.author.trim()) ||
    (typeof music.mid === 'string' && music.mid.trim()) ||
    Number.isFinite(Number(music.duration)) ||
    Number.isFinite(Number(music.status))
  )
}

const extractRawDouyinMusic = (htmlWork: DouyinHtmlWork): Record<string, any> | undefined => {
  const payload = htmlWork.raw?.payload as Record<string, any> | undefined
  if (!payload || typeof payload !== 'object') return undefined

  switch (htmlWork.raw?.source) {
    case 'router':
      return payload.videoInfoRes?.item_list?.[0]?.music ?? payload.aweme_detail?.music
    case 'pace':
      return payload.aweme?.music ?? payload.aweme?.detail?.music
    case 'detail':
      return payload.music
    default:
      return undefined
  }
}

const shouldAttemptDouyinWorkEnrichment = (
  htmlWork: DouyinHtmlWork,
  baseWorkData: DouyinWorkResult
): boolean => {
  const aweme = baseWorkData.data?.aweme_detail as Record<string, any> | undefined
  if (!aweme) return true

  const hasCoreMetadata = Boolean(
    aweme.aweme_id &&
    aweme.share_url &&
    aweme.author?.nickname &&
    aweme.statistics
  )

  if (!hasCoreMetadata) {
    return true
  }

  switch (htmlWork.subtype) {
    case 'video':
      return !hasRenderableDouyinVideo(aweme.video)
    case 'article':
      return !(
        typeof aweme.article_info?.article_title === 'string' &&
        aweme.article_info.article_title.trim().length > 0 &&
        typeof aweme.article_info?.article_content === 'string' &&
        aweme.article_info.article_content.trim().length > 0
      )
    case 'image': {
      if (!hasRenderableDouyinImages(aweme.images)) {
        return true
      }

      if (resolveDouyinPlayableMusicUrls(aweme.music).length > 0) {
        return false
      }

      const rawMusic = extractRawDouyinMusic(htmlWork)
      if (!hasDouyinMusicMetadata(rawMusic)) {
        return false
      }

      return resolveDouyinPlayableMusicUrls(rawMusic).length === 0
    }
    default:
      return true
  }
}

const tryFetchDouyinWorkEnrichment = async (
  awemeId: string,
  options: DouyinWorkEnrichmentOptions = {}
): Promise<DouyinWorkResult | null> => {
  recordFailureTraceStep('douyin.work.fetch.enrich.start', {
    awemeId
  })
  try {
    const result = await amagiClient.douyin.fetcher.parseWork({
      aweme_id: awemeId,
      typeMode: 'strict'
    }, {
      headers: buildDouyinEnrichmentRequestHeaders(options)
    }) as DouyinWorkResult
    recordFailureTraceStep('douyin.work.fetch.enrich.success', {
      awemeId,
      awemeType: result.data.aweme_detail?.aweme_type
    })
    return result
  } catch (error) {
    recordFailureTraceStep('douyin.work.fetch.enrich.error', {
      awemeId,
      message: error instanceof Error ? error.message : String(error)
    })
    if (options.persistRecoveredTrace) {
      persistFailureTrace({
        error,
        outcome: 'recovered',
        extra: {
          platform: 'douyin',
          stage: 'one_work',
          recoveryStage: options.recoveryStage ?? 'html-enrichment-degraded',
          awemeId
        }
      })
    }
    logger.warn(`[Douyin] HTML-first enrichment 获取失败，已降级继续: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

const buildDouyinOneWorkFromDetailEnrichment = (
  idData: DouyinIdData,
  enrichment: DouyinWorkResult | null
): DouyinOneWorkFetchResult | null => {
  const detail = enrichment?.data?.aweme_detail as Record<string, any> | undefined
  if (!detail || typeof detail !== 'object') return null

  const htmlWork = buildDouyinHtmlWorkFromAwemeDetail(detail, {
    awemeId: idData.aweme_id,
    typeHint: idData.typeHint,
    url: idData.resolvedUrl
  }, {
    rawSource: 'detail',
    rawPayload: detail
  })
  if (!htmlWork) return null

  const baseWorkData = buildDouyinWorkResultFromHtmlWork(htmlWork)
  return {
    htmlWork,
    workData: mergeDouyinWorkResults(baseWorkData, enrichment),
    source: 'html',
    enrichment
  }
}

const loadDouyinOneWork = async (idData: DouyinIdData): Promise<DouyinOneWorkFetchResult> => {
  recordFailureTraceStep('douyin.work.fetch.html.start', {
    awemeId: idData.aweme_id,
    resolvedUrl: idData.resolvedUrl,
    typeHint: idData.typeHint
  })

  try {
    const { htmlWork, finalUrl, transientCookieHeader } = await fetchDouyinHtmlWorkByHttp(idData)
    recordFailureTraceStep('douyin.work.fetch.html.success', {
      awemeId: htmlWork.awemeId,
      subtype: htmlWork.subtype,
      finalUrl
    })
    const baseWorkData = buildDouyinWorkResultFromHtmlWork(htmlWork)
    const shouldEnrich = shouldAttemptDouyinWorkEnrichment(htmlWork, baseWorkData)
    if (!shouldEnrich) {
      recordFailureTraceStep('douyin.work.fetch.enrich.skip', {
        awemeId: htmlWork.awemeId,
        subtype: htmlWork.subtype,
        reason: 'html-complete'
      })
    }
    const enrichment = shouldEnrich
      ? await tryFetchDouyinWorkEnrichment(htmlWork.awemeId, {
        persistRecoveredTrace: true,
        recoveryStage: 'html-enrichment-degraded',
        transientCookieHeader: mergePublicCookieHeaders(idData.transientCookieHeader, transientCookieHeader),
        referer: finalUrl
      })
      : null

    return {
      htmlWork,
      workData: mergeDouyinWorkResults(baseWorkData, enrichment),
      source: 'html',
      enrichment
    }
  } catch (error) {
    const transientCookieHeader = mergePublicCookieHeaders(
      idData.transientCookieHeader,
      (error as Error & { transientCookieHeader?: string }).transientCookieHeader
    )
    recordFailureTraceStep('douyin.work.fetch.html.error', {
      awemeId: idData.aweme_id,
      message: error instanceof Error ? error.message : String(error)
    })

    if (idData.typeHint === 'article') {
      recordFailureTraceStep('douyin.work.fetch.detail.recover.start', {
        awemeId: idData.aweme_id
      })

      const enrichment = await tryFetchDouyinWorkEnrichment(idData.aweme_id, {
        transientCookieHeader,
        referer: idData.resolvedUrl || `https://www.douyin.com/article/${idData.aweme_id}`
      })
      const recoveredResult = buildDouyinOneWorkFromDetailEnrichment(idData, enrichment)

      if (recoveredResult) {
        recordFailureTraceStep('douyin.work.fetch.detail.recover.success', {
          awemeId: recoveredResult.htmlWork.awemeId,
          subtype: recoveredResult.htmlWork.subtype
        })
        persistFailureTrace({
          error,
          outcome: 'recovered',
          extra: {
            platform: 'douyin',
            stage: 'one_work',
            recoveryStage: 'detail-aweme-fallback',
            awemeId: idData.aweme_id
          }
        })
        return recoveredResult
      }
    }

    logger.warn(`[Douyin] HTML 主链网络获取失败，尝试浏览器 HTML 兜底: ${error instanceof Error ? error.message : String(error)}`)
    recordFailureTraceStep('douyin.work.fetch.browser.html.start', {
      awemeId: idData.aweme_id
    })
    const htmlWork = await fetchDouyinHtmlWorkByBrowser(idData)
    recordFailureTraceStep('douyin.work.fetch.browser.html.success', {
      awemeId: htmlWork.awemeId,
      subtype: htmlWork.subtype
    })
    persistFailureTrace({
      error,
      outcome: 'recovered',
      extra: {
        platform: 'douyin',
        stage: 'one_work',
        recoveryStage: 'browser-html-fallback',
        awemeId: idData.aweme_id
      }
    })
    const baseWorkData = buildDouyinWorkResultFromHtmlWork(htmlWork)
    const shouldEnrich = shouldAttemptDouyinWorkEnrichment(htmlWork, baseWorkData)
    if (!shouldEnrich) {
      recordFailureTraceStep('douyin.work.fetch.enrich.skip', {
        awemeId: htmlWork.awemeId,
        subtype: htmlWork.subtype,
        reason: 'html-complete'
      })
    }
    const enrichment = shouldEnrich
      ? await tryFetchDouyinWorkEnrichment(htmlWork.awemeId, {
        transientCookieHeader,
        referer: idData.resolvedUrl
      })
      : null

    return {
      htmlWork,
      workData: mergeDouyinWorkResults(baseWorkData, enrichment),
      source: 'browser',
      enrichment
    }
  }
}

export const fetchDouyinOneWork = async (idData: DouyinIdData): Promise<DouyinOneWorkFetchResult> => {
  const awemeId = String(idData.aweme_id ?? '').trim()
  if (!awemeId) {
    return await loadDouyinOneWork(idData)
  }

  const { value } = await resolveSharedJsonCache({
    scope: 'work-bundle',
    key: `douyin:one_work:v4:${awemeId}`
  }, async () => await loadDouyinOneWork(idData))

  return value
}
