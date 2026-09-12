import fs from 'node:fs'

import { ffmpeg, logger } from 'node-karin'

export const BILIBILI_LIVE_QUALITIES = [80, 150, 250, 400, 10000] as const
export type BilibiliLiveQuality = typeof BILIBILI_LIVE_QUALITIES[number]

type BilibiliLiveUrlInfo = {
  host?: string
  extra?: string
}

type BilibiliLiveCodec = {
  codec_name?: string
  current_qn?: number
  base_url?: string
  url_info?: BilibiliLiveUrlInfo[]
}

type BilibiliLiveFormat = {
  format_name?: string
  codec?: BilibiliLiveCodec[]
}

type BilibiliLiveProtocol = {
  protocol_name?: string
  format?: BilibiliLiveFormat[]
}

export type BilibiliLivePlayInfo = {
  code?: number
  message?: string
  data?: {
    playurl_info?: {
      playurl?: {
        stream?: BilibiliLiveProtocol[]
      }
    }
  }
}

export type BilibiliLiveStream = {
  url: string
  protocolName: string
  formatName: string
  codecName: string
  currentQn?: number
}

type BilibiliLiveHeadersOptions = {
  userAgent?: string
  cookie?: string
}

type BilibiliLiveRecordCommandOptions = {
  streamUrl: string
  outputPath: string
  durationSeconds: number
  headers: Record<string, string>
}

type RecordBilibiliLiveStreamOptions = BilibiliLiveRecordCommandOptions & {
  runFfmpeg?: typeof ffmpeg
}

const LIVE_PLAY_INFO_ENDPOINT = 'https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo'
const DEFAULT_USER_AGENT = 'Mozilla/5.0'
const DEFAULT_RECORD_SECONDS = 10
const MAX_RECORD_SECONDS = 120
const STREAM_PRIORITY = [
  ['http_stream', 'flv', 'avc'],
  ['http_hls', 'ts', 'avc'],
  ['http_hls', 'fmp4', 'avc']
] as const

const sanitizeHeaderValue = (value: string): string => {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

export const normalizeBilibiliLiveRecordSeconds = (value: unknown): number => {
  const seconds = Math.round(Number(value))
  if (!Number.isFinite(seconds) || seconds < 1) return DEFAULT_RECORD_SECONDS
  return Math.min(MAX_RECORD_SECONDS, seconds)
}

export const normalizeBilibiliLiveQuality = (value: unknown): BilibiliLiveQuality => {
  const quality = Number(value)
  return BILIBILI_LIVE_QUALITIES.includes(quality as BilibiliLiveQuality)
    ? quality as BilibiliLiveQuality
    : 10000
}

export const buildBilibiliLivePlayInfoUrl = (roomId: number | string, quality: number): string => {
  const search = new URLSearchParams({
    room_id: String(roomId),
    protocol: '0,1',
    format: '0,1,2',
    codec: '0',
    qn: String(quality),
    platform: 'web',
    ptype: '8',
    dolby: '5',
    panorama: '1'
  })
  return `${LIVE_PLAY_INFO_ENDPOINT}?${search.toString()}`
}

export const parseBilibiliLiveApiObject = (value: unknown, sourceName: string): BilibiliLivePlayInfo => {
  let data = value
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      throw new Error(`${sourceName}没有返回有效 JSON`)
    }
  }

  if (!data || typeof data !== 'object') {
    throw new Error(`${sourceName}没有返回有效数据`)
  }

  return data as BilibiliLivePlayInfo
}

const joinStreamUrl = (host: string, baseUrl: string, extra: string): string => {
  const normalizedHost = host.replace(/\/$/, '')
  if (!extra) return `${normalizedHost}${baseUrl}`
  if (baseUrl.endsWith('?') || baseUrl.endsWith('&')) return `${normalizedHost}${baseUrl}${extra}`
  return `${normalizedHost}${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${extra}`
}

const flattenStreams = (playInfo: BilibiliLivePlayInfo): BilibiliLiveStream[] => {
  const streams = playInfo.data?.playurl_info?.playurl?.stream ?? []
  const result: BilibiliLiveStream[] = []

  for (const stream of streams) {
    for (const format of stream.format ?? []) {
      for (const codec of format.codec ?? []) {
        const baseUrl = codec.base_url
        const urlInfo = codec.url_info?.find(item => item.host)
        if (!baseUrl || !urlInfo?.host) continue

        result.push({
          url: joinStreamUrl(urlInfo.host, baseUrl, urlInfo.extra ?? ''),
          protocolName: stream.protocol_name ?? '',
          formatName: format.format_name ?? '',
          codecName: codec.codec_name ?? '',
          currentQn: codec.current_qn
        })
      }
    }
  }

  return result
}

