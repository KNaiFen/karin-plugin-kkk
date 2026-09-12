import { logger, type Message } from 'node-karin'

import type {
  SummaryInput,
  SummaryLinkProgressContext,
  SummaryResolvedLink,
  SummaryTaskProgressContext
} from './types'

type SummaryProgressScope = 'task' | 'link' | 'asr' | 'llm'

type SummaryStageLogLevel = 'debug' | 'info' | 'warn'

type SummaryProgressEvent = {
  scope: SummaryProgressScope
  stage: string
  level?: SummaryStageLogLevel
  taskId: string
  totalLinks?: number
  linkIndex?: number
  platform?: string
  title?: string
  provider?: 'subtitle' | 'cloud' | 'local'
  attempt?: number
  totalAttempts?: number
  segmentIndex?: number
  totalSegments?: number
  elapsedMs?: number
  details?: string
}

type SummaryProgressTaskOptions = {
  businessName?: string
  businessPrefix?: string
}

const summaryProgressTimers = new Map<string, number>()
const summaryTaskLogPrefixes = new Map<string, string>()
const summaryPlatformLabels: Record<string, string> = {
  bilibili: 'B站',
  douyin: '抖音',
  tiktok: 'TikTok',
  kuaishou: '快手',
  xiaohongshu: '小红书',
  heybox: '小黑盒',
  x: 'X',
  zhihu: '知乎',
  tieba: '贴吧',
  wechat: '微信公众号',
  weibo: '微博'
}
const SUMMARY_PARSE_BUSINESS_NAME = '解析总结'

type SummaryProgressMessageEvent = Pick<Message, 'bot' | 'isGroup' | 'contact' | 'userId' | 'sender'>

const summarizeTitle = (title?: string): string | undefined => {
  const normalized = String(title ?? '').trim()
  if (!normalized) return undefined
  return normalized.length > 40 ? `${normalized.slice(0, 37)}...` : normalized
}

const normalizeTagValue = (value: unknown): string => {
  return String(value ?? '').trim()
}

const normalizePlatformLabel = (value?: string): string | undefined => {
  const normalized = normalizeTagValue(value)
  if (!normalized) return undefined
  return summaryPlatformLabels[normalized] ?? normalized
}

const buildSummaryAudienceTag = (event?: SummaryProgressMessageEvent): string => {
  if (!event) return ''

  const sender = event.sender as unknown as Record<string, unknown> | undefined
  const senderId = normalizeTagValue(event.userId ?? sender?.userId)
  const senderNick = normalizeTagValue(
    sender?.card ??
      sender?.nick ??
      sender?.nickname ??
      sender?.name
  )

  if (event.isGroup) {
    const groupId = normalizeTagValue(event.contact?.peer)
    if (!groupId) return ''
    return `[group:${groupId}${senderId ? `-${senderId}` : ''}${senderNick ? `(${senderNick})` : ''}]`
  }

  if (senderId) {
    return `[private:${senderId}${senderNick ? `(${senderNick})` : ''}]`
  }

  return ''
}

const buildSummaryBusinessPrefix = (businessName?: string): string => {
  const normalizedBusinessName = normalizeTagValue(businessName) || SUMMARY_PARSE_BUSINESS_NAME
  return `[karin-plugin-kkk][kkk-视频功能-${normalizedBusinessName}]`
}

const buildSummaryTaskLogPrefix = (
  event?: SummaryProgressMessageEvent,
  options?: SummaryProgressTaskOptions
): string => {
  const botId = normalizeTagValue(event?.bot?.account?.selfId)
  const audienceTag = buildSummaryAudienceTag(event)
  const businessPrefix = normalizeTagValue(options?.businessPrefix) || buildSummaryBusinessPrefix(options?.businessName)

  return [
    botId ? `[Bot:${botId}]` : '',
    `${businessPrefix}${audienceTag}`
  ].filter(Boolean).join(' ')
}

const getSummaryTaskLogPrefix = (taskId?: string): string => {
  if (taskId) return summaryTaskLogPrefixes.get(taskId) ?? buildSummaryBusinessPrefix()
  return buildSummaryBusinessPrefix()
}

const buildTimerKey = (
  taskId: string,
  scope: SummaryProgressScope,
  stage: string,
  linkIndex?: number,
  segmentIndex?: number
): string => {
  return [taskId, scope, stage, linkIndex ?? '-', segmentIndex ?? '-'].join(':')
}

