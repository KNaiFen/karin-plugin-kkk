import { logger } from 'node-karin'

import { recordFailureTraceStep } from './ErrorTrace'
import { guestCookieManager, type GuestCookiePlatform } from './GuestCookieManager'

export const GUEST_COOKIE_ERROR_RECOVERY_COOLDOWN_MS = 5 * 60 * 1000

type GuestCookieRecoveryOptions<T> = {
  afterRefresh?: () => void | Promise<void>
  context?: string
  refresh?: () => Promise<boolean>
  logger?: Pick<typeof logger, 'warn'>
  shouldRetryOnError?: (error: unknown) => boolean
  shouldRetryOnResult?: (result: T) => boolean
}

type GuestCookieRecoveryState = {
  lastAttemptAt: number
  generation: number
  inFlight?: Promise<boolean>
  lastRefreshSucceeded?: boolean
}

type GuestCookieRecoveryOperationStart = Pick<GuestCookieRecoveryStatus, 'generation' | 'refreshInFlight'>

export type GuestCookieRecoveryStatus = {
  generation: number
  refreshInFlight: boolean
  inCooldown: boolean
  cooldownRemainingMs: number
  lastRefreshSucceeded?: boolean
}

const GENERIC_GUEST_COOKIE_ERROR_PATTERN = /cookie.*失效|ck可能已经失效|接口返回内容为空|未登录|需要登录|要求登录|当前未获取到可用|status code 401|status code 403|forbidden|unauthorized|更强登录态/i

const PLATFORM_GUEST_COOKIE_ERROR_PATTERNS: Record<GuestCookiePlatform, RegExp> = {
  douyin: /抖音数据获取失败|无有效数据|反爬|风控限制|抖音ck|cookie.*失效/i,
  xiaohongshu: /小红书笔记详情为空|note_?card|小红书.*cookie|web_session|a1=/i,
  tiktok: /TikTok 作品详情获取失败|item\/detail .*未返回作品数据|HTML .*未返回作品数据|ttwid|msToken/i,
  heybox: /小黑盒 Cookie|x_xhh_tokenid/i,
  zhihu: /知乎.*拦截|更强登录态/i,
  weibo: /微博详情接口要求登录|微博 Cookie/i
}

const recoveryState = new Map<GuestCookiePlatform, GuestCookieRecoveryState>()

