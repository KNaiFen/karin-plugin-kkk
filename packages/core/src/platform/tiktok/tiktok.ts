import { logger, type Message } from 'node-karin'

import {
  Base,
  baseHeaders,
  createPlainVideoTitleContext,
  downloadVideo,
  replyPlainVideoTitle,
  type PlainVideoTitleContext
} from '@/module'
import { resolveParsedPostWithCache } from '@/module/summaryParse/parsedPostCache'
import { Config } from '@/module/utils/Config'

import { buildTikTokNetworkOptions } from './api'
import {
  buildParsedPostVideoDownloadEntries
} from '../parsedPostAdapters'
import type { TikTokIdData } from './getID'

export class TikTok extends Base {
  e: Message
  data: TikTokIdData
  plainVideoTitle: PlainVideoTitleContext

  constructor (e: Message, data: TikTokIdData, options?: { plainVideoTitle?: PlainVideoTitleContext }) {
    super(e)
    this.e = e
    this.data = data
    this.plainVideoTitle = options?.plainVideoTitle ?? createPlainVideoTitleContext(false, 'TikTok')
  }

  async TikTokHandler (): Promise<boolean> {
    Config.app.parseTip && await this.e.reply('检测到 TikTok 链接，开始解析')

    if (!this.data.item_id) {
      throw new Error('TikTok 作品 ID 为空，无法解析')
    }

    const { parsedPost: post } = await resolveParsedPostWithCache({
      platform: 'tiktok',
      url: this.data.url
    })
    const entry = buildParsedPostVideoDownloadEntries(post)[0]
    if (!entry) {
      throw new Error('TikTok 作品未获取到可下载视频')
    }
    await replyPlainVideoTitle(this.e, this.plainVideoTitle, post.title, post.author?.name, 'video')

    logger.info(`[TikTok] 开始下载作品：itemId=${this.data.item_id}，备用地址 ${entry.video.backupUrls?.length ?? 0} 个`)
    return await downloadVideo(
      this.e,
      {
        ...entry.options,
        headers: {
          ...baseHeaders,
          Cookie: this.data.cookie,
          Referer: 'https://www.tiktok.com/',
          ...(entry.options.headers ?? {})
        },
        networkOptions: buildTikTokNetworkOptions()
      },
      {
        message_id: this.e.messageId
      }
    )
  }
}
