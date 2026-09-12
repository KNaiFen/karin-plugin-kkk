import { format, fromUnixTime } from 'date-fns'
import karin, { logger } from 'node-karin'

import { Common, Networks, Render, replyRenderedImages } from '@/module'
import { bilibiliDB, douyinDB } from '@/module/db'
import { bilibiliFetcher, douyinFetcher } from '@/module/utils/amagiClient'
import { Config } from '@/module/utils/Config'
import { wrapWithErrorHandler } from '@/module/utils/ErrorHandler'
import { waitForPushJitter } from '@/module/utils/PushTaskJitter'
import { Bilibilipush, DouYinpush, getBilibiliID, getDouyinID } from '@/platform'
import { formatBilibiliPushRiskCooldownRemaining, getBilibiliPushRiskCooldownState } from '@/platform/bilibili/pushRiskCooldown'
import { normalizeDouyinArticleContent } from '@/platform/douyin/articleContent'
import { buildDouyinLongTextWorkData, shouldUseDouyinLongTextCard } from '@/platform/douyin/longTextCard'
import { getDouyinShareableVideoUrl, getWorkCoverUrl, getWorkTypeInfo } from '@/platform/douyin/workType'

type LegacyBilibiliDynamicCardResponse = {
  data?: {
    card?: {
      desc?: {
        uid?: string | number
        type?: string
      }
    }
  }
}

let douyinPushRunning = false
let douyinPushPending = false

const runDouyinPushOnce = async (isCatchUpRun: boolean = false): Promise<void> => {
  const startTime = Date.now()
  logger.info(`[DouYinPush] ${isCatchUpRun ? '合并补跑' : '定时任务'}入口：switch=${Config.douyin.push.switch}，cron=${Config.douyin.push.cron}，jitterSeconds=${Config.douyin.push.jitterSeconds ?? 0}`)
  const jitterDelayMs = await waitForPushJitter({
    label: 'DouYinPush',
    jitterSeconds: Config.douyin.push.jitterSeconds,
    logger
  })
  const actionStartTime = Date.now()
  const result = await new DouYinpush().action()
  logger.info(`[DouYinPush] ${isCatchUpRun ? '合并补跑' : '定时任务'}出口：result=${String(result)}，随机延迟 ${jitterDelayMs}ms，执行耗时 ${Date.now() - actionStartTime}ms，总耗时 ${Date.now() - startTime}ms`)
}

// 框架默认策略允许重复触发；在这里合并重入，既避免并发推送也不直接丢弃整轮检查。
const handleDouyinPush = wrapWithErrorHandler(async () => {
  if (douyinPushRunning) {
    douyinPushPending = true
    logger.info('[DouYinPush] 定时任务仍在执行，本次触发已合并为当前轮结束后的补跑')
    return true
  }

  douyinPushRunning = true
  try {
    await runDouyinPushOnce()
    if (douyinPushPending) {
      douyinPushPending = false
      logger.info('[DouYinPush] 执行合并补跑，补偿运行期间错过的定时触发')
      await runDouyinPushOnce(true)
    }
  } finally {
    douyinPushRunning = false
  }

  return true
}, {
  businessName: '抖音推送任务'
})

// 包装B站推送任务
const handleBilibiliPush = wrapWithErrorHandler(async () => {
  const startTime = Date.now()
  logger.info(`[BilibiliPush] 定时任务入口：switch=${Config.bilibili.push.switch}，cron=${Config.bilibili.push.cron}，jitterSeconds=${Config.bilibili.push.jitterSeconds ?? 0}`)
  const jitterDelayMs = await waitForPushJitter({
    label: 'BilibiliPush',
    jitterSeconds: Config.bilibili.push.jitterSeconds,
    logger
  })
  const actionStartTime = Date.now()
  const result = await new Bilibilipush().action()
  logger.info(`[BilibiliPush] 定时任务出口：result=${String(result)}，随机延迟 ${jitterDelayMs}ms，执行耗时 ${Date.now() - actionStartTime}ms，总耗时 ${Date.now() - startTime}ms`)
  return true
}, {
  businessName: 'B站推送任务'
})

