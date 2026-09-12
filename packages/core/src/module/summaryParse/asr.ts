import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import axios from 'node-karin/axios'
import type { AxiosHeaders, RawAxiosRequestHeaders } from 'node-karin/axios'

import { Common } from '@/module'
import { getMediaDuration } from '@/module/utils'
import {
  assertPathWithinRoot,
  executeSafeAxiosRequest
} from '@/module/utils/OutboundRequest'

import type { summaryParseConfig } from '@/types/config/app'

import {
  endSummaryProgressTimer,
  logSummaryMessage,
  logSummaryProgress,
  startSummaryProgressTimer
} from './progress'
import {
  createFfmpegProgressParser,
  createSummaryCliActivity,
  extractProgressPercentFromText,
  renderSummaryCliProgress
} from './cliProgress'
import {
  resolveBilibiliVideoCid,
  resolveBilibiliVideoPage
} from './bilibiliVideoIdentity'
import type { SummaryInput, SummaryLinkProgressContext } from './types'

type ExecInvocation = {
  file: string
  args: string[]
}

type ExecStreamHandlers = {
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
}

type ExecRunner = (
  invocation: ExecInvocation,
  handlers?: ExecStreamHandlers
) => Promise<{ stdout: string; stderr: string }>

type SubtitleReference = NonNullable<SummaryInput['videos'][number]['subtitles']>[number]

type SummaryDownloadSource = {
  type: 'audio' | 'video'
  url: string
  backupUrls: string[]
  label: string
  sourceMode?: 'parsed_content' | 'summary_optimized'
}

type AsrProviderAvailability = {
  cloudAvailable: boolean
  localAvailable: boolean
  sharedIssues: string[]
  localIssues: string[]
}

type ChineseTextConverter = (input: string) => Promise<string>

type NormalizedVideoFrameConfig = {
  minIntervalSeconds: number
  maxImages: number
  skipStartSeconds: number
  skipEndSeconds: number
  sourceMode: 'parsed_content' | 'summary_optimized'
}

const transientErrorPattern = /ECONNRESET|ETIMEDOUT|ECONNABORTED|timeout|network|socket|fetch failed|temporary|502|503|504/i
const textCacheVersion = 'summary-parse-text-cache-v3'
const mediaCacheVersion = 'summary-parse-media-cache-v3'

const traditionalPhraseFallbackPairs: Array<[string, string]> = [
  ['帶著', '带着'],
  ['看著', '看着'],
  ['聽著', '听着'],
  ['說著', '说着'],
  ['接著', '接着'],
  ['跟著', '跟着'],
  ['沿著', '沿着'],
  ['拿著', '拿着'],
  ['想著', '想着'],
  ['寫著', '写着'],
  ['等著', '等着'],
  ['朝著', '朝着'],
  ['隨著', '随着'],
  ['瞭解', '了解']
]

const traditionalCharFallbackMap = new Map<string, string>([
  ['這', '这'],
  ['個', '个'],
  ['為', '为'],
  ['與', '与'],
  ['雲', '云'],
  ['點', '点'],
  ['電', '电'],
  ['後', '后'],
  ['臺', '台'],
  ['灣', '湾'],
  ['裡', '里'],
  ['還', '还'],
  ['顯', '显'],
  ['畫', '画'],
  ['資', '资'],
  ['訊', '讯'],
  ['識', '识'],
  ['結', '结'],
  ['轉', '转'],
  ['寫', '写'],
  ['話', '话'],
  ['說', '说'],
  ['開', '开'],
  ['關', '关'],
  ['讓', '让'],
  ['對', '对'],
  ['時', '时'],
  ['間', '间'],
  ['國', '国'],
  ['體', '体'],
  ['學', '学'],
  ['習', '习'],
  ['視', '视'],
  ['聽', '听'],
  ['網', '网'],
  ['頁', '页'],
  ['見', '见'],
  ['發', '发'],
  ['錄', '录'],
  ['聲', '声'],
  ['長', '长'],
  ['門', '门'],
  ['問', '问'],
  ['題', '题'],
  ['聯', '联'],
  ['線', '线'],
  ['標', '标'],
  ['準', '准'],
  ['規', '规'],
  ['劃', '划'],
  ['彙', '汇'],
  ['據', '据'],
  ['軟', '软'],
  ['觀', '观'],
  ['頭', '头'],
  ['親', '亲'],
  ['處', '处'],
  ['優', '优'],
  ['確', '确'],
  ['認', '认'],
  ['極', '极'],
  ['錢', '钱'],
  ['將', '将'],
  ['從', '从'],
  ['進', '进'],
  ['來', '来'],
  ['氣', '气'],
  ['鐘', '钟'],
  ['飛', '飞'],
  ['過', '过'],
  ['無', '无'],
  ['試', '试'],
  ['驗', '验'],
  ['當', '当'],
  ['產', '产'],
  ['麼', '么'],
  ['應', '应'],
  ['經', '经'],
  ['業', '业'],
  ['實', '实'],
  ['錯', '错'],
  ['誤', '误'],
  ['輸', '输'],
  ['節', '节'],
  ['變', '变'],
  ['圖', '图'],
  ['樣', '样'],
  ['價', '价'],
  ['們', '们'],
  ['亞', '亚'],
  ['馬', '马'],
  ['車', '车'],
  ['買', '买'],
  ['賣', '卖'],
  ['費', '费'],
  ['預', '预'],
  ['備', '备'],
  ['燈', '灯'],
  ['濟', '济'],
  ['壓', '压'],
  ['覺', '觉'],
  ['較', '较'],
  ['釋', '释'],
  ['負', '负'],
  ['額', '额'],
  ['務', '务'],
  ['動', '动'],
  ['帶', '带'],
  ['會', '会'],
  ['樂', '乐'],
  ['簡', '简'],
  ['複', '复'],
  ['術', '术'],
  ['總', '总'],
  ['廣', '广'],
  ['級', '级'],
  ['衛', '卫'],
  ['區', '区']
])

const traditionalCharFallbackPattern = new RegExp(
  `[${Array.from(traditionalCharFallbackMap.keys()).join('')}]`,
  'g'
)

let chineseTextConverterPromise: Promise<ChineseTextConverter | null> | null = null
const importOptionalModule = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<unknown>

const execFileCommand = async (
  invocation: ExecInvocation,
  handlers?: ExecStreamHandlers
): Promise<{ stdout: string; stderr: string }> => {
  if (!handlers?.onStdout && !handlers?.onStderr) {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execFileAsync = promisify(execFile)
    return await execFileAsync(invocation.file, invocation.args)
  }

  const { spawn } = await import('node:child_process')

  return await new Promise((resolve, reject) => {
    const child = spawn(invocation.file, invocation.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      windowsHide: true
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', chunk => {
      const text = chunk.toString()
      stdout += text
      handlers?.onStdout?.(text)
    })

    child.stderr?.on('data', chunk => {
      const text = chunk.toString()
      stderr += text
      handlers?.onStderr?.(text)
    })

    child.on('error', error => {
      Object.assign(error, {
        stdout,
        stderr
      })
      reject(error)
    })

    child.on('close', code => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }

      const error = new Error(`Command failed with exit code ${code}: ${invocation.file}`)
      Object.assign(error, {
        code,
        stdout,
        stderr
      })
      reject(error)
    })
  })
}

const fileExists = (value: string): boolean => {
  try {
    return fs.existsSync(value)
  } catch {
    return false
  }
}

const toDownloadHeaders = (
  headers: Record<string, unknown> | undefined
): AxiosHeaders | (RawAxiosRequestHeaders & Record<string, unknown>) | undefined => {
  if (!headers) return undefined
  return headers as AxiosHeaders | (RawAxiosRequestHeaders & Record<string, unknown>)
}

const normalizeBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/+$/, '')

const audioMimeByExtension: Record<string, string> = {
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav'
}

const wrapTextConverter = (
  candidate: unknown
): ChineseTextConverter | null => {
  if (typeof candidate !== 'function') return null
  return async (input: string) => {
    const converted = await (candidate as (value: string) => unknown)(input)
    return typeof converted === 'string' ? converted : input
  }
}

const createConverterFromFactory = (
  factory: unknown
): ChineseTextConverter | null => {
  if (typeof factory !== 'function') return null

  const attempts: Array<() => unknown> = [
    () => (factory as (options: { from: string; to: string }) => unknown)({ from: 'tw', to: 'cn' }),
    () => (factory as (options: { from: string; to: string }) => unknown)({ from: 't', to: 's' }),
    () => (factory as (from: string, to: string) => unknown)('tw', 'cn'),
    () => (factory as (from: string, to: string) => unknown)('t', 's')
  ]

  for (const attempt of attempts) {
    try {
      const converter = wrapTextConverter(attempt())
      if (converter) return converter
    } catch {
      // noop
    }
  }

  return null
}

