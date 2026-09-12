import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { format } from 'date-fns'
import { logger as karinLogger, mkdirSync } from 'node-karin'
import { karinPathBase } from 'node-karin/root'

import { Root } from '@/root'

export type FailureTraceMessageSummary = {
  kind: 'url' | 'text'
  length: number
  sha256: string
  url?: {
    protocol: string
    host: string
    pathTemplate: string
  }
}

export type FailureTraceEventInput = {
  message?: unknown
  time?: unknown
  userId?: unknown
  groupId?: unknown
  selfId?: unknown
  isGroup?: unknown
}

export type FailureTraceEventSummary = {
  message?: FailureTraceMessageSummary
  time?: number
  userId?: string
  groupId?: string
  selfId?: string
  isGroup?: boolean
}

export type FailureTraceMeta = {
  businessName: string
  event?: FailureTraceEventInput
}

export type FailureTraceEntry = {
  time: string
  step: string
  detail?: unknown
}

export type FailureTraceOutcome = 'failed' | 'recovered'

type FailureTraceContext = {
  traceId: string
  traceTime: number
  startedAt: string
  meta: {
    businessName: string
    event?: FailureTraceEventSummary
  }
  entries: FailureTraceEntry[]
}

type PersistFailureTraceOptions = {
  error: unknown
  outputDir?: string
  rawLogs?: string[]
  structuredLogs?: unknown
  buildMetadata?: unknown
  extra?: Record<string, unknown>
  outcome?: FailureTraceOutcome
  now?: () => Date
  retentionDays?: number
  maxIndexFileSizeBytes?: number
}

type PersistedFailureTrace = {
  traceId: string
  businessName: string
  outcome: FailureTraceOutcome
  startedAt: string
  finishedAt: string
  event?: FailureTraceEventSummary
  entries: FailureTraceEntry[]
  error: {
    name: string
    message: string
    stack?: string
    cause?: unknown
  }
  rawLogs: string[]
  structuredLogs?: unknown
  buildMetadata?: unknown
  extra?: Record<string, unknown>
}