const buildSummaryStandaloneLine = (
  message: string,
  taskId?: string,
  businessName?: string
): string => {
  const prefix = taskId ? getSummaryTaskLogPrefix(taskId) : buildSummaryBusinessPrefix(businessName)
  return taskId
    ? `${prefix}[task=${taskId}] ${message}`
    : `${prefix} ${message}`
}

const renderProgressLine = (event: SummaryProgressEvent): string => {
  const parts = [`${getSummaryTaskLogPrefix(event.taskId)}[task=${event.taskId}]`]

  if (event.linkIndex !== undefined && event.totalLinks !== undefined) {
    parts.push(`[${event.linkIndex}/${event.totalLinks}]`)
  }
  if (event.platform) parts.push(`[${normalizePlatformLabel(event.platform)}]`)
  if (event.title) parts.push(`[${summarizeTitle(event.title)}]`)
  if (event.provider) parts.push(`[provider=${event.provider}]`)
  if (event.attempt !== undefined && event.totalAttempts !== undefined) {
    parts.push(`[attempt=${event.attempt}/${event.totalAttempts}]`)
  }
  if (event.segmentIndex !== undefined && event.totalSegments !== undefined) {
    parts.push(`[segment=${event.segmentIndex}/${event.totalSegments}]`)
  }

  parts.push(event.stage)

  if (event.elapsedMs !== undefined) {
    parts.push(`(${event.elapsedMs}ms)`)
  }
  if (event.details) {
    parts.push(`- ${event.details}`)
  }

  return parts.join(' ')
}

const writeProgressLog = (event: SummaryProgressEvent): void => {
  const line = renderProgressLine(event)
  switch (event.level ?? 'info') {
    case 'debug':
      logger.debug(line)
      return
    case 'warn':
      logger.warn(line)
      return
    default:
      logger.mark(line)
  }
}

export const logSummaryMessage = (
  message: string,
  options?: {
    taskId?: string
    level?: 'debug' | 'info' | 'warn'
    businessName?: string
    businessPrefix?: string
  }
): void => {
  const line = buildSummaryStandaloneLine(message, options?.taskId, options?.businessName)
  switch (options?.level ?? 'info') {
    case 'debug':
      logger.debug(line)
      return
    case 'warn':
      logger.warn(line)
      return
    default:
      logger.mark(line)
  }
}

export const createSummaryTaskProgress = (
  totalLinks: number,
  event?: SummaryProgressMessageEvent,
  options?: SummaryProgressTaskOptions
): SummaryTaskProgressContext => {
  const taskId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  summaryTaskLogPrefixes.set(taskId, buildSummaryTaskLogPrefix(event, options))
  return {
    taskId,
    totalLinks
  }
}

export const cleanupSummaryTaskProgress = (taskId: string): void => {
  summaryTaskLogPrefixes.delete(taskId)

  const timerKeyPrefix = `${taskId}:`
  for (const key of summaryProgressTimers.keys()) {
    if (key.startsWith(timerKeyPrefix)) {
      summaryProgressTimers.delete(key)
    }
  }
}

export const buildSummaryLinkProgressContext = (
  task: SummaryTaskProgressContext,
  link: SummaryResolvedLink,
  linkIndex: number,
  title?: string
): SummaryLinkProgressContext => {
  return {
    ...task,
    linkIndex,
    platform: link.platform,
    title
  }
}

export const buildSummaryInputProgressContext = (
  task: SummaryTaskProgressContext,
  input: SummaryInput,
  linkIndex: number
): SummaryLinkProgressContext => {
  return {
    ...task,
    linkIndex,
    platform: input.platformLabel || input.platform,
    title: input.title
  }
}

export const logSummaryProgress = (
  event: SummaryProgressEvent
): void => {
  writeProgressLog(event)
}

export const startSummaryProgressTimer = (
  event: Omit<SummaryProgressEvent, 'elapsedMs'>,
  segmentIndex?: number
): void => {
  summaryProgressTimers.set(
    buildTimerKey(event.taskId, event.scope, event.stage, event.linkIndex, segmentIndex),
    Date.now()
  )
  writeProgressLog(event)
}

export const endSummaryProgressTimer = (
  event: Omit<SummaryProgressEvent, 'elapsedMs'>,
  segmentIndex?: number
): void => {
  const key = buildTimerKey(event.taskId, event.scope, event.stage, event.linkIndex, segmentIndex)
  const startedAt = summaryProgressTimers.get(key)
  if (startedAt !== undefined) {
    summaryProgressTimers.delete(key)
  }
  writeProgressLog({
    ...event,
    elapsedMs: startedAt !== undefined ? Math.max(0, Date.now() - startedAt) : undefined
  })
}