const loadChineseTextConverter = async (): Promise<ChineseTextConverter | null> => {
  if (!chineseTextConverterPromise) {
    chineseTextConverterPromise = (async () => {
      try {
        const loaded = await importOptionalModule('opencc-js').catch(() => null) as Record<string, unknown> | null
        if (!loaded) return null

        const directCandidates = [
          loaded.t2s,
          loaded.toSimplified,
          loaded.traditionalToSimplified,
          typeof loaded.default === 'function' ? loaded.default : null,
          typeof loaded.default === 'object' && loaded.default !== null
            ? (loaded.default as Record<string, unknown>).t2s
            : null
        ]

        for (const candidate of directCandidates) {
          const converter = wrapTextConverter(candidate)
          if (converter) return converter
        }

        const factoryCandidates = [
          loaded.Converter,
          typeof loaded.default === 'object' && loaded.default !== null
            ? (loaded.default as Record<string, unknown>).Converter
            : null,
          loaded.OpenCC && typeof loaded.OpenCC === 'object'
            ? (loaded.OpenCC as Record<string, unknown>).Converter
            : null
        ]

        for (const candidate of factoryCandidates) {
          const converter = createConverterFromFactory(candidate)
          if (converter) return converter
        }
      } catch (error) {
        logSummaryMessage(`加载 opencc-js 失败，将使用内置繁转简回退：${error instanceof Error ? error.message : String(error)}`, {
          level: 'debug'
        })
      }

      return null
    })()
  }

  return await chineseTextConverterPromise
}

const fallbackTraditionalToSimplified = (input: string): string => {
  let output = input
  for (const [from, to] of traditionalPhraseFallbackPairs) {
    output = output.replaceAll(from, to)
  }
  return output.replace(traditionalCharFallbackPattern, char => traditionalCharFallbackMap.get(char) ?? char)
}

const normalizeChineseTextForCache = async (input: string): Promise<string> => {
  const source = String(input ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!source) return ''

  let output = source
  const converter = await loadChineseTextConverter()
  if (converter) {
    try {
      output = String(await converter(source) ?? source)
    } catch (error) {
      logSummaryMessage(`opencc-js 转简体失败，将使用内置回退：${error instanceof Error ? error.message : String(error)}`, {
        level: 'debug'
      })
      output = source
    }
  }

  return fallbackTraditionalToSimplified(output)
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const buildCloudTranscriptionEndpoint = (config: summaryParseConfig): string => {
  return `${normalizeBaseUrl(config.asr.cloud.baseUrl || '')}/audio/transcriptions`
}

const canUseCloudAsr = (config: summaryParseConfig): boolean => {
  return Boolean(
    config.switch &&
    config.asr.cloud.baseUrl?.trim() &&
    config.asr.cloud.apiKey?.trim() &&
    config.asr.cloud.model?.trim()
  )
}

const canUseLocalAsr = (config: summaryParseConfig): boolean => {
  return Boolean(
    config.switch &&
    config.asr.whisperCppPath?.trim() &&
    config.asr.modelPath?.trim()
  )
}

export const canUseAsr = (config: summaryParseConfig): boolean => {
  return canUseCloudAsr(config) || canUseLocalAsr(config)
}

const isBareCommand = (value: string): boolean => {
  return Boolean(value && !/[\\/]/.test(value) && path.basename(value) === value)
}

const collectSharedAsrPrerequisiteErrors = (config: summaryParseConfig): string[] => {
  if (!canUseCloudAsr(config) && !canUseLocalAsr(config)) return []

  const errors: string[] = []
  const ffmpegPath = String(config.asr.ffmpegPath ?? '').trim()
  if (!ffmpegPath) {
    errors.push('ffmpeg 可执行文件未配置')
  } else if (!isBareCommand(ffmpegPath) && !fileExists(ffmpegPath)) {
    errors.push(`ffmpeg 可执行文件不存在：${config.asr.ffmpegPath}`)
  }

  return errors
}

const collectLocalAsrPrerequisiteErrors = (config: summaryParseConfig): string[] => {
  if (!canUseLocalAsr(config)) return []

  const errors: string[] = []
  if (!fileExists(config.asr.whisperCppPath)) {
    errors.push(`whisper.cpp 可执行文件不存在：${config.asr.whisperCppPath}`)
  }
  if (!fileExists(config.asr.modelPath)) {
    errors.push(`whisper.cpp 模型文件不存在：${config.asr.modelPath}`)
  }

  return errors
}

export const checkSummaryAsrAvailability = (config: summaryParseConfig): { ok: boolean; issues: string[] } => {
  const issues = [
    ...collectSharedAsrPrerequisiteErrors(config),
    ...collectLocalAsrPrerequisiteErrors(config)
  ]

  return {
    ok: issues.length === 0,
    issues
  }
}

const resolveAsrProviderAvailability = (config: summaryParseConfig): AsrProviderAvailability => {
  const sharedIssues = collectSharedAsrPrerequisiteErrors(config)
  const localIssues = collectLocalAsrPrerequisiteErrors(config)

  return {
    cloudAvailable: canUseCloudAsr(config) && sharedIssues.length === 0,
    localAvailable: canUseLocalAsr(config) && sharedIssues.length === 0 && localIssues.length === 0,
    sharedIssues,
    localIssues
  }
}

const cleanupTempFiles = (paths: string[]): void => {
  for (const item of paths) {
    try {
      if (fileExists(item)) fs.unlinkSync(item)
    } catch {
      // noop
    }
  }
}

const shouldRetryCloudAsrError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error)
  const status = typeof error === 'object' && error !== null && 'response' in error
    ? Number((error as { response?: { status?: number } }).response?.status ?? 0)
    : 0

  if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return false
  }

  return transientErrorPattern.test(message) || status >= 500 || status === 408 || status === 429
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

const summarizeExecInvocation = (invocation: ExecInvocation): string => {
  const file = path.basename(invocation.file)
  const args = invocation.args.slice(0, 8).join(' ')
  return `${file} ${args}`.trim()
}

const buildExecErrorSummary = (error: unknown, invocation: ExecInvocation): string => {
  const message = error instanceof Error ? error.message : String(error)
  const stderr = typeof error === 'object' && error !== null && 'stderr' in error
    ? String((error as { stderr?: unknown }).stderr ?? '')
    : ''
  const stderrTail = stderr.trim().split(/\r?\n/).slice(-3).join(' | ')
  return [
    `命令=${summarizeExecInvocation(invocation)}`,
    message,
    stderrTail ? `stderr=${stderrTail}` : ''
  ].filter(Boolean).join('；')
}

const parseSubtitlePayloadToText = (payload: string): string => {
  const source = payload.trim()
  if (!source) return ''

  try {
    const parsed = JSON.parse(source) as { body?: Array<{ content?: string }> }
    if (Array.isArray(parsed.body)) {
      return parsed.body
        .map(item => String(item?.content ?? '').trim())
        .filter(Boolean)
        .join('\n')
        .trim()
    }
  } catch {
    // noop
  }

  return source
}

const normalizeCacheString = (value: unknown): string => {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

const normalizePrimitiveForCache = (value: unknown): string | number | boolean | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return value
  return normalizeCacheString(value)
}

const normalizeStructuredValueForCache = (value: unknown, depth = 0): unknown => {
  if (depth >= 4) {
    return normalizePrimitiveForCache(value)
  }

  if (Array.isArray(value)) {
    return value.map(item => normalizeStructuredValueForCache(item, depth + 1))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, normalizeStructuredValueForCache(nestedValue, depth + 1)])
    )
  }

  return normalizePrimitiveForCache(value)
}

const stableCacheStringify = (value: unknown): string => {
  return JSON.stringify(normalizeStructuredValueForCache(value))
}

const buildCacheHash = (
  version: string,
  kind: string,
  payload: unknown
): string => {
  return createHash('sha1')
    .update(version)
    .update(kind)
    .update(stableCacheStringify(payload))
    .digest('hex')
}

const normalizeUrlForCacheKey = (value: string | undefined): string => {
  const normalized = String(value ?? '').trim()
  if (!normalized) return ''

  try {
    const parsed = new URL(normalized)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return normalized.split('#')[0].split('?')[0]
  }
}

const normalizeMediaLocatorForCacheKey = (value: string | undefined): string => {
  const normalized = String(value ?? '').trim()
  if (!normalized) return ''

  try {
    const parsed = new URL(normalized)
    const pathname = parsed.pathname.replace(/\/{2,}/g, '/')
    const basename = path.posix.basename(pathname)
    if (basename && basename !== '/' && basename !== '.') {
      return basename
    }
    return pathname || normalizeUrlForCacheKey(normalized)
  } catch {
    const sanitized = normalized.split('#')[0].split('?')[0]
    const basename = path.basename(sanitized)
    return basename && basename !== '.' ? basename : sanitized
  }
}

const normalizeUrlListForCacheKey = (values: Array<string | undefined> | undefined): string[] => {
  return [...new Set(
    (values ?? [])
      .map(item => normalizeMediaLocatorForCacheKey(item))
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right))
}

const extractExtensionFromUrl = (value: string | undefined): string => {
  const normalized = String(value ?? '').trim()
  if (!normalized) return ''

  try {
    return path.extname(new URL(normalized).pathname).toLowerCase()
  } catch {
    return path.extname(normalized.split('#')[0].split('?')[0]).toLowerCase()
  }
}

const sanitizeCacheExtension = (value: string, fallback: string): string => {
  if (!value) return fallback
  return /^\.[a-z0-9]{1,8}$/i.test(value) ? value.toLowerCase() : fallback
}

