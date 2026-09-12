type PushJitterLogger = {
  debug?: (message: string) => void
  info?: (message: string) => void
}

type WaitForPushJitterOptions = {
  label: string
  jitterSeconds: unknown
  logger?: PushJitterLogger
  random?: () => number
  sleep?: (delayMs: number) => Promise<void>
}

const MAX_PUSH_JITTER_SECONDS = 3600

const defaultSleep = async (delayMs: number): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, delayMs))
}

const toFiniteNumber = (value: unknown): number => {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim()) return Number(value)
  return 0
}

export const normalizePushJitterSeconds = (value: unknown): number => {
  const numeric = toFiniteNumber(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return Math.min(Math.floor(numeric), MAX_PUSH_JITTER_SECONDS)
}

export const getPushJitterDelayMs = (
  jitterSeconds: unknown,
  random: () => number = Math.random
): number => {
  const normalizedSeconds = normalizePushJitterSeconds(jitterSeconds)
  if (normalizedSeconds <= 0) return 0

  const ratio = Math.min(1, Math.max(0, random()))
  return Math.round(normalizedSeconds * 1000 * ratio)
}

export const waitForPushJitter = async (options: WaitForPushJitterOptions): Promise<number> => {
  const normalizedSeconds = normalizePushJitterSeconds(options.jitterSeconds)
  const delayMs = getPushJitterDelayMs(normalizedSeconds, options.random)
  if (delayMs <= 0) {
    options.logger?.debug?.(`[${options.label}] 定时推送随机延迟未启用`)
    return 0
  }

  options.logger?.info?.(`[${options.label}] 定时推送随机延迟 ${(delayMs / 1000).toFixed(1)} 秒（上限 ${normalizedSeconds} 秒）`)
  await (options.sleep ?? defaultSleep)(delayMs)
  return delayMs
}
