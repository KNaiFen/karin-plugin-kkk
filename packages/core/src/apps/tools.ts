import karin, { logger } from 'node-karin'

import {
  Common,
  createPlainVideoTitleContext,
  downloadVideo,
  initLongTaskCompletionNotify,
  normalizePlainTitleReplyConfig,
  notifyLongTaskCompletionIfNeeded,
  resolveDetailedSummaryParseContext,
  resolveSummaryParseContext,
  resolveTranscriptOriginalContext,
  runDetailedSummaryParse,
  runSummaryParse,
  runTranscriptOriginal,
  shouldTriggerDetailedSummaryParse,
  shouldTriggerSummaryParse,
  shouldTriggerTranscriptOriginal
} from '@/module'
import { getStatisticsDB } from '@/module/db'
import { SUMMARY_COMMAND_PREFIX } from '@/module/summaryParse/link'
import { logSummaryMessage } from '@/module/summaryParse/progress'
import { Config } from '@/module/utils/Config'
import { wrapWithErrorHandler } from '@/module/utils/ErrorHandler'
import { recordFailureTraceStep } from '@/module/utils/ErrorTrace'
import { guestCookieManager } from '@/module/utils/GuestCookieManager'
import { Bilibili, getBilibiliID } from '@/platform/bilibili'
import { DouYin, getDouyinID } from '@/platform/douyin'
import { getGithubID, Github } from '@/platform/github'
import { getHeyboxID, Heybox } from '@/platform/heybox'
import { fetchKuaishouData, getKuaishouID, Kuaishou } from '@/platform/kuaishou'
import { getTiebaID, Tieba } from '@/platform/tieba'
import { getTikTokID, TikTok } from '@/platform/tiktok'
import { getWechatID, Wechat } from '@/platform/wechat'
import { getWeiboID, Weibo } from '@/platform/weibo'
import { getXID, X } from '@/platform/x'
import { getXiaohongshuID, Xiaohongshu } from '@/platform/xiaohongshu'
import { getZhihuID, Zhihu } from '@/platform/zhihu'

import {
  DOUYIN_MESSAGE_URL_REGEX,
  extractBilibiliMessageUrl,
  extractDouyinMessageUrl,
  extractGithubMessageUrl,
  extractHeyBoxMessageUrl,
  extractKuaishouMessageUrl,
  extractTiebaMessageUrl,
  extractTikTokMessageUrl,
  extractWechatMessageUrl,
  extractWeiboMessageUrl,
  extractXiaohongshuMessageUrl,
  extractXMessageUrl,
  extractZhihuMessageUrl,
  GITHUB_MESSAGE_URL_REGEX,
  HEYBOX_MESSAGE_URL_REGEX,
  shouldReplyPlainVideoTitle,
  TIEBA_MESSAGE_URL_REGEX,
  TIKTOK_MESSAGE_URL_REGEX,
  WECHAT_MESSAGE_URL_REGEX,
  WEIBO_MESSAGE_URL_REGEX,
  X_MESSAGE_URL_REGEX,
  XIAOHONGSHU_MESSAGE_URL_REGEX,
  ZHIHU_MESSAGE_URL_REGEX
} from './linkExtractors'

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const summaryCommandPrefixPattern = escapeRegex(SUMMARY_COMMAND_PREFIX)

const normalizeKeywords = (keywords: string[] | undefined): string[] => {
  const seen = new Set<string>()
  const normalized = (keywords ?? [])
    .map(item => item.trim())
    .filter(Boolean)
    .filter(item => {
      if (seen.has(item)) return false
      seen.add(item)
      return true
    })

  return normalized.sort((left, right) => right.length - left.length)
}

const getSummaryParseKeywords = (): string[] => {
  return normalizeKeywords(Config.app.summaryParse?.keywords).map(escapeRegex)
}

const getDetailedSummaryParseKeywords = (): string[] => {
  return normalizeKeywords(Config.app.detailedSummaryParse?.keywords).map(escapeRegex)
}

const getTranscriptOriginalKeywords = (): string[] => {
  return normalizeKeywords(Config.app.transcriptOriginal?.keywords).map(escapeRegex)
}

const getSummaryWorkflowKeywords = (): string[] => {
  return normalizeKeywords([
    ...(Config.app.summaryParse?.keywords ?? []),
    ...(Config.app.detailedSummaryParse?.keywords ?? []),
    ...(Config.app.transcriptOriginal?.keywords ?? [])
  ]).map(escapeRegex)
}

