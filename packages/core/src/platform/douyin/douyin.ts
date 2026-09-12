import fs from 'node:fs'

import type { DyEmojiList, DyVideoWork } from '@ikenxuan/amagi'
import type { UserVideoListData } from '@kkk/template-contracts'
import { format } from 'date-fns'
import karin, { type Elements, Message } from 'node-karin'
import { common, logger, mkdirSync, segment } from 'node-karin'

import {
  Base,
  baseHeaders,
  buildGoogleMotionPhoto,
  Common,
  Count,
  createPlainVideoTitleContext,
  type DouyinWorkResult,
  downloadFile,
  downloadVideo,
  fileInfo,
  type LiveImageMergeOptions,
  loopVideoWithTransition,
  Networks,
  type PlainVideoTitleContext,
  processImageUrl,
  recordFailureTraceStep,
  Render,
  replyPlainVideoTitle,
  replyRenderedImages,
  uploadFile } from '@/module/utils'
import { Config } from '@/module/utils/Config'
import { EmojiReactionManager, getEmojiId } from '@/module/utils/EmojiReaction'
import {
  replyAndRecordLongTaskCompletionAnchor,
  sendForwardAndRecordLongTaskCompletionAnchor
} from '@/module/utils/LongTaskCompletionNotify'
import { type DouyinNormalizedArticleContent, normalizeDouyinArticleContent } from '@/platform/douyin/articleContent'
import { douyinComments } from '@/platform/douyin/comments'
import { burnDouyinDanmaku, type DouyinDanmakuElem } from '@/platform/douyin/danmaku'
import { resolveDouyinDownloadUrlCandidates } from '@/platform/douyin/downloadUrls'
import { buildDouyinGraphicReplyPlan, type DouyinGraphicLiveItem, type DouyinGraphicReplyPlan, resolveDouyinMusicUrl } from '@/platform/douyin/graphicReply'
import {
  buildDouyinLiveInfoHeaders,
  buildDouyinLiveRecordHeaders,
  fetchDouyinLiveDataFromReflow,
  fetchDouyinLiveReflowInfo,
  fetchDouyinLiveWebEnterInfo,
  getDouyinLiveContainer,
  getDouyinLiveItem,
  isDouyinLiveStatusActive,
  normalizeDouyinLiveQuality,
  normalizeDouyinLiveRecordSeconds,
  recordDouyinLiveStream,
  selectDouyinLiveStream
} from '@/platform/douyin/liveRecorder'
import {
  buildDouyinLongTextWorkData,
  resolveDouyinWorkDisplayText,
  shouldUseDouyinLongTextCard
} from '@/platform/douyin/longTextCard'
import { fetchDouyinOneWork } from '@/platform/douyin/oneWork'
import { getDouyinShareableVideoUrl } from '@/platform/douyin/workType'
import { buildParsedPostTextModeReply } from '@/platform/parsedPostAdapters'
import { resolveDouyinParsedPostFromWorkData } from '@/platform/resolveParsedPost'
import { DouyinDataTypes, DouyinIdData } from '@/types'

const douyinCdnNetworkOptions = { proxy: false as const }

const buildDouyinMediaCacheIdentity = (key: string) => ({
  scope: 'media' as const,
  key
})

const buildDouyinWorkMediaBaseKey = (awemeId: string, suffix: string) => {
  return `douyin:one_work:${String(awemeId ?? '').trim()}:${suffix}`
}

const buildDouyinWorkImageMediaBaseKey = (awemeId: string, index: number) => {
  return buildDouyinWorkMediaBaseKey(awemeId, `image:${index}`)
}

export type dyVideo = {
  FPS: number
  HDR_bit: string
  HDR_type: string
  bit_rate: number
  format: string
  gear_name: string
  is_bytevc1: number
  is_h265: number
  play_addr: {
    data_size: number
    file_cs: string
    file_hash: string
    height: number
    uri: string
    url_key: string
    url_list: string[]
    width: number
  }
  quality_type: number
  video_extra: string
}
export class DouYin extends Base {
  e: Message
  type: DouyinDataTypes[keyof DouyinDataTypes]
  is_slides: boolean
  /** 强制烧录弹幕（用于 #弹幕解析 命令） */
  forceBurnDanmaku: boolean
  plainVideoTitle: PlainVideoTitleContext
  /** 标记是否已处理 live 图（用于判断是否需要发送音频） */
  hasProcessedLiveImage: boolean
  get botadapter (): string {
    return this.e.bot?.adapter?.name
  }

  constructor (e: Message, iddata: DouyinIdData, options?: { forceBurnDanmaku?: boolean, plainVideoTitle?: PlainVideoTitleContext }) {
    super(e)
    this.e = e
    this.type = iddata?.type
    this.is_slides = false
    this.forceBurnDanmaku = options?.forceBurnDanmaku ?? false
    this.plainVideoTitle = options?.plainVideoTitle ?? createPlainVideoTitleContext(false, '抖音')
    this.hasProcessedLiveImage = false
    this.headers = {
      ...this.headers,
      Referer: 'https://www.douyin.com',
      Cookie: Config.cookies?.douyin ?? ''
    }
  }