// 包装强制推送命令
const handleForcePush = wrapWithErrorHandler(async (e) => {
  if (e.msg.includes('抖音')) {
    await new DouYinpush(e, true).action()
    return true
  } else if (e.msg.includes('B站')) {
    const cooldownState = await getBilibiliPushRiskCooldownState()
    if (cooldownState.inCooldown) {
      await e.reply(`当前处于风控冷却中，剩余 ${formatBilibiliPushRiskCooldownRemaining(cooldownState.remainingMs)}`, { reply: true })
      return true
    }
    await new Bilibilipush(e, true).action()
    return true
  }
  return true
}, {
  businessName: '强制推送'
})

// 包装设置抖音推送命令
const handleSetDouyinPush = wrapWithErrorHandler(async (e) => {
  const query = e.msg.replace(/^#设置抖音推送/, '').trim()

  // 检查是否是开启/关闭命令
  if (query === '开启' || query === '关闭') {
    const enable = query === '开启'
    Config.Modify('douyin', 'push.switch', enable)
    await e.reply(`抖音推送已${enable ? '开启' : '关闭'}，${enable ? '需要重启后生效' : '将在下次重启后停止推送'}`)
    logger.info(`抖音推送已${enable ? '开启' : '关闭'}`)
    return true
  }

  // 原有的订阅逻辑
  const data = await douyinFetcher.searchContent({
    query,
    type: 'user',
    typeMode: 'strict'
  })
  await new DouYinpush(e).setting(data.data)
  return true
}, {
  businessName: '设置抖音推送'
})

// 包装设置B站推送命令
const handleSetBilibiliPush = wrapWithErrorHandler(async (e) => {
  const query = e.msg.replace(/^#设置[bB]站推送/, '').replace(/^(?:[Uu][Ii][Dd]:)?/, '').trim()

  // 检查是否是开启/关闭命令
  if (query === '开启' || query === '关闭') {
    const enable = query === '开启'
    Config.Modify('bilibili', 'push.switch', enable)
    await e.reply(`B站推送已${enable ? '开启' : '关闭'}，${enable ? '需要重启后生效' : '将在下次重启后停止推送'}`)
    logger.info(`B站推送已${enable ? '开启' : '关闭'}`)
    return true
  }

  // 原有的订阅逻辑
  if (!Config.cookies.bilibili) {
    await e.reply('\n请先配置B站Cookie', { at: true })
    return true
  }
  const match = /^(\d+)$/.exec(query)
  if (match && match[1]) {
    const data = await bilibiliFetcher.fetchUserCard({
      host_mid: Number(match[1]),
      typeMode: 'strict'
    })
    await new Bilibilipush(e).setting(data.data)
  }
  return true
}, {
  businessName: '设置B站推送'
})

// 包装推送列表命令
const handleBilibiliPushList = wrapWithErrorHandler(async (e) => {
  await new Bilibilipush(e).renderPushList()
}, {
  businessName: 'B站推送列表'
})

const handleDouyinPushList = wrapWithErrorHandler(async (e) => {
  await new DouYinpush(e).renderPushList()
}, {
  businessName: '抖音推送列表'
})

// 包装设置机器人ID命令
const handleChangeBotID = wrapWithErrorHandler(async (e) => {
  const newBotId = e.msg.replace(/^#kkk设置推送机器人/, '')

  // 更新抖音配置和数据库
  const newDouyinlist = Config.pushlist.douyin.map(item => {
    const modifiedGroupIds = item.group_id.map(groupId => {
      const [group_id, oldBotId] = groupId.split(':')
      // 更新数据库中的botId
      if (oldBotId && oldBotId !== newBotId) {
        douyinDB.updateGroupBotId(group_id, oldBotId, newBotId).catch(err => {
          logger.error(`Failed to update douyin group ${group_id}:`, err)
        })
      }
      return `${group_id}:${newBotId}`
    })
    return {
      ...item,
      group_id: modifiedGroupIds
    }
  })

  // 更新B站配置和数据库
  const newBilibililist = Config.pushlist.bilibili.map(item => {
    const modifiedGroupIds = item.group_id.map(groupId => {
      const [group_id, oldBotId] = groupId.split(':')
      // 更新数据库中的botId
      if (oldBotId && oldBotId !== newBotId) {
        bilibiliDB.updateGroupBotId(group_id, oldBotId, newBotId).catch(err => {
          logger.error(`Failed to update bilibili group ${group_id}:`, err)
        })
      }
      return `${group_id}:${newBotId}`
    })
    return {
      ...item,
      group_id: modifiedGroupIds
    }
  })

  Config.Modify('pushlist', 'douyin', newDouyinlist)
  Config.Modify('pushlist', 'bilibili', newBilibililist)
  await e.reply('推送机器人已修改为' + newBotId)
  return true
}, {
  businessName: '设置推送机器人'
})

// 包装测试推送命令
const handleTestDouyinPush = wrapWithErrorHandler(async (e) => {
  const url = String(e.msg.match(/(http|https):\/\/.*\.(douyin|iesdouyin)\.com\/[^ ]+/g))
  const iddata = await getDouyinID(e, url)
  const workInfo = await douyinFetcher.parseWork({ aweme_id: iddata.aweme_id, typeMode: 'strict' })

  const realUrl = Config.douyin.push.shareType === 'web' && await new Networks({
    url: workInfo.data.aweme_detail.share_url,
    headers: {
      'User-Agent': 'Apifox/1.0.0 (https://apifox.com)',
      Accept: '*/*',
      'Accept-Encoding': 'gzip, deflate, br',
      Connection: 'keep-alive'
    }
  }).getLocation()

  // 获取作品类型信息
  const workTypeInfo = getWorkTypeInfo(workInfo.data.aweme_detail)

  // 获取封面 URL
  const coverUrl = getWorkCoverUrl(workTypeInfo, workInfo.data.aweme_detail as any)

  // 如果是文章类型，使用文章模板
  if (workTypeInfo.isArticle) {
    const userProfile = await douyinFetcher.fetchUserProfile({ sec_uid: workInfo.data.aweme_detail.author.sec_uid, typeMode: 'strict' })
    const article = normalizeDouyinArticleContent(workInfo.data.aweme_detail as Record<string, any>)

    const img = await Render(e, 'douyin/article-work', {
      title: article.title,
      markdown: article.markdownOrText,
      images: article.images,
      read_time: article.readTime,

      // 互动数据
      dianzan: Common.count(workInfo.data.aweme_detail.statistics.digg_count),
      pinglun: Common.count(workInfo.data.aweme_detail.statistics.comment_count),
      shouchang: Common.count(workInfo.data.aweme_detail.statistics.collect_count),
      share: Common.count(workInfo.data.aweme_detail.statistics.share_count),

      // 时间信息
      create_time: format(fromUnixTime(workInfo.data.aweme_detail.create_time), 'yyyy-MM-dd HH:mm'),

      // 用户信息
      avater_url: 'https://p3-pc.douyinpic.com/aweme/1080x1080/' + userProfile.data.user.avatar_larger.uri,
      username: workInfo.data.aweme_detail.author.nickname,
      抖音号: userProfile.data.user.unique_id === '' ? userProfile.data.user.short_id : userProfile.data.user.unique_id,
      获赞: Common.count(userProfile.data.user.total_favorited),
      关注: Common.count(userProfile.data.user.following_count),
      粉丝: Common.count(userProfile.data.user.follower_count),

      // 分享链接
      share_url: workInfo.data.aweme_detail.share_url,

      // 主题
      useDarkTheme: false
    })

    await replyRenderedImages(e, img)
    return true
  }

  if (shouldUseDouyinLongTextCard(workInfo.data.aweme_detail as Record<string, any>)) {
    let profile: Record<string, any> | undefined
    try {
      const userProfile = await douyinFetcher.fetchUserProfile({ sec_uid: workInfo.data.aweme_detail.author.sec_uid, typeMode: 'strict' })
      profile = userProfile.success ? userProfile.data.user : undefined
    } catch {
      logger.warn('[DouYinPush] 用户主页资料获取失败，测试推送长文本卡将使用作品内作者信息')
    }

    const shareUrl = Config.douyin.push.shareType === 'web'
      ? (typeof realUrl === 'string' ? realUrl : workInfo.data.aweme_detail.share_url)
      : getDouyinShareableVideoUrl(workInfo.data.aweme_detail.video)
    const img = await Render(e, 'douyin/long-text-work', buildDouyinLongTextWorkData(
      workInfo.data.aweme_detail as Record<string, any>,
      {
        profile,
        createTime: format(fromUnixTime(workInfo.data.aweme_detail.create_time), 'yyyy-MM-dd HH:mm'),
        shareUrl,
        dynamicType: '测试推送'
      }
    ))

    await replyRenderedImages(e, img)
    return true
  }

  const userProfile = await douyinFetcher.fetchUserProfile({ sec_uid: workInfo.data.aweme_detail.author.sec_uid, typeMode: 'strict' })
  const img = await Render(e, workTypeInfo.templatePath, {
    image_url: coverUrl,
    desc: workInfo.data.aweme_detail.desc,
    dianzan: Common.count(workInfo.data.aweme_detail.statistics.digg_count),
    pinglun: Common.count(workInfo.data.aweme_detail.statistics.comment_count),
    share: Common.count(workInfo.data.aweme_detail.statistics.share_count),
    shouchang: Common.count(workInfo.data.aweme_detail.statistics.collect_count),
    create_time: format(fromUnixTime(workInfo.data.aweme_detail.create_time), 'yyyy-MM-dd HH:mm'),
    avater_url: 'https://p3-pc.douyinpic.com/aweme/1080x1080/' + userProfile.data.user.avatar_larger.uri,
    share_url: Config.douyin.push.shareType === 'web' ? realUrl : getDouyinShareableVideoUrl(workInfo.data.aweme_detail.video),
    username: workInfo.data.aweme_detail.author.nickname,
    抖音号: userProfile.data.user.unique_id === '' ? userProfile.data.user.short_id : userProfile.data.user.unique_id,
    粉丝: Common.count(userProfile.data.user.follower_count),
    获赞: Common.count(userProfile.data.user.total_favorited),
    关注: Common.count(userProfile.data.user.following_count),
    cooperation_info: (() => {
      const raw = workInfo.data.aweme_detail.cooperation_info
      if (!raw) return undefined

      const rawCreators = Array.isArray(raw.co_creators) ? raw.co_creators : []

      // 作者标识，用于对比是否在共创列表中
      const author = workInfo.data.aweme_detail.author
      const authorUid = author?.uid
      const authorSecUid = author?.sec_uid
      const authorNickname = author?.nickname

      const authorInCreators = rawCreators.some((c: { uid: string; sec_uid: string; nickname: string }) =>
        (authorUid && c.uid && c.uid === authorUid) ||
        (authorSecUid && c.sec_uid && c.sec_uid === authorSecUid) ||
        (authorNickname && c.nickname && c.nickname === authorNickname)
      )

      // 只保留：头像链接一条、名字、职位（使用 avatar_url 字段）
      const co_creators = rawCreators.map((c: { avatar_thumb: { url_list: (string | undefined)[]; uri: any }; nickname: any; role_title: any }) => {
        const firstUrl =
          c.avatar_thumb?.url_list?.[0] ??
          (c.avatar_thumb?.uri ? `https://p3.douyinpic.com/${c.avatar_thumb.uri}` : undefined)

        return {
          avatar_url: firstUrl,
          nickname: c.nickname,
          role_title: c.role_title
        }
      })

      // 基础人数取接口给的 co_creator_nums 与列表长度的较大值
      const baseCount = Math.max(Number(raw.co_creator_nums || 0), co_creators.length)
      const teamCount = baseCount + (authorInCreators ? 0 : 1)

      return {
        co_creator_nums: teamCount,
        co_creators
      }
    })()
  })

  await replyRenderedImages(e, img)
  return true
}, {
  businessName: '测试抖音推送'
})

// 包装全局忽略命令
const handleGlobalIgnore = wrapWithErrorHandler(async (e) => {
  const url = e.msg.replace(/^#kkk推送全局忽略/, '').trim()

  if (!url) {
    await e.reply('请提供链接')
    return true
  }

  // 判断平台
  const isDouyin = /(douyin|iesdouyin)\.com/.test(url)
  const isBilibili = /bilibili\.com/.test(url)

  if (!isDouyin && !isBilibili) {
    await e.reply('暂不支持该平台链接')
    return true
  }

  if (isDouyin) {
    const idData = await getDouyinID(e, url, false)
    if (!idData.aweme_id) {
      await e.reply('无法解析该抖音链接')
      return true
    }

    // 获取作品详情以获取 sec_uid
    const workInfo = await douyinFetcher.parseWork({ aweme_id: idData.aweme_id, typeMode: 'strict' })
    const sec_uid = workInfo.data?.aweme_detail?.author?.sec_uid

    if (!sec_uid) {
      await e.reply('无法获取该作品作者信息')
      return true
    }

    // 检查该作者是否在订阅配置中
    const subscribedItem = Config.pushlist.douyin?.find((item: any) => item.sec_uid === sec_uid)
    if (!subscribedItem) {
      await e.reply('该作品对应的博主未在推送订阅中，跳过')
      return true
    }

    // 获取所有订阅该作者的群组
    const groupIds = subscribedItem.group_id.map((g: string) => g.split(':')[0])

    // 将作品缓存写入所有订阅群组
    for (const groupId of groupIds) {
      await douyinDB.addAwemeCache(idData.aweme_id, sec_uid, groupId, 'post')
    }

    await e.reply(`已忽略抖音作品 ${idData.aweme_id}，共 ${groupIds.length} 个群组的推送标记为已处理`)
    logger.info(`全局忽略抖音作品 ${idData.aweme_id}，博主 sec_uid: ${sec_uid}`)
    return true
  }

  if (isBilibili) {
    const idData = await getBilibiliID(url)
    if (!idData.dynamic_id) {
      await e.reply('无法解析该B站链接或该链接不是动态链接')
      return true
    }

    // 获取动态详情以获取 host_mid
    const dynamicInfo = await bilibiliFetcher.fetchDynamicCard({ dynamic_id: idData.dynamic_id, typeMode: 'strict' })
    const dynamicCard = dynamicInfo.data as unknown as LegacyBilibiliDynamicCardResponse
    const host_mid = dynamicCard.data?.card?.desc?.uid

    if (!host_mid) {
      await e.reply('无法获取该动态作者信息')
      return true
    }

    // 检查该UP主是否在订阅配置中
    const subscribedItem = Config.pushlist.bilibili?.find((item: any) => item.host_mid === Number(host_mid))
    if (!subscribedItem) {
      await e.reply('该动态对应的UP主未在推送订阅中，跳过')
      return true
    }

    // 获取所有订阅该UP主的群组
    const groupIds = subscribedItem.group_id.map((g: string) => g.split(':')[0])
    const dynamicType = dynamicCard.data?.card?.desc?.type ?? 'DYNAMIC_TYPE_WORD'

    // 将动态缓存写入所有订阅群组
    for (const groupId of groupIds) {
      await bilibiliDB.addDynamicCache(idData.dynamic_id, Number(host_mid), groupId, String(dynamicType))
    }

    await e.reply(`已忽略B站动态 ${idData.dynamic_id}，共 ${groupIds.length} 个群组的推送标记为已处理`)
    logger.info(`全局忽略B站动态 ${idData.dynamic_id}，UP主 host_mid: ${host_mid}`)
    return true
  }

  return true
}, {
  businessName: '推送全局忽略'
})

// 注册任务和命令
export const douyinPush = Config.douyin.push.switch && karin.task('抖音推送', Config.douyin.push.cron, handleDouyinPush, { log: true })

export const bilibiliPush = Config.bilibili.push.switch && karin.task('B站推送', Config.bilibili.push.cron, handleBilibiliPush, { log: true, type: 'skip' })

export const forcePush = karin.command(/#(抖音|B站)(全部)?强制推送/, handleForcePush, { name: '𝑪𝒊𝒂𝒍𝒍𝒐～(∠・ω< )⌒★', perm: 'master', event: 'message.group' })

export const setdyPush = karin.command(/^#设置抖音推送/, handleSetDouyinPush, { name: 'kkk-推送功能-设置', event: 'message.group', perm: Config.douyin.push.permission })

export const setbiliPush = karin.command(/^#设置[bB]站推送/, handleSetBilibiliPush, { name: 'kkk-推送功能-设置', event: 'message.group', perm: Config.bilibili.push.permission })

export const bilibiliPushList = karin.command(/^#?[bB]站推送列表$/, handleBilibiliPushList, { name: 'kkk-推送功能-列表', event: 'message.group' })

export const douyinPushList = karin.command(/^#?抖音推送列表$/, handleDouyinPushList, { name: 'kkk-推送功能-列表', event: 'message.group' })

export const changeBotID = karin.command(/^#kkk设置推送机器人/, handleChangeBotID, { name: 'kkk-推送功能-设置', perm: 'master' })

export const testDouyinPush = karin.command(/^#测试抖音推送\s*(https?:\/\/[^\s]+)?/, handleTestDouyinPush, { name: 'kkk-推送功能-测试', event: 'message.group', perm: Config.douyin.push.permission, priority: -Infinity - 1 })

export const globalIgnore = karin.command(/^#kkk推送全局忽略/, handleGlobalIgnore, { name: 'kkk-推送功能-全局忽略', perm: 'master', event: 'message.group' })
