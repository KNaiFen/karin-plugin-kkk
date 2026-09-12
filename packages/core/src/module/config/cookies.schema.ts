/**
 * Cookies 配置 Schema
 */
import type { SectionSchema } from './schema'

export const cookiesConfigSchema: SectionSchema = {
  key: 'cookies',
  title: 'Cookies 相关',
  subtitle: '建议配置，否则大部分功能无法使用',
  fields: [
    {
      key: 'douyin',
      type: 'input',
      inputType: 'text',
      label: '抖音',
      description: '请输入你的抖音Cookies，不输入则无法使用抖音相关功能噢'
    },
    {
      key: 'bilibili',
      type: 'input',
      inputType: 'text',
      label: 'B站',
      description: '请输入你的B站Cookies，不输入则无法使用B站相关功能噢'
    },
    {
      key: 'kuaishou',
      type: 'input',
      inputType: 'text',
      label: '快手',
      description: '请输入你的快手Cookies，不输入则无法使用快手相关功能噢'
    },
    {
      key: 'xiaohongshu',
      type: 'input',
      inputType: 'text',
      label: '小红书',
      description: '请输入你的小红书Cookies，不输入则无法使用小红书相关功能噢'
    },
    {
      key: 'tiktok',
      type: 'input',
      inputType: 'text',
      label: 'TikTok',
      description: '请输入你的 TikTok Cookies，不输入时将尝试使用游客 Cookie'
    },
    {
      key: 'heybox',
      type: 'input',
      inputType: 'text',
      label: '小黑盒',
      description: '请输入你的小黑盒 Cookies，不输入时将尝试使用游客 Token'
    },
    {
      key: 'zhihu',
      type: 'input',
      inputType: 'text',
      label: '知乎',
      description: '请输入你的知乎 Cookies，不输入时将尝试使用游客 Cookie'
    },
    {
      key: 'tieba',
      type: 'input',
      inputType: 'text',
      label: '贴吧',
      description: '请输入你的贴吧 Cookies，公开帖子通常可不填'
    },
    {
      key: 'weibo',
      type: 'input',
      inputType: 'text',
      label: '微博',
      description: '请输入你的微博 Cookies，公开微博通常可不填'
    }
  ]
}
