import { Readable } from 'node:stream'

import { logger } from 'node-karin'

import type { transcriptOriginalConfig } from '@/types/config/app'
import { shouldRetryLLMRequestError } from '@/module/utils/llmRetry'
import type { SummaryInput } from '../summaryParse/types'
import { getTranscriptOriginalSystemPrompt } from './prompt'
import type { TranscriptOriginalResponsesResult } from './types'

type ResponsesInputItem =
  | {
    type: 'input_text'
    text: string
  }

type ResponsesRequest = {
  model: string
  input: Array<{
    role: 'system' | 'user'
    content: ResponsesInputItem[]
  }>
  stream: true
  reasoning?: {
    effort: transcriptOriginalConfig['llm']['reasoningEffort']
  }
}

type ResponsesApiResponse = {
  output?: Array<Record<string, unknown>>
}

type ResponsesSseEvent = {
  type?: string
  delta?: string
  message?: string
  error?: {
    message?: string
  }
  response?: ResponsesApiResponse
}

type StreamedResponsesResult = {
  text: string
  response?: ResponsesApiResponse
}

const normalizeBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/+$/, '')

const buildResponsesEndpoint = (config: transcriptOriginalConfig): string => {
  return `${normalizeBaseUrl(config.llm.baseUrl || '')}/responses`
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

const renderTranscriptOriginalInputForLLM = (input: SummaryInput): string => {
  const lines: string[] = [
    `平台：${input.platformLabel}`,
    `标题：${input.title}`
  ]

  if (input.shareContext) {
    lines.push(`用户附带文案：${input.shareContext}`)
  }

  lines.push('原始字幕：')
  for (const [index, item] of input.asrTexts.entries()) {
    lines.push(`### 视频 ${index + 1}${item.title?.trim() ? `：${item.title.trim()}` : ''}`)
    lines.push(item.text)
  }

  return lines.join('\n')
}

const buildResponsesUserContent = (inputs: SummaryInput[]): ResponsesInputItem[] => {
  const content: ResponsesInputItem[] = []
  for (const [index, input] of inputs.entries()) {
    content.push({
      type: 'input_text',
      text: `内容 ${index + 1}\n${renderTranscriptOriginalInputForLLM(input)}`
    })
  }
  return content
}

const buildResponsesPayload = (
  config: transcriptOriginalConfig,
  inputs: SummaryInput[]
): ResponsesRequest => {
  const payload: ResponsesRequest = {
    model: config.llm.model,
    stream: true,
    input: [
      {
        role: 'system',
        content: [{
          type: 'input_text',
          text: getTranscriptOriginalSystemPrompt(inputs, {
            markdownOutput: config.markdownRender?.enabled === true
          })
        }]
      },
      {
        role: 'user',
        content: buildResponsesUserContent(inputs)
      }
    ]
  }

  if (config.llm.reasoningEnabled) {
    payload.reasoning = {
      effort: config.llm.reasoningEffort
    }
  }

  return payload
}

const splitSseFrames = (buffer: string): { frames: string[]; remainder: string } => {
  const frames: string[] = []
  let cursor = 0

  while (cursor < buffer.length) {
    const nextLf = buffer.indexOf('\n\n', cursor)
    const nextCrLf = buffer.indexOf('\r\n\r\n', cursor)

    let boundaryIndex = -1
    let boundaryLength = 0

    if (nextLf >= 0 && (nextCrLf < 0 || nextLf < nextCrLf)) {
      boundaryIndex = nextLf
      boundaryLength = 2
    } else if (nextCrLf >= 0) {
      boundaryIndex = nextCrLf
      boundaryLength = 4
    }

    if (boundaryIndex < 0) break

    frames.push(buffer.slice(cursor, boundaryIndex))
    cursor = boundaryIndex + boundaryLength
  }

  return {
    frames,
    remainder: buffer.slice(cursor)
  }
}

const parseSseFrame = (rawEvent: string): { event?: string; payload: string | null } => {
  let eventName: string | undefined

  const dataLines = rawEvent
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(line => {
      if (line.startsWith('event:')) {
        eventName = line.slice('event:'.length).trim()
        return false
      }
      return line.startsWith('data:')
    })
    .map(line => line.slice('data:'.length).trimStart())

  if (dataLines.length === 0) {
    return {
      event: eventName,
      payload: null
    }
  }

  const payload = dataLines.join('\n').trim()
  return {
    event: eventName,
    payload: payload || null
  }
}

const getResponsesEventErrorMessage = (event: ResponsesSseEvent, eventName?: string): string | null => {
  const explicitError = typeof event.error?.message === 'string' ? event.error.message.trim() : ''
  if (explicitError) return explicitError

  const genericMessage = typeof event.message === 'string' ? event.message.trim() : ''
  if (genericMessage && (event.type === 'error' || eventName === 'error' || event.type === 'response.failed')) {
    return genericMessage
  }

  return null
}

const extractText = (response: ResponsesApiResponse): string => {
  const parts: string[] = []

  for (const output of response.output ?? []) {
    if (!output || typeof output !== 'object' || output.type !== 'message' || !Array.isArray(output.content)) continue

    for (const item of output.content) {
      if (!item || typeof item !== 'object') continue
      if ((item as { type?: unknown }).type !== 'output_text') continue

      const text = (item as { text?: unknown }).text
      if (typeof text === 'string' && text.trim()) {
        parts.push(text.trim())
      }
    }
  }

  return parts.join('\n').trim()
}

const consumeReadableResponsesStream = async (stream: Readable): Promise<StreamedResponsesResult> => {
  let buffer = ''
  let text = ''
  let completedResponse: ResponsesApiResponse | undefined

  const consumeFrame = (rawEvent: string): '[DONE]' | void => {
    const { event, payload } = parseSseFrame(rawEvent)
    if (!payload) return
    if (payload === '[DONE]') return '[DONE]'

    let parsed: ResponsesSseEvent
    try {
      parsed = JSON.parse(payload) as ResponsesSseEvent
    } catch (error) {
      throw new Error(`Responses 流式响应解析失败：${error instanceof Error ? error.message : String(error)}`)
    }

    const errorMessage = getResponsesEventErrorMessage(parsed, event)
    if (errorMessage) {
      throw new Error(`Responses 流式响应失败：${errorMessage}`)
    }

    const eventType = parsed.type ?? event
    if (eventType === 'response.output_text.delta' && typeof parsed.delta === 'string') {
      text += parsed.delta
      return
    }

    if (eventType === 'response.completed' && parsed.response && typeof parsed.response === 'object') {
      completedResponse = parsed.response
    }
  }

  for await (const chunk of stream) {
    buffer += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)

    const { frames, remainder } = splitSseFrames(buffer)
    buffer = remainder

    for (const rawEvent of frames) {
      const result = consumeFrame(rawEvent)
      if (result === '[DONE]') {
        return {
          text: text.trim(),
          response: completedResponse
        }
      }
    }
  }

  if (buffer.trim()) {
    const { frames } = splitSseFrames(`${buffer}\n\n`)
    for (const rawEvent of frames) {
      const result = consumeFrame(rawEvent)
      if (result === '[DONE]') break
    }
  }

  return {
    text: text.trim(),
    response: completedResponse
  }
}

