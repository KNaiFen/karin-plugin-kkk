/**
 * 贴吧配置 Schema
 */
import type { SectionSchema } from './schema'
import { $includes, $not, $or } from './schema'

export const tiebaConfigSchema: SectionSchema = {
  key: 'tieba',
  title: '贴吧相关',
  subtitle: '此处为贴吧相关的用户偏好设置',
  fields: [
    {
      key: 'switch',
      type: 'switch',
      label: '解析开关',
      description: '贴吧解析开关，此开关为单独开关'
    },
    {
      key: 'sendContent',
      type: 'checkbox',
      label: '解析时发送的内容',
      description: '若什么都不选，可能不会返回任何解析结果',
      orientation: 'horizontal',
      disabled: $not('switch'),
      options: [
        { label: '帖子信息', value: 'info' },
        { label: '评论文本', value: 'comment' },
        { label: '帖子图片', value: 'image' },
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
      description: '消息内容只有贴吧链接时，解析成功后额外发送「【贴吧】作者：标题」',
      disabled: $not('switch')
    },
    {
      key: 'plainTitleReply.types',
      type: 'checkbox',
      label: '补发标题触发类型',
      description: '选择哪些贴吧内容类型在纯链接解析成功后补发标题',
      orientation: 'horizontal',
      disabled: $or($not('switch'), $not('plainTitleReply.switch')),
      options: [
        { label: '文字帖', value: 'text' },
        { label: '图文帖', value: 'image' },
        { label: '视频帖', value: 'video' }
      ]
    },
    {
      key: 'numcomment',
      type: 'input',
      inputType: 'number',
      label: '评论解析数量',
      disabled: $not('switch'),
      rules: [{ min: 1, max: 30 }]
    }
  ]
}
