import { format, fromUnixTime } from 'date-fns'
import type { AdapterType, ImageElement, Message } from 'node-karin'
import karin, { common, logger } from 'node-karin'

import { cleanOldDynamicCache, douyinDB } from '@/module/db'
import type { downLoadFileOptions } from '@/module/utils/Base'
import { Base } from '@/module/utils/Base'
import { Config } from '@/module/utils/Config'
import { fetchDouyinUserPageByBrowser } from '@/module/utils/DouyinBrowserFallback'
import { BASE_HEADERS as baseHeaders } from '@/module/utils/Network/constants'
import { Network as Networks } from '@/module/utils/Network/Network'
import {
  applyWatermarkToImages,
  Render,
  sendRenderedImagesToContact
} from '@/module/utils/Render'
import { normalizeDouyinArticleContent } from '@/platform/douyin/articleContent'
import { DouYin } from '@/platform/douyin/douyin'
import type { DouyinIdData } from '@/platform/douyin/getID'
import { getDouyinID } from '@/platform/douyin/getID'
import { buildDouyinLongTextWorkData, shouldUseDouyinLongTextCard } from '@/platform/douyin/longTextCard'
import { getDouyinShareableVideoUrl, getWorkCoverUrl, getWorkTypeDisplayName, getWorkTypeInfo } from '@/platform/douyin/workType'
import type { douyinPushItem } from '@/types/config/pushlist'

import {
  assertSuccessfulDouyinPushResult,
  prepareDouyinPushCookie,
  retryDouyinPushAfterCookieRefresh,
  shouldFallbackDouyinUserPageAfterError
} from './push/cookie'
import { processFavoriteList } from './push/favorite'
import { processLiveStream } from './push/live'
import { processPostList } from './push/post'
import { processRecommendList } from './push/recommend'
import { type DouyinPushItem, type WillBePushList } from './push/types'

// Re-export types for backward compatibility
export type { DouyinPushItem }

const douyinBaseHeaders: NonNullable<downLoadFileOptions['headers']> = {
  ...baseHeaders,
  Referer: 'https://www.douyin.com',
  Cookie: Config.cookies.douyin
}

const DOUYIN_PUSH_LIST_LOOKBACK_COUNT = 50

type DouyinAuthorDisplayInfo = {
  nickname: string
  avatar: string
  douyinId: string
}

const getDouyinAvatarUrl = (user: any): string => {
  const avatars = [user?.avatar_larger, user?.avatar_medium, user?.avatar_thumb]
  for (const avatar of avatars) {
    const directUrl = avatar?.url_list?.find((value: unknown) => typeof value === 'string' && value)
    if (directUrl) return directUrl

    if (avatar?.uri) return `https://p3-pc.douyinpic.com/aweme/1080x1080/${avatar.uri}`
  }

  return ''
}

const getDouyinUserId = (user: any): string => {
  const uniqueId = user?.unique_id
  if (typeof uniqueId === 'string' && uniqueId) return uniqueId

  return typeof user?.short_id === 'string' ? user.short_id : ''
}

const getDouyinAuthorDisplayInfo = (detailData: Record<string, any>): DouyinAuthorDisplayInfo => {
  const authorProfile = detailData.author_user_info?.data?.user
  const author = authorProfile ?? detailData.author ?? {}

  return {
    nickname: typeof author.nickname === 'string' && author.nickname ? author.nickname : '未知作者',
    avatar: getDouyinAvatarUrl(author),
    douyinId: getDouyinUserId(author)
  }
}

type DouyinUserListRenderItem = {
  avatar_img: string
  username: string
  short_id: string
  fans: string
  total_favorited: string
  following_count: string
  switch: boolean
  pushTypes: string[]
}

type DouyinSearchInfo = {
  user_list?: Array<{
    user_info: {
      unique_id: string
      short_id: string
      sec_uid: string
    }
  }>
} & Record<string, unknown>

type DouyinAwemeListResult = {
  data: {
    aweme_list: any[]
  }
}

const countDouyinPushTargets = (pushList: douyinPushItem[] = []): number => {
  return pushList.reduce((sum, item) => sum + (item.group_id?.length ?? 0), 0)
}

const getDouyinPushBotIds = (pushList: douyinPushItem[] = []): string[] => {
  return [...new Set(pushList.flatMap(item => item.group_id?.map(groupWithBot => groupWithBot.split(':')[1]).filter(Boolean) ?? []))]
}

export class DouYinpush extends Base {
  private force = false
  private readonly browserUserPageCache = new Map<string, { profile: any, postList?: any }>()
  /**
   *
   * @param e  事件Message
   * @param force 是否强制推送
   * @default false
   * @returns
   */
  constructor (e = {} as Message, force: boolean = false) {
    super(e)
    this.headers!.Referer = 'https://www.douyin.com'
    this.headers!.Cookie = Config.cookies.douyin
    this.force = force
  }

  private reloadDouyinRuntime () {
    this.reloadConfig()
    this.headers!.Cookie = Config.cookies.douyin
    douyinBaseHeaders.Cookie = Config.cookies.douyin
  }

  private async withCookieRefreshRetry<T> (operation: () => Promise<T>, context: string): Promise<T> {
    return await retryDouyinPushAfterCookieRefresh(operation, {
      reloadConfig: () => this.reloadDouyinRuntime()
    }, context)
  }

  private async sendParsedDynamicThroughHandler (botId: string, contact: any, iddata: DouyinIdData) {
    const bot = karin.getBot(botId) as AdapterType
    if (!bot) {
      throw new Error(`未找到可用 Bot：${botId}`)
    }

    let syntheticCounter = 0
    const event = {
      msg: iddata.resolvedUrl ?? '',
      isGroup: true,
      userId: botId,
      messageId: `douyin-push-parse-${iddata.aweme_id ?? ++syntheticCounter}`,
      sender: {
        userId: botId,
        nick: bot.account.name
      },
      contact,
      bot,
      reply: async (payload: unknown) => {
        if (payload === '检测到抖音链接，开始解析') {
          return { messageId: `douyin-push-skip-${++syntheticCounter}` }
        }

        const result = await bot.sendMsg(contact, payload as any)
        return {
          messageId: (result as any)?.messageId ?? (result as any)?.message_id ?? `douyin-push-${++syntheticCounter}`
        }
      }
    } as any

    await new DouYin(event, iddata).DouyinHandler(iddata)
  }

  private async fetchUserPageByBrowserFallback (secUid: string, context: string) {
    const cached = this.browserUserPageCache.get(secUid)
    if (cached) return cached

    logger.warn(`[DouYinPush] ${context} 直连接口不可用，改用浏览器用户页网络响应兜底`)
    const userPage = await fetchDouyinUserPageByBrowser(secUid)
    this.browserUserPageCache.set(secUid, userPage)
    return userPage
  }

  private async fetchUserProfileWithFallback (secUid: string, context: string): Promise<any> {
    try {
      return await this.withCookieRefreshRetry(
        async () => assertSuccessfulDouyinPushResult(
          await this.amagi.douyin.fetcher.fetchUserProfile({ sec_uid: secUid, typeMode: 'strict' }),
          context
        ),
        context
      )
    } catch (error) {
      if (!shouldFallbackDouyinUserPageAfterError(error)) throw error

      const fallback = await this.fetchUserPageByBrowserFallback(secUid, context)
      return {
        success: true,
        code: 200,
        message: '浏览器兜底获取成功',
        data: fallback.profile,
        error: undefined as never
      }
    }
  }

