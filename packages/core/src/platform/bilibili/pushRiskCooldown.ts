import { db } from 'node-karin'

import { Config } from '@/module/utils/Config'

export const BILIBILI_PUSH_RISK_COOLDOWN_KEY = 'kkk:bilibili-push:risk-cooldown-until'

const normalizeCooldownUntil = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const numeric = Number(value)
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric
    }

    const parsed = Date.parse(value)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }

  return null
}

export const isBilibiliPushRiskCooldownEnabled = (): boolean => {
  return Config.bilibili.push.riskCooldownEnabled !== false
}

export const getBilibiliPushRiskCooldownMs = (): number => {
  const raw = Number(Config.bilibili.push.riskCooldownMs)
  if (!Number.isFinite(raw) || raw <= 0) return 3600000
  return raw
}

export const getBilibiliPushRiskCooldownUntil = async (): Promise<number | null> => {
  if (!isBilibiliPushRiskCooldownEnabled()) return null

  const value = await db.get(BILIBILI_PUSH_RISK_COOLDOWN_KEY)
  return normalizeCooldownUntil(value)
}

export const clearExpiredBilibiliPushRiskCooldown = async (now = Date.now()): Promise<number | null> => {
  const until = await getBilibiliPushRiskCooldownUntil()
  if (!until) return null

  if (until <= now) {
    await db.del(BILIBILI_PUSH_RISK_COOLDOWN_KEY)
    return null
  }

  return until
}

export const getBilibiliPushRiskCooldownState = async (now = Date.now()): Promise<{
  inCooldown: boolean
  until: number | null
  remainingMs: number
}> => {
  const until = await clearExpiredBilibiliPushRiskCooldown(now)
  if (!until) {
    return {
      inCooldown: false,
      until: null,
      remainingMs: 0
    }
  }

  return {
    inCooldown: true,
    until,
    remainingMs: Math.max(0, until - now)
  }
}

export const setBilibiliPushRiskCooldown = async (
  cooldownMs = getBilibiliPushRiskCooldownMs(),
  now = Date.now()
): Promise<number> => {
  const until = now + Math.max(1000, cooldownMs)
  await db.set(BILIBILI_PUSH_RISK_COOLDOWN_KEY, until)
  return until
}

export const formatBilibiliPushRiskCooldownRemaining = (remainingMs: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}小时${minutes}分${seconds}秒`
  }

  if (minutes > 0) {
    return `${minutes}分${seconds}秒`
  }

  return `${seconds}秒`
}
