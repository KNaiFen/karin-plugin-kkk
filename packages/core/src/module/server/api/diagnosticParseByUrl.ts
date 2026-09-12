import {
  createBadRequestResponse,
  createServerErrorResponse,
  createSuccessResponse,
  logger
} from 'node-karin'
import type { RequestHandler } from 'node-karin/express'

import {
  extractBilibiliMessageUrl,
  extractDouyinMessageUrl,
  extractGithubMessageUrl,
  extractHeyBoxMessageUrl,
  extractKuaishouMessageUrl,
  extractTiebaMessageUrl,
  extractTikTokMessageUrl,
  extractWechatMessageUrl,
  extractWeiboMessageUrl,
  extractXMessageUrl,
  extractXiaohongshuMessageUrl,
  extractZhihuMessageUrl
} from '@/apps/linkExtractors'
import { resolveParsedPostWithCache } from '@/module/summaryParse/parsedPostCache'
import type { SummaryParsePlatform } from '@/module/summaryParse/types'
import {
  normalizePlainTitleReplyConfig,
  type PlainTitleReplyType,
  type PlainVideoTitlePlatform
} from '@/module/utils/PlainTitleReply'
import { Config } from '@/module/utils/Config'
import { guestCookieManager } from '@/module/utils/GuestCookieManager'
import type { ParsedPost } from '@/platform/parsedPost'
import { DouYin } from '@/platform/douyin'
import { getBilibiliID } from '@/platform/bilibili/getID'
import { getDouyinID } from '@/platform/douyin/getID'
import { getGithubID } from '@/platform/github/getID'
import { getHeyboxID } from '@/platform/heybox/getID'
import { getKuaishouID } from '@/platform/kuaishou/getID'
import { getTiebaID } from '@/platform/tieba/getID'
import { getTikTokID } from '@/platform/tiktok/getID'
import { getWechatID } from '@/platform/wechat/getID'
import { getWeiboID } from '@/platform/weibo/getID'
import { getXID } from '@/platform/x/getID'
import { getXiaohongshuID } from '@/platform/xiaohongshu/getID'
import { getZhihuID } from '@/platform/zhihu/getID'

export const DIAGNOSTIC_PARSE_BY_URL_PLATFORMS = [
  'douyin',
  'bilibili',
  'tiktok',
  'kuaishou',
  'xiaohongshu',
  'heybox',
  'x',
  'github',
  'zhihu',
  'tieba',
  'wechat',
  'weibo'
] as const satisfies readonly SummaryParsePlatform[]

export type DiagnosticParseByUrlPlatform = typeof DIAGNOSTIC_PARSE_BY_URL_PLATFORMS[number]

type DiagnosticRequestPayload = {
  input?: string
  url?: string
  message?: string
}

type DiagnosticDescriptor = {
  label: PlainVideoTitlePlatform
  extract: (input: string) => string | null
  ensureReady?: () => Promise<unknown>
  resolveIdData: (url: string) => Promise<unknown>
}

type DiagnosticSimulationOutput = {
  channel: 'reply' | 'forward'
  elementTypes: string[]
}

type DiagnosticSimulationSummary = {
  replyCount: number
  forwardCount: number
  outputs: DiagnosticSimulationOutput[]
  contains: {
    image: boolean
    record: boolean
    video: boolean
  }
}

const defaultPlainTitleTypes: Record<DiagnosticParseByUrlPlatform, PlainTitleReplyType[]> = {
  douyin: ['video', 'image', 'article', 'live'],
  bilibili: ['video', 'image', 'article', 'live', 'text'],
  tiktok: ['video'],
  kuaishou: ['video'],
  xiaohongshu: ['video', 'image'],
  heybox: ['video', 'image', 'text'],
  x: ['video', 'image', 'text'],
  github: ['text', 'image'],
  zhihu: ['video', 'image', 'text'],
  tieba: ['video', 'image', 'text'],
  wechat: ['image', 'text'],
  weibo: ['video', 'image', 'text']
}

