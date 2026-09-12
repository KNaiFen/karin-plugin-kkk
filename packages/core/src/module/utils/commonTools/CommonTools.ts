import type { Message } from 'node-karin'
import type { Response } from 'node-karin/express'

import { removeCacheFile } from './cacheFiles'
import {
  calculateBitrate,
  chineseToArabic,
  count,
  formatCookies,
  formatFileSize,
  getVideoFileSize
} from './formatters'
import { getReplyMessage } from './replyMessage'
import { createTempDirectories, type TempDirectories } from './tempDirectories'
import { useDarkTheme } from './theme'
import { type VideoPreviewInfo, VideoPreviewStore } from './videoPreviewState'
import { validateVideoRequest } from './videoRequest'

/** 常用工具合集 */
class CommonTools {
  tempDri: TempDirectories
  private readonly videoPreviewStore: VideoPreviewStore

  constructor () {
    this.tempDri = createTempDirectories()
    this.videoPreviewStore = new VideoPreviewStore()
  }

  async getReplyMessage (e: Message): Promise<string> {
    return getReplyMessage(e)
  }

  chineseToArabic (chineseNumber: string): number {
    return chineseToArabic(chineseNumber)
  }

  formatCookies (cookies: any[]): string {
    return formatCookies(cookies)
  }

  calculateBitrate (targetSizeMB: number, duration: number): number {
    return calculateBitrate(targetSizeMB, duration)
  }

  async getVideoFileSize (filePath: string): Promise<number> {
    return getVideoFileSize(filePath)
  }

  async removeFile (filePath: string, force = false): Promise<boolean> {
    return removeCacheFile(filePath, this.tempDri.default, force)
  }

  registerVideoPreview (filePath: string, removeCache: boolean, ttlMs: number): VideoPreviewInfo {
    return this.videoPreviewStore.register(filePath, removeCache, ttlMs)
  }

  getVideoPreview (filename: string): VideoPreviewInfo | null {
    return this.videoPreviewStore.get(filename)
  }

  markVideoPreviewRemoved (filePathOrFilename: string): VideoPreviewInfo | null {
    return this.videoPreviewStore.markRemoved(filePathOrFilename)
  }

  useDarkTheme (): boolean {
    return useDarkTheme()
  }

  validateVideoRequest (filename: string | undefined, res: Response): string | null {
    return validateVideoRequest(filename, res, this.tempDri.video)
  }

  count (num: number): string {
    return count(num)
  }

  formatFileSize (sizeInMB: number | string): string {
    return formatFileSize(sizeInMB)
  }
}

export const Common = new CommonTools()
