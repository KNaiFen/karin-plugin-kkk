import type { ArticleWork, DyImageAlbumWork, DySlidesWork, DyVideoWork, Result } from '@ikenxuan/amagi'
import { logger } from 'node-karin'

import type { DouyinIdData } from '@/platform/douyin/getID'
import {
  buildDouyinHtmlWorkFromAwemeDetail,
  buildDouyinWorkCandidateUrls,
  buildDouyinWorkResultFromHtmlWork,
  DOUYIN_ANTI_BOT_HTML_PATTERN,
  parseDouyinHtmlWork,
  type DouyinHtmlWork
} from '@/platform/douyin/html'

import {
  closeBrowserSafely,
  configureRequestBlocking,
  createInjectedPage,
  getBrowserLaunchOptions
} from './BrowserRuntime'
import { Config } from './Config'
import { recordFailureTraceStep } from './ErrorTrace'

const DETAIL_TIMEOUT_MS = 30_000
const USER_POST_TIMEOUT_MS = 20_000
const WORK_PAGE_POLL_INTERVAL_MS = 250
export const DOUYIN_WORK_BROWSER_FALLBACK_TIMEOUT_MS = 90_000
export const DOUYIN_WORK_BROWSER_FALLBACK_MAX_CANDIDATES = 4
const MIN_DOUYIN_WORK_BROWSER_RETRY_BUDGET_MS = 1_000
const VERIFY_PAGE_PATTERN = /安全验证|滑块验证|请完成验证/
export const DOUYIN_USER_PAGE_BLOCKED_RESOURCE_TYPES = ['media', 'font'] as const
const DOUYIN_WORK_DETAIL_BLOCKED_RESOURCE_TYPES = ['media', 'font', 'image'] as const

export type BrowserCookie = {
  name: string
  value: string
  domain?: string
  path?: string
  secure?: boolean
  httpOnly?: boolean
  sameSite?: string
  expires?: number
}

type PuppeteerBrowser = Awaited<ReturnType<typeof import('@snapka/puppeteer')['snapka']['launch']>>
type BrowserPage = Awaited<ReturnType<typeof import('fingerprint-injector')['newInjectedPage']>>

type BrowserResponse = {
  url: () => string
  json: () => Promise<any>
}

type ContentWaitPage = {
  content: () => Promise<string>
  url?: () => string
}

type ResponseWaitPage = {
  on: (event: 'response', handler: (response: BrowserResponse) => void) => void
  off?: (event: 'response', handler: (response: BrowserResponse) => void) => void
  removeListener?: (event: 'response', handler: (response: BrowserResponse) => void) => void
}

type DouyinUserResponseWait = Promise<any> & {
  cancel: (error?: Error) => void
}

export type DouyinWorkDetail = DyVideoWork | DyImageAlbumWork | DySlidesWork | (DyImageAlbumWork & ArticleWork)
export type DouyinWorkResult = Result<DouyinWorkDetail>
export type DouyinUserPageBrowserResult = {
  profile: any
  postList?: any
}

type DouyinBrowserWorkAttemptOptions = {
  idData: DouyinIdData
  cookieHeader: string
  timeoutMs: number
}

