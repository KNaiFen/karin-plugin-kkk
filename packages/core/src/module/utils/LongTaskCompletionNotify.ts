import { type ElementTypes, type Message, segment } from 'node-karin'

import { Config } from './Config'

type LongTaskCompletionNotifyEvent = Pick<Message, 'reply' | 'isGroup' | 'contact' | 'userId' | 'sender'>

type LongTaskCompletionNotifyState = {
  businessName: string
  startedAt: number
  anchorMessageId?: string
  failed: boolean
  notified: boolean
}

type MessageResultLike =
  | string
  | { messageId?: unknown, message_id?: unknown }
  | null
  | undefined

const longTaskCompletionNotifyStates = new WeakMap<object, LongTaskCompletionNotifyState>()
const DEFAULT_LONG_TASK_NOTIFY_THRESHOLD_MS = 300000

const getLongTaskCompletionNotifyState = (
  event: LongTaskCompletionNotifyEvent
): LongTaskCompletionNotifyState | undefined => {
  if (!event || typeof event !== 'object') return undefined
  return longTaskCompletionNotifyStates.get(event as object)
}

const resolveLongTaskThresholdMs = (): number => {
  const value = Number(Config.app.longTaskCompletionNotifyThresholdMs)
  if (!Number.isFinite(value) || value < 0) {
    return DEFAULT_LONG_TASK_NOTIFY_THRESHOLD_MS
  }
  return value
}

const resolveTriggerUserId = (event: LongTaskCompletionNotifyEvent): string => {
  const sender = event.sender as unknown as Record<string, unknown> | undefined
  return String(event.userId ?? sender?.userId ?? '').trim()
}

export const normalizeLongTaskCompletionMessageId = (
  result: MessageResultLike
): string => {
  if (typeof result === 'string') {
    return result.trim()
  }

  if (!result || typeof result !== 'object') {
    return ''
  }

  const candidate = String(result.messageId ?? result.message_id ?? '').trim()
  return candidate
}

export const initLongTaskCompletionNotify = (
  event: LongTaskCompletionNotifyEvent,
  businessName: string
): void => {
  if (!event || typeof event !== 'object') return

  longTaskCompletionNotifyStates.set(event as object, {
    businessName: String(businessName ?? '').trim() || '任务',
    startedAt: Date.now(),
    failed: false,
    notified: false
  })
}

export const recordLongTaskCompletionAnchor = (
  event: LongTaskCompletionNotifyEvent,
  result: MessageResultLike
): string => {
  const state = getLongTaskCompletionNotifyState(event)
  if (!state || state.anchorMessageId) return state?.anchorMessageId ?? ''

  const messageId = normalizeLongTaskCompletionMessageId(result)
  if (!messageId) return ''

  state.anchorMessageId = messageId
  return messageId
}

export const markLongTaskCompletionFailed = (
  event: LongTaskCompletionNotifyEvent
): void => {
  const state = getLongTaskCompletionNotifyState(event)
  if (!state) return
  state.failed = true
}

export const replyAndRecordLongTaskCompletionAnchor = async (
  event: LongTaskCompletionNotifyEvent,
  payload: Parameters<LongTaskCompletionNotifyEvent['reply']>[0]
): Promise<Awaited<ReturnType<LongTaskCompletionNotifyEvent['reply']>>> => {
  const result = await event.reply(payload)
  recordLongTaskCompletionAnchor(event, result as MessageResultLike)
  return result
}

export const sendForwardAndRecordLongTaskCompletionAnchor = async (
  event: Pick<Message, 'bot' | 'contact'> & LongTaskCompletionNotifyEvent,
  forward: Parameters<Message['bot']['sendForwardMsg']>[1],
  options: Parameters<Message['bot']['sendForwardMsg']>[2]
): Promise<Awaited<ReturnType<Message['bot']['sendForwardMsg']>>> => {
  const result = await event.bot.sendForwardMsg(event.contact, forward, options)
  recordLongTaskCompletionAnchor(event, result as MessageResultLike)
  return result
}

export const notifyLongTaskCompletionIfNeeded = async (
  event: LongTaskCompletionNotifyEvent
): Promise<boolean> => {
  const state = getLongTaskCompletionNotifyState(event)
  if (!state) return false
  if (!Config.app.longTaskCompletionNotify) return false
  if (state.failed || state.notified || !state.anchorMessageId) return false

  const elapsedMs = Math.max(0, Date.now() - state.startedAt)
  if (elapsedMs < resolveLongTaskThresholdMs()) return false

  const payload: ElementTypes[] = [segment.reply(state.anchorMessageId)]
  if (event.isGroup) {
    const triggerUserId = resolveTriggerUserId(event)
    if (triggerUserId) {
      payload.push(segment.at(triggerUserId))
    }
  }
  payload.push(segment.text(`【${state.businessName}】处理完毕了`))

  await event.reply(payload)
  state.notified = true
  return true
}
