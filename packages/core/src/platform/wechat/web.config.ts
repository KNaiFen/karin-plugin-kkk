import { components } from 'node-karin'

import { normalizePlainTitleReplyConfig } from '@/module/utils/PlainTitleReply'
import { type ConfigType } from '@/types'

export const WechatWeb = (all: ConfigType) => {
  const plainTitleReply = normalizePlainTitleReplyConfig(all.wechat.plainTitleReply, ['image', 'text'])

  return [
    components.accordion.create('wechat', {
      label: '微信公众号相关',
      children: [
        components.accordion.createItem('cfg:wechat', {
          title: '微信公众号相关',
          className: 'ml-4 mr-4',
          subtitle: '此处为微信公众号文章解析设置',
          children: [
            components.switch.create('switch', {
              label: '解析开关',
              description: '微信公众号解析开关，此开关为单独开关',
              defaultSelected: all.wechat.switch
            }),
            components.checkbox.group('sendContent', {
              label: '解析时发送的内容',
              description: '若什么都不选，可能不会返回任何解析结果',
              orientation: 'horizontal',
              defaultValue: all.wechat.sendContent,
              isDisabled: !all.wechat.switch,
              checkbox: [
                components.checkbox.create('sendContent:checkbox:info', {
                  label: '文章信息',
                  value: 'info'
                }),
                components.checkbox.create('sendContent:checkbox:image', {
                  label: '文章图片',
                  value: 'image'
                })
              ]
            }),
            components.switch.create('renderCard:enable', {
              label: '启用渲染图发送',
              description: '开启后 info 走渲染图；关闭后改为文字摘要 + 单独图片',
              defaultSelected: all.wechat.renderCard.enable,
              isDisabled: !all.wechat.switch || !all.wechat.sendContent.includes('info')
            }),
            components.switch.create('renderCard:includeImages', {
              label: '原图并入渲染图合集',
              description: '仅在渲染图发送模式下生效，开启后会把解析出的原图并入同一个图片合集',
              defaultSelected: all.wechat.renderCard.includeImages,
              isDisabled: !all.wechat.switch || !all.wechat.sendContent.includes('info') || !all.wechat.renderCard.enable
            }),
            components.switch.create('plainTitleReply:switch', {
              label: '纯链接补发标题',
              description: '消息内容只有微信公众号链接时，解析成功后额外发送「【微信公众号】作者：标题」',
              defaultSelected: plainTitleReply.switch,
              isDisabled: !all.wechat.switch
            }),
            components.checkbox.group('plainTitleReply:types', {
              label: '补发标题触发类型',
              description: '选择哪些微信公众号内容类型在纯链接解析成功后补发标题',
              orientation: 'horizontal',
              defaultValue: plainTitleReply.types,
              isDisabled: !all.wechat.switch || !plainTitleReply.switch,
              checkbox: [
                components.checkbox.create('plainTitleReply:types:checkbox:image', {
                  label: '图文文章',
                  value: 'image'
                }),
                components.checkbox.create('plainTitleReply:types:checkbox:text', {
                  label: '纯文字文章',
                  value: 'text'
                })
              ]
            })
          ]
        })
      ]
    })
  ]
}
