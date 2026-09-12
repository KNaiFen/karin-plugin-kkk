import { type Message } from 'node-karin'

import { resolveParsedPostWithCache } from '@/module/summaryParse/parsedPostCache'
import { Base, downloadVideo } from '@/module/utils/Base'
import { Config } from '@/module/utils/Config'
import { extractTotalBytesFromHeaders } from '@/module/utils/Network/helpers'
import { Network as Networks } from '@/module/utils/Network/Network'
import {
  createPlainVideoTitleContext,
  type PlainVideoTitleContext,
  replyPlainVideoTitle
} from '@/module/utils/PlainTitleReply'
import { Render, replyRenderedImages } from '@/module/utils/Render'
import {
  buildParsedPostVideoDownloadEntries
} from '@/platform/parsedPostAdapters'
import type { ExtendedKuaishouOptionsType, KuaishouDataTypes } from '@/types'

import { kuaishouComments } from './comments'

export class Kuaishou extends Base {
  e: Message
  type: KuaishouDataTypes[keyof KuaishouDataTypes]
  is_mp4: any
  plainVideoTitle: PlainVideoTitleContext

  constructor (e: Message, iddata: ExtendedKuaishouOptionsType, options?: { plainVideoTitle?: PlainVideoTitleContext }) {
    super(e)
    this.e = e
    this.type = iddata?.type
    this.plainVideoTitle = options?.plainVideoTitle ?? createPlainVideoTitleContext(false, '快手')
  }

  async KuaishouHandler (data: any, url?: string) {
    if (data.VideoData.data.data.visionVideoDetail.status !== 1) {
      await this.e.reply('不支持解析的视频')
      return true
    }
    Config.app.parseTip && await this.e.reply('检测到快手链接，开始解析')
    const post = url
      ? (await resolveParsedPostWithCache({
        platform: 'kuaishou',
        url
      })).parsedPost
      : null
    const entry = post ? buildParsedPostVideoDownloadEntries(post)[0] : null
    const video_url = entry?.options.video_url ?? data.VideoData.data.data.visionVideoDetail.photo.photoUrl
    const transformedData = Object.entries(data.EmojiData.data.data.visionBaseEmoticons.iconUrls).map(([name, path]) => {
      return { name, url: `https:${path}` }
    })
    const CommentsData = await kuaishouComments(data.CommentsData.data, transformedData)
    const fileHeaders = await new Networks({ url: video_url, headers: this.headers }).getHeaders()
    const fileSizeContent = extractTotalBytesFromHeaders(fileHeaders)
    const fileSizeInMB = (fileSizeContent / (1024 * 1024)).toFixed(2)
    if (post) {
      await replyPlainVideoTitle(this.e, this.plainVideoTitle, post.title, post.author?.name, 'video')
    }
    const img = await Render(this.e, 'kuaishou/comment', {
      Type: '视频',
      viewCount: data.VideoData.data.data.visionVideoDetail.photo.viewCount,
      CommentsData,
      CommentLength: CommentsData?.length ?? 0,
      share_url: video_url,
      VideoSize: fileSizeInMB,
      likeCount: data.VideoData.data.data.visionVideoDetail.photo.likeCount
    })
    await replyRenderedImages(this.e, img)
    await downloadVideo(this.e, {
      ...(entry?.options ?? {
        video_url,
        title: {
          timestampTitle: `tmp_${Date.now()}.mp4`,
          originTitle: `${data.VideoData.data.data.visionVideoDetail.photo.caption}.mp4`
        }
      }),
      knownFileSizeBytes: fileSizeContent,
      headers: {
        ...(entry?.options.headers ?? this.headers)
      }
    })
    return true
  }
}
