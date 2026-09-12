import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'

import { logger } from 'node-karin'
import { karinPathTemp } from 'node-karin/root'

import type { detailedSummaryParseConfig } from '@/types/config/app'
import { assertSafeFileUrlWithinRoot } from '@/module/utils/OutboundRequest'
import { shouldRetryLLMRequestError } from '@/module/utils/llmRetry'
import { Root } from '@/root'

import { renderSummaryInputForLLM } from '../summaryParse/input'
import type { SummaryInput } from '../summaryParse/types'
import { getDetailedSummarySystemPrompt } from './prompt'
import type { DetailedSummaryResponsesResult, DetailedSummarySource } from './types'

type ResponsesInputItem =
  | {
    type: 'input_text'
    text: string
  }
  | {
    type: 'input_image'
    image_url: string
  }

type ResponsesRequest = {
  model: string
  input: Array<{
    role: 'system' | 'user'
    content: ResponsesInputItem[]
  }>
  stream: true
  include: string[]
  tools?: Array<{ type: 'web_search' }>
  tool_choice?: 'required'
  reasoning?: {
    effort: detailedSummaryParseConfig['llm']['reasoningEffort']
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

const buildResponsesEndpoint = (config: detailedSummaryParseConfig): string => {
  return `${normalizeBaseUrl(config.llm.baseUrl || '')}/responses`
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

const detectMimeTypeFromBase64 = (base64: string): string => {
  const normalized = base64.replace(/\s+/g, '')

  if (normalized.startsWith('/9j/')) return 'image/jpeg'
  if (normalized.startsWith('iVBORw0KGgo')) return 'image/png'
  if (normalized.startsWith('R0lGOD')) return 'image/gif'
  if (normalized.startsWith('UklGR')) return 'image/webp'

  return 'image/jpeg'
}

const imageMimeByExtension: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
}

const bufferToDataUrl = (buffer: Buffer, mimeType: string): string => {
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

const detailedSummaryCacheRoot = path.resolve(`${karinPathTemp}/${Root.pluginName}/`)

const normalizeLocalFileUrlPath = (url: string): string => {
  const resolved = assertSafeFileUrlWithinRoot(url, detailedSummaryCacheRoot)
  if (/^\/[a-zA-Z]:\//.test(resolved)) {
    return path.normalize(resolved.slice(1))
  }
  return path.normalize(resolved)
}

const normalizeImageUrl = async (url: string): Promise<string | null> => {
  if (!url) return null
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/')) {
    return url
  }
  if (url.startsWith('base64://')) {
    const base64 = url.slice('base64://'.length)
    return `data:${detectMimeTypeFromBase64(base64)};base64,${base64}`
  }
  if (url.startsWith('file://')) {
    const filePath = normalizeLocalFileUrlPath(url)
    const buffer = await fs.promises.readFile(filePath)
    const mimeType = imageMimeByExtension[path.extname(filePath).toLowerCase()] ?? 'image/jpeg'
    return bufferToDataUrl(buffer, mimeType)
  }
  return null
}

const buildResponsesUserContent = async (inputs: SummaryInput[]): Promise<ResponsesInputItem[]> => {
  const content: ResponsesInputItem[] = []

  for (const [index, input] of inputs.entries()) {
    content.push({
      type: 'input_text',
      text: `内容 ${index + 1}\n${renderSummaryInputForLLM(input)}`
    })

    for (const block of input.blocks) {
      if (block.type !== 'image') continue
      const imageUrl = await normalizeImageUrl(block.url)
      if (!imageUrl) continue
      content.push({
        type: 'input_text',
        text: `配图：${block.alt ?? '图片'}`
      })
      content.push({
        type: 'input_image',
        image_url: imageUrl
      })
    }

    for (const frameSet of input.videoFrames) {
      content.push({
        type: 'input_text',
        text: `视频抽帧（${frameSet.title ?? '视频'}）：共 ${frameSet.images.length} 张`
      })

      for (const frameImage of frameSet.images) {
        const imageUrl = await normalizeImageUrl(frameImage.url)
        if (!imageUrl) continue
        content.push({
          type: 'input_text',
          text: `抽帧：${frameImage.alt ?? '视频画面'}`
        })
        content.push({
          type: 'input_image',
          image_url: imageUrl
        })
      }
    }
  }

  return content
}

const buildResponsesPayload = async (
  config: detailedSummaryParseConfig,
  inputs: SummaryInput[]
): Promise<ResponsesRequest> => {
  const payload: ResponsesRequest = {
    model: config.llm.model,
    stream: true,
    input: [
      {
        role: 'system',
        content: [{
          type: 'input_text',
          text: getDetailedSummarySystemPrompt(inputs, {
            markdownOutput: config.markdownRender?.enabled === true
          })
        }]
      },
      {
        role: 'user',
        content: await buildResponsesUserContent(inputs)
      }
    ],
    include: ['web_search_call.action.sources']
  }

  if (config.llm.webSearchEnabled) {
    payload.tools = [{ type: 'web_search' }]
    payload.tool_choice = 'required'
  }

  if (config.llm.reasoningEnabled) {
    payload.reasoning = {
      effort: config.llm.reasoningEffort
    }
  }

  return payload
}

const buildSource = (value: unknown): DetailedSummarySource | null => {
  if (!value || typeof value !== 'object') return null

  const source = value as { title?: unknown; url?: unknown }
  const url = typeof source.url === 'string' ? source.url.trim() : ''
  if (!url) return null

  try {
    const parsed = new URL(url)
    return {
      title: typeof source.title === 'string' && source.title.trim() ? source.title.trim() : undefined,
      url,
      domain: parsed.hostname
    }
  } catch {
    return {
      title: typeof source.title === 'string' && source.title.trim() ? source.title.trim() : undefined,
      url,
      domain: ''
    }
  }
}

const extractSourcesFromAnnotations = (output: Record<string, unknown>): DetailedSummarySource[] => {
  if (output.type !== 'message' || !Array.isArray(output.content)) return []

  const result: DetailedSummarySource[] = []
  for (const item of output.content) {
    if (!item || typeof item !== 'object') continue
    const annotations = Array.isArray((item as { annotations?: unknown[] }).annotations)
      ? (item as { annotations: unknown[] }).annotations
      : []

    for (const annotation of annotations) {
      const source = buildSource(annotation)
      if (source) result.push(source)
    }
  }

  return result
}

const extractSourcesFromWebSearchCalls = (output: Record<string, unknown>): DetailedSummarySource[] => {
  if (output.type !== 'web_search_call') return []

  const sources = Array.isArray((output as { action?: { sources?: unknown[] } }).action?.sources)
    ? (output as { action: { sources: unknown[] } }).action.sources
    : []

  return sources
    .map(source => buildSource(source))
    .filter((source): source is DetailedSummarySource => Boolean(source))
}

const dedupeSources = (sources: DetailedSummarySource[]): DetailedSummarySource[] => {
  const seen = new Set<string>()
  const result: DetailedSummarySource[] = []

  for (const source of sources) {
    if (seen.has(source.url)) continue
    seen.add(source.url)
    result.push(source)
  }

  return result
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

const consumeWebResponsesStream = async (stream: ReadableStream<Uint8Array>): Promise<StreamedResponsesResult> => {
  const reader = stream.getReader()
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
    return consumeWebResponsesStream(stream as ReadableStream<Uint8Array>)
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

const extractSources = (response: ResponsesApiResponse): DetailedSummarySource[] => {
  return dedupeSources(
    (response.output ?? []).flatMap(output => {
      if (!output || typeof output !== 'object') return []
      return [
        ...extractSourcesFromAnnotations(output),
        ...extractSourcesFromWebSearchCalls(output)
      ]
    })
  )
}

const postResponsesRequest = async (
  config: detailedSummaryParseConfig,
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

      logger.warn(`详细解析总结 Responses 请求失败，准备重试：${error instanceof Error ? error.message : String(error)}`)
      if (retryDelayMs > 0) {
        await sleep(retryDelayMs)
      }
    }
  }

  throw new Error('Responses 请求失败')
}

export const summarizeWithOpenAIResponses = async (
  config: detailedSummaryParseConfig,
  inputs: SummaryInput[]
): Promise<DetailedSummaryResponsesResult> => {
  const payload = await buildResponsesPayload(config, inputs)
  const streamed = await postResponsesRequest(config, payload)
  const response = streamed.response
  const text = streamed.text || (response ? extractText(response) : '')

  if (!text) {
    throw new Error('详细解析总结失败：Responses 返回内容为空')
  }

  return {
    text,
    sources: response ? extractSources(response) : []
  }
}
