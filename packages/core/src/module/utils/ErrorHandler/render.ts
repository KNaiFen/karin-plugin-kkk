import { Render, Root } from '@/module'
import {
  formatFailureTraceTime,
  resolveFailureTraceEventTime,
  sanitizeFailureTraceText
} from '@/module/utils/ErrorTrace'

import type { ErrorContext, RenderErrorOptions } from './types'

/**
 * 渲染错误图片
 *
 * @param ctx - 错误处理上下文
 * @param opts - 渲染选项，可覆盖默认值
 * @returns 渲染后的图片元素数组
 *
 * @remarks
 * 使用 `other/handlerError` 模板渲染错误信息图片，
 * 通知仅包含业务摘要和诊断追踪编号，详细信息保存在本地 trace 文件
 *
 * @example
 * ```ts
 * const img = await renderErrorImage(ctx, {
 *   platform: 'bilibili',
 *   errorName: 'RiskControl',
 *   errorMessage: '风控验证'
 * })
 * await event.reply(img)
 * ```
 */
export const renderErrorImage = async (ctx: ErrorContext, opts: RenderErrorOptions = {}) => {
  const { traceId, options, event } = ctx
  const businessName = sanitizeFailureTraceText(options.businessName)
  const errorName = sanitizeFailureTraceText(opts.errorName || 'BusinessError')
  const errorMessage = sanitizeFailureTraceText(
    opts.errorMessage || '业务处理失败，诊断详情已记录'
  )

  return Render(event, 'other/handlerError', {
    type: 'business_error',
    platform: opts.platform || 'system',
    error: {
      message: errorMessage,
      name: errorName,
      stack: `Trace ID: ${traceId}`,
      businessName
    },
    method: businessName,
    timestamp: formatFailureTraceTime(resolveFailureTraceEventTime(event?.time) ?? new Date()),
    logs: undefined,
    triggerCommand: undefined,
    frameworkVersion: Root.karinVersion,
    pluginVersion: Root.pluginVersion,
    buildTime: undefined,
    commitHash: undefined,
    adapterInfo: undefined,
    isVerification: opts.isVerification,
    verificationUrl: opts.verificationUrl,
    share_url: opts.share_url
  })
}
