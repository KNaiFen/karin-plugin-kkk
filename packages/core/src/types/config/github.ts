import type { plainTitleReplyConfigCompat } from './plainTitleReply'
import type { requestConfig } from './request'
import type { externalRenderCardConfig } from './weibo'

/** GitHub 配置 */
export interface githubConfig {
  /** 是否开启 GitHub 仓库解析功能 */
  switch: boolean

  /** 解析时发送的内容 */
  sendContent: ('info' | 'image')[]

  /** 外链内容渲染图设置 */
  renderCard: externalRenderCardConfig

  /** 当消息只有链接时，解析成功后额外发送标题文本 */
  plainTitleReply: plainTitleReplyConfigCompat

  /** GitHub Personal Access Token，可选 */
  token: string

  /** GitHub 专用代理配置 */
  proxy?: requestConfig['proxy']
}