const buildNonSummaryCommandRegex = (pattern: RegExp): RegExp => {
  const keywords = getSummaryWorkflowKeywords()
  if (keywords.length === 0) return pattern

  const flags = pattern.flags.replace(/g/g, '')
  return new RegExp(`^(?!${summaryCommandPrefixPattern}(?:${keywords.join('|')})(?:\\s|$))[\\s\\S]*(?:${pattern.source})`, flags)
}

const reg = {
  douyin: buildNonSummaryCommandRegex(DOUYIN_MESSAGE_URL_REGEX),
  douyinCDN: /https:\/\/aweme\.snssdk\.com\/aweme\/v1\/play/i, // 抖音 CDN 下载链接
  tiktok: buildNonSummaryCommandRegex(TIKTOK_MESSAGE_URL_REGEX),
  bilibili: buildNonSummaryCommandRegex(/(bilibili\.com|b23\.tv|t\.bilibili\.com|bili2233\.cn|\bBV[1-9a-zA-Z]{10}\b|\bav\d+\b)/i),
  kuaishou: buildNonSummaryCommandRegex(/(快手.*快手|v\.kuaishou\.com|kuaishou\.com)/),
  xiaohongshu: buildNonSummaryCommandRegex(XIAOHONGSHU_MESSAGE_URL_REGEX),
  heybox: buildNonSummaryCommandRegex(HEYBOX_MESSAGE_URL_REGEX),
  github: buildNonSummaryCommandRegex(GITHUB_MESSAGE_URL_REGEX),
  x: buildNonSummaryCommandRegex(/(?:(?:www\.)?(?:x|twitter)\.com)/i),
  zhihu: buildNonSummaryCommandRegex(ZHIHU_MESSAGE_URL_REGEX),
  tieba: buildNonSummaryCommandRegex(TIEBA_MESSAGE_URL_REGEX),
  wechat: buildNonSummaryCommandRegex(/mp\.weixin\.qq\.com/i),
  weibo: buildNonSummaryCommandRegex(WEIBO_MESSAGE_URL_REGEX)
}

const buildSummaryParseCommandRegex = (): RegExp => {
  const keywords = getSummaryParseKeywords()

  if (keywords.length === 0) {
    return /(?!)/
  }

  return new RegExp(`^${summaryCommandPrefixPattern}(?:${keywords.join('|')})(?:\\s|$)`)
}

const buildDetailedSummaryParseCommandRegex = (): RegExp => {
  const keywords = getDetailedSummaryParseKeywords()

  if (keywords.length === 0) {
    return /(?!)/
  }

  return new RegExp(`^${summaryCommandPrefixPattern}(?:${keywords.join('|')})(?:\\s|$)`)
}

const buildTranscriptOriginalCommandRegex = (): RegExp => {
  const keywords = getTranscriptOriginalKeywords()

  if (keywords.length === 0) {
    return /(?!)/
  }

  return new RegExp(`^${summaryCommandPrefixPattern}(?:${keywords.join('|')})(?:\\s|$)`)
}

const plainTitleTypes = {
  bilibili: ['video', 'image', 'article', 'live', 'text'] as const,
  douyin: ['video', 'image', 'article', 'live'] as const,
  tiktok: ['video'] as const,
  xiaohongshu: ['video', 'image'] as const,
  heybox: ['video', 'image', 'text'] as const,
  github: ['text', 'image'] as const,
  x: ['video', 'image', 'text'] as const,
  zhihu: ['video', 'image', 'text'] as const,
  tieba: ['video', 'image', 'text'] as const,
  wechat: ['image', 'text'] as const,
  weibo: ['video', 'image', 'text'] as const
}

const defaultParsePriority = () => Config.app.videoTool ? -Infinity : 800
const tiktokParsePriority = () => Config.tiktok.videoTool ? -Infinity : Config.tiktok.priority
const DETAILED_SUMMARY_PARSE_PRIORITY = -1000001
const TRANSCRIPT_ORIGINAL_PRIORITY = -1000002
const SUMMARY_PARSE_PRIORITY = -1000000
const summaryReplayMarkerPattern = /\[(?:summary|detailed-summary|transcript-original)-parse\]/

const shouldDeferToSummaryParse = (message: string): boolean => {
  const trimmed = message.trim()
  const hasReplayMarker = summaryReplayMarkerPattern.test(trimmed)
  if (!trimmed.startsWith(SUMMARY_COMMAND_PREFIX) && !hasReplayMarker) return false
  return Boolean(
    shouldTriggerSummaryParse(message) ||
    shouldTriggerDetailedSummaryParse(message) ||
    shouldTriggerTranscriptOriginal(message) ||
    hasReplayMarker
  )
}