const consumeResponsesStream = async (stream: unknown): Promise<StreamedResponsesResult> => {
  if (stream instanceof Readable) {
    return consumeReadableResponsesStream(stream)
  }

  if (
    typeof stream === 'object' &&
    stream !== null &&
    'getReader' in stream &&
    typeof (stream as ReadableStream<Uint8Array>).getReader === 'function'
  ) {
    const reader = (stream as ReadableStream<Uint8Array>).getReader()
    const nodeStream = Readable.from((async function * () {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) yield Buffer.from(value)
        }
      } finally {
        reader.releaseLock()
      }
    })())

    return consumeReadableResponsesStream(nodeStream)
  }

  throw new Error('Responses 流式响应无效')
}

const buildFetchStreamError = async (response: Response): Promise<Error> => {
  const responseText = await response.text().catch(() => '')
  const detail = responseText.trim().slice(0, 500)

  return new Error(detail
    ? `Responses 请求失败：HTTP ${response.status} ${response.statusText} - ${detail}`
    : `Responses 请求失败：HTTP ${response.status} ${response.statusText}`)
}

const postResponsesRequest = async (
  config: transcriptOriginalConfig,
  payload: ResponsesRequest
): Promise<StreamedResponsesResult> => {
  const retryCount = Math.max(0, Number(config.llm.retryCount ?? 0))
  const retryDelayMs = Math.max(0, Number(config.llm.retryDelayMs ?? 0))
  const timeoutMs = Math.max(0, Number(config.llm.timeoutMs ?? 0))

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    const controller = new AbortController()
    const timer = timeoutMs > 0
      ? setTimeout(() => controller.abort(new Error(`Responses 请求超时（${timeoutMs}ms）`)), timeoutMs)
      : null

    try {
      const response = await fetch(buildResponsesEndpoint(config), {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.llm.apiKey}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      })

      if (timer) clearTimeout(timer)

      if (!response.ok) {
        throw await buildFetchStreamError(response)
      }

      if (!response.body) {
        throw new Error('Responses 流式响应无正文')
      }

      return await consumeResponsesStream(response.body)
    } catch (error) {
      if (timer) clearTimeout(timer)

      if (attempt >= retryCount || !shouldRetryLLMRequestError(error)) {
        throw error
      }

      logger.warn(`转写原文 Responses 请求失败，准备重试：${error instanceof Error ? error.message : String(error)}`)
      if (retryDelayMs > 0) {
        await sleep(retryDelayMs)
      }
    }
  }

  throw new Error('Responses 请求失败')
}

export const summarizeTranscriptOriginalWithResponses = async (
  config: transcriptOriginalConfig,
  inputs: SummaryInput[]
): Promise<TranscriptOriginalResponsesResult> => {
  const payload = buildResponsesPayload(config, inputs)
  const streamed = await postResponsesRequest(config, payload)

  const text = streamed.text || (streamed.response ? extractText(streamed.response) : '')

  if (!text) {
    throw new Error('转写原文失败：Responses 返回内容为空')
  }

  return {
    text
  }
}
