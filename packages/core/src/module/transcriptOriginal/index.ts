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
import {
  renderTranscriptOriginalMarkdownImages,
  stripTranscriptOriginalMarkdownToPlainText
} from './markdown'
import { summarizeTranscriptOriginalWithResponses } from './responses'
import type {
  TranscriptOriginalResult,
  TranscriptOriginalRuntimeContext
} from './types'

const TRANSCRIPT_ORIGINAL_BUSINESS_NAME = '转写原文'
const TRANSCRIPT_ORIGINAL_FORWARD_TEXT_MAX_LENGTH = 1200

type TranscriptOriginalReplySourceEvent = Pick<Message, 'msg' | 'replyId' | 'bot' | 'contact'>

type TranscriptOriginalProcessedItem = {
  input: SummaryInput
  finalText: string
  markdownText?: string
  directFallbackText: string
}

const filterTranscriptOriginalLinks = (links: ReturnType<typeof extractSummaryResolvedLinks>) => {
  return links.filter(link => link.platform !== 'github')
}

const splitTranscriptOriginalForwardText = (
  text: string,
  maxLength = TRANSCRIPT_ORIGINAL_FORWARD_TEXT_MAX_LENGTH
): string[] => {
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

const buildTranscriptOriginalTextCollectionElements = (text: string): ElementTypes[] => {
  const chunks = splitTranscriptOriginalForwardText(text)
  if (chunks.length === 0) {
    return [segment.text(text)]
  }
  return chunks.map(chunk => segment.text(chunk))
}

const getTranscriptOriginalForwardIdentity = (event: Message): { id: string | number, name: string } => {
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

const sendTranscriptOriginalCollection = async (event: Message, elements: ElementTypes[]): Promise<void> => {
  const identity = getTranscriptOriginalForwardIdentity(event)
  const forwardMsg = common.makeForward(elements, String(identity.id), identity.name)
  await sendForwardAndRecordLongTaskCompletionAnchor(event, forwardMsg, {
    source: '转写原文合集',
    summary: `查看${elements.length}条转写原文消息`,
    prompt: '转写原文',
    news: [{ text: '点击查看转写原文' }]
  })
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

const readReplySourceMessage = async (event: TranscriptOriginalReplySourceEvent): Promise<string> => {
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
      businessName: TRANSCRIPT_ORIGINAL_BUSINESS_NAME
    })
    return ''
  }
}

const buildTranscriptOriginalReplyHeader = (input: SummaryInput, model: string): string => {
  return `【${input.platformLabel || input.platform}】x【${model}】x【转写原文】`
}

const buildTranscriptOriginalSections = (input: SummaryInput, useMarkdown = false): string => {
  if (input.asrTexts.length === 0) return ''

  if (input.asrTexts.length === 1) {
    return String(input.asrTexts[0]?.text ?? '').trim()
  }

  return input.asrTexts
    .map((item, index) => {
      const title = item.title?.trim()
      const heading = useMarkdown
        ? `## 视频 ${index + 1}${title ? `：${title}` : ''}`
        : `【视频 ${index + 1}${title ? `：${title}` : ''}】`
      return [heading, String(item.text ?? '').trim()].filter(Boolean).join('\n')
    })
    .join('\n\n')
}

const formatTranscriptOriginalReply = (
  input: SummaryInput,
  model: string,
  body: string
): string => {
  return [
    buildTranscriptOriginalReplyHeader(input, model),
    input.title.trim() || '无标题',
    String(body ?? '').trim()
  ].filter(Boolean).join('\n')
}

const formatTranscriptOriginalMarkdown = (
  input: SummaryInput,
  model: string,
  body: string
): string => {
  return [
    `# ${buildTranscriptOriginalReplyHeader(input, model)}`,
    '',
    `> ${input.title.trim() || '无标题'}`,
    '',
    String(body ?? '').trim()
  ].join('\n').trim()
}

const buildRawTranscriptOriginalReply = (input: SummaryInput, model: string): string => {
  return formatTranscriptOriginalReply(input, model, buildTranscriptOriginalSections(input, false))
}