const handleSummaryParse = wrapWithErrorHandler(async (e, next) => {
  const context = await resolveSummaryParseContext(e)
  if (!context) {
    return next?.()
  }

  const summaryResult = await runSummaryParse(e, context)

  if (Config.app.summaryParse.sendParsedContent) {
    for (const link of context.links) {
      const replayMessage = `${link.url} [summary-parse]`
      e.msg = replayMessage

      switch (link.platform) {
        case 'douyin':
          await handleDouyin(e, next)
          break
        case 'bilibili':
          await handleBilibili(e, next)
          break
        case 'tiktok':
          await handleTikTok(e, next)
          break
        case 'kuaishou':
          await handleKuaishou(e, next)
          break
        case 'xiaohongshu':
          await handleXiaohongshu(e, next)
          break
        case 'heybox':
          await handleHeybox(e, next)
          break
        case 'github':
          await handleGithub(e, next)
          break
        case 'x':
          await handleX(e, next)
          break
        case 'zhihu':
          await handleZhihu(e, next)
          break
        case 'tieba':
          await handleTieba(e, next)
          break
        case 'wechat':
          await handleWechat(e, next)
          break
        case 'weibo':
          await handleWeibo(e, next)
          break
        default:
          break
      }
    }
  }

  if (summaryResult?.taskId) {
    logSummaryMessage('任务完成', {
      taskId: summaryResult.taskId
    })
  }

  await notifyLongTaskCompletionIfNeeded(e)

  return true
}, {
  businessName: '解析总结'
})

const handleDetailedSummaryParse = wrapWithErrorHandler(async (e, next) => {
  const context = await resolveDetailedSummaryParseContext(e)
  if (!context) {
    return next?.()
  }

  const summaryResult = await runDetailedSummaryParse(e, context)

  if (Config.app.detailedSummaryParse.sendParsedContent) {
    for (const link of context.links) {
      const replayMessage = `${link.url} [detailed-summary-parse]`
      e.msg = replayMessage

      switch (link.platform) {
        case 'douyin':
          await handleDouyin(e, next)
          break
        case 'bilibili':
          await handleBilibili(e, next)
          break
        case 'tiktok':
          await handleTikTok(e, next)
          break
        case 'kuaishou':
          await handleKuaishou(e, next)
          break
        case 'xiaohongshu':
          await handleXiaohongshu(e, next)
          break
        case 'heybox':
          await handleHeybox(e, next)
          break
        case 'github':
          await handleGithub(e, next)
          break
        case 'x':
          await handleX(e, next)
          break
        case 'zhihu':
          await handleZhihu(e, next)
          break
        case 'tieba':
          await handleTieba(e, next)
          break
        case 'wechat':
          await handleWechat(e, next)
          break
        case 'weibo':
          await handleWeibo(e, next)
          break
        default:
          break
      }
    }
  }

  if (summaryResult?.taskId) {
    logSummaryMessage('任务完成', {
      taskId: summaryResult.taskId
    })
  }

  await notifyLongTaskCompletionIfNeeded(e)

  return true
}, {
  businessName: '详细解析总结'
})

const handleTranscriptOriginal = wrapWithErrorHandler(async (e, next) => {
  const context = await resolveTranscriptOriginalContext(e)
  if (!context) {
    if (extractGithubMessageUrl(e.msg)) {
      return handleGithub(e, next)
    }
    return next?.()
  }

  const transcriptResult = await runTranscriptOriginal(e, context)

  if (Config.app.transcriptOriginal.sendParsedContent) {
    for (const link of context.links) {
      const replayMessage = `${link.url} [transcript-original-parse]`
      e.msg = replayMessage

      switch (link.platform) {
        case 'douyin':
          await handleDouyin(e, next)
          break
        case 'bilibili':
          await handleBilibili(e, next)
          break
        case 'tiktok':
          await handleTikTok(e, next)
          break
        case 'kuaishou':
          await handleKuaishou(e, next)
          break
        case 'xiaohongshu':
          await handleXiaohongshu(e, next)
          break
        case 'heybox':
          await handleHeybox(e, next)
          break
        case 'github':
          await handleGithub(e, next)
          break
        case 'x':
          await handleX(e, next)
          break
        case 'zhihu':
          await handleZhihu(e, next)
          break
        case 'tieba':
          await handleTieba(e, next)
          break
        case 'wechat':
          await handleWechat(e, next)
          break
        case 'weibo':
          await handleWeibo(e, next)
          break
        default:
          break
      }
    }
  }

  if (transcriptResult?.taskId) {
    logSummaryMessage('任务完成', {
      taskId: transcriptResult.taskId
    })
  }

  await notifyLongTaskCompletionIfNeeded(e)

  return true
}, {
  businessName: '转写原文'
})

