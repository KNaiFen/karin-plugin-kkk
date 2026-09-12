import { logger } from 'node-karin'

const BAR_LENGTH = 45
const HEARTBEAT_INTERVAL_MS = 1500
const ACTIVITY_BAR_WIDTH = 8

type SummaryCliProgressOptions = {
  icon: string
  label: string
  percent: number
  currentSeconds?: number
  totalSeconds?: number
  speedText?: string
  trailingText?: string
}

type SummaryCliActivityOptions = {
  icon: string
  label: string
  statusText: string
  trailingText?: string
  showActivityBar?: boolean
}

type SummaryCliActivityHandle = {
  stop: () => void
}

export type FfmpegProgressSnapshot = {
  outTimeSeconds?: number
  speedText?: string
  status?: string
  percent?: number
}

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

const formatProgressBar = (percent: number): string => {
  const clamped = clampPercent(percent)
  const filledLength = Math.floor((clamped / 100) * BAR_LENGTH)
  const emptyLength = Math.max(0, BAR_LENGTH - filledLength)
  return `[${'\u2588'.repeat(filledLength)}${'\u2591'.repeat(emptyLength)}]`
}

const formatActivityBar = (tick: number): string => {
  const cycleLength = BAR_LENGTH + ACTIVITY_BAR_WIDTH - 1
  const offset = ((tick % cycleLength) + cycleLength) % cycleLength
  const chars = Array.from({ length: BAR_LENGTH }, () => '\u2591')

  for (let index = 0; index < ACTIVITY_BAR_WIDTH; index++) {
    const position = offset - index
    if (position >= 0 && position < BAR_LENGTH) {
      chars[position] = '\u2588'
    }
  }

  return `[${chars.join('')}]`
}

const colorizePercent = (percent: number): string => {
  const clamped = clampPercent(percent)
  const red = Math.floor(255 - (255 * clamped) / 100)
  const chalk = (
    logger as unknown as {
      chalk?: {
        rgb?: (red: number, green: number, blue: number) => (value: string) => string
      }
    }
  ).chalk

  if (!chalk || typeof chalk.rgb !== 'function') {
    return `${clamped.toFixed(1)}%`
  }

  try {
    return chalk.rgb(red, 255, 0)(`${clamped.toFixed(1)}%`)
  } catch {
    return `${clamped.toFixed(1)}%`
  }
}

const formatDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s'

  const totalSeconds = Math.floor(seconds)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`
  }

  if (minutes > 0) {
    return `${minutes}min ${remainingSeconds}s`
  }

  return `${remainingSeconds}s`
}

const buildDurationProgressText = (
  currentSeconds: number | undefined,
  totalSeconds: number | undefined
): string | null => {
  if (currentSeconds === undefined || totalSeconds === undefined || totalSeconds <= 0) return null
  const current = Math.min(Math.max(currentSeconds, 0), totalSeconds)
  return `${formatDuration(current)}/${formatDuration(totalSeconds)}`
}

const writeConsoleProgress = (line: string): void => {
  console.log(`${line}\r`)
}

export const renderSummaryCliProgress = (options: SummaryCliProgressOptions): void => {
  try {
    const parts = [
      `${options.icon}  ${options.label}`,
      formatProgressBar(options.percent),
      colorizePercent(options.percent)
    ]

    const durationText = buildDurationProgressText(options.currentSeconds, options.totalSeconds)
    if (durationText) parts.push(durationText)
    if (options.speedText) parts.push(`| ${options.speedText}`)

    if (
      options.currentSeconds !== undefined &&
      options.totalSeconds !== undefined &&
      options.totalSeconds > 0 &&
      options.percent > 0 &&
      options.percent < 100
    ) {
      const elapsedSeconds = options.currentSeconds
      const remainingSeconds = Math.max(0, options.totalSeconds - elapsedSeconds)
      parts.push(`剩余: ${formatDuration(remainingSeconds)}`)
    }

    if (options.trailingText) parts.push(options.trailingText)

    writeConsoleProgress(parts.join(' '))
  } catch {
    writeConsoleProgress(`${options.icon}  ${options.label} ${clampPercent(options.percent).toFixed(1)}% ${options.trailingText ?? ''}`.trim())
  }
}

export const createSummaryCliActivity = (
  options: SummaryCliActivityOptions
): SummaryCliActivityHandle => {
  const startTime = Date.now()
  let tick = 0

  const render = () => {
    try {
      const elapsedMs = Date.now() - startTime
      const label = options.showActivityBar === false
        ? `${options.label}:`
        : options.label
      const parts = [
        `${options.icon}  ${label}`,
        options.statusText,
        `已耗时: ${formatDuration(elapsedMs / 1000)}`
      ]
      if (options.showActivityBar !== false) {
        parts.splice(1, 0, formatActivityBar(tick++))
      }
      if (options.trailingText) parts.push(options.trailingText)
      writeConsoleProgress(parts.join(' '))
    } catch {
      writeConsoleProgress(`${options.icon}  ${options.label} ${options.statusText}`.trim())
    }
  }

  const timer = setInterval(render, HEARTBEAT_INTERVAL_MS)
  timer.unref?.()

  return {
    stop: () => clearInterval(timer)
  }
}

const parseFfmpegTimestamp = (value: string): number | undefined => {
  const normalized = value.trim()
  if (!normalized) return undefined

  const match = normalized.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/)
  if (!match) return undefined

  return (
    Number(match[1]) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3])
  )
}

const parseFfmpegMicroseconds = (value: string): number | undefined => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return undefined
  return numeric / 1_000_000
}

export const extractProgressPercentFromText = (input: string): number | undefined => {
  const source = String(input ?? '')
  const patterns = [
    /progress[^0-9]{0,20}(\d{1,3}(?:\.\d+)?)\s*%/i,
    /(\d{1,3}(?:\.\d+)?)\s*%/
  ]

  for (const pattern of patterns) {
    const match = source.match(pattern)
    if (!match) continue
    const percent = Number(match[1])
    if (Number.isFinite(percent) && percent >= 0 && percent <= 100) {
      return percent
    }
  }

  return undefined
}

export const createFfmpegProgressParser = (
  totalSeconds: number | undefined,
  onSnapshot: (snapshot: FfmpegProgressSnapshot) => void
): {
    push: (chunk: string) => void
  } => {
  let buffer = ''
  let frame: FfmpegProgressSnapshot = {}

  const emitFrame = (status: string) => {
    const percent = totalSeconds && totalSeconds > 0 && frame.outTimeSeconds !== undefined
      ? clampPercent((frame.outTimeSeconds / totalSeconds) * 100)
      : undefined

    onSnapshot({
      ...frame,
      status,
      percent
    })
    frame = {}
  }

  const handleLine = (line: string) => {
    const normalized = line.trim()
    if (!normalized) return

    const separatorIndex = normalized.indexOf('=')
    if (separatorIndex < 0) return

    const key = normalized.slice(0, separatorIndex)
    const value = normalized.slice(separatorIndex + 1)

    switch (key) {
      case 'out_time':
        frame.outTimeSeconds = parseFfmpegTimestamp(value)
        break
      case 'out_time_ms':
      case 'out_time_us':
        if (frame.outTimeSeconds === undefined) {
          frame.outTimeSeconds = parseFfmpegMicroseconds(value)
        }
        break
      case 'speed':
        frame.speedText = value.trim()
        break
      case 'progress':
        emitFrame(value.trim())
        break
      default:
        break
    }
  }

  return {
    push: (chunk: string) => {
      buffer += chunk

      while (true) {
        const newlineIndex = buffer.indexOf('\n')
        if (newlineIndex < 0) break
        const line = buffer.slice(0, newlineIndex)
        buffer = buffer.slice(newlineIndex + 1)
        handleLine(line)
      }
    }
  }
}