export type DouyinBrowserFallbackOptions = {
  timeoutMs?: number
  now?: () => number
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const parseCookieHeader = (cookieHeader: unknown): BrowserCookie[] => {
  if (typeof cookieHeader !== 'string' || !cookieHeader.trim()) return []

  const cookies: BrowserCookie[] = []

  for (const item of cookieHeader
    .split(';')
    .map(item => item.trim())
    .filter(item => item && !item.startsWith('__kkk_guest_'))) {
    const index = item.indexOf('=')
    if (index <= 0) continue

    cookies.push({
      name: item.slice(0, index),
      value: item.slice(index + 1),
      domain: '.douyin.com',
      path: '/',
      secure: true
    })
  }

  return cookies
}

export const waitForDouyinWorkPageReady = async (
  page: ContentWaitPage,
  idData: { aweme_id?: string, typeHint?: DouyinIdData['typeHint'] },
  timeoutMs: number,
  resolveCapturedWork?: () => DouyinHtmlWork | null
): Promise<DouyinHtmlWork> => {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown

  while (Date.now() < deadline) {
    const capturedWork = resolveCapturedWork?.()
    if (capturedWork) {
      return capturedWork
    }

    const html = await page.content().catch(() => '')

    if (VERIFY_PAGE_PATTERN.test(html)) {
      throw new Error('抖音分享页未返回可解析数据，疑似风控/验证')
    }

    if (!html || DOUYIN_ANTI_BOT_HTML_PATTERN.test(html)) {
      await sleep(WORK_PAGE_POLL_INTERVAL_MS)
      continue
    }

    try {
      return parseDouyinHtmlWork(html, {
        awemeId: idData.aweme_id,
        typeHint: idData.typeHint,
        url: page.url?.()
      })
    } catch (error) {
      const fallbackWork = resolveCapturedWork?.()
      if (fallbackWork) {
        return fallbackWork
      }
      lastError = error
      await sleep(WORK_PAGE_POLL_INTERVAL_MS)
    }
  }

  const reason = lastError instanceof Error ? `: ${lastError.message}` : ''
  throw new Error(`等待 Douyin 浏览器页面 HTML 解析超时${reason}`)
}

const getUrlSearchParam = (url: string, name: string): string | undefined => {
  try {
    return new URL(url).searchParams.get(name) ?? undefined
  } catch {
    return undefined
  }
}

const createDouyinWorkDetailCapture = (
  page: ResponseWaitPage & { url?: () => string },
  idData: { aweme_id?: string, typeHint?: DouyinIdData['typeHint'] }
) => {
  let capturedWork: DouyinHtmlWork | null = null

  const onResponse = (response: BrowserResponse) => {
    const url = response.url()
    if (!url.includes('/aweme/v1/web/aweme/detail/')) return

    void response.json()
      .then((data: any) => {
        const detail = data?.aweme_detail
        if (!detail || data?.status_code !== 0) return

        const requestAwemeId = getUrlSearchParam(url, 'aweme_id')
        const responseAwemeId = String(detail.aweme_id ?? '').trim()
        const targetAwemeId = String(idData.aweme_id ?? '').trim()

        if (targetAwemeId && requestAwemeId !== targetAwemeId && responseAwemeId !== targetAwemeId) {
          return
        }

        const work = buildDouyinHtmlWorkFromAwemeDetail(detail, {
          awemeId: idData.aweme_id,
          typeHint: idData.typeHint,
          url: page.url?.()
        }, {
          rawSource: 'detail',
          rawPayload: detail
        })

        if (work) {
          capturedWork = work
        }
      })
      .catch(() => {})
  }

  page.on('response', onResponse)

  return {
    getCurrent: () => capturedWork,
    cleanup: () => {
      page.off?.('response', onResponse)
      page.removeListener?.('response', onResponse)
    }
  }
}

const createDouyinUserResponseWait = (
  page: ResponseWaitPage,
  timeoutMs: number,
  match: (url: string, data: any) => boolean,
  timeoutMessage: string
): DouyinUserResponseWait => {
  let cancelWait: (error?: Error) => void = () => {}

  const promise = new Promise<any>((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      clearTimeout(timer)
      page.off?.('response', onResponse)
      page.removeListener?.('response', onResponse)
    }
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }
    const timer = setTimeout(() => {
      finish(() => reject(new Error(timeoutMessage)))
    }, timeoutMs)
    const onResponse = (response: BrowserResponse) => {
      const url = response.url()

      void response.json()
        .then((data: any) => {
          if (data?.status_code === 0 && match(url, data)) {
            finish(() => resolve(data))
          }
        })
        .catch(() => {})
    }

    cancelWait = (error = new Error('等待 Douyin 浏览器用户页响应已取消')) => {
      finish(() => reject(error))
    }

    page.on('response', onResponse)
  })

  return Object.assign(promise, {
    cancel: (error?: Error) => cancelWait(error)
  })
}

export const waitForDouyinUserProfileResponse = (
  page: ResponseWaitPage,
  secUid: string,
  timeoutMs: number
): DouyinUserResponseWait => {
  return createDouyinUserResponseWait(
    page,
    timeoutMs,
    (url, data) => {
      if (!url.includes('/aweme/v1/web/user/profile/other/')) return false
      const requestSecUid = getUrlSearchParam(url, 'sec_user_id')
      return (requestSecUid === secUid || data?.user?.sec_uid === secUid) && Boolean(data?.user)
    },
    '等待 Douyin 浏览器用户主页响应超时'
  )
}

export const waitForDouyinUserPostResponse = (
  page: ResponseWaitPage,
  secUid: string,
  timeoutMs: number
): DouyinUserResponseWait => {
  return createDouyinUserResponseWait(
    page,
    timeoutMs,
    (url, data) => {
      if (!url.includes('/aweme/v1/web/aweme/post/')) return false
      const requestSecUid = getUrlSearchParam(url, 'sec_user_id')
      return requestSecUid === secUid && Array.isArray(data?.aweme_list)
    },
    '等待 Douyin 浏览器用户作品列表响应超时'
  )
}