// 包装抖音处理函数
const handleDouyin = wrapWithErrorHandler(async (e, next) => {
  if (shouldDeferToSummaryParse(e.msg)) {
    return next?.()
  }

  if (e.msg.startsWith('#测试')) {
    return false
  }

  // 判断是否为弹幕解析（通过 #弹幕解析 命令触发）
  const forceBurnDanmaku = /^#?弹幕解析/.test(e.msg)

  const url = extractDouyinMessageUrl(e.msg)
  if (!url) {
    logger.warn(`未能在消息中找到有效的抖音链接: ${e.msg}`)
    return true
  }
  recordFailureTraceStep('douyin.command.url-resolved', {
    url
  })
  const plainTitleConfig = normalizePlainTitleReplyConfig(Config.douyin.plainTitleReply, [...plainTitleTypes.douyin])
  const plainVideoTitle = createPlainVideoTitleContext(shouldReplyPlainVideoTitle(plainTitleConfig.switch, e.msg, url), '抖音', plainTitleConfig.types)
  recordFailureTraceStep('douyin.command.guest-cookie.ensure.start', {
    waitForStale: true
  })
  await guestCookieManager.ensureFreshCookie('douyin', { waitForStale: true })
  recordFailureTraceStep('douyin.command.guest-cookie.ensure.finish')
  const iddata = await getDouyinID(e, url)
  recordFailureTraceStep('douyin.command.iddata.ready', iddata)
  initLongTaskCompletionNotify(e, '抖音视频解析')
  await new DouYin(e, iddata, { forceBurnDanmaku, plainVideoTitle }).DouyinHandler(iddata)
  
  // 记录解析统计
  const groupId = e.isGroup ? (e.contact?.peer || '') : ''
  const userId = e.userId || ''
  if (groupId && userId) {
    try {
      const statisticsDB = await getStatisticsDB()
      await statisticsDB.recordParse(groupId, userId, 'douyin')
    } catch (error) {
      logger.debug('[统计] 记录抖音解析统计失败:', error)
    }
  }

  await notifyLongTaskCompletionIfNeeded(e)
  
  return true
}, {
  businessName: '抖音视频解析'
})

// 包装B站处理函数
const handleBilibili = wrapWithErrorHandler(async (e, next) => {
  if (shouldDeferToSummaryParse(e.msg)) {
    return next?.()
  }

  e.msg = e.msg.replace(/\\/g, '') // 移除消息中的反斜杠

  // 判断是否为弹幕解析（通过 #弹幕解析 命令触发）
  const forceBurnDanmaku = /^#?弹幕解析/.test(e.msg)

  const bvRegex = /^BV[1-9a-zA-Z]{10}$/
  const avRegex = /^av\d+$/i
  let url: string | null = null
  let plainTitleToken: string | null = null
  const urlMatch = extractBilibiliMessageUrl(e.msg)
  const trimmedMessage = e.msg.trim()

  if (urlMatch) {
    url = urlMatch
    plainTitleToken = urlMatch
  } else if (bvRegex.test(trimmedMessage)) {
    url = `https://www.bilibili.com/video/${trimmedMessage}`
    plainTitleToken = trimmedMessage
  } else if (avRegex.test(trimmedMessage)) {
    url = `https://www.bilibili.com/video/${trimmedMessage}`
    plainTitleToken = trimmedMessage
  }
  if (!url) {
    logger.warn(`未能在消息中找到有效的B站分享链接、BV号或AV号: ${e.msg}`)
    return true
  }
  const plainTitleConfig = normalizePlainTitleReplyConfig(Config.bilibili.plainTitleReply, [...plainTitleTypes.bilibili])
  const plainVideoTitle = createPlainVideoTitleContext(shouldReplyPlainVideoTitle(plainTitleConfig.switch, e.msg, plainTitleToken), 'B站', plainTitleConfig.types)
  const iddata = await getBilibiliID(url)
  initLongTaskCompletionNotify(e, 'B站视频解析')
  await new Bilibili(e, iddata, { forceBurnDanmaku, plainVideoTitle }).BilibiliHandler(iddata)
  
  // 记录解析统计
  const groupId = e.isGroup ? (e.contact?.peer || '') : ''
  const userId = e.userId || ''
  if (groupId && userId) {
    try {
      const statisticsDB = await getStatisticsDB()
      await statisticsDB.recordParse(groupId, userId, 'bilibili')
    } catch (error) {
      logger.debug('[统计] 记录B站解析统计失败:', error)
    }
  }

  await notifyLongTaskCompletionIfNeeded(e)
  
  return true
}, {
  businessName: 'B站视频解析'
})

