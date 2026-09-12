import fs from 'node:fs'

import { ffmpeg, logger } from 'node-karin'

export const DOUYIN_LIVE_QUALITIES = ['auto', 'FULL_HD1', 'HD1', 'SD1', 'SD2'] as const
export type DouyinLiveQuality = typeof DOUYIN_LIVE_QUALITIES[number]

type DouyinLiveHeadersOptions = {
  userAgent?: string
  cookie?: string
}

type DouyinLiveRecordCommandOptions = {
  streamUrl: string
  outputPath: string
  durationSeconds: number
  headers: Record<string, string>
}

type RecordDouyinLiveStreamOptions = DouyinLiveRecordCommandOptions & {
  runFfmpeg?: typeof ffmpeg
}

type DouyinLiveRoomInfoFetcher = (options: {
  room_id: string
  web_rid: string
  typeMode: 'strict'
}) => Promise<Record<string, unknown>>

type DouyinLiveReflowInfoFetcher = (
  roomId: number | string,
  headers: Record<string, string>
) => Promise<Record<string, unknown>>

type FetchDouyinLiveDataFromReflowOptions = {
  roomId: number | string
  headers: Record<string, string>
  fetchLiveRoomInfo?: DouyinLiveRoomInfoFetcher
  fetchReflowInfo?: DouyinLiveReflowInfoFetcher
  onFreshFetchError?: (error: unknown, webRid: string) => void
}

type DouyinLiveStreamUrl = {
  default_resolution?: string
  flv_pull_url?: unknown
  hls_pull_url?: unknown
  hls_pull_url_map?: unknown
}

export type DouyinLiveStreamSource = DouyinLiveStreamUrl | {
  stream_url?: DouyinLiveStreamUrl
  web_stream_url?: DouyinLiveStreamUrl
}

export type DouyinLiveStream = {
  url: string
  format: 'flv' | 'hls'
  quality: string
}

const DEFAULT_USER_AGENT = 'Mozilla/5.0'
const DEFAULT_RECORD_SECONDS = 10
const MAX_RECORD_SECONDS = 120
const QUALITY_PRIORITY = ['FULL_HD1', 'HD1', 'SD1', 'SD2'] as const
const REFLOW_INFO_ENDPOINT = 'https://webcast.amemv.com/webcast/room/reflow/info/'
const WEB_ENTER_INFO_ENDPOINT = 'https://live.douyin.com/webcast/room/web/enter/'