const normalizeRawIdDataForCache = (
  platform: SummaryInput['platform'],
  rawIdData: unknown
): unknown => {
  if (!rawIdData || typeof rawIdData !== 'object') {
    return normalizeStructuredValueForCache(rawIdData)
  }

  if (platform !== 'bilibili') {
    return normalizeStructuredValueForCache(rawIdData)
  }

  const source = rawIdData as Record<string, unknown>
  const normalized: Record<string, unknown> = { ...source }

  if (normalized.type === 'one_video') {
    const page = Number(normalized.p ?? 1)
    normalized.p = Number.isFinite(page) && page > 1 ? page : 1
  }

  return normalizeStructuredValueForCache(normalized)
}

const buildVideoCacheIdentity = (
  input: SummaryInput,
  video: SummaryInput['videos'][number],
  videoIndex: number
) => {
  const rawIdData = input.rawSource.raw?.idData
    ? normalizeRawIdDataForCache(input.platform, input.rawSource.raw.idData)
    : null
  const bilibiliSelectedPage = input.platform === 'bilibili'
    ? resolveBilibiliVideoPage(input.rawSource.raw?.idData)
    : 0
  const bilibiliSelectedCid = input.platform === 'bilibili'
    ? resolveBilibiliVideoCid({
      idData: input.rawSource.raw?.idData,
      detail: input.rawSource.raw?.detail,
      selectedCid: input.rawSource.raw?.selectedCid
    })
    : 0

  return {
    platform: input.platform,
    subtype: input.rawSource.subtype,
    postUrl: normalizeUrlForCacheKey(input.rawSource.url),
    rawIdData,
    bilibiliSelectedPage,
    bilibiliSelectedCid,
    videoIndex,
    durationSeconds: video.durationSeconds ?? 0,
    videoLocator: normalizeMediaLocatorForCacheKey(video.url),
    audioLocator: normalizeMediaLocatorForCacheKey(video.audioUrl ?? ''),
    audioBackupLocators: normalizeUrlListForCacheKey(video.audioBackupUrls),
    asrSourceType: video.asrSourceType ?? '',
    asrSourceLocator: normalizeMediaLocatorForCacheKey(video.asrSourceUrl ?? ''),
    asrSourceBackupLocators: normalizeUrlListForCacheKey(video.asrSourceBackupUrls),
    backupLocators: normalizeUrlListForCacheKey(video.backupUrls),
    subtitleLocators: normalizeUrlListForCacheKey((video.subtitles ?? []).map(subtitle => subtitle.url))
  }
}

const buildAsrDownloadSourceCacheIdentity = (
  input: SummaryInput,
  video: SummaryInput['videos'][number],
  videoIndex: number
) => {
  return buildDownloadSourceCacheIdentity(input, video, videoIndex, resolveAsrDownloadSource(video))
}

const buildDownloadSourceCacheIdentity = (
  input: SummaryInput,
  video: SummaryInput['videos'][number],
  videoIndex: number,
  source: SummaryDownloadSource
) => {
  return {
    video: buildVideoCacheIdentity(input, video, videoIndex),
    sourceType: source.type,
    sourceLocator: normalizeMediaLocatorForCacheKey(source.url),
    sourceBackupLocators: normalizeUrlListForCacheKey(source.backupUrls)
  }
}

const resolveAsrDownloadSource = (
  video: SummaryInput['videos'][number]
): SummaryDownloadSource => {
  if (video.asrSourceUrl?.trim()) {
    return {
      type: video.asrSourceType === 'audio' ? 'audio' : 'video',
      url: video.asrSourceUrl.trim(),
      backupUrls: [...(video.asrSourceBackupUrls ?? [])],
      label: video.asrSourceType === 'audio' ? '音频流' : '低体积视频流'
    }
  }

  if (video.audioUrl?.trim()) {
    return {
      type: 'audio',
      url: video.audioUrl.trim(),
      backupUrls: [...(video.audioBackupUrls ?? video.backupUrls ?? [])],
      label: '音频流'
    }
  }

  return {
    type: 'video',
    url: video.url,
    backupUrls: [...(video.backupUrls ?? [])],
    label: '默认视频流'
  }
}

const isVideoFrameEnabled = (config: summaryParseConfig): boolean => {
  return Boolean(config.switch && config.asr.videoFrames?.enabled)
}

const normalizeVideoFrameConfig = (
  config: summaryParseConfig
): NormalizedVideoFrameConfig | null => {
  if (!isVideoFrameEnabled(config)) return null

  const configuredSourceMode = config.sendParsedContent
    ? 'parsed_content'
    : (config.asr.videoFrames?.sourceMode ?? 'auto')

  return {
    minIntervalSeconds: Math.max(1, Number(config.asr.videoFrames?.minIntervalSeconds ?? 30)),
    maxImages: Math.max(1, Number(config.asr.videoFrames?.maxImages ?? 6)),
    skipStartSeconds: Math.max(0, Number(config.asr.videoFrames?.skipStartSeconds ?? 3)),
    skipEndSeconds: Math.max(0, Number(config.asr.videoFrames?.skipEndSeconds ?? 3)),
    sourceMode: configuredSourceMode === 'parsed_content'
      ? 'parsed_content'
      : 'summary_optimized'
  }
}

const resolveFrameDownloadSource = (
  video: SummaryInput['videos'][number],
  config: summaryParseConfig
): SummaryDownloadSource | null => {
  const frameConfig = normalizeVideoFrameConfig(config)
  if (!frameConfig) return null

  const preferredSourceMode = frameConfig.sourceMode
  const explicitVideoUrl = video.url?.trim()
  const optimizedVideoUrl = video.asrSourceType !== 'audio'
    ? video.asrSourceUrl?.trim()
    : ''

  if (preferredSourceMode === 'summary_optimized' && optimizedVideoUrl) {
    return {
      type: 'video',
      url: optimizedVideoUrl,
      backupUrls: [...(video.asrSourceBackupUrls ?? [])],
      label: '最小体积视频流',
      sourceMode: 'summary_optimized'
    }
  }

  if (explicitVideoUrl) {
    return {
      type: 'video',
      url: explicitVideoUrl,
      backupUrls: [...(video.backupUrls ?? [])],
      label: '正常解析质量视频流',
      sourceMode: 'parsed_content'
    }
  }

  if (optimizedVideoUrl) {
    return {
      type: 'video',
      url: optimizedVideoUrl,
      backupUrls: [...(video.asrSourceBackupUrls ?? [])],
      label: '最小体积视频流',
      sourceMode: 'summary_optimized'
    }
  }

  return null
}

const buildFrameDownloadSourceCacheIdentity = (
  config: summaryParseConfig,
  input: SummaryInput,
  video: SummaryInput['videos'][number],
  videoIndex: number
) => {
  const source = resolveFrameDownloadSource(video, config)
  if (!source) return null
  return {
    ...buildDownloadSourceCacheIdentity(input, video, videoIndex, source),
    sourceMode: source.sourceMode ?? '',
    sourceLabel: source.label
  }
}

const buildTextCachePath = (kind: 'subtitle' | 'asr', payload: unknown): string => {
  const hash = buildCacheHash(textCacheVersion, kind, payload)
  return path.join(Common.tempDri.cache.derived, `summary_parse_${kind}_cache_${hash}.txt`)
}

const buildMediaCachePath = (
  kind: 'video' | 'audio_source' | 'audio_extracted',
  payload: unknown,
  extension: string
): string => {
  const hash = buildCacheHash(mediaCacheVersion, kind, payload)
  const directory = kind === 'video' || kind === 'audio_source'
    ? Common.tempDri.cache.media
    : Common.tempDri.cache.derived
  return path.join(directory, `summary_parse_${kind}_cache_${hash}${extension}`)
}

const buildSegmentCacheBasePath = (payload: unknown): string => {
  const hash = buildCacheHash(mediaCacheVersion, 'audio_segments', payload)
  return path.join(Common.tempDri.cache.derived, `summary_parse_audio_segments_cache_${hash}`)
}

const buildVideoFrameCacheBasePath = (payload: unknown): string => {
  const hash = buildCacheHash(mediaCacheVersion, 'video_frames', payload)
  return path.join(Common.tempDri.cache.derived, `summary_parse_video_frames_cache_${hash}`)
}

const buildSubtitleCachePath = (
  input: SummaryInput,
  video: SummaryInput['videos'][number],
  videoIndex: number
): string | null => {
  if (!video.subtitles || video.subtitles.length === 0) return null
  return buildTextCachePath('subtitle', {
    video: {
      platform: input.platform,
      subtype: input.rawSource.subtype,
      postUrl: normalizeUrlForCacheKey(input.rawSource.url),
      rawIdData: input.rawSource.raw?.idData
        ? normalizeRawIdDataForCache(input.platform, input.rawSource.raw.idData)
        : null,
      bilibiliSelectedPage: input.platform === 'bilibili'
        ? resolveBilibiliVideoPage(input.rawSource.raw?.idData)
        : 0,
      bilibiliSelectedCid: input.platform === 'bilibili'
        ? resolveBilibiliVideoCid({
          idData: input.rawSource.raw?.idData,
          detail: input.rawSource.raw?.detail,
          selectedCid: input.rawSource.raw?.selectedCid
        })
        : 0,
      videoIndex,
      durationSeconds: video.durationSeconds ?? 0,
      title: video.title?.trim() ?? ''
    },
    subtitles: [...video.subtitles].map(subtitle => ({
      source: subtitle.source ?? '',
      language: subtitle.language ?? '',
      label: subtitle.label ?? '',
      text: subtitle.text ?? '',
      url: subtitle.source === 'bilibili' ? '' : normalizeUrlForCacheKey(subtitle.url ?? '')
    })).sort((left, right) => stableCacheStringify(left).localeCompare(stableCacheStringify(right)))
  })
}

