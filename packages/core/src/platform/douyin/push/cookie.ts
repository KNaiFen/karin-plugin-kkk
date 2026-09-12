import { logger } from 'node-karin'

import {
  type GuestCookieEnsureOptions,
  guestCookieManager,
  type GuestCookiePlatform
} from '@/module/utils/GuestCookieManager'
import { retryWithGuestCookieRecovery } from '@/module/utils/GuestCookieRecovery'

type GuestCookieRefreshReason = 'startup' | 'scheduled' | 'manual' | 'ensure'

type DouyinPushCookieRuntime = {
  ensureFreshCookie?: (platform: GuestCookiePlatform, options?: GuestCookieEnsureOptions) => Promise<boolean>
  refreshPlatform?: (platform: GuestCookiePlatform, reason: GuestCookieRefreshReason) => Promise<boolean>
  reloadConfig: () => void
  logger?: Pick<typeof logger, 'warn'>
}

const stringifyError = (error: unknown): string => {
  const parts: string[] = []

  if (error instanceof Error) {
    parts.push(error.name, error.message)
  } else {
    parts.push(String(error))
  }

  const extra = error as { code?: unknown, rawError?: unknown, cause?: unknown }
  if (extra?.code !== undefined) parts.push(String(extra.code))
  for (const value of [extra?.rawError, extra?.cause]) {
    if (value === undefined || value === null) continue
    if (value instanceof Error) {
      parts.push(value.name, value.message)
      continue
    }
    try {
      parts.push(JSON.stringify(value))
    } catch {
      parts.push(String(value))
    }
  }

  return parts.join('\n')
}

type DouyinPushResultLike = {
  success?: unknown
  code?: unknown
  message?: unknown
  error?: unknown
  data?: unknown
}

export const assertSuccessfulDouyinPushResult = <T>(result: T, context: string): T => {
  const value = result as DouyinPushResultLike | null | undefined
  if (value && value.success !== false && value.data !== undefined && value.data !== null) {
    return result
  }

  const message = typeof value?.message === 'string' && value.message
    ? value.message
    : '抖音数据获取失败'
  const error = new Error(`${context}失败: ${message}`)
  Object.assign(error, {
    code: value?.code,
    rawError: value?.error ?? value
  })
  throw error
}

export const prepareDouyinPushCookie = async (runtime: DouyinPushCookieRuntime): Promise<boolean> => {
  const ensureFreshCookie = runtime.ensureFreshCookie ?? guestCookieManager.ensureFreshCookie.bind(guestCookieManager)
  const refreshed = await ensureFreshCookie('douyin', { waitForStale: true })

  if (refreshed) runtime.reloadConfig()
  return refreshed
}

export const shouldRefreshDouyinCookieAfterError = (error: unknown): boolean => {
  const text = stringifyError(error)
  const code = (error as { code?: unknown })?.code
  const hasDouyinFetchFailure = /抖音数据获取失败/.test(text) || code === 500
  const hasCookieFailure = /接口返回内容为空|抖音ck|ck可能已经失效|cookie.*失效/i.test(text)

  return hasDouyinFetchFailure && hasCookieFailure
}

export const shouldFallbackDouyinUserPageAfterError = (error: unknown): boolean => {
  const text = stringifyError(error)
  const code = (error as { code?: unknown })?.code

  return shouldRefreshDouyinCookieAfterError(error) ||
    code === 500 ||
    /抖音数据获取失败|获取响应数据失败|接口返回内容为空/i.test(text)
}

export const retryDouyinPushAfterCookieRefresh = async <T>(
  operation: () => Promise<T>,
  runtime: DouyinPushCookieRuntime,
  context: string
): Promise<T> => {
  const refreshPlatform = runtime.refreshPlatform ?? guestCookieManager.refreshPlatform.bind(guestCookieManager)
  const outputLogger = runtime.logger ?? logger

  return await retryWithGuestCookieRecovery('douyin', operation, {
    context: `[DouYinPush] ${context}`,
    logger: outputLogger,
    refresh: async () => await refreshPlatform('douyin', 'ensure'),
    afterRefresh: () => {
      runtime.reloadConfig()
    },
    shouldRetryOnError: shouldRefreshDouyinCookieAfterError
  })
}
