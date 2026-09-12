import type { plainTitleReplyConfigCompat } from './plainTitleReply'

export interface externalRenderCardConfig {
  /** 是否启用渲染图发送 */
  enable: boolean

  /** 渲染图发送成功后，是否继续附带发送原图 */
  includeImages: boolean
}

/** 微博配置 */
export interface weiboConfig {
  /** 是否开启微博解析功能 */
  switch: boolean

  /** 解析时发送的内容 */
  sendContent: ('info' | 'image' | 'video')[]

  /** 外链内容渲染图设置 */
  renderCard: externalRenderCardConfig

  /** 当消息只有链接时，解析成功后额外发送作者和标题文本 */
  plainTitleReply: plainTitleReplyConfigCompat
}