const buildAsrCachePath = (
  config: summaryParseConfig,
  input: SummaryInput,
  video: SummaryInput['videos'][number],
  videoIndex: number
): string => {
  return buildTextCachePath('asr', {
    source: buildAsrDownloadSourceCacheIdentity(input, video, videoIndex),
    config: {
      mode: config.asr.mode,
      language: config.asr.language ?? '',
      threads: config.asr.threads,
      audioBitrateKbps: Math.max(8, config.asr.audioBitrateKbps),
      maxSegmentMinutes: Math.max(1, config.asr.maxSegmentMinutes),
      localModelPath: path.basename(config.asr.modelPath || ''),
      cloudBaseUrl: normalizeBaseUrl(config.asr.cloud.baseUrl || ''),
      cloudModel: config.asr.cloud.model ?? ''
    }
  })
}

const buildExtractedAudioCachePath = (
  config: summaryParseConfig,
  input: SummaryInput,
  video: SummaryInput['videos'][number],
  videoIndex: number
): string => {
  return buildMediaCachePath('audio_extracted', {
    source: buildAsrDownloadSourceCacheIdentity(input, video, videoIndex),
    audioBitrateKbps: Math.max(8, config.asr.audioBitrateKbps)
  }, '.mp3')
}

const buildSegmentCachePaths = (
  config: summaryParseConfig,
  input: SummaryInput,
  video: SummaryInput['videos'][number],
  videoIndex: number,
  extension: string
) => {
  const basePath = buildSegmentCacheBasePath({
    video: buildVideoCacheIdentity(input, video, videoIndex),
    audioBitrateKbps: Math.max(8, config.asr.audioBitrateKbps),
    maxSegmentMinutes: Math.max(1, config.asr.maxSegmentMinutes),
    extension
  })

  return {
    manifestPath: `${basePath}.json`,
    segmentPattern: `${basePath}_%03d${extension}`,
    segmentPrefix: `${basePath}_`
  }
}

const buildVideoFrameCachePaths = (
  config: summaryParseConfig,
  input: SummaryInput,
  video: SummaryInput['videos'][number],
  videoIndex: number
) => {
  const frameConfig = normalizeVideoFrameConfig(config)
  const sourceIdentity = buildFrameDownloadSourceCacheIdentity(config, input, video, videoIndex)
  if (!frameConfig || !sourceIdentity) return null

  const basePath = buildVideoFrameCacheBasePath({
    source: sourceIdentity,
    config: frameConfig
  })

  return {
    manifestPath: `${basePath}.json`,
    framePrefix: basePath.replace('summary_parse_video_frames_cache_', 'summary_parse_video_frame_cache_')
  }
}

const summaryCacheRoot = path.resolve(Common.tempDri.cache.root)

const safeRealpathWithinCacheRoot = (candidate: string): string | null => {
  try {
    const guarded = assertPathWithinRoot(candidate, summaryCacheRoot)
    if (!('realpathSync' in fs) || typeof fs.realpathSync !== 'function') {
      return guarded
    }
    const realpathSync = fs.realpathSync as typeof fs.realpathSync & {
      native?: (path: fs.PathLike) => string
    }
    return assertPathWithinRoot(realpathSync.native?.(guarded) ?? realpathSync(guarded), summaryCacheRoot)
  } catch {
    return null
  }
}

const isValidCachedArtifactPath = (
  candidate: string,
  expectedPrefix: string,
  expectedExtension: string
): boolean => {
  const realpath = safeRealpathWithinCacheRoot(candidate)
  if (!realpath) return false
  const basename = path.basename(realpath)
  const expectedBasePrefix = path.basename(expectedPrefix)
  return basename.startsWith(expectedBasePrefix) && basename.endsWith(expectedExtension)
}

const readCachedSegmentPaths = (
  manifestPath: string,
  segmentPrefix: string,
  extension: string
): string[] | null => {
  if (!fileExists(manifestPath)) return null
  if (!safeRealpathWithinCacheRoot(manifestPath)) return null

  try {
    const parsed = JSON.parse(String(fs.readFileSync(manifestPath, 'utf8') ?? '')) as {
      segmentPaths?: string[]
    }
    const segmentPaths = Array.isArray(parsed.segmentPaths)
      ? parsed.segmentPaths.filter(item => typeof item === 'string' && item.length > 0)
      : []

    if (segmentPaths.length === 0) return null
    if (!segmentPaths.every(item => fileExists(item) && isValidCachedArtifactPath(item, segmentPrefix, extension))) return null
    return segmentPaths
  } catch {
    return null
  }
}

const readCachedFrameManifest = (
  manifestPath: string,
  framePrefix: string
): {
    framePaths: string[]
    timestamps: number[]
  } | null => {
  if (!fileExists(manifestPath)) return null
  if (!safeRealpathWithinCacheRoot(manifestPath)) return null

  try {
    const parsed = JSON.parse(String(fs.readFileSync(manifestPath, 'utf8') ?? '')) as {
      framePaths?: string[]
      timestamps?: number[]
    }
    const framePaths = Array.isArray(parsed.framePaths)
      ? parsed.framePaths.filter(item => typeof item === 'string' && item.length > 0)
      : []
    const timestamps = Array.isArray(parsed.timestamps)
      ? parsed.timestamps
        .map(item => Number(item))
        .filter(item => Number.isFinite(item) && item >= 0)
      : []

    if (framePaths.length === 0) return null
    if (!framePaths.every(item => fileExists(item) && isValidCachedArtifactPath(item, framePrefix, '.jpg'))) return null

    return {
      framePaths,
      timestamps: timestamps.length === framePaths.length ? timestamps : []
    }
  } catch {
    return null
  }
}

const writeSegmentManifest = (manifestPath: string, segmentPaths: string[]): void => {
  try {
    fs.writeFileSync(manifestPath, JSON.stringify({ segmentPaths }), 'utf8')
  } catch (error) {
    logSummaryMessage(`切片缓存清单写入失败，已忽略：${error instanceof Error ? error.message : String(error)}`, {
      level: 'warn'
    })
  }
}

const resolveRealSegmentPaths = (
  segmentPrefix: string,
  extension: string
): string[] => {
  const directory = path.dirname(segmentPrefix)
  const basenamePrefix = path.basename(segmentPrefix)
  try {
    const listed = fs.readdirSync(directory)
      .filter(item => item.startsWith(basenamePrefix) && item.endsWith(extension))
      .map(item => path.join(directory, item))
      .filter(fileExists)
      .sort((left, right) => left.localeCompare(right))
    if (listed.length > 0) {
      return listed
    }
  } catch {
    // noop
  }

  const probed: string[] = []
  for (let index = 0; index < 1000; index += 1) {
    const candidate = `${segmentPrefix}${String(index).padStart(3, '0')}${extension}`
    if (!fileExists(candidate)) {
      if (probed.length > 0) break
      continue
    }
    probed.push(candidate)
  }
  return probed
}

const writeFrameManifest = (
  manifestPath: string,
  framePaths: string[],
  timestamps: number[]
): void => {
  try {
    fs.writeFileSync(manifestPath, JSON.stringify({ framePaths, timestamps }), 'utf8')
  } catch (error) {
    logSummaryMessage(`抽帧缓存清单写入失败，已忽略：${error instanceof Error ? error.message : String(error)}`, {
      level: 'warn'
    })
  }
}

const readNormalizedCacheText = async (
  cachePath: string,
  label: '字幕' | 'ASR'
): Promise<string | null> => {
  if (!fileExists(cachePath)) return null

  try {
    const cached = String(fs.readFileSync(cachePath, 'utf8') ?? '').trim()
    if (!cached) return null

    const normalized = await normalizeChineseTextForCache(cached)
    if (!normalized) return null

    if (normalized !== cached) {
      fs.writeFileSync(cachePath, normalized, 'utf8')
    }

    return normalized
  } catch (error) {
    logSummaryMessage(`${label}缓存读取失败，已忽略：${error instanceof Error ? error.message : String(error)}`, {
      level: 'warn'
    })
    return null
  }
}

const writeNormalizedCacheText = (
  cachePath: string,
  text: string,
  label: '字幕' | 'ASR'
): void => {
  try {
    if (!text) return
    fs.writeFileSync(cachePath, text, 'utf8')
  } catch (error) {
    logSummaryMessage(`${label}缓存写入失败，已忽略：${error instanceof Error ? error.message : String(error)}`, {
      level: 'warn'
    })
  }
}

const resolveSubtitleText = async (subtitle: SubtitleReference): Promise<string> => {
  if (subtitle.text?.trim()) return subtitle.text.trim()
  if (!subtitle.url) return ''

  const { response } = await executeSafeAxiosRequest<string>({
    url: subtitle.url,
    method: 'GET',
    timeout: 30000,
    responseType: 'text' as never,
    headers: toDownloadHeaders(subtitle.headers)
  }, {
    profile: 'summary-subtitle'
  })

  return parseSubtitlePayloadToText(String(response.data ?? ''))
}