const traceStorage = new AsyncLocalStorage<FailureTraceContext>()
const MAX_STRING_LENGTH = 4000
const MAX_ARRAY_LENGTH = 40
const MAX_OBJECT_KEYS = 40
const MAX_DEPTH = 5
const ERROR_TRACE_RETENTION_DAYS = 30
const ERROR_TRACE_INDEX_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
const ERROR_TRACE_INDEX_DIRECTORY = 'diagnostics'
const DAY_MS = 24 * 60 * 60 * 1000
const SENSITIVE_QUERY_PARAM_PATTERN = /([?&#](?:[a-z0-9_-]*(?:token|authorization|cookie|password|secret|credential|signature)|upsig|api[_-]?key|verify[_-]?fp|fp|uifid|a[_-]?bogus|x[_-]?bogus|web[_-]?id|device[_-]?id|did|iid)=)(?:"[^"]*"|'[^']*'|[^&#\s'",;)\]}]*)/gi
const SENSITIVE_INLINE_VALUE_PATTERN = /(["']?(?:[a-z0-9_-]*(?:token|authorization|cookie|password|secret|credential|signature)|api[_-]?key|verify[_-]?fp|web[_-]?session|x[_-]?bogus|a[_-]?bogus)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^,;\s}\]&\)]+)/gi
const SENSITIVE_BEARER_PATTERN = /\b(Bearer\s+)[^\s,;]+/gi
const SENSITIVE_COOKIE_HEADER_PATTERN = /\b((?:set-)?cookie\s*:\s*)[^\r\n]*/gi
const SENSITIVE_COOKIE_PAIR_PATTERN = /\b((?:ttwid|msToken|web_session|a1|webId|SUB|SUBP|d_c0|_zap|x_xhh_tokenid)=)[^;&\s,]+/gi
const traceCleanupDateByDirectory = new Map<string, string>()

export const formatFailureTraceTime = (date: Date): string => {
  return format(date, 'yyyy-MM-dd\'T\'HH:mm:ss.SSSxxx')
}

export const resolveFailureTraceEventTime = (value: unknown): Date | undefined => {
  const timestamp = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN

  if (!Number.isFinite(timestamp) || timestamp <= 0) return undefined

  const milliseconds = timestamp < 100_000_000_000
    ? timestamp * 1000
    : timestamp
  const date = new Date(milliseconds)

  return Number.isNaN(date.getTime()) ? undefined : date
}

const formatFailureTraceFileTime = (date: Date): string => {
  return formatFailureTraceTime(date).replace(/:/g, '-')
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return Object.prototype.toString.call(value) === '[object Object]'
}

const sanitizeFileName = (value: string): string => {
  const normalized = value
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .trim()

  return normalized || 'error-trace'
}

const sanitizeString = (value: string): string => {
  const normalized = value
    .replace(/\r\n/g, '\n')
    .replace(SENSITIVE_QUERY_PARAM_PATTERN, '$1<redacted>')
    .replace(SENSITIVE_COOKIE_HEADER_PATTERN, '$1<redacted>')
    .replace(SENSITIVE_BEARER_PATTERN, '$1<redacted>')
    .replace(SENSITIVE_INLINE_VALUE_PATTERN, '$1<redacted>')
    .replace(SENSITIVE_COOKIE_PAIR_PATTERN, '$1<redacted>')
  return normalized.length > MAX_STRING_LENGTH
    ? `${normalized.slice(0, MAX_STRING_LENGTH)}...`
    : normalized
}

const hashText = (value: string): string => {
  return createHash('sha256').update(value).digest('hex')
}

const buildStablePseudonym = (kind: 'user' | 'group' | 'bot', value: unknown): string | undefined => {
  const normalized = String(value ?? '').trim()
  if (!normalized) return undefined
  return `${kind}_${hashText(normalized).slice(0, 16)}`
}

const buildUrlPathTemplate = (pathname: string): string => {
  const segments = pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      return segment.length > 8 || /\d{4,}/.test(segment) ? ':id' : segment
    })
  return segments.length > 0 ? `/${segments.join('/')}` : '/'
}

export const sanitizeFailureTraceText = (value: unknown): string => {
  return sanitizeString(String(value ?? ''))
}

export const summarizeFailureTraceMessage = (value: unknown): FailureTraceMessageSummary | undefined => {
  if (value === undefined || value === null) return undefined
  const normalized = String(value).replace(/\r\n/g, '\n').trim()
  if (!normalized) return undefined

  const summary: FailureTraceMessageSummary = {
    kind: 'text',
    length: normalized.length,
    sha256: hashText(normalized)
  }
  const urlMatch = normalized.match(/https?:\/\/[^\s"'<>]+/i)?.[0]
  if (!urlMatch) return summary

  try {
    const url = new URL(urlMatch)
    return {
      ...summary,
      kind: 'url',
      url: {
        protocol: url.protocol.replace(/:$/, ''),
        host: url.host,
        pathTemplate: buildUrlPathTemplate(url.pathname)
      }
    }
  } catch {
    return summary
  }
}

const sanitizeFailureTraceEvent = (event: FailureTraceEventInput): FailureTraceEventSummary => {
  const numericTime = Number(event.time)
  return {
    message: summarizeFailureTraceMessage(event.message),
    time: Number.isFinite(numericTime) && numericTime > 0 ? numericTime : undefined,
    userId: buildStablePseudonym('user', event.userId),
    groupId: buildStablePseudonym('group', event.groupId),
    selfId: buildStablePseudonym('bot', event.selfId),
    isGroup: typeof event.isGroup === 'boolean' ? event.isGroup : undefined
  }
}

const shouldRedactKey = (keyPath: string[]): boolean => {
  return keyPath.some((segment) => {
    const normalized = segment.toLowerCase().replace(/[-_]/g, '')
    return normalized.includes('cookie') ||
      normalized.includes('authorization') ||
      normalized.includes('token') ||
      normalized.includes('password') ||
      normalized.includes('secret') ||
      normalized.includes('apikey') ||
      normalized.includes('credential')
  })
}

const getIdentifierPseudonymKind = (keyPath: string[]): 'user' | 'group' | 'bot' | undefined => {
  const normalized = String(keyPath.at(-1) ?? '').toLowerCase().replace(/[-_]/g, '')
  if (['userid', 'senderid', 'contactid', 'peerid', 'uin', 'qq'].includes(normalized)) return 'user'
  if (['groupid', 'groupuin'].includes(normalized)) return 'group'
  if (['selfid', 'botid', 'accountid'].includes(normalized)) return 'bot'
  return undefined
}

const sanitizeIdentifier = (kind: 'user' | 'group' | 'bot', value: unknown): string | undefined => {
  const normalized = String(value ?? '').trim()
  if (!normalized) return undefined
  if (new RegExp(`^${kind}_[a-f0-9]{16}$`).test(normalized)) return normalized
  return buildStablePseudonym(kind, normalized)
}

const sanitizeUnknown = (
  value: unknown,
  keyPath: string[] = [],
  depth = 0,
  seen = new WeakSet<object>()
): unknown => {
  if (value === null || value === undefined) return value
  if (shouldRedactKey(keyPath)) return '<redacted>'
  const identifierKind = getIdentifierPseudonymKind(keyPath)
  if (identifierKind) return sanitizeIdentifier(identifierKind, value)
  if (typeof value === 'string') return sanitizeString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'symbol') return String(value)
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`
  if (typeof value === 'object' && seen.has(value as object)) return '[Circular]'
  if (depth >= MAX_DEPTH) {
    if (Array.isArray(value)) return `[Array(${value.length})]`
    if (typeof value === 'object') return '[Object]'
  }
  if (typeof value === 'object') seen.add(value as object)
  if (value instanceof Error) {
    const cause = (value as Error & { cause?: unknown }).cause
    return {
      name: value.name,
      message: sanitizeString(value.message),
      stack: value.stack ? sanitizeString(value.stack) : undefined,
      cause: cause === undefined
        ? undefined
        : sanitizeUnknown(cause, [...keyPath, 'cause'], depth + 1, seen)
    }
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item, index) => sanitizeUnknown(item, [...keyPath, String(index)], depth + 1, seen))
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
      result[key] = sanitizeUnknown(item, [...keyPath, key], depth + 1, seen)
    }
    return result
  }

  return sanitizeString(String(value))
}

export const sanitizeFailureTraceValue = (value: unknown): unknown => {
  return sanitizeUnknown(value)
}

const sanitizeError = (error: unknown) => {
  if (error instanceof Error) {
    return sanitizeUnknown(error, ['error']) as PersistedFailureTrace['error']
  }

  return {
    name: 'Error',
    message: sanitizeString(String(error))
  }
}

const formatTraceId = (now: Date): string => {
  return `${formatFailureTraceFileTime(now)}-${randomUUID()}`
}

export const createFailureTraceId = (now: Date = new Date()): string => {
  return formatTraceId(now)
}

const defaultErrorTraceDir = (): string => {
  return path.join(karinPathBase, Root.pluginName, 'data', 'error-traces')
}

const toDateKey = (date: Date): string => format(date, 'yyyy-MM-dd')

const parseDateKeyFromFilename = (filename: string): string | undefined => {
  return filename.match(/^(\d{4}-\d{2}-\d{2})/)?.[1]
}

const normalizeRetentionDays = (value: unknown): number => {
  const days = Number(value)
  if (!Number.isFinite(days)) return ERROR_TRACE_RETENTION_DAYS
  return Math.max(1, Math.floor(days))
}

const normalizeIndexFileSize = (value: unknown): number => {
  const size = Number(value)
  if (!Number.isFinite(size)) return ERROR_TRACE_INDEX_MAX_FILE_SIZE_BYTES
  return Math.max(1, Math.floor(size))
}

const removeExpiredTraceFiles = (directory: string, cutoff: number): void => {
  for (const filename of fs.readdirSync(directory)) {
    const filePath = path.join(directory, filename)
    if (fs.statSync(filePath).isDirectory()) continue

    const dateKey = parseDateKeyFromFilename(filename)
    if (!dateKey) continue
    const timestamp = new Date(`${dateKey}T00:00:00.000Z`).getTime()
    if (Number.isFinite(timestamp) && timestamp < cutoff) {
      fs.rmSync(filePath, { force: true })
    }
  }
}

const cleanupExpiredFailureTraceLogs = (
  outputDir: string,
  now: Date,
  retentionDays: number
): void => {
  const dateKey = toDateKey(now)
  const cleanupKey = `${outputDir}:${retentionDays}`
  if (traceCleanupDateByDirectory.get(cleanupKey) === dateKey) return

  const cutoff = now.getTime() - retentionDays * DAY_MS
  removeExpiredTraceFiles(outputDir, cutoff)
  const indexDirectory = path.join(outputDir, ERROR_TRACE_INDEX_DIRECTORY)
  if (fs.existsSync(indexDirectory)) {
    removeExpiredTraceFiles(indexDirectory, cutoff)
  }
  traceCleanupDateByDirectory.set(cleanupKey, dateKey)
}

const resolveFailureTraceIndexPath = (
  outputDir: string,
  dateKey: string,
  maxFileSizeBytes: number
): string => {
  const indexDirectory = path.join(outputDir, ERROR_TRACE_INDEX_DIRECTORY)
  fs.mkdirSync(indexDirectory, { recursive: true })

  let index = 0
  while (true) {
    const filename = index === 0
      ? `${dateKey}.jsonl`
      : `${dateKey}.${index}.jsonl`
    const filePath = path.join(indexDirectory, filename)
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size < maxFileSizeBytes) {
      return filePath
    }
    index++
  }
}

const appendFailureTraceIndex = (
  outputDir: string,
  payload: PersistedFailureTrace,
  filePath: string,
  now: Date,
  maxFileSizeBytes: number
): void => {
  const startedAt = new Date(payload.startedAt).getTime()
  const record = {
    time: formatFailureTraceTime(now),
    traceId: payload.traceId,
    businessName: payload.businessName,
    outcome: payload.outcome,
    durationMs: Number.isFinite(startedAt) ? Math.max(0, now.getTime() - startedAt) : undefined,
    error: payload.error,
    event: payload.event,
    entryCount: payload.entries.length,
    lastStep: payload.entries.at(-1)?.step,
    traceFile: path.basename(filePath)
  }
  fs.appendFileSync(
    resolveFailureTraceIndexPath(outputDir, toDateKey(now), maxFileSizeBytes),
    `${JSON.stringify(record)}\n`,
    'utf8'
  )
}

const buildConsoleLine = (entry: FailureTraceEntry): string => {
  const detail = entry.detail === undefined
    ? ''
    : ` ${JSON.stringify(entry.detail, null, 0)}`
  return `${entry.time} ${entry.step}${detail}`
}

export const runWithFailureTraceContext = async <T> (
  meta: FailureTraceMeta,
  fn: () => Promise<T> | T
): Promise<T> => {
  const now = new Date()
  const traceTime = resolveFailureTraceEventTime(meta.event?.time) ?? now
  const context: FailureTraceContext = {
    traceId: formatTraceId(traceTime),
    traceTime: traceTime.getTime(),
    startedAt: formatFailureTraceTime(traceTime),
    meta: {
      businessName: meta.businessName,
      event: meta.event
        ? sanitizeFailureTraceEvent(meta.event)
        : undefined
    },
    entries: []
  }

  return await traceStorage.run(context, async () => await fn())
}

export const recordFailureTraceStep = (step: string, detail?: unknown): void => {
  const context = traceStorage.getStore()
  if (!context) return

  context.entries.push({
    time: formatFailureTraceTime(new Date()),
    step,
    detail: detail === undefined ? undefined : sanitizeUnknown(detail)
  })
}

export const getFailureTraceSnapshot = (): FailureTraceContext | undefined => {
  const context = traceStorage.getStore()
  if (!context) return undefined

  return {
    traceId: context.traceId,
    traceTime: context.traceTime,
    startedAt: context.startedAt,
    meta: sanitizeUnknown(context.meta) as FailureTraceContext['meta'],
    entries: context.entries.map(entry => ({
      time: entry.time,
      step: entry.step,
      detail: sanitizeUnknown(entry.detail)
    }))
  }
}

export const getFailureTraceId = (): string | undefined => {
  return traceStorage.getStore()?.traceId
}

export const persistFailureTrace = (options: PersistFailureTraceOptions): string | undefined => {
  const snapshot = getFailureTraceSnapshot()
  const now = options.now?.() ?? new Date()
  const traceTime = snapshot?.traceTime
    ? new Date(snapshot.traceTime)
    : now
  const errorInfo = sanitizeError(options.error)
  const businessName = snapshot?.meta.businessName ?? '未知业务'
  const outcome = options.outcome ?? 'failed'
  const payload: PersistedFailureTrace = {
    traceId: snapshot?.traceId ?? formatTraceId(traceTime),
    businessName,
    outcome,
    startedAt: snapshot?.startedAt ?? formatFailureTraceTime(traceTime),
    finishedAt: formatFailureTraceTime(now),
    event: snapshot?.meta.event,
    entries: snapshot?.entries ?? [],
    error: errorInfo,
    rawLogs: (options.rawLogs ?? []).map(log => sanitizeString(log)),
    structuredLogs: sanitizeUnknown(options.structuredLogs),
    buildMetadata: sanitizeUnknown(options.buildMetadata),
    extra: sanitizeUnknown(options.extra) as Record<string, unknown> | undefined
  }

  try {
    const outputDir = options.outputDir ?? defaultErrorTraceDir()
    mkdirSync(outputDir)
    const retentionDays = normalizeRetentionDays(options.retentionDays)
    const maxIndexFileSizeBytes = normalizeIndexFileSize(options.maxIndexFileSizeBytes)
    try {
      cleanupExpiredFailureTraceLogs(outputDir, now, retentionDays)
    } catch (error) {
      karinLogger.warn(`[ErrorTrace] 清理过期日志失败: ${error instanceof Error ? error.message : String(error)}`)
    }

    const filename = `${formatFailureTraceFileTime(traceTime)}_${sanitizeFileName(businessName)}_${payload.traceId}.json`
    const filePath = path.join(outputDir, filename)

    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    try {
      appendFailureTraceIndex(outputDir, payload, filePath, now, maxIndexFileSizeBytes)
    } catch (error) {
      karinLogger.warn(`[ErrorTrace] 写入诊断索引失败: ${error instanceof Error ? error.message : String(error)}`)
    }

    const summary = outcome === 'recovered'
      ? `${businessName} 主链失败但已恢复，traceId=${payload.traceId}`
      : `${businessName} 失败，traceId=${payload.traceId}`
    const writeLine = outcome === 'recovered'
      ? `恢复链路日志已写入: ${filePath}`
      : `全量链路日志已写入: ${filePath}`
    const writeLog = (line: string) => {
      if (outcome === 'recovered') {
        karinLogger.warn(line)
        return
      }
      karinLogger.error(line)
    }

    writeLog(`[ErrorTrace] ${summary}`)
    for (const entry of payload.entries) {
      writeLog(`[ErrorTrace] ${buildConsoleLine(entry)}`)
    }
    writeLog(`[ErrorTrace] ${writeLine}`)

    return filePath
  } catch (error) {
    karinLogger.warn(`[ErrorTrace] 写入错误链路日志失败: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}