  private async fetchUserVideoListWithFallback (
    secUid: string,
    context: string,
    expectedAwemeCount?: unknown
  ): Promise<any> {
    const cachedPostList = this.browserUserPageCache.get(secUid)?.postList
    if (cachedPostList?.aweme_list?.length) {
      return {
        success: true,
        code: 200,
        message: '浏览器兜底获取成功',
        error: undefined as never,
        data: {
          ...cachedPostList,
          aweme_list: cachedPostList.aweme_list ?? []
        }
      }
    }

    try {
      const result = await this.withCookieRefreshRetry(
        async () => assertSuccessfulDouyinPushResult(
          await this.amagi.douyin.fetcher.fetchUserVideoList({ sec_uid: secUid, number: DOUYIN_PUSH_LIST_LOOKBACK_COUNT, typeMode: 'strict' }),
          context
        ),
        context
      )

      const awemeList = result?.data?.aweme_list
      const visibleAwemeCount = Array.isArray(awemeList) ? awemeList.length : 0
      const knownAwemeCount = Number(expectedAwemeCount)
      const hasUnexpectedEmptyList = visibleAwemeCount === 0 && Number.isFinite(knownAwemeCount) && knownAwemeCount > 0
      const hasTruncatedList = visibleAwemeCount > 0 && visibleAwemeCount < 17
      if (hasUnexpectedEmptyList || hasTruncatedList) {
        const reason = hasUnexpectedEmptyList
          ? `主页显示作品数 ${knownAwemeCount}，但接口返回空列表`
          : `接口仅返回 ${visibleAwemeCount} 条作品`
        logger.warn(`[DouYinPush] ${context} ${reason}，疑似被抖音缩减，改用浏览器用户页首包补偿`)
        try {
          const fallback = await this.fetchUserPageByBrowserFallback(secUid, context)
          if (fallback.postList?.aweme_list?.length) {
            return {
              success: true,
              code: 200,
              message: '浏览器兜底获取成功',
              error: undefined as never,
              data: {
                ...fallback.postList,
                aweme_list: fallback.postList.aweme_list ?? []
              }
            }
          }
        } catch (error) {
          logger.warn(`[DouYinPush] ${context} 浏览器兜底失败，继续使用接口返回结果：${error instanceof Error ? error.message : String(error)}`)
        }
      }

      return result
    } catch (error) {
      if (!shouldFallbackDouyinUserPageAfterError(error)) throw error

      const fallback = await this.fetchUserPageByBrowserFallback(secUid, context)
      if (!fallback.postList) throw error

      return {
        success: true,
        code: 200,
        message: '浏览器兜底获取成功',
        error: undefined as never,
        data: {
          ...fallback.postList,
          aweme_list: fallback.postList.aweme_list ?? []
        }
      }
    }
  }

  private injectBotToEventForRender (targets: Array<{ groupId: string, botId: string }>): void {
    const targetBotId = targets.find(item => item.botId)?.botId
    if (!targetBotId) return

    const bot = karin.getBot(targetBotId) as AdapterType | undefined
    if (!bot) return

    const eventWithBot = this.e as Message & { bot?: AdapterType, selfId?: string }
    eventWithBot.bot = bot
    eventWithBot.selfId = eventWithBot.selfId ?? targetBotId
  }

  /**
   * 执行主要的操作流程
   */
  async action () {
    const actionStartTime = Date.now()
    const configuredPushList = Config.pushlist.douyin ?? []
    logger.info(`[DouYinPush] 本轮开始：配置订阅 ${configuredPushList.length} 项，启用 ${configuredPushList.filter(item => item.switch !== false).length} 项，配置目标 ${countDouyinPushTargets(configuredPushList)} 个`)

    logger.info('[DouYinPush] 准备检查抖音 Cookie/游客 Cookie 状态')
    await prepareDouyinPushCookie({
      reloadConfig: () => this.reloadDouyinRuntime()
    })
    logger.info('[DouYinPush] Cookie 状态检查完成，准备同步推送配置到数据库')

    await this.syncConfigToDatabase()

    // 清理旧的作品缓存记录
    const deletedCount = await cleanOldDynamicCache('douyin')
    if (deletedCount > 0) {
      logger.info(`已清理 ${deletedCount} 条过期的抖音作品缓存记录`)
    }

    // 检查备注信息
    if (await this.checkremark()) {
      logger.warn('[DouYinPush] 推送列表为空，跳过本轮抖音推送')
      return true
    }

    // 检查并补全配置文件中缺失的字段
    this.ensureConfigFields(Config.pushlist.douyin)

    // 获取已注册的 bot 列表，过滤未注册的 bot
    const registeredBotIds = karin.getAllBotID()
    const filteredPushList = this.filterPushListByRegisteredBots(Config.pushlist.douyin, registeredBotIds)
    logger.info(`[DouYinPush] Bot 过滤：已注册 ${registeredBotIds.length} 个，配置目标 ${countDouyinPushTargets(Config.pushlist.douyin)} 个，过滤后订阅 ${filteredPushList.length} 项，目标 ${countDouyinPushTargets(filteredPushList)} 个`)

    if (filteredPushList.length === 0) {
      logger.warn(`[DouYinPush] 没有已注册的 bot 可用于抖音推送，已注册Bot=[${registeredBotIds.join(', ') || '无'}]，配置Bot=[${getDouyinPushBotIds(Config.pushlist.douyin).join(', ') || '无'}]`)
      return true
    }

    const data = await this.getDynamicList(filteredPushList)
    const pushCount = Object.keys(data).length
    logger.info(`[DouYinPush] 内容检查完成：待推送 ${pushCount} 项，耗时 ${Date.now() - actionStartTime}ms`)

    if (pushCount === 0) {
      logger.warn('[DouYinPush] 本轮没有待推送内容，常见原因：用户未发 24 小时内新作品、作品已推送过、未开播、接口/浏览器兜底返回空列表')
      return true
    }

    if (this.force) return await this.forcepush(data)
    else return await this.getdata(data)
  }

  /**
   * 检查并补全配置文件中缺失的字段
   * @param pushList 推送配置列表
   */
  private ensureConfigFields (pushList: douyinPushItem[]): void {
    if (!pushList || pushList.length === 0) return

    let hasChanges = false

    for (const item of pushList) {
      // 检查并补全 pushTypes 字段
      if (!item.pushTypes || item.pushTypes.length === 0) {
        item.pushTypes = ['post', 'live', 'favorite', 'recommend']
        hasChanges = true
        logger.info(`为用户 ${item.remark ?? item.sec_uid} 自动补全推送类型：作品列表、直播、收藏、推荐`)
      }

      // 检查并补全 switch 字段
      if (item.switch === undefined) {
        item.switch = true
        hasChanges = true
      }
    }

    // 如果有修改，保存到配置文件
    if (hasChanges) {
      Config.Modify('pushlist', 'douyin', pushList)
      logger.info('已自动补全配置文件中缺失的字段并保存')
    }
  }