// 包装 TikTok 处理函数
const handleTikTok = wrapWithErrorHandler(async (e, next) => {
  if (shouldDeferToSummaryParse(e.msg)) {
    return next?.()
  }

  const url = extractTikTokMessageUrl(e.msg)
  if (!url) {
    logger.warn(`未能在消息中找到有效的 TikTok 链接: ${e.msg}`)
    return true
  }

  await guestCookieManager.ensureFreshCookie('tiktok', { waitForStale: true })
  const plainTitleConfig = normalizePlainTitleReplyConfig(Config.tiktok.plainTitleReply, [...plainTitleTypes.tiktok])
  const plainVideoTitle = createPlainVideoTitleContext(shouldReplyPlainVideoTitle(plainTitleConfig.switch, e.msg, url), 'TikTok', plainTitleConfig.types)
  const iddata = await getTikTokID(e, url)
  initLongTaskCompletionNotify(e, 'TikTok视频解析')
  await new TikTok(e, iddata, { plainVideoTitle }).TikTokHandler()
  await notifyLongTaskCompletionIfNeeded(e)
  return true
}, {
  businessName: 'TikTok视频解析'
})

// 包装快手处理函数
const handleKuaishou = wrapWithErrorHandler(async (e, next) => {
  if (shouldDeferToSummaryParse(e.msg)) {
    return next?.()
  }

  const kuaishouUrl = extractKuaishouMessageUrl(e.msg)
  if (!kuaishouUrl) {
    logger.warn(`未能在消息中找到有效的快手链接: ${e.msg}`)
    return true
  }
  const iddata = await getKuaishouID(kuaishouUrl)
  const WorkData = await fetchKuaishouData(iddata.type, iddata)
  initLongTaskCompletionNotify(e, '快手视频解析')
  await new Kuaishou(e, iddata).KuaishouHandler(WorkData, kuaishouUrl)
  
  // 记录解析统计
  const groupId = e.isGroup ? (e.contact?.peer || '') : ''
  const userId = e.userId || ''
  if (groupId && userId) {
    try {
      const statisticsDB = await getStatisticsDB()
      await statisticsDB.recordParse(groupId, userId, 'kuaishou')
    } catch (error) {
      logger.debug('[统计] 记录快手解析统计失败:', error)
    }
  }
  await notifyLongTaskCompletionIfNeeded(e)
}, {
  businessName: '快手视频解析'
})

// 包装小红书处理函数
const handleXiaohongshu = wrapWithErrorHandler(async (e, next) => {
  if (shouldDeferToSummaryParse(e.msg)) {
    return next?.()
  }

  const url = extractXiaohongshuMessageUrl(e.msg)
  if (!url) {
    logger.warn(`未能在消息中找到有效链接: ${e.msg}`)
    return true
  }
  const plainTitleConfig = normalizePlainTitleReplyConfig(Config.xiaohongshu.plainTitleReply, [...plainTitleTypes.xiaohongshu])
  const plainVideoTitle = createPlainVideoTitleContext(shouldReplyPlainVideoTitle(plainTitleConfig.switch, e.msg, url), '小红书', plainTitleConfig.types)
  await guestCookieManager.ensureFreshCookie('xiaohongshu', { waitForStale: true })
  const iddata = await getXiaohongshuID(url)
  initLongTaskCompletionNotify(e, '小红书视频解析')
  await new Xiaohongshu(e, iddata, { plainVideoTitle }).XiaohongshuHandler(iddata)
  
  // 记录解析统计
  const groupId = e.isGroup ? (e.contact?.peer || '') : ''
  const userId = e.userId || ''
  if (groupId && userId) {
    try {
      const statisticsDB = await getStatisticsDB()
      await statisticsDB.recordParse(groupId, userId, 'xiaohongshu')
    } catch (error) {
      logger.debug('[统计] 记录小红书解析统计失败:', error)
    }
  }

  await notifyLongTaskCompletionIfNeeded(e)
  
  return true
}, {
  businessName: '小红书视频解析'
})

