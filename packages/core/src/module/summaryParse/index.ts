import { type Message } from 'node-karin'

import { Config } from '@/module/utils/Config'
import {
  initLongTaskCompletionNotify,
  recordLongTaskCompletionAnchor
} from '@/module/utils/LongTaskCompletionNotify'

import { extractSummaryResolvedLinks, extractSummaryTrigger, stripResolvedLinksFromMessage } from './link'
import { canUseSummaryLLM, summarizeWithOpenAICompatible } from './llm'
import {
  buildSummaryLinkProgressContext,
  cleanupSummaryTaskProgress,
  createSummaryTaskProgress,
  endSummaryProgressTimer,
  logSummaryMessage,
  logSummaryProgress,
  startSummaryProgressTimer
} from './progress'
import type { SummaryInput, SummaryResult, SummaryRuntimeContext } from './types'
import { resolveSummaryInputWithAsr } from './workflow'

const normalizeSummaryReplyBody = (
  rawSummaryText: string,
  titles: string[]
): string => {
  const trimmed = String(rawSummaryText ?? '').trim()
  if (!trimmed) return ''

  const normalizedTitleSet = new Set(
    titles
      .map(title => title.trim())
      .filter(Boolean)
  )

  const lines = trimmed
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  const cleanedLines = lines.filter((line, index) => {
    if (/^以下内容由【.+】总结$/.test(line)) return false
    if (/^【正文总结】$/.test(line)) return false
    if (/^【标题】.*【模型名称】.*$/.test(line)) return false
    if (index === 0 && (normalizedTitleSet.has(line) || /^标题[:：]/.test(line))) return false
    return true
  })

  while (cleanedLines.length > 0) {
    const firstLine = cleanedLines[0]
    if (normalizedTitleSet.has(firstLine) || /^标题[:：]/.test(firstLine)) {
      cleanedLines.shift()
      continue
    }
    break
  }

  return cleanedLines.join('\n').trim() || trimmed
}

const buildSummaryReplyPlatformLabel = (inputs: SummaryInput[]): string => {
  const labels = Array.from(new Set(
    inputs
      .map(input => input.platformLabel.trim())
      .filter(Boolean)
  ))

  if (labels.length === 0) return '未知平台'
  if (labels.length === 1) return labels[0]
  return '多平台'
}

const buildSummaryReplyTitle = (inputs: SummaryInput[]): string => {
  const titles = Array.from(new Set(
    inputs
      .map(input => input.title.trim())
      .filter(Boolean)
  ))

  if (titles.length === 0) return '无标题'
  if (titles.length === 1) return titles[0]

  const preview = titles.slice(0, 3).join('｜')
  return titles.length > 3
    ? `共${titles.length}条内容：${preview} 等`
    : `共${titles.length}条内容：${preview}`
}

const formatSummaryReply = (
  inputs: SummaryInput[],
  model: string,
  rawSummaryText: string
): string => {
  const title = buildSummaryReplyTitle(inputs)
  const body = normalizeSummaryReplyBody(
    rawSummaryText,
    inputs.map(input => input.title)
  )

  return [
    `【${buildSummaryReplyPlatformLabel(inputs)}】x【${model}】`,
    title,
    body
  ].filter(Boolean).join('\n')
}

export const getSummaryParseConfig = () => Config.app.summaryParse

type SummaryReplySourceEvent = Pick<Message, 'msg' | 'replyId' | 'bot' | 'contact'>

const tryParseStructuredString = (value: string): unknown => {
  const source = value.trim()
  if (!source) return value

  try {
    return JSON.parse(source)
  } catch {
    return value
  }
}

const collectReplySourceStrings = (value: unknown, depth = 0): string[] => {
  if (depth > 5 || value === null || value === undefined) return []

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? [trimmed] : []
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)]
  }

  if (Array.isArray(value)) {
    return value.flatMap(item => collectReplySourceStrings(item, depth + 1))
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .flatMap(item => collectReplySourceStrings(item, depth + 1))
  }

  return []
}

