import { describe, expect, it, vi } from 'vitest'

import {
  getPushJitterDelayMs,
  normalizePushJitterSeconds,
  waitForPushJitter
} from '../src/module/utils/PushTaskJitter'

describe('push task jitter helper', () => {
  it('normalizes invalid jitter values to zero and clamps excessive values', () => {
    expect(normalizePushJitterSeconds(undefined)).toBe(0)
    expect(normalizePushJitterSeconds(null)).toBe(0)
    expect(normalizePushJitterSeconds(Number.NaN)).toBe(0)
    expect(normalizePushJitterSeconds(-10)).toBe(0)
    expect(normalizePushJitterSeconds('bad')).toBe(0)
    expect(normalizePushJitterSeconds('45')).toBe(45)
    expect(normalizePushJitterSeconds(12.8)).toBe(12)
    expect(normalizePushJitterSeconds(999999)).toBe(3600)
  })

  it('calculates a random delay within the configured jitter window', () => {
    expect(getPushJitterDelayMs(120, () => 0)).toBe(0)
    expect(getPushJitterDelayMs(120, () => 0.5)).toBe(60_000)
    expect(getPushJitterDelayMs(120, () => 1)).toBe(120_000)
  })

  it('skips sleeping when jitter is disabled', async () => {
    const sleep = vi.fn(async () => {})
    const logger = {
      debug: vi.fn(),
      info: vi.fn()
    }

    await expect(waitForPushJitter({
      label: 'DouYinPush',
      jitterSeconds: 0,
      sleep,
      logger
    })).resolves.toBe(0)

    expect(sleep).not.toHaveBeenCalled()
    expect(logger.info).not.toHaveBeenCalled()
  })

  it('waits the calculated delay and logs the jitter before running a task', async () => {
    const sleep = vi.fn(async () => {})
    const logger = {
      debug: vi.fn(),
      info: vi.fn()
    }

    await expect(waitForPushJitter({
      label: 'BilibiliPush',
      jitterSeconds: 120,
      random: () => 0.25,
      sleep,
      logger
    })).resolves.toBe(30_000)

    expect(sleep).toHaveBeenCalledWith(30_000)
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('随机延迟 30.0 秒'))
  })
})
