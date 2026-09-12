import { components } from 'node-karin'

import type { guestCookieConfig } from '../../types/config/guestCookie'

export const createGuestCookieWebConfig = (guestCookie: guestCookieConfig) => {
  return components.accordion.create('guestCookie', {
    label: '游客 Cookie 自动获取',
    children: [
      components.accordion.createItem('cfg:guestCookie', {
        title: '游客 Cookie 自动获取',
        className: 'ml-4 mr-4',
        subtitle: '自动访问抖音、小红书、TikTok、微博等游客页面获取可用 Cookie，测试链接仅用于手动验证，不会自动定时请求',
        children: [
          components.divider.create('divider-guest-cookie-global', {
            description: '全局策略',
            descPosition: 20
          }),
          components.switch.create('switch', {
            label: '自动获取',
            description: '开启后会自动获取并写入抖音/小红书/TikTok/微博等游客 Cookie',
            defaultSelected: guestCookie.switch
          }),
          components.input.number('refreshIntervalHours', {
            label: '刷新间隔',
            description: '定时刷新基础间隔，单位：小时，默认 12',
            defaultValue: guestCookie.refreshIntervalHours.toString(),
            isDisabled: !guestCookie.switch,
            rules: [{ min: 1, max: 336, error: '请输入一个范围在 1 到 336 之间的数字' }]
          }),
          components.input.number('refreshJitterMinutes', {
            label: '随机抖动',
            description: '定时刷新随机抖动，单位：分钟。实际刷新时间为「刷新间隔 ± 随机抖动」',
            defaultValue: guestCookie.refreshJitterMinutes.toString(),
            isDisabled: !guestCookie.switch,
            rules: [{ min: 0, max: 1440, error: '请输入一个范围在 0 到 1440 之间的数字' }]
          }),
          components.input.number('minRefreshAgeHours', {
            label: '解析前过期阈值',
            description: '解析前检查到自动 Cookie 超过该时间会尝试刷新，单位：小时',
            defaultValue: guestCookie.minRefreshAgeHours.toString(),
            isDisabled: !guestCookie.switch,
            rules: [{ min: 0, max: 336, error: '请输入一个范围在 0 到 336 之间的数字' }]
          }),
          components.divider.create('divider-guest-cookie-runtime', {
            description: '获取行为',
            descPosition: 20
          }),
          components.input.number('httpTimeoutSeconds', {
            label: 'HTTP 超时',
            description: '浏览器获取失败后的 HTTP 回退超时时间，单位：秒',
            defaultValue: guestCookie.httpTimeoutSeconds.toString(),
            isDisabled: !guestCookie.switch,
            rules: [{ min: 1, max: 120, error: '请输入一个范围在 1 到 120 之间的数字' }]
          }),
          components.input.number('browserTimeoutSeconds', {
            label: '浏览器超时',
            description: '浏览器获取游客 Cookie 的超时时间，单位：秒',
            defaultValue: guestCookie.browserTimeoutSeconds.toString(),
            isDisabled: !guestCookie.switch,
            rules: [{ min: 5, max: 180, error: '请输入一个范围在 5 到 180 之间的数字' }]
          }),
          components.input.number('pageSettleSeconds', {
            label: '页面等待',
            description: '游客页面加载完成后的额外等待时间，单位：秒',
            defaultValue: guestCookie.pageSettleSeconds.toString(),
            isDisabled: !guestCookie.switch,
            rules: [{ min: 0, max: 30, error: '请输入一个范围在 0 到 30 之间的数字' }]
          }),
          components.switch.create('blockMedia', {
            label: '拦截媒体资源',
            description: '浏览器获取时拦截视频/音频资源，减少加载开销',
            defaultSelected: guestCookie.blockMedia,
            isDisabled: !guestCookie.switch
          }),
          components.switch.create('blockFont', {
            label: '拦截字体资源',
            description: '浏览器获取时拦截字体资源，减少加载开销',
            defaultSelected: guestCookie.blockFont,
            isDisabled: !guestCookie.switch
          }),
          components.divider.create('divider-guest-cookie-logging', {
            description: '持久化日志',
            descPosition: 20
          }),
          components.switch.create('logging:switch', {
            label: '持久化日志',
            description: '开启后会将游客 Cookie 自动获取的诊断事件写入本地 JSONL 文件，Cookie 值会脱敏',
            defaultSelected: guestCookie.logging.switch,
            isDisabled: !guestCookie.switch
          }),
          components.input.number('logging:retentionDays', {
            label: '日志保留天数',
            description: '超过该天数的游客 Cookie 日志会自动清理',
            defaultValue: guestCookie.logging.retentionDays.toString(),
            isDisabled: !guestCookie.switch || !guestCookie.logging.switch,
            rules: [{ min: 1, max: 365, error: '请输入一个范围在 1 到 365 之间的数字' }]
          }),
          components.input.number('logging:maxFileSizeMB', {
            label: '单文件大小',
            description: '单个日志文件超过该大小后会按序号轮转，单位：MB',
            defaultValue: guestCookie.logging.maxFileSizeMB.toString(),
            isDisabled: !guestCookie.switch || !guestCookie.logging.switch,
            rules: [{ min: 1, max: 200, error: '请输入一个范围在 1 到 200 之间的数字' }]
          }),
          components.divider.create('divider-guest-cookie-douyin', {
            description: '抖音',
            descPosition: 20
          }),
          components.switch.create('douyin:switch', {
            label: '抖音自动获取',
            description: '开启后自动访问抖音游客页面获取 Cookie',
            defaultSelected: guestCookie.douyin.switch,
            isDisabled: !guestCookie.switch
          }),
          components.input.string('douyin:pageUrl', {
            label: '抖音游客页',
            type: 'text',
            description: '用于获取抖音游客 Cookie 的页面地址',
            defaultValue: guestCookie.douyin.pageUrl,
            placeholder: 'https://www.douyin.com/jingxuan?enter=guide',
            isRequired: true,
            isDisabled: !guestCookie.switch || !guestCookie.douyin.switch
          }),
          components.input.string('douyin:testUrl', {
            label: '抖音测试链接',
            type: 'text',
            description: '用于手动解析验证的链接，不会自动定时请求',
            defaultValue: guestCookie.douyin.testUrl,
            placeholder: 'https://v.douyin.com/pGDQzKiWtBM/',
            isRequired: false,
            isDisabled: !guestCookie.switch || !guestCookie.douyin.switch
          }),
          components.divider.create('divider-guest-cookie-xhs', {
            description: '小红书',
            descPosition: 20
          }),
          components.switch.create('xiaohongshu:switch', {
            label: '小红书自动获取',
            description: '开启后自动访问小红书游客页面获取 Cookie',
            defaultSelected: guestCookie.xiaohongshu.switch,
            isDisabled: !guestCookie.switch
          }),
          components.input.string('xiaohongshu:pageUrl', {
            label: '小红书游客页',
            type: 'text',
            description: '用于获取小红书游客 Cookie 的页面地址',
            defaultValue: guestCookie.xiaohongshu.pageUrl,
            placeholder: 'https://www.xiaohongshu.com/explore',
            isRequired: true,
            isDisabled: !guestCookie.switch || !guestCookie.xiaohongshu.switch
          }),
          components.input.string('xiaohongshu:testUrl', {
            label: '小红书测试链接',
            type: 'text',
            description: '用于手动解析验证的链接，不会自动定时请求',
            defaultValue: guestCookie.xiaohongshu.testUrl,
            placeholder: 'http://xhslink.cn/o/1wPOQ9a9RyI',
            isRequired: false,
            isDisabled: !guestCookie.switch || !guestCookie.xiaohongshu.switch
          }),
          components.divider.create('divider-guest-cookie-tiktok', {
            description: 'TikTok',
            descPosition: 20
          }),
          components.switch.create('tiktok:switch', {
            label: 'TikTok 自动获取',
            description: '开启后自动访问 TikTok 游客页面获取 Cookie',
            defaultSelected: guestCookie.tiktok.switch,
            isDisabled: !guestCookie.switch
          }),
          components.input.string('tiktok:pageUrl', {
            label: 'TikTok 游客页',
            type: 'text',
            description: '用于获取 TikTok 游客 Cookie 的页面地址',
            defaultValue: guestCookie.tiktok.pageUrl,
            placeholder: 'https://www.tiktok.com/',
            isRequired: true,
            isDisabled: !guestCookie.switch || !guestCookie.tiktok.switch
          }),
          components.input.string('tiktok:testUrl', {
            label: 'TikTok 测试链接',
            type: 'text',
            description: '用于手动解析验证的链接，不会自动定时请求',
            defaultValue: guestCookie.tiktok.testUrl,
            placeholder: 'https://vt.tiktok.com/ZSxVY1Gos/',
            isRequired: false,
            isDisabled: !guestCookie.switch || !guestCookie.tiktok.switch
          }),
          components.divider.create('divider-guest-cookie-heybox', {
            description: '小黑盒',
            descPosition: 20
          }),
          components.switch.create('heybox:switch', {
            label: '小黑盒自动获取',
            description: '开启后自动访问小黑盒页面获取游客 Token',
            defaultSelected: guestCookie.heybox.switch,
            isDisabled: !guestCookie.switch
          }),
          components.input.string('heybox:pageUrl', {
            label: '小黑盒游客页',
            type: 'text',
            description: '用于获取小黑盒游客 Token 的页面地址',
            defaultValue: guestCookie.heybox.pageUrl,
            placeholder: 'https://www.xiaoheihe.cn/',
            isRequired: true,
            isDisabled: !guestCookie.switch || !guestCookie.heybox.switch
          }),
          components.input.string('heybox:testUrl', {
            label: '小黑盒测试链接',
            type: 'text',
            description: '用于手动解析验证的链接，不会自动定时请求',
            defaultValue: guestCookie.heybox.testUrl,
            placeholder: 'https://www.xiaoheihe.cn/app/bbs/link/4a9471857e40',
            isRequired: false,
            isDisabled: !guestCookie.switch || !guestCookie.heybox.switch
          }),
          components.divider.create('divider-guest-cookie-zhihu', {
            description: '知乎',
            descPosition: 20
          }),
          components.switch.create('zhihu:switch', {
            label: '知乎自动获取',
            description: '开启后自动访问知乎游客页面获取 Cookie',
            defaultSelected: guestCookie.zhihu.switch,
            isDisabled: !guestCookie.switch
          }),
          components.input.string('zhihu:pageUrl', {
            label: '知乎游客页',
            type: 'text',
            description: '用于获取知乎游客 Cookie 的页面地址',
            defaultValue: guestCookie.zhihu.pageUrl,
            placeholder: 'https://www.zhihu.com/',
            isRequired: true,
            isDisabled: !guestCookie.switch || !guestCookie.zhihu.switch
          }),
          components.input.string('zhihu:testUrl', {
            label: '知乎测试链接',
            type: 'text',
            description: '用于手动解析验证的链接，不会自动定时请求',
            defaultValue: guestCookie.zhihu.testUrl,
            placeholder: 'https://www.zhihu.com/question/19550283/answer/122329247',
            isRequired: false,
            isDisabled: !guestCookie.switch || !guestCookie.zhihu.switch
          }),
          components.divider.create('divider-guest-cookie-weibo', {
            description: '微博',
            descPosition: 20
          }),
          components.switch.create('weibo:switch', {
            label: '微博自动获取',
            description: '开启后自动访问微博游客页面获取 Cookie',
            defaultSelected: guestCookie.weibo.switch,
            isDisabled: !guestCookie.switch
          }),
          components.input.string('weibo:pageUrl', {
            label: '微博游客页',
            type: 'text',
            description: '用于获取微博游客 Cookie 的页面地址',
            defaultValue: guestCookie.weibo.pageUrl,
            placeholder: 'https://m.weibo.cn/',
            isRequired: true,
            isDisabled: !guestCookie.switch || !guestCookie.weibo.switch
          }),
          components.input.string('weibo:testUrl', {
            label: '微博测试链接',
            type: 'text',
            description: '用于手动解析验证的链接，不会自动定时请求',
            defaultValue: guestCookie.weibo.testUrl,
            placeholder: 'https://weibo.com/5955106173/R2YQog7Pb',
            isRequired: false,
            isDisabled: !guestCookie.switch || !guestCookie.weibo.switch
          })
        ]
      })
    ]
  })
}

export const normalizeGuestCookieFrontendConfig = (config: Record<string, any>) => {
  for (const platform of ['douyin', 'xiaohongshu', 'tiktok', 'heybox', 'zhihu', 'weibo']) {
    const platformConfig = config[platform]
    if (!platformConfig || typeof platformConfig !== 'object') continue
    delete platformConfig.requiredCookies
  }
}