const replyTranscriptOriginal = async (
  event: Message,
  config: ReturnType<typeof getTranscriptOriginalConfig>,
  items: TranscriptOriginalProcessedItem[]
): Promise<'collection' | 'direct'> => {
  const collectionElements: ElementTypes[] = []
  const directFallbackElements: Array<string | ElementTypes | ElementTypes[]> = []

  for (const item of items) {
    let itemElements = buildTranscriptOriginalTextCollectionElements(item.finalText)
    let itemFallback: string | ElementTypes | ElementTypes[] = item.directFallbackText

    if (config.markdownRender?.enabled && item.markdownText) {
      try {
        const imageFiles = await renderTranscriptOriginalMarkdownImages(item.markdownText, {
          fontSizePx: config.markdownRender.fontSizePx,
          multiPageEnabled: config.markdownRender.multiPageEnabled,
          multiPageTriggerAspectRatio: config.markdownRender.multiPageTriggerAspectRatio,
          multiPageMaxAspectRatio: config.markdownRender.multiPageMaxAspectRatio
        })
        const imageSegments = imageFiles.map(file => segment.image(file))
        const textSegments = config.markdownRender.sendTextVersion
          ? buildTranscriptOriginalTextCollectionElements(item.finalText)
          : []
        itemElements = [...imageSegments, ...textSegments]
        itemFallback = config.markdownRender.sendTextVersion
          ? [...imageSegments, ...textSegments]
          : (imageSegments.length === 1 ? imageSegments[0] : imageSegments)
      } catch (error) {
        logSummaryMessage(`Markdown 渲染图生成失败，已回退文本合集发送：${error instanceof Error ? error.message : String(error)}`, {
          level: 'warn',
          businessName: TRANSCRIPT_ORIGINAL_BUSINESS_NAME
        })
      }
    }

    collectionElements.push(...itemElements)
    directFallbackElements.push(itemFallback)
  }

  try {
    await sendTranscriptOriginalCollection(event, collectionElements)
    return 'collection'
  } catch (error) {
    logSummaryMessage(`转写原文合集发送失败，已回退直接发送：${error instanceof Error ? error.message : String(error)}`, {
      level: 'warn',
      businessName: TRANSCRIPT_ORIGINAL_BUSINESS_NAME
    })

    const payload = directFallbackElements.length === 1
      ? directFallbackElements[0]
      : directFallbackElements.flatMap(item => {
        const entries = Array.isArray(item) ? item : [item]
        return entries.map(entry => typeof entry === 'string' ? segment.text(entry) : entry)
      })
    recordLongTaskCompletionAnchor(event, await event.reply(payload as string | ElementTypes | ElementTypes[]))
    return 'direct'
  }
}

export const getTranscriptOriginalConfig = () => Config.app.transcriptOriginal

const canUseTranscriptOriginalLLM = (): boolean => {
  const config = getTranscriptOriginalConfig()
  return Boolean(
    config.switch &&
    config.llm.baseUrl?.trim() &&
    config.llm.apiKey?.trim() &&
    config.llm.model?.trim()
  )
}

export const shouldTriggerTranscriptOriginal = (message: string): TranscriptOriginalRuntimeContext | null => {
  const config = getTranscriptOriginalConfig()
  if (!config.switch) return null

  const trigger = extractSummaryTrigger(message, config.keywords)
  if (!trigger || !trigger.rest) return null

  const resolvedLinks = extractSummaryResolvedLinks(trigger.rest)
  const links = filterTranscriptOriginalLinks(resolvedLinks)
  if (links.length === 0) return null

  return {
    trigger,
    shareContext: stripResolvedLinksFromMessage(trigger.rest, resolvedLinks),
    links
  }
}

export const resolveTranscriptOriginalContext = async (
  event: TranscriptOriginalReplySourceEvent
): Promise<TranscriptOriginalRuntimeContext | null> => {
  const config = getTranscriptOriginalConfig()
  if (!config.switch) return null

  const trigger = extractSummaryTrigger(String(event.msg ?? ''), config.keywords)
  if (!trigger) return null

  const directResolvedLinks = extractSummaryResolvedLinks(trigger.rest)
  const directLinks = filterTranscriptOriginalLinks(directResolvedLinks)
  if (directLinks.length > 0) {
    return {
      trigger,
      shareContext: stripResolvedLinksFromMessage(trigger.rest, directResolvedLinks),
      links: directLinks
    }
  }

  const replySourceMessage = await readReplySourceMessage(event)
  if (!replySourceMessage) return null

  const replyResolvedLinks = extractSummaryResolvedLinks(replySourceMessage)
  const replyLinks = filterTranscriptOriginalLinks(replyResolvedLinks)
  if (replyLinks.length === 0) return null

  return {
    trigger,
    shareContext: stripResolvedLinksFromMessage(trigger.rest, []),
    links: replyLinks
  }
}

