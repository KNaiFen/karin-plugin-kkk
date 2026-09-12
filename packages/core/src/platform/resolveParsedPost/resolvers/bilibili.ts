import { logger } from 'node-karin'
import { DynamicType } from '@ikenxuan/amagi'

import { baseHeaders } from '@/module'
import { Config } from '@/module/utils/Config'
import { amagiClient } from '@/module/utils/amagiClient'
import { getBilibiliID } from '@/platform/bilibili'
import { collectBilibiliCdnBackupUrls } from '@/platform/bilibili/cdnSelector'
import {
  resolveBilibiliVideoCid
} from '@/module/summaryParse/bilibiliVideoIdentity'
import type { ParsedPost, ParsedPostVideo } from '@/platform/parsedPost'
import {
  fetchBilibiliDynamicBundle,
  fetchBilibiliOneVideoBundle
} from '@/platform/bilibili/bundle'

import { buildAuthor, buildParsedPost, buildVideo, createHeaders, imageBlocks, textBlock, toMeta, toStats } from '../shared'

export const resolveBilibiliParsedPost = async (url: string): Promise<ParsedPost> => {
  const idData = await getBilibiliID(url)

  if (idData.type === 'one_video') {
    const bundle = await fetchBilibiliOneVideoBundle({
      bvid: idData.bvid,
      p: idData.p,
      cid: idData.cid
    }, {
      infoData: true,
      playUrlData: true,
      subtitles: true
    })
    const infoData = bundle.infoData!
    const video = infoData.data.data
    const cid = resolveBilibiliVideoCid({
      idData,
      detail: infoData,
      selectedCid: bundle.selectedCid
    })
    const page = bundle.selectedPage ?? 1
    const selectedPage = Array.isArray(video.pages) ? video.pages[Math.max(0, page - 1)] : null
    const durationSeconds = Number(selectedPage?.duration ?? video.duration ?? 0) || undefined
    const subtitles = bundle.subtitles ?? []
    const playUrlData = bundle.playUrlData!
    const dashVideo = playUrlData.data.data.dash?.video?.[0]
    const dashAudio = playUrlData.data.data.dash?.audio?.[0]
    const durlVideo = playUrlData.data.data.durl?.[0]
    const primaryVideo = buildVideo(dashVideo?.base_url ?? durlVideo?.url, {
      title: video.title,
      durationSeconds,
      backupUrls: durlVideo ? [durlVideo.backup_url].flat().filter(Boolean) : [],
      audioUrl: dashAudio?.base_url,
      audioBackupUrls: dashAudio ? collectBilibiliCdnBackupUrls(dashAudio) : [],
      asrSourceType: dashAudio?.base_url ? 'audio' : undefined,
      asrSourceUrl: dashAudio?.base_url,
      asrSourceBackupUrls: dashAudio ? collectBilibiliCdnBackupUrls(dashAudio) : [],
      subtitles,
      headers: createHeaders({
        ...baseHeaders,
        Cookie: Config.cookies.bilibili,
        Referer: 'https://www.bilibili.com'
      })
    })

    return buildParsedPost({
      platform: 'bilibili',
      platformLabel: 'B站',
      subtype: 'video',
      title: video.title,
      author: video.owner?.name ? buildAuthor(video.owner.name) : undefined,
      summary: video.desc,
      url: page > 1
        ? `https://www.bilibili.com/video/${video.bvid}?p=${page}`
        : `https://www.bilibili.com/video/${video.bvid}`,
      contentBlocks: textBlock(video.desc),
      images: [],
      videos: primaryVideo ? [primaryVideo] : [],
      primaryVideo: primaryVideo ?? undefined,
      stats: toStats([
        ['播放', video.stat?.view],
        ['点赞', video.stat?.like],
        ['弹幕', video.stat?.danmaku],
        ['评论', video.stat?.reply]
      ]),
      meta: toMeta([
        ['分区', video.tname],
        ['时长', String(video.duration)]
      ]),
      raw: {
        accentColor: '#00a1d6',
        detail: infoData,
        idData,
        selectedCid: cid,
        selectedPage: page
      }
    })
  }

  if (idData.type === 'dynamic_info') {
    const bundle = await fetchBilibiliDynamicBundle({
      dynamic_id: idData.dynamic_id
    }, {
      dynamicDetail: true,
      avVideoInfo: true,
      avPlayUrlData: true,
      avSubtitles: true
    })
    const detail = bundle.dynamicDetail!
    const item = detail.data.item
    const moduleAuthor = item.modules.module_author
    const moduleDynamic = item.modules.module_dynamic
    const moduleStat = item.modules.module_stat
    const dynamicType = item.type
    const title = dynamicType === DynamicType.AV
      ? moduleDynamic.major?.archive?.title || '视频动态'
      : dynamicType === DynamicType.ARTICLE
        ? moduleDynamic.major?.opus?.title || '专栏动态'
        : dynamicType === DynamicType.LIVE_RCMD
          ? '直播动态'
          : 'B站动态'
    const description = moduleDynamic.major?.opus?.summary?.text
      || moduleDynamic.major?.archive?.desc
      || moduleDynamic.desc?.text
      || ''
    const images = [
      ...(moduleDynamic.major?.opus?.pics?.map((pic: { url?: string }) => pic.url).filter(Boolean) ?? []),
      ...(moduleDynamic.major?.draw?.items?.map((pic: { src?: string; url?: string }) => pic.src || pic.url).filter(Boolean) ?? [])
    ].map((image: string) => ({ url: image }))

    let avVideos: ParsedPostVideo[] = []
    if (dynamicType === DynamicType.AV && moduleDynamic.major?.archive?.bvid) {
      try {
        const videoInfo = bundle.avVideoInfo!
        const stream = bundle.avPlayUrlData!
        const dashVideo = stream.data.data.dash?.video?.[0]
        const dashAudio = stream.data.data.dash?.audio?.[0]
        const durlVideo = stream.data.data.durl?.[0]
        const primaryVideo = buildVideo(dashVideo?.base_url ?? durlVideo?.url, {
          title,
          durationSeconds: videoInfo.data.data.duration,
          backupUrls: durlVideo ? [durlVideo.backup_url].flat().filter(Boolean) : [],
          audioUrl: dashAudio?.base_url,
          audioBackupUrls: dashAudio ? collectBilibiliCdnBackupUrls(dashAudio) : [],
          asrSourceType: dashAudio?.base_url ? 'audio' : undefined,
          asrSourceUrl: dashAudio?.base_url,
          asrSourceBackupUrls: dashAudio ? collectBilibiliCdnBackupUrls(dashAudio) : [],
          subtitles: bundle.avSubtitles ?? [],
          headers: createHeaders({
            ...baseHeaders,
            Cookie: Config.cookies.bilibili,
            Referer: 'https://www.bilibili.com'
          })
        })
        avVideos = primaryVideo ? [primaryVideo] : []
      } catch (error) {
        logger.warn(`[ParsedPost] B站动态视频流获取失败，已降级为仅文本总结：${error instanceof Error ? error.message : String(error)}`)
      }
    }

    return buildParsedPost({
      platform: 'bilibili',
      platformLabel: 'B站',
      subtype: dynamicType === DynamicType.AV
        ? 'video'
        : dynamicType === DynamicType.ARTICLE
          ? 'article'
          : dynamicType === DynamicType.LIVE_RCMD
            ? 'live'
            : 'dynamic',
      title,
      author: moduleAuthor.name ? buildAuthor(moduleAuthor.name, { avatar: moduleAuthor.face || undefined }) : undefined,
      summary: description || '该动态暂无可提取纯文本内容',
      url: dynamicType === DynamicType.AV
        ? moduleDynamic.major?.archive?.jump_url || `https://t.bilibili.com/${item.id_str}`
        : `https://t.bilibili.com/${item.id_str}`,
      contentBlocks: [
        ...textBlock(description),
        ...imageBlocks(images, '动态图片')
      ],
      images,
      videos: avVideos,
      primaryVideo: avVideos[0],
      stats: toStats([
        ['转发', moduleStat.forward?.count],
        ['点赞', moduleStat.like?.count],
        ['评论', moduleStat.comment?.count]
      ]),
      meta: toMeta([
        ['动态类型', String(dynamicType)]
      ]),
      raw: {
        accentColor: '#00a1d6',
        detail,
        idData
      }
    })
  }

  if (idData.type === 'bangumi_video_info') {
    const bangumiOptions = idData.isEpid
      ? { ep_id: String(String(idData.realid).replace(/^ep/, '')) }
      : { season_id: String(String(idData.realid).replace(/^ss/, '')) }
    const info = await amagiClient.bilibili.fetcher.fetchBangumiInfo({
      ...bangumiOptions,
      typeMode: 'strict'
    })
    const result = info.data.result
    const episode = result.episodes?.[0]
    const epId = String(episode?.ep_id ?? String(idData.realid).replace(/^ep/, ''))
    const cid = episode?.cid
    const stream = epId && cid
      ? await amagiClient.bilibili.fetcher.fetchBangumiStreamUrl({
          ep_id: epId,
          cid,
          typeMode: 'strict'
        })
      : null
    const videoUrl = stream?.data.result?.dash?.video?.[0]?.base_url
    const primaryVideo = videoUrl
      ? buildVideo(videoUrl, {
          title: result.title || result.season_title,
          durationSeconds: episode?.duration ?? undefined,
          audioUrl: stream?.data.result?.dash?.audio?.[0]?.base_url,
          audioBackupUrls: stream?.data.result?.dash?.audio?.[0]
            ? collectBilibiliCdnBackupUrls(stream.data.result.dash.audio[0])
            : [],
          asrSourceType: stream?.data.result?.dash?.audio?.[0]?.base_url ? 'audio' : undefined,
          asrSourceUrl: stream?.data.result?.dash?.audio?.[0]?.base_url,
          asrSourceBackupUrls: stream?.data.result?.dash?.audio?.[0]
            ? collectBilibiliCdnBackupUrls(stream.data.result.dash.audio[0])
            : [],
          subtitles: result.subtitle
            ? [{
                source: 'bilibili',
                language: 'zh-CN',
                label: '番剧副标题',
                text: result.subtitle
              }]
            : [],
          headers: createHeaders({
            ...baseHeaders,
            Cookie: Config.cookies.bilibili,
            Referer: 'https://www.bilibili.com'
          })
        })
      : null

    return buildParsedPost({
      platform: 'bilibili',
      platformLabel: 'B站',
      subtype: 'bangumi',
      title: result.title || result.season_title || 'B站番剧',
      author: result.up_info?.uname ? buildAuthor(result.up_info.uname) : undefined,
      summary: result.evaluate || result.subtitle,
      url: result.share_url || url,
      contentBlocks: textBlock(result.evaluate),
      images: [],
      videos: primaryVideo ? [primaryVideo] : [],
      primaryVideo: primaryVideo ?? undefined,
      stats: toStats([
        ['评分', result.rating?.score],
        ['评分人数', result.rating?.count],
        ['总集数', result.total]
      ]),
      meta: toMeta([
        ['副标题', result.subtitle],
        ['发布时间', result.publish?.pub_time_show]
      ]),
      raw: {
        accentColor: '#00a1d6',
        detail: info,
        idData
      }
    })
  }

  if (idData.type === 'live_room_detail') {
    const live = await amagiClient.bilibili.fetcher.fetchLiveRoomInfo({
      room_id: String(idData.room_id),
      typeMode: 'strict'
    })
    const data = live.data.data
    const images = [data.keyframe || data.user_cover].filter(Boolean).map((image: string) => ({ url: image }))

    return buildParsedPost({
      platform: 'bilibili',
      platformLabel: 'B站',
      subtype: 'live',
      title: data.title || 'B站直播间',
      author: buildAuthor(String(data.uid || data.short_id || '主播'), {
        avatar: data.user_cover || undefined
      }),
      summary: data.description || '该直播间暂无更多简介',
      url: `https://live.bilibili.com/${data.room_id}`,
      contentBlocks: [
        ...textBlock(data.description),
        ...imageBlocks(images, '直播封面')
      ],
      images,
      videos: [],
      stats: toStats([
        ['在线', data.online],
        ['直播状态', data.live_status]
      ]),
      meta: toMeta([
        ['分区', data.area_name],
        ['父分区', data.parent_area_name],
        ['开播时间', data.live_time]
      ]),
      raw: {
        accentColor: '#00a1d6',
        detail: live,
        idData
      }
    })
  }

  logger.warn(`[ParsedPost] 当前暂未为 B站类型 ${idData.type} 提供专门解析，返回空文本模式`)
  return buildParsedPost({
    platform: 'bilibili',
    platformLabel: 'B站',
    subtype: 'dynamic',
    title: 'B站内容',
    url,
    contentBlocks: [],
    images: [],
    videos: [],
    stats: [],
    meta: [],
    raw: {
      accentColor: '#00a1d6',
      idData
    }
  })
}