  private sanitizeGraphicTitle (value: unknown, fallback = 'douyin_graphic') {
    const normalized = String(value ?? '').trim() || fallback
    return normalized.substring(0, 50).replace(/[\\/:*?"<>|\r\n]/g, ' ')
  }

  private async resolveDownloadCandidates (videoLike: any, logContext: string) {
    return await resolveDouyinDownloadUrlCandidates(videoLike, {
      headers: this.headers as Record<string, string>,
      networkOptions: douyinCdnNetworkOptions,
      logContext
    })
  }

  private async sendGraphicBaseImages (plan: DouyinGraphicReplyPlan, title: string) {
    if (!plan.baseImages.length) return 0

    const imageElements: Elements[] = []

    for (const item of plan.baseImages) {
      const imageUrl = await processImageUrl(item.url, title, item.index)
      imageElements.push(segment.image(imageUrl))

      if (Config.app.removeCache === false) {
        mkdirSync(`${Common.tempDri.images}${title}`)
        const path = `${Common.tempDri.images}${title}/${item.index + 1}.png`
        await new Networks({ url: item.url, type: 'arraybuffer' }).getData().then((data) => fs.promises.writeFile(path, Buffer.from(data)))
      }
    }

    if (imageElements.length === 1) {
      await replyAndRecordLongTaskCompletionAnchor(this.e, imageElements[0])
      return imageElements.length
    }

    const forward = common.makeForward(
      imageElements,
      Config.app.fakeForward ? this.e.sender.userId : this.e.bot.account.selfId,
      Config.app.fakeForward ? this.e.sender.nick : this.e.bot.account.name
    )
    await sendForwardAndRecordLongTaskCompletionAnchor(this.e, forward, {
      source: '图片合集',
      summary: `查看${forward.length}张图片消息`,
      prompt: plan.isArticleLike ? '抖音文章解析结果' : '抖音图集解析结果',
      news: [{ text: '点击查看解析结果' }]
    })
    return imageElements.length
  }

  private async sendGraphicBgm (awemeId: string, title: string, bgmUrl: string, bgmBackupUrls: string[] = []) {
    if (!bgmUrl) return

    if (Config.app.removeCache === false) {
      try {
        await downloadFile(bgmUrl, {
          title,
          filepath: Common.tempDri.images + `${title}.mp3`,
          headers: this.headers,
          backupUrls: bgmBackupUrls,
          cacheIdentity: buildDouyinMediaCacheIdentity(buildDouyinWorkMediaBaseKey(awemeId, 'music:0'))
        })
      } catch (error) {
        logger.warn(`[Douyin] 预留图文 BGM 缓存失败: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    const audioFile = await downloadFile(bgmUrl, {
      title: `Douyin_BGM_${Date.now()}.mp3`,
      headers: this.headers,
      backupUrls: bgmBackupUrls,
      cacheIdentity: buildDouyinMediaCacheIdentity(buildDouyinWorkMediaBaseKey(awemeId, 'music:0'))
    })
    if (!audioFile.filepath) return

    const audioBase64 = `base64://${fs.readFileSync(audioFile.filepath).toString('base64')}`
    await this.e.reply(segment.record(audioBase64, false))
    await Common.removeFile(audioFile.filepath, true)
  }

  private async sendGraphicDerivedArtifacts (
    awemeId: string,
    title: string,
    liveItems: DouyinGraphicLiveItem[],
    bgmUrl: string,
    bgmBackupUrls: string[] = []
  ) {
    if (!liveItems.length) return

    const temp: fileInfo[] = []
    const derivedElements: Elements[] = []
    let hasGeneratedLivePhoto = false
    let liveimgbgm: fileInfo | null = null
    let bgmContext: LiveImageMergeOptions['context'] | null = null
    const mergeMode = Config.douyin.liveImageMergeMode ?? 'independent'
    const livePhotoMode = Config.app.livePhotoMode ?? 'video_and_livephoto'
    const shouldGenerateVideo = livePhotoMode === 'video_and_livephoto' || livePhotoMode === 'video_only'
    const shouldGenerateLivePhoto = livePhotoMode === 'video_and_livephoto' || livePhotoMode === 'livephoto_only'

    try {
      if (bgmUrl) {
        liveimgbgm = await downloadFile(
          bgmUrl,
          {
            title: `Douyin_tmp_A_${Date.now()}.mp3`,
            headers: this.headers,
            backupUrls: bgmBackupUrls,
            cacheIdentity: buildDouyinMediaCacheIdentity(buildDouyinWorkMediaBaseKey(awemeId, 'music:0'))
          }
        )
        if (liveimgbgm.filepath) {
          temp.push(liveimgbgm)
        }
      }

      for (const item of liveItems) {
        const liveImageCandidates = await this.resolveDownloadCandidates(
          item.video,
          `作品 ${awemeId} live 图 ${item.index + 1}`
        )
        const liveimg = await downloadFile(
          liveImageCandidates.videoUrl,
          {
            title: `Douyin_tmp_V_${Date.now()}.mp4`,
            headers: this.headers,
            backupUrls: liveImageCandidates.backupUrls,
            cacheIdentity: buildDouyinMediaCacheIdentity(`${buildDouyinWorkImageMediaBaseKey(awemeId, item.index)}:live-video`)
          }
        )

        if (!liveimg.filepath) continue

        try {
          const outputPath = Common.tempDri.video + `Douyin_Result_${Date.now()}.mp4`
          const loopCount = item.clipType === 4 ? 1 : 3
          let staticImgPath = ''

          if (item.imageUrl) {
            const staticImg = await downloadFile(item.imageUrl, {
              title: `Douyin_static_${Date.now()}_${item.index}.jpg`,
              headers: this.headers,
              filepath: Common.tempDri.images + `Douyin_static_${Date.now()}_${item.index}.jpg`,
              cacheIdentity: buildDouyinMediaCacheIdentity(`${buildDouyinWorkImageMediaBaseKey(awemeId, item.index)}:static-image`)
            })
            if (staticImg.filepath) {
              temp.push({ filepath: staticImg.filepath, totalBytes: 0 })
            }
            staticImgPath = staticImg.filepath ?? ''
          }

          if (shouldGenerateVideo) {
            const transitionEnabled = loopCount > 1 && Boolean(staticImgPath)
            const safeStaticPath = staticImgPath || liveimg.filepath
            const result = await loopVideoWithTransition({
              inputPath: liveimg.filepath,
              outputPath,
              loopCount,
              staticImagePath: safeStaticPath,
              transitionEnabled,
              bgmPath: liveimgbgm?.filepath,
              mergeMode,
              context: bgmContext ?? undefined
            })
            const success = result.success
            if (mergeMode === 'continuous' && result.context) {
              bgmContext = result.context
            }

            if (success) {
              const filePath = Common.tempDri.video + `tmp_${Date.now()}.mp4`
              fs.renameSync(outputPath, filePath)
              logger.mark(`视频文件重命名完成: ${outputPath.split('/').pop()} -> ${filePath.split('/').pop()}`)
              temp.push({ filepath: filePath, totalBytes: 0 })
              const videoPath = Config.upload.videoSendMode === 'base64'
                ? `base64://${(fs.readFileSync(filePath)).toString('base64')}`
                : `file://${filePath}`
              derivedElements.push(segment.video(videoPath))
            }
          }

          if (shouldGenerateLivePhoto && item.clipType === 5 && staticImgPath) {
            const motionPhotoCoverPath = Common.tempDri.images + `MVIMG_${format(new Date(), 'yyyyMMdd_HHmmss_SSS')}_${item.index}.jpg`
            const motionPhotoCreated = await buildGoogleMotionPhoto({
              imagePath: staticImgPath,
              videoPath: liveimg.filepath,
              outputPath: motionPhotoCoverPath
            })
            if (motionPhotoCreated) {
              temp.push({ filepath: motionPhotoCoverPath, totalBytes: 0 })
              const motionPhotoCover = Config.upload.imageSendMode === 'base64'
                ? `base64://${(fs.readFileSync(motionPhotoCoverPath)).toString('base64')}`
                : `file://${motionPhotoCoverPath}`
              derivedElements.push(segment.image(motionPhotoCover))
              hasGeneratedLivePhoto = true
            }
          }
        } finally {
          logger.mark('正在尝试删除缓存文件')
          await Common.removeFile(liveimg.filepath, true)
        }
      }

      if (hasGeneratedLivePhoto) {
        const tipImg = await Render(this.e, 'other/live-photo-tip', {
          title: '实况照片已生成',
          description: '保存原图到相册即可识别为实况图'
        })
        derivedElements.push(...tipImg)
      }

      if (!derivedElements.length) return

      this.hasProcessedLiveImage = true
      if (derivedElements.length === 1) {
        await replyAndRecordLongTaskCompletionAnchor(this.e, derivedElements[0])
        return
      }

      const forward = common.makeForward(
        derivedElements,
        Config.app.fakeForward ? this.e.sender.userId : this.e.bot.account.selfId,
        Config.app.fakeForward ? this.e.sender.nick : this.e.bot.account.name
      )
      await sendForwardAndRecordLongTaskCompletionAnchor(this.e, forward, {
        source: '图文派生产物',
        summary: `查看${forward.length}条附加媒体消息`,
        prompt: '抖音图文派生产物',
        news: [{ text: '点击查看附加媒体' }]
      })
    } finally {
      for (const item of temp) {
        await Common.removeFile(item.filepath, true)
      }
    }
  }

  private formatDouyinWorkCreateTime (value: unknown) {
    const timestampSeconds = Number(value)
    if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0) {
      return format(new Date(0), 'yyyy-MM-dd HH:mm')
    }

    return format(new Date(timestampSeconds * 1000), 'yyyy-MM-dd HH:mm')
  }

  private buildNormalizedArticleContent (
    aweme: Record<string, any>,
    parsedPost?: { title?: unknown, summary?: unknown }
  ) {
    return normalizeDouyinArticleContent(aweme, {
      title: typeof parsedPost?.title === 'string' ? parsedPost.title : '',
      summary: typeof parsedPost?.summary === 'string' ? parsedPost.summary : ''
    })
  }

  private async replyDouyinArticlePrimary (
    aweme: Record<string, any>,
    parsedPost?: { title?: unknown, author?: { name?: unknown }, summary?: unknown }
  ): Promise<DouyinNormalizedArticleContent> {
    const article = this.buildNormalizedArticleContent(aweme, parsedPost)
    const statsText = formatVideoStats(
      Number(aweme.statistics?.digg_count ?? 0),
      Number(aweme.statistics?.share_count ?? 0),
      Number(aweme.statistics?.collect_count ?? 0),
      Number(aweme.statistics?.comment_count ?? 0),
      Number(aweme.statistics?.recommend_count ?? 0)
    )

    if (Config.douyin.videoInfoMode === 'text') {
      const displayContent = Array.from(new Set([...(Config.douyin.displayContent ?? []), 'desc']))
      const coverUrl = displayContent.includes('cover') && article.coverUrl
        ? await processImageUrl(article.coverUrl, article.title)
        : undefined
      const replyContent = buildParsedPostTextModeReply(parsedPost as any, displayContent, {
        coverUrl,
        statsText,
        descText: article.markdownOrText,
        descLabel: '正文'
      })

      if (replyContent.length > 0) {
        await this.e.reply(replyContent)
      }

      return article
    }

    const author = aweme.author ?? {}
    const articleCard = await Render(this.e, 'douyin/article-work', {
      title: article.title,
      markdown: article.markdownOrText,
      images: article.images,
      read_time: article.readTime,
      dianzan: Count(Number(aweme.statistics?.digg_count ?? 0)),
      pinglun: Count(Number(aweme.statistics?.comment_count ?? 0)),
      shouchang: Count(Number(aweme.statistics?.collect_count ?? 0)),
      share: Count(Number(aweme.statistics?.share_count ?? 0)),
      create_time: this.formatDouyinWorkCreateTime(aweme.create_time),
      avater_url: author.avatar_thumb?.url_list?.[0] ?? '',
      username: author.nickname ?? '',
      抖音号: author.unique_id === '' ? (author.short_id ?? '') : (author.unique_id ?? author.short_id ?? ''),
      获赞: Count(Number(author.total_favorited ?? 0)),
      关注: Count(Number(author.following_count ?? 0)),
      粉丝: Count(Number(author.follower_count ?? 0)),
      share_url: aweme.share_url ?? '',
      useDarkTheme: false
    })
    await replyRenderedImages(this.e, articleCard)
    return article
  }

  private getDiagnosticReplyOptions () {
    return (this.e as any)?.__kkkDiagnosticOptions as {
      parseTip?: boolean
      sendContent?: string[]
    } | undefined
  }

  private shouldSendParseTip () {
    const diagnosticParseTip = this.getDiagnosticReplyOptions()?.parseTip
    return typeof diagnosticParseTip === 'boolean' ? diagnosticParseTip : Config.app.parseTip
  }

  private getSendContentForCurrentRun () {
    const diagnosticSendContent = this.getDiagnosticReplyOptions()?.sendContent
    if (Array.isArray(diagnosticSendContent)) {
      return diagnosticSendContent
    }
    return Config.douyin.sendContent
  }

  async DouyinHandler (data: DouyinIdData) {
    const sendContent = this.getSendContentForCurrentRun()
    this.shouldSendParseTip() && this.e.reply('检测到抖音链接，开始解析')
    recordFailureTraceStep('douyin.handler.start', {
      type: this.type,
      awemeId: data.aweme_id,
      roomId: data.room_id,
      forceBurnDanmaku: this.forceBurnDanmaku
    })
    switch (this.type) {
      case 'one_work': {
        recordFailureTraceStep('douyin.work.fetch.start', {
          awemeId: data.aweme_id
        })
        const oneWorkResult = await fetchDouyinOneWork(data)
        const VideoData: DouyinWorkResult = oneWorkResult.workData
        recordFailureTraceStep('douyin.work.fetch.success', {
          awemeId: data.aweme_id,
          awemeType: VideoData.data.aweme_detail?.aweme_type,
          isSlides: VideoData.data.aweme_detail?.is_slides,
          source: oneWorkResult.source,
          subtype: oneWorkResult.htmlWork.subtype
        })

        if (VideoData.data.aweme_detail === null) {
          recordFailureTraceStep('douyin.work.detail.empty', {
            awemeId: data.aweme_id
          })
          throw new Error('获取作品详情失败，可能是因为该作品已被删除或设置为私密。')
        }
        recordFailureTraceStep('douyin.work.parsed-post.start', {
          awemeId: VideoData.data.aweme_detail.aweme_id
        })
        const parsedPost = await resolveDouyinParsedPostFromWorkData(
          VideoData.data.aweme_detail.share_url || `https://www.douyin.com/video/${VideoData.data.aweme_detail.aweme_id}`,
          VideoData,
          data
        )
        recordFailureTraceStep('douyin.work.parsed-post.success', {
          awemeId: VideoData.data.aweme_detail.aweme_id,
          title: parsedPost.title,
          subtype: parsedPost.subtype
        })
        // 根据 API 返回的数据判断作品类型，而不是依赖 URL
        // aweme_type: 0=视频, 68=图集, 163=文章
        const aweme_type = VideoData.data.aweme_detail.aweme_type
        const isArticle = aweme_type === 163
        const isVideo = aweme_type === 0 || aweme_type === 55
        const plainTitleType = isArticle ? 'article' : isVideo ? 'video' : 'image'
        await replyPlainVideoTitle(
          this.e,
          this.plainVideoTitle,
          parsedPost.title,
          parsedPost.author?.name,
          plainTitleType
        )

        const CommentsData = sendContent.includes('comment')
          ? await this.amagi.douyin.fetcher.fetchWorkComments({
            aweme_id: data.aweme_id,
            number: Config.douyin.numcomment,
            typeMode: 'strict'
          })
          : null
        this.is_slides = VideoData.data.aweme_detail.is_slides === true
        let g_video_url = ''
        let g_video_backup_urls: string[] = []
        let g_title
        let mp4size = ''
        let imagenum = 0
        if (isArticle) {
          const article = await this.replyDouyinArticlePrimary(
            VideoData.data.aweme_detail as Record<string, any>,
            parsedPost
          )
          imagenum = article.images.length
        } else if (!isVideo) {
          const graphicPlan = buildDouyinGraphicReplyPlan(VideoData.data.aweme_detail as Record<string, any>, parsedPost)
          g_title = this.sanitizeGraphicTitle(
            graphicPlan.title,
            VideoData.data.aweme_detail.aweme_id ? `douyin_${VideoData.data.aweme_detail.aweme_id}` : 'douyin_graphic'
          )
          imagenum = graphicPlan.baseImages.length
          await this.sendGraphicBaseImages(graphicPlan, g_title)
          await this.sendGraphicBgm(
            data.aweme_id,
            g_title,
            graphicPlan.bgmUrl || resolveDouyinMusicUrl(VideoData.data.aweme_detail.music),
            graphicPlan.bgmBackupUrls
          )
          await this.sendGraphicDerivedArtifacts(
            data.aweme_id,
            g_title,
            graphicPlan.liveItems,
            graphicPlan.bgmUrl,
            graphicPlan.bgmBackupUrls
          )
        }

        /** 视频 */
        let FPS: number | undefined
        const sendvideofile = true
        type VideoType = DyVideoWork['aweme_detail']['video']
        let video: VideoType | null = null
        if (isVideo) {
          // 视频地址特殊判断：play_addr_h264、play_addr、
          video = VideoData.data.aweme_detail.video as VideoType
          FPS = video.bit_rate[0]?.FPS // FPS

          logger.debug(`开始排除不符合条件的视频分辨率；\n
              共拥有${logger.yellow(video.bit_rate.length)}个视频源\n
              视频ID：${logger.green(VideoData.data.aweme_detail.aweme_id)}\n
              分享链接：${logger.green(VideoData.data.aweme_detail.share_url)}
              `)
          video.bit_rate = douyinProcessVideos(
            video.bit_rate,
            Config.douyin.videoQuality,
            Config.douyin.maxAutoVideoSize
          )
          const downloadCandidates = await this.resolveDownloadCandidates(
            video,
            `作品 ${data.aweme_id} 主视频`
          )
          g_video_url = downloadCandidates.videoUrl
          g_video_backup_urls = downloadCandidates.backupUrls
          const title = VideoData.data.aweme_detail.preview_title.substring(0, 80).replace(/[\\/:*?"<>|\r\n]/g, ' ') // video title
          g_title = title
          mp4size = (video.bit_rate[0].play_addr.data_size / (1024 * 1024)).toFixed(2)
        }

        const awemeDetail = VideoData.data.aweme_detail as Record<string, any>
        const longTitleText = resolveDouyinWorkDisplayText(awemeDetail, parsedPost.title)
        const shouldSendLongTitleFullText = Config.douyin.longTitleFullText &&
          shouldUseDouyinLongTextCard(
            awemeDetail,
            longTitleText,
            Config.douyin.longTitleFullTextThreshold
          )

        if (shouldSendLongTitleFullText) {
          if (Config.douyin.videoInfoMode === 'text') {
            await this.e.reply(longTitleText)
          } else {
            const longTextCard = await Render(this.e, 'douyin/long-text-work', buildDouyinLongTextWorkData(
              awemeDetail,
              {
                title: longTitleText,
                createTime: this.formatDouyinWorkCreateTime(awemeDetail.create_time),
                shareUrl: awemeDetail.share_url
              }
            ))
            await replyRenderedImages(this.e, longTextCard)
          }
        } else if (sendContent.includes('info') && !isArticle) {
          if (Config.douyin.videoInfoMode === 'text') {
            const coverImageUrl = isArticle
              ? VideoData.data.aweme_detail.video.origin_cover.url_list[0]
              : isVideo
                ? VideoData.data.aweme_detail.video.animated_cover?.url_list[0] ?? VideoData.data.aweme_detail.video.cover.url_list[0]
                : VideoData.data.aweme_detail.images![0].url_list[0]
            const coverUrl = Config.douyin.displayContent.includes('cover')
              ? await processImageUrl(coverImageUrl, VideoData.data.aweme_detail.desc)
              : undefined
            const { digg_count, share_count, collect_count, comment_count, recommend_count } = VideoData.data.aweme_detail.statistics
            const replyContent = buildParsedPostTextModeReply(parsedPost, Config.douyin.displayContent, {
              coverUrl,
              statsText: formatVideoStats(digg_count, share_count, collect_count, comment_count, recommend_count)
            })

            if (replyContent.length > 0) {
              await this.e.reply(replyContent)
            }
          } else {
            const userProfile = await this.amagi.douyin.fetcher.fetchUserProfile({
              sec_uid: VideoData.data.aweme_detail.author.sec_uid,
              typeMode: 'strict'
            })

            // 渲染为图片
            const videoInfoImg = await Render(this.e, 'douyin/videoInfo',
              {
                desc: isArticle ? VideoData.data.aweme_detail.preview_title : VideoData.data.aweme_detail.desc,
                statistics: VideoData.data.aweme_detail.statistics,
                aweme_id: VideoData.data.aweme_detail.aweme_id,
                author: {
                  name: VideoData.data.aweme_detail.author.nickname,
                  avatar: VideoData.data.aweme_detail.author.avatar_thumb.url_list[0],
                  short_id: VideoData.data.aweme_detail.author.unique_id === '' ? VideoData.data.aweme_detail.author.short_id : VideoData.data.aweme_detail.author.unique_id
                },
                user_profile: userProfile.success ? {
                  ip_location: userProfile.data.user.ip_location,
                  follower_count: userProfile.data.user.follower_count,
                  total_favorited: userProfile.data.user.total_favorited,
                  aweme_count: userProfile.data.user.aweme_count,
                  gender: userProfile.data.user.gender ?? 0,
                  user_age: userProfile.data.user.user_age ?? 0
                } : undefined,
                image_url: isArticle
                  ? VideoData.data.aweme_detail.video.origin_cover.url_list[0]
                  : isVideo
                    ? VideoData.data.aweme_detail.video.animated_cover?.url_list[0] ?? VideoData.data.aweme_detail.video.dynamic_cover?.url_list[0] ?? VideoData.data.aweme_detail.video.cover_original_scale?.url_list[0] ?? VideoData.data.aweme_detail.video.cover.url_list[0]
                    : VideoData.data.aweme_detail.images![0].url_list![0],
                cover_size: isArticle
                  ? (VideoData.data.aweme_detail.video.origin_cover ? {
                    width: VideoData.data.aweme_detail.video.origin_cover.width,
                    height: VideoData.data.aweme_detail.video.origin_cover.height
                  } : undefined)
                  : isVideo
                    ? (VideoData.data.aweme_detail.video.cover ? {
                      width: VideoData.data.aweme_detail.video.cover_original_scale.width,
                      height: VideoData.data.aweme_detail.video.cover_original_scale.height
                    } : undefined)
                    : (VideoData.data.aweme_detail.images?.[0] ? {
                      width: VideoData.data.aweme_detail.images[0].width,
                      height: VideoData.data.aweme_detail.images[0].height
                    } : undefined),
                create_time: VideoData.data.aweme_detail.create_time,
                music: VideoData.data.aweme_detail.music ? {
                  author: VideoData.data.aweme_detail.music.author,
                  title: VideoData.data.aweme_detail.music.title,
                  cover: VideoData.data.aweme_detail.music.cover_hd?.url_list[0] ?? VideoData.data.aweme_detail.music.cover_large?.url_list[0]
                } : undefined,
                video: isVideo ? {
                  duration: VideoData.data.aweme_detail.video.duration,
                  width: VideoData.data.aweme_detail.video.width,
                  height: VideoData.data.aweme_detail.video.height,
                  ratio: VideoData.data.aweme_detail.video.ratio
                } : undefined
              }
            )
            await replyRenderedImages(this.e, videoInfoImg)
          }
        }

        const sendCommentContent = async () => {
          if (!sendContent.includes('comment')) return
          if (!CommentsData) {
            throw new Error('评论配置已启用，但未获取到评论数据。')
          }
          const EmojiData = await this.amagi.douyin.fetcher.fetchEmojiList({ typeMode: 'strict' })
          const list = Emoji(EmojiData.data)
          const douyinCommentsRes = await douyinComments(CommentsData, list)
          if (!douyinCommentsRes.CommentsData.length) {
            await this.e.reply('这个作品没有评论 ~')
          } else {
            const suggest: string[] = []
            if (VideoData.data.aweme_detail?.suggest_words?.suggest_words) {
              for (const item of VideoData.data.aweme_detail.suggest_words.suggest_words) {
                if (item.words && item.scene === 'comment_top_rec') {
                  for (const v of item.words) {
                    v.word && suggest.push(v.word)
                  }
                }
              }
            }
            const aweme = VideoData.data.aweme_detail
            const img = await Render(this.e, 'douyin/comment',
              {
                Type: isArticle ? '文章' : isVideo ? '视频' : this.is_slides ? '合辑' : '图集',
                CommentsData: douyinCommentsRes.CommentsData,
                CommentLength: douyinCommentsRes.CommentsData.length ?? 0,
                share_url: isVideo
                  ? getDouyinShareableVideoUrl(aweme.video)
                  : aweme.share_url,
                VideoSize: mp4size,
                VideoFPS: FPS,
                ImageLength: imagenum,
                Region: aweme.region,
                suggestWrod: suggest,
                Resolution: isVideo && video ? `${video.bit_rate[0].play_addr.width} x ${video.bit_rate[0].play_addr.height}` : null,
                maxDepth: 6,
                Author: aweme.author.nickname,
                AuthorAvatar: aweme.author.avatar_thumb.url_list[0],
                Statistics: {
                  digg_count: aweme.statistics.digg_count,
                  comment_count: aweme.statistics.comment_count,
                  share_count: aweme.statistics.share_count,
                  collect_count: aweme.statistics.collect_count
                },
                CreateTime: aweme.create_time
              }
            )
            const messageElements = []
            if (Config.douyin.commentImageCollection && douyinCommentsRes.image_url.length > 0) {
              for (const [index, v] of douyinCommentsRes.image_url.entries()) {
                const imageUrl = await processImageUrl(v, VideoData.data.aweme_detail.desc, index)
                messageElements.push(segment.image(imageUrl))
              }
              const res = common.makeForward(
                messageElements,
                Config.app.fakeForward ? this.e.sender.userId : this.e.bot.account.selfId,
                Config.app.fakeForward ? this.e.sender.nick : this.e.bot.account.name
              )
              await sendForwardAndRecordLongTaskCompletionAnchor(this.e, res, {
                source: '评论图片收集',
                summary: `查看${messageElements.length}张图片`,
                prompt: '抖音评论解析结果',
                news: [{ text: '点击查看解析结果' }]
              })
            }
            await replyRenderedImages(this.e, img)
          }
        }

        /** 发送视频 */
        if (sendvideofile && isVideo && !isArticle && sendContent.includes('video')) {
          // 获取弹幕数据（如果开启弹幕烧录）
          let danmakuList: DouyinDanmakuElem[] = []
          if ((this.forceBurnDanmaku || Config.douyin.burnDanmaku) && video) {
            try {
              const duration = video.duration // 视频时长（毫秒）
              logger.debug(`[抖音] 视频时长: ${duration}ms, 开始获取弹幕数据`)
              const danmakuData = await this.amagi.douyin.fetcher.fetchDanmakuList({
                aweme_id: data.aweme_id,
                duration,
                typeMode: 'strict'
              })
              if (danmakuData.data?.danmaku_list) {
                danmakuList = danmakuData.data.danmaku_list
                logger.debug(`[抖音] 获取到 ${danmakuList.length} 条弹幕`)
              }
            } catch (err) {
              logger.warn('[抖音] 获取弹幕失败，将不烧录弹幕', err)
            }
          }

          // 如果需要烧录弹幕，先下载视频再烧录
          if ((this.forceBurnDanmaku || Config.douyin.burnDanmaku) && danmakuList.length > 0) {
            const videoFile = await downloadFile(g_video_url, {
              title: `Douyin_V_tmp_${Date.now()}.mp4`,
              headers: { ...baseHeaders, Referer: 'https://www.douyin.com' },
              backupUrls: g_video_backup_urls,
              networkOptions: douyinCdnNetworkOptions,
              cacheIdentity: buildDouyinMediaCacheIdentity(buildDouyinWorkMediaBaseKey(data.aweme_id, 'video:0'))
            })
            if (videoFile.filepath) {
              const resultPath = Common.tempDri.video + `Douyin_Result_${Date.now()}.mp4`
              logger.mark(`[抖音] 开始烧录 ${danmakuList.length} 条弹幕...`)
              const success = await burnDouyinDanmaku(videoFile.filepath, danmakuList, resultPath, {
                danmakuArea: Config.douyin.danmakuArea,
                verticalMode: Config.douyin.verticalMode,
                videoCodec: Config.douyin.videoCodec,
                encodePreset: Config.upload.compressPreset,
                customEncodeArgs: Config.upload.compressCustomArgs,
                danmakuFontSize: Config.douyin.danmakuFontSize,
                danmakuOpacity: Config.douyin.danmakuOpacity
              })
              if (success) {
                const filePath = Common.tempDri.video + `${Config.app.removeCache ? 'tmp_' + Date.now() : g_title}.mp4`
                fs.renameSync(resultPath, filePath)
                await Common.removeFile(videoFile.filepath, true)
                const stats = fs.statSync(filePath)
                const fileSizeInMB = Number((stats.size / (1024 * 1024)).toFixed(2))
                if (fileSizeInMB > Config.upload.groupfilevalue) {
                  await uploadFile(this.e, { filepath: filePath, totalBytes: fileSizeInMB, originTitle: g_title || '' }, '', { useGroupFile: true })
                } else {
                  await uploadFile(this.e, { filepath: filePath, totalBytes: fileSizeInMB, originTitle: g_title || '' }, '')
                }
              } else {
                await Common.removeFile(videoFile.filepath, true)
              }
            }
          } else {
            // 不烧录弹幕，直接下载发送
            await downloadVideo(
              this.e,
              {
                video_url: g_video_url,
                backupUrls: g_video_backup_urls,
                knownFileSizeBytes: video?.bit_rate[0]?.play_addr.data_size,
                title: {
                  timestampTitle: `tmp_${Date.now()}.mp4`,
                  originTitle: `${g_title}.mp4`
                },
                headers: {
                  ...baseHeaders,
                  Referer: 'https://www.douyin.com'
                },
                networkOptions: douyinCdnNetworkOptions,
                cacheIdentity: buildDouyinMediaCacheIdentity(buildDouyinWorkMediaBaseKey(data.aweme_id, 'video:0'))
              },
              {
                message_id: this.e.messageId
              }
            )
          }
        }
        await sendCommentContent()
        return true
      }

      case 'user_dynamic': {
        const rawData = await this.amagi.douyin.fetcher.fetchUserVideoList({
          sec_uid: data.sec_uid,
          typeMode: 'strict'
        })
        const userProfileData = await this.amagi.douyin.fetcher.fetchUserProfile({
          sec_uid: data.sec_uid,
          typeMode: 'strict'
        })

        const user = userProfileData.data.user

        // 转换视频列表数据
        const videos: UserVideoListData['videos'] = rawData.data.aweme_list.map((aweme, index) => {
          const isVideo = aweme.aweme_type === 0 || aweme.media_type === 0

          return {
            aweme_id: aweme.aweme_id,
            is_top: aweme.is_top === 1,
            title: aweme.desc || aweme.item_title || '无标题',
            cover: aweme.video.cover.url_list[0],
            duration: aweme.video?.duration || 0,
            create_time: aweme.create_time,
            statistics: {
              like_count: aweme.statistics.digg_count,
              comment_count: aweme.statistics.comment_count,
              share_count: aweme.statistics.share_count,
              collect_count: aweme.statistics.collect_count
            },
            is_video: isVideo,
            index: index + 1,
            music: aweme.music
              ? {
                title: aweme.music.title || '',
                author: aweme.music.author || ''
              }
              : undefined
          }
        })

        const displayVideos = videos.slice(0, 16)
        const timeoutSeconds = 120

        // 渲染视频列表页面
        const img = await Render(this.e, 'douyin/user_profile', {
          user: {
            head_image: user.cover_and_head_image_info.profile_cover_list.length > 0 ? user.cover_and_head_image_info.profile_cover_list[0].cover_url?.url_list[0] || null : null,
            nickname: user.nickname,
            short_id: user.unique_id === '' ? user.short_id : user.unique_id,
            avatar: user.avatar_larger?.url_list?.[0] || user.avatar_thumb?.url_list?.[0] || '',
            signature: user.signature,
            follower_count: user.follower_count,
            following_count: user.following_count,
            total_favorited: user.total_favorited,
            verified: !!user.custom_verify || !!user.enterprise_verify_reason,
            ip_location: user.ip_location
          },
          videos: displayVideos,
          timeoutSeconds
        })

        await replyRenderedImages(this.e, img)

        logger.debug(`等待用户选择视频，开始计时，${timeoutSeconds}秒后终止等待...`)
        const context = await karin.ctx(this.e, { 
          throwOnTimeout: false, 
          time: timeoutSeconds
        })
        if (!context) {
          await this.e.reply(`${timeoutSeconds} 秒内没收到作品序号，已取消后续操作`)
          return true
        }
        if (context) {
          const num = parseInt(context.msg.trim())
          if (!isNaN(num) && num >= 1 && num <= displayVideos.length) {
            const emojiManager = new EmojiReactionManager(context)
            let processingTimer: NodeJS.Timeout | null = null
            let successTimer: NodeJS.Timeout | null = null

            await emojiManager.add('EYES')
            processingTimer = setTimeout(() => {
              emojiManager.add('PROCESSING').catch(() => { })
            }, 1500)

            try {
              const target = displayVideos[num - 1]
              const targetData: DouyinIdData = {
                type: 'one_work',
                aweme_id: target.aweme_id
              }
              const dy = new DouYin(context, targetData)
              await dy.DouyinHandler(targetData)

              successTimer = setTimeout(() => {
                emojiManager.replace('PROCESSING', 'SUCCESS').catch(() => { })
              }, 1500)
            } catch (error) {
              if (processingTimer) clearTimeout(processingTimer)
              if (successTimer) clearTimeout(successTimer)

              const processingEmojiId = getEmojiId(context, 'PROCESSING')
              if (emojiManager.has(processingEmojiId)) {
                await emojiManager.remove('PROCESSING')
              }
              await emojiManager.add('ERROR')
              throw error
            }
          }
        }
        return true
      }
      case 'music_work': {
        const MusicData = await this.amagi.douyin.fetcher.fetchMusicInfo({
          music_id: data.music_id,
          typeMode: 'strict'
        })
        const sec_uid = MusicData.data.music_info.sec_uid
        const UserData = await this.amagi.douyin.fetcher.fetchUserProfile({ sec_uid, typeMode: 'strict' })
        // if (UserData.data.status_code === 2) {
        //   const new_UserData.data = await getDouyinData('搜索数据', Config.cookies.douyin, { query: data.music_info.author })
        //   if (new_UserData.data.data[0].type === 4 && new_UserData.data.data[0].card_unique_name === 'user') {
        //     UserData.data = { user: new_UserData.data.data[0].user_list[0].user_info }
        //   }
        //   const search_data = new_UserData.data
        // }
        if (!MusicData.data.music_info.play_url) {
          await this.e.reply('解析错误！该音乐抖音未提供下载链接，无法下载', { reply: true })
          return true
        }
        const img = await Render(this.e, 'douyin/musicinfo',
          {
            image_url: MusicData.data.music_info.cover_hd.url_list[0],
            desc: MusicData.data.music_info.title,
            music_id: MusicData.data.music_info.id.toString(),
            create_time: Time(0),
            user_count: Count(MusicData.data.music_info.user_count),
            avater_url: MusicData.data.music_info.avatar_large?.url_list[0] || UserData.data.user.avatar_larger.url_list[0],
            fans: UserData.data.user.mplatform_followers_count || UserData.data.user.follower_count,
            following_count: UserData.data.user.following_count,
            total_favorited: UserData.data.user.total_favorited,
            user_shortid: UserData.data.user.unique_id === '' ? UserData.data.user.short_id : UserData.data.user.unique_id,
            share_url: MusicData.data.music_info.play_url.uri,
            username: MusicData.data.music_info?.original_musician_display_name || MusicData.data.music_info.owner_nickname === '' ? MusicData.data.music_info.author : MusicData.data.music_info.owner_nickname
          }
        )
        await this.e.reply(
          [
            ...img,
            `\n正在上传 ${MusicData.data.music_info.title}\n`,
            `作曲: ${MusicData.data.music_info.original_musician_display_name || MusicData.data.music_info.owner_nickname === '' ? MusicData.data.music_info.author : MusicData.data.music_info.owner_nickname}\n`,
            `music_id: ${MusicData.data.music_info.id}`
          ]
        )
        const musicFile = await downloadFile(MusicData.data.music_info.play_url.uri, {
          title: `Douyin_Music_${Date.now()}.mp3`,
          headers: this.headers
        })
        if (musicFile.filepath) {
          const musicBase64 = `base64://${fs.readFileSync(musicFile.filepath).toString('base64')}`
          await this.e.reply(segment.record(musicBase64, false))
          await Common.removeFile(musicFile.filepath, true)
        }
        return true
      }
      case 'live_room_detail': {
        const getFirstUrl = (value: any) => value?.url_list?.[0] || ''
        const getAvatarUrl = (user: any, owner: any) => {
          return getFirstUrl(user?.avatar_larger) ||
            getFirstUrl(user?.avatar_large) ||
            getFirstUrl(user?.avatar_thumb) ||
            getFirstUrl(owner?.avatar_larger) ||
            getFirstUrl(owner?.avatar_large) ||
            getFirstUrl(owner?.avatar_thumb)
        }

        const directRoomId = typeof data.room_id === 'string' ? data.room_id.trim() : ''
        const isWebcastReflow = data.source === 'webcast_reflow'
        let user: any
        let roomData: any
        let webRid = isWebcastReflow ? '' : directRoomId
        let roomId = directRoomId
        let notLiveName = '该用户'

        if (data.sec_uid && !directRoomId) {
          const UserInfoData = await this.amagi.douyin.fetcher.fetchUserProfile({
            sec_uid: data.sec_uid,
            typeMode: 'strict'
          })

          user = UserInfoData.data.user
          notLiveName = user?.nickname || '用户'
          if (user?.live_status !== 1) {
            await this.e.reply(`「${notLiveName}」\n未开播，正在休息中~`)
            return true
          }

          if (user.room_data) {
            try {
              roomData = JSON.parse(user.room_data)
            } catch (error) {
              logger.warn(`[Douyin] 直播间 room_data 解析失败: ${error instanceof Error ? error.message : String(error)}`)
            }
          } else {
            logger.error('未获取到直播间信息！')
          }

          webRid = String(roomData?.owner?.web_rid ?? user.room_id_str ?? '').trim()
          roomId = String(user.room_id_str ?? webRid).trim()
        }

        if (!roomId || (!webRid && !isWebcastReflow)) {
          await this.e.reply('未获取到直播间信息！')
          return true
        }

        const liveInfoHeaders = buildDouyinLiveInfoHeaders({
          userAgent: String((this.headers as Record<string, unknown>)?.['User-Agent'] ?? (baseHeaders as Record<string, unknown> | undefined)?.['User-Agent'] ?? ''),
          cookie: Config.cookies.douyin
        })
        let live_data: any
        if (isWebcastReflow) {
          live_data = await fetchDouyinLiveDataFromReflow({
            roomId,
            headers: liveInfoHeaders,
            onFreshFetchError: (error, resolvedWebRid) => {
              logger.warn(`[Douyin] reflow 直播间实时接口失败，使用 room_id 兜底数据: web_rid=${resolvedWebRid}, ${error instanceof Error ? error.message : String(error)}`)
            }
          })
        } else {
          try {
            live_data = await fetchDouyinLiveWebEnterInfo(roomId, webRid, liveInfoHeaders)
          } catch (error) {
            logger.warn(`[Douyin] 直播间实时接口失败，尝试 Amagi 接口: ${error instanceof Error ? error.message : String(error)}`)
            try {
              live_data = await this.amagi.douyin.fetcher.fetchLiveRoomInfo({
                room_id: roomId,
                web_rid: webRid,
                typeMode: 'strict'
              })
            } catch (amagiError) {
              logger.warn(`[Douyin] 直播间详情接口失败，尝试 room_id reflow 兜底: ${amagiError instanceof Error ? amagiError.message : String(amagiError)}`)
              live_data = await fetchDouyinLiveReflowInfo(roomId, liveInfoHeaders)
            }
          }
        }
        const liveContainer = getDouyinLiveContainer(live_data)
        const liveItem: any = getDouyinLiveItem(live_data)

        if (!liveItem) {
          await this.e.reply(`「${notLiveName}」\n未开播，正在休息中~`)
          return true
        }

        const owner = liveItem.owner ?? {}
        user = user ?? liveContainer?.user ?? owner
        notLiveName = user?.nickname || owner?.nickname || notLiveName
        webRid = webRid || String(owner?.web_rid ?? liveItem.web_rid ?? '').trim()
        roomId = roomId || String(liveItem.id_str ?? liveItem.id ?? '').trim()
        const displayRoomId = webRid || roomId

        if (!isDouyinLiveStatusActive(liveItem)) {
          await this.e.reply(`「${notLiveName}」\n未开播，正在休息中~`)
          return true
        }

        //@ts-ignore
        const streamExtra = liveItem.stream_url?.extra
        const resolution = streamExtra
          //@ts-ignore
          ? `${streamExtra.width}x${streamExtra.height}`
          //@ts-ignore
          : liveItem.stream_url?.default_resolution || ''
        const roomViewerDisplay = liveItem.room_view_stats?.display_value
        const onlineViewers = typeof roomViewerDisplay === 'string' && roomViewerDisplay.trim()
          ? roomViewerDisplay
          : Count(Number(roomViewerDisplay))

        if (sendContent.includes('info')) {
          const img = await Render(this.e, 'douyin/live', {
            image_url: liveItem.cover?.url_list[0],
            text: liveItem.title,
            partition_title: (liveContainer as any)?.partition_road_map?.partition?.title || '未知分区',
            room_id: displayRoomId,
            online_viewers: onlineViewers,
            total_viewers: liveItem.stats?.total_user_str || '刚开播无法获取',
            username: user?.nickname || owner?.nickname || '未知用户',
            avater_url: getAvatarUrl(user, owner),
            fans: Count(Number(user?.follower_count ?? user?.follow_info?.follower_count ?? owner?.follow_info?.follower_count ?? 0)),
            share_url: 'https://live.douyin.com/' + displayRoomId,
            dynamicTYPE: '直播间信息',
            //@ts-ignore
            like_count: Count(Number(liveItem.like_count || 0)),
            //@ts-ignore
            user_count_str: liveItem.user_count_str || '',
            resolution,
            //@ts-ignore
            signature: user?.signature || owner?.signature || '',
            //@ts-ignore
            city: user?.city || owner?.city || '',
            //@ts-ignore
            aweme_count: Count(Number(user?.aweme_count || owner?.aweme_count || 0)),
            //@ts-ignore
            following_count: Count(Number(user?.following_count || owner?.following_count || 0)),
            //@ts-ignore
            total_favorited: Count(Number(user?.total_favorited || owner?.total_favorited || 0)),
            //@ts-ignore
            has_commerce_goods: liveItem.has_commerce_goods || false
          })
          await replyRenderedImages(this.e, img)
        }
        if (sendContent.includes('video')) {
          const durationSeconds = normalizeDouyinLiveRecordSeconds(Config.douyin.liveRecordSeconds)
          const liveQuality = normalizeDouyinLiveQuality(Config.douyin.liveQuality)
          const recordHeaders = buildDouyinLiveRecordHeaders({
            userAgent: String((this.headers as Record<string, unknown>)?.['User-Agent'] ?? (baseHeaders as Record<string, unknown> | undefined)?.['User-Agent'] ?? ''),
            cookie: Config.cookies.douyin
          })

          try {
            const stream = selectDouyinLiveStream(liveItem, liveQuality) ?? selectDouyinLiveStream(live_data, liveQuality)
            if (!stream) {
              await this.e.reply('未获取到可用的抖音直播流，已跳过直播片段录制。')
              return true
            }

            await replyPlainVideoTitle(this.e, this.plainVideoTitle, liveItem.title, user?.nickname || owner?.nickname, 'live')
            const safeTitle = String(liveItem.title ?? '').substring(0, 50).replace(/[\\/:*?"<>|\r\n\s]/g, ' ')
            const outputPath = Common.tempDri.video + `Douyin_Live_${displayRoomId}_${Date.now()}.mp4`
            await this.e.reply(`开始录制抖音直播片段，时长 ${durationSeconds} 秒，清晰度 ${stream.quality}。`)
            const success = await recordDouyinLiveStream({
              streamUrl: stream.url,
              outputPath,
              durationSeconds,
              headers: recordHeaders
            })

            if (!success) {
              await this.e.reply('抖音直播片段录制失败，请稍后再试。')
              return true
            }

            const stats = fs.statSync(outputPath)
            const fileSizeInMB = Number((stats.size / (1024 * 1024)).toFixed(2))
            await uploadFile(this.e, {
              filepath: outputPath,
              totalBytes: fileSizeInMB,
              originTitle: `抖音直播_${safeTitle || displayRoomId}`
            }, '')
          } catch (error) {
            logger.warn(`[Douyin] 直播片段录制失败: ${error instanceof Error ? error.message : String(error)}`)
            await this.e.reply('抖音直播片段录制失败，请稍后再试。')
          }
        }
        return true
      }
      default:
        break
    }
  }
}

export const douyinProcessVideos = (videos: dyVideo[], videoQuality: string, maxAutoVideoSize?: number): dyVideo[] => {
  // 首先过滤掉所有 format 为 'dash' 的视频
  const mp4Videos = videos.filter(video => video.format !== 'dash')

  if (mp4Videos.length === 0) {
    logger.warn('没有找到可用的 mp4 格式视频')
    return videos.slice(0, 1) // 返回第一个视频作为备选
  }

  logger.debug(`过滤后剩余 ${mp4Videos.length} 个 mp4 格式视频`)

  // 定义画质等级映射，根据 gear_name 判断画质
  const getQualityLevel = (gearName: string): string => {
    // 4K 画质
    if (gearName.includes('lowest_4') || gearName.includes('2160')) return '4k'
    // 2K/1440p 画质  
    if (gearName.includes('1440') || gearName.includes('2k')) return '2k'
    // 1080p 画质
    if (gearName.includes('1080')) return '1080p'
    // 720p 画质
    if (gearName.includes('720')) return '720p'
    // 540p 画质
    if (gearName.includes('540')) return '540p'
    // 默认返回 540p
    return '540p'
  }

  // 按画质分组，并在每组内按文件大小排序（大的在前）
  const videosByQuality = new Map<string, dyVideo[]>()

  mp4Videos.forEach(video => {
    const quality = getQualityLevel(video.gear_name)
    if (!videosByQuality.has(quality)) {
      videosByQuality.set(quality, [])
    }
    videosByQuality.get(quality)!.push(video)
  })

  // 对每个画质组内的视频按文件大小排序（大的在前）
  videosByQuality.forEach((videos) => {
    videos.sort((a, b) => b.play_addr.data_size - a.play_addr.data_size)
  })

  // 如果是自动模式
  if (videoQuality === 'adapt') {
    const sizeLimitBytes = (maxAutoVideoSize || Config.upload.filelimit) * 1024 * 1024

    // 按画质优先级排序：4k > 2k > 1080p > 720p > 540p
    const qualityPriority = ['4k', '2k', '1080p', '720p', '540p']

    for (const quality of qualityPriority) {
      const qualityVideos = videosByQuality.get(quality)
      if (qualityVideos && qualityVideos.length > 0) {
        // 选择该画质下文件大小最大但不超过限制的视频
        const suitableVideo = qualityVideos.find(video => video.play_addr.data_size <= sizeLimitBytes)
        if (suitableVideo) {
          logger.debug(`自动选择画质: ${quality}, 文件大小: ${(suitableVideo.play_addr.data_size / (1024 * 1024)).toFixed(2)}MB`)
          return [suitableVideo]
        }
      }
    }

    // 如果没有找到符合大小限制的视频，选择最小的视频
    let smallestVideo = mp4Videos[0]
    mp4Videos.forEach(video => {
      if (video.play_addr.data_size < smallestVideo.play_addr.data_size) {
        smallestVideo = video
      }
    })
    logger.debug(`未找到符合大小限制的视频，选择最小视频: ${(smallestVideo.play_addr.data_size / (1024 * 1024)).toFixed(2)}MB`)
    return [smallestVideo]
  }

  // 固定画质模式
  const targetQuality = videoQuality
  const targetVideos = videosByQuality.get(targetQuality)

  if (targetVideos && targetVideos.length > 0) {
    // 选择该画质下文件大小最大的视频
    logger.debug(`选择固定画质: ${targetQuality}, 文件大小: ${(targetVideos[0].play_addr.data_size / (1024 * 1024)).toFixed(2)}MB`)
    return [targetVideos[0]]
  }

  // 如果没有找到目标画质，选择最接近的画质
  const qualityPriority = ['4k', '2k', '1080p', '720p', '540p']
  const targetIndex = qualityPriority.indexOf(targetQuality)

  // 先尝试向下找（更低画质）
  for (let i = targetIndex + 1; i < qualityPriority.length; i++) {
    const fallbackVideos = videosByQuality.get(qualityPriority[i])
    if (fallbackVideos && fallbackVideos.length > 0) {
      logger.debug(`目标画质 ${targetQuality} 不可用，降级到: ${qualityPriority[i]}`)
      return [fallbackVideos[0]]
    }
  }

  // 再尝试向上找（更高画质）
  for (let i = targetIndex - 1; i >= 0; i--) {
    const fallbackVideos = videosByQuality.get(qualityPriority[i])
    if (fallbackVideos && fallbackVideos.length > 0) {
      logger.debug(`目标画质 ${targetQuality} 不可用，升级到: ${qualityPriority[i]}`)
      return [fallbackVideos[0]]
    }
  }

  // 如果都没找到，返回第一个可用视频
  logger.warn('未找到任何匹配的画质，返回默认视频')
  return [mp4Videos[0]]
}

/**
 * 传递整数，返回x小时后的时间
 * @param {number} delay
 * @returns
 */
export const Time = (delay: number): string => {
  const currentDate = new Date()
  currentDate.setHours(currentDate.getHours() + delay)

  const year = currentDate.getFullYear().toString()
  const month = (currentDate.getMonth() + 1).toString()
  const day = String(currentDate.getDate()).padStart(2, '0')
  const hours = String(currentDate.getHours()).padStart(2, '0')
  const minutes = String(currentDate.getMinutes()).padStart(2, '0')
  const seconds = String(currentDate.getSeconds()).padStart(2, '0')

  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`
}

export const Emoji = (data: DyEmojiList) => {
  const ListArray = []

  for (const i of data.emoji_list) {
    const display_name = i.display_name
    const url = i.emoji_url.url_list[0]

    const Objject = {
      name: display_name,
      url
    }
    ListArray.push(Objject)
  }
  return ListArray
}

/**
 * 格式化视频统计信息为三行，每行两个数据项，并保持对齐
 */
const formatVideoStats = (digg_count: number, share_count: number, collect_count: number, comment_count: number, recommend_count: number): string => {
  // 计算每个数据项的文本
  const diggText = `❤ 点赞: ${Count(digg_count)}`
  const shareText = `🔄 转发: ${Count(share_count)}`
  const collectText = `⭐ 收藏: ${Count(collect_count)}`
  const commentText = `💬 评论: ${Count(comment_count)}`
  const recommendText = `👍 推荐: ${Count(recommend_count)}`

  // 找出第一列中最长的项的长度
  const firstColItems = [diggText, shareText]
  const maxFirstColLength = Math.max(...firstColItems.map(item => getStringDisplayWidth(item)))

  // 构建三行文本，确保第二列对齐
  const line1 = alignTwoColumns(diggText, shareText, maxFirstColLength)
  const line2 = alignTwoColumns(collectText, commentText, maxFirstColLength)
  const line3 = alignTwoColumns(recommendText, '', maxFirstColLength)

  return `${line1}\n${line2}\n${line3}`
}

/**
 * 对齐两列文本
 */
const alignTwoColumns = (col1: string, col2: string, targetLength: number): string => {
  // 计算需要添加的空格数量
  const col1Width = getStringDisplayWidth(col1)
  const spacesNeeded = targetLength - col1Width + 5 // 5是两列之间的固定间距

  // 添加空格使两列对齐
  return col1 + ' '.repeat(spacesNeeded) + col2
}

/**
 * 获取字符串在显示时的实际宽度
 * 考虑到不同字符的显示宽度不同（如中文、emoji等）
 */
const getStringDisplayWidth = (str: string): number => {
  let width = 0
  for (let i = 0; i < str.length; i++) {
    const code = str.codePointAt(i)
    if (!code) continue

    // 处理emoji和特殊Unicode字符
    if (code > 0xFFFF) {
      width += 2 // emoji通常占用2个字符宽度
      i++ // 跳过代理对的后半部分
    } else if ( // 处理中文字符和其他全角字符
      (code >= 0x3000 && code <= 0x9FFF) || // 中文字符范围
      (code >= 0xFF00 && code <= 0xFFEF) || // 全角ASCII、全角标点
      code === 0x2026 || // 省略号
      code === 0x2014 || // 破折号
      (code >= 0x2E80 && code <= 0x2EFF) || // CJK部首补充
      (code >= 0x3000 && code <= 0x303F) || // CJK符号和标点
      (code >= 0x31C0 && code <= 0x31EF) || // CJK笔画
      (code >= 0x3200 && code <= 0x32FF) || // 封闭式CJK字母和月份
      (code >= 0x3300 && code <= 0x33FF) || // CJK兼容
      (code >= 0xAC00 && code <= 0xD7AF) || // 朝鲜文音节
      (code >= 0xF900 && code <= 0xFAFF) || // CJK兼容表意文字
      (code >= 0xFE30 && code <= 0xFE4F) // CJK兼容形式
    ) {
      width += 2
    } else if (code === 0x200D || (code >= 0xFE00 && code <= 0xFE0F) || (code >= 0x1F3FB && code <= 0x1F3FF)) { // emoji修饰符和连接符
      width += 0 // 这些字符不增加宽度，它们是修饰符
    } else { // 普通ASCII字符
      width += 1
    }
  }
  return width
}