// 包装小黑盒处理函数
const handleHeybox = wrapWithErrorHandler(async (e, next) => {
  if (shouldDeferToSummaryParse(e.msg)) {
    return next?.()
  }

  const url = extractHeyBoxMessageUrl(e.msg)
  if (!url) {
    logger.warn(`未能在消息中找到有效的小黑盒链接: ${e.msg}`)
    return true
  }

  const plainTitleConfig = normalizePlainTitleReplyConfig(Config.heybox.plainTitleReply, [...plainTitleTypes.heybox])
  const plainVideoTitle = createPlainVideoTitleContext(shouldReplyPlainVideoTitle(plainTitleConfig.switch, e.msg, url), '小黑盒', plainTitleConfig.types)
  await guestCookieManager.ensureFreshCookie('heybox', { waitForStale: true })
  const iddata = await getHeyboxID(url)
  initLongTaskCompletionNotify(e, '小黑盒解析')
  await new Heybox(e, iddata, { plainVideoTitle }).HeyboxHandler(iddata)

  await notifyLongTaskCompletionIfNeeded(e)
  return true
}, {
  businessName: '小黑盒解析'
})

const handleX = wrapWithErrorHandler(async (e, next) => {
  if (shouldDeferToSummaryParse(e.msg)) {
    return next?.()
  }

  const url = extractXMessageUrl(e.msg)
  if (!url) {
    logger.warn(`未能在消息中找到有效的 X 链接: ${e.msg}`)
    return true
  }

  const plainTitleConfig = normalizePlainTitleReplyConfig(Config.x.plainTitleReply, [...plainTitleTypes.x])
  const plainVideoTitle = createPlainVideoTitleContext(shouldReplyPlainVideoTitle(plainTitleConfig.switch, e.msg, url), 'X', plainTitleConfig.types)
  const iddata = await getXID(url)
  initLongTaskCompletionNotify(e, 'X 解析')
  await new X(e, iddata, { plainVideoTitle }).XHandler()

  await notifyLongTaskCompletionIfNeeded(e)
  return true
}, {
  businessName: 'X 解析'
})

const handleGithub = wrapWithErrorHandler(async (e, next) => {
  if (shouldDeferToSummaryParse(e.msg)) {
    return next?.()
  }

  const url = extractGithubMessageUrl(e.msg)
  if (!url) {
    logger.warn(`未能在消息中找到有效的 GitHub 仓库链接: ${e.msg}`)
    return true
  }

  const plainTitleConfig = normalizePlainTitleReplyConfig(Config.github.plainTitleReply, [...plainTitleTypes.github])
  const plainVideoTitle = createPlainVideoTitleContext(shouldReplyPlainVideoTitle(plainTitleConfig.switch, e.msg, url), 'GitHub', plainTitleConfig.types)
  const iddata = await getGithubID(url)
  initLongTaskCompletionNotify(e, 'GitHub 解析')
  await new Github(e, iddata, { plainVideoTitle }).GithubHandler()

  await notifyLongTaskCompletionIfNeeded(e)
  return true
}, {
  businessName: 'GitHub 解析'
})

// 包装知乎处理函数
const handleZhihu = wrapWithErrorHandler(async (e, next) => {
  if (shouldDeferToSummaryParse(e.msg)) {
    return next?.()
  }

  const url = extractZhihuMessageUrl(e.msg)
  if (!url) {
    logger.warn(`未能在消息中找到有效的知乎链接: ${e.msg}`)
    return true
  }

  const plainTitleConfig = normalizePlainTitleReplyConfig(Config.zhihu.plainTitleReply, [...plainTitleTypes.zhihu])
  const plainVideoTitle = createPlainVideoTitleContext(shouldReplyPlainVideoTitle(plainTitleConfig.switch, e.msg, url), '知乎', plainTitleConfig.types)
  await guestCookieManager.ensureFreshCookie('zhihu', { waitForStale: true })
  const iddata = await getZhihuID(url)
  initLongTaskCompletionNotify(e, '知乎解析')
  await new Zhihu(e, iddata, { plainVideoTitle }).ZhihuHandler()

  await notifyLongTaskCompletionIfNeeded(e)
  return true
}, {
  businessName: '知乎解析'
})

