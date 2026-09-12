import { logger } from 'node-karin'

import { douyinDB } from '@/module'

import type { DouyinPushItem } from './types'

/**
 * 处理直播推送
 * 检测用户是否开播，如果开播则推送
 * @returns 返回需要推送的直播项（如果有）
 */
export async function processLiveStream(
  sec_uid: string,
  userinfo: any,
  item: any,
  targets: Array<{ groupId: string, botId: string }>,
  amagi: any,
  fetchWithRetry: <T = any>(operation: () => Promise<T>, context: string) => Promise<T> = operation => operation(),
  fetchUserProfile: (secUid: string, context: string) => Promise<any> = (targetSecUid, context) => fetchWithRetry(
    () => amagi.douyin.fetcher.fetchUserProfile({
      sec_uid: targetSecUid,
      typeMode: 'strict'
    }),
    context
  )
): Promise<DouyinPushItem | null> {
  const pushType = 'live'

  // 获取缓存的直播状态
  const liveStatus = await douyinDB.getLiveStatus(sec_uid)
  logger.info(`[DouYinPush] 直播检查：用户 ${item.remark ?? sec_uid}，接口 live_status=${userinfo.data.user?.live_status ?? 'unknown'}，缓存 living=${liveStatus.living}`)

  // 检查用户是否正在直播
  if (userinfo.data.user.live_status === 1) {
    logger.info(`[DouYinPush] 用户 ${item.remark ?? sec_uid} 当前标记为直播中，准备获取直播主页详情`)
    const UserInfoData = await fetchUserProfile(
      userinfo.data.user.sec_uid,
      `获取用户 ${item.remark ?? sec_uid} 直播主页`
    )

    if (!UserInfoData.data.user?.live_status || UserInfoData.data.user.live_status !== 1) {
      logger.warn(`[DouYinPush] ${UserInfoData?.data?.user?.nickname ?? item.remark ?? sec_uid} 二次确认未在直播，跳过直播推送`)
      return null
    }
    
    const confirmedUser = UserInfoData.data.user

    if (!confirmedUser.room_data) {
      logger.warn(`[DouYinPush] 用户 ${item.remark ?? sec_uid} 未获取到直播间信息，跳过直播推送`)
      return null
    }

    let room_data: any
    try {
      room_data = typeof confirmedUser.room_data === 'string'
        ? JSON.parse(confirmedUser.room_data)
        : confirmedUser.room_data
    } catch (error) {
      logger.warn(`[DouYinPush] 用户 ${item.remark ?? sec_uid} 直播间 room_data 解析失败，跳过直播推送: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }

    const webRid = String(room_data?.owner?.web_rid ?? '').trim()
    if (!webRid) {
      logger.warn(`[DouYinPush] 用户 ${item.remark ?? sec_uid} 直播间信息缺少 owner.web_rid，跳过直播推送`)
      return null
    }

    const roomId = String(confirmedUser.room_id_str ?? '').trim()
    if (!roomId) {
      logger.warn(`[DouYinPush] 用户 ${item.remark ?? sec_uid} 直播间信息缺少 room_id_str，跳过直播推送`)
      return null
    }

    logger.info(`[DouYinPush] 用户 ${item.remark ?? sec_uid} 直播间信息存在，准备获取 room_id=${roomId}，web_rid=${webRid}`)
    const liveInfo = await fetchWithRetry<any>(
      () => amagi.douyin.fetcher.fetchLiveRoomInfo({
        room_id: roomId,
        web_rid: webRid,
        typeMode: 'strict'
      }),
      `获取用户 ${item.remark ?? sec_uid} 直播间信息`
    )
    logger.info(`[DouYinPush] 用户 ${item.remark ?? sec_uid} 直播间接口获取成功`)

    // 如果之前没有直播，现在开播了，需要推送
    if (!liveStatus.living) {
      logger.info(`用户 ${item.remark ?? sec_uid} 开播了`)

      return {
        remark: item.remark,
        sec_uid,
        create_time: Date.now(),
        targets,
        pushType,
        Detail_Data: {
          user_info: UserInfoData,
          room_data,
          live_data: liveInfo,
          liveStatus: {
            liveStatus: 'open',
            isChanged: true,
            isliving: true
          }
        },
        avatar_img: 'https://p3-pc.douyinpic.com/aweme/1080x1080/' + userinfo.data.user.avatar_larger.uri,
        living: true
      }
    }
    logger.info(`[DouYinPush] 用户 ${item.remark ?? sec_uid} 已处于直播缓存状态，本轮不重复推送开播消息`)
  } else if (liveStatus.living) {
    // 如果之前在直播，现在已经关播，需要更新状态
    await douyinDB.updateLiveStatus(sec_uid, false)
    logger.info(`用户 ${item.remark ?? sec_uid} 已关播，更新直播状态`)
  } else {
    logger.info(`[DouYinPush] 用户 ${item.remark ?? sec_uid} 当前未开播，且缓存不是直播中`)
  }

  return null
}