const defaultSendContent: Partial<Record<DiagnosticParseByUrlPlatform, string[]>> = {
  douyin: ['info', 'comment', 'video'],
  bilibili: ['info', 'video', 'comment'],
  xiaohongshu: ['info', 'comment', 'image', 'video'],
  heybox: ['info', 'comment', 'image', 'video'],
  x: ['info', 'image', 'video'],
  github: ['info', 'image'],
  zhihu: ['info', 'image', 'video'],
  tieba: ['info', 'comment', 'image', 'video'],
  wechat: ['info', 'image'],
  weibo: ['info', 'image', 'video']
}

const bilibiliTokenPattern = /^(BV[1-9A-Za-z]{10}|av\d+)$/i

const normalizeBilibiliInput = (input: string): string | null => {
  const trimmed = input.trim().replace(/\\/g, '')
  if (bilibiliTokenPattern.test(trimmed)) {
    return `https://www.bilibili.com/video/${trimmed}`
  }
  return extractBilibiliMessageUrl(trimmed)
}

const diagnosticDescriptors: Record<DiagnosticParseByUrlPlatform, DiagnosticDescriptor> = {
  douyin: {
    label: '抖音',
    extract: extractDouyinMessageUrl,
    ensureReady: async () => await guestCookieManager.ensureFreshCookie('douyin', { waitForStale: true }),
    resolveIdData: async (url) => await getDouyinID({} as any, url, false)
  },
  bilibili: {
    label: 'B站',
    extract: normalizeBilibiliInput,
    resolveIdData: async (url) => await getBilibiliID(url)
  },
  tiktok: {
    label: 'TikTok',
    extract: extractTikTokMessageUrl,
    ensureReady: async () => await guestCookieManager.ensureFreshCookie('tiktok', { waitForStale: true }),
    resolveIdData: async (url) => await getTikTokID(url, false)
  },
  kuaishou: {
    label: '快手',
    extract: extractKuaishouMessageUrl,
    resolveIdData: async (url) => await getKuaishouID(url, false)
  },
  xiaohongshu: {
    label: '小红书',
    extract: extractXiaohongshuMessageUrl,
    ensureReady: async () => await guestCookieManager.ensureFreshCookie('xiaohongshu', { waitForStale: true }),
    resolveIdData: async (url) => await getXiaohongshuID(url, false)
  },
  heybox: {
    label: '小黑盒',
    extract: extractHeyBoxMessageUrl,
    ensureReady: async () => await guestCookieManager.ensureFreshCookie('heybox', { waitForStale: true }),
    resolveIdData: async (url) => await getHeyboxID(url, false)
  },
  x: {
    label: 'X',
    extract: extractXMessageUrl,
    resolveIdData: async (url) => await getXID(url, false)
  },
  github: {
    label: 'GitHub',
    extract: extractGithubMessageUrl,
    resolveIdData: async (url) => await getGithubID(url, false)
  },
  zhihu: {
    label: '知乎',
    extract: extractZhihuMessageUrl,
    ensureReady: async () => await guestCookieManager.ensureFreshCookie('zhihu', { waitForStale: true }),
    resolveIdData: async (url) => await getZhihuID(url, false)
  },
  tieba: {
    label: '贴吧',
    extract: extractTiebaMessageUrl,
    resolveIdData: async (url) => await getTiebaID(url, false)
  },
  wechat: {
    label: '微信公众号',
    extract: extractWechatMessageUrl,
    resolveIdData: async (url) => await getWechatID(url)
  },
  weibo: {
    label: '微博',
    extract: extractWeiboMessageUrl,
    ensureReady: async () => await guestCookieManager.ensureFreshCookie('weibo', { waitForStale: true }),
    resolveIdData: async (url) => await getWeiboID(url, false)
  }
}

class DiagnosticInputError extends Error {}

const normalizeInput = (payload: DiagnosticRequestPayload): string => {
  const raw = payload.input ?? payload.url ?? payload.message ?? ''
  return String(raw).trim()
}

const inferPlainTitleType = (post: ParsedPost): PlainTitleReplyType => {
  if (post.subtype === 'live') return 'live'
  if (post.subtype === 'article') return 'article'
  if (post.primaryVideo?.url || post.videos.length > 0) return 'video'
  if (post.images.length > 0 || post.subtype === 'image' || post.subtype === 'note') return 'image'
  return 'text'
}