// 包装贴吧处理函数
const handleTieba = wrapWithErrorHandler(async (e, next) => {
  if (shouldDeferToSummaryParse(e.msg)) {
    return next?.()
  }

  const url = extractTiebaMessageUrl(e.msg)
  if (!url) {
    logger.warn(`未能在消息中找到有效的贴吧链接: ${e.msg}`)
    return true
  }

  const plainTitleConfig = normalizePlainTitleReplyConfig(Config.tieba.plainTitleReply, [...plainTitleTypes.tieba])
  const plainVideoTitle = createPlainVideoTitleContext(shouldReplyPlainVideoTitle(plainTitleConfig.switch, e.msg, url), '贴吧', plainTitleConfig.types)
  const iddata = await getTiebaID(url)
  initLongTaskCompletionNotify(e, '贴吧解析')
  await new Tieba(e, iddata, { plainVideoTitle }).TiebaHandler(iddata)

  await notifyLongTaskCompletionIfNeeded(e)
  return true
}, {
  businessName: '贴吧解析'
})

const handleWechat = wrapWithErrorHandler(async (e, next) => {
  if (shouldDeferToSummaryParse(e.msg)) {
    return next?.()
  }

  const url = extractWechatMessageUrl(e.msg)
  if (!url) {
    logger.warn(`未能在消息中找到有效的微信公众号链接: ${e.msg}`)
    return true
  }

  const plainTitleConfig = normalizePlainTitleReplyConfig(Config.wechat.plainTitleReply, [...plainTitleTypes.wechat])
  const plainVideoTitle = createPlainVideoTitleContext(shouldReplyPlainVideoTitle(plainTitleConfig.switch, e.msg, url), '微信公众号', plainTitleConfig.types)
  const iddata = await getWechatID(url)
  initLongTaskCompletionNotify(e, '微信公众号解析')
  await new Wechat(e, iddata, { plainVideoTitle }).WechatHandler(iddata)

  await notifyLongTaskCompletionIfNeeded(e)
  return true
}, {
  businessName: '微信公众号解析'
})

// 包装微博处理函数
const handleWeibo = wrapWithErrorHandler(async (e, next) => {
  if (shouldDeferToSummaryParse(e.msg)) {
    return next?.()
  }

  const url = extractWeiboMessageUrl(e.msg)
  if (!url) {
    logger.warn(`未能在消息中找到有效的微博链接: ${e.msg}`)
    return true
  }

  const plainTitleConfig = normalizePlainTitleReplyConfig(Config.weibo.plainTitleReply, [...plainTitleTypes.weibo])
  const plainVideoTitle = createPlainVideoTitleContext(shouldReplyPlainVideoTitle(plainTitleConfig.switch, e.msg, url), '微博', plainTitleConfig.types)
  await guestCookieManager.ensureFreshCookie('weibo', { waitForStale: true })
  const iddata = await getWeiboID(url)
  initLongTaskCompletionNotify(e, '微博解析')
  await new Weibo(e, iddata, { plainVideoTitle }).WeiboHandler()

  await notifyLongTaskCompletionIfNeeded(e)
  return true
}, {
  businessName: '微博解析'
})

// 包装引用解析函数（支持 #解析 和 #弹幕解析）
const handlePrefix = wrapWithErrorHandler(async (e, next) => {
  const originalMsg = e.msg
  e.msg = await Common.getReplyMessage(e)
  
  // 保留原始命令前缀，用于判断是否为弹幕解析
  if (/^#?弹幕解析/.test(originalMsg)) {
    e.msg = '#弹幕解析 ' + e.msg
  }
  
  // 检查是否是抖音 CDN 下载链接（推送配置中渲染的二维码）
  if (reg.douyinCDN.test(e.msg)) {
    // 这是一个 CDN 下载链接，需要直接下载而不是解析
    logger.debug('检测到抖音 CDN 下载链接，直接下载视频')
    const videoIdMatch = e.msg.match(/video_id=([^&]+)/)
    const videoId = videoIdMatch ? videoIdMatch[1] : Date.now().toString()
    
    await downloadVideo(e, {
      video_url: e.msg,
      title: { 
        timestampTitle: `tmp_${Date.now()}.mp4`, 
        originTitle: `抖音视频_${videoId}.mp4` 
      }
    })
    return true
  } else if (reg.douyin.test(e.msg)) {
    // 正常的抖音分享链接
    return await handleDouyin(e, next)
  } else if (reg.tiktok.test(e.msg)) {
    return await handleTikTok(e, next)
  } else if (reg.bilibili.test(e.msg)) {
    return await handleBilibili(e, next)
  } else if (reg.kuaishou.test(e.msg)) {
    return await handleKuaishou(e, next)
  } else if (reg.xiaohongshu.test(e.msg)) {
    return await handleXiaohongshu(e, next)
  } else if (reg.heybox.test(e.msg)) {
    return await handleHeybox(e, next)
  } else if (reg.github.test(e.msg)) {
    return await handleGithub(e, next)
  } else if (reg.x.test(e.msg)) {
    return await handleX(e, next)
  } else if (reg.zhihu.test(e.msg)) {
    return await handleZhihu(e, next)
  } else if (reg.tieba.test(e.msg)) {
    return await handleTieba(e, next)
  } else if (reg.wechat.test(e.msg)) {
    return await handleWechat(e, next)
  } else if (reg.weibo.test(e.msg)) {
    return await handleWeibo(e, next)
  }
}, {
  businessName: '引用解析'
})

