/**
 * TikTok 配置 Schema
 */
import type { SectionSchema } from './schema'
import { $not, $or, $var } from './schema'

export const tiktokConfigSchema: SectionSchema = {
  key: 'tiktok',
  title: 'TikTok 相关',
  subtitle: '此处为 TikTok 视频解析设置',
  fields: [
    {
      key: 'switch',
      type: 'switch',
      label: '解析开关',
      description: 'TikTok 解析开关，此开关为单独开关'
    },
    { type: 'divider', title: '解析优先级设置' },
    {
      key: 'videoTool',
      type: 'switch',
      label: '默认解析',
      description: 'TikTok 默认解析，即识别最高优先级；不受「插件应用相关」里的全局默认解析影响，修改后重启生效'
    },
    {
      key: 'priority',
      type: 'input',
      inputType: 'number',
      label: '自定义优先级',
      description: 'TikTok 自定义优先级，「默认解析」关闭后才会生效。修改后重启生效',
      disabled: $var('videoTool')
    },
    {
      key: 'plainTitleReply.switch',
      type: 'switch',
      label: '纯链接补发标题',
      description: '消息内容只有 TikTok 链接时，解析成功后额外发送「【TikTok】作者：标题」',
      disabled: $not('switch')
    },
    {
      key: 'plainTitleReply.types',
      type: 'checkbox',
      label: '补发标题触发类型',
      description: '选择哪些 TikTok 内容类型在纯链接解析成功后补发标题',
      orientation: 'horizontal',
      disabled: $or($not('switch'), $not('plainTitleReply.switch')),
      options: [
        { label: '视频', value: 'video' }
      ]
    },
    { type: 'divider', title: 'TikTok 专用代理配置（可选）' },
    {
      key: 'proxy.switch',
      type: 'switch',
      label: '代理开关',
      description: '只影响 TikTok 解析、下载和游客 Cookie 获取，不影响全局请求代理'
    },
    {
      key: 'proxy.host',
      type: 'input',
      inputType: 'text',
      label: '代理主机',
      description: '代理服务器的主机地址，如：127.0.0.1',
      placeholder: '127.0.0.1',
      disabled: $not('proxy.switch')
    },
    {
      key: 'proxy.port',
      type: 'input',
      inputType: 'number',
      label: '代理端口',
      description: '代理服务器的端口号',
      disabled: $not('proxy.switch'),
      rules: [{ min: 1, max: 65535, error: '请输入一个范围在 1 到 65535 之间的数字' }]
    },
    {
      key: 'proxy.protocol',
      type: 'radio',
      label: '代理协议',
      orientation: 'horizontal',
      disabled: $not('proxy.switch'),
      options: [
        { label: 'HTTP', value: 'http' },
        { label: 'HTTPS', value: 'https' }
      ]
    },
    {
      key: 'proxy.auth.username',
      type: 'input',
      inputType: 'text',
      label: '代理用户名',
      description: '代理服务器的认证用户名（如果需要）',
      disabled: $not('proxy.switch')
    },
    {
      key: 'proxy.auth.password',
      type: 'input',
      inputType: 'password',
      label: '代理密码',
      description: '代理服务器的认证密码（如果需要）',
      disabled: $not('proxy.switch')
    }
  ]
}