const normalizePlainText = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim()

const collectElementTypes = (
  payload: unknown,
  bucket: Set<string>,
  seen: WeakSet<object>,
  treatStringAsText: boolean
) => {
  if (typeof payload === 'string') {
    if (treatStringAsText && payload.trim()) {
      bucket.add('text')
    }
    return
  }

  if (!payload || typeof payload !== 'object') {
    return
  }

  if (seen.has(payload)) {
    return
  }
  seen.add(payload)

  if (Array.isArray(payload)) {
    payload.forEach(item => collectElementTypes(item, bucket, seen, true))
    return
  }

  const record = payload as Record<string, unknown>
  if (typeof record.type === 'string' && record.type.trim()) {
    bucket.add(record.type.trim())
  }

  Object.values(record).forEach(value => collectElementTypes(value, bucket, seen, false))
}

const toElementTypes = (payload: unknown): string[] => {
  const bucket = new Set<string>()
  collectElementTypes(payload, bucket, new WeakSet(), true)
  return bucket.size > 0 ? [...bucket] : ['unknown']
}

const formatPlainTitleText = (
  label: PlainVideoTitlePlatform,
  title: string,
  author?: string
): string | null => {
  const normalizedTitle = normalizePlainText(title)
  if (!normalizedTitle) return null

  const normalizedAuthor = normalizePlainText(author)
  return normalizedAuthor
    ? `【${label}】${normalizedAuthor}：${normalizedTitle}`
    : `${label}标题：${normalizedTitle}`
}

const summarizeParsedPost = (post: ParsedPost) => ({
  platform: post.platform,
  platformLabel: post.platformLabel,
  subtype: post.subtype,
  title: post.title,
  url: post.url,
  author: post.author?.name ?? '',
  summary: post.summary ?? '',
  contentBlockCount: post.contentBlocks.length,
  imageCount: post.images.length,
  videoCount: post.videos.length,
  hasPrimaryVideo: Boolean(post.primaryVideo?.url),
  statsCount: post.stats.length,
  metaCount: post.meta.length
})

const sanitizeSensitiveValue = (value: unknown): string => {
  const text = String(value ?? '')
  return `[redacted len:${text.length}]`
}

const sanitizeIdData = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(item => sanitizeIdData(item))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => {
      if (/(cookie|token|authorization|signature)/i.test(key)) {
        return [key, sanitizeSensitiveValue(nestedValue)]
      }
      return [key, sanitizeIdData(nestedValue)]
    })
  )
}

const getPlatformConfig = (platform: DiagnosticParseByUrlPlatform): Record<string, any> => {
  return (Config as Record<string, any>)[platform] ?? {}
}

const buildReplySummary = (
  platform: DiagnosticParseByUrlPlatform,
  label: PlainVideoTitlePlatform,
  post: ParsedPost
) => {
  const platformConfig = getPlatformConfig(platform)
  const contentType = inferPlainTitleType(post)
  const plainTitleConfig = normalizePlainTitleReplyConfig(
    platformConfig.plainTitleReply,
    defaultPlainTitleTypes[platform]
  )
  const plainTitleText = plainTitleConfig.switch && plainTitleConfig.types.includes(contentType)
    ? formatPlainTitleText(label, post.title, post.author?.name)
    : null

  const renderCardEnabled = platformConfig.renderCard?.enable !== false
  const plannedOutputs: string[] = []
  const notes: string[] = []

  if (plainTitleText) {
    plannedOutputs.push('plain-title')
  }

  if (platform === 'tiktok') {
    if (post.primaryVideo?.url || post.videos.length > 0) {
      plannedOutputs.push('video')
    }
    notes.push('该平台完整 handler 会直接下载视频，诊断接口只返回轻量回复摘要，未执行完整 handler。')
    return {
      contentType,
      plainTitleEnabled: plainTitleConfig.switch,
      plainTitleText,
      plannedOutputs,
      renderCardEnabled: false,
      fullHandlerDownloadsMedia: plannedOutputs.includes('video'),
      notes
    }
  }

  if (platform === 'kuaishou') {
    if (platformConfig.comment !== false) {
      plannedOutputs.push('comment')
    }
    if (post.primaryVideo?.url || post.videos.length > 0) {
      plannedOutputs.push('video')
    }
    notes.push('该平台完整 handler 会渲染评论并下载视频，诊断接口只返回轻量回复摘要，未执行完整 handler。')
    return {
      contentType,
      plainTitleEnabled: plainTitleConfig.switch,
      plainTitleText,
      plannedOutputs,
      renderCardEnabled: true,
      fullHandlerDownloadsMedia: plannedOutputs.includes('video'),
      notes
    }
  }

  const sendContent = Array.isArray(platformConfig.sendContent) && platformConfig.sendContent.length > 0
    ? platformConfig.sendContent
    : (defaultSendContent[platform] ?? [])

  for (const item of sendContent) {
    if (!plannedOutputs.includes(item)) {
      plannedOutputs.push(item)
    }
  }

  return {
    contentType,
    plainTitleEnabled: plainTitleConfig.switch,
    plainTitleText,
    plannedOutputs,
    renderCardEnabled,
    fullHandlerDownloadsMedia: plannedOutputs.includes('video') && Boolean(post.primaryVideo?.url),
    notes
  }
}