// 注册命令
const douyin = karin.command(reg.douyin, handleDouyin, {
  name: 'kkk-视频功能-抖音',
  priority: defaultParsePriority()
})

const tiktok = karin.command(reg.tiktok, handleTikTok, {
  name: 'kkk-视频功能-TikTok',
  priority: tiktokParsePriority()
})

const bilibili = karin.command(reg.bilibili, handleBilibili, {
  name: 'kkk-视频功能-B站',
  priority: defaultParsePriority()
})

const kuaishou = karin.command(reg.kuaishou, handleKuaishou, {
  name: 'kkk-视频功能-快手',
  priority: defaultParsePriority()
})

const xiaohongshu = karin.command(reg.xiaohongshu, handleXiaohongshu, {
  name: 'kkk-视频功能-小红书',
  priority: defaultParsePriority()
})

const heybox = karin.command(reg.heybox, handleHeybox, {
  name: 'kkk-视频功能-小黑盒',
  priority: defaultParsePriority()
})

const x = karin.command(reg.x, handleX, {
  name: 'kkk-视频功能-X',
  priority: defaultParsePriority()
})

const github = karin.command(reg.github, handleGithub, {
  name: 'kkk-视频功能-GitHub',
  priority: defaultParsePriority()
})

const zhihu = karin.command(reg.zhihu, handleZhihu, {
  name: 'kkk-视频功能-知乎',
  priority: defaultParsePriority()
})

const tieba = karin.command(reg.tieba, handleTieba, {
  name: 'kkk-视频功能-贴吧',
  priority: defaultParsePriority()
})

const wechat = karin.command(reg.wechat, handleWechat, {
  name: 'kkk-视频功能-微信公众号',
  priority: defaultParsePriority()
})

const weibo = karin.command(reg.weibo, handleWeibo, {
  name: 'kkk-视频功能-微博',
  priority: defaultParsePriority()
})

export const prefix = karin.command(buildNonSummaryCommandRegex(/^#?(解析|kkk解析|弹幕解析)/), handlePrefix, {
  name: 'kkk-视频功能-引用解析'
})

export const detailedSummaryParseAPP = karin.command(buildDetailedSummaryParseCommandRegex(), handleDetailedSummaryParse, {
  name: 'kkk-视频功能-详细解析总结',
  priority: DETAILED_SUMMARY_PARSE_PRIORITY
})

export const transcriptOriginalAPP = karin.command(buildTranscriptOriginalCommandRegex(), handleTranscriptOriginal, {
  name: 'kkk-视频功能-转写原文',
  priority: TRANSCRIPT_ORIGINAL_PRIORITY
})

export const summaryParseAPP = karin.command(buildSummaryParseCommandRegex(), handleSummaryParse, {
  name: 'kkk-视频功能-解析总结',
  priority: SUMMARY_PARSE_PRIORITY
})

export const douyinAPP = Config.douyin.switch && douyin
export const tiktokAPP = Config.tiktok.switch && tiktok
export const bilibiliAPP = Config.bilibili.switch && bilibili
export const kuaishouAPP = Config.kuaishou.switch && kuaishou
export const xiaohongshuAPP = Config.xiaohongshu.switch && xiaohongshu
export const heyboxAPP = Config.heybox.switch && heybox
export const githubAPP = Config.github.switch && github
export const xAPP = Config.x.switch && x
export const zhihuAPP = Config.zhihu.switch && zhihu
export const tiebaAPP = Config.tieba.switch && tieba
export const wechatAPP = Config.wechat.switch && wechat
export const weiboAPP = Config.weibo.switch && weibo