const shouldRetryDouyinWorkByCleanSession = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error)
  return /等待 Douyin 浏览器页面 HTML 解析超时|等待 Douyin 浏览器详情响应超时|抖音分享页未返回可解析数据|Douyin 浏览器兜底页面疑似出现验证内容/.test(message)
}

const normalizeFallbackTimeoutMs = (value: unknown): number => {
  const timeoutMs = Number(value)
  if (!Number.isFinite(timeoutMs)) return DOUYIN_WORK_BROWSER_FALLBACK_TIMEOUT_MS
  return Math.max(1_000, Math.floor(timeoutMs))
}

const createDouyinWorkFallbackBudgetError = (): Error => {
  return new Error('抖音浏览器兜底总时间预算已耗尽')
}

export const runDouyinWorkBrowserFallback = async <T> (
  idData: DouyinIdData,
  attempt: (options: DouyinBrowserWorkAttemptOptions) => Promise<T>,
  cookieHeader: string = Config.cookies.douyin ?? '',
  options: DouyinBrowserFallbackOptions = {}
): Promise<T> => {
  const now = options.now ?? Date.now
  const timeoutMs = normalizeFallbackTimeoutMs(options.timeoutMs)
  const deadline = now() + timeoutMs
  const runAttempt = async (currentCookieHeader: string): Promise<T> => {
    const remainingMs = deadline - now()
    if (remainingMs <= 0) {
      throw createDouyinWorkFallbackBudgetError()
    }

    recordFailureTraceStep('douyin.browser-fallback.attempt.start', {
      awemeId: idData.aweme_id,
      session: currentCookieHeader ? 'cookie' : 'clean',
      remainingMs
    })
    return await attempt({
      idData,
      cookieHeader: currentCookieHeader,
      timeoutMs: remainingMs
    })
  }

  try {
    return await runAttempt(cookieHeader)
  } catch (error) {
    if (parseCookieHeader(cookieHeader).length === 0 || !shouldRetryDouyinWorkByCleanSession(error)) {
      throw error
    }

    const remainingMs = deadline - now()
    if (remainingMs < MIN_DOUYIN_WORK_BROWSER_RETRY_BUDGET_MS) {
      recordFailureTraceStep('douyin.browser-fallback.clean-session.skip', {
        awemeId: idData.aweme_id,
        reason: 'budget-exhausted',
        remainingMs
      })
      logger.warn(`[DouyinBrowserFallback] 作品 ${idData.aweme_id} 带 Cookie 浏览器兜底失败，但剩余 ${Math.max(0, remainingMs)}ms 不足以重试干净会话`)
      throw error
    }

    logger.warn(`[DouyinBrowserFallback] 作品 ${idData.aweme_id} 带 Cookie 浏览器兜底失败，改用干净会话重试: ${error instanceof Error ? error.message : String(error)}`)
    recordFailureTraceStep('douyin.browser-fallback.clean-session.start', {
      awemeId: idData.aweme_id,
      remainingMs
    })
    return await runAttempt('')
  }
}

export const fetchDouyinUserPageByBrowser = async (secUid: string): Promise<DouyinUserPageBrowserResult> => {
  let puppeteer: PuppeteerBrowser | undefined

  try {
    const { snapka } = await import('@snapka/puppeteer')

    puppeteer = await snapka.launch(getBrowserLaunchOptions(DETAIL_TIMEOUT_MS))

    const page: BrowserPage = await createInjectedPage(puppeteer.browser)

    const cookies = parseCookieHeader(Config.cookies.douyin)
    if (cookies.length > 0) {
      await page.setCookie(...cookies)
    }

    await configureRequestBlocking(page, DOUYIN_USER_PAGE_BLOCKED_RESOURCE_TYPES)

    const profileWait = waitForDouyinUserProfileResponse(page, secUid, DETAIL_TIMEOUT_MS)
    const postWait = waitForDouyinUserPostResponse(page, secUid, USER_POST_TIMEOUT_MS)
    profileWait.catch(() => {})
    postWait.catch(() => {})

    try {
      await page.goto(`https://www.douyin.com/user/${secUid}`, {
        timeout: DETAIL_TIMEOUT_MS,
        waitUntil: 'domcontentloaded'
      })
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error))
      profileWait.cancel(normalized)
      postWait.cancel(normalized)
      throw error
    }

    const profile = await profileWait
    const postList = await postWait.catch(() => undefined)
    if (!postList) {
      logger.warn(`[DouyinBrowserFallback] 用户 ${secUid} 浏览器兜底只获取到主页，未捕获作品列表响应`)
    }

    const content = await page.content().catch(() => '')
    if (VERIFY_PAGE_PATTERN.test(content)) {
      throw new Error('Douyin 浏览器用户页兜底疑似出现验证内容')
    }

    return { profile, postList }
  } catch (error) {
    logger.warn(`[DouyinBrowserFallback] 用户 ${secUid} 浏览器兜底失败: ${error instanceof Error ? error.message : String(error)}`)
    throw error
  } finally {
    await closeBrowserSafely(puppeteer)
  }
}