  /**
   * 根据已注册的 bot 列表过滤推送配置
   * @param pushList 原始推送配置列表
   * @param registeredBotIds 已注册的 bot ID 列表
   * @returns 过滤后的推送配置列表
   */
  private filterPushListByRegisteredBots (pushList: douyinPushItem[], registeredBotIds: string[]): douyinPushItem[] {
    if (!pushList || pushList.length === 0) return []

    const registeredSet = new Set(registeredBotIds)
    const filteredList: douyinPushItem[] = []

    for (const item of pushList) {
      // 过滤 group_id 中未注册的 bot
      const filteredGroupIds = item.group_id.filter(groupWithBot => {
        const [groupId, botId] = groupWithBot.split(':')
        if (!groupId || !botId) {
          logger.warn(`[DouYinPush] 用户 ${item.remark ?? item.sec_uid} 的推送目标格式不正确：${groupWithBot}，需要 群号:Bot账号`)
          return false
        }
        const isRegistered = registeredSet.has(botId)
        if (!isRegistered) {
          logger.warn(`[DouYinPush] Bot ${botId} 未注册，跳过群组 ${groupId} 的推送`)
        }
        return isRegistered
      })

      // 如果过滤后还有有效的群组，则保留该订阅项
      if (filteredGroupIds.length > 0) {
        if (filteredGroupIds.length !== item.group_id.length) {
          logger.warn(`[DouYinPush] 用户 ${item.remark ?? item.sec_uid} 的部分目标 bot 未注册：保留 ${filteredGroupIds.length}/${item.group_id.length} 个目标`)
        }
        filteredList.push({
          ...item,
          group_id: filteredGroupIds
        })
      } else {
        logger.warn(`[DouYinPush] 用户 ${item.remark ?? item.sec_uid} 的所有推送目标 bot 均不可用，跳过该订阅`)
      }
    }

    return filteredList
  }

  /**
   * 同步配置文件中的订阅信息到数据库
   */
  async syncConfigToDatabase () {
    // 如果配置文件中没有抖音推送列表，直接返回
    if (!Config.pushlist.douyin || Config.pushlist.douyin.length === 0) {
      logger.info('[DouYinPush] 配置订阅为空，跳过数据库订阅同步')
      return
    }

    logger.info(`[DouYinPush] 同步配置订阅到数据库：订阅 ${Config.pushlist.douyin.length} 项，目标 ${countDouyinPushTargets(Config.pushlist.douyin)} 个`)
    await douyinDB.syncConfigSubscriptions(Config.pushlist.douyin)
    logger.info('[DouYinPush] 数据库订阅同步完成')
  }

