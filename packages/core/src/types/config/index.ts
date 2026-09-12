import { appConfig } from './app'
import { bilibiliConfig } from './bilibili'
import { cookiesConfig } from './cookies'
import { douyinConfig } from './douyin'
import { guestCookieConfig } from './guestCookie'
import { githubConfig } from './github'
import { heyboxConfig } from './heybox'
import { kuaishouConfig } from './kuaishou'
import { pushlistConfig } from './pushlist'
import { requestConfig } from './request'
import { tiebaConfig } from './tieba'
import { tiktokConfig } from './tiktok'
import { uploadConfig } from './upload'
import { wechatConfig } from './wechat'
import { weiboConfig } from './weibo'
import { xConfig } from './x'
import { xiaohongshuConfig } from './xiaohongshu'
import { zhihuConfig } from './zhihu'

/** 插件配置类型 */
export interface ConfigType {
  /** 插件应用设置 */
  app: appConfig,
  /** bilibili 相关设置 */
  bilibili: bilibiliConfig,
  /** 抖音相关设置 */
  douyin: douyinConfig
  /** CK 相关设置 */
  cookies: cookiesConfig,
  /** 游客 Cookie 自动获取相关设置 */
  guestCookie: guestCookieConfig,
  /** 推送列表 */
  pushlist: pushlistConfig,
  /** 上传相关设置 */
  upload: uploadConfig,
  /** 快手相关设置 */
  kuaishou: kuaishouConfig,
  /** 小红书相关设置 */
  xiaohongshu: xiaohongshuConfig,
  /** 小黑盒相关设置 */
  heybox: heyboxConfig,
  /** GitHub 相关设置 */
  github: githubConfig,
  /** X 相关设置 */
  x: xConfig,
  /** 知乎相关设置 */
  zhihu: zhihuConfig,
  /** 贴吧相关设置 */
  tieba: tiebaConfig,
  /** 微信公众号相关设置 */
  wechat: wechatConfig,
  /** 微博相关设置 */
  weibo: weiboConfig,
  /** TikTok 相关设置 */
  tiktok: tiktokConfig,
  /** 解析库请求配置设置 */
  request: requestConfig
}
