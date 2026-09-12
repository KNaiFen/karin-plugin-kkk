import { common, type ElementTypes, type Message, segment } from 'node-karin'

import { Config } from '@/module/utils/Config'
import {
  initLongTaskCompletionNotify,
  recordLongTaskCompletionAnchor,
  sendForwardAndRecordLongTaskCompletionAnchor
} from '@/module/utils/LongTaskCompletionNotify'

import { extractSummaryResolvedLinks, extractSummaryTrigger, stripResolvedLinksFromMessage } from '../summaryParse/link'
import {
  buildSummaryLinkProgressContext,
  cleanupSummaryTaskProgress,
  createSummaryTaskProgress,
  endSummaryProgressTimer,
  logSummaryMessage,
  logSummaryProgress,
  startSummaryProgressTimer
} from '../summaryParse/progress'
import type { SummaryInput } from '../summaryParse/types'
import { resolveSummaryInputWithAsr } from '../summaryParse/workflow'
import { renderDetailedSummaryMarkdownImages, stripMarkdownToPlainText } from './markdown'
import { summarizeWithOpenAIResponses } from './responses'
import type {
  DetailedSummaryResult,
  DetailedSummaryRuntimeContext,
  DetailedSummarySource
} from './types'

const DETAILED_SUMMARY_BUSINESS_NAME = '详细解析总结'
const DETAILED_SUMMARY_FORWARD_TEXT_MAX_LENGTH = 1200

