import fs from 'node:fs'
import path from 'node:path'

import karin, { type Contact, logger, Message, segment } from 'node-karin'
import type { AxiosHeaders, AxiosRequestConfig, Method, RawAxiosRequestHeaders } from 'node-karin/axios'

import { Config } from '@/module/utils/Config'
import { rememberFileCacheIdentity } from '@/module/utils/derivedCache'
import {
  buildSharedCachePath,
  type CacheIdentity,
  normalizeSharedCacheExtension } from '@/module/utils/sharedCache'
import type { pushlistConfig } from '@/types/config/pushlist'

import { AmagiBase } from './amagiClient'
import { Common } from './Common'
import { compressVideo, getMediaDuration } from './FFmpeg'
import { recordLongTaskCompletionAnchor } from './LongTaskCompletionNotify'
import { BASE_HEADERS as baseHeaders } from './Network/constants'
import { extractTotalBytesFromHeaders } from './Network/helpers'
import { Network as Networks } from './Network/Network'

type uploadFileOptions = {
  /** 是否使用群文件上传 */
  useGroupFile?: boolean
  /** 消息ID，如果有，则将使用该消息ID制作回复元素 */
  message_id?: string
  /** 是否为主动消息 */
  active?: boolean
  /** 主动消息参数 */
  activeOption?: {
    /** 机器人账号 */
    uin: string
    /** 群号 */
    group_id: string
  }
}

/** 最少都要传一个 */
type title = {
  /** 文件名：自定义 */
  originTitle?: string
  /** 文件名：tmp + 时间戳 */
  timestampTitle?: string
}

type downloadFileOptions = {
  /** 视频链接 */
  video_url: string
  /** 同一资源的备用下载链接 */
  backupUrls?: string[]
  /** 平台接口已返回的文件大小，单位 bytes；存在时可跳过额外 HEAD 预检 */
  knownFileSizeBytes?: number
  /** 文件名 */
  title: title
  /** 下载文件类型，默认为'.mp4'。 */
  filetype?: string
  /** 自定义请求头，将使用该请求头下载文件。 */
  headers?: object
  /** 下载重试次数，默认 3 次 */
  maxRetries?: number
  /** 额外网络选项，例如代理 agent */
  networkOptions?: Pick<AxiosRequestConfig, 'httpAgent' | 'httpsAgent' | 'proxy'>
  /** 稳定共享缓存身份 */
  cacheIdentity?: CacheIdentity
}

type SharedDownloadResult = {
  filepath: string
  totalBytes: number
}

type CompletedDownloadResult = SharedDownloadResult & {
  completedAt: number
}

const DOUYIN_WRAPPED_VIDEO_PATH_PATTERN = /^\/aweme\/v1\/playwm?\/?$/i

const isDouyinWrappedVideoDownloadUrl = (value: string): boolean => {
  if (!value) return false

  try {
    return DOUYIN_WRAPPED_VIDEO_PATH_PATTERN.test(new URL(value).pathname)
  } catch {
    return false
  }
}

export type fileInfo = {
  /** 视频文件的绝对路径 */
  filepath: string
  /** 视频文件大小 */
  totalBytes: number
  /** 稳定共享缓存身份 */
  cacheIdentity?: CacheIdentity
  /** 文件名：自定义 */
  originTitle?: title['originTitle']
  /** 文件名：tmp + 时间戳 */
  timestampTitle?: title['timestampTitle']
}

/**
 * 表示HTTP请求方法的请求头类型
 * @remarks
 * 这是一个部分类型，将HTTP方法映射到对应的AxiosHeaders类型
 * @property [method] - 每个HTTP方法(小写)对应的请求头
 * @property common - 通用请求头
 */
type MethodsHeaders = Partial<{
  [Key in Method as Lowercase<Key>]: AxiosHeaders
} & { common: AxiosHeaders }>

/**
 * 下载文件的配置选项接口
 * @interface
 * @property title - 文件名
 * @property [headers] - 用于下载文件的请求头
 * @defaultValue headers - {}
 */