const createSyntheticDiagnosticEvent = () => {
  const outputs: DiagnosticSimulationOutput[] = []
  let sequence = 0
  const nextMessageId = () => `diagnostic-msg-${++sequence}`

  const recordOutput = (channel: DiagnosticSimulationOutput['channel'], payload: unknown) => {
    outputs.push({
      channel,
      elementTypes: toElementTypes(payload)
    })
  }

  const event = {
    msg: '',
    isGroup: true,
    messageId: 'diagnostic-source-message',
    userId: 'diagnostic-user',
    sender: {
      userId: 'diagnostic-user',
      nick: 'diagnostic-user'
    },
    contact: {
      scene: 'group',
      peer: 'diagnostic-group'
    },
    bot: {
      account: {
        selfId: 'diagnostic-bot',
        name: 'diagnostic-bot'
      },
      adapter: {
        name: 'diagnostic-adapter'
      },
      async sendForwardMsg (_contact: unknown, payload: unknown) {
        recordOutput('forward', payload)
        return { messageId: nextMessageId() }
      },
      async sendMsg (_contact: unknown, payload: unknown) {
        recordOutput('reply', payload)
        return { messageId: nextMessageId() }
      }
    },
    async reply (payload: unknown) {
      recordOutput('reply', payload)
      return { messageId: nextMessageId() }
    }
  } as any

  return {
    event,
    summarize (): DiagnosticSimulationSummary {
      return {
        replyCount: outputs.filter(output => output.channel === 'reply').length,
        forwardCount: outputs.filter(output => output.channel === 'forward').length,
        outputs,
        contains: {
          image: outputs.some(output => output.elementTypes.includes('image')),
          record: outputs.some(output => output.elementTypes.includes('record')),
          video: outputs.some(output => output.elementTypes.includes('video'))
        }
      }
    }
  }
}

const runDouyinHandlerSimulation = async (idData: unknown): Promise<DiagnosticSimulationSummary> => {
  const synthetic = createSyntheticDiagnosticEvent()
  synthetic.event.__kkkDiagnosticOptions = {
    parseTip: false,
    sendContent: ['video']
  }
  await new DouYin(synthetic.event, idData as any).DouyinHandler(idData as any)
  return synthetic.summarize()
}