const splitDetailedSummaryForwardText = (text: string, maxLength = DETAILED_SUMMARY_FORWARD_TEXT_MAX_LENGTH): string[] => {
  const normalizedText = String(text ?? '').trim()
  if (!normalizedText) return []

  const paragraphs = normalizedText
    .split(/\n{2,}/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let currentChunk = ''

  const pushLongParagraph = (paragraph: string): void => {
    for (let index = 0; index < paragraph.length; index += maxLength) {
      chunks.push(paragraph.slice(index, index + maxLength))
    }
  }

  for (const paragraph of paragraphs) {
    const nextChunk = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph
    if (nextChunk.length <= maxLength) {
      currentChunk = nextChunk
      continue
    }

    if (currentChunk) {
      chunks.push(currentChunk)
      currentChunk = ''
    }

    if (paragraph.length <= maxLength) {
      currentChunk = paragraph
      continue
    }

    pushLongParagraph(paragraph)
  }

  if (currentChunk) {
    chunks.push(currentChunk)
  }

  return chunks
}

const buildDetailedSummaryTextCollectionElements = (summaryText: string): ElementTypes[] => {
  const chunks = splitDetailedSummaryForwardText(summaryText)
  if (chunks.length === 0) {
    return [segment.text(summaryText)]
  }

  return chunks.map(chunk => segment.text(chunk))
}

const getDetailedSummaryForwardIdentity = (event: Message): { id: string | number, name: string } => {
  if (Config.app.fakeForward && event.sender?.userId && event.sender?.nick) {
    return {
      id: event.sender.userId,
      name: event.sender.nick
    }
  }

  return {
    id: event.bot.account.selfId,
    name: event.bot.account.name
  }
}

const sendDetailedSummaryCollection = async (event: Message, elements: ElementTypes[]): Promise<void> => {
  const identity = getDetailedSummaryForwardIdentity(event)
  const forwardMsg = common.makeForward(elements, String(identity.id), identity.name)
  await sendForwardAndRecordLongTaskCompletionAnchor(event, forwardMsg, {
    source: '详细研报合集',
    summary: `查看${elements.length}条详细研报消息`,
    prompt: '详细解析总结',
    news: [{ text: '点击查看详细研报' }]
  })
}

const normalizeDetailedSummaryReplyBody = (rawSummaryText: string): string => {
  return String(rawSummaryText ?? '').trim()
}

const buildDetailedSummaryReplyPlatformLabel = (inputs: SummaryInput[]): string => {
  const labels = Array.from(new Set(
    inputs
      .map(input => input.platformLabel.trim())
      .filter(Boolean)
  ))

  if (labels.length === 0) return '未知平台'
  if (labels.length === 1) return labels[0]
  return '多平台'
}

const buildDetailedSummaryReplyTitle = (inputs: SummaryInput[]): string => {
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

const formatDetailedSummarySources = (sources: DetailedSummarySource[]): string => {
  if (sources.length === 0) {
    return ['【参考来源】', '本次未返回可展示来源'].join('\n')
  }

  return [
    '【参考来源】',
    ...sources.map((source, index) => {
      const title = source.title?.trim() || '未命名来源'
      const domain = source.domain?.trim()
      return `${index + 1}. ${title}${domain ? `｜${domain}` : ''}\n${source.url}`
    })
  ].join('\n')
}

const formatDetailedSummaryReply = (
  inputs: SummaryInput[],
  model: string,
  rawSummaryText: string,
  sources: DetailedSummarySource[]
): string => {
  const title = buildDetailedSummaryReplyTitle(inputs)
  const body = normalizeDetailedSummaryReplyBody(rawSummaryText)

  return [
    `【${buildDetailedSummaryReplyPlatformLabel(inputs)}】x【${model}】x【详细研报】`,
    title,
    body,
    formatDetailedSummarySources(sources)
  ].filter(Boolean).join('\n')
}

const formatDetailedSummaryMarkdown = (
  inputs: SummaryInput[],
  model: string,
  rawSummaryText: string,
  sources: DetailedSummarySource[]
): string => {
  const header = `# 【${buildDetailedSummaryReplyPlatformLabel(inputs)}】x【${model}】x【详细研报】`
  const title = `> ${buildDetailedSummaryReplyTitle(inputs)}`
  const body = normalizeDetailedSummaryReplyBody(rawSummaryText)
  const sourceLines = sources.length === 0
    ? ['## 【参考来源】', '本次未返回可展示来源']
    : [
      '## 【参考来源】',
      ...sources.map((source, index) => {
        const titleText = source.title?.trim() || '未命名来源'
        const domain = source.domain?.trim()
        return `${index + 1}. ${titleText}${domain ? `｜${domain}` : ''}\n${source.url}`
      })
    ]

  return [
    header,
    '',
    title,
    '',
    body,
    '',
    ...sourceLines
  ].join('\n').trim()
}

const formatDetailedSummaryPlainTextFromMarkdown = (markdownText: string): string => {
  return stripMarkdownToPlainText(markdownText)
}

const replyDetailedSummary = async (
  event: Message,
  config: ReturnType<typeof getDetailedSummaryParseConfig>,
  summaryText: string,
  markdownText: string
): Promise<'collection' | 'direct'> => {
  const textCollectionElements = buildDetailedSummaryTextCollectionElements(summaryText)
  let collectionElements = textCollectionElements
  let directFallbackPayload: string | ElementTypes | ElementTypes[] = summaryText

  try {
    if (config.markdownRender?.enabled) {
      try {
        const imageFiles = await renderDetailedSummaryMarkdownImages(markdownText, {
          fontSizePx: config.markdownRender.fontSizePx,
          multiPageEnabled: config.markdownRender.multiPageEnabled,
          multiPageTriggerAspectRatio: config.markdownRender.multiPageTriggerAspectRatio,
          multiPageMaxAspectRatio: config.markdownRender.multiPageMaxAspectRatio
        })
        const imageSegments = imageFiles.map(file => segment.image(file))
        collectionElements = config.markdownRender.sendTextVersion
          ? [...imageSegments, ...textCollectionElements]
          : imageSegments
        directFallbackPayload = config.markdownRender.sendTextVersion
          ? [...imageSegments, ...textCollectionElements]
          : (imageSegments.length === 1 ? imageSegments[0] : imageSegments)
      } catch (error) {
        logSummaryMessage(`Markdown 渲染图生成失败，已回退文本合集发送：${error instanceof Error ? error.message : String(error)}`, {
          level: 'warn',
          businessName: DETAILED_SUMMARY_BUSINESS_NAME
        })
      }
    }

    await sendDetailedSummaryCollection(event, collectionElements)
    return 'collection'
  } catch (error) {
    logSummaryMessage(`详细研报合集发送失败，已回退直接发送：${error instanceof Error ? error.message : String(error)}`, {
      level: 'warn',
      businessName: DETAILED_SUMMARY_BUSINESS_NAME
    })
    recordLongTaskCompletionAnchor(event, await event.reply(directFallbackPayload))
    return 'direct'
  }
}

export const getDetailedSummaryParseConfig = () => Config.app.detailedSummaryParse

type DetailedSummaryReplySourceEvent = Pick<Message, 'msg' | 'replyId' | 'bot' | 'contact'>

const canUseDetailedSummaryLLM = (): boolean => {
  const config = getDetailedSummaryParseConfig()
  return Boolean(
    config.switch &&
    config.llm.baseUrl?.trim() &&
    config.llm.apiKey?.trim() &&
    config.llm.model?.trim()
  )
}

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

const readReplySourceMessage = async (event: DetailedSummaryReplySourceEvent): Promise<string> => {
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
      level: 'warn',
      businessName: DETAILED_SUMMARY_BUSINESS_NAME
    })
    return ''
  }
}

