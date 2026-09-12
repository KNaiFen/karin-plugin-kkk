import type { plainTitleReplyConfigCompat } from './plainTitleReply'
import type { externalRenderCardConfig } from './weibo'

/** 小黑盒配置 */
export interface heyboxConfig {
  /** 是否开启小黑盒解析功能 */
  switch: boolean

  /** 解析时发送的内容 */
  sendContent: ('info' | 'comment' | 'image' | 'video')[]

  /** 外链内容渲染图设置 */
  renderCard: externalRenderCardConfig

  /** 当消息只有链接时，解析成功后额外发送作者和标题文本 */
  plainTitleReply: plainTitleReplyConfigCompat

  /** 评论解析数量 */
  numcomment: number
}
