import type { ApiErrorProps } from '@kkk/template-contracts'
import { type ElementTypes, logger, type Message, segment } from 'node-karin'

import { getBuildMetadata } from '@/module'
import { EmojiReactionManager } from '@/module/utils/EmojiReaction'
import {
  createFailureTraceId,
  getFailureTraceId,
  persistFailureTrace,
  recordFailureTraceStep,
  resolveFailureTraceEventTime,
  runWithFailureTraceContext,
  sanitizeFailureTraceText,
  sanitizeFailureTraceValue
} from '@/module/utils/ErrorTrace'

import { renderErrorImage } from './render'
import { sendErrorToAllMasters, sendErrorToMaster, sendErrorToTrigger } from './sender'
import { getStrategies } from './strategy'
import type { ErrorContext, ErrorHandlerOptions } from './types'
import { injectBotToEventForPushTask, isPushTask, parseLogsToStructured } from './utils'

const buildPlainTextErrorPayload = (ctx: ErrorContext): ElementTypes[] => {
  const { options, traceId } = ctx
  const lines = [
    `【${sanitizeFailureTraceText(options.businessName)}】处理失败`,
    '错误摘要：业务处理失败，诊断详情已记录',
    `追踪编号：${traceId}`
  ].filter(Boolean)

  return [segment.text(lines.join('\n'))]
}

const buildMasterErrorPrefix = (ctx: ErrorContext): string => {
  return [
    `【${sanitizeFailureTraceText(ctx.options.businessName)}】处理失败`,
    `追踪编号：${ctx.traceId}`
  ].join('\n')
}

const formatSanitizedHandlerError = (error: unknown): string => {
  const sanitized = sanitizeFailureTraceValue(error)
  if (typeof sanitized === 'string') return sanitized
  try {
    return JSON.stringify(sanitized)
  } catch {
    return '未知错误'
  }
}

export const handleBusinessError = async (
  error: Error,
  options: ErrorHandlerOptions,
  logs: ApiErrorProps['data']['logs'],
  event: Message
): Promise<'handled' | undefined> => {
  try {
    logger.debug(`[ErrorHandler] 开始处理业务错误: ${options.businessName}`)

    const buildMetadata = getBuildMetadata()
    const adapterInfo = event.bot?.adapter ? event.bot.adapter : undefined
    const traceId = getFailureTraceId() ?? createFailureTraceId(
      resolveFailureTraceEventTime(event?.time) ?? new Date()
    )

    const ctx: ErrorContext = {
      traceId,
      error,
      options,
      logs,
      event,
      buildMetadata,
      adapterInfo
    }

    for (const strategy of getStrategies()) {
      if (strategy.match(ctx)) {
        logger.debug(`[ErrorHandler] 匹配策略: ${strategy.name}`)
        const result = await strategy.handle(ctx)
        if (result === 'handled') return 'handled'
      }
    }

    let content: ElementTypes[]

    try {
      content = await renderErrorImage(ctx)
    } catch (renderError) {
      logger.warn(`[ErrorHandler] 错误图片渲染失败，回退文本错误消息: ${formatSanitizedHandlerError(renderError)}`)
      content = buildPlainTextErrorPayload(ctx)
    }

    await sendErrorToTrigger(ctx, content)
    const masterPrefix = buildMasterErrorPrefix(ctx)
    await sendErrorToMaster(ctx, content, masterPrefix)
    await sendErrorToAllMasters(ctx, content, masterPrefix)

    if (options.customErrorHandler) {
      try {
        await options.customErrorHandler(error, logs)
      } catch (err) {
        logger.error(`[ErrorHandler] 自定义错误处理失败: ${formatSanitizedHandlerError(err)}`)
      }
    }
  } catch (handlerError) {
    logger.error(`[ErrorHandler] 错误处理器本身发生错误: ${formatSanitizedHandlerError(handlerError)}`)
    throw handlerError
  }
  return undefined
}

export const wrapWithErrorHandler = <R> (
  fn: (e: Message, next?: () => unknown) => R | Promise<R>,
  options: ErrorHandlerOptions
) => {
  return async (e?: Message, next?: () => unknown): Promise<R> => {
    const rawEvent = e
    const normalizedEvent = await injectBotToEventForPushTask(rawEvent, options.businessName)
    const shouldHandleEmoji = Boolean(rawEvent) && !isPushTask(rawEvent, options.businessName)
    const emojiManager = shouldHandleEmoji ? new EmojiReactionManager(rawEvent as Message) : undefined
    let processingTimer: NodeJS.Timeout | null = null
    let successTimer: NodeJS.Timeout | null = null

    if (emojiManager) {
      await emojiManager.add('EYES')
      processingTimer = setTimeout(() => {
        emojiManager.add('PROCESSING').catch(() => { })
      }, 1500)
    }

    return await runWithFailureTraceContext({
      businessName: options.businessName,
      event: normalizedEvent
        ? {
          message: normalizedEvent.msg,
          time: normalizedEvent.time,
          userId: normalizedEvent.userId,
          groupId: normalizedEvent.isGroup ? (normalizedEvent.contact?.peer || '') : undefined,
          selfId: normalizedEvent.selfId,
          isGroup: normalizedEvent.isGroup
        }
        : undefined
    }, async () => {
      recordFailureTraceStep('handler.start', {
        businessName: options.businessName
      })

      const ctx = logger.runContext(async () => fn(normalizedEvent, next))

      try {
        const result = await ctx.run()
        recordFailureTraceStep('handler.success')

        if (emojiManager) {
          successTimer = setTimeout(() => {
            emojiManager.replace('PROCESSING', 'SUCCESS').catch(() => { })
          }, 1500)
        }

        return result
      } catch (error) {
        if (processingTimer) clearTimeout(processingTimer)
        if (successTimer) clearTimeout(successTimer)

        recordFailureTraceStep('handler.error', {
          name: error instanceof Error ? error.name : 'Error',
          message: error instanceof Error ? error.message : String(error)
        })

        if (emojiManager) {
          const processingEmojiId = emojiManager['getPlatformEmojiId']('PROCESSING')
          if (emojiManager.has(processingEmojiId)) {
            await emojiManager.remove('PROCESSING')
          }
          await emojiManager.add('ERROR')
        }

        await new Promise(resolve => setTimeout(resolve, 100))
        const rawLogs = ctx.logs()
        const structuredLogs = parseLogsToStructured(rawLogs)
        const buildMetadata = getBuildMetadata()

        persistFailureTrace({
          error,
          rawLogs,
          structuredLogs,
          buildMetadata,
          extra: {
            emojiHandled: Boolean(emojiManager),
            isPushTask: isPushTask(rawEvent, options.businessName)
          }
        })

        const result = await handleBusinessError(error as Error, options, structuredLogs, normalizedEvent)
        if (result === 'handled') return undefined as R
        throw error
      }
    })
  }
}
