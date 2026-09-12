import { components } from 'node-karin'

import { normalizePlainTitleReplyConfig } from '@/module/utils/PlainTitleReply'
import { type ConfigType } from '@/types'

export const ZhihuWeb = (all: ConfigType) => {
  const plainTitleReply = normalizePlainTitleReplyConfig(all.zhihu.plainTitleReply, ['video', 'image', 'text'])

  return [
    components.accordion.create('zhihu', {
      label: '知乎相关',
      children: [
        components.accordion.createItem('cfg:zhihu', {
          title: '知乎相关',
          className: 'ml-4 mr-4',
          subtitle: '此处为知乎回答解析设置',
          children: [
            components.switch.create('switch', {
              label: '解析开关',
              description: '知乎解析开关，此开关为单独开关',
              defaultSelected: all.zhihu.switch
            }),
            components.checkbox.group('sendContent', {
              label: '解析时发送的内容',
              description: '若什么都不选，可能不会返回任何解析结果',
              orientation: 'horizontal',
              defaultValue: all.zhihu.sendContent,
              isDisabled: !all.zhihu.switch,
              checkbox: [
                components.checkbox.create('sendContent:checkbox:info', {
                  label: '回答信息',
                  value: 'info'
                }),
                components.checkbox.create('sendContent:checkbox:image', {
                  label: '内容图片',
                  value: 'image'
                }),
                components.checkbox.create('sendContent:checkbox:video', {
                  label: '内嵌视频',
                  value: 'video'
                })
              ]
            }),
            components.switch.create('renderCard:enable', {
              label: '启用渲染图发送',
              description: '开启后 info 走渲染图；关闭后改为文字摘要 + 单独图片',
              defaultSelected: all.zhihu.renderCard.enable,
              isDisabled: !all.zhihu.switch || !all.zhihu.sendContent.includes('info')
            }),
            components.switch.create('renderCard:includeImages', {
              label: '原图并入渲染图合集',
              description: '仅在渲染图发送模式下生效，开启后会把解析出的原图并入同一个图片合集',
              defaultSelected: all.zhihu.renderCard.includeImages,
              isDisabled: !all.zhihu.switch || !all.zhihu.sendContent.includes('info') || !all.zhihu.renderCard.enable
            }),
            components.switch.create('plainTitleReply:switch', {
              label: '纯链接补发标题',
              description: '消息内容只有知乎链接时，解析成功后额外发送「【知乎】作者：标题」',
              defaultSelected: plainTitleReply.switch,
              isDisabled: !all.zhihu.switch
            }),
            components.checkbox.group('plainTitleReply:types', {
              label: '补发标题触发类型',
              description: '选择哪些知乎内容类型在纯链接解析成功后补发标题',
              orientation: 'horizontal',
              defaultValue: plainTitleReply.types,
              isDisabled: !all.zhihu.switch || !plainTitleReply.switch,
              checkbox: [
                components.checkbox.create('plainTitleReply:types:checkbox:video', {
                  label: '视频回答',
                  value: 'video'
                }),
                components.checkbox.create('plainTitleReply:types:checkbox:image', {
                  label: '图文回答',
                  value: 'image'
                }),
                components.checkbox.create('plainTitleReply:types:checkbox:text', {
                  label: '文字回答',
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
