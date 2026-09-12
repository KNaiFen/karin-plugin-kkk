import type { requestConfig } from './request'
import type { plainTitleReplyConfigCompat } from './plainTitleReply'

/** 定义 TikTok 解析工具的配置接口 */
export interface tiktokConfig {
  /** TikTok 解析开关，单独开关 */
  switch: boolean
  /** TikTok 默认解析，即识别最高优先级，不受全局解析优先级影响 */
  videoTool: boolean
  /** TikTok 自定义优先级，「videoTool」关闭后生效 */
  priority: number
  /** 当消息只有链接时，解析成功后额外发送作者和标题文本 */
  plainTitleReply: plainTitleReplyConfigCompat
  /** TikTok 专用代理配置 */
  proxy?: requestConfig['proxy']
}
