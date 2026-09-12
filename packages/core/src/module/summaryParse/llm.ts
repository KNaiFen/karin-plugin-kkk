import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { karinPathTemp } from 'node-karin/root'

import type { summaryParseConfig } from '@/types/config/app'
import {
  assertSafeFileUrlWithinRoot,
  executeSafeAxiosRequest
} from '@/module/utils/OutboundRequest'
import { recordFailureTraceStep } from '@/module/utils/ErrorTrace'
import { shouldRetryLLMRequestError } from '@/module/utils/llmRetry'
import { Root } from '@/root'

import type {
  NormalizedMultimodalImage,
  SummaryInput,
  SummaryTaskProgressContext
} from './types'
import { renderSummaryInputForLLM } from './input'
import { getSummarySystemPrompt } from './prompt'
import { logSummaryMessage, logSummaryProgress } from './progress'

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
  tools?: Array<{ type: 'web_search' }>
  tool_choice?: 'required'
  reasoning?: {
    effort: NonNullable<summaryParseConfig['llm']['reasoningEffort']>
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

export class ResponsesEndpointConfigurationError extends Error {
  readonly code = 'RESPONSES_ENDPOINT_CONFIGURATION_INVALID'

  constructor (message: string) {
    super(message)
    this.name = 'ResponsesEndpointConfigurationError'
  }
}

export const buildResponsesEndpoint = (config: summaryParseConfig): string => {
  const baseUrl = String(config.llm.baseUrl ?? '').trim()
  if (!baseUrl) {
    throw new ResponsesEndpointConfigurationError('LLM Base URL 未配置，请填写支持 Responses API 的 API 基地址')
  }

  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new ResponsesEndpointConfigurationError('LLM Base URL 格式无效，应为 http:// 或 https:// 开头的 API 基地址')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ResponsesEndpointConfigurationError('LLM Base URL 仅支持 http:// 或 https:// 协议')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ResponsesEndpointConfigurationError('LLM Base URL 不能包含账号、查询参数或片段，请只填写 API 基地址')
  }

  const basePath = url.pathname.replace(/\/+$/, '')
  if (/(?:^|\/)responses$/i.test(basePath) || /(?:^|\/)chat\/completions$/i.test(basePath)) {
    throw new ResponsesEndpointConfigurationError('LLM Base URL 应填写 API 基地址（例如 https://api.example.com/v1），不要填写 /responses 或 /chat/completions 端点')
  }

  url.pathname = `${basePath || ''}/responses`
  return url.toString()
}

export const canUseSummaryLLM = (config: summaryParseConfig): boolean => {
  return Boolean(
    config.switch &&
    config.llm.baseUrl?.trim() &&
    config.llm.apiKey?.trim() &&
    config.llm.model?.trim()
  )
}

const imageMimeByExtension: Record<string, string> = {
  '.apng': 'image/apng',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
}

const detectMimeTypeFromBase64 = (base64: string): string => {
  const normalized = base64.replace(/\s+/g, '')

  if (normalized.startsWith('/9j/')) return 'image/jpeg'
  if (normalized.startsWith('iVBORw0KGgo')) return 'image/png'
  if (normalized.startsWith('R0lGOD')) return 'image/gif'
  if (normalized.startsWith('UklGR')) return 'image/webp'
  if (normalized.startsWith('PHN2Zy') || normalized.startsWith('PD94bWwg')) return 'image/svg+xml'
  if (normalized.startsWith('Qk')) return 'image/bmp'

  return 'image/jpeg'
}

const detectMimeTypeFromFilePath = (filePath: string): string => {
  const extension = path.extname(filePath).toLowerCase()
  return imageMimeByExtension[extension] ?? 'image/jpeg'
}

const detectMimeTypeFromHeaders = (headers?: Record<string, unknown>): string | undefined => {
  const contentType = headers?.['content-type'] ?? headers?.['Content-Type']
  const normalized = typeof contentType === 'string' ? contentType.trim().toLowerCase() : ''
  if (!normalized || !normalized.startsWith('image/')) return undefined
  return normalized.split(';')[0]
}