export const runTranscriptOriginal = async (
  event: Message,
  context: TranscriptOriginalRuntimeContext
): Promise<TranscriptOriginalResult> => {
  const config = getTranscriptOriginalConfig()
  if (!canUseTranscriptOriginalLLM()) {
    throw new Error('转写原文已触发，但 Responses 配置不完整')
  }

  initLongTaskCompletionNotify(event, TRANSCRIPT_ORIGINAL_BUSINESS_NAME)

  const taskProgress = createSummaryTaskProgress(context.links.length, event, {
    businessName: TRANSCRIPT_ORIGINAL_BUSINESS_NAME
  })
  const inputs: SummaryInput[] = []
  const processedItems: TranscriptOriginalProcessedItem[] = []

  try {
    startSummaryProgressTimer({
      scope: 'task',
      stage: '开始转写原文整理',
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

        const enrichedInput = await resolveSummaryInputWithAsr({
          config,
          link,
          shareContext: context.shareContext,
          taskProgress,
          linkIndex: index + 1,
          onParsedPostResolved: cacheHit => {
            if (cacheHit) {
              logSummaryMessage('命中链接级解析缓存，跳过平台解析', {
                taskId: taskProgress.taskId,
                businessName: TRANSCRIPT_ORIGINAL_BUSINESS_NAME
              })
            }
          }
        })

        logSummaryProgress({
          scope: 'link',
          stage: 'ASR 数据已就绪',
          level: 'info',
          taskId: taskProgress.taskId,
          totalLinks: taskProgress.totalLinks,
          linkIndex: index + 1,
          platform: enrichedInput.platformLabel || enrichedInput.platform,
          title: enrichedInput.title
        })

        if (enrichedInput.asrTexts.length === 0) {
          logSummaryMessage('未获取到字幕 / ASR 文本，已跳过该链接', {
            taskId: taskProgress.taskId,
            level: 'warn',
            businessName: TRANSCRIPT_ORIGINAL_BUSINESS_NAME
          })
          continue
        }

        inputs.push(enrichedInput)
        const rawFallbackText = buildRawTranscriptOriginalReply(enrichedInput, config.llm.model)

        try {
          logSummaryProgress({
            scope: 'link',
            stage: 'LLM 原文整理中',
            taskId: taskProgress.taskId,
            totalLinks: taskProgress.totalLinks,
            linkIndex: index + 1,
            platform: enrichedInput.platformLabel || enrichedInput.platform,
            title: enrichedInput.title
          })
          const responseResult = await summarizeTranscriptOriginalWithResponses(config, [enrichedInput])
          const markdownText = config.markdownRender?.enabled
            ? formatTranscriptOriginalMarkdown(enrichedInput, config.llm.model, responseResult.text)
            : undefined
          const finalText = config.markdownRender?.enabled
            ? stripTranscriptOriginalMarkdownToPlainText(markdownText ?? '')
            : formatTranscriptOriginalReply(enrichedInput, config.llm.model, responseResult.text)

          logSummaryProgress({
            scope: 'link',
            stage: 'LLM 原文整理完成',
            level: 'info',
            taskId: taskProgress.taskId,
            totalLinks: taskProgress.totalLinks,
            linkIndex: index + 1,
            platform: enrichedInput.platformLabel || enrichedInput.platform,
            title: enrichedInput.title
          })

          processedItems.push({
            input: enrichedInput,
            finalText,
            markdownText,
            directFallbackText: finalText
          })
        } catch (error) {
          logSummaryMessage(`LLM 整理失败，已回退原始转写：${error instanceof Error ? error.message : String(error)}`, {
            taskId: taskProgress.taskId,
            level: 'warn',
            businessName: TRANSCRIPT_ORIGINAL_BUSINESS_NAME
          })
          processedItems.push({
            input: enrichedInput,
            finalText: rawFallbackText,
            directFallbackText: rawFallbackText
          })
        }

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
        logSummaryMessage(`单条链接处理失败，已跳过：${error instanceof Error ? error.message : String(error)}`, {
          taskId: taskProgress.taskId,
          level: 'warn',
          businessName: TRANSCRIPT_ORIGINAL_BUSINESS_NAME
        })
      }
    }

    endSummaryProgressTimer({
      scope: 'task',
      stage: '开始转写原文整理',
      taskId: taskProgress.taskId,
      totalLinks: taskProgress.totalLinks
    })

    if (processedItems.length === 0) {
      throw new Error('转写原文失败：没有可发送的字幕 / ASR 文本')
    }

    logSummaryProgress({
      scope: 'task',
      stage: '整理结果发送中',
      taskId: taskProgress.taskId,
      totalLinks: taskProgress.totalLinks
    })

    const deliveryMode = await replyTranscriptOriginal(event, config, processedItems)
    logSummaryProgress({
      scope: 'task',
      stage: deliveryMode === 'collection' ? '合集原文已发送' : '原文已发送',
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
      transcriptText: processedItems.map(item => item.finalText).join('\n\n'),
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
