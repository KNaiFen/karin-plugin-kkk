import karin from 'node-karin'

import { wrapWithErrorHandler } from '@/module/utils/ErrorHandler'

/**
 * 生成登录二维码（仅私发给主人）
 */
const handleQrLogin = wrapWithErrorHandler(async (e) => {
  await e.reply('APP 扫码登录因安全加固已暂时停用，后续将以一次性短期票据方案重做。')
  return true
}, {
  businessName: 'APP扫码登录'
})

export const qrLogin = karin.command(/^#?(kkk)?登录$/i, handleQrLogin, { perm: 'master', name: 'kkk-APP扫码登录' })
