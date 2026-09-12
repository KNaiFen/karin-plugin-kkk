/** 游客 Cookie 自动获取配置 */
export interface guestCookieConfig {
  /** 是否启用游客 Cookie 自动获取 */
  switch: boolean

  /** 定时刷新基础间隔，单位：小时 */
  refreshIntervalHours: number

  /** 定时刷新随机抖动，单位：分钟 */
  refreshJitterMinutes: number

  /** 解析前认为自动 Cookie 过期的时间，单位：小时 */
  minRefreshAgeHours: number

  /** HTTP 回退获取超时时间，单位：秒 */
  httpTimeoutSeconds: number

  /** 浏览器获取超时时间，单位：秒 */
  browserTimeoutSeconds: number

  /** 页面加载完成后的等待时间，单位：秒 */
  pageSettleSeconds: number

  /** 浏览器获取时是否拦截媒体资源 */
  blockMedia: boolean

  /** 浏览器获取时是否拦截字体资源 */
  blockFont: boolean

  /** 游客 Cookie 持久化日志配置 */
  logging: guestCookieLoggingConfig

  /** 抖音游客 Cookie 获取配置 */
  douyin: guestCookiePlatformConfig

  /** 小红书游客 Cookie 获取配置 */
  xiaohongshu: guestCookiePlatformConfig

  /** TikTok 游客 Cookie 获取配置 */
  tiktok: guestCookiePlatformConfig

  /** 小黑盒游客 Token 获取配置 */
  heybox: guestCookiePlatformConfig

  /** 知乎游客 Cookie 获取配置 */
  zhihu: guestCookiePlatformConfig

  /** 微博游客 Cookie 获取配置 */
  weibo: guestCookiePlatformConfig
}

/** 游客 Cookie 持久化日志配置 */
export interface guestCookieLoggingConfig {
  /** 是否启用持久化日志 */
  switch: boolean

  /** 日志保留天数 */
  retentionDays: number

  /** 单个日志文件最大大小，单位：MB */
  maxFileSizeMB: number
}

/** 单个平台游客 Cookie 自动获取配置 */
export interface guestCookiePlatformConfig {
  /** 是否启用该平台的游客 Cookie 自动获取 */
  switch: boolean

  /** 获取游客 Cookie 的页面地址 */
  pageUrl: string

  /** 用于手动解析验证的测试链接 */
  testUrl: string

  /** 判断 Cookie 是否完整时必须包含的 Cookie 名 */
  requiredCookies: string[]
}
