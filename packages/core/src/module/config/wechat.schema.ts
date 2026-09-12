/**
 * 微信公众号配置 Schema
 */
import type { SectionSchema } from './schema'
import { $includes, $not, $or } from './schema'

export const wechatConfigSchema: SectionSchema = {
  key: 'wechat',
  title: '微信公众号相关',
  subtitle: '此处为微信公众号文章解析设置',
  fields: [
    {
      key: 'switch',
      type: 'switch',
      label: '解析开关',
      description: '微信公众号解析开关，此开关为单独开关'
    },
    {
      key: 'sendContent',
      type: 'checkbox',
      label: '解析时发送的内容',
      description: '若什么都不选，可能不会返回任何解析结果',
      orientation: 'horizontal',
      disabled: $not('switch'),
      options: [
        { label: '文章信息', value: 'info' },
        { label: '文章图片', value: 'image' }
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
      description: '消息内容只有微信公众号链接时，解析成功后额外发送「【微信公众号】作者：标题」',
      disabled: $not('switch')
    },
    {
      key: 'plainTitleReply.types',
      type: 'checkbox',
      label: '补发标题触发类型',
      description: '选择哪些微信公众号内容类型在纯链接解析成功后补发标题',
      orientation: 'horizontal',
      disabled: $or($not('switch'), $not('plainTitleReply.switch')),
      options: [
        { label: '图文文章', value: 'image' },
        { label: '纯文字文章', value: 'text' }
      ]
    }
  ]
}
