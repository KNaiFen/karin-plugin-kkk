import { DyUserInfo, Result } from '@ikenxuan/amagi'
import { format, fromUnixTime } from 'date-fns'
import { logger } from 'node-karin'

import { douyinDB } from '@/module'
import { douyinPushItem } from '@/types/config/pushlist'

import type { DouyinPushItem } from './types'

/**
 * 处理作品列表推送
 * 首次订阅只推送 24 小时内作品，已有推送历史则按缓存补发未处理作品
 * @returns 返回需要推送的作品项数组
 */
export async function processPostList (
  contentList: any[],
  sec_uid: string,
  userinfo: Result<DyUserInfo>,
  item: douyinPushItem,
  targets: Array<{ groupId: string; botId: string }>,
  force: boolean = false
): Promise<DouyinPushItem[]> {
  const pushType = 'post'
  const listName = '作品列表'
  const result: DouyinPushItem[] = []
  let freshCount = 0
  let skippedOldCount = 0
  let skippedPushedCount = 0
  let skippedInitialBaselineTargetCount = 0

  // 首次订阅只接收最近 24 小时的作品，避免补发历史内容；已有推送历史的订阅则以缓存为准，
  // 可在风控、停机或任务延迟恢复后补发仍在本次列表中的未处理作品。
  const groupHistoryStatus = new Map<string, boolean>()
  for (const target of targets) {
    groupHistoryStatus.set(target.groupId, await douyinDB.hasHistory(sec_uid, target.groupId, pushType))
  }

  for (const aweme of contentList) {
    const nowSeconds = Math.floor(Date.now() / 1000)
    const createTime = aweme.create_time
    const timeDifference = nowSeconds - createTime
    const timeDiffHours = Math.round((timeDifference / 3600) * 100) / 100
    const isWithinInitialWindow = timeDifference < 86400

    logger.trace(`
      前期获取该作品基本信息：
      推送类型：${pushType}（${listName}）
      作者：${aweme.author.nickname}
      作品ID：${aweme.aweme_id}
      发布时间：${format(fromUnixTime(aweme.create_time), 'yyyy-MM-dd HH:mm')}
      发布时间戳（s）：${createTime}
      当前时间戳（s）：${nowSeconds}
      时间差（s）：${timeDifference}s (${timeDiffHours}h)
      是否在首次订阅窗口内：${isWithinInitialWindow ? logger.green('true') : logger.red('false')}
      `)

    if (isWithinInitialWindow) freshCount++

    // 过滤掉已经推送过的群组。已建立推送历史的群组以缓存为准，
    // 首次订阅则仅接收 24 小时窗口内作品，并把旧作品记为已读。
    const validTargets: Array<{ groupId: string; botId: string }> = []
    for (const target of targets) {
      const isPushed = await douyinDB.isAwemePushed(aweme.aweme_id, sec_uid, target.groupId, pushType)
      if (isPushed) {
        skippedPushedCount++
        continue
      }

      const hasHistory = groupHistoryStatus.get(target.groupId) ?? false
      if (force || hasHistory || isWithinInitialWindow) {
        validTargets.push(target)
        continue
      }

      skippedOldCount++
      skippedInitialBaselineTargetCount++
      await douyinDB.addAwemeCache(aweme.aweme_id, sec_uid, target.groupId, pushType)
    }

    if (validTargets.length > 0) {
      result.push({
        remark: item.remark,
        sec_uid,
        create_time: aweme.create_time,
        targets: validTargets,
        pushType,
        Detail_Data: {
          ...aweme,
          user_info: userinfo
        },
        avatar_img: 'https://p3-pc.douyinpic.com/aweme/1080x1080/' + userinfo.data.user.avatar_larger.uri,
        living: false
      })
    }
  }

  logger.info(`[DouYinPush] ${item.remark ?? sec_uid} ${listName}筛选汇总：接口返回 ${contentList.length} 条，首次订阅窗口内 ${freshCount} 条，首次订阅跳过旧内容 ${skippedOldCount} 次，已推送目标 ${skippedPushedCount} 次，写入首次订阅基线 ${skippedInitialBaselineTargetCount} 次，最终待推送 ${result.length} 条`)
  return result
}