const pickSubtitleText = async (
  video: SummaryInput['videos'][number],
  progress?: SummaryLinkProgressContext
): Promise<string | null> => {
  if (!video.subtitles || video.subtitles.length === 0) return null

  for (const subtitle of video.subtitles) {
    try {
      const text = await resolveSubtitleText(subtitle)
      if (text) return text
    } catch (error) {
      logSummaryMessage(`平台字幕获取失败，继续回退到 ASR：${error instanceof Error ? error.message : String(error)}`, {
        taskId: progress?.taskId,
        level: 'warn'
      })
    }
  }

  return null
}

const resolveCachedSubtitleText = async (
  input: SummaryInput,
  video: SummaryInput['videos'][number],
  videoIndex: number,
  progress?: SummaryLinkProgressContext
): Promise<string | null> => {
  const cachePath = buildSubtitleCachePath(input, video, videoIndex)
  if (!cachePath) return null

  const cached = await readNormalizedCacheText(cachePath, '字幕')
  if (cached) {
    logSummaryProgress({
      scope: 'asr',
      stage: '命中平台字幕缓存',
      level: 'info',
      taskId: progress?.taskId ?? 'unknown',
      totalLinks: progress?.totalLinks,
      linkIndex: progress?.linkIndex,
      platform: progress?.platform,
      title: progress?.title ?? video.title,
      provider: 'subtitle'
    })
    return cached
  }

  const subtitleText = await pickSubtitleText(video, progress)
  if (!subtitleText) return null

  const normalized = await normalizeChineseTextForCache(subtitleText)
  if (!normalized) return null

  writeNormalizedCacheText(cachePath, normalized, '字幕')
  return normalized
}

const buildResolvedSourceCachePath = (
  input: SummaryInput,
  video: SummaryInput['videos'][number],
  videoIndex: number,
  source: SummaryDownloadSource
): string => {
  const cacheIdentity = buildDownloadSourceCacheIdentity(input, video, videoIndex, source)
  return buildMediaCachePath(
    source.type === 'audio' ? 'audio_source' : 'video',
    cacheIdentity,
    sanitizeCacheExtension(
      extractExtensionFromUrl(source.url),
      source.type === 'audio' ? '.m4a' : '.mp4'
    )
  )
}

const downloadResolvedSourceToTemp = async (
  input: SummaryInput,
  video: SummaryInput['videos'][number],
  videoIndex: number,
  source: SummaryDownloadSource,
  progress?: SummaryLinkProgressContext
): Promise<{ cleanupPaths: string[]; sourcePath: string }> => {
  const { downloadFile } = await import('@/module')
  const sourcePath = buildResolvedSourceCachePath(input, video, videoIndex, source)

  if (fileExists(sourcePath)) {
    logSummaryProgress({
      scope: 'asr',
      stage: '命中媒体缓存，跳过下载',
      level: 'info',
      taskId: progress?.taskId ?? 'unknown',
      totalLinks: progress?.totalLinks,
      linkIndex: progress?.linkIndex,
      platform: progress?.platform,
      title: progress?.title ?? video.title,
      details: `${source.label} ${path.basename(sourcePath)}`
    })
    return {
      cleanupPaths: [],
      sourcePath
    }
  }

  if (progress) {
    startSummaryProgressTimer({
      scope: 'asr',
      stage: '下载媒体',
      taskId: progress.taskId,
      totalLinks: progress.totalLinks,
      linkIndex: progress.linkIndex,
      platform: progress.platform,
      title: progress.title,
      details: source.label
    })
  }

  try {
    await downloadFile(source.url, {
      title: path.basename(sourcePath),
      filepath: sourcePath,
      headers: toDownloadHeaders(video.headers),
      backupUrls: source.backupUrls
    })
    return {
      cleanupPaths: [],
      sourcePath
    }
  } catch (error) {
    cleanupTempFiles([sourcePath])
    throw error
  } finally {
    if (progress) {
      endSummaryProgressTimer({
        scope: 'asr',
        stage: '下载媒体',
        taskId: progress.taskId,
        totalLinks: progress.totalLinks,
        linkIndex: progress.linkIndex,
        platform: progress.platform,
        title: progress.title,
        details: source.label
      })
    }
  }
}

const downloadMediaToTemp = async (
  input: SummaryInput,
  video: SummaryInput['videos'][number],
  videoIndex: number,
  progress?: SummaryLinkProgressContext
): Promise<{ cleanupPaths: string[]; sourcePath: string }> => {
  return await downloadResolvedSourceToTemp(
    input,
    video,
    videoIndex,
    resolveAsrDownloadSource(video),
    progress
  )
}

const prepareExtractedAudio = async (
  config: summaryParseConfig,
  input: SummaryInput,
  video: SummaryInput['videos'][number],
  videoIndex: number,
  sourcePath: string,
  runner: ExecRunner,
  progress?: SummaryLinkProgressContext
): Promise<string> => {
  const cachedAudioPath = buildExtractedAudioCachePath(config, input, video, videoIndex)
  if (fileExists(cachedAudioPath)) {
    logSummaryProgress({
      scope: 'asr',
      stage: '命中抽音缓存，跳过转码',
      level: 'info',
      taskId: progress?.taskId ?? 'unknown',
      totalLinks: progress?.totalLinks,
      linkIndex: progress?.linkIndex,
      platform: progress?.platform,
      title: progress?.title ?? video.title
    })
    return cachedAudioPath
  }

  try {
    await extractAudio(config, sourcePath, cachedAudioPath, runner, video.durationSeconds, progress)
    return cachedAudioPath
  } catch (error) {
    cleanupTempFiles([cachedAudioPath])
    throw error
  }
}

export const buildExtractAudioCommand = (
  config: summaryParseConfig,
  sourcePath: string,
  audioPath: string,
  withProgress = false
): ExecInvocation => {
  const args = [
    '-y',
    '-i',
    sourcePath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-c:a',
    'libmp3lame',
    '-b:a',
    `${Math.max(8, config.asr.audioBitrateKbps)}k`
  ]

  if (withProgress) {
    args.push('-progress', 'pipe:2', '-nostats')
  }

  return {
    file: config.asr.ffmpegPath,
    args: [...args, audioPath]
  }
}

const extractAudio = async (
  config: summaryParseConfig,
  sourcePath: string,
  audioPath: string,
  runner: ExecRunner,
  totalSeconds?: number,
  progress?: SummaryLinkProgressContext
): Promise<void> => {
  const command = buildExtractAudioCommand(config, sourcePath, audioPath, true)
  const activity = totalSeconds
    ? null
    : createSummaryCliActivity({
      icon: '🎙️',
      label: path.basename(audioPath),
      statusText: '抽音/转码'
    })
  if (progress) {
    startSummaryProgressTimer({
      scope: 'asr',
      stage: '抽音/转码',
      taskId: progress.taskId,
      totalLinks: progress.totalLinks,
      linkIndex: progress.linkIndex,
      platform: progress.platform,
      title: progress.title
    })
  }

  try {
    const parser = createFfmpegProgressParser(totalSeconds, snapshot => {
      if (snapshot.percent === undefined) return
      activity?.stop()
      renderSummaryCliProgress({
        icon: '🎙️',
        label: path.basename(audioPath),
        percent: snapshot.percent,
        currentSeconds: snapshot.outTimeSeconds,
        totalSeconds,
        speedText: snapshot.speedText,
        trailingText: '抽音/转码'
      })
    })

    await runner(command, {
      onStderr: chunk => parser.push(chunk)
    })
  } catch (error) {
    throw new Error(buildExecErrorSummary(error, command))
  } finally {
    activity?.stop()
    if (progress) {
      endSummaryProgressTimer({
        scope: 'asr',
        stage: '抽音/转码',
        taskId: progress.taskId,
        totalLinks: progress.totalLinks,
        linkIndex: progress.linkIndex,
        platform: progress.platform,
        title: progress.title
      })
    }
  }
}

const buildSplitAudioCommand = (
  config: summaryParseConfig,
  audioPath: string,
  segmentSeconds: number,
  segmentPattern: string,
  withProgress = false
): ExecInvocation => {
  const args = [
    '-y',
    '-i',
    audioPath,
    '-f',
    'segment',
    '-segment_time',
    String(segmentSeconds),
    '-c',
    'copy'
  ]

  if (withProgress) {
    args.push('-progress', 'pipe:2', '-nostats')
  }

  return {
    file: config.asr.ffmpegPath,
    args: [...args, segmentPattern]
  }
}