const sanitizeHeaderValue = (value: string): string => {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

export const normalizeDouyinLiveRecordSeconds = (value: unknown): number => {
  const seconds = Math.round(Number(value))
  if (!Number.isFinite(seconds) || seconds < 1) return DEFAULT_RECORD_SECONDS
  return Math.min(MAX_RECORD_SECONDS, seconds)
}

export const normalizeDouyinLiveQuality = (value: unknown): DouyinLiveQuality => {
  return DOUYIN_LIVE_QUALITIES.includes(value as DouyinLiveQuality)
    ? value as DouyinLiveQuality
    : 'auto'
}

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

const toNonEmptyString = (value: unknown): string => {
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

const isDouyinLiveContainer = (value: unknown): boolean => {
  const record = asRecord(value)
  if (!record) return false
  return Array.isArray(record.data) ||
    Boolean(asRecord(record.room)) ||
    Boolean(asRecord(record.web_stream_url)) ||
    Boolean(asRecord(record.partition_road_map)) ||
    'room_status' in record ||
    'enter_room_id' in record
}

export const getDouyinLiveContainer = (source: unknown): Record<string, unknown> | undefined => {
  const record = asRecord(source)
  if (!record) return undefined
  if (isDouyinLiveContainer(record)) return record

  const data = asRecord(record.data)
  if (isDouyinLiveContainer(data)) return data

  const nestedData = asRecord(data?.data)
  if (isDouyinLiveContainer(nestedData)) return nestedData
}

export const getDouyinLiveItems = (source: unknown): Record<string, unknown>[] => {
  const record = asRecord(source)
  if (asRecord(record?.stream_url)) return [record as Record<string, unknown>]
  const directRoom = asRecord(record?.room)
  if (directRoom) return [directRoom]

  const container = getDouyinLiveContainer(source)
  const room = asRecord(container?.room)
  if (room) return [room]
  if (!Array.isArray(container?.data)) return []

  return container.data
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
}

export const getDouyinLiveItem = (source: unknown): Record<string, unknown> | undefined => {
  return getDouyinLiveItems(source)[0]
}

export const getDouyinLiveStatus = (source: unknown): number | undefined => {
  const item = getDouyinLiveItem(source) ?? asRecord(source)
  const status = Number(item?.status ?? item?.room_status)
  return Number.isFinite(status) ? status : undefined
}

export const getDouyinLiveWebRid = (source: unknown): string => {
  const record = asRecord(source)
  const liveItem = getDouyinLiveItem(source)
  const container = getDouyinLiveContainer(source)
  const owner = asRecord(liveItem?.owner) ?? asRecord(container?.owner) ?? asRecord(container?.user)

  return toNonEmptyString(owner?.web_rid) ||
    toNonEmptyString(liveItem?.web_rid) ||
    toNonEmptyString(container?.web_rid) ||
    toNonEmptyString(record?.web_rid)
}

export const isDouyinLiveStatusActive = (source: unknown): boolean => {
  const status = getDouyinLiveStatus(source)
  return status === undefined || status === 2
}

const extractStreamUrls = (source: unknown): DouyinLiveStreamUrl[] => {
  const record = asRecord(source)
  if (!record) return []

  const urls: DouyinLiveStreamUrl[] = []
  const push = (value: unknown) => {
    const streamUrl = asRecord(value)
    if (streamUrl && !urls.includes(streamUrl as DouyinLiveStreamUrl)) {
      urls.push(streamUrl as DouyinLiveStreamUrl)
    }
  }

  push(record.stream_url)

  const liveItem = getDouyinLiveItem(record)
  push(liveItem?.stream_url)

  push(record.web_stream_url)

  const container = getDouyinLiveContainer(record)
  push(container?.web_stream_url)

  if ('flv_pull_url' in record || 'hls_pull_url' in record || 'hls_pull_url_map' in record) {
    push(record)
  }

  return urls
}

const normalizeUrlMap = (value: unknown): Record<string, string> => {
  const record = asRecord(value)
  if (!record) return {}

  return Object.fromEntries(
    Object.entries(record)
      .filter(([, url]) => typeof url === 'string' && url.trim())
      .map(([quality, url]) => [quality, (url as string).trim()])
  )
}

const buildQualityCandidates = (
  requestedQuality: DouyinLiveQuality,
  defaultResolution?: string
): string[] => {
  const candidates: string[] = []
  const push = (quality?: string) => {
    const normalized = quality?.trim()
    if (normalized && !candidates.includes(normalized)) candidates.push(normalized)
  }

  if (requestedQuality !== 'auto') push(requestedQuality)
  QUALITY_PRIORITY.forEach(push)
  push(defaultResolution)

  return candidates
}

const pickQualityUrl = (
  urls: Record<string, string>,
  requestedQuality: DouyinLiveQuality,
  defaultResolution?: string
): { url: string, quality: string } | undefined => {
  for (const quality of buildQualityCandidates(requestedQuality, defaultResolution)) {
    const url = urls[quality]
    if (url) return { url, quality }
  }

  const fallback = Object.entries(urls).find(([, url]) => url)
  return fallback ? { quality: fallback[0], url: fallback[1] } : undefined
}

export const selectDouyinLiveStream = (
  source: unknown,
  quality: unknown = 'auto'
): DouyinLiveStream | undefined => {
  const liveQuality = normalizeDouyinLiveQuality(quality)

  for (const streamUrl of extractStreamUrls(source)) {
    const defaultResolution = streamUrl.default_resolution
    const flv = pickQualityUrl(normalizeUrlMap(streamUrl.flv_pull_url), liveQuality, defaultResolution)
    if (flv) return { ...flv, format: 'flv' }

    const hls = pickQualityUrl(normalizeUrlMap(streamUrl.hls_pull_url_map), liveQuality, defaultResolution)
    if (hls) return { ...hls, format: 'hls' }

    if (typeof streamUrl.hls_pull_url === 'string' && streamUrl.hls_pull_url.trim()) {
      return {
        url: streamUrl.hls_pull_url.trim(),
        format: 'hls',
        quality: defaultResolution?.trim() || 'default'
      }
    }
  }
}

export const buildDouyinLiveRecordHeaders = (options: DouyinLiveHeadersOptions): Record<string, string> => {
  return {
    'User-Agent': sanitizeHeaderValue(options.userAgent ?? '') || DEFAULT_USER_AGENT,
    Referer: 'https://live.douyin.com'
  }
}

export const buildDouyinLiveInfoHeaders = (options: DouyinLiveHeadersOptions): Record<string, string> => {
  const headers = buildDouyinLiveRecordHeaders(options)
  const cookie = sanitizeHeaderValue(options.cookie ?? '')
  if (cookie) headers.Cookie = cookie
  return headers
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

export const buildDouyinLiveRecordCommand = (options: DouyinLiveRecordCommandOptions): string => {
  const duration = normalizeDouyinLiveRecordSeconds(options.durationSeconds)
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

export const buildDouyinLiveReflowInfoUrl = (roomId: number | string): string => {
  const search = new URLSearchParams({
    verifyFp: 'verify_lz',
    type_id: '0',
    live_id: '1',
    version_code: '99.99.99',
    app_id: '1128',
    room_id: String(roomId)
  })
  return `${REFLOW_INFO_ENDPOINT}?${search.toString()}`
}

export const buildDouyinLiveWebEnterInfoUrl = (roomId: number | string, webRid: string): string => {
  const search = new URLSearchParams({
    aid: '6383',
    app_name: 'douyin_web',
    live_id: '1',
    device_platform: 'web',
    language: 'zh-CN',
    enter_from: 'web_share_link',
    cookie_enabled: 'true',
    screen_width: '1920',
    screen_height: '1080',
    browser_language: 'zh-CN',
    browser_platform: 'Win32',
    browser_name: 'Chrome',
    browser_version: '130.0.0.0',
    web_rid: webRid,
    room_id_str: String(roomId),
    enter_source: '',
    is_need_double_stream: 'false',
    insert_task_id: '',
    live_reason: ''
  })
  return `${WEB_ENTER_INFO_ENDPOINT}?${search.toString()}`
}

export const parseDouyinLiveApiObject = (value: unknown, sourceName: string): Record<string, unknown> => {
  let data = value
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      throw new Error(`${sourceName}没有返回有效 JSON`)
    }
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${sourceName}没有返回有效数据`)
  }

  return data as Record<string, unknown>
}

export const fetchDouyinLiveReflowInfo = async (
  roomId: number | string,
  headers: Record<string, string>
): Promise<Record<string, unknown>> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch(buildDouyinLiveReflowInfoUrl(roomId), {
      headers,
      signal: controller.signal
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`抖音直播 reflow 接口返回 HTTP ${response.status}`)
    }

    return parseDouyinLiveApiObject(text, '抖音直播 reflow 接口')
  } finally {
    clearTimeout(timeout)
  }
}

export const fetchDouyinLiveWebEnterInfo = async (
  roomId: number | string,
  webRid: string,
  headers: Record<string, string>
): Promise<Record<string, unknown>> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch(buildDouyinLiveWebEnterInfoUrl(roomId, webRid), {
      headers,
      signal: controller.signal
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`抖音直播实时接口返回 HTTP ${response.status}`)
    }

    return parseDouyinLiveApiObject(text, '抖音直播实时接口')
  } finally {
    clearTimeout(timeout)
  }
}

export const fetchDouyinLiveDataFromReflow = async (
  options: FetchDouyinLiveDataFromReflowOptions
): Promise<Record<string, unknown>> => {
  const reflowData = await (options.fetchReflowInfo ?? fetchDouyinLiveReflowInfo)(options.roomId, options.headers)
  const webRid = getDouyinLiveWebRid(reflowData)
  if (!webRid) return reflowData

  try {
    const fetchLiveRoomInfo = options.fetchLiveRoomInfo ??
      ((request) => fetchDouyinLiveWebEnterInfo(request.room_id, request.web_rid, options.headers))
    const freshData = await fetchLiveRoomInfo({
      room_id: String(options.roomId),
      web_rid: webRid,
      typeMode: 'strict'
    })
    if (!getDouyinLiveContainer(freshData) && !getDouyinLiveItem(freshData)) {
      return reflowData
    }
    if (!getDouyinLiveWebRid(freshData)) {
      freshData.web_rid = webRid
    }

    return freshData
  } catch (error) {
    options.onFreshFetchError?.(error, webRid)
    return reflowData
  }
}

export const recordDouyinLiveStream = async (options: RecordDouyinLiveStreamOptions): Promise<boolean> => {
  const runFfmpeg = options.runFfmpeg ?? ffmpeg
  const command = buildDouyinLiveRecordCommand(options)
  const timeout = (normalizeDouyinLiveRecordSeconds(options.durationSeconds) + 45) * 1000
  const result = await runFfmpeg(command, { timeout })

  if (result.status && fs.existsSync(options.outputPath)) {
    logger.mark(`[DouyinLiveRecorder] 直播片段录制完成: ${options.outputPath}`)
    return true
  }

  logger.error('[DouyinLiveRecorder] 直播片段录制失败', result)
  return false
}
