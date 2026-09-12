import { components } from 'node-karin'

import { normalizePlainTitleReplyConfig } from '@/module/utils/PlainTitleReply'
import { type ConfigType } from '@/types'

export const XWeb = (all: ConfigType) => {
  const proxy = all.x.proxy
  const plainTitleReply = normalizePlainTitleReplyConfig(all.x.plainTitleReply, ['video', 'image', 'text'])

  return [
    components.accordion.create('x', {
      label: 'X 相关',
      children: [
        components.accordion.createItem('cfg:x', {
          title: 'X 相关',
          className: 'ml-4 mr-4',
          subtitle: '此处为 X / Twitter 内容解析设置',
          children: [
            components.switch.create('switch', {
              label: '解析开关',
              description: 'X 解析开关，此开关为单独开关',
              defaultSelected: all.x.switch
            }),
            components.checkbox.group('sendContent', {
              label: '解析时发送的内容',
              description: '若什么都不选，可能不会返回任何解析结果',
              orientation: 'horizontal',
              defaultValue: all.x.sendContent,
              isDisabled: !all.x.switch,
              checkbox: [
                components.checkbox.create('sendContent:checkbox:info', {
                  label: '推文信息',
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
              defaultSelected: all.x.renderCard.enable,
              isDisabled: !all.x.switch || !all.x.sendContent.includes('info')
            }),
            components.switch.create('renderCard:includeImages', {
              label: '原图并入渲染图合集',
              description: '仅在渲染图发送模式下生效，开启后会把解析出的原图并入同一个图片合集',
              defaultSelected: all.x.renderCard.includeImages,
              isDisabled: !all.x.switch || !all.x.sendContent.includes('info') || !all.x.renderCard.enable
            }),
            components.switch.create('plainTitleReply:switch', {
              label: '纯链接补发标题',
              description: '消息内容只有 X 链接时，解析成功后额外发送「【X】作者：标题」',
              defaultSelected: plainTitleReply.switch,
              isDisabled: !all.x.switch
            }),
            components.checkbox.group('plainTitleReply:types', {
              label: '补发标题触发类型',
              description: '选择哪些 X 内容类型在纯链接解析成功后补发标题',
              orientation: 'horizontal',
              defaultValue: plainTitleReply.types,
              isDisabled: !all.x.switch || !plainTitleReply.switch,
              checkbox: [
                components.checkbox.create('plainTitleReply:types:checkbox:video', {
                  label: '视频推文',
                  value: 'video'
                }),
                components.checkbox.create('plainTitleReply:types:checkbox:image', {
                  label: '图文推文',
                  value: 'image'
                }),
                components.checkbox.create('plainTitleReply:types:checkbox:text', {
                  label: '文字推文',
                  value: 'text'
                })
              ]
            }),
            components.divider.create('divider-x-proxy', {
              description: 'X 专用代理配置（可选）',
              descPosition: 20
            }),
            components.switch.create('proxy:switch', {
              label: '代理开关',
              description: '只影响 X 解析、重定向展开和视频下载，不影响全局请求代理',
              defaultSelected: proxy?.switch ?? false
            }),
            components.input.string('proxy:host', {
              label: '代理主机',
              description: '代理服务器的主机地址，如：127.0.0.1',
              placeholder: '127.0.0.1',
              defaultValue: proxy?.host || '',
              isDisabled: !proxy?.switch
            }),
            components.input.number('proxy:port', {
              label: '代理端口',
              description: '代理服务器的端口号',
              defaultValue: proxy?.port?.toString() || '',
              isDisabled: !proxy?.switch,
              rules: [
                {
                  min: 1,
                  max: 65535
                }
              ]
            }),
            components.radio.group('proxy:protocol', {
              label: '代理协议',
              orientation: 'horizontal',
              defaultValue: proxy?.protocol || 'http',
              radio: [
                components.radio.create('x-proxy-protocol-1', {
                  label: 'HTTP',
                  value: 'http'
                }),
                components.radio.create('x-proxy-protocol-2', {
                  label: 'HTTPS',
                  value: 'https'
                })
              ],
              isDisabled: !proxy?.switch
            }),
            components.input.string('proxy:auth:username', {
              label: '代理用户名',
              type: 'text',
              description: '代理服务器的认证用户名（如果需要）',
              defaultValue: proxy?.auth?.username || '',
              placeholder: '',
              rules: undefined,
              isRequired: false,
              isDisabled: !proxy?.switch
            }),
            components.input.string('proxy:auth:password', {
              label: '代理密码',
              type: 'password',
              description: '代理服务器的认证密码（如果需要）',
              defaultValue: proxy?.auth?.password || '',
              placeholder: '',
              rules: undefined,
              isRequired: false,
              isDisabled: !proxy?.switch
            })
          ]
        })
      ]
    })
  ]
}
