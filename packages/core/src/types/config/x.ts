import type { plainTitleReplyConfigCompat } from './plainTitleReply'
import type { requestConfig } from './request'
import type { externalRenderCardConfig } from './weibo'

/** X 配置 */
export interface xConfig {
  /** 是否开启 X 解析功能 */
  switch: boolean

  /** 解析时发送的内容 */
  sendContent: ('info' | 'image' | 'video')[]

  /** 外链内容渲染图设置 */
  renderCard: externalRenderCardConfig

  /** 当消息只有链接时，解析成功后额外发送作者和标题文本 */
  plainTitleReply: plainTitleReplyConfigCompat

  /** X 专用代理配置 */
  proxy?: requestConfig['proxy']
}