const stringifyGuestCookieRecoveryError = (error: unknown): string => {
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

const getGuestCookieRecoveryLogger = (
  customLogger?: Pick<typeof logger, 'warn'>
): Pick<typeof logger, 'warn'> => {
  return customLogger ?? logger
}

export const getGuestCookieRecoveryStatus = (
  platform: GuestCookiePlatform,
  now: number = Date.now()
): GuestCookieRecoveryStatus => {
  const current = recoveryState.get(platform)
  const elapsedMs = current ? Math.max(0, now - current.lastAttemptAt) : GUEST_COOKIE_ERROR_RECOVERY_COOLDOWN_MS
  const cooldownRemainingMs = current
    ? Math.max(0, GUEST_COOKIE_ERROR_RECOVERY_COOLDOWN_MS - elapsedMs)
    : 0

  return {
    generation: current?.generation ?? 0,
    refreshInFlight: Boolean(current?.inFlight),
    inCooldown: Boolean(current && !current.inFlight && cooldownRemainingMs > 0),
    cooldownRemainingMs,
    lastRefreshSucceeded: current?.lastRefreshSucceeded
  }
}

const refreshGuestCookieForRecovery = async (
  platform: GuestCookiePlatform,
  operationStart: GuestCookieRecoveryOperationStart,
  customLogger?: Pick<typeof logger, 'warn'>,
  customRefresh?: () => Promise<boolean>
): Promise<boolean> => {
  const current = recoveryState.get(platform)
  if (current?.inFlight) {
    recordFailureTraceStep('guest-cookie.recovery.refresh.reuse', {
      platform,
      generation: current.generation
    })
    return await current.inFlight
  }

  const sharedRefreshCompleted = Boolean(
    current?.lastRefreshSucceeded && (
      current.generation > operationStart.generation ||
      (operationStart.refreshInFlight && current.generation === operationStart.generation)
    )
  )
  if (sharedRefreshCompleted) {
    recordFailureTraceStep('guest-cookie.recovery.refresh.reuse-completed', {
      platform,
      generation: current?.generation,
      operationStartGeneration: operationStart.generation
    })
    return true
  }

  const now = Date.now()
  if (current && now - current.lastAttemptAt < GUEST_COOKIE_ERROR_RECOVERY_COOLDOWN_MS) {
    recordFailureTraceStep('guest-cookie.recovery.refresh.cooldown', {
      platform,
      generation: current.generation,
      cooldownMs: GUEST_COOKIE_ERROR_RECOVERY_COOLDOWN_MS,
      cooldownRemainingMs: GUEST_COOKIE_ERROR_RECOVERY_COOLDOWN_MS - (now - current.lastAttemptAt)
    })
    return false
  }

  const outputLogger = getGuestCookieRecoveryLogger(customLogger)
  const generation = (current?.generation ?? 0) + 1
  let refreshSucceeded: boolean | undefined
  const task = (async () => {
    recordFailureTraceStep('guest-cookie.recovery.refresh.start', {
      platform,
      generation
    })
    try {
      const refreshed = await (customRefresh?.() ?? guestCookieManager.refreshPlatform(platform, 'ensure'))
      refreshSucceeded = refreshed
      recordFailureTraceStep('guest-cookie.recovery.refresh.finish', {
        platform,
        generation,
        refreshed
      })
      return refreshed
    } catch (error) {
      refreshSucceeded = false
      recordFailureTraceStep('guest-cookie.recovery.refresh.error', {
        platform,
        generation,
        message: error instanceof Error ? error.message : String(error)
      })
      outputLogger.warn(`[GuestCookie] ${platform} 异常恢复刷新失败: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  })()

  recoveryState.set(platform, {
    lastAttemptAt: now,
    generation,
    inFlight: task
  })

  return await task.finally(() => {
    const latest = recoveryState.get(platform)
    if (latest?.inFlight !== task) return
    recoveryState.set(platform, {
      lastAttemptAt: latest.lastAttemptAt,
      generation: latest.generation,
      lastRefreshSucceeded: refreshSucceeded
    })
  })
}

export const shouldRefreshGuestCookieAfterError = (
  platform: GuestCookiePlatform,
  error: unknown
): boolean => {
  const text = stringifyGuestCookieRecoveryError(error)

  if (GENERIC_GUEST_COOKIE_ERROR_PATTERN.test(text)) return true
  if (PLATFORM_GUEST_COOKIE_ERROR_PATTERNS[platform].test(text)) return true

  const code = (error as { code?: unknown })?.code
  return platform === 'douyin' && code === 500 && /抖音数据获取失败/.test(text)
}

export const retryWithGuestCookieRecovery = async <T>(
  platform: GuestCookiePlatform,
  operation: () => Promise<T>,
  options: GuestCookieRecoveryOptions<T> = {}
): Promise<T> => {
  const {
    afterRefresh,
    context = `${platform} 请求`,
    refresh,
    logger: customLogger,
    shouldRetryOnError = (error) => shouldRefreshGuestCookieAfterError(platform, error),
    shouldRetryOnResult
  } = options

  const outputLogger = getGuestCookieRecoveryLogger(customLogger)
  const operationStart = getGuestCookieRecoveryStatus(platform)

  recordFailureTraceStep('guest-cookie.recovery.operation.start', {
    platform,
    context
  })

  let result: T
  try {
    result = await operation()
  } catch (error) {
    recordFailureTraceStep('guest-cookie.recovery.operation.error', {
      platform,
      context,
      message: error instanceof Error ? error.message : String(error),
      recovery: getGuestCookieRecoveryStatus(platform)
    })
    if (!shouldRetryOnError(error)) {
      recordFailureTraceStep('guest-cookie.recovery.operation.error-nonretryable', {
        platform,
        context
      })
      throw error
    }

    const refreshed = await refreshGuestCookieForRecovery(platform, operationStart, customLogger, refresh)
    if (!refreshed) {
      recordFailureTraceStep('guest-cookie.recovery.operation.error-retry-skipped', {
        platform,
        context,
        recovery: getGuestCookieRecoveryStatus(platform)
      })
      throw error
    }

    await afterRefresh?.()
    recordFailureTraceStep('guest-cookie.recovery.operation.retry', {
      platform,
      context,
      reason: 'error'
    })
    outputLogger.warn(`[GuestCookie] ${context} 疑似 ${platform} 游客 Cookie 失效，已刷新并重试一次`)
    return await operation()
  }

  if (!shouldRetryOnResult?.(result)) {
    recordFailureTraceStep('guest-cookie.recovery.operation.result', {
      platform,
      context,
      retry: false
    })
    return result
  }

  recordFailureTraceStep('guest-cookie.recovery.operation.result-suspicious', {
    platform,
    context,
    recovery: getGuestCookieRecoveryStatus(platform)
  })
  const refreshed = await refreshGuestCookieForRecovery(platform, operationStart, customLogger, refresh)
  if (!refreshed) {
    recordFailureTraceStep('guest-cookie.recovery.operation.result-retry-skipped', {
      platform,
      context,
      recovery: getGuestCookieRecoveryStatus(platform)
    })
    return result
  }

  await afterRefresh?.()
  recordFailureTraceStep('guest-cookie.recovery.operation.retry', {
    platform,
    context,
    reason: 'suspicious-result'
  })
  outputLogger.warn(`[GuestCookie] ${context} 疑似 ${platform} 游客 Cookie 失效，已刷新并重试一次`)
  return await operation()
}

export const resetGuestCookieRecoveryState = () => {
  recoveryState.clear()
}