  async getdata (data: WillBePushList) {
    const dataEntries = Object.entries(data)
    if (dataEntries.length === 0) {
      logger.warn('[DouYinPush] 进入发送流程时待推送列表为空，跳过发送')
      return true
    }

    let sentSuccessCount = 0
    let sentNoMessageIdCount = 0
    let skippedCount = 0
    let cacheWriteCount = 0
    let failedItemCount = 0
    let failedTargetCount = 0
    const sender = this.e.sender
    const forwardIdentity = Config.app.fakeForward && sender?.userId && sender?.nick
      ? {
        id: sender.userId,
        name: sender.nick
      }
      : undefined

    if (Config.app.fakeForward && !forwardIdentity) {
      logger.warn('[DouYinPush] 已开启伪造转发，但定时任务没有消息发送者上下文，将使用机器人身份转发')
    }

    logger.info(`[DouYinPush] 开始发送流程：待推送 ${dataEntries.length} 项`)

    for (const [awemeId, pushItem] of dataEntries) {
      const actualAwemeId = String(pushItem.Detail_Data.aweme_id ?? pushItem.sec_uid ?? awemeId.replace(/^(post|favorite|recommend|live)_/, ''))
      const pushTypeLabel = pushItem.pushType === 'post' ? '作品列表' :
        pushItem.pushType === 'favorite' ? '喜欢列表' :
          pushItem.pushType === 'recommend' ? '推荐列表' : '直播'

      try {
        logger.mark(`
        ${logger.blue('开始处理并渲染抖音动态图片')}
        ${logger.blue('博主')}: ${logger.green(pushItem.remark)} 
        ${logger.blue('推送类型')}: ${logger.magenta(pushTypeLabel)}
        ${logger.cyan('作品id')}：${logger.yellow(actualAwemeId)}
        ${logger.cyan('访问地址')}：${logger.green('https://www.douyin.com/video/' + actualAwemeId)}`)

        const Detail_Data = pushItem.Detail_Data
        const skip = await skipDynamic(pushItem)
        skip && logger.warn(`作品 https://www.douyin.com/video/${actualAwemeId} 已被处理，跳过`)
        if (skip) skippedCount++
        let img: ImageElement[] = []
        let iddata: DouyinIdData = { type: 'one_work' }
        this.injectBotToEventForRender(pushItem.targets)

        if (!skip) {
          iddata = await getDouyinID(this.e, Detail_Data.share_url ?? 'https://live.douyin.com/' + Detail_Data.room_data?.owner.web_rid, false)
        }

        if (!skip) {
          if (pushItem.pushType === 'live' && 'room_data' in pushItem.Detail_Data && Detail_Data.live_data) {
          // 处理直播推送
            const liveItem = Detail_Data.live_data.data.data.data[0]
            //@ts-ignore
            const streamExtra = liveItem.stream_url.extra
            const resolution = streamExtra
              ? `${streamExtra.width}x${streamExtra.height}`
            //@ts-ignore
              : liveItem.stream_url.default_resolution

            img = await Render(this.e, 'douyin/live', {
            //@ts-ignore
              image_url: liveItem.cover.url_list[0],
              //@ts-ignore
              text: liveItem.title,
              partition_title: Detail_Data.live_data.data.data.partition_road_map?.partition?.title || '未知分区',
              room_id: Detail_Data.room_data.owner.web_rid,
              //@ts-ignore
              online_viewers: this.count(liveItem.room_view_stats.display_value),
              //@ts-ignore
              total_viewers: liveItem.stats.total_user_str,
              username: Detail_Data.user_info.data.user.nickname,
              avater_url: 'https://p3-pc.douyinpic.com/aweme/1080x1080/' + Detail_Data.user_info.data.user.avatar_larger.uri,
              fans: this.count(Detail_Data.user_info.data.user.follower_count),
              share_url: 'https://live.douyin.com/' + Detail_Data.room_data.owner.web_rid,
              dynamicTYPE: '直播动态推送',
              //@ts-ignore
              like_count: this.count(liveItem.like_count),
              //@ts-ignore
              user_count_str: liveItem.user_count_str,
              resolution,
              signature: Detail_Data.user_info.data.user.signature,
              //@ts-ignore
              city: Detail_Data.user_info.data.user.city,
              aweme_count: this.count(Detail_Data.user_info.data.user.aweme_count),
              following_count: this.count(Detail_Data.user_info.data.user.following_count),
              total_favorited: this.count(Detail_Data.user_info.data.user.total_favorited),
              //@ts-ignore
              has_commerce_goods: liveItem.has_commerce_goods
            }, { skipWatermark: true })
          } else {
          // 处理普通作品推送
            const realUrl = Config.douyin.push.shareType === 'web' && await new Networks({
              url: Detail_Data.share_url,
              headers: {
                'User-Agent': 'Apifox/1.0.0 (https://apifox.com)',
                Accept: '*/*',
                'Accept-Encoding': 'gzip, deflate, br',
                Connection: 'keep-alive'
              }
            }).getLocation()

            // 根据推送类型选择不同的渲染模板和数据
            if (pushItem.pushType === 'favorite') {
            // 喜欢列表模板：需要显示"谁喜欢了谁的作品"
              const author = getDouyinAuthorDisplayInfo(Detail_Data)

              // 获取作品类型信息和封面
              const workTypeInfo = getWorkTypeInfo(Detail_Data as any)
              const coverUrl = getWorkCoverUrl(workTypeInfo, Detail_Data as any)

              img = await Render(this.e, 'douyin/favorite-list', {
                image_url: coverUrl,
                desc: this.desc(Detail_Data, Detail_Data.desc),
                dianzan: this.count(Detail_Data.statistics.digg_count),
                pinglun: this.count(Detail_Data.statistics.comment_count),
                share: this.count(Detail_Data.statistics.share_count),
                shouchang: this.count(Detail_Data.statistics.collect_count),
                tuijian: this.count(Detail_Data.statistics.recommend_count),
                create_time: format(fromUnixTime(pushItem.create_time), 'yyyy-MM-dd HH:mm'),
                // 点赞者信息（订阅者）
                liker_username: pushItem.remark,
                liker_avatar: 'https://p3-pc.douyinpic.com/aweme/1080x1080/' + Detail_Data.user_info.data.user.avatar_larger.uri,
                liker_douyin_id: Detail_Data.user_info.data.user.unique_id === '' ? Detail_Data.user_info.data.user.short_id : Detail_Data.user_info.data.user.unique_id,
                // 作品作者信息
                author_username: author.nickname,
                author_avatar: author.avatar,
                author_douyin_id: author.douyinId,
                share_url: Config.douyin.push.shareType === 'web' ? realUrl : getDouyinShareableVideoUrl(Detail_Data.video)
              }, { skipWatermark: true })
            } else if (pushItem.pushType === 'recommend') {
            // 推荐列表模板
              const author = getDouyinAuthorDisplayInfo(Detail_Data)

              // 获取作品类型信息和封面
              const workTypeInfo = getWorkTypeInfo(Detail_Data as any)
              const coverUrl = getWorkCoverUrl(workTypeInfo, Detail_Data as any)

              img = await Render(this.e, 'douyin/recommend-list', {
                image_url: coverUrl,
                desc: this.desc(Detail_Data, Detail_Data.desc),
                dianzan: this.count(Detail_Data.statistics.digg_count),
                pinglun: this.count(Detail_Data.statistics.comment_count),
                share: this.count(Detail_Data.statistics.share_count),
                shouchang: this.count(Detail_Data.statistics.collect_count),
                tuijian: this.count(Detail_Data.statistics.recommend_count),
                create_time: format(fromUnixTime(pushItem.create_time), 'yyyy-MM-dd HH:mm'),

                // 推荐者信息（订阅者）
                recommender_username: pushItem.remark,
                recommender_avatar: 'https://p3-pc.douyinpic.com/aweme/1080x1080/' + Detail_Data.user_info.data.user.avatar_larger.uri,
                recommender_douyin_id: Detail_Data.user_info.data.user.unique_id === '' ? Detail_Data.user_info.data.user.short_id : Detail_Data.user_info.data.user.unique_id,

                // 作品作者信息
                author_username: author.nickname,
                author_avatar: author.avatar,
                author_douyin_id: author.douyinId,
                share_url: Config.douyin.push.shareType === 'web' ? realUrl : getDouyinShareableVideoUrl(Detail_Data.video)
              }, { skipWatermark: true })
            } else {
            // 作品列表模板（post）
              const dynamicTypeLabel = '作品动态推送'

              // 获取作品类型信息
              const workTypeInfo = getWorkTypeInfo(Detail_Data as any)

              // 获取封面 URL
              const coverUrl = getWorkCoverUrl(workTypeInfo, Detail_Data as any)

              // 如果是文章类型，使用文章模板
              if (workTypeInfo.isArticle) {
                const article = normalizeDouyinArticleContent(Detail_Data as Record<string, any>)

                // 渲染文章模板
                img = await Render(this.e, 'douyin/article-work', {
                  title: article.title,
                  markdown: article.markdownOrText,
                  images: article.images,
                  read_time: article.readTime,

                  // 互动数据
                  dianzan: this.count(Detail_Data.statistics.digg_count),
                  pinglun: this.count(Detail_Data.statistics.comment_count),
                  shouchang: this.count(Detail_Data.statistics.collect_count),
                  share: this.count(Detail_Data.statistics.share_count),

                  // 时间信息
                  create_time: format(fromUnixTime(pushItem.create_time), 'yyyy-MM-dd HH:mm'),

                  // 用户信息
                  avater_url: 'https://p3-pc.douyinpic.com/aweme/1080x1080/' + Detail_Data.user_info.data.user.avatar_larger.uri,
                  username: Detail_Data.author.nickname,
                  抖音号: Detail_Data.user_info.data.user.unique_id === '' ? Detail_Data.user_info.data.user.short_id : Detail_Data.user_info.data.user.unique_id,
                  获赞: this.count(Detail_Data.user_info.data.user.total_favorited),
                  关注: this.count(Detail_Data.user_info.data.user.following_count),
                  粉丝: this.count(Detail_Data.user_info.data.user.follower_count),

                  // 分享链接
                  share_url: Detail_Data.share_url,

                  // 主题
                  useDarkTheme: false
                }, { skipWatermark: true })
              } else if (shouldUseDouyinLongTextCard(Detail_Data as Record<string, any>)) {
                const shareUrl = Config.douyin.push.shareType === 'web'
                  ? (typeof realUrl === 'string' ? realUrl : Detail_Data.share_url)
                  : getDouyinShareableVideoUrl(Detail_Data.video)

                img = await Render(this.e, 'douyin/long-text-work', buildDouyinLongTextWorkData(
                  Detail_Data as Record<string, any>,
                  {
                    profile: Detail_Data.user_info.data.user,
                    createTime: format(fromUnixTime(pushItem.create_time), 'yyyy-MM-dd HH:mm'),
                    shareUrl,
                    dynamicType: dynamicTypeLabel
                  }
                ), { skipWatermark: true })
              } else {
                // 视频或图文作品
                img = await Render(this.e, workTypeInfo.templatePath, {
                  image_url: coverUrl,
                  desc: this.desc(Detail_Data, Detail_Data.desc),
                  dianzan: this.count(Detail_Data.statistics.digg_count),
                  pinglun: this.count(Detail_Data.statistics.comment_count),
                  share: this.count(Detail_Data.statistics.share_count),
                  shouchang: this.count(Detail_Data.statistics.collect_count),
                  create_time: format(fromUnixTime(pushItem.create_time), 'yyyy-MM-dd HH:mm'),
                  avater_url: 'https://p3-pc.douyinpic.com/aweme/1080x1080/' + Detail_Data.user_info.data.user.avatar_larger.uri,
                  share_url: Config.douyin.push.shareType === 'web' ? realUrl : getDouyinShareableVideoUrl(Detail_Data.video),
                  username: Detail_Data.user_info.data.user.nickname,
                  抖音号: Detail_Data.user_info.data.user.unique_id === '' ? Detail_Data.user_info.data.user.short_id : Detail_Data.user_info.data.user.unique_id,
                  粉丝: this.count(Detail_Data.user_info.data.user.follower_count),
                  获赞: this.count(Detail_Data.user_info.data.user.total_favorited),
                  关注: this.count(Detail_Data.user_info.data.user.following_count),
                  dynamicTYPE: dynamicTypeLabel,
                  cooperation_info: (() => {
                    const raw = Detail_Data.cooperation_info
                    if (!raw) return undefined

                    const rawCreators = Array.isArray(raw.co_creators) ? raw.co_creators : []

                    // 订阅者信息（user_info）
                    const subscriberUid = Detail_Data.user_info.data.user.uid
                    const subscriberSecUid = Detail_Data.user_info.data.user.sec_uid

                    // 查找订阅者在共创列表中的职位
                    const subscriberInCreators = rawCreators.find((c: { uid: string; sec_uid: string }) =>
                      (subscriberUid && c.uid && c.uid === subscriberUid) ||
                    (subscriberSecUid && c.sec_uid && c.sec_uid === subscriberSecUid)
                    )

                    // 简化共创者信息：只保留头像链接、名字、职位（使用 avatar_url）
                    const co_creators = rawCreators.map((c: {
                      avatar_thumb: { url_list: (string | undefined)[]; uri: any }
                      nickname: any
                      role_title: any
                    }) => {
                      const avatarUrl = c.avatar_thumb?.url_list?.[0] ??
                      (c.avatar_thumb?.uri ? `https://p3.douyinpic.com/${c.avatar_thumb.uri}` : undefined)

                      return {
                        avatar_url: avatarUrl,
                        nickname: c.nickname,
                        role_title: c.role_title
                      }
                    })

                    if (
                      Detail_Data.author &&
                    !rawCreators.some((c: { uid: string; sec_uid: string; nickname: string }) =>
                      (Detail_Data.author?.uid && c.uid && c.uid === Detail_Data.author.uid) ||
                      (Detail_Data.author?.sec_uid && c.sec_uid && c.sec_uid === Detail_Data.author.sec_uid) ||
                      (Detail_Data.author?.nickname && c.nickname && c.nickname === Detail_Data.author.nickname)
                    )
                    ) {
                      co_creators.unshift({
                        avatar_url: Detail_Data.author.avatar_thumb?.url_list?.[0] ??
                        (Detail_Data.author.avatar_thumb?.uri ? `https://p3.douyinpic.com/${Detail_Data.author.avatar_thumb.uri}` : undefined),
                        nickname: Detail_Data.author.nickname,
                        role_title: '作者'
                      })
                    }

                    return {
                      co_creator_nums: Math.max(Number(raw.co_creator_nums || 0), co_creators.length),
                      co_creators,
                      subscriber_role: subscriberInCreators?.role_title ?? (
                        (subscriberUid && Detail_Data.author?.uid && subscriberUid === Detail_Data.author.uid) ||
                        (subscriberSecUid && Detail_Data.author?.sec_uid && subscriberSecUid === Detail_Data.author.sec_uid) ||
                        (Detail_Data.user_info.data.user.nickname && Detail_Data.author?.nickname && Detail_Data.user_info.data.user.nickname === Detail_Data.author.nickname)
                          ? '作者'
                          : undefined
                      )
                    }
                  })()
                }, { skipWatermark: true })
              }
            }
          }
          logger.info(`[DouYinPush] 渲染完成：${pushTypeLabel} ${actualAwemeId}，消息元素 ${img.length} 个`)
        }

        // 遍历目标群组，并发送消息
        for (const target of pushItem.targets) {
          const { groupId, botId } = target

          try {
            let status: { message_id?: string } = { message_id: '' }
            if (!skip) {
              const Contact = karin.contactGroup(groupId)

              // 为当前目标注入 bot 并应用水印
              const bot = karin.getBot(botId) as AdapterType
              const eventWithBot = this.e as Message & { bot?: AdapterType, selfId?: string }
              eventWithBot.bot = bot
              eventWithBot.selfId = botId
              const watermarkedImg = img ? applyWatermarkToImages(img, this.e) : []

              // 发送消息
              logger.info(`[DouYinPush] 准备发送${pushTypeLabel}：作品 ${actualAwemeId} -> 群 ${groupId}，Bot ${botId}，消息元素 ${watermarkedImg.length} 个`)
              status = await sendRenderedImagesToContact({
                bot,
                contact: Contact
              }, [...watermarkedImg], {
                sendDirect: async (images) => await karin.sendMsg(botId, Contact, images),
                forwardIdentity,
                source: '图片合集',
                summary: `查看${watermarkedImg.length}张图片消息`,
                prompt: '抖音动态推送',
                news: [{ text: '点击查看推送内容' }]
              }) as { message_id?: string }
              if (status.message_id) {
                sentSuccessCount++
                logger.info(`[DouYinPush] 发送成功：作品 ${actualAwemeId} -> 群 ${groupId}，message_id=${status.message_id}`)
              } else {
                sentNoMessageIdCount++
                logger.warn(`[DouYinPush] 发送后未返回 message_id：作品 ${actualAwemeId} -> 群 ${groupId}，返回=${JSON.stringify(status)}`)
              }

              // 如果是直播推送，更新直播状态
              if (pushItem.pushType === 'live' && 'room_data' in pushItem.Detail_Data && status.message_id) {
                try {
                  await douyinDB.updateLiveStatus(pushItem.sec_uid, true)
                } catch (error) {
                  logger.warn(`[DouYinPush] 直播 ${actualAwemeId} 已发送到群 ${groupId}，但更新直播状态失败：${error instanceof Error ? error.message : String(error)}`)
                }
              }

              // 是否一同解析该新作品？
              if (Config.douyin.push.parsedynamic && status.message_id) {
                try {
                  const workTypeInfo = getWorkTypeInfo(Detail_Data as any)
                  logger.debug(`开始解析作品，类型为：${getWorkTypeDisplayName(workTypeInfo)}`)
                  if (iddata.type === 'one_work') {
                    await this.sendParsedDynamicThroughHandler(botId, Contact, iddata)
                  }
                } catch (error) {
                  logger.warn(`[DouYinPush] 作品 ${actualAwemeId} 已发送到群 ${groupId}，但附加解析失败：${error instanceof Error ? error.message : String(error)}`)
                }
              }
            }

            // 添加作品缓存（直播不需要缓存aweme_id）
            if (skip || (pushItem.pushType !== 'live' && status.message_id)) {
              await douyinDB.addAwemeCache(actualAwemeId, pushItem.sec_uid, groupId, pushItem.pushType)
              cacheWriteCount++
            }
          } catch (error) {
            failedTargetCount++
            logger.warn(`[DouYinPush] 作品 ${actualAwemeId} 发送到群 ${groupId} 失败，已跳过该目标并等待下轮重试：${error instanceof Error ? error.message : String(error)}`)
          }
        }
      } catch (error) {
        failedItemCount++
        logger.warn(`[DouYinPush] 处理待推送内容 ${actualAwemeId} 失败，已跳过该内容并继续后续推送：${error instanceof Error ? error.message : String(error)}`)
      }
    }

    logger.info(`[DouYinPush] 发送流程完成：成功 ${sentSuccessCount} 次，无 message_id ${sentNoMessageIdCount} 次，过滤跳过 ${skippedCount} 项，内容失败 ${failedItemCount} 项，目标失败 ${failedTargetCount} 次，写入缓存 ${cacheWriteCount} 次`)
    return true
  }