const bufferToDataUrl = (buffer: Buffer, mimeType: string): string => {
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

const summaryCacheRoot = path.resolve(`${karinPathTemp}/${Root.pluginName}/`)

const normalizeLocalFileUrlPath = (url: string): string => {
  const resolved = assertSafeFileUrlWithinRoot(url, summaryCacheRoot)
  if (/^\/[a-zA-Z]:\//.test(resolved)) {
    return path.normalize(resolved.slice(1))
  }
  return path.normalize(resolved)
}

const readRemoteImageAsDataUrl = async (url: string): Promise<string> => {
  const { response } = await executeSafeAxiosRequest({
    url,
    method: 'GET',
    responseType: 'arraybuffer',
    timeout: 15000
  }, {
    profile: 'summary-inline-image'
  })
  const mimeType = detectMimeTypeFromHeaders(response.headers as Record<string, unknown>) ?? 'image/jpeg'
  return bufferToDataUrl(Buffer.from(response.data), mimeType)
}

const normalizeImageUrlForMultimodal = async (url: string): Promise<NormalizedMultimodalImage> => {
  if (!url) {
    return {
      deliveryMode: 'skip',
      reason: 'empty-url'
    }
  }

  if (url.startsWith('data:image/')) {
    return {
      url,
      deliveryMode: 'prebuilt-data-url'
    }
  }

  if (url.startsWith('base64://')) {
    const base64 = url.slice('base64://'.length)
    return {
      url: `data:${detectMimeTypeFromBase64(base64)};base64,${base64}`,
      deliveryMode: 'base64-data-url'
    }
  }

  if (url.startsWith('file://')) {
    try {
      const filePath = normalizeLocalFileUrlPath(url)
      const buffer = await fs.promises.readFile(filePath)
      return {
        url: bufferToDataUrl(buffer, detectMimeTypeFromFilePath(filePath)),
        deliveryMode: 'file-data-url'
      }
    } catch (error) {
      return {
        deliveryMode: 'skip',
        reason: error instanceof Error ? error.message : String(error)
      }
    }
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      return {
        url: await readRemoteImageAsDataUrl(url),
        deliveryMode: 'inline-data-url'
      }
    } catch (error) {
      return {
        deliveryMode: 'skip',
        reason: error instanceof Error ? error.message : String(error)
      }
    }
  }

  return {
    deliveryMode: 'skip',
    reason: 'unsupported-url-format'
  }
}

const buildTextOnlyUserContent = (inputs: SummaryInput[]): ResponsesInputItem[] => {
  return [{
    type: 'input_text',
    text: inputs
      .map((input, index) => `内容 ${index + 1}\n${renderSummaryInputForLLM(input)}`)
      .join('\n\n---\n\n')
  }]
}

const buildMultimodalUserContent = async (
  inputs: SummaryInput[],
  task?: SummaryTaskProgressContext
): Promise<ResponsesInputItem[]> => {
  const content: ResponsesInputItem[] = []
  let imageCount = 0

  for (const [inputIndex, input] of inputs.entries()) {
    content.push({
      type: 'input_text',
      text: inputIndex === 0
        ? renderSummaryInputForLLM({ ...input, blocks: [], asrTexts: [] })
        : `\n---\n内容 ${inputIndex + 1}\n${renderSummaryInputForLLM({ ...input, blocks: [], asrTexts: [] })}`
    })

    for (const block of input.blocks) {
      if (block.type === 'text') {
        content.push({ type: 'input_text', text: block.text })
        continue
      }

      if (block.type === 'html') {
        content.push({ type: 'input_text', text: block.text ?? '图片上下文' })
        continue
      }

      if (block.type !== 'image') continue

      imageCount += 1
      const normalized = await normalizeImageUrlForMultimodal(block.url)
      if (normalized.deliveryMode === 'skip') {
        logSummaryMessage(`图片 ${imageCount} 已跳过：${normalized.reason ?? 'unknown'}；${block.url}`, {
          taskId: task?.taskId,
          level: 'warn'
        })
      } else {
        logSummaryMessage(`图片 ${imageCount} 使用 ${normalized.deliveryMode}`, {
          taskId: task?.taskId,
          level: 'debug'
        })
      }

      content.push({ type: 'input_text', text: `图片：${block.alt ?? '图片'}` })
      if (normalized.url) {
        content.push({
          type: 'input_image',
          image_url: normalized.url
        })
      }
    }

    for (const item of input.asrTexts) {
      content.push({
        type: 'input_text',
        text: `视频转写（${item.title ?? '视频'}）：${item.text}`
      })
    }

    for (const frameSet of input.videoFrames) {
      content.push({
        type: 'input_text',
        text: `视频抽帧（${frameSet.title ?? '视频'}）：共 ${frameSet.images.length} 张画面`
      })

      for (const [frameIndex, frameImage] of frameSet.images.entries()) {
        imageCount += 1
        const normalized = await normalizeImageUrlForMultimodal(frameImage.url)
        if (normalized.deliveryMode === 'skip') {
          logSummaryMessage(`图片 ${imageCount} 已跳过：${normalized.reason ?? 'unknown'}；${frameImage.url}`, {
            taskId: task?.taskId,
            level: 'warn'
          })
        } else {
          logSummaryMessage(`图片 ${imageCount} 使用 ${normalized.deliveryMode}`, {
            taskId: task?.taskId,
            level: 'debug'
          })
        }

        content.push({
          type: 'input_text',
          text: `抽帧 ${frameIndex + 1}/${frameSet.images.length}：${frameImage.alt ?? '视频画面'}`
        })
        if (normalized.url) {
          content.push({
            type: 'input_image',
            image_url: normalized.url
          })
        }
      }
    }
  }

  return content
}