export const shouldTriggerDetailedSummaryParse = (message: string): DetailedSummaryRuntimeContext | null => {
  const config = getDetailedSummaryParseConfig()
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

export const resolveDetailedSummaryParseContext = async (
  event: DetailedSummaryReplySourceEvent
): Promise<DetailedSummaryRuntimeContext | null> => {
  const config = getDetailedSummaryParseConfig()
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

export const runDetailedSummaryParse = async (
  event: Message,
  context: DetailedSummaryRuntimeContext
): Promise<DetailedSummaryResult> => {
  const config = getDetailedSummaryParseConfig()
  if (!canUseDetailedSummaryLLM()) {
    throw new Error('详细解析总结已触发，但 Responses 配置不完整')
  }

  initLongTaskCompletionNotify(event, DETAILED_SUMMARY_BUSINESS_NAME)

  const taskProgress = createSummaryTaskProgress(context.links.length, event, {
    businessName: DETAILED_SUMMARY_BUSINESS_NAME
  })
  const inputs: SummaryInput[] = []

  try {
    startSummaryProgressTimer({
      scope: 'task',
      stage: '开始详细解析',
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

        logSummaryMessage(`开始处理 ${link.platform} 详细总结：${link.url}`, {
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
      stage: '开始详细解析',
      taskId: taskProgress.taskId,
      totalLinks: taskProgress.totalLinks
    })

    if (inputs.length === 0) {
      throw new Error('详细解析总结失败：没有可用于生成研报的解析结果')
    }

    logSummaryProgress({
      scope: 'task',
      stage: 'LLM 研报生成中',
      taskId: taskProgress.taskId,
      totalLinks: taskProgress.totalLinks
    })

    const responseResult = await summarizeWithOpenAIResponses(config, inputs)
    const markdownText = formatDetailedSummaryMarkdown(
      inputs,
      config.llm.model,
      responseResult.text,
      responseResult.sources
    )
    const summaryText = config.markdownRender?.enabled
      ? formatDetailedSummaryPlainTextFromMarkdown(markdownText)
      : formatDetailedSummaryReply(
        inputs,
        config.llm.model,
        responseResult.text,
        responseResult.sources
      )

    const deliveryMode = await replyDetailedSummary(event, config, summaryText, markdownText)
    logSummaryProgress({
      scope: 'task',
      stage: deliveryMode === 'collection' ? '合集研报已发送' : '研报已发送',
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
      sources: responseResult.sources,
      taskId: taskProgress.taskId,
      totalLinks: taskProgress.totalLinks
    }
  } finally {
    cleanupSummaryTaskProgress(taskProgress.taskId)
  }
}

export * from './prompt'
export * from './responses'
export * from './types'
