/**
 * 配置 Schema 统一导出
 */
export { appConfigSchema } from './app.schema'
export { bilibiliConfigSchema } from './bilibili.schema'
export { cookiesConfigSchema } from './cookies.schema'
export { detailedSummaryParseConfigSchema } from './detailedSummaryParse.schema'
export { douyinConfigSchema } from './douyin.schema'
export { githubConfigSchema } from './github.schema'
export { heyboxConfigSchema } from './heybox.schema'
export { kuaishouConfigSchema } from './kuaishou.schema'
export { requestConfigSchema } from './request.schema'
export * from './schema'
export { summaryParseConfigSchema } from './summaryParse.schema'
export { tiebaConfigSchema } from './tieba.schema'
export { tiktokConfigSchema } from './tiktok.schema'
export { transcriptOriginalConfigSchema } from './transcriptOriginal.schema'
export { uploadConfigSchema } from './upload.schema'
export { wechatConfigSchema } from './wechat.schema'
export { weiboConfigSchema } from './weibo.schema'
export { xConfigSchema } from './x.schema'
export { xiaohongshuConfigSchema } from './xiaohongshu.schema'
export { zhihuConfigSchema } from './zhihu.schema'

import { appConfigSchema } from './app.schema'
import { bilibiliConfigSchema } from './bilibili.schema'
import { cookiesConfigSchema } from './cookies.schema'
import { detailedSummaryParseConfigSchema } from './detailedSummaryParse.schema'
import { douyinConfigSchema } from './douyin.schema'
import { githubConfigSchema } from './github.schema'
import { heyboxConfigSchema } from './heybox.schema'
import { kuaishouConfigSchema } from './kuaishou.schema'
import { requestConfigSchema } from './request.schema'
import type { ConfigSchema, ModuleSchema, SectionSchema } from './schema'
import { summaryParseConfigSchema } from './summaryParse.schema'
import { tiebaConfigSchema } from './tieba.schema'
import { tiktokConfigSchema } from './tiktok.schema'
import { transcriptOriginalConfigSchema } from './transcriptOriginal.schema'
import { uploadConfigSchema } from './upload.schema'
import { wechatConfigSchema } from './wechat.schema'
import { weiboConfigSchema } from './weibo.schema'
import { xConfigSchema } from './x.schema'
import { xiaohongshuConfigSchema } from './xiaohongshu.schema'
import { zhihuConfigSchema } from './zhihu.schema'

/** 所有配置区块 Schema */
export const allSectionSchemas: Record<string, SectionSchema> = {
  cookies: cookiesConfigSchema,
  summaryParse: summaryParseConfigSchema,
  detailedSummaryParse: detailedSummaryParseConfigSchema,
  transcriptOriginal: transcriptOriginalConfigSchema,
  app: appConfigSchema,
  douyin: douyinConfigSchema,
  bilibili: bilibiliConfigSchema,
  kuaishou: kuaishouConfigSchema,
  xiaohongshu: xiaohongshuConfigSchema,
  heybox: heyboxConfigSchema,
  github: githubConfigSchema,
  x: xConfigSchema,
  zhihu: zhihuConfigSchema,
  tieba: tiebaConfigSchema,
  wechat: wechatConfigSchema,
  weibo: weiboConfigSchema,
  tiktok: tiktokConfigSchema,
  upload: uploadConfigSchema,
  request: requestConfigSchema
}

/** 获取完整配置 Schema（用于 API 返回） */
export function getConfigSchema(): ConfigSchema {
  const modules: ModuleSchema[] = [
    {
      key: 'cookies',
      label: 'Cookies 相关',
      sections: [cookiesConfigSchema]
    },
    {
      key: 'summaryParse',
      label: '解析总结相关',
      sections: [summaryParseConfigSchema]
    },
    {
      key: 'detailedSummaryParse',
      label: '详细解析总结相关',
      sections: [detailedSummaryParseConfigSchema]
    },
    {
      key: 'transcriptOriginal',
      label: '转写原文相关',
      sections: [transcriptOriginalConfigSchema]
    },
    {
      key: 'app',
      label: '插件应用相关',
      sections: [appConfigSchema]
    },
    {
      key: 'douyin',
      label: '抖音相关',
      sections: [douyinConfigSchema]
    },
    {
      key: 'bilibili',
      label: 'B站相关',
      sections: [bilibiliConfigSchema]
    },
    {
      key: 'kuaishou',
      label: '快手相关',
      sections: [kuaishouConfigSchema]
    },
    {
      key: 'xiaohongshu',
      label: '小红书相关',
      sections: [xiaohongshuConfigSchema]
    },
    {
      key: 'heybox',
      label: '小黑盒相关',
      sections: [heyboxConfigSchema]
    },
    {
      key: 'github',
      label: 'GitHub 相关',
      sections: [githubConfigSchema]
    },
    {
      key: 'x',
      label: 'X 相关',
      sections: [xConfigSchema]
    },
    {
      key: 'zhihu',
      label: '知乎相关',
      sections: [zhihuConfigSchema]
    },
    {
      key: 'tieba',
      label: '贴吧相关',
      sections: [tiebaConfigSchema]
    },
    {
      key: 'wechat',
      label: '微信公众号相关',
      sections: [wechatConfigSchema]
    },
    {
      key: 'weibo',
      label: '微博相关',
      sections: [weiboConfigSchema]
    },
    {
      key: 'tiktok',
      label: 'TikTok 相关',
      sections: [tiktokConfigSchema]
    },
    {
      key: 'upload',
      label: '视频文件上传相关',
      sections: [uploadConfigSchema]
    },
    {
      key: 'request',
      label: '解析库请求配置相关',
      sections: [requestConfigSchema]
    }
  ]

  return { modules }
}

/** 获取指定模块的 Schema */
export function getModuleSchema(moduleKey: string): SectionSchema | undefined {
  return allSectionSchemas[moduleKey]
}