export type downLoadFileOptions = {
  /** 文件名 */
  title: string
  /** 同一资源的备用下载链接 */
  backupUrls?: string[]
  /**
   * 将使用该请求头下载文件。
   * @default {}
   */
  headers?: (RawAxiosRequestHeaders & MethodsHeaders) | AxiosHeaders
  /** 文件保存路径 */
  filepath?: string
  /** 下载重试次数，默认 3 次 */
  maxRetries?: number
  /** 额外网络选项，例如代理 agent */
  networkOptions?: Pick<AxiosRequestConfig, 'httpAgent' | 'httpsAgent' | 'proxy'>
  /** 稳定共享缓存身份 */
  cacheIdentity?: CacheIdentity
}

/**
 * 基础基类
 * @remarks 提供事件上下文与通用请求头，继承自 `AmagiBase` 以复用 Amagi 客户端。
 */
export class Base extends AmagiBase {
  /** 事件对象 */
  e: Message
  /** 请求头 */
  headers: AxiosRequestConfig['headers']

  /**
   * 构造函数：初始化事件与请求头
   * @param e 消息事件对象
   */
  constructor (e: Message) {
    super()
    this.e = e
    this.headers = { ...(baseHeaders ?? {}) }
  }
}

const QQNT_VIDEO_SEND_TIMEOUT_SIGNATURES = [
  'NodeIKernelMsgService/sendMsg',
  'NodeIKernelMsgListener/onMsgInfoListUpdate',
  'Timeout: NTEvent'
] as const
const QQNT_VIDEO_SEND_TIMEOUT_RETCODE_PATTERN = /\bretcode["']?\s*:\s*1200\b/

const collectErrorMessageChain = (error: unknown): string[] => {
  const messages: string[] = []
  const seen = new Set<unknown>()
  let current: unknown = error

  while (current && !seen.has(current)) {
    seen.add(current)

    if (current instanceof Error) {
      if (current.message) {
        messages.push(current.message)
      }
      current = (current as Error & { cause?: unknown }).cause
      continue
    }

    if (typeof current === 'object') {
      const candidate = current as { message?: unknown, cause?: unknown, retcode?: unknown }
      if (typeof candidate.message === 'string' && candidate.message) {
        messages.push(candidate.message)
      }
      if (candidate.retcode === 1200 || candidate.retcode === '1200') {
        messages.push('retcode: 1200')
      }
      current = candidate.cause
      continue
    }

    messages.push(String(current))
    break
  }

  return messages
}

const isQqNtVideoSendTimeoutError = (error: unknown): boolean => {
  const message = collectErrorMessageChain(error).join('\n')
  return message.length > 0 &&
    QQNT_VIDEO_SEND_TIMEOUT_RETCODE_PATTERN.test(message) &&
    QQNT_VIDEO_SEND_TIMEOUT_SIGNATURES.every(signature => message.includes(signature))
}

const pendingDownloadTasks = new Map<string, Promise<SharedDownloadResult>>()
const completedDownloadTasks = new Map<string, CompletedDownloadResult>()
const COMPLETED_DOWNLOAD_CACHE_MAX = 64
const COMPLETED_DOWNLOAD_CACHE_TTL_MS = 30 * 60 * 1000

const getReusableCompletedDownload = (downloadKey: string): SharedDownloadResult | null => {
  const cached = completedDownloadTasks.get(downloadKey)
  if (!cached) return null

  if (Date.now() - cached.completedAt > COMPLETED_DOWNLOAD_CACHE_TTL_MS || !fs.existsSync(cached.filepath)) {
    completedDownloadTasks.delete(downloadKey)
    return null
  }

  return {
    filepath: cached.filepath,
    totalBytes: cached.totalBytes
  }
}

const rememberCompletedDownload = (
  downloadKey: string,
  result: SharedDownloadResult
): void => {
  completedDownloadTasks.set(downloadKey, {
    ...result,
    completedAt: Date.now()
  })

  while (completedDownloadTasks.size > COMPLETED_DOWNLOAD_CACHE_MAX) {
    const oldestKey = completedDownloadTasks.keys().next().value
    if (!oldestKey) break
    completedDownloadTasks.delete(oldestKey)
  }
}

/** 统计每个平台使用最多的机器人ID和使用次数 */
type PlatformBotStats = {
  /** 机器人ID */
  botId: string
  /** 使用次数 */
  count: number
}

/**
 * 统计每个平台使用最多的机器人ID和使用次数
 * @param pushList - 推送列表配置
 * @returns 
 */
export const statBotId = (pushList: pushlistConfig): { douyin: PlatformBotStats, bilibili: PlatformBotStats } => {
  const platformBotCount = {
    douyin: new Map<string, number>(),
    bilibili: new Map<string, number>()
  }

  // 统计抖音平台机器人使用次数
  pushList.douyin.forEach(item => {
    item.group_id.forEach(gid => {
      const botId = gid.split(':')[1]
      platformBotCount.douyin.set(botId, (platformBotCount.douyin.get(botId) ?? 0) + 1)
    })
  })

  // 统计B站平台机器人使用次数
  pushList.bilibili.forEach(item => {
    item.group_id.forEach(gid => {
      const botId = gid.split(':')[1]
      platformBotCount.bilibili.set(botId, (platformBotCount.bilibili.get(botId) ?? 0) + 1)
    })
  })

  // 获取抖音平台使用最多的机器人
  let douyinMaxCount = 0
  let douyinMostFrequentBot = ''
  platformBotCount.douyin.forEach((count, botId) => {
    if (count > douyinMaxCount) {
      douyinMaxCount = count
      douyinMostFrequentBot = botId
    }
  })

  // 获取B站平台使用最多的机器人
  let biliMaxCount = 0
  let biliMostFrequentBot = ''
  platformBotCount.bilibili.forEach((count, botId) => {
    if (count > biliMaxCount) {
      biliMaxCount = count
      biliMostFrequentBot = botId
    }
  })

  return {
    douyin: {
      botId: douyinMostFrequentBot,
      count: douyinMaxCount
    },
    bilibili: {
      botId: biliMostFrequentBot,
      count: biliMaxCount
    }
  }
}

/** 过万整除 */
export const Count = (count: number): string => {
  if (typeof count !== 'number' || !Number.isFinite(count)) {
    return '无法获取'
  }

  if (count >= 100000000) {
    return (count / 100000000).toFixed(1) + '亿'
  } else if (count >= 10000) {
    return (count / 10000).toFixed(1) + '万'
  } else {
    return count?.toString() ?? '无法获取'
  }
}

/**
 * 上传视频文件
 * @param event - 消息事件
 * @param file - 包含本地视频文件信息的对象。
 * @param videoUrl 视频直链，无则传空字符串
 * @param options 上传参数
 * @returns
 */
export const uploadFile = async (event: Message, file: fileInfo, videoUrl: string, options?: uploadFileOptions): Promise<boolean> => {
  let sendStatus: boolean = true
  let File: string
  let newFileSize = file.totalBytes
  let selfId: string
  let contact: Contact

  if (options?.active) {
    selfId = options?.activeOption?.uin as string
    contact = karin.contactGroup(options?.activeOption?.group_id as string)
  } else {
    selfId = event.selfId
    contact = event.contact
  }

  // 判断是否需要压缩后再上传
  if (Config.upload.compress && (file.totalBytes > Config.upload.compresstrigger)) {
    const originalFilepath = file.filepath
    const Duration = await getMediaDuration(file.filepath)
    logger.warn(logger.yellow(`视频大小 (${file.totalBytes} MB) 触发压缩条件（设定值：${Config.upload.compresstrigger} MB），正在进行压缩至${Config.upload.compressvalue} MB...`))
    const message = [
      segment.text(`视频大小 (${file.totalBytes} MB) 触发压缩条件（设定值：${Config.upload.compresstrigger} MB），正在进行压缩至${Config.upload.compressvalue} MB...`),
      options?.message_id ? segment.reply(options.message_id) : segment.text('')
    ]

    const msg1 = await karin.sendMsg(selfId, contact, message)
    // 计算目标视频码率：总预算来自压缩后的目标大小，预留音频和封装开销。
    const targetTotalBitrate = Common.calculateBitrate(Config.upload.compressvalue, Duration)
    const audioBitrate = Math.min(96, Math.max(32, Math.floor(targetTotalBitrate * 0.1)))
    const targetBitrate = Math.max(32, Math.floor((targetTotalBitrate - audioBitrate) * 0.92))
    // 执行压缩
    const startTime = Date.now()
    const outputPath = `${Common.tempDri.video}tmp_${Date.now()}.mp4`
    let compressed = false
    let compressError: unknown
    try {
      compressed = await compressVideo({
        inputPath: file.filepath,
        outputPath,
        targetBitrate,
        audioBitrate,
        encodePreset: Config.upload.compressPreset,
        customEncodeArgs: Config.upload.compressCustomArgs
      })
    } catch (error) {
      compressError = error
      compressed = false
    }

    if (compressed && fs.existsSync(outputPath)) {
      try {
        file.filepath = outputPath
        const endTime = Date.now()
        // 再次检查大小
        newFileSize = await Common.getVideoFileSize(file.filepath)
        logger.debug(`原始视频大小为: ${file.totalBytes.toFixed(1)} MB, ${logger.green(`经 FFmpeg 压缩后最终视频大小为: ${newFileSize.toFixed(1)} MB`)}`)

        const message2 = [
          segment.text(`压缩后最终视频大小为: ${newFileSize.toFixed(1)} MB，压缩耗时：${((endTime - startTime) / 1000).toFixed(1)} 秒`),
          segment.reply(msg1.messageId)
        ]
        await karin.sendMsg(selfId, contact, message2)
      } catch (error) {
        compressError = error
        file.filepath = originalFilepath
        newFileSize = file.totalBytes
        logger.error(`视频压缩结果不可用，已回退上传原文件: ${error instanceof Error ? error.message : String(error)}`)
      }
    } else {
      file.filepath = originalFilepath
      newFileSize = file.totalBytes
      logger.error(`视频压缩失败，已回退上传原文件: ${compressError instanceof Error ? compressError.message : String(compressError ?? 'FFmpeg 未生成输出文件')}`)
    }

    if (file.filepath === originalFilepath) {
      if (outputPath !== originalFilepath && fs.existsSync(outputPath)) {
        await Common.removeFile(outputPath, true)
      }
      const fallbackMessage: any[] = [
        segment.text('视频压缩失败，已回退上传原文件。')
      ]
      if (msg1.messageId) {
        fallbackMessage.push(segment.reply(msg1.messageId))
      }
      try {
        await karin.sendMsg(selfId, contact, fallbackMessage)
      } catch (error) {
        logger.warn(`发送压缩失败回退提示失败: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  // 判断是否使用群文件上传
  if (options) {
    options.useGroupFile = Config.upload.usegroupfile && (newFileSize > Config.upload.groupfilevalue)
  }

  if (Config.upload.videoSendMode === 'base64' && !options?.useGroupFile) {
    const videoBuffer = fs.readFileSync(file.filepath)
    File = `base64://${videoBuffer.toString('base64')}`
    logger.mark(`已开启视频文件 base64转换 正在进行${logger.yellow('base64转换中')}...`)
  } else File = options?.useGroupFile ? file.filepath : `file://${file.filepath}`

  try {
    // 是主动消息
    if (options?.active) {
      if (options.useGroupFile) { // 是群文件
        const bot = karin.getBot(String(options.activeOption?.uin))!
        logger.mark(`${logger.blue('主动消息:')} 视频大小: ${newFileSize.toFixed(1)}MB 正在通过${logger.yellow('bot.uploadFile')}回复...`)
        await bot.uploadFile(contact, File, file.originTitle ? `${file.originTitle}.mp4` : `${File.split('/').pop()}`)
      } else { // 不是群文件
        logger.mark(`${logger.blue('主动消息:')} 视频大小: ${newFileSize.toFixed(1)}MB 正在通过${logger.yellow('karin.sendMsg')}回复...`)
        const status = await karin.sendMsg(selfId, contact, [segment.video(File)])
        status.messageId ? sendStatus = true : sendStatus = false
      }
    } else { // 不是主动消息
      if (options?.useGroupFile) { // 是文件
        logger.mark(`${logger.blue('被动消息:')} 视频大小: ${newFileSize.toFixed(1)}MB 正在通过${logger.yellow('e.bot.uploadFile')}回复...`)
        await event.bot.uploadFile(event.contact, File, file.originTitle ? `${file.originTitle}.mp4` : `${File.split('/').pop()}`)
      } else { // 不是文件
        logger.mark(`${logger.blue('被动消息:')} 视频大小: ${newFileSize.toFixed(1)}MB 正在通过${logger.yellow('e.reply')}回复...`)
        const status = await event.reply(segment.video(File) || videoUrl)
        recordLongTaskCompletionAnchor(event, status)
        status.messageId ? sendStatus = true : sendStatus = false
      }
    }
    return sendStatus
  } catch (error) {
    if (isQqNtVideoSendTimeoutError(error)) {
      logger.warn(`视频发送回执超时，按疑似已发送处理: ${error instanceof Error ? error.message : String(error)}`)
      return true
    }
    if (options && options.active === false) {
      await event.reply('视频文件上传失败' + JSON.stringify(error, null, 2))
    }
    logger.error('视频文件上传错误,' + String(error))
    throw error // 重新抛出错误，让 wrapWithErrorHandler 能够捕获
  } finally {
    const filePath = file.filepath
    Common.registerVideoPreview(filePath, Config.app.removeCache, 30 * 60 * 1000)
    logger.mark(`临时预览地址：http://localhost:${process.env.HTTP_PORT!}/api/kkk/video/${encodeURIComponent(filePath.split('/').pop() ?? '')}`)
    Config.app.removeCache && logger.info(`文件 ${filePath} 将在 30 分钟后删除`)
    setTimeout(async () => {
      const removed = await Common.removeFile(filePath)
      if (removed) {
        Common.markVideoPreviewRemoved(filePath)
      }
    }, 30 * 60 * 1000)
  }
}

/**
 * 下载视频并上传到群
 * @param event 事件
 * @param downloadOpt 下载参数
 * @param uploadOpt 上传参数
 * @returns
 */
export const downloadVideo = async (event: Message, downloadOpt: downloadFileOptions, uploadOpt?: uploadFileOptions): Promise<boolean> => {
  const urlCandidates = buildDownloadUrlCandidates(downloadOpt.video_url, downloadOpt.backupUrls)
  if (urlCandidates.length === 0) {
    throw new Error('Invalid URL: (empty)')
  }

  let selectedVideoUrl = urlCandidates[0]
  let selectedUrlIndex = 0
  let fileHeaders: Awaited<ReturnType<Networks['getHeaders']>> | undefined
  let fileSizeContent = Number(downloadOpt.knownFileSizeBytes ?? 0)
  const needsPreflightSize = Config.upload.usefilelimit && !Config.upload.compress
  let skippedWrappedDouyinPreflight = false
  const stableCachePath = resolveStableCachePath(
    downloadOpt.video_url,
    Common.tempDri.video + String(downloadOpt.title.timestampTitle ?? downloadOpt.title.originTitle ?? ''),
    {
      cacheIdentity: downloadOpt.cacheIdentity,
      title: downloadOpt.title.timestampTitle ?? downloadOpt.title.originTitle
    }
  )
  const downloadKey = buildDownloadTaskKey(urlCandidates, downloadOpt.cacheIdentity)
  const completedTask = getReusableCompletedDownload(downloadKey)

  if (fileSizeContent <= 0) {
    if (stableCachePath && fs.existsSync(stableCachePath)) {
      fileSizeContent = resolveStableCacheBytes(stableCachePath)
    } else if (completedTask?.totalBytes) {
      fileSizeContent = completedTask.totalBytes
    }
  }

  if (needsPreflightSize && fileSizeContent <= 0) {
    /** 获取文件大小，仅在需要下载前硬限制时执行 */
    for (const [index, url] of urlCandidates.entries()) {
      try {
        fileHeaders = await new Networks({
          url,
          headers: downloadOpt.headers ?? baseHeaders,
          networkOptions: downloadOpt.networkOptions
        }).getHeaders()
        selectedVideoUrl = url
        selectedUrlIndex = index
        break
      } catch (error) {
        if (index >= urlCandidates.length - 1) {
          if (isDouyinWrappedVideoDownloadUrl(url)) {
            skippedWrappedDouyinPreflight = true
            selectedVideoUrl = url
            selectedUrlIndex = index
            logger.warn('抖音包装播放链接响应头预检失败，跳过文件大小预检并继续下载')
            break
          }
          throw error
        }
        logger.warn(`获取下载地址响应头失败，尝试备用下载地址 (${index + 1}/${urlCandidates.length - 1})`)
      }
    }

    if (!fileHeaders) {
      if (skippedWrappedDouyinPreflight) {
        fileSizeContent = 0
      } else {
        throw new Error('获取响应头失败: 无可用下载地址')
      }
    } else {
      fileSizeContent = extractTotalBytesFromHeaders(fileHeaders)
    }
  }

  const fileSizeInMB = (fileSizeContent / (1024 * 1024)).toFixed(2)
  const fileSize = parseInt(parseFloat(fileSizeInMB).toFixed(2))
  if (needsPreflightSize && fileSizeContent > 0 && fileSize > Config.upload.filelimit) {
    const message = segment.text(`视频：「${downloadOpt.title.originTitle ??
      'Error: 文件名获取失败'}」大小 (${fileSizeInMB} MB) 超出最大限制（设定值：${Config.upload.filelimit} MB），已取消上传`)
    const selfId = event.selfId || uploadOpt?.activeOption?.uin as string
    const contact = event.contact || karin.contactGroup(uploadOpt?.activeOption?.group_id as string) || karin.contactFriend(selfId)

    await karin.sendMsg(selfId, contact, message)
    return false
  }

  // 下载文件，视频URL，标题和自定义headers
  let res = await downloadFile(selectedVideoUrl, {
    title: Config.app.removeCache ? downloadOpt.title.timestampTitle as string : processFilename(downloadOpt.title.originTitle!, 50),
    headers: downloadOpt.headers ?? baseHeaders,
    backupUrls: urlCandidates.slice(selectedUrlIndex + 1),
    maxRetries: downloadOpt.maxRetries,
    networkOptions: downloadOpt.networkOptions,
    cacheIdentity: downloadOpt.cacheIdentity
  })
  res = { ...res, ...downloadOpt.title }
  // 将下载的文件大小转换为MB并保留两位小数
  res.totalBytes = Number((res.totalBytes / (1024 * 1024)).toFixed(2))
  /** 上传视频 */
  return await uploadFile(event, res, downloadOpt.video_url, uploadOpt)
}

/**
 * 异步下载文件的函数。
 * @param videoUrl 下载地址。
 * @param opt 配置选项，包括标题、请求头等。
 * @returns 返回一个包含文件路径和总字节数的对象。
 */
export const downloadFile = async (videoUrl: string, opt: downLoadFileOptions): Promise<fileInfo> => {
  // 记录开始时间
  const startTime = Date.now()
  const filepath = opt.filepath ?? Common.tempDri.video + opt.title
  const urlCandidates = buildDownloadUrlCandidates(videoUrl, opt.backupUrls)
  if (urlCandidates.length === 0) {
    throw new Error('Invalid URL: (empty)')
  }
  const stableCachePath = resolveStableCachePath(videoUrl, filepath, opt)
  const downloadKey = buildDownloadTaskKey(urlCandidates, opt.cacheIdentity)
  const completedTask = getReusableCompletedDownload(downloadKey)
  if (completedTask) {
    logger.info(`检测到相同资源已下载，复用本地文件：${opt.title}`)
    const reused = await reuseDownloadedFile(completedTask.filepath, filepath)
    rememberFileCacheIdentity(completedTask.filepath, opt.cacheIdentity)
    rememberFileCacheIdentity(reused, opt.cacheIdentity)
    return {
      filepath: reused,
      totalBytes: completedTask.totalBytes,
      cacheIdentity: opt.cacheIdentity
    }
  }

  if (stableCachePath && fs.existsSync(stableCachePath)) {
    logger.info(`检测到稳定共享缓存已存在，复用本地文件：${opt.title}`)
    const totalBytes = resolveStableCacheBytes(stableCachePath)
    rememberCompletedDownload(downloadKey, {
      filepath: stableCachePath,
      totalBytes
    })
    const reused = await reuseDownloadedFile(stableCachePath, filepath)
    rememberFileCacheIdentity(stableCachePath, opt.cacheIdentity)
    rememberFileCacheIdentity(reused, opt.cacheIdentity)
    return {
      filepath: reused,
      totalBytes,
      cacheIdentity: opt.cacheIdentity
    }
  }

  const pendingTask = pendingDownloadTasks.get(downloadKey)
  if (pendingTask) {
    logger.info(`检测到相同资源正在下载，等待复用：${opt.title}`)
    const sharedResult = await pendingTask
    const reused = await reuseDownloadedFile(sharedResult.filepath, filepath)
    rememberFileCacheIdentity(sharedResult.filepath, opt.cacheIdentity)
    rememberFileCacheIdentity(reused, opt.cacheIdentity)
    return {
      filepath: reused,
      totalBytes: sharedResult.totalBytes,
      cacheIdentity: opt.cacheIdentity
    }
  }

  // 从配置中读取限速设置
  const uploadConfig = Config.upload
  const downloadTargetPath = stableCachePath ?? filepath
  const throttleConfig = {
    enabled: uploadConfig.downloadThrottle ?? false,
    maxSpeed: (uploadConfig.downloadMaxSpeed ?? 10) * 1024 * 1024, // MB/s -> bytes/s
    autoReduceRatio: uploadConfig.downloadAutoReduce ? 0.6 : 1, // 降速比例
    minSpeed: (uploadConfig.downloadMinSpeed ?? 1) * 1024 * 1024 // MB/s -> bytes/s
  }

  const downloadSingleUrl = async (url: string) => {
    // 使用 networks 类进行文件下载，并通过回调函数实时更新下载进度
    const { filepath: savedFilepath, totalBytes } = await new Networks({
      url,
      headers: opt.headers ?? baseHeaders,
      filepath: downloadTargetPath,
      timeout: 60000, // 增加超时时间
      maxRetries: opt.maxRetries ?? 3, // 增加重试次数
      throttle: throttleConfig,
      networkOptions: opt.networkOptions
    }).downloadStream((downloadedBytes, totalBytes) => {
      // 定义进度条长度及生成进度条字符串的函数
      const barLength = 45
      const generateProgressBar = (progressPercentage: number) => {
        const clampedPercentage = Math.min(100, Math.max(0, progressPercentage))
        const filledLength = Math.floor((clampedPercentage / 100) * barLength)
        const emptyLength = Math.max(0, barLength - filledLength)
        return `[${'\u2588'.repeat(filledLength)}${'\u2591'.repeat(emptyLength)}]`
      }

      // 计算当前下载进度百分比
      const progressPercentage = totalBytes > 0 ? Math.min(100, (downloadedBytes / totalBytes) * 100) : 0

      // 计算动态 RGB 颜色
      const red = Math.floor(255 - (255 * progressPercentage) / 100) // 红色分量随进度减少
      const coloredPercentage = logger.chalk.rgb(red, 255, 0)(`${progressPercentage.toFixed(1)}%`)

      // 计算下载速度（MB/s）
      const elapsedTime = (Date.now() - startTime) / 1000
      const speed = downloadedBytes / elapsedTime
      const formattedSpeed = (speed / 1048576).toFixed(1) + ' MB/s'

      // 计算剩余时间
      const remainingBytes = totalBytes - downloadedBytes // 剩余字节数
      const remainingTime = remainingBytes / speed // 剩余时间（秒）
      const formattedRemainingTime = remainingTime > 60
        ? `${Math.floor(remainingTime / 60)}min ${Math.floor(remainingTime % 60)}s`
        : `${remainingTime.toFixed(0)}s`

      // 计算已下载和总下载的文件大小（MB）
      const downloadedSizeMB = (downloadedBytes / 1048576).toFixed(1)
      const totalSizeMB = (totalBytes / 1048576).toFixed(1)

      // 打印下载进度、速度和剩余时间
      console.log(
        `⬇️  ${opt.title ?? (opt.filepath && opt.filepath.split('/').pop()) ?? '未知文件'} ${generateProgressBar(progressPercentage)} ${coloredPercentage} ${downloadedSizeMB}/${totalSizeMB} MB | ${formattedSpeed} 剩余: ${formattedRemainingTime}\r`
      )
    })

    return { filepath: savedFilepath, totalBytes }
  }

  const downloadTask = (async (): Promise<SharedDownloadResult> => {
    for (const [index, url] of urlCandidates.entries()) {
      try {
        return await downloadSingleUrl(url)
      } catch (error) {
        // 检查是否为网络环境变化或服务器风控导致的错误
        const errorMessage = error instanceof Error ? error.message : String(error)
        const isNetworkChangeError = /ECONNRESET|ETIMEDOUT|ECONNABORTED|aborted|timeout|network|连接被重置|连接超时|连接中止/i.test(errorMessage)

        if (isNetworkChangeError) {
          logger.error('下载失败，可能是由于网络环境变化（如代理切换、VPN切换）或服务器风控导致')
          logger.error(`文件: ${opt.title}`)
          logger.error(`错误详情: ${errorMessage}`)

          if (!uploadConfig.downloadThrottle) {
            logger.error('提示: 如果频繁出现此错误，建议在配置中开启「下载限速」功能')
          }
        }

        if (index >= urlCandidates.length - 1) {
          throw error
        }

        await removePartialDownloadFile(downloadTargetPath)
        logger.warn(`下载地址失败，尝试备用下载地址 (${index + 1}/${urlCandidates.length - 1})`)
      }
    }

    throw new Error('下载失败: 无可用下载地址')
  })()

  pendingDownloadTasks.set(downloadKey, downloadTask)

  try {
    const result = await downloadTask
    rememberCompletedDownload(downloadKey, result)
    rememberFileCacheIdentity(result.filepath, opt.cacheIdentity)
    const reused = await reuseDownloadedFile(result.filepath, filepath)
    rememberFileCacheIdentity(reused, opt.cacheIdentity)
    return {
      filepath: reused,
      totalBytes: result.totalBytes,
      cacheIdentity: opt.cacheIdentity
    }
  } finally {
    pendingDownloadTasks.delete(downloadKey)
  }
}

const buildDownloadUrlCandidates = (videoUrl: string, backupUrls?: string[]): string[] => {
  const result: string[] = []
  for (const url of [videoUrl, ...(backupUrls ?? [])]) {
    const normalized = url?.trim()
    if (normalized && !result.includes(normalized)) {
      result.push(normalized)
    }
  }
  return result
}

const buildDownloadTaskKey = (
  urlCandidates: string[],
  cacheIdentity?: CacheIdentity
): string => {
  if (cacheIdentity) {
    return `${cacheIdentity.scope}:${cacheIdentity.key}`
  }

  return [...new Set(urlCandidates.map(item => item.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .join('\n')
}

const extractDownloadExtension = (
  value: string,
  fallbackPath?: string
): string => {
  try {
    const ext = path.extname(new URL(value).pathname)
    if (ext) return normalizeSharedCacheExtension(ext, '')
  } catch {}

  const fallbackExt = path.extname(String(fallbackPath ?? '').split('?')[0].split('#')[0])
  return normalizeSharedCacheExtension(fallbackExt, '.mp4')
}

const resolveStableCachePath = (
  videoUrl: string,
  filepath: string,
  opt: {
    filepath?: string
    title?: string
    cacheIdentity?: CacheIdentity
  }
): string | null => {
  if (!opt.cacheIdentity) return null
  return buildSharedCachePath(
    opt.cacheIdentity,
    extractDownloadExtension(videoUrl, filepath || opt.title)
  )
}

const resolveStableCacheBytes = (filepath: string): number => {
  const stats = fs.statSync?.(filepath)
  const size = Number(stats?.size ?? 0)
  return Number.isFinite(size) ? size : 0
}

const reuseDownloadedFile = async (
  sourcePath: string,
  targetPath: string
): Promise<string> => {
  if (sourcePath === targetPath) return sourcePath

  try {
    if (fs.existsSync(targetPath)) {
      await fs.promises.unlink(targetPath)
    }
  } catch (error) {
    logger.warn('清理复用下载目标文件失败:', error)
  }

  try {
    await fs.promises.link(sourcePath, targetPath)
  } catch {
    await fs.promises.copyFile(sourcePath, targetPath)
  }

  return targetPath
}

const removePartialDownloadFile = async (filepath: string): Promise<void> => {
  if (!fs.existsSync(filepath)) return

  try {
    await fs.promises.unlink(filepath)
  } catch (error) {
    logger.warn('清理备用下载前的部分文件失败:', error)
  }
}

/**
 * 处理文件名长度，保留文件扩展名
 * @param filename 原始文件名
 * @param maxLength 最大长度（不包括扩展名）
 * @returns 处理后的文件名
 */
const processFilename = (filename: string, maxLength: number = 50): string => {
  // 提取文件扩展名
  const lastDotIndex = filename.lastIndexOf('.')
  const hasExtension = lastDotIndex > 0 && lastDotIndex < filename.length - 1

  if (!hasExtension) {
    // 没有扩展名，直接截取并清理特殊字符
    return filename.substring(0, maxLength).replace(/[\\/:*?"<>|\r\n\s]/g, ' ')
  }

  // 分离文件名主体和扩展名
  const nameWithoutExt = filename.substring(0, lastDotIndex)
  const extension = filename.substring(lastDotIndex)

  // 对文件名主体进行长度限制和特殊字符清理
  const processedName = nameWithoutExt.substring(0, maxLength).replace(/[\\/:*?"<>|\r\n\s]/g, ' ')

  // 重新拼接文件名和扩展名
  return processedName + '...' + extension
}
