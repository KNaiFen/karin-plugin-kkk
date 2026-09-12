import fs from 'node:fs'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { logger } from 'node-karin'
import type { AxiosInstance } from 'node-karin/axios'
import { AxiosError } from 'node-karin/axios'

import {
  sanitizeFailureTraceText,
  summarizeFailureTraceMessage
} from '../ErrorTrace'
import { executeSafeAxiosRequest, type OutboundRequestProfile } from '../OutboundRequest'
import {
  calculateBackoffDelay,
  formatBytes,
  isRecoverableNetworkError,
  isThrottlingError
} from './helpers'
import { ThrottleStream } from './ThrottleStream'
import type {
  CustomAxiosRequestConfig,
  DownloadResult,
  ProgressCallback,
  ThrottleConfig
} from './types'
import { DEFAULT_THROTTLE_CONFIG } from './types'

class DownloadDiagnosticError extends Error {
  constructor (message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'DownloadError'
  }
}

const summarizeDownloadUrl = (value: unknown): string => {
  const summary = summarizeFailureTraceMessage(value)
  if (!summary) return '<empty-url>'

  const fingerprint = summary.sha256.slice(0, 12)
  if (summary.kind !== 'url' || !summary.url) {
    return `<invalid-url> [sha256=${fingerprint}]`
  }

  const pathMarker = summary.url.pathTemplate === '/' ? '/' : '/<redacted>'
  return `${summary.url.protocol}://${summary.url.host}${pathMarker} [sha256=${fingerprint}]`
}

const getSafeErrorCode = (error: unknown): string | undefined => {
  const code = (error as { code?: unknown } | null)?.code
  if (typeof code !== 'string') return undefined
  const normalized = code.trim()
  return /^[A-Z0-9_-]{1,64}$/i.test(normalized) ? normalized : undefined
}

const getSafeHttpStatus = (error: unknown): number | undefined => {
  const status = Number((error as { response?: { status?: unknown } } | null)?.response?.status)
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined
}

const getSafeDownloadErrorDescription = (error: unknown): string => {
  if (error instanceof DownloadDiagnosticError) {
    return sanitizeFailureTraceText(error.message)
  }

  const status = getSafeHttpStatus(error)
  const code = getSafeErrorCode(error)
  const metadata = [
    status ? `HTTP ${status}` : '',
    code ? `错误代码 ${code}` : ''
  ].filter(Boolean)

  return metadata.length > 0
    ? `下载请求失败（${metadata.join('，')}）`
    : '下载处理失败'
}

const buildSafeDownloadCause = (error: unknown, urlSummary: string): Record<string, unknown> => {
  return {
    name: error instanceof Error ? error.name : 'Error',
    status: getSafeHttpStatus(error),
    code: getSafeErrorCode(error),
    urlSummary
  }
}

const formatContentSummary = (content: string): string => {
  const summary = summarizeFailureTraceMessage(content)
  if (!summary) return 'length=0'
  return `length=${summary.length}, sha256=${summary.sha256.slice(0, 16)}`
}

/**
 * 文件下载器
 * 支持断点续传、限速下载、自动重试
 */
export class Downloader {
  private axiosInstance: AxiosInstance
  private url: string
  private filepath: string
  private headers: Record<string, string>
  private timeout: number
  private maxRetries: number
  private throttleConfig: ThrottleConfig
  private currentSpeed: number
  private consecutiveResets: number
  private outboundProfile?: OutboundRequestProfile

  constructor (
    axiosInstance: AxiosInstance,
    url: string,
    filepath: string,
    headers: Record<string, string>,
    timeout: number,
    maxRetries: number,
    throttleConfig?: Partial<ThrottleConfig>,
    outboundProfile?: OutboundRequestProfile
  ) {
    this.axiosInstance = axiosInstance
    this.url = url
    this.filepath = filepath
    this.headers = headers
    this.timeout = timeout
    this.maxRetries = maxRetries
    this.throttleConfig = { ...DEFAULT_THROTTLE_CONFIG, ...throttleConfig }
    this.currentSpeed = this.throttleConfig.maxSpeed
    this.consecutiveResets = 0
    this.outboundProfile = outboundProfile
  }

