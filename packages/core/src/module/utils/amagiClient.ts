import util from 'node:util'

import Client, { type Result } from '@ikenxuan/amagi'
import { logger } from 'node-karin'

import { Config } from './Config'
import { recordFailureTraceStep } from './ErrorTrace'
import { GUEST_COOKIE_PLATFORMS, type GuestCookiePlatform } from './GuestCookieManager'
import { retryWithGuestCookieRecovery } from './GuestCookieRecovery'
import { buildConfiguredRequestOptions } from './RequestConfig'

type AmagiClient = ReturnType<typeof Client>

const summarizeTraceValue = (value: unknown, depth = 0): unknown => {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return value.length > 300 ? `${value.slice(0, 300)}...` : value
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message
    }
  }
  if (depth >= 2) {
    if (Array.isArray(value)) return `[Array(${value.length})]`
    if (typeof value === 'object') return '[Object]'
  }
  if (Array.isArray(value)) {
    return value.slice(0, 5).map(item => summarizeTraceValue(item, depth + 1))
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value).slice(0, 10)) {
      result[key] = key.toLowerCase().includes('cookie') ? '<redacted>' : summarizeTraceValue(item, depth + 1)
    }
    return result
  }
  return String(value)
}

const summarizeTraceArgs = (args: any[]): unknown[] => {
  return args.map(arg => summarizeTraceValue(arg))
}

const summarizeAmagiResult = (result: unknown): Record<string, unknown> => {
  if (!result || typeof result !== 'object') {
    return {
      type: typeof result
    }
  }

  const typedResult = result as any
  return {
    success: typedResult.success,
    code: typedResult.code,
    message: typedResult.message,
    hasData: typedResult.data !== undefined,
    awemeId: typedResult.data?.aweme_detail?.aweme_id,
    awemeType: typedResult.data?.aweme_detail?.aweme_type,
    noteId: typedResult.data?.data?.items?.[0]?.note_card?.note_id
  }
}

/**
 * Amagi 错误类，携带原始响应数据
 */
export class AmagiError extends Error {
  code: number
  data: any
  rawError: any

  constructor (code: number, message: string, data: any, rawError: any) {
    super(message)
    this.name = 'AmagiError'
    this.code = code
    this.data = data
    this.rawError = rawError
  }
}

/** 解析库基类 */
export class AmagiBase {
  /** 解析库实例 */
  amagi: AmagiClient
  /** 当前原始解析库实例 */
  private rawAmagi: AmagiClient

  constructor () {
    const client = this.createAmagiClient()
    this.rawAmagi = client
    this.amagi = this.wrapAmagiClient(() => this.rawAmagi)
  }

  /** 创建解析库实例 */
  protected createAmagiClient = (): AmagiClient => {
    return Client({
      cookies: {
        douyin: Config.cookies.douyin,
        bilibili: Config.cookies.bilibili,
        kuaishou: Config.cookies.kuaishou,
        xiaohongshu: Config.cookies.xiaohongshu
      },
      request: buildConfiguredRequestOptions(Config.request)
    })
  }

  /**
   * 重载配置 - 重新创建 Amagi Client 实例
   * 当配置文件中的 cookies 或 request 配置更新后，调用此方法使新配置生效
   */
  reloadConfig () {
    logger.debug('[AmagiClient] 检测到配置变化，正在重载...')
    
    const describeCookies = () => ({
      douyin: {
        configured: Boolean(Config.cookies.douyin),
        length: Config.cookies.douyin?.length ?? 0
      },
      bilibili: {
        configured: Boolean(Config.cookies.bilibili),
        length: Config.cookies.bilibili?.length ?? 0
      },
      kuaishou: {
        configured: Boolean(Config.cookies.kuaishou),
        length: Config.cookies.kuaishou?.length ?? 0
      },
      xiaohongshu: {
        configured: Boolean(Config.cookies.xiaohongshu),
        length: Config.cookies.xiaohongshu?.length ?? 0
      }
    })

    const oldCookies = describeCookies()
    
    // 重新创建客户端实例
    const client = this.createAmagiClient()
    this.rawAmagi = client
    
    const newCookies = describeCookies()
    
    logger.debug('[AmagiClient] 配置重载完成')
    logger.debug(`[AmagiClient] Cookie 配置状态:\n${util.inspect({ 旧配置: oldCookies, 新配置: newCookies }, { colors: true, depth: 2 })}`)
  }

