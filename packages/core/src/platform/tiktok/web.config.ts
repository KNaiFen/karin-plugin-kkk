import { components } from 'node-karin'

import { type ConfigType } from '@/types'
import { normalizePlainTitleReplyConfig } from '@/module/utils/PlainTitleReply'

/**
 * TikTok 配置组件
 * @param all 配置
 */
export const TikTokWeb = (all: ConfigType) => {
  const proxy = all.tiktok.proxy
  const plainTitleReply = normalizePlainTitleReplyConfig(all.tiktok.plainTitleReply, ['video'])

  return [
    components.accordion.create('tiktok', {
      label: 'TikTok 相关',
      children: [
        components.accordion.createItem('cfg:tiktok', {
          title: 'TikTok 相关',
          className: 'ml-4 mr-4',
          subtitle: '此处为 TikTok 视频解析设置',
          children: [
            components.switch.create('switch', {
              label: '解析开关',
              description: 'TikTok 解析开关，此开关为单独开关',
              defaultSelected: all.tiktok.switch
            }),
            components.divider.create('divider-tiktok-priority', {
              description: '解析优先级设置',
              descPosition: 20
            }),
            components.switch.create('videoTool', {
              label: '默认解析',
              description: 'TikTok 默认解析，即识别最高优先级；不受「插件应用相关」里的全局默认解析影响，修改后重启生效',
              defaultSelected: all.tiktok.videoTool
            }),
            components.input.number('priority', {
              label: '自定义优先级',
              description: 'TikTok 自定义优先级，「默认解析」关闭后才会生效。修改后重启生效',
              defaultValue: all.tiktok.priority.toString(),
              isDisabled: all.tiktok.videoTool,
              rules: undefined
            }),
            components.switch.create('plainTitleReply:switch', {
              label: '纯链接补发标题',
              description: '消息内容只有 TikTok 链接时，解析成功后额外发送「【TikTok】作者：标题」',
              defaultSelected: plainTitleReply.switch,
              isDisabled: !all.tiktok.switch
            }),
            components.checkbox.group('plainTitleReply:types', {
              label: '补发标题触发类型',
              description: '选择哪些 TikTok 内容类型在纯链接解析成功后补发标题',
              orientation: 'horizontal',
              defaultValue: plainTitleReply.types,
              isDisabled: !all.tiktok.switch || !plainTitleReply.switch,
              checkbox: [
                components.checkbox.create('plainTitleReply:types:checkbox:video', {
                  label: '视频',
                  value: 'video'
                })
              ]
            }),
            components.divider.create('divider-tiktok-proxy', {
              description: 'TikTok 专用代理配置（可选）',
              descPosition: 20
            }),
            components.switch.create('proxy:switch', {
              label: '代理开关',
              description: '只影响 TikTok 解析、下载和游客 Cookie 获取，不影响全局请求代理',
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
                components.radio.create('tiktok-proxy-protocol-1', {
                  label: 'HTTP',
                  value: 'http'
                }),
                components.radio.create('tiktok-proxy-protocol-2', {
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
