import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  refreshPlatform: vi.fn(async () => true),
  warn: vi.fn()
}))

vi.mock('../src/module/utils/GuestCookieManager', () => ({
  guestCookieManager: {
    refreshPlatform: (...args: unknown[]) => state.refreshPlatform(...args)
  }
}))

vi.mock('node-karin', () => ({
  logger: {
    warn: (...args: unknown[]) => state.warn(...args)
  }
}))

const {
  GUEST_COOKIE_ERROR_RECOVERY_COOLDOWN_MS,
  getGuestCookieRecoveryStatus,
  resetGuestCookieRecoveryState,
  retryWithGuestCookieRecovery
} = await import('../src/module/utils/GuestCookieRecovery')

describe('guest cookie recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-03T20:30:00.000Z'))
    resetGuestCookieRecoveryState()
    state.refreshPlatform.mockReset()
    state.refreshPlatform.mockResolvedValue(true)
    state.warn.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('refreshes and retries once for retryable guest cookie errors', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('微博详情接口要求登录，当前未获取到可用微博 Cookie'))
      .mockResolvedValueOnce('ok')

    await expect(retryWithGuestCookieRecovery('weibo', operation, {
      context: '获取微博详情'
    })).resolves.toBe('ok')

    expect(operation).toHaveBeenCalledTimes(2)
    expect(state.refreshPlatform).toHaveBeenCalledWith('weibo', 'ensure')
    expect(state.warn).toHaveBeenCalledTimes(1)
    expect(getGuestCookieRecoveryStatus('weibo')).toMatchObject({
      generation: 1,
      refreshInFlight: false,
      inCooldown: true,
      lastRefreshSucceeded: true
    })
  })

  it('does not repeatedly refresh within the cooldown window', async () => {
    const first = vi.fn()
      .mockRejectedValueOnce(new Error('微博详情接口要求登录，当前未获取到可用微博 Cookie'))
      .mockResolvedValueOnce('ok')

    await expect(retryWithGuestCookieRecovery('weibo', first, {
      context: '首次获取微博详情'
    })).resolves.toBe('ok')

    const secondError = new Error('微博详情接口要求登录，当前未获取到可用微博 Cookie')
    const second = vi.fn().mockRejectedValueOnce(secondError)

    vi.advanceTimersByTime(GUEST_COOKIE_ERROR_RECOVERY_COOLDOWN_MS - 1)

    await expect(retryWithGuestCookieRecovery('weibo', second, {
      context: '二次获取微博详情'
    })).rejects.toBe(secondError)

    expect(second).toHaveBeenCalledTimes(1)
    expect(state.refreshPlatform).toHaveBeenCalledTimes(1)
  })

  it('lets every request overlapping the same successful refresh retry once', async () => {
    let resolveRefresh!: (value: boolean) => void
    const refreshPending = new Promise<boolean>(resolve => {
      resolveRefresh = resolve
    })
    state.refreshPlatform.mockImplementationOnce(async () => await refreshPending)

    const first = vi.fn()
      .mockRejectedValueOnce(new Error('微博详情接口要求登录'))
      .mockResolvedValueOnce('first-ok')
    const second = vi.fn()
      .mockRejectedValueOnce(new Error('微博详情接口要求登录'))
      .mockResolvedValueOnce('second-ok')

    const firstResult = retryWithGuestCookieRecovery('weibo', first, {
      context: '并发请求一'
    })
    await vi.waitFor(() => {
      expect(state.refreshPlatform).toHaveBeenCalledTimes(1)
    })

    const secondResult = retryWithGuestCookieRecovery('weibo', second, {
      context: '并发请求二'
    })
    await Promise.resolve()
    resolveRefresh(true)

    await expect(Promise.all([firstResult, secondResult])).resolves.toEqual([
      'first-ok',
      'second-ok'
    ])
    expect(first).toHaveBeenCalledTimes(2)
    expect(second).toHaveBeenCalledTimes(2)
    expect(state.refreshPlatform).toHaveBeenCalledTimes(1)
  })

  it('reuses a just-completed refresh for a request that started while it was running', async () => {
    let resolveRefresh!: (value: boolean) => void
    let rejectSecondOperation!: (error: Error) => void
    const refreshPending = new Promise<boolean>(resolve => {
      resolveRefresh = resolve
    })
    const secondOperationPending = new Promise<string>((_resolve, reject) => {
      rejectSecondOperation = reject
    })
    state.refreshPlatform.mockImplementationOnce(async () => await refreshPending)

    const first = vi.fn()
      .mockRejectedValueOnce(new Error('微博详情接口要求登录'))
      .mockResolvedValueOnce('first-ok')
    const second = vi.fn()
      .mockImplementationOnce(async () => await secondOperationPending)
      .mockResolvedValueOnce('second-ok')

    const firstResult = retryWithGuestCookieRecovery('weibo', first)
    await vi.waitFor(() => {
      expect(state.refreshPlatform).toHaveBeenCalledTimes(1)
    })
    const secondResult = retryWithGuestCookieRecovery('weibo', second)

    resolveRefresh(true)
    await expect(firstResult).resolves.toBe('first-ok')
    rejectSecondOperation(new Error('微博详情接口要求登录'))

    await expect(secondResult).resolves.toBe('second-ok')
    expect(second).toHaveBeenCalledTimes(2)
    expect(state.refreshPlatform).toHaveBeenCalledTimes(1)
  })

  it('refreshes and retries suspicious xiaohongshu success results once', async () => {
    const emptyResult = {
      success: true,
      code: 0,
      message: 'ok',
      data: {
        data: {
          items: [{}]
        }
      }
    }
    const validResult = {
      success: true,
      code: 0,
      message: 'ok',
      data: {
        data: {
          items: [{ note_card: { title: '海风会让皮肤变得黏潮' } }]
        }
      }
    }
    const operation = vi.fn()
      .mockResolvedValueOnce(emptyResult)
      .mockResolvedValueOnce(validResult)

    await expect(retryWithGuestCookieRecovery('xiaohongshu', operation, {
      context: '获取小红书笔记详情',
      shouldRetryOnResult: (result) => !(result as typeof emptyResult).data.data.items?.[0]?.note_card
    })).resolves.toBe(validResult)

    expect(operation).toHaveBeenCalledTimes(2)
    expect(state.refreshPlatform).toHaveBeenCalledWith('xiaohongshu', 'ensure')
  })

  it('does not retry a second time when a suspicious-result retry throws', async () => {
    const retryError = new Error('微博详情接口要求登录')
    const operation = vi.fn()
      .mockResolvedValueOnce({ loggedIn: false })
      .mockRejectedValueOnce(retryError)

    await expect(retryWithGuestCookieRecovery('weibo', operation, {
      shouldRetryOnResult: result => !result.loggedIn
    })).rejects.toBe(retryError)

    expect(operation).toHaveBeenCalledTimes(2)
    expect(state.refreshPlatform).toHaveBeenCalledTimes(1)
  })
})