const hasImageBlocks = (inputs: SummaryInput[]): boolean => {
  return inputs.some(input =>
    input.blocks.some(block => block.type === 'image') ||
    input.videoFrames.some(frameSet => frameSet.images.length > 0)
  )
}

const countImageBlocks = (inputs: SummaryInput[]): number => {
  return inputs.reduce((count, input) => (
    count +
    input.blocks.filter(block => block.type === 'image').length +
    input.videoFrames.reduce((frameCount, frameSet) => frameCount + frameSet.images.length, 0)
  ), 0)
}

const approxPayloadSize = (value: unknown): number => {
  try {
    return Buffer.byteLength(JSON.stringify(value))
  } catch {
    return 0
  }
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

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

const getTraceIdFromHeaders = (headers?: Record<string, unknown>): string | undefined => {
  const traceId = headers?.['x-siliconcloud-trace-id'] ?? headers?.['X-SiliconCloud-Trace-Id']
  return typeof traceId === 'string' && traceId.trim() ? traceId.trim() : undefined
}

const getTraceIdFromFetchHeaders = (headers?: Headers): string | undefined => {
  const traceId = headers?.get('x-siliconcloud-trace-id') ?? headers?.get('X-SiliconCloud-Trace-Id')
  return typeof traceId === 'string' && traceId.trim() ? traceId.trim() : undefined
}

const logTraceId = (traceId?: string, task?: SummaryTaskProgressContext): void => {
  if (!traceId) return
  logSummaryMessage(`LLM trace-id: ${traceId}`, {
    taskId: task?.taskId
  })
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

const buildFetchStreamError = async (
  response: Response,
  endpoint: string
): Promise<Error> => {
  const responseText = await response.text().catch(() => '')
  const detail = responseText.trim().slice(0, 500)
  const error = response.status === 404
    ? new Error(`Responses 请求失败：HTTP 404。${endpoint} 未提供 Responses API；请确认 Base URL 是 API 基地址，并确认提供方支持 POST /responses。`)
    : new Error(detail
      ? `Responses 请求失败：HTTP ${response.status} ${response.statusText} - ${detail}`
      : `Responses 请求失败：HTTP ${response.status} ${response.statusText}`)

  Object.assign(error, {
    code: response.status === 404 ? 'RESPONSES_ENDPOINT_NOT_FOUND' : undefined,
    response: {
      status: response.status,
      headers: {
        'x-siliconcloud-trace-id': getTraceIdFromFetchHeaders(response.headers)
      }
    }
  })

  return error
}

const buildResponsesPayload = async (
  config: summaryParseConfig,
  inputs: SummaryInput[],
  task?: SummaryTaskProgressContext
): Promise<ResponsesRequest> => {
  const payload: ResponsesRequest = {
    model: config.llm.model,
    stream: true,
    input: [
      {
        role: 'system',
        content: [{
          type: 'input_text',
          text: getSummarySystemPrompt(inputs, {
            webSearchEnabled: config.llm.webSearchEnabled === true
          })
        }]
      },
      {
        role: 'user',
        content: hasImageBlocks(inputs)
          ? await buildMultimodalUserContent(inputs, task)
          : buildTextOnlyUserContent(inputs)
      }
    ]
  }

  if (config.llm.webSearchEnabled) {
    payload.tools = [{ type: 'web_search' }]
    payload.tool_choice = 'required'
  }

  if (config.llm.reasoningEnabled) {
    payload.reasoning = {
      effort: config.llm.reasoningEffort ?? 'high'
    }
  }

  return payload
}

const countImageBlocksFromPayload = (payload: ResponsesRequest): number => {
  const userContent = payload.input[1]?.content
  if (!Array.isArray(userContent)) return 0
  return userContent.filter(item => item.type === 'input_image').length
}

const postSummaryRequest = async (
  config: summaryParseConfig,
  payload: ResponsesRequest,
  task?: SummaryTaskProgressContext
): Promise<string> => {
  let endpoint: string
  try {
    endpoint = buildResponsesEndpoint(config)
  } catch (error) {
    recordFailureTraceStep('summary.llm.responses.endpoint.invalid', {
      message: error instanceof Error ? error.message : String(error)
    })
    throw error
  }
  const retryCount = Math.max(0, Number(config.llm.retryCount ?? 0))
  const retryDelayMs = Math.max(0, Number(config.llm.retryDelayMs ?? 0))
  const timeoutMs = Math.max(0, Number(config.llm.timeoutMs ?? 0))
  let lastError: unknown

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    const controller = new AbortController()
    const timer = timeoutMs > 0
      ? setTimeout(() => controller.abort(new Error(`Responses 请求超时（${timeoutMs}ms）`)), timeoutMs)
      : null

    try {
      logSummaryProgress({
        scope: 'llm',
        stage: '准备请求',
        taskId: task?.taskId ?? 'unknown',
        totalLinks: task?.totalLinks,
        attempt: attempt + 1,
        totalAttempts: retryCount + 1,
        details: `model=${payload.model} images=${countImageBlocksFromPayload(payload)} approxBytes=${approxPayloadSize(payload)}`
      })
      recordFailureTraceStep('summary.llm.responses.request.start', {
        endpoint,
        attempt: attempt + 1,
        totalAttempts: retryCount + 1,
        model: payload.model
      })

      const response = await fetch(endpoint, {
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
        throw await buildFetchStreamError(response, endpoint)
      }

      if (!response.body) {
        throw new Error('Responses 流式响应无正文')
      }

      logTraceId(getTraceIdFromFetchHeaders(response.headers), task)

      const streamed = await consumeResponsesStream(response.body)
      const text = streamed.text || (streamed.response ? extractText(streamed.response) : '')

      if (!text) {
        throw new Error('LLM 返回内容为空')
      }

      return text
    } catch (error) {
      if (timer) clearTimeout(timer)
      lastError = error

      if (typeof error === 'object' && error !== null && 'response' in error) {
        const traceId = getTraceIdFromHeaders((error as { response?: { headers?: Record<string, unknown> } }).response?.headers)
        logTraceId(traceId, task)
      }

      recordFailureTraceStep('summary.llm.responses.request.error', {
        endpoint,
        attempt: attempt + 1,
        message: error instanceof Error ? error.message : String(error)
      })

      const endpointNotFound = (error as { code?: unknown })?.code === 'RESPONSES_ENDPOINT_NOT_FOUND'
      if (endpointNotFound || attempt >= retryCount || !shouldRetryLLMRequestError(error)) {
        throw error
      }

      logSummaryMessage(`LLM 请求失败，准备重试：attempt ${attempt + 1}/${retryCount + 1}，${error instanceof Error ? error.message : String(error)}，${retryDelayMs}ms 后重试`, {
        taskId: task?.taskId,
        level: 'warn'
      })
      logSummaryProgress({
        scope: 'llm',
        stage: '重试等待',
        level: 'warn',
        taskId: task?.taskId ?? 'unknown',
        totalLinks: task?.totalLinks,
        attempt: attempt + 1,
        totalAttempts: retryCount + 1,
        details: retryDelayMs > 0 ? `等待 ${retryDelayMs}ms` : '立即重试'
      })

      if (retryDelayMs > 0) {
        await sleep(retryDelayMs)
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('LLM 请求失败')
}

export const summarizeWithOpenAICompatible = async (
  config: summaryParseConfig,
  inputs: SummaryInput[],
  task?: SummaryTaskProgressContext
): Promise<string> => {
  const payload = await buildResponsesPayload(config, inputs, task)

  logSummaryProgress({
    scope: 'llm',
    stage: '开始总结',
    taskId: task?.taskId ?? 'unknown',
    totalLinks: task?.totalLinks,
    details: `model=${config.llm.model} inputs=${inputs.length} images=${countImageBlocks(inputs)} webSearch=${config.llm.webSearchEnabled ? 'on' : 'off'} reasoning=${config.llm.reasoningEnabled ? (config.llm.reasoningEffort ?? 'high') : 'off'}`
  })

  const content = await postSummaryRequest(config, payload, task)
  logSummaryProgress({
    scope: 'llm',
    stage: '总结完成',
    level: 'info',
    taskId: task?.taskId ?? 'unknown',
    totalLinks: task?.totalLinks
  })
  return content
}