  /**
   * 根据配置文件获取用户当天的作品列表。
   * @returns 将要推送的列表
   */
  async getDynamicList (userList: douyinPushItem[]): Promise<WillBePushList> {
    const willbepushlist: WillBePushList = {}

    try {
      /** 过滤掉不启用的订阅项 */
      const filteredUserList = userList.filter(item => item.switch !== false)
      const disabledCount = userList.length - filteredUserList.length
      logger.info(`[DouYinPush] 开始获取动态列表：输入订阅 ${userList.length} 项，启用 ${filteredUserList.length} 项，禁用 ${disabledCount} 项`)
      if (filteredUserList.length === 0) {
        logger.warn('[DouYinPush] 所有抖音订阅项都未启用，本轮不会请求账号内容')
      }

      for (const item of filteredUserList) {
        const sec_uid = item.sec_uid
        const beforeUserPushCount = Object.keys(willbepushlist).length

        try {
          await common.sleep(2000)
          const pushTypes = item.pushTypes || ['post'] // 默认推送作品列表

          logger.info(`[DouYinPush] 检查用户 ${item.remark ?? sec_uid}（${item.short_id ?? '无抖音号'}）：推送类型 [${pushTypes.join(', ')}]，配置目标 ${item.group_id.length} 个`)

          const userinfo = await this.fetchUserProfileWithFallback(sec_uid, `获取用户 ${item.remark ?? sec_uid} 主页`)
          logger.info(`[DouYinPush] 用户主页获取成功：${userinfo.data.user?.nickname ?? item.remark ?? sec_uid}，live_status=${userinfo.data.user?.live_status ?? 'unknown'}，作品数=${userinfo.data.user?.aweme_count ?? 'unknown'}，来源=${this.browserUserPageCache.has(sec_uid) ? 'browser-fallback' : 'api'}`)

          const targets = item.group_id.map(groupWithBot => {
            const [groupId, botId] = groupWithBot.split(':')
            return { groupId, botId }
          })

          // 如果没有订阅群组，跳过该用户
          if (targets.length === 0) {
            logger.warn(`[DouYinPush] 用户 ${item.remark ?? sec_uid} 没有可用推送目标，跳过`)
            continue
          }

          // special_state 特殊状态，用户已注销
          if (userinfo.data.user?.special_state_info?.special_state === 1 && userinfo.data.user?.user_deleted === true) {
            logger.warn(`${item.remark}（${sec_uid}）${userinfo.data.user.special_state_info.title}`)
            continue
          }

          // 遍历每种推送类型
          for (const pushType of pushTypes) {
            await common.sleep(1000)
            logger.info(`[DouYinPush] 用户 ${item.remark ?? sec_uid} 开始检查推送类型：${pushType}`)

            // 处理直播推送
            if (pushType === 'live') {
              const liveItem = await processLiveStream(
                sec_uid,
                userinfo,
                item,
                targets,
                this.amagi,
                (operation, context) => this.withCookieRefreshRetry(operation, context),
                (targetSecUid, context) => this.fetchUserProfileWithFallback(targetSecUid, context)
              )
              if (liveItem) {
                willbepushlist[`live_${sec_uid}`] = liveItem
                logger.info(`[DouYinPush] 用户 ${item.remark ?? sec_uid} 生成直播待推送项`)
              } else {
                logger.info(`[DouYinPush] 用户 ${item.remark ?? sec_uid} 没有直播待推送项，live_status=${userinfo.data.user?.live_status ?? 'unknown'}`)
              }
              continue
            }

            let contentList: any[] = []
            let listName = ''

            try {
            // 根据推送类型获取不同的列表
              switch (pushType) {
                case 'post':
                  listName = '作品列表'
                  const videolist = await this.fetchUserVideoListWithFallback(
                    sec_uid,
                    `获取用户 ${item.remark ?? sec_uid} 作品列表`,
                    userinfo.data.user?.aweme_count
                  )
                  if (videolist.data.aweme_list.length === 0) {
                    logger.warn(`${item.remark}(${item.short_id}) 获取到的作品列表数量为零！如果该博主有公开视频，可能是抖音接口风控或游客身份未生效`)
                  }
                  contentList = videolist.data.aweme_list || []
                  break
                case 'favorite':
                  listName = '喜欢列表'
                  if (this.browserUserPageCache.has(sec_uid)) {
                    logger.warn(`${item.remark}(${item.short_id}) 已使用浏览器兜底获取用户页，暂不支持继续获取喜欢列表，跳过该推送类型`)
                    continue
                  }
                  const favoritelist: DouyinAwemeListResult = await this.withCookieRefreshRetry(
                    () => this.amagi.douyin.fetcher.fetchUserFavoriteList({ sec_uid, number: DOUYIN_PUSH_LIST_LOOKBACK_COUNT, typeMode: 'strict' }),
                    `获取用户 ${item.remark ?? sec_uid} 喜欢列表`
                  )
                  if (favoritelist.data.aweme_list.length === 0) logger.warn(`${item.remark}(${item.short_id}) 获取到的喜欢列表数量为零！此博主可能未公开他/她的喜欢列表`)
                  contentList = favoritelist.data.aweme_list || []
                  break
                case 'recommend':
                  listName = '推荐列表'
                  if (this.browserUserPageCache.has(sec_uid)) {
                    logger.warn(`${item.remark}(${item.short_id}) 已使用浏览器兜底获取用户页，暂不支持继续获取推荐列表，跳过该推送类型`)
                    continue
                  }
                  const recommendlist: DouyinAwemeListResult = await this.withCookieRefreshRetry(
                    () => this.amagi.douyin.fetcher.fetchUserRecommendList({ sec_uid, number: DOUYIN_PUSH_LIST_LOOKBACK_COUNT, typeMode: 'strict' }),
                    `获取用户 ${item.remark ?? sec_uid} 推荐列表`
                  )
                  if (recommendlist.data.aweme_list.length === 0) logger.warn(`${item.remark}(${item.short_id}) 获取到的推荐列表数量为零！此博主可能未公开他/她的推荐列表`)
                  contentList = recommendlist.data.aweme_list || []
                  break
              }
            } catch (error) {
              if (pushType === 'favorite' || pushType === 'recommend') {
                logger.warn(`${item.remark}(${item.short_id}) 获取${listName || pushType}失败，已跳过该推送类型：${error instanceof Error ? error.message : String(error)}`)
                continue
              }

              throw error
            }

            logger.debug(`获取到 ${item.remark} 的${listName}，共 ${contentList.length} 条`)
            logger.info(`[DouYinPush] 获取到用户 ${item.remark ?? sec_uid} 的${listName}：${contentList.length} 条`)

            // 根据推送类型调用不同的处理函数
            if (contentList.length > 0) {
              let pushItems: DouyinPushItem[] = []
              switch (pushType) {
                case 'post':
                  pushItems = await processPostList(contentList, sec_uid, userinfo, item, targets, this.force)
                  break
                case 'favorite':
                  pushItems = await processFavoriteList(contentList, sec_uid, userinfo, item, targets, this.force)
                  break
                case 'recommend':
                  pushItems = await processRecommendList(contentList, sec_uid, userinfo, item, targets, this.force)
                  break
              }

              // 将返回的推送项添加到willbepushlist中
              logger.info(`[DouYinPush] 用户 ${item.remark ?? sec_uid} 的${listName}筛选后待推送 ${pushItems.length} 条`)
              if (pushItems.length === 0) {
                logger.info(`[DouYinPush] 用户 ${item.remark ?? sec_uid} 的${listName}没有新增推送项，通常是作品超过 24 小时或目标群已推送过`)
              }
              for (const pushItem of pushItems) {
                const key = `${pushType}_${pushItem.sec_uid}_${pushItem.Detail_Data.aweme_id}`
                willbepushlist[key] = pushItem
              }
            } else {
              logger.info(`[DouYinPush] 用户 ${item.remark ?? sec_uid} 的${listName || pushType}返回空列表，不会生成待推送项`)
            }
          }

          const afterUserPushCount = Object.keys(willbepushlist).length
          logger.info(`[DouYinPush] 用户 ${item.remark ?? sec_uid} 检查结束：本用户新增待推送 ${afterUserPushCount - beforeUserPushCount} 项，累计待推送 ${afterUserPushCount} 项`)
        } catch (error) {
          logger.warn(`[DouYinPush] 用户 ${item.remark ?? sec_uid} 本轮检查失败，已跳过该用户并继续后续订阅：${error instanceof Error ? error.message : String(error)}`)
        }
      }
    } catch (error) {
      throw new Error(`获取抖音用户内容列表失败: ${error}`)
    }

    logger.info(`[DouYinPush] 动态列表汇总完成：待推送 ${Object.keys(willbepushlist).length} 项`)
    return willbepushlist
  }

