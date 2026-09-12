import { components } from 'node-karin'

import { normalizePlainTitleReplyConfig } from '@/module/utils/PlainTitleReply'
import { type ConfigType } from '@/types'

export const WeiboWeb = (all: ConfigType) => {
  const plainTitleReply = normalizePlainTitleReplyConfig(all.weibo.plainTitleReply, ['video', 'image', 'text'])

  return [
    components.accordion.create('weibo', {
      label: '微博相关',
      children: [
        components.accordion.createItem('cfg:weibo', {
          title: '微博相关',
          className: 'ml-4 mr-4',
          subtitle: '此处为微博内容解析设置',
          children: [
            components.switch.create('switch', {
              label: '解析开关',
              description: '微博解析开关，此开关为单独开关',
              defaultSelected: all.weibo.switch
            }),
            components.checkbox.group('sendContent', {
              label: '解析时发送的内容',
              description: '若什么都不选，可能不会返回任何解析结果',
              orientation: 'horizontal',
              defaultValue: all.weibo.sendContent,
              isDisabled: !all.weibo.switch,
              checkbox: [
                components.checkbox.create('sendContent:checkbox:info', {
                  label: '微博信息',
                  value: 'info'
                }),
                components.checkbox.create('sendContent:checkbox:image', {
                  label: '内容图片',
                  value: 'image'
                }),
                components.checkbox.create('sendContent:checkbox:video', {
                  label: '视频文件',
                  value: 'video'
                })
              ]
            }),
            components.switch.create('renderCard:enable', {
              label: '启用渲染图发送',
              description: '开启后 info 走渲染图；关闭后改为文字摘要 + 单独图片',
              defaultSelected: all.weibo.renderCard.enable,
              isDisabled: !all.weibo.switch || !all.weibo.sendContent.includes('info')
            }),
            components.switch.create('renderCard:includeImages', {
              label: '原图并入渲染图合集',
              description: '仅在渲染图发送模式下生效，开启后会把解析出的原图并入同一个图片合集',
              defaultSelected: all.weibo.renderCard.includeImages,
              isDisabled: !all.weibo.switch || !all.weibo.sendContent.includes('info') || !all.weibo.renderCard.enable
            }),
            components.switch.create('plainTitleReply:switch', {
              label: '纯链接补发标题',
              description: '消息内容只有微博链接时，解析成功后额外发送「【微博】作者：标题」',
              defaultSelected: plainTitleReply.switch,
              isDisabled: !all.weibo.switch
            }),
            components.checkbox.group('plainTitleReply:types', {
              label: '补发标题触发类型',
              description: '选择哪些微博内容类型在纯链接解析成功后补发标题',
              orientation: 'horizontal',
              defaultValue: plainTitleReply.types,
              isDisabled: !all.weibo.switch || !plainTitleReply.switch,
              checkbox: [
                components.checkbox.create('plainTitleReply:types:checkbox:video', {
                  label: '视频微博',
                  value: 'video'
                }),
                components.checkbox.create('plainTitleReply:types:checkbox:image', {
                  label: '图文微博',
                  value: 'image'
                }),
                components.checkbox.create('plainTitleReply:types:checkbox:text', {
                  label: '文字微博',
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
