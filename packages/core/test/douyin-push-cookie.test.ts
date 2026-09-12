import { describe, expect, it, vi } from 'vitest'

import { resetGuestCookieRecoveryState } from '../src/module/utils/GuestCookieRecovery'
import {
  assertSuccessfulDouyinPushResult,
  prepareDouyinPushCookie,
  retryDouyinPushAfterCookieRefresh,
  shouldFallbackDouyinUserPageAfterError,
  shouldRefreshDouyinCookieAfterError
} from '../src/platform/douyin/push/cookie'

describe('Douyin push cookie handling', () => {
  it('refreshes and retries once when Douyin reports an invalid cookie response', async () => {
    resetGuestCookieRecoveryState()
    const ensureFreshCookie = vi.fn(async () => true)
    const reloadConfig = vi.fn()

    await prepareDouyinPushCookie({ ensureFreshCookie, reloadConfig })

    expect(ensureFreshCookie).toHaveBeenCalledWith('douyin', { waitForStale: true })
    expect(reloadConfig).toHaveBeenCalledTimes(1)
  })

  it('waits for stale guest cookies before push and reloads the active client', async () => {
    resetGuestCookieRecoveryState()
    const error = new Error('抖音数据获取失败')
    Object.assign(error, {
      rawError: {
        errorDescription: '获取响应数据失败！接口返回内容为空，你的抖音ck可能已经失效！'
      }
    })
    const operation = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('ok')
    const refreshPlatform = vi.fn(async () => true)
    const reloadConfig = vi.fn()

    await expect(retryDouyinPushAfterCookieRefresh(operation, {
      refreshPlatform,
      reloadConfig
    }, '用户主页')).resolves.toBe('ok')

    expect(operation).toHaveBeenCalledTimes(2)
    expect(refreshPlatform).toHaveBeenCalledWith('douyin', 'ensure')
    expect(reloadConfig).toHaveBeenCalledTimes(1)
  })

  it('does not refresh for unrelated API errors', async () => {
    const error = new Error('network timeout')

    expect(shouldRefreshDouyinCookieAfterError(error)).toBe(false)
  })

  it('turns unsuccessful Douyin result objects into fallbackable errors', () => {
    const result = {
      success: false,
      code: 500,
      message: '抖音数据获取失败',
      data: undefined
    }

    expect(() => assertSuccessfulDouyinPushResult(result, '获取用户主页')).toThrow('获取用户主页失败')

    try {
      assertSuccessfulDouyinPushResult(result, '获取用户主页')
    } catch (error) {
      expect(shouldFallbackDouyinUserPageAfterError(error)).toBe(true)
      expect((error as any).code).toBe(500)
    }
  })
})