const splitAudioIfNeeded = async (
  config: summaryParseConfig,
  input: SummaryInput,
  video: SummaryInput['videos'][number],
  videoIndex: number,
  audioPath: string,
  durationSeconds: number | undefined,
  runner: ExecRunner,
  progress?: SummaryLinkProgressContext
): Promise<{ segmentPaths: string[]; cleanupPaths: string[] }> => {
  const segmentSeconds = Math.max(60, config.asr.maxSegmentMinutes * 60)
  if (!durationSeconds || durationSeconds <= segmentSeconds) {
    return {
      segmentPaths: [audioPath],
      cleanupPaths: []
    }
  }

  const segmentExtension = path.extname(audioPath) || '.mp3'
  const segmentCache = buildSegmentCachePaths(config, input, video, videoIndex, segmentExtension)
  const totalSegments = Math.ceil(durationSeconds / segmentSeconds)
  const cachedSegmentPaths = readCachedSegmentPaths(
    segmentCache.manifestPath,
    segmentCache.segmentPrefix,
    segmentExtension
  )

  if (cachedSegmentPaths) {
    logSummaryProgress({
      scope: 'asr',
      stage: '命中切片缓存，跳过切片',
      level: 'info',
      taskId: progress?.taskId ?? 'unknown',
      totalLinks: progress?.totalLinks,
      linkIndex: progress?.linkIndex,
      platform: progress?.platform,
      title: progress?.title,
      details: `总段数 ${cachedSegmentPaths.length}`
    })
    return {
      segmentPaths: cachedSegmentPaths,
      cleanupPaths: []
    }
  }

  const segmentPattern = segmentCache.segmentPattern
  const command = buildSplitAudioCommand(config, audioPath, segmentSeconds, segmentPattern, true)
  const activity = durationSeconds
    ? null
    : createSummaryCliActivity({
      icon: '✂️',
      label: path.basename(audioPath),
      statusText: `切片 ${totalSegments} 段`
    })

  if (progress) {
    startSummaryProgressTimer({
      scope: 'asr',
      stage: '切片',
      taskId: progress.taskId,
      totalLinks: progress.totalLinks,
      linkIndex: progress.linkIndex,
      platform: progress.platform,
      title: progress.title,
      details: `总段数预计 ${totalSegments}`
    })
  }

  try {
    const parser = createFfmpegProgressParser(durationSeconds, snapshot => {
      if (snapshot.percent === undefined) return
      activity?.stop()
      renderSummaryCliProgress({
        icon: '✂️',
        label: path.basename(audioPath),
        percent: snapshot.percent,
        currentSeconds: snapshot.outTimeSeconds,
        totalSeconds: durationSeconds,
        speedText: snapshot.speedText,
        trailingText: `切片 ${totalSegments} 段`
      })
    })

    await runner(command, {
      onStderr: chunk => parser.push(chunk)
    })
  } catch (error) {
    throw new Error(buildExecErrorSummary(error, command))
  } finally {
    activity?.stop()
    if (progress) {
      endSummaryProgressTimer({
        scope: 'asr',
        stage: '切片',
        taskId: progress.taskId,
        totalLinks: progress.totalLinks,
        linkIndex: progress.linkIndex,
        platform: progress.platform,
        title: progress.title,
        details: `总段数 ${totalSegments}`
      })
    }
  }

  const segmentPaths = resolveRealSegmentPaths(segmentCache.segmentPrefix, segmentExtension)
  if (segmentPaths.length === 0) {
    throw new Error('音频切片未生成任何产物')
  }
  writeSegmentManifest(segmentCache.manifestPath, segmentPaths)

  return {
    segmentPaths,
    cleanupPaths: []
  }
}

const formatTimestampLabel = (seconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
  }

  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

const resolveVideoDurationSeconds = async (
  sourcePath: string,
  fallbackSeconds: number | undefined,
  progress?: SummaryLinkProgressContext
): Promise<number | undefined> => {
  try {
    const durationSeconds = await getMediaDuration(sourcePath)
    if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
      return durationSeconds
    }
  } catch (error) {
    logSummaryMessage(`视频时长探测失败，回退平台时长：${error instanceof Error ? error.message : String(error)}`, {
      taskId: progress?.taskId,
      level: 'debug'
    })
  }

  return Number.isFinite(fallbackSeconds) && (fallbackSeconds ?? 0) > 0
    ? fallbackSeconds
    : undefined
}

const buildFrameTimestamps = (
  durationSeconds: number,
  frameConfig: NormalizedVideoFrameConfig
): number[] => {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return []

  const rawCount = Math.floor(durationSeconds / frameConfig.minIntervalSeconds)
  const count = Math.max(1, Math.min(frameConfig.maxImages, rawCount > 0 ? rawCount : 1))
  const unclampedStart = Math.max(0, frameConfig.skipStartSeconds)
  const unclampedEnd = Math.max(0, durationSeconds - frameConfig.skipEndSeconds)
  const windowStart = unclampedStart < unclampedEnd ? unclampedStart : 0
  const windowEnd = unclampedStart < unclampedEnd ? unclampedEnd : durationSeconds
  const clampTimestamp = (value: number): number => {
    return Math.min(windowEnd, Math.max(windowStart, value))
  }

  if (count === 1) {
    return [clampTimestamp(durationSeconds / 2)]
  }

  const interval = durationSeconds / count
  const timestamps: number[] = []
  for (let index = 1; index <= count; index += 1) {
    const clamped = clampTimestamp(interval * index)
    const previous = timestamps.at(-1)
    if (previous === undefined || Math.abs(previous - clamped) >= 0.001) {
      timestamps.push(clamped)
    }
  }

  return timestamps
}

const buildExtractVideoFrameCommand = (
  config: summaryParseConfig,
  sourcePath: string,
  timestampSeconds: number,
  framePath: string
): ExecInvocation => {
  return {
    file: config.asr.ffmpegPath,
    args: [
      '-y',
      '-ss',
      String(Math.max(0, timestampSeconds)),
      '-i',
      sourcePath,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      '-an',
      framePath
    ]
  }
}

const extractVideoFrames = async (
  config: summaryParseConfig,
  input: SummaryInput,
  video: SummaryInput['videos'][number],
  videoIndex: number,
  runner: ExecRunner,
  progress?: SummaryLinkProgressContext
): Promise<Array<Extract<SummaryInput['videoFrames'][number]['images'][number], { type: 'image' }>>> => {
  const frameConfig = normalizeVideoFrameConfig(config)
  const frameSource = resolveFrameDownloadSource(video, config)
  const cachePaths = buildVideoFrameCachePaths(config, input, video, videoIndex)

  if (!frameConfig || !frameSource || !cachePaths) {
    return []
  }

  const cachedManifest = readCachedFrameManifest(cachePaths.manifestPath, cachePaths.framePrefix)
  if (cachedManifest) {
    logSummaryProgress({
      scope: 'asr',
      stage: '命中抽帧缓存，跳过抽帧',
      level: 'info',
      taskId: progress?.taskId ?? 'unknown',
      totalLinks: progress?.totalLinks,
      linkIndex: progress?.linkIndex,
      platform: progress?.platform,
      title: progress?.title ?? video.title,
      details: `共 ${cachedManifest.framePaths.length} 张`
    })
    return cachedManifest.framePaths.map((framePath, index) => ({
      type: 'image',
      url: pathToFileURL(framePath).href,
      alt: `视频画面 ${index + 1}/${cachedManifest.framePaths.length}${cachedManifest.timestamps[index] !== undefined ? ` ${formatTimestampLabel(cachedManifest.timestamps[index]!)}` : ''}`
    }))
  }

  const downloaded = await downloadResolvedSourceToTemp(input, video, videoIndex, frameSource, progress)
  const sourcePath = downloaded.sourcePath
  const durationSeconds = await resolveVideoDurationSeconds(sourcePath, video.durationSeconds, progress)
  if (!durationSeconds) return []

  const timestamps = buildFrameTimestamps(durationSeconds, frameConfig)
  if (timestamps.length === 0) return []

  if (progress) {
    startSummaryProgressTimer({
      scope: 'asr',
      stage: '视频抽帧',
      taskId: progress.taskId,
      totalLinks: progress.totalLinks,
      linkIndex: progress.linkIndex,
      platform: progress.platform,
      title: progress.title,
      details: `共 ${timestamps.length} 张`
    })
  }

  const framePaths: string[] = []

  try {
    for (const [index, timestampSeconds] of timestamps.entries()) {
      const framePath = `${cachePaths.framePrefix}_${String(index).padStart(3, '0')}.jpg`
      const command = buildExtractVideoFrameCommand(config, sourcePath, timestampSeconds, framePath)
      const activity = createSummaryCliActivity({
        icon: '🖼️',
        label: path.basename(framePath),
        statusText: `抽帧 第 ${index + 1}/${timestamps.length} 张`,
        trailingText: formatTimestampLabel(timestampSeconds)
      })

      logSummaryProgress({
        scope: 'asr',
        stage: `抽帧 第 ${index + 1}/${timestamps.length} 张`,
        taskId: progress?.taskId ?? 'unknown',
        totalLinks: progress?.totalLinks,
        linkIndex: progress?.linkIndex,
        platform: progress?.platform,
        title: progress?.title ?? video.title,
        details: formatTimestampLabel(timestampSeconds)
      })

      try {
        await runner(command)
      } catch (error) {
        cleanupTempFiles([framePath])
        throw new Error(buildExecErrorSummary(error, command))
      } finally {
        activity.stop()
      }

      framePaths.push(framePath)
      renderSummaryCliProgress({
        icon: '🖼️',
        label: path.basename(sourcePath),
        percent: ((index + 1) / timestamps.length) * 100,
        trailingText: `抽帧 ${index + 1}/${timestamps.length}`
      })
    }
  } catch (error) {
    cleanupTempFiles(framePaths)
    throw error
  } finally {
    if (progress) {
      endSummaryProgressTimer({
        scope: 'asr',
        stage: '视频抽帧',
        taskId: progress.taskId,
        totalLinks: progress.totalLinks,
        linkIndex: progress.linkIndex,
        platform: progress.platform,
        title: progress.title,
        details: `共 ${timestamps.length} 张`
      })
    }
  }

  writeFrameManifest(cachePaths.manifestPath, framePaths, timestamps)

  return framePaths.map((framePath, index) => ({
    type: 'image',
    url: pathToFileURL(framePath).href,
    alt: `视频画面 ${index + 1}/${timestamps.length} ${formatTimestampLabel(timestamps[index] ?? 0)}`
  }))
}