export const selectBilibiliLiveStream = (playInfo: BilibiliLivePlayInfo): BilibiliLiveStream | undefined => {
  const candidates = flattenStreams(playInfo)

  for (const [protocolName, formatName, codecName] of STREAM_PRIORITY) {
    const match = candidates.find(item =>
      item.protocolName === protocolName &&
      item.formatName === formatName &&
      item.codecName === codecName
    )
    if (match) return match
  }

  return candidates.find(item => item.codecName === 'avc') ?? candidates[0]
}

const buildBilibiliLiveBaseHeaders = (options: BilibiliLiveHeadersOptions): Record<string, string> => {
  return {
    'User-Agent': sanitizeHeaderValue(options.userAgent ?? '') || DEFAULT_USER_AGENT,
    Referer: 'https://live.bilibili.com'
  }
}

export const buildBilibiliLiveApiHeaders = (options: BilibiliLiveHeadersOptions): Record<string, string> => {
  const headers = buildBilibiliLiveBaseHeaders(options)
  const cookie = sanitizeHeaderValue(options.cookie ?? '')
  if (cookie) headers.Cookie = cookie
  return headers
}

export const buildBilibiliLiveRecordHeaders = (options: BilibiliLiveHeadersOptions): Record<string, string> => {
  return buildBilibiliLiveBaseHeaders(options)
}

export const buildBilibiliLiveHeaders = (options: BilibiliLiveHeadersOptions): Record<string, string> => {
  return buildBilibiliLiveApiHeaders(options)
}

const quoteFFmpegArg = (value: string): string => {
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`
}

const buildFFmpegHttpInputOptions = (headers: Record<string, string>): string[] => {
  const options: string[] = []
  const userAgent = sanitizeHeaderValue(headers['User-Agent'] ?? '') || DEFAULT_USER_AGENT
  const referer = sanitizeHeaderValue(headers.Referer ?? '')

  options.push('-user_agent', quoteFFmpegArg(userAgent))
  if (referer) options.push('-referer', quoteFFmpegArg(referer))

  return options
}

export const buildBilibiliLiveRecordCommand = (options: BilibiliLiveRecordCommandOptions): string => {
  const duration = normalizeBilibiliLiveRecordSeconds(options.durationSeconds)
  return [
    '-y',
    '-hide_banner',
    '-loglevel warning',
    ...buildFFmpegHttpInputOptions(options.headers),
    '-t',
    String(duration),
    '-i',
    quoteFFmpegArg(options.streamUrl),
    '-c copy',
    '-movflags +faststart',
    quoteFFmpegArg(options.outputPath)
  ].join(' ')
}

export const fetchBilibiliLivePlayInfo = async (
  roomId: number | string,
  quality: BilibiliLiveQuality,
  headers: Record<string, string>
): Promise<BilibiliLivePlayInfo> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  let playInfo: BilibiliLivePlayInfo
  try {
    const response = await fetch(buildBilibiliLivePlayInfoUrl(roomId, quality), {
      headers,
      signal: controller.signal
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`B站直播流接口返回 HTTP ${response.status}`)
    }

    playInfo = parseBilibiliLiveApiObject(text, 'B站直播流接口')
  } finally {
    clearTimeout(timeout)
  }
  if (typeof playInfo.code === 'number' && playInfo.code !== 0) {
    throw new Error(`B站直播流接口返回错误: ${playInfo.message ?? playInfo.code}`)
  }

  return playInfo
}

export const recordBilibiliLiveStream = async (options: RecordBilibiliLiveStreamOptions): Promise<boolean> => {
  const runFfmpeg = options.runFfmpeg ?? ffmpeg
  const command = buildBilibiliLiveRecordCommand(options)
  const timeout = (normalizeBilibiliLiveRecordSeconds(options.durationSeconds) + 45) * 1000
  const result = await runFfmpeg(command, { timeout })

  if (result.status && fs.existsSync(options.outputPath)) {
    logger.mark(`[BilibiliLiveRecorder] 直播片段录制完成: ${options.outputPath}`)
    return true
  }

  logger.error('[BilibiliLiveRecorder] 直播片段录制失败', result)
  return false
}