export const runDiagnosticParseByUrl = async (
  platform: DiagnosticParseByUrlPlatform,
  payload: DiagnosticRequestPayload
) => {
  const descriptor = diagnosticDescriptors[platform]
  const input = normalizeInput(payload)
  if (!input) {
    throw new DiagnosticInputError('请提供 input、url 或 message 字段')
  }

  const timingsMs = {
    extract: 0,
    ensureReady: 0,
    getId: 0,
    parse: 0,
    total: 0
  }
  const warnings: string[] = []
  const startedAt = Date.now()

  const extractStartedAt = Date.now()
  const extractedUrl = descriptor.extract(input)
  timingsMs.extract = Date.now() - extractStartedAt
  if (!extractedUrl) {
    throw new DiagnosticInputError(`未能提取有效的 ${descriptor.label} 链接`)
  }
  if (extractedUrl !== input) {
    warnings.push('输入中包含额外文本，已自动提取平台链接。')
  }
  if (platform === 'bilibili' && bilibiliTokenPattern.test(input)) {
    warnings.push('已将 BV/AV 号归一化为标准 B站 视频链接。')
  }

  if (descriptor.ensureReady) {
    const ensureStartedAt = Date.now()
    await descriptor.ensureReady()
    timingsMs.ensureReady = Date.now() - ensureStartedAt
  }

  const idStartedAt = Date.now()
  const rawIdData = await descriptor.resolveIdData(extractedUrl)
  timingsMs.getId = Date.now() - idStartedAt

  const parseStartedAt = Date.now()
  const { parsedPost, cacheHit } = await resolveParsedPostWithCache({
    platform,
    url: extractedUrl
  })
  timingsMs.parse = Date.now() - parseStartedAt
  timingsMs.total = Date.now() - startedAt

  return {
    platform,
    input,
    extractedUrl,
    idData: sanitizeIdData(rawIdData),
    cache: {
      parsedPostHit: cacheHit
    },
    contentSummary: summarizeParsedPost(parsedPost),
    replySummary: buildReplySummary(platform, descriptor.label, parsedPost),
    warnings,
    timingsMs,
    parsedPost
  }
}

export const runDiagnosticSimulateHandlerByUrl = async (
  platform: DiagnosticParseByUrlPlatform,
  payload: DiagnosticRequestPayload
) => {
  const descriptor = diagnosticDescriptors[platform]
  const input = normalizeInput(payload)
  if (!input) {
    throw new DiagnosticInputError('请提供 input、url 或 message 字段')
  }

  const extractStartedAt = Date.now()
  const extractedUrl = descriptor.extract(input)
  const extractMs = Date.now() - extractStartedAt
  if (!extractedUrl) {
    throw new DiagnosticInputError(`未能提取有效的 ${descriptor.label} 链接`)
  }

  const idStartedAt = Date.now()
  const rawIdData = await descriptor.resolveIdData(extractedUrl)
  const getIdMs = Date.now() - idStartedAt

  let simulation: DiagnosticSimulationSummary
  const simulateStartedAt = Date.now()
  switch (platform) {
    case 'douyin':
      simulation = await runDouyinHandlerSimulation(rawIdData)
      break
    default:
      throw new Error(`平台 ${platform} 暂未支持 handler 回放诊断`)
  }
  const simulateMs = Date.now() - simulateStartedAt

  return {
    platform,
    input,
    extractedUrl,
    idData: sanitizeIdData(rawIdData),
    simulation,
    timingsMs: {
      extract: extractMs,
      getId: getIdMs,
      simulate: simulateMs,
      total: extractMs + getIdMs + simulateMs
    }
  }
}

export const createParseByUrlHandler = (
  platform: DiagnosticParseByUrlPlatform
): RequestHandler => {
  return async (req, res) => {
    try {
      const data = await runDiagnosticParseByUrl(platform, req.body ?? {})
      return createSuccessResponse(res, data)
    } catch (error) {
      if (error instanceof DiagnosticInputError) {
        return createBadRequestResponse(res, error.message)
      }

      logger.error(`[DiagnosticParseByUrl] ${platform} 诊断解析失败:`, error)
      return createServerErrorResponse(
        res,
        `诊断解析失败: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}

export const createSimulateHandlerByUrlHandler = (
  platform: DiagnosticParseByUrlPlatform
): RequestHandler => {
  return async (req, res) => {
    try {
      const data = await runDiagnosticSimulateHandlerByUrl(platform, req.body ?? {})
      return createSuccessResponse(res, data)
    } catch (error) {
      if (error instanceof DiagnosticInputError) {
        return createBadRequestResponse(res, error.message)
      }

      logger.error(`[DiagnosticSimulateHandlerByUrl] ${platform} 诊断回放失败:`, error)
      return createServerErrorResponse(
        res,
        `诊断回放失败: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}