const buildLocalDecodeCommand = (
  config: summaryParseConfig,
  sourcePath: string,
  wavPath: string,
  withProgress = false
): ExecInvocation => {
  const args = [
    '-y',
    '-i',
    sourcePath,
    '-ac',
    '1',
    '-ar',
    '16000',
    '-c:a',
    'pcm_s16le',
    '-f',
    'wav'
  ]

  if (withProgress) {
    args.push('-progress', 'pipe:2', '-nostats')
  }

  return {
    file: config.asr.ffmpegPath,
    args: [...args, wavPath]
  }
}

const prepareLocalAudioInput = async (
  config: summaryParseConfig,
  segmentPath: string,
  outputBase: string,
  totalSeconds: number | undefined,
  runner: ExecRunner
): Promise<{ audioPath: string; cleanupPaths: string[] }> => {
  if (path.extname(segmentPath).toLowerCase() === '.wav') {
    return {
      audioPath: segmentPath,
      cleanupPaths: []
    }
  }

  const wavPath = `${outputBase}.wav`
  const command = buildLocalDecodeCommand(config, segmentPath, wavPath, true)
  const activity = totalSeconds
    ? null
    : createSummaryCliActivity({
      icon: '🛠️',
      label: path.basename(wavPath),
      statusText: '转本地 ASR 输入'
    })
  try {
    const parser = createFfmpegProgressParser(totalSeconds, snapshot => {
      if (snapshot.percent === undefined) return
      activity?.stop()
      renderSummaryCliProgress({
        icon: '🛠️',
        label: path.basename(wavPath),
        percent: snapshot.percent,
        currentSeconds: snapshot.outTimeSeconds,
        totalSeconds,
        speedText: snapshot.speedText,
        trailingText: '转本地 ASR 输入'
      })
    })

    await runner(command, {
      onStderr: chunk => parser.push(chunk)
    })
  } catch (error) {
    throw new Error(buildExecErrorSummary(error, command))
  } finally {
    activity?.stop()
  }

  return {
    audioPath: wavPath,
    cleanupPaths: [wavPath]
  }
}

const buildTranscriptArtifactPaths = (outputBase: string): string[] => {
  return [
    `${outputBase}.txt`,
    `${outputBase}.json`,
    `${outputBase}.srt`,
    `${outputBase}.vtt`
  ]
}

const transcribeAudioWithLocal = async (
  config: summaryParseConfig,
  audioPath: string,
  outputBase: string,
  runner: ExecRunner,
  segmentIndex: number,
  totalSegments: number
): Promise<string> => {
  const command: ExecInvocation = {
    file: config.asr.whisperCppPath,
    args: [
      '-m',
      config.asr.modelPath,
      '-f',
      audioPath,
      '-l',
      config.asr.language,
      '-t',
      String(config.asr.threads),
      '-otxt',
      '-of',
      outputBase
    ]
  }

  const activity = createSummaryCliActivity({
    icon: '📝',
    label: path.basename(audioPath),
    statusText: `本地 ASR 第 ${segmentIndex}/${totalSegments} 段`,
    showActivityBar: false
  })

  try {
    let renderedPercent: number | null = null
    await runner(command, {
      onStdout: chunk => {
        const percent = extractProgressPercentFromText(chunk)
        if (percent === undefined) return
        activity.stop()
        renderedPercent = percent
        renderSummaryCliProgress({
          icon: '📝',
          label: path.basename(audioPath),
          percent,
          trailingText: `本地 ASR 第 ${segmentIndex}/${totalSegments} 段`
        })
      },
      onStderr: chunk => {
        const percent = extractProgressPercentFromText(chunk)
        if (percent === undefined) return
        activity.stop()
        renderedPercent = percent
        renderSummaryCliProgress({
          icon: '📝',
          label: path.basename(audioPath),
          percent,
          trailingText: `本地 ASR 第 ${segmentIndex}/${totalSegments} 段`
        })
      }
    })
    if (renderedPercent === null) {
      renderSummaryCliProgress({
        icon: '📝',
        label: path.basename(audioPath),
        percent: 100,
        trailingText: `本地 ASR 第 ${segmentIndex}/${totalSegments} 段完成`
      })
    }
  } catch (error) {
    throw new Error(buildExecErrorSummary(error, command))
  } finally {
    activity.stop()
  }

  const txtPath = `${outputBase}.txt`
  if (!fileExists(txtPath)) {
    throw new Error(`未找到 whisper.cpp 输出文件: ${txtPath}`)
  }

  const text = String(fs.readFileSync(txtPath, 'utf8') ?? '').trim()
  if (!text) {
    throw new Error(`whisper.cpp 输出为空: ${txtPath}`)
  }

  return text
}

const transcribeAudioWithCloud = async (
  config: summaryParseConfig,
  audioPath: string,
  progress?: SummaryLinkProgressContext,
  segmentIndex?: number,
  totalSegments?: number
): Promise<string> => {
  const mimeType = audioMimeByExtension[path.extname(audioPath).toLowerCase()] ?? 'application/octet-stream'
  const audioBuffer = await fs.promises.readFile(audioPath)

  const retryCount = Math.max(0, Number(config.asr.cloud.retryCount ?? 0))
  const retryDelayMs = Math.max(0, Number(config.asr.cloud.retryDelayMs ?? 0))
  let lastError: unknown

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    const activity = createSummaryCliActivity({
      icon: '☁️',
      label: path.basename(audioPath),
      statusText: `云端 ASR 第 ${segmentIndex ?? 1}/${totalSegments ?? 1} 段`
    })

    try {
      const form = new FormData()
      const file = new Blob([audioBuffer], { type: mimeType })
      form.append('file', file, path.basename(audioPath))
      form.append('model', config.asr.cloud.model)
      if (config.asr.language?.trim()) {
        form.append('language', config.asr.language.trim())
      }

      logSummaryProgress({
        scope: 'asr',
        stage: `ASR 第 ${segmentIndex ?? 1}/${totalSegments ?? 1} 段`,
        taskId: progress?.taskId ?? 'unknown',
        totalLinks: progress?.totalLinks,
        linkIndex: progress?.linkIndex,
        platform: progress?.platform,
        title: progress?.title,
        provider: 'cloud',
        attempt: attempt + 1,
        totalAttempts: retryCount + 1
      })
      const response = await axios.post<{ text?: string }>(
        buildCloudTranscriptionEndpoint(config),
        form,
        {
          timeout: config.asr.cloud.timeoutMs,
          headers: {
            Authorization: `Bearer ${config.asr.cloud.apiKey}`
          }
        }
      )

      const traceId = response.headers?.['x-siliconcloud-trace-id'] ?? response.headers?.['X-SiliconCloud-Trace-Id']
      if (traceId) {
        logSummaryMessage(`云端 ASR trace-id: ${String(traceId)}`, {
          taskId: progress?.taskId
        })
      }

      const text = String(response.data?.text ?? '').trim()
      if (!text) {
        throw new Error('云端 ASR 返回内容为空')
      }

      renderSummaryCliProgress({
        icon: '☁️',
        label: path.basename(audioPath),
        percent: 100,
        trailingText: `云端 ASR 第 ${segmentIndex ?? 1}/${totalSegments ?? 1} 段完成`
      })
      return text
    } catch (error) {
      lastError = error
      if (attempt >= retryCount || !shouldRetryCloudAsrError(error)) {
        throw error
      }
      logSummaryMessage(`云端 ASR 请求失败，准备重试：attempt ${attempt + 1}/${retryCount + 1}，${error instanceof Error ? error.message : String(error)}，${retryDelayMs}ms 后重试`, {
        taskId: progress?.taskId,
        level: 'warn'
      })
      if (retryDelayMs > 0) {
        await sleep(retryDelayMs)
      }
    } finally {
      activity.stop()
    }
  }

  throw lastError instanceof Error ? lastError : new Error('云端 ASR 请求失败')
}