  /** 包装解析库实例，递归代理所有嵌套对象的方法 */
  protected wrapAmagiClient = (targetGetter: () => any, path: string[] = []): AmagiClient => {
    const base = this

    const resolveGuestCookiePlatform = (path: string[]): GuestCookiePlatform | null => {
      const platform = path[0]
      return GUEST_COOKIE_PLATFORMS.includes(platform as GuestCookiePlatform)
        ? platform as GuestCookiePlatform
        : null
    }

    const shouldRetrySuspiciousFetcherResult = (path: string[], result: unknown): boolean => {
      return path[0] === 'xiaohongshu' &&
        path[1] === 'fetcher' &&
        path.at(-1) === 'fetchNoteDetail' &&
        !(result as any)?.data?.data?.items?.[0]?.note_card
    }

    const isResultType = (val: unknown): val is Result<any> => {
      if (!val || typeof val !== 'object') return false
      if (!('success' in val) || typeof (val as any).success !== 'boolean') return false
      if (!('code' in val) || !('message' in val)) return false
      return true
    }

    const createProxy = (getter: () => any, currentPath: string[] = []): any => {
      return new Proxy({}, {
        get (_obj: any, prop: string | symbol) {
          const value = getter()?.[prop]
          const nextPath = [...currentPath, String(prop)]

          // 如果是对象（非 null），递归代理
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            return createProxy(() => getter()?.[prop], nextPath)
          }

          // 如果是函数，包装它以检查返回值
          if (typeof value === 'function') {
            return async (...args: any[]) => {
              recordFailureTraceStep('amagi.invoke.start', {
                path: nextPath.join('.'),
                args: summarizeTraceArgs(args)
              })

              const invoke = async () => {
                const currentTarget = getter()
                const currentValue = currentTarget?.[prop]
                if (typeof currentValue !== 'function') {
                  recordFailureTraceStep('amagi.invoke.unavailable', {
                    path: nextPath.join('.')
                  })
                  throw new Error(`Amagi client 方法不可用: ${nextPath.join('.')}`)
                }

                const result = await currentValue.apply(currentTarget, args)

                if (isResultType(result)) {
                  if (result.success === true) {
                    recordFailureTraceStep('amagi.invoke.result', {
                      path: nextPath.join('.'),
                      ...summarizeAmagiResult(result)
                    })
                    return result
                  }

                  // 构建详细的错误消息
                  const errMessage = result.message || (result.error as any)?.amagiMessage || '请求失败'
                  const errorDetails = util.inspect(
                    { code: result.code, data: result.data, message: errMessage, error: result.error },
                    { depth: 10, colors: true, compact: false, breakLength: 120, showHidden: true }
                  )

                  const err = new AmagiError(result.code, errorDetails, result.data, result.error)
                  recordFailureTraceStep('amagi.invoke.result-error', {
                    path: nextPath.join('.'),
                    code: result.code,
                    message: errMessage
                  })
                  throw err
                }

                recordFailureTraceStep('amagi.invoke.result', {
                  path: nextPath.join('.'),
                  result: summarizeTraceValue(result)
                })
                return result
              }

              const platform = resolveGuestCookiePlatform(nextPath)
              const isFetcherMethod = nextPath[1] === 'fetcher' && typeof prop === 'string'

              if (!platform || !isFetcherMethod) {
                try {
                  return await invoke()
                } catch (error) {
                  recordFailureTraceStep('amagi.invoke.error', {
                    path: nextPath.join('.'),
                    message: error instanceof Error ? error.message : String(error)
                  })
                  throw error
                }
              }

              try {
                return await retryWithGuestCookieRecovery(platform, invoke, {
                  afterRefresh: () => {
                    base.reloadConfig()
                  },
                  context: nextPath.join('.'),
                  shouldRetryOnResult: result => shouldRetrySuspiciousFetcherResult(nextPath, result)
                })
              } catch (error) {
                recordFailureTraceStep('amagi.invoke.error', {
                  path: nextPath.join('.'),
                  message: error instanceof Error ? error.message : String(error)
                })
                throw error
              }
            }
          }

          return value
        }
      })
    }

    return createProxy(targetGetter, path)
  }
}

/**
 * 已知的软性错误码 — 这些接口响应属于正常业务边缘情况，不应中断执行流程。
 * 在 softFetch 中配置后，对应接口调用不会抛出异常，而是原样返回 Result，
 * 由业务代码根据 code 决定后续处理逻辑。
 *
 * Bilibili:
 *   12061 - UP主已关闭评论区
 */
export const SOFT_ERROR_CODES = {
  BILIBILI_COMMENTS_DISABLED: 12061
} as const

/**
 * 调用 amagi fetcher 方法，允许特定错误码不抛出异常而是以 Result 形式返回。
 * 用于处理已知的非致命接口响应（例如评论区已关闭）。
 * 业务代码收到返回值后，通过判断 result.code 决定继续解析还是返回提示。
 *
 * @param fn           - 经过代理包装的 amagi 方法调用
 * @param allowedCodes - 不应抛出异常的错误码列表
 */
export const softFetch = async <T>(
  fn: () => Promise<Result<T>>,
  allowedCodes: number[]
): Promise<Result<T>> => {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof AmagiError && allowedCodes.includes(err.code)) {
      return {
        success: false,
        code: err.code,
        data: err.data,
        message: err.message,
        error: err.rawError
      } as unknown as Result<T>
    }
    throw err
  }
}

/** 获取已初始化的解析库实例（单例） */
const createLiveProxy = <T extends object>(getter: () => T): T => {
  return new Proxy({} as T, {
    get (_target, prop: string | symbol) {
      const current = getter()
      const value = Reflect.get(current, prop)

      if (typeof value === 'function') {
        return value.bind(current)
      }

      if (value && typeof value === 'object') {
        return createLiveProxy(() => Reflect.get(getter(), prop) as T)
      }

      return value
    }
  })
}

const amagiClientInstance = new AmagiBase()

/** 导出 Amagi Client 实例 */
export const amagiClient: AmagiClient = createLiveProxy(() => amagiClientInstance.amagi)

/**
 * 重载 Amagi 配置
 * 当 cookies 或 request 配置更新后调用此方法，使新配置立即生效
 * @example
 * ```typescript
 * // 更新配置后
 * await Config.Modify('cookies', 'douyin', newCookie)
 * reloadAmagiConfig() // 重载配置
 * ```
 */
export const reloadAmagiConfig = () => {
  amagiClientInstance.reloadConfig()
}

/** B站 Fetcher 实例 */
export const bilibiliFetcher = amagiClient.bilibili.fetcher

/** 抖音 Fetcher 实例 */
export const douyinFetcher = amagiClient.douyin.fetcher

/** 快手 Fetcher 实例 */
export const kuaishouFetcher = amagiClient.kuaishou.fetcher

/** 小红书 Fetcher 实例 */
export const xiaohongshuFetcher = amagiClient.xiaohongshu.fetcher