  /**
 * 检查作品是否已经推送过
 * @param aweme_id 作品ID
 * @param sec_uid 用户sec_uid
 * @param groupIds 群组ID列表
 * @param pushType 推送类型
 * @returns 是否已经推送过
 */
  async checkIfAlreadyPushed (aweme_id: string, sec_uid: string, groupIds: string[], pushType: string = 'post'): Promise<boolean> {
    for (const groupId of groupIds) {
      const isPushed = await douyinDB.isAwemePushed(aweme_id, sec_uid, groupId, pushType)
      if (!isPushed) {
        return false
      }
    }
    return true
  }

  /**
   * 设置或更新特定 sec_uid 的群组信息。
   * @param data 抖音的搜索结果数据。需要接口返回的原始数据
   * @returns 操作成功或失败的消息字符串。
   */
  async setting (data: DouyinSearchInfo): Promise<void> {
    const groupInfo = await this.e.bot.getGroupInfo('groupId' in this.e && this.e.groupId ? this.e.groupId : '')
    const config = Config.pushlist // 读取配置文件
    const groupId = 'groupId' in this.e && this.e.groupId ? this.e.groupId : ''
    const botId = this.e.selfId

    try {
      // 获取用户输入的抖音号
      const inputDouyinId = this.e.msg.replace(/^#设置抖音推送/, '').trim()

      // 在用户列表中查找匹配的用户
      let matchedUser = null
      for (const userItem of data.user_list ?? []) {
        const currentDouyinId = userItem.user_info.unique_id === '' ? userItem.user_info.short_id : userItem.user_info.unique_id
        if (currentDouyinId === inputDouyinId) {
          matchedUser = userItem.user_info
          break
        }
      }

      // 如果没找到匹配的用户，抛出错误
      if (!matchedUser) {
        throw new Error(`未找到抖音号为 ${inputDouyinId} 的用户`)
      }

      // 使用匹配到的用户的 sec_uid 进行下一步请求
      const sec_uid = matchedUser.sec_uid
      const UserInfoData = await this.fetchUserProfileWithFallback(sec_uid, `设置推送时获取用户 ${sec_uid} 主页`)

      /** 处理抖音号 */
      let user_shortid
      UserInfoData.data.user.unique_id === '' ? (user_shortid = UserInfoData.data.user.short_id) : (user_shortid = UserInfoData.data.user.unique_id)

      // 初始化 douyin 数组
      config.douyin ??= []

      // 查找是否存在相同的 sec_uid
      const existingItem = config.douyin.find((item: { sec_uid: string }) => item.sec_uid === sec_uid)

      // 检查数据库中是否已订阅
      const isSubscribed = await douyinDB.isSubscribed(sec_uid, groupId)

      if (existingItem) {
        // 如果已经存在相同的 sec_uid，则检查是否存在相同的 group_id
        let has = false
        let groupIndexToRemove = -1 // 用于记录要删除的 group_id 对象的索引
        for (let index = 0; index < existingItem.group_id.length; index++) {
          // 分割每个对象的 id 属性，并获取第一部分
          const item = existingItem.group_id[index]
          const existingGroupId = item.split(':')[0]

          // 检查分割后的第一部分是否与提供的 group_id 相同
          if (existingGroupId === String(groupId)) {
            has = true
            groupIndexToRemove = index
            break // 找到匹配项后退出循环
          }
        }

        if (has) {
          // 如果存在相同的 group_id，则删除它
          existingItem.group_id.splice(groupIndexToRemove, 1)

          // 同时从数据库中取消订阅
          if (isSubscribed) {
            await douyinDB.unsubscribeDouyinUser(groupId, sec_uid)
          }

          // 如果删除后 group_id 数组为空，则删除整个属性
          if (existingItem.group_id.length === 0) {
            const index = config.douyin.indexOf(existingItem)
            config.douyin.splice(index, 1)
          }

          // 保存配置到文件
          Config.Modify('pushlist', 'douyin', config.douyin)
          await this.e.reply(`群：${groupInfo.groupName}(${groupId})\n删除成功！${UserInfoData.data.user.nickname}\n抖音号：${user_shortid}`)
          logger.info(`\n删除成功！${UserInfoData.data.user.nickname}\n抖音号：${user_shortid}\nsec_uid${UserInfoData.data.user.sec_uid}`)
        } else {
          // 否则，将新的 group_id 添加到该 sec_uid 对应的数组中
          existingItem.group_id.push(`${groupId}:${botId}`)

          // 确保 pushTypes 字段存在，如果不存在则添加默认值
          if (!existingItem.pushTypes || existingItem.pushTypes.length === 0) {
            existingItem.pushTypes = ['post', 'live']
          }

          // 同时在数据库中添加订阅
          if (!isSubscribed) {
            await douyinDB.subscribeDouyinUser(groupId, botId, sec_uid, user_shortid, UserInfoData.data.user.nickname)
          }

          // 保存配置到文件
          Config.Modify('pushlist', 'douyin', config.douyin)
          await this.e.reply(`群：${groupInfo.groupName}(${groupId})\n添加成功！${UserInfoData.data.user.nickname}\n抖音号：${user_shortid}`)
          if (Config.douyin.push.switch === false) await this.e.reply('请发送「#设置抖音推送开启」以进行推送')
          logger.info(`\n设置成功！${UserInfoData.data.user.nickname}\n抖音号：${user_shortid}\nsec_uid${UserInfoData.data.user.sec_uid}`)
        }
      } else {
        // 如果不存在相同的 sec_uid，则新增一个属性
        config.douyin.push({
          switch: true,
          sec_uid,
          group_id: [`${groupId}:${botId}`],
          remark: UserInfoData.data.user.nickname,
          short_id: user_shortid,
          pushTypes: ['post', 'live']
        })

        // 同时在数据库中添加订阅
        if (!isSubscribed) {
          await douyinDB.subscribeDouyinUser(groupId, botId, sec_uid, user_shortid, UserInfoData.data.user.nickname)
        }

        // 保存配置到文件
        Config.Modify('pushlist', 'douyin', config.douyin)
        await this.e.reply(`群：${groupInfo.groupName}(${groupId})\n添加成功！${UserInfoData.data.user.nickname}\n抖音号：${user_shortid}`)
        if (Config.douyin.push.switch === false) await this.e.reply('请发送「#设置抖音推送开启」以进行推送')
        logger.info(`\n设置成功！${UserInfoData.data.user.nickname}\n抖音号：${user_shortid}\nsec_uid${UserInfoData.data.user.sec_uid}`)
      }

      await this.renderPushList()
    } catch (error) {
      throw new Error(`设置失败，请查看日志: ${error}`)
    }
  }

  /** 渲染推送列表图片 */
  async renderPushList (): Promise<void> {
    await this.syncConfigToDatabase()
    const groupInfo = await this.e.bot.getGroupInfo('groupId' in this.e && this.e.groupId ? this.e.groupId : '')

    // 获取当前群组的所有订阅
    const subscriptions = await douyinDB.getGroupSubscriptions(groupInfo.groupId)

    if (subscriptions.length === 0) {
      await this.e.reply(`当前群：${groupInfo.groupName}(${groupInfo.groupId})\n没有设置任何抖音博主推送！\n可使用「#设置抖音推送 + 抖音号」进行设置`)
      return
    }

    const renderOpt: DouyinUserListRenderItem[] = []

    for (const subscription of subscriptions) {
      const sec_uid = subscription.sec_uid
      const userInfo = await this.fetchUserProfileWithFallback(sec_uid, `渲染推送列表时获取用户 ${sec_uid} 主页`)

      // 查找配置文件中对应的全局开关状态
      const configItem = Config.pushlist.douyin?.find((item: douyinPushItem) => item.sec_uid === sec_uid)
      const switchStatus = configItem?.switch !== false // 默认为 true
      const pushTypes = configItem?.pushTypes || ['post']

      renderOpt.push({
        avatar_img: userInfo.data.user.avatar_larger.url_list[0],
        username: userInfo.data.user.nickname,
        short_id: userInfo.data.user.unique_id === '' ? userInfo.data.user.short_id : userInfo.data.user.unique_id,
        fans: this.count(userInfo.data.user.follower_count),
        total_favorited: this.count(userInfo.data.user.total_favorited),
        following_count: this.count(userInfo.data.user.following_count),
        switch: switchStatus,
        pushTypes
      })
    }
    const img = await Render(this.e, 'douyin/userlist', {
      renderOpt,
      groupInfo: {
        groupId: groupInfo.groupId || '',
        groupName: groupInfo.groupName || '',
        groupAvatar: groupInfo.avatar || ''
      }
    })
    await sendRenderedImagesToContact(this.e, img, {
      sendDirect: async (images) => await this.e.reply(images)
    })
  }

  /**
   * 强制推送
   * @param data 处理完成的推送列表
   */
  async forcepush (data: WillBePushList): Promise<boolean> {
    const currentGroupId = 'groupId' in this.e && this.e.groupId ? this.e.groupId : ''
    const currentBotId = this.e.selfId
    const inputCount = Object.keys(data).length
    logger.info(`[DouYinPush] 强制推送入口：输入待推送 ${inputCount} 项，当前群 ${currentGroupId || '未知'}，当前Bot ${currentBotId || '未知'}，全部=${this.e.msg.includes('全部')}`)

    // 如果不是全部强制推送，需要过滤数据
    if (!this.e.msg.includes('全部')) {
      // 获取当前群组订阅的所有抖音用户
      const subscriptions = await douyinDB.getGroupSubscriptions(currentGroupId)
      const subscribedUids = subscriptions.map(sub => sub.sec_uid)
      logger.info(`[DouYinPush] 强制推送当前群订阅 ${subscriptions.length} 项`)

      // 创建一个新的推送列表，只包含当前群组订阅的用户的作品
      const filteredData: WillBePushList = {}

      for (const awemeId in data) {
        // 检查该作品的用户是否被当前群组订阅
        if (subscribedUids.includes(data[awemeId].sec_uid)) {
          // 复制该作品到过滤后的列表，并将目标设置为当前群组
          filteredData[awemeId] = {
            ...data[awemeId],
            targets: [{
              groupId: currentGroupId,
              botId: currentBotId
            }]
          }
        }
      }

      // 使用过滤后的数据进行推送
      logger.info(`[DouYinPush] 强制推送过滤完成：输入 ${inputCount} 项，当前群可推送 ${Object.keys(filteredData).length} 项`)
      return await this.getdata(filteredData)
    } else {
      // 全部强制推送，保持原有逻辑
      logger.info(`[DouYinPush] 全部强制推送：发送 ${inputCount} 项`)
      return await this.getdata(data)
    }
  }

  /**
 * 检查并更新备注信息
 */
  async checkremark () {
    // 读取配置文件内容
    const config = Config.pushlist
    const updateList: { sec_uid: string }[] = []

    if (!Config.pushlist.douyin || Config.pushlist.douyin.length === 0) {
      logger.warn('[DouYinPush] 备注检查发现推送列表为空')
      return true
    }

    // 遍历配置文件中的用户列表，收集需要更新备注信息的用户
    for (const i of Config.pushlist.douyin) {
      const remark = i.remark
      const sec_uid = i.sec_uid

      if (remark === undefined || remark === '') {
        updateList.push({ sec_uid })
      }
    }
    logger.info(`[DouYinPush] 备注检查：订阅 ${Config.pushlist.douyin.length} 项，需要补全备注 ${updateList.length} 项`)

    // 如果有需要更新备注的用户，则逐个获取备注信息并更新到配置文件中
    if (updateList.length > 0) {
      for (const i of updateList) {
        logger.info(`[DouYinPush] 正在补全备注：${i.sec_uid}`)
        // 从外部数据源获取用户备注信息
        const userinfo = await this.fetchUserProfileWithFallback(i.sec_uid, `更新备注时获取用户 ${i.sec_uid} 主页`)
        const remark = userinfo.data.user.nickname

        // 在配置文件中找到对应的用户，并更新其备注信息
        const matchingItemIndex = config.douyin.findIndex((item: { sec_uid: string }) => item.sec_uid === i.sec_uid)
        if (matchingItemIndex !== -1) {
          config.douyin[matchingItemIndex].remark = remark
        }
      }

      // 将更新后的配置文件内容写回文件
      Config.Modify('pushlist', 'douyin', config.douyin)
      logger.info(`[DouYinPush] 备注补全完成：已更新 ${updateList.length} 项`)
    }

    return false
  }

  /**
   * 处理作品描述
   */
  desc (Detail_Data: any, desc: string) {
    if (desc === '') {
      return '该作品没有描述'
    }
    return desc
  }

  /**
   * 格式化数字
   */
  count (num: number) {
    if (num > 10000) {
      return (num / 10000).toFixed(1) + '万'
    }
    return num.toString()
  }
}

/**
* 判断标题是否有屏蔽词或屏蔽标签
* @param PushItem 推送项
* @returns 是否应该跳过推送
*/
const skipDynamic = async (PushItem: DouyinPushItem): Promise<boolean> => {
  // 如果是直播动态，不跳过
  if ('liveStatus' in PushItem.Detail_Data) {
    return false
  }

  const tags: string[] = []

  // 提取标签
  if (PushItem.Detail_Data.text_extra) {
    for (const item of PushItem.Detail_Data.text_extra) {
      if (item.hashtag_name) {
        tags.push(item.hashtag_name)
      }
    }
  }

  logger.debug(`检查作品是否需要过滤：${PushItem.Detail_Data.share_url}`)
  const shouldFilter = await douyinDB.shouldFilter(PushItem, tags)
  logger.info(`[DouYinPush] 过滤检查：作品 ${PushItem.Detail_Data.aweme_id ?? PushItem.Detail_Data.share_url ?? 'unknown'}，标签 ${tags.length} 个，结果=${shouldFilter ? '跳过' : '发送'}`)
  return shouldFilter
}