const extractReplyElementSourceStrings = (element: unknown): string[] => {
  if (!element || typeof element !== 'object') return []

  const payload = element as Record<string, unknown>
  const type = String(payload.type ?? '').trim()

  if (type === 'text') {
    const text = String(payload.text ?? '').trim()
    if (!text) return []

    const parsed = tryParseStructuredString(text)
    if (
      parsed &&
      typeof parsed === 'object' &&
      (parsed as Record<string, unknown>).type === 'markdown'
    ) {
      return collectReplySourceStrings((parsed as { data?: { content?: unknown } }).data?.content)
    }

    return collectReplySourceStrings(parsed)
  }

  if (type === 'json') {
    return collectReplySourceStrings(tryParseStructuredString(String(payload.data ?? '').trim()))
  }

  if (type === 'markdown') {
    return collectReplySourceStrings(payload.data)
  }

  return collectReplySourceStrings(payload)
}

const dedupeReplySourceStrings = (values: string[]): string[] => {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalized = value.trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

const readReplySourceMessage = async (event: SummaryReplySourceEvent): Promise<string> => {
  if (!event.replyId || !event.bot?.getMsg) return ''

  try {
    const reply = await event.bot.getMsg(event.contact, event.replyId)
    const elements = Array.isArray((reply as { elements?: unknown[] }).elements)
      ? (reply as { elements: unknown[] }).elements
      : []

    const sourceStrings = dedupeReplySourceStrings(
      elements.flatMap(element => extractReplyElementSourceStrings(element))
    )

    if (sourceStrings.length > 0) {
      return sourceStrings.join('\n')
    }

    return dedupeReplySourceStrings(collectReplySourceStrings(reply)).join('\n')
  } catch (error) {
    logSummaryMessage(`获取被回复消息失败，已忽略：${error instanceof Error ? error.message : String(error)}`, {
      level: 'warn'
    })
    return ''
  }
}

export const shouldTriggerSummaryParse = (message: string): SummaryRuntimeContext | null => {
  const config = getSummaryParseConfig()
  if (!config.switch) return null

  const trigger = extractSummaryTrigger(message, config.keywords)
  if (!trigger || !trigger.rest) return null

  const links = extractSummaryResolvedLinks(trigger.rest)
  if (links.length === 0) return null

  return {
    trigger,
    shareContext: stripResolvedLinksFromMessage(trigger.rest, links),
    links
  }
}

export const resolveSummaryParseContext = async (
  event: SummaryReplySourceEvent
): Promise<SummaryRuntimeContext | null> => {
  const config = getSummaryParseConfig()
  if (!config.switch) return null

  const trigger = extractSummaryTrigger(String(event.msg ?? ''), config.keywords)
  if (!trigger) return null

  const directLinks = extractSummaryResolvedLinks(trigger.rest)
  if (directLinks.length > 0) {
    return {
      trigger,
      shareContext: stripResolvedLinksFromMessage(trigger.rest, directLinks),
      links: directLinks
    }
  }

  const replySourceMessage = await readReplySourceMessage(event)
  if (!replySourceMessage) return null

  const replyLinks = extractSummaryResolvedLinks(replySourceMessage)
  if (replyLinks.length === 0) return null

  return {
    trigger,
    shareContext: stripResolvedLinksFromMessage(trigger.rest, []),
    links: replyLinks
  }
}

export const runSummaryParse = async (
  event: Message,
  context: SummaryRuntimeContext
): Promise<SummaryResult> => {
  const config = getSummaryParseConfig()
  if (!canUseSummaryLLM(config)) {
    throw new Error('解析总结已触发，但 LLM 配置不完整')
  }

  initLongTaskCompletionNotify(event, '解析总结')

  const taskProgress = createSummaryTaskProgress(context.links.length, event)
  const inputs = []

  try {
    startSummaryProgressTimer({
      scope: 'task',
      stage: '开始解析',
      taskId: taskProgress.taskId,
      totalLinks: taskProgress.totalLinks
    })

    for (const [index, link] of context.links.entries()) {
      try {
        const pendingLinkProgress = buildSummaryLinkProgressContext(taskProgress, link, index + 1)
        logSummaryProgress({
          scope: 'link',
          stage: '开始处理',
          taskId: pendingLinkProgress.taskId,
          totalLinks: pendingLinkProgress.totalLinks,
          linkIndex: pendingLinkProgress.linkIndex,
          platform: pendingLinkProgress.platform
        })

        logSummaryMessage(`开始处理 ${link.platform} 总结：${link.url}`, {
          taskId: taskProgress.taskId,
          level: 'debug'
        })
        const enrichedInput = await resolveSummaryInputWithAsr({
          config,
          link,
          shareContext: context.shareContext,
          taskProgress,
          linkIndex: index + 1,
          onParsedPostResolved: cacheHit => {
            if (cacheHit) {
              logSummaryMessage('命中链接级解析缓存，跳过平台解析', {
                taskId: taskProgress.taskId
              })
            } else {
              logSummaryMessage('链接级解析缓存未命中，开始平台解析', {
                taskId: taskProgress.taskId,
                level: 'debug'
              })
            }
          }
        })
        inputs.push(enrichedInput)

        endSummaryProgressTimer({
          scope: 'link',
          stage: '开始处理',
          taskId: taskProgress.taskId,
          totalLinks: taskProgress.totalLinks,
          linkIndex: index + 1,
          platform: enrichedInput.platformLabel || enrichedInput.platform,
          title: enrichedInput.title
        })
      } catch (error) {
        logSummaryMessage(`单条链接解析失败，已跳过：${error instanceof Error ? error.message : String(error)}`, {
          taskId: taskProgress.taskId,
          level: 'warn'
        })
        logSummaryProgress({
          scope: 'link',
          stage: '处理失败，已跳过',
          level: 'warn',
          taskId: taskProgress.taskId,
          totalLinks: taskProgress.totalLinks,
          linkIndex: index + 1,
          platform: link.platform,
          details: error instanceof Error ? error.message : String(error)
        })
      }
    }

    endSummaryProgressTimer({
      scope: 'task',
      stage: '开始解析',
      taskId: taskProgress.taskId,
      totalLinks: taskProgress.totalLinks
    })

    if (inputs.length === 0) {
      throw new Error('解析总结失败：没有可用于总结的解析结果')
    }

    logSummaryProgress({
      scope: 'task',
      stage: 'LLM 总结中',
      taskId: taskProgress.taskId,
      totalLinks: taskProgress.totalLinks
    })

    const rawSummaryText = await summarizeWithOpenAICompatible(config, inputs, taskProgress)
    const summaryText = formatSummaryReply(inputs, config.llm.model, rawSummaryText)

    recordLongTaskCompletionAnchor(event, await event.reply(summaryText))
    logSummaryProgress({
      scope: 'task',
      stage: '总结已发送',
      level: 'info',
      taskId: taskProgress.taskId,
      totalLinks: taskProgress.totalLinks
    })

    if (config.sendParsedContent) {
      logSummaryProgress({
        scope: 'task',
        stage: '开始发送原解析内容',
        level: 'info',
        taskId: taskProgress.taskId,
        totalLinks: taskProgress.totalLinks
      })
    } else {
      logSummaryProgress({
        scope: 'task',
        stage: '任务完成',
        level: 'info',
        taskId: taskProgress.taskId,
        totalLinks: taskProgress.totalLinks
      })
    }

    return {
      inputs,
      summaryText,
      taskId: taskProgress.taskId,
      totalLinks: taskProgress.totalLinks
    }
  } finally {
    cleanupSummaryTaskProgress(taskProgress.taskId)
  }
}

export * from './progress'