  /**
   * 执行下载
   * @param progressCallback 进度回调
   * @param retryCount 当前重试次数
   */
  async download (
    progressCallback: ProgressCallback,
    retryCount = 0
  ): Promise<DownloadResult> {
    // URL 校验
    if (!this.url || !/^https?:\/\//i.test(this.url)) {
      throw new DownloadDiagnosticError(`下载地址无效，URL 摘要: ${summarizeDownloadUrl(this.url)}`)
    }

    if (!this.filepath) {
      throw new DownloadDiagnosticError('未指定文件保存路径: filepath 为空')
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)
    let intervalId: NodeJS.Timeout | null = null
    let throttleStream: ThrottleStream | null = null
    let writer: fs.WriteStream | null = null

    try {
      // 检查断点续传
      let startByte = 0
      if (fs.existsSync(this.filepath)) {
        const stats = fs.statSync(this.filepath)
        // 由于 stream.pipeline 出错时可能丢失内部缓冲区数据（最多约 32KB），
        // 保守起见回退 256KB 重新下载，避免文件损坏
        startByte = Math.max(0, stats.size - 256 * 1024)
        if (startByte > 0 && startByte < stats.size) {
          // 截断文件到回退位置，避免 r+ 模式下旧数据残留在文件末尾
          fs.truncateSync(this.filepath, startByte)
          logger.debug(`检测到部分下载文件，截断到 ${formatBytes(startByte)} 后重新下载（回退 256KB 安全裕量）`)
        } else if (startByte > 0) {
          logger.debug(`检测到部分下载文件，从 ${formatBytes(startByte)} 处继续下载（回退 256KB 安全裕量）`)
        } else {
          logger.debug('检测到部分下载文件，文件较小，将重新下载')
        }
      }

      // 构建请求配置
      const requestConfig: CustomAxiosRequestConfig = {
        url: this.url,
        method: 'GET',
        responseType: 'stream',
        signal: controller.signal,
        headers: { ...this.headers },
        skipRetry: true
      }

      // 断点续传
      if (startByte > 0) {
        requestConfig.headers = {
          ...requestConfig.headers,
          Range: `bytes=${startByte}-`
        }
      }

      logger.debug('开始下载流', {
        urlSummary: summarizeDownloadUrl(this.url),
        throttleEnabled: this.throttleConfig.enabled,
        currentSpeed: this.throttleConfig.enabled ? formatBytes(this.currentSpeed) + '/s' : '不限速'
      })

      const { response } = await executeSafeAxiosRequest({
        ...requestConfig,
        url: this.url,
        timeout: this.timeout
      }, {
        profile: this.outboundProfile,
        requester: async (safeConfig) => await this.axiosInstance(safeConfig)
      })
      clearTimeout(timeoutId)

      // 检查 HTTP 状态码
      // 416 Range Not Satisfiable
      if (response.status === 416) {
        logger.warn('服务器返回 416，文件可能已下载完成，验证文件大小...')

        if (fs.existsSync(this.filepath)) {
          const stats = fs.statSync(this.filepath)
          logger.debug(`当前文件大小: ${formatBytes(stats.size)}`)

          // 如果文件大小合理（大于 1KB），认为下载完成
          if (stats.size > 1024) {
            logger.debug('文件大小合理，认为下载已完成')
            return {
              filepath: this.filepath,
              totalBytes: stats.size
            }
          } else {
            // 文件太小，删除并重新下载
            logger.warn('文件太小，删除并重新下载')
            fs.unlinkSync(this.filepath)
            return this.download(progressCallback, retryCount + 1)
          }
        }
      }

      if (response.status !== 200 && response.status !== 206) {
        logger.error(`下载失败: HTTP ${response.status}, URL 摘要: ${summarizeDownloadUrl(this.url)}`)

        // 如果响应体很小，可能是错误信息，尝试读取
        if (response.headers['content-length'] && parseInt(response.headers['content-length']) < 10240) {
          let errorBody = ''
          response.data.on('data', (chunk: Buffer) => {
            errorBody += chunk.toString()
          })
          await new Promise(resolve => setTimeout(resolve, 100))
          logger.error(`响应内容摘要: ${formatContentSummary(errorBody)}`)
        }

        throw new DownloadDiagnosticError(
          `HTTP ${response.status}`
        )
      }

      // 检查服务器是否支持断点续传
      const supportsRange = response.status === 206
      if (startByte > 0 && !supportsRange) {
        logger.warn('服务器不支持断点续传，将重新下载整个文件')
        if (fs.existsSync(this.filepath)) {
          fs.unlinkSync(this.filepath)
        }
        startByte = 0
      }

      // 验证 206 响应的 Content-Range 起始位置，防止 CDN 返回错误范围导致文件损坏
      if (supportsRange && response.headers['content-range']) {
        const contentRange = String(response.headers['content-range'])
        const rangeMatch = contentRange.match(/bytes\s*(\d+)-\d+\/\d+/)
        if (rangeMatch) {
          const responseStartByte = Number.parseInt(rangeMatch[1], 10)
          if (responseStartByte !== startByte) {
            logger.warn(`Content-Range 起始位置不匹配: 请求 ${startByte}, 实际 ${responseStartByte}，将重新下载`)
            if (fs.existsSync(this.filepath)) {
              fs.unlinkSync(this.filepath)
            }
            startByte = 0
          }
        }
      }

      // 解析内容长度
      const rawContentLength = response.headers['content-length']
      const contentLength = Number.parseInt(rawContentLength ?? '-1', 10)
      if (Number.isNaN(contentLength)) {
        throw new DownloadDiagnosticError(
          '无效的 content-length 响应头'
        )
      }

      const totalBytes = supportsRange ? startByte + contentLength : contentLength
      let downloadedBytes = startByte
      let lastPrintedPercentage = -1

      // 创建写入流
      // 使用 r+ 模式和 start 选项，从指定位置覆盖写入，避免 append 模式导致的数据错位
      writer = fs.createWriteStream(this.filepath, {
        flags: startByte > 0 ? 'r+' : 'w',
        start: startByte > 0 ? startByte : undefined
      })

      // 进度回调
      const printProgress = () => {
        if (totalBytes > 0) {
          const progressPercentage = Math.floor((downloadedBytes / totalBytes) * 100)
          if (progressPercentage !== lastPrintedPercentage) {
            progressCallback(downloadedBytes, totalBytes)
            lastPrintedPercentage = progressPercentage
          }
        } else {
          progressCallback(downloadedBytes, totalBytes)
        }
      }

      const interval = totalBytes > 0 && totalBytes < 10 * 1024 * 1024 ? 1000 : 500
      intervalId = setInterval(printProgress, interval)

      // 创建计数流
      const counterStream = new Transform({
        transform (chunk, encoding, callback) {
          downloadedBytes += chunk.length
          callback(null, chunk)
        }
      })

      // 根据配置决定是否使用限速流
      if (this.throttleConfig.enabled) {
        throttleStream = new ThrottleStream(this.currentSpeed)
        logger.debug(`启用限速下载: ${formatBytes(this.currentSpeed)}/s`)
        await pipeline(response.data, throttleStream, counterStream, writer as fs.WriteStream)
      } else {
        await pipeline(response.data, counterStream, writer as fs.WriteStream)
      }

      if (intervalId) clearInterval(intervalId)

      // pipeline 已经等待所有流完成，包括 writer 的 finish 事件
      logger.debug('文件下载并写入完成')

      // 验证文件大小
      if (fs.existsSync(this.filepath)) {
        const stats = fs.statSync(this.filepath)
        const actualSize = stats.size
        const expectedSize = totalBytes > 0 ? totalBytes : downloadedBytes

        // 检查文件是否太小（可能是错误响应）
        if (actualSize < 1024 && expectedSize < 1024) {
          logger.error(`下载的文件异常小 (${formatBytes(actualSize)})，可能是错误响应`)

          // 尝试读取文件内容
          try {
            const content = fs.readFileSync(this.filepath, 'utf-8')
            logger.error(`文件内容摘要: ${formatContentSummary(content)}`)
          } catch {
            logger.error('无法读取文件内容（可能是二进制文件）')
          }

          throw new DownloadDiagnosticError(`下载的文件异常小: ${formatBytes(actualSize)}，可能是错误响应或链接失效`)
        }

        if (actualSize < expectedSize) {
          logger.warn(`文件大小不匹配: 实际 ${formatBytes(actualSize)}, 预期 ${formatBytes(expectedSize)}`)
          logger.warn(`差异: ${formatBytes(expectedSize - actualSize)} (${((expectedSize - actualSize) / expectedSize * 100).toFixed(2)}%)`)

          // 如果差异大于 10KB，认为下载不完整
          if (expectedSize - actualSize > 10 * 1024) {
            throw new DownloadDiagnosticError(`文件下载不完整: 实际 ${formatBytes(actualSize)}, 预期 ${formatBytes(expectedSize)}`)
          }
        } else {
          logger.debug(`文件大小验证通过: ${formatBytes(actualSize)}`)
        }
      }

      // 下载成功，重置连续重置计数
      this.consecutiveResets = 0

      return {
        filepath: this.filepath,
        totalBytes: totalBytes > 0 ? totalBytes : downloadedBytes
      }
    } catch (error) {
      clearTimeout(timeoutId)
      if (intervalId) clearInterval(intervalId)

      const isRecoverable = isRecoverableNetworkError(error)
      const isThrottling = isThrottlingError(error)
      const errorDesc = getSafeDownloadErrorDescription(error)
      const urlSummary = summarizeDownloadUrl(this.url)

      if (error instanceof AxiosError) {
        logger.error(`请求失败: ${errorDesc}, URL 摘要: ${urlSummary}`)
      } else {
        logger.error(`下载失败: ${errorDesc}, URL 摘要: ${urlSummary}`)
      }

      // 如果是断流错误，自动降速
      if (isThrottling && this.throttleConfig.enabled) {
        this.consecutiveResets++
        const newSpeed = Math.max(
          this.currentSpeed * this.throttleConfig.autoReduceRatio,
          this.throttleConfig.minSpeed
        )

        if (newSpeed < this.currentSpeed) {
          logger.warn(`检测到服务器断流 (连续 ${this.consecutiveResets} 次)，自动降速: ${formatBytes(this.currentSpeed)}/s -> ${formatBytes(newSpeed)}/s`)
          this.currentSpeed = newSpeed
        } else {
          logger.warn(`已达到最低速度限制 ${formatBytes(this.throttleConfig.minSpeed)}/s，无法继续降速`)
        }
      }

      const nextDelay = calculateBackoffDelay(retryCount)

      if (retryCount < this.maxRetries) {
        // 等待 writer 完全关闭，确保异步写入操作已完成，避免 stat 获取到不准确的文件大小
        if (writer && !(writer.closed ?? false)) {
          const ws = writer
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              ws.off('close', onClose)
              resolve()
            }, 1000)
            const onClose = () => {
              clearTimeout(timeout)
              resolve()
            }
            ws.once('close', onClose)
          })
        }

        if (isRecoverable && fs.existsSync(this.filepath)) {
          const stats = fs.statSync(this.filepath)
          logger.warn(`检测到可恢复的网络错误，保留已下载的 ${formatBytes(stats.size)} 数据`)
          logger.warn(`正在重试下载... (${retryCount + 1}/${this.maxRetries})，将在 ${nextDelay / 1000} 秒后使用断点续传重试`)
        } else {
          logger.warn(`正在重试下载... (${retryCount + 1}/${this.maxRetries})，将在 ${nextDelay / 1000} 秒后重试`)
        }

        await new Promise(resolve => setTimeout(resolve, nextDelay))
        return this.download(progressCallback, retryCount + 1)
      } else {
        // 最终失败处理
        if (fs.existsSync(this.filepath)) {
          const stats = fs.statSync(this.filepath)

          if (isRecoverable && stats.size > 0) {
            logger.warn(`下载失败但保留了部分文件 (${formatBytes(stats.size)}): ${this.filepath}`)
            logger.warn('这可能是由于网络环境变化或服务器风控导致的，文件已保留供后续恢复')

            if (isThrottling) {
              logger.warn('建议: 服务器可能有下载速度限制，请尝试在配置中降低 maxSpeed 参数')
            }
          } else {
            try {
              fs.unlinkSync(this.filepath)
              logger.debug('已清理部分下载的文件')
            } catch (cleanupError) {
              logger.warn(`清理部分下载文件失败: ${getSafeDownloadErrorDescription(cleanupError)}`)
            }
          }
        }

        throw new DownloadDiagnosticError(
          `在 ${this.maxRetries} 次尝试后下载失败: ${errorDesc}, URL 摘要: ${urlSummary}`,
          buildSafeDownloadCause(error, urlSummary)
        )
      }
    }
  }

  /**
   * 手动设置下载速度
   * @param speed 速度 (bytes/s)
   */
  setSpeed (speed: number): void {
    this.currentSpeed = Math.max(speed, this.throttleConfig.minSpeed)
    logger.debug(`手动设置下载速度: ${formatBytes(this.currentSpeed)}/s`)
  }

  /**
   * 获取当前速度设置
   */
  getSpeed (): number {
    return this.currentSpeed
  }
}
