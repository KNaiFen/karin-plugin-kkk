import fs from 'node:fs'
import path from 'node:path'

import karin, {
  checkPkgUpdate,
  db,
  hooks,
  logger,
  Message,
  restart,
  restartDirect,
  segment,
  updatePkg
} from 'node-karin'

import { Root } from '@/module'
import { getChangelogImage } from '@/module/utils/changelog'
import { Config } from '@/module/utils/Config'
import { wrapWithErrorHandler } from '@/module/utils/ErrorHandler'
import { getNonConsoleMasters } from '@/module/utils/master'
import { isSemverGreater } from '@/module/utils/semver'

const UPDATE_LOCK_KEY = 'kkk:update:lock'
const UPDATE_MSGID_KEY = 'kkk:update:msgId'
let installedUpdateRestartInFlight = false

const isAutoUpdateEnabled = (): boolean => Config.app.autoUpdate === true
const isAutoRestartOnInstalledUpdateEnabled = (): boolean => Config.app.autoRestartOnInstalledUpdate === true

const buildInstalledPluginPackageJsonCandidates = (): string[] => {
  const candidates: string[] = []
  let current = path.resolve(Root.pluginPath)

  while (true) {
    const pathSegments = current.split(path.sep).filter(Boolean)
    if (path.basename(current) === 'node_modules' && !pathSegments.includes('.pnpm')) {
      candidates.push(path.join(current, Root.pluginName, 'package.json'))
    }

    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  candidates.push(path.join(Root.pluginPath, 'package.json'))
  return [...new Set(candidates)]
}

const getInstalledPluginVersion = (): { version: string | null, sourcePath: string } => {
  let lastError: unknown = null

  for (const packageJsonPath of buildInstalledPluginPackageJsonCandidates()) {
    try {
      const raw = fs.readFileSync(packageJsonPath, 'utf-8')
      const parsed = JSON.parse(raw) as { version?: unknown }
      const version = typeof parsed.version === 'string' && parsed.version.trim().length > 0
        ? parsed.version.trim()
        : null

      return {
        version,
        sourcePath: packageJsonPath
      }
    } catch (error) {
      lastError = error
    }
  }

  if (lastError) {
    throw lastError
  }

  return {
    version: null,
    sourcePath: path.join(Root.pluginPath, 'package.json')
  }
}

const checkInstalledUpdateAndRestart = async (reason: 'startup' | 'scheduled'): Promise<void> => {
  if (!isAutoRestartOnInstalledUpdateEnabled()) return
  if (installedUpdateRestartInFlight) return

  try {
    const { version: installedVersion, sourcePath } = getInstalledPluginVersion()
    if (!installedVersion) {
      logger.warn('[karin-plugin-kkk] 检测已安装版本失败：package.json 未提供有效 version 字段')
      return
    }

    if (reason === 'startup') {
      logger.info(
        `[karin-plugin-kkk] 已安装版本巡检：runtime=${Root.pluginVersion} installed=${installedVersion} source=${sourcePath}`
      )
    }

    if (!isSemverGreater(installedVersion, Root.pluginVersion)) {
      return
    }

    installedUpdateRestartInFlight = true
    logger.info(
      `[karin-plugin-kkk] 检测到已安装新版本，准备自动重启以使其生效：${Root.pluginVersion} -> ${installedVersion}（触发：${reason === 'startup' ? '启动检测' : '定时巡检'}，来源：${sourcePath}）`
    )

    try {
      await restartDirect()
    } catch (error) {
      logger.error(`[karin-plugin-kkk] 已安装新版本自动重启失败：${error instanceof Error ? error.message : String(error)}`)
    }
  } catch (error) {
    logger.warn(`[karin-plugin-kkk] 检测已安装版本失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

const replyAutoUpdateDisabled = (e: Message) => {
  e.reply('自动更新已关闭，请先在前端配置页开启后再使用。', { reply: true })
}

/**
 * 定时更新检测处理器
 * 主动获取 Bot 列表与好友关系，匹配主人可用的 Bot，
 * 渲染更新日志并私聊通知所有主人。
 *
 * @returns 是否继续后续任务
 */
const Handler = async () => {
  if (!isAutoUpdateEnabled()) return true

  // if (process.env.NODE_ENV === 'development') {
  //   return true
  // }

  let upd:
    | { status: 'yes'; local: string; remote: string }
    | { status: 'no'; local: string }
    | { status: 'error'; error: Error }

  try {
    upd = await checkPkgUpdate(Root.pluginName, { compare: 'semver' })
  } catch {
    return true
  }

  // 防守性校验：远程必须严格大于本地，否则视为无更新
  if (upd.status === 'yes' && !isSemverGreater(upd.remote, upd.local)) {
    return true
  }

  if (upd.status !== 'yes') {
    return true
  }

  // 版本提醒锁（检查是否已经推送过相同或更高版本的更新通知）
  try {
    const lockedVersion = await db.get(UPDATE_LOCK_KEY)
    if (typeof lockedVersion === 'string' && lockedVersion.length > 0) {
      // 本地版本达到或超过锁定版本 => 解锁
      if (!isSemverGreater(lockedVersion, Root.pluginVersion)) {
        await db.del(UPDATE_LOCK_KEY)
      } else {
        // 检查远程版本是否比锁定版本更新
        if (!isSemverGreater(upd.remote, lockedVersion)) {
          // 远程版本不比锁定版本新，跳过本次提醒
          return true
        }
        // 远程版本比锁定版本新，继续推送并更新锁定版本
      }
    }
  } catch { }

  // 设置锁为当前远程版本，确保只推送一次
  try {
    await db.set(UPDATE_LOCK_KEY, upd.remote)
  } catch { }

  const masters = getNonConsoleMasters()
  if (masters.length === 0) return true

  const botItems = karin.getAllBotList()
    .filter(b => b.bot.account.name !== 'console')
  if (botItems.length === 0) return true

  // 预取好友列表（并发）
  const friendsMap = new Map<string, Array<{ userId: string }>>()
  await Promise.all(
    botItems.map(async (item) => {
      try {
        const list = await item.bot.getFriendList()
        friendsMap.set(item.bot.account.selfId, list || [])
      } catch {
        friendsMap.set(item.bot.account.selfId, [])
      }
    })
  )

  // 为每个主人选择可用 Bot（好友命中）
  const masterToBot = new Map<string, typeof botItems[number]['bot']>()
  for (const owner of masters) {
    const matched = botItems.find(it => (friendsMap.get(it.bot.account.selfId) || []).some(f => f.userId === owner))
    if (matched) {
      masterToBot.set(owner, matched.bot)
    }
  }

  // 分组渲染：每个 Bot 渲染一次
  const botToImage = new Map<string, Array<ReturnType<typeof segment.image> | ReturnType<typeof segment.text>>>()
  for (const item of botItems) {
    // 仅在该 Bot 存在主人匹配时渲染
    const hasOwners = Array.from(masterToBot.entries()).some(([, b]) => b.account.selfId === item.bot.account.selfId)
    if (!hasOwners) continue
    const img = await getChangelogImage({ bot: item.bot } as Message, {
      localVersion: Root.pluginVersion,
      remoteVersion: upd.remote,
      Tip: true
    })
    if (img && img.length > 0) {
      botToImage.set(item.bot.account.selfId, [
        segment.text('karin-plugin-kkk 有新的更新！'),
        ...img
      ])
    }
  }

  // 依次私聊所有主人（存在好友命中的才发送）
  let storedMsgId: string | undefined
  for (const owner of masters) {
    const bot = masterToBot.get(owner)
    if (!bot) continue
    const elements = botToImage.get(bot.account.selfId)
    if (!elements) continue
    const msg = await karin.sendMaster(bot.account.selfId, owner, elements)
    if (!storedMsgId && msg?.messageId) {
      storedMsgId = msg.messageId
    }
  }

  // 记录首条提醒消息ID用于后续 Hook 的「更新」响应
  if (storedMsgId) {
    try {
      await db.set(UPDATE_MSGID_KEY, storedMsgId)
    } catch { }
  }
  return true
}

const handleUpdateHook = wrapWithErrorHandler(async (e: Message) => {
  if (!isAutoUpdateEnabled()) {
    replyAutoUpdateDisabled(e)
    return
  }

  e.reply('开始更新 karin-plugin-kkk ...', { reply: true })
  const upd = await checkPkgUpdate(Root.pluginName, { compare: 'semver' })
  if (upd.status === 'yes') {
    const result = await updatePkg(Root.pluginName)
    if (result.status === 'ok') {
      const msgResult = await e.reply(
        `${Root.pluginName} 更新成功！\n${result.local} -> ${result.remote}\n开始执行重启......`
      )
      if (msgResult.messageId) {
        try {
          await db.del(UPDATE_MSGID_KEY)
          await db.del(UPDATE_LOCK_KEY)
        } catch { }
      }
      await restart(e.selfId, e.contact, msgResult.messageId)
    } else {
      e.reply(`${Root.pluginName} 更新失败: ${result.data ?? '更新执行失败'}`)
    }
  } else if (upd.status === 'no') {
    e.reply('未检测到可更新版本。')
  } else {
    e.reply(`${Root.pluginName} 更新失败: ${upd.error?.message ?? String(upd.error)}`)
  }
}, {
  businessName: '更新Hook'
})

export const kkkUpdate = hooks.message.friend(async (e, next) => {
  if (!isAutoUpdateEnabled()) {
    next()
    return
  }

  if (e.msg.includes('更新')) {
    const msgId = (await db.get(UPDATE_MSGID_KEY)) as string
    if (e.replyId === msgId) {
      await handleUpdateHook(e)
    }
  }
  next()
}, { priority: 100 })

const handleKkkUpdate = wrapWithErrorHandler(async (e: Message) => {
  if (!isAutoUpdateEnabled()) {
    replyAutoUpdateDisabled(e)
    return
  }

  const upd = await checkPkgUpdate(Root.pluginName, { compare: 'semver' })
  if (upd.status === 'error') {
    e.reply(`获取远程版本失败：${upd.error?.message ?? String(upd.error)}`)
    return
  }
  if (upd.status === 'no') {
    e.reply(`当前已是最新版本：${upd.local}`, { reply: true })
    return
  }

  // 防守性校验：远程必须严格大于本地，否则视为无更新
  if (upd.status === 'yes' && !isSemverGreater(upd.remote, upd.local)) {
    e.reply(`当前已是最新或预览版本：${upd.local}`, { reply: true })
    return
  }

  const ChangeLogImg = await getChangelogImage(e, {
    localVersion: Root.pluginVersion,
    remoteVersion: upd.remote,
    Tip: false,
    isRemote: true
  })
  if (ChangeLogImg) {
    e.reply([segment.text(`${Root.pluginName} 的更新日志：`), ...ChangeLogImg], { reply: true })
  } else {
    e.reply('获取更新日志失败，更新进程继续......', { reply: true })
  }

  // 执行更新并重启
  const result = await updatePkg(Root.pluginName)
  if (result.status === 'ok') {
    const msgResult = await e.reply(
      `${Root.pluginName} 更新成功！\n${result.local} -> ${result.remote}\n开始执行重启......`
    )
    if (msgResult.messageId) {
      try {
        await db.del(UPDATE_MSGID_KEY)
        await db.del(UPDATE_LOCK_KEY)
      } catch { }
    }
    await restart(e.selfId, e.contact, msgResult.messageId)
  } else {
    e.reply(`${Root.pluginName} 更新失败: ${result.data ?? '更新执行失败'}`)
  }
}, {
  businessName: 'KKK更新'
})

export const kkkUpdateCommand = karin.command(/^#?kkk更新$/, handleKkkUpdate, { name: 'kkk-更新' })

export const kkkUpdateTest = process.env.NODE_ENV === 'development' && karin.command('test', async (_e: Message, next) => {
  await db.del(UPDATE_MSGID_KEY)
  await db.del(UPDATE_LOCK_KEY)
  await Handler()  
  next()
}, { name: 'kkk-更新检测-测试' })

export const update = karin.task('kkk-更新检测', '*/3 * * * *', Handler, {
  name: 'kkk-更新检测',
  log: false
})

void checkInstalledUpdateAndRestart('startup')

export const installedUpdateAutoRestart = karin.task('kkk-已安装新版本检测', '*/3 * * * *', async () => {
  await checkInstalledUpdateAndRestart('scheduled')
  return true
}, {
  name: 'kkk-已安装新版本检测',
  log: false
})
