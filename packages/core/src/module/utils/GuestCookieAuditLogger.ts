import fs from 'node:fs'
import path from 'node:path'

import { logger as karinLogger, mkdirSync } from 'node-karin'

export type GuestCookieAuditLevel = 'debug' | 'info' | 'warn' | 'error'
export type GuestCookieAuditPlatform = 'douyin' | 'xiaohongshu' | 'tiktok' | 'heybox' | 'zhihu' | 'weibo'
export type GuestCookieAuditSource = 'browser' | 'http'

export type GuestCookieSummary = {
  names: string[]
  count: number
  length: number
  missingRequired: string[]
}

export type GuestCookieAuditEvent = {
  level: GuestCookieAuditLevel
  event: string
  platform?: GuestCookieAuditPlatform
  reason?: string
  source?: GuestCookieAuditSource
  durationMs?: number
  status?: number
  cookieSummary?: GuestCookieSummary
  error?: {
    name: string
    message: string
  }
}

export type GuestCookieAuditLoggerOptions = {
  enabled: boolean
  directory: string
  retentionDays: number
  maxFileSizeBytes: number
  now?: () => Date
}

type PersistedGuestCookieAuditEvent = GuestCookieAuditEvent & {
  time: string
}

const DAY_MS = 24 * 60 * 60 * 1000
const MIN_LOG_FILE_SIZE_BYTES = 1
const COOKIE_PAIR_PATTERN = /([A-Za-z0-9_%.-]+)=([^;\s]+)/g

const toDateKey = (date: Date) => date.toISOString().slice(0, 10)

const parseDateKeyFromFile = (file: string): string | undefined => {
  const match = file.match(/^(\d{4}-\d{2}-\d{2})(?:\.\d+)?\.jsonl$/)
  return match?.[1]
}

const sanitizeText = (value: unknown, maxLength: number): string => {
  const text = String(value ?? '')
    .replace(COOKIE_PAIR_PATTERN, '$1=<redacted>')
    .replace(/[\r\n]+/g, ' ')
    .trim()

  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

export const summarizeCookieHeader = (
  cookie: string | undefined | null,
  requiredCookies: string[] = []
): GuestCookieSummary => {
  const source = cookie?.trim() ?? ''
  const names = source
    .split(';')
    .map(item => item.trim().split('=')[0]?.trim() ?? '')
    .filter(Boolean)

  const uniqueNames = [...new Set(names)]
  const cookieNameSet = new Set(uniqueNames)

  return {
    names: uniqueNames,
    count: uniqueNames.length,
    length: source.length,
    missingRequired: requiredCookies.filter(name => !cookieNameSet.has(name))
  }
}

export class GuestCookieAuditLogger {
  private readonly options: Required<GuestCookieAuditLoggerOptions>
  private lastCleanupDateKey: string | undefined

  constructor (options: GuestCookieAuditLoggerOptions) {
    this.options = {
      now: () => new Date(),
      ...options,
      retentionDays: Math.max(1, Math.floor(options.retentionDays)),
      maxFileSizeBytes: Math.max(MIN_LOG_FILE_SIZE_BYTES, Math.floor(options.maxFileSizeBytes))
    }
  }

  record (event: GuestCookieAuditEvent): void {
    if (!this.options.enabled) return

    try {
      mkdirSync(this.options.directory)
      const now = this.options.now()
      const dateKey = toDateKey(now)
      if (this.lastCleanupDateKey !== dateKey) {
        this.cleanupExpiredLogs()
        this.lastCleanupDateKey = dateKey
      }

      const persisted: PersistedGuestCookieAuditEvent = {
        time: now.toISOString(),
        ...this.sanitizeEvent(event)
      }
      fs.appendFileSync(this.resolveLogFilePath(dateKey), `${JSON.stringify(persisted)}\n`, 'utf8')
    } catch (error) {
      karinLogger.warn(`[GuestCookie] 写入持久化日志失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private sanitizeEvent (event: GuestCookieAuditEvent): GuestCookieAuditEvent {
    return {
      ...event,
      reason: event.reason ? sanitizeText(event.reason, 80) : undefined,
      error: event.error
        ? {
            name: sanitizeText(event.error.name, 120),
            message: sanitizeText(event.error.message, 500)
          }
        : undefined
    }
  }

  private resolveLogFilePath (dateKey: string): string {
    let index = 0

    while (true) {
      const filename = index === 0 ? `${dateKey}.jsonl` : `${dateKey}.${index}.jsonl`
      const filePath = path.join(this.options.directory, filename)

      if (!fs.existsSync(filePath)) return filePath
      if (fs.statSync(filePath).size < this.options.maxFileSizeBytes) return filePath

      index++
    }
  }

  private cleanupExpiredLogs (): void {
    const cutoff = this.options.now().getTime() - this.options.retentionDays * DAY_MS

    for (const file of fs.readdirSync(this.options.directory)) {
      const dateKey = parseDateKeyFromFile(file)
      if (!dateKey) continue

      const timestamp = new Date(`${dateKey}T00:00:00.000Z`).getTime()
      if (Number.isFinite(timestamp) && timestamp < cutoff) {
        fs.rmSync(path.join(this.options.directory, file), { force: true })
      }
    }
  }
}