const fetchDouyinHtmlWorkByBrowserOnce = async (
  idData: DouyinIdData,
  cookieHeader: string,
  attemptLabel: '带 Cookie' | '干净会话',
  timeoutMs: number
): Promise<DouyinHtmlWork> => {
  let puppeteer: PuppeteerBrowser | undefined
  const deadline = Date.now() + timeoutMs
  const getRemainingAttemptTimeout = (): number => {
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) {
      throw createDouyinWorkFallbackBudgetError()
    }
    return Math.max(1, Math.min(DETAIL_TIMEOUT_MS, remainingMs))
  }

  try {
    const { snapka } = await import('@snapka/puppeteer')

    puppeteer = await snapka.launch(getBrowserLaunchOptions(getRemainingAttemptTimeout()))

    const page: BrowserPage = await createInjectedPage(puppeteer.browser)

    const cookies = parseCookieHeader(cookieHeader)
    if (cookies.length > 0) {
      await page.setCookie(...cookies)
    }

    await configureRequestBlocking(page, DOUYIN_WORK_DETAIL_BLOCKED_RESOURCE_TYPES)

    const candidateUrls = buildDouyinWorkCandidateUrls(idData)
      .slice(0, DOUYIN_WORK_BROWSER_FALLBACK_MAX_CANDIDATES)
    let lastError: unknown

    for (const [index, candidateUrl] of candidateUrls.entries()) {
      const candidateTimeoutMs = getRemainingAttemptTimeout()
      const detailCapture = createDouyinWorkDetailCapture(page, idData)
      try {
        recordFailureTraceStep('douyin.browser-fallback.candidate.start', {
          awemeId: idData.aweme_id,
          index: index + 1,
          totalCandidates: candidateUrls.length,
          timeoutMs: candidateTimeoutMs
        })
        await page.goto(candidateUrl, {
          timeout: candidateTimeoutMs,
          waitUntil: 'domcontentloaded'
        })
        return await waitForDouyinWorkPageReady(
          page,
          idData,
          getRemainingAttemptTimeout(),
          idData.typeHint === 'article' ? detailCapture.getCurrent : undefined
        )
      } catch (error) {
        lastError = error
        recordFailureTraceStep('douyin.browser-fallback.candidate.error', {
          awemeId: idData.aweme_id,
          index: index + 1,
          message: error instanceof Error ? error.message : String(error)
        })
      } finally {
        detailCapture.cleanup()
      }
    }

    throw lastError ?? new Error('Douyin 浏览器兜底页面未返回可解析 HTML')
  } catch (error) {
    logger.warn(`[DouyinBrowserFallback] 作品 ${idData.aweme_id} ${attemptLabel}浏览器兜底失败: ${error instanceof Error ? error.message : String(error)}`)
    throw error
  } finally {
    await closeBrowserSafely(puppeteer)
  }
}

const normalizeDouyinWorkIdData = (input: string | DouyinIdData): DouyinIdData => {
  if (typeof input === 'string') {
    return {
      type: 'one_work',
      aweme_id: input
    }
  }

  return input
}

export const fetchDouyinHtmlWorkByBrowser = async (input: string | DouyinIdData): Promise<DouyinHtmlWork> => {
  const idData = normalizeDouyinWorkIdData(input)

  return await runDouyinWorkBrowserFallback(
    idData,
    async ({ idData, cookieHeader, timeoutMs }) => await fetchDouyinHtmlWorkByBrowserOnce(
      idData,
      cookieHeader,
      cookieHeader ? '带 Cookie' : '干净会话',
      timeoutMs
    )
  ) as DouyinHtmlWork
}

export const fetchDouyinWorkByBrowser = async (input: string | DouyinIdData): Promise<DouyinWorkResult> => {
  const htmlWork = await fetchDouyinHtmlWorkByBrowser(input)
  return buildDouyinWorkResultFromHtmlWork(htmlWork)
}
