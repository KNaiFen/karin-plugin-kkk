import { components } from 'node-karin'

import { normalizePlainTitleReplyConfig } from '@/module/utils/PlainTitleReply'
import { type ConfigType } from '@/types'

export const GithubWeb = (all: ConfigType) => {
  const proxy = all.github.proxy
  const plainTitleReply = normalizePlainTitleReplyConfig(all.github.plainTitleReply, ['text', 'image'])

  return [
    components.accordion.create('github', {
      label: 'GitHub 相关',
      children: [
        components.accordion.createItem('cfg:github', {
          title: 'GitHub 相关',
          className: 'ml-4 mr-4',
          subtitle: '此处为 GitHub 仓库解析设置',
          children: [
            components.switch.create('switch', {
              label: '解析开关',
              description: 'GitHub 仓库解析开关，此开关为单独开关',
              defaultSelected: all.github.switch
            }),
            components.checkbox.group('sendContent', {
              label: '解析时发送的内容',
              description: '若什么都不选，可能不会返回任何解析结果',
              orientation: 'horizontal',
              defaultValue: all.github.sendContent,
              isDisabled: !all.github.switch,
              checkbox: [
                components.checkbox.create('sendContent:checkbox:info', {
                  label: '仓库信息',
                  value: 'info'
                }),
                components.checkbox.create('sendContent:checkbox:image', {
                  label: '预览图片',
                  value: 'image'
                })
              ]
            }),
            components.switch.create('renderCard:enable', {
              label: '启用渲染图发送',
              description: '开启后 info 走渲染图；关闭后改为文字摘要 + 单独图片',
              defaultSelected: all.github.renderCard.enable,
              isDisabled: !all.github.switch || !all.github.sendContent.includes('info')
            }),
            components.switch.create('renderCard:includeImages', {
              label: '原图并入渲染图合集',
              description: '仅在渲染图发送模式下生效，开启后会把解析出的原图并入同一个图片合集',
              defaultSelected: all.github.renderCard.includeImages,
              isDisabled: !all.github.switch || !all.github.sendContent.includes('info') || !all.github.renderCard.enable
            }),
            components.switch.create('plainTitleReply:switch', {
              label: '纯链接补发标题',
              description: '消息内容只有 GitHub 仓库链接时，解析成功后额外发送「【GitHub】owner/repo」',
              defaultSelected: plainTitleReply.switch,
              isDisabled: !all.github.switch
            }),
            components.checkbox.group('plainTitleReply:types', {
              label: '补发标题触发类型',
              description: '选择哪些 GitHub 仓库内容类型在纯链接解析成功后补发标题',
              orientation: 'horizontal',
              defaultValue: plainTitleReply.types,
              isDisabled: !all.github.switch || !plainTitleReply.switch,
              checkbox: [
                components.checkbox.create('plainTitleReply:types:checkbox:text', {
                  label: '文字仓库',
                  value: 'text'
                }),
                components.checkbox.create('plainTitleReply:types:checkbox:image', {
                  label: '带图仓库',
                  value: 'image'
                })
              ]
            }),
            components.input.string('token', {
              label: 'GitHub Token',
              type: 'password',
              description: '可选。填写后优先调用 GitHub 官方 API，提高成功率与限流余量；留空时回退匿名模式',
              defaultValue: all.github.token || '',
              placeholder: '',
              isRequired: false,
              isDisabled: !all.github.switch
            }),
            components.divider.create('divider-github-proxy', {
              description: 'GitHub 专用代理配置（可选）',
              descPosition: 20
            }),
            components.switch.create('proxy:switch', {
              label: '代理开关',
              description: '只影响 GitHub 解析请求、重定向展开和渲染图资源抓取，不影响全局请求代理',
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
                components.radio.create('github-proxy-protocol-1', {
                  label: 'HTTP',
                  value: 'http'
                }),
                components.radio.create('github-proxy-protocol-2', {
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
