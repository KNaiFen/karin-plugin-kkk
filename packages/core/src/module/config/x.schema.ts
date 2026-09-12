import type { SectionSchema } from './schema'
import { $includes, $not, $or } from './schema'

export const xConfigSchema: SectionSchema = {
  key: 'x',
  title: 'X 相关',
  subtitle: '此处为 X / Twitter 相关的用户偏好设置',
  fields: [
    {
      key: 'switch',
      type: 'switch',
      label: '解析开关',
      description: 'X 解析开关，此开关为单独开关'
    },
    {
      key: 'sendContent',
      type: 'checkbox',
      label: '解析时发送的内容',
      description: '若什么都不选，可能不会返回任何解析结果',
      orientation: 'horizontal',
      disabled: $not('switch'),
      options: [
        { label: '推文信息', value: 'info' },
        { label: '内容图片', value: 'image' },
        { label: '视频文件', value: 'video' }
      ]
    },
    {
      key: 'renderCard.enable',
      type: 'switch',
      label: '启用渲染图发送',
      description: '开启后 info 走渲染图；关闭后改为文字摘要 + 单独图片',
      disabled: $or($not('switch'), $not($includes('sendContent', 'info')))
    },
    {
      key: 'renderCard.includeImages',
      type: 'switch',
      label: '原图并入渲染图合集',
      description: '仅在渲染图发送模式下生效，开启后会把解析出的原图并入同一个图片合集',
      disabled: $or($not('switch'), $not($includes('sendContent', 'info')), $not('renderCard.enable'))
    },
    {
      key: 'plainTitleReply.switch',
      type: 'switch',
      label: '纯链接补发标题',
      description: '消息内容只有 X 链接时，解析成功后额外发送「【X】作者：标题」',
      disabled: $not('switch')
    },
    {
      key: 'plainTitleReply.types',
      type: 'checkbox',
      label: '补发标题触发类型',
      description: '选择哪些 X 内容类型在纯链接解析成功后补发标题',
      orientation: 'horizontal',
      disabled: $or($not('switch'), $not('plainTitleReply.switch')),
      options: [
        { label: '视频推文', value: 'video' },
        { label: '图文推文', value: 'image' },
        { label: '文字推文', value: 'text' }
      ]
    },
    { type: 'divider', title: 'X 专用代理配置（可选）' },
    {
      key: 'proxy.switch',
      type: 'switch',
      label: '代理开关',
      description: '只影响 X 解析、重定向展开和视频下载，不影响全局请求代理'
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