const transcribeAudioSegments = async (
  config: summaryParseConfig,
  segmentPaths: string[],
  transcriptBase: string,
  runner: ExecRunner,
  providerAvailability: AsrProviderAvailability,
  durationSeconds: number | undefined,
  progress?: SummaryLinkProgressContext
): Promise<{ text: string; cleanupPaths: string[]; providerUsed: 'cloud' | 'local' | null }> => {
  const texts: string[] = []
  const cleanupPaths: string[] = []
  const cloudFirst = config.asr.mode === 'cloud'
  const { localAvailable, cloudAvailable } = providerAvailability
  let providerUsed: 'cloud' | 'local' | null = null

  for (const [index, segmentPath] of segmentPaths.entries()) {
    const segmentBase = `${transcriptBase}_${index}`
    cleanupPaths.push(...buildTranscriptArtifactPaths(segmentBase))
    const segmentIndex = index + 1
    const totalSegments = segmentPaths.length
    const segmentDurationSeconds = durationSeconds && durationSeconds > 0
      ? Math.min(
        Math.max(1, Math.ceil(durationSeconds / totalSegments)),
        Math.max(1, Math.ceil(durationSeconds - ((segmentIndex - 1) * Math.ceil(durationSeconds / totalSegments))))
      )
      : undefined

    if (cloudFirst && cloudAvailable) {
      try {
        const text = await transcribeAudioWithCloud(config, segmentPath, progress, segmentIndex, totalSegments)
        if (text) texts.push(text)
        providerUsed = providerUsed ?? 'cloud'
        logSummaryProgress({
          scope: 'asr',
          stage: `ASR 第 ${segmentIndex}/${totalSegments} 段完成`,
          taskId: progress?.taskId ?? 'unknown',
          totalLinks: progress?.totalLinks,
          linkIndex: progress?.linkIndex,
          platform: progress?.platform,
          title: progress?.title,
          provider: 'cloud'
        })
        continue
      } catch (error) {
        logSummaryMessage(`云端 ASR 失败，回退本地：${error instanceof Error ? error.message : String(error)}`, {
          taskId: progress?.taskId,
          level: 'warn'
        })
      }
    }

    if (localAvailable) {
      try {
        const localInput = await prepareLocalAudioInput(config, segmentPath, segmentBase, segmentDurationSeconds, runner)
        cleanupPaths.push(...localInput.cleanupPaths)
        const text = await transcribeAudioWithLocal(
          config,
          localInput.audioPath,
          segmentBase,
          runner,
          segmentIndex,
          totalSegments
        )
        if (text) texts.push(text)
        providerUsed = providerUsed ?? 'local'
        logSummaryProgress({
          scope: 'asr',
          stage: `ASR 第 ${segmentIndex}/${totalSegments} 段完成`,
          taskId: progress?.taskId ?? 'unknown',
          totalLinks: progress?.totalLinks,
          linkIndex: progress?.linkIndex,
          platform: progress?.platform,
          title: progress?.title,
          provider: 'local'
        })
        continue
      } catch (error) {
        if (!cloudFirst && cloudAvailable) {
          logSummaryMessage(`本地 ASR 失败，回退云端：${error instanceof Error ? error.message : String(error)}`, {
            taskId: progress?.taskId,
            level: 'warn'
          })
        } else {
          throw error
        }
      }
    }

    if (!cloudFirst && cloudAvailable) {
      const text = await transcribeAudioWithCloud(config, segmentPath, progress, segmentIndex, totalSegments)
      if (text) texts.push(text)
      providerUsed = providerUsed ?? 'cloud'
      logSummaryProgress({
        scope: 'asr',
        stage: `ASR 第 ${segmentIndex}/${totalSegments} 段完成`,
        taskId: progress?.taskId ?? 'unknown',
        totalLinks: progress?.totalLinks,
        linkIndex: progress?.linkIndex,
        platform: progress?.platform,
        title: progress?.title,
        provider: 'cloud'
      })
      continue
    }

    throw new Error('没有可用的 ASR provider')
  }

  return {
    text: texts.join('\n').trim(),
    cleanupPaths,
    providerUsed
  }
}

export const enrichSummaryInputWithAsr = async (
  config: summaryParseConfig,
  input: SummaryInput,
  runner: ExecRunner = execFileCommand,
  progress?: SummaryLinkProgressContext
): Promise<SummaryInput> => {
  if (input.videos.length === 0) return input

  const asrTexts: SummaryInput['asrTexts'] = []
  const videoFrames: SummaryInput['videoFrames'] = []
  const providerAvailability = resolveAsrProviderAvailability(config)
  let loggedPrerequisiteIssues = false

  for (const [index, video] of input.videos.entries()) {
    const subtitleText = await resolveCachedSubtitleText(input, video, index, progress)
    if (isVideoFrameEnabled(config)) {
      try {
        const frames = await extractVideoFrames(config, input, video, index, runner, progress)
        if (frames.length > 0) {
          videoFrames.push({
            title: video.title,
            images: frames
          })
        }
      } catch (error) {
        logSummaryMessage(`视频抽帧失败，已跳过：${error instanceof Error ? error.message : String(error)}`, {
          taskId: progress?.taskId,
          level: 'warn'
        })
      }
    }

    if (subtitleText) {
      logSummaryProgress({
        scope: 'asr',
        stage: '检测到平台字幕，跳过 ASR',
        level: 'info',
        taskId: progress?.taskId ?? 'unknown',
        totalLinks: progress?.totalLinks,
        linkIndex: progress?.linkIndex,
        platform: progress?.platform,
        title: progress?.title ?? video.title,
        provider: 'subtitle'
      })
      asrTexts.push({
        title: video.title,
        text: subtitleText
      })
      continue
    }

    if (!providerAvailability.cloudAvailable && !providerAvailability.localAvailable) {
      const prerequisiteIssues = [
        ...providerAvailability.sharedIssues,
        ...providerAvailability.localIssues
      ]
      if (!loggedPrerequisiteIssues && prerequisiteIssues.length > 0) {
        logSummaryMessage(`ASR 依赖不可用，已跳过：${prerequisiteIssues.join('；')}`, {
          taskId: progress?.taskId,
          level: 'warn'
        })
        loggedPrerequisiteIssues = true
      }
      continue
    }

    if (
      !loggedPrerequisiteIssues &&
      providerAvailability.localIssues.length > 0 &&
      config.asr.mode === 'local' &&
      providerAvailability.cloudAvailable
    ) {
      logSummaryMessage(`本地 ASR 不可用，将回退云端：${providerAvailability.localIssues.join('；')}`, {
        taskId: progress?.taskId,
        level: 'warn'
      })
      loggedPrerequisiteIssues = true
    }

    const asrCachePath = buildAsrCachePath(config, input, video, index)
    const cachedAsrText = await readNormalizedCacheText(asrCachePath, 'ASR')
    if (cachedAsrText) {
      logSummaryProgress({
        scope: 'asr',
        stage: '命中 ASR 缓存，跳过下载、抽音与转写',
        level: 'info',
        taskId: progress?.taskId ?? 'unknown',
        totalLinks: progress?.totalLinks,
        linkIndex: progress?.linkIndex,
        platform: progress?.platform,
        title: progress?.title ?? video.title,
        provider: config.asr.mode === 'cloud' ? 'cloud' : 'local'
      })
      asrTexts.push({
        title: video.title,
        text: cachedAsrText
      })
      continue
    }

    const tempToken = `${Date.now()}_${Math.random().toString(36).slice(2)}_${index}`
    const transcriptBase = path.join(Common.tempDri.video, `summary_parse_transcript_${tempToken}`)
    let cleanupPaths: string[] = []

    try {
      const downloaded = await downloadMediaToTemp(input, video, index, progress)
      cleanupPaths.push(...downloaded.cleanupPaths)

      const audioPath = await prepareExtractedAudio(
        config,
        input,
        video,
        index,
        downloaded.sourcePath,
        runner,
        progress
      )

      const segmented = await splitAudioIfNeeded(
        config,
        input,
        video,
        index,
        audioPath,
        video.durationSeconds,
        runner,
        progress
      )
      cleanupPaths.push(...segmented.cleanupPaths)

      const transcribed = await transcribeAudioSegments(
        config,
        segmented.segmentPaths,
        transcriptBase,
        runner,
        providerAvailability,
        video.durationSeconds,
        progress
      )
      cleanupPaths.push(...transcribed.cleanupPaths)

      const normalizedTranscribedText = await normalizeChineseTextForCache(transcribed.text)
      if (normalizedTranscribedText) {
        writeNormalizedCacheText(asrCachePath, normalizedTranscribedText, 'ASR')
        logSummaryProgress({
          scope: 'asr',
          stage: 'ASR 完成',
          level: 'info',
          taskId: progress?.taskId ?? 'unknown',
          totalLinks: progress?.totalLinks,
          linkIndex: progress?.linkIndex,
          platform: progress?.platform,
          title: progress?.title ?? video.title,
          provider: transcribed.providerUsed ?? (config.asr.mode === 'cloud' ? 'cloud' : 'local')
        })
        asrTexts.push({
          title: video.title,
          text: normalizedTranscribedText
        })
      }
    } catch (error) {
      logSummaryMessage(`视频 ASR 失败，已跳过：${error instanceof Error ? error.message : String(error)}`, {
        taskId: progress?.taskId,
        level: 'warn'
      })
    } finally {
      if (cleanupPaths.length > 0) {
        logSummaryProgress({
          scope: 'asr',
          stage: 'ASR 收尾清理中',
          level: 'info',
          taskId: progress?.taskId ?? 'unknown',
          totalLinks: progress?.totalLinks,
          linkIndex: progress?.linkIndex,
          platform: progress?.platform,
          title: progress?.title ?? video.title,
          details: `共 ${cleanupPaths.length} 项`
        })
      }
      cleanupTempFiles(cleanupPaths)
      if (cleanupPaths.length > 0) {
        logSummaryProgress({
          scope: 'asr',
          stage: 'ASR 收尾清理完成',
          level: 'info',
          taskId: progress?.taskId ?? 'unknown',
          totalLinks: progress?.totalLinks,
          linkIndex: progress?.linkIndex,
          platform: progress?.platform,
          title: progress?.title ?? video.title,
          details: `共 ${cleanupPaths.length} 项`
        })
      }
    }
  }

  return {
    ...input,
    asrTexts,
    videoFrames
  }
}
