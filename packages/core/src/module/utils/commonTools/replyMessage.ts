import { logger, type Message } from 'node-karin'

import { QRCodeScanner } from '@/module/utils/QRCodeScanner'

const tryScanImageQrCode = async (imageUrl: string, source: string): Promise<string | null> => {
  try {
    logger.debug(`检测到${source}为图片，尝试识别二维码...`)
    const qrContent = await QRCodeScanner.scanFromUrl(imageUrl)
    if (qrContent && QRCodeScanner.isSupportedPlatform(qrContent)) {
      logger.debug(`从${source}二维码中识别到支持的平台链接: ${qrContent}`)
      return qrContent
    } else if (qrContent) {
      logger.debug(`识别到二维码内容但不是支持的平台: ${qrContent}`)
    }
  } catch (error) {
    logger.error(`识别${source}二维码时发生错误:`, error)
  }
  return null
}

export const getReplyMessage = async (e: Message): Promise<string> => {
  if (e.replyId) {
    const reply = await e.bot.getMsg(e.contact, e.replyId)
    for (const v of reply.elements) {
      if (v.type === 'text') {
        try {
          const parsed = JSON.parse(v.text)
          if (parsed.type === 'markdown' && parsed.data?.content) {
            const content = parsed.data.content
            const imageRegex = /!\[.*?\]\((.*?)\)/g
            let match: RegExpExecArray | null
            while ((match = imageRegex.exec(content)) !== null) {
              const qrResult = await tryScanImageQrCode(match[1], '引用消息中的 markdown 图片')
              if (qrResult) return qrResult
            }
            return content
          }
        } catch {
          // 不是 JSON 格式，按普通文本处理。
        }
        return v.text
      } else if (v.type === 'json') {
        return v.data
      } else if (v.type === 'image') {
        const qrResult = await tryScanImageQrCode(v.file, '引用消息')
        if (qrResult) return qrResult
      }
    }
  }
  return ''
}
