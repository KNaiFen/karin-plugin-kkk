import os from 'node:os'

import { components, defineConfig } from 'node-karin'
import _ from 'node-karin/lodash'

import { Root } from '@/module'
import { reloadAmagiConfig } from '@/module/utils/amagiClient'
import { Config } from '@/module/utils/Config'
import { createGuestCookieWebConfig, normalizeGuestCookieFrontendConfig } from '@/module/utils/guestCookieWebConfig'
import { BilibiliWeb } from '@/platform/bilibili/web.config'
import { DouyinWeb } from '@/platform/douyin/web.config'
import { GithubWeb } from '@/platform/github/web.config'
import { HeyboxWeb } from '@/platform/heybox/web.config'
import { KuaishouWeb } from '@/platform/kuaishou/web.config'
import { TiebaWeb } from '@/platform/tieba/web.config'
import { TikTokWeb } from '@/platform/tiktok/web.config'
import { WechatWeb } from '@/platform/wechat/web.config'
import { WeiboWeb } from '@/platform/weibo/web.config'
import { XWeb } from '@/platform/x/web.config'
import { XiaohongshuWeb } from '@/platform/xiaohongshu/web.config'
import { ZhihuWeb } from '@/platform/zhihu/web.config'
import { type ConfigType } from '@/types'
import type { detailedSummaryParseConfig, summaryParseConfig, transcriptOriginalConfig } from '@/types/config/app'

/**
 * 获取本机局域网 IP 地址
 * 优先返回常见局域网网段的 IP（192.168.x.x, 10.x.x.x, 172.16-31.x.x）
 */
function getLocalIP (): string {
  const interfaces = os.networkInterfaces()
  const candidates: string[] = []

  for (const name of Object.keys(interfaces)) {
    const netInterface = interfaces[name]
    if (!netInterface) continue
    for (const net of netInterface) {
      if (net.family === 'IPv4' && !net.internal) {
        candidates.push(net.address)
      }
    }
  }

  // 优先选择常见局域网网段
  const preferredIP = candidates.find(ip => {
    if (ip.startsWith('192.168.')) return true
    if (ip.startsWith('10.')) return true
    if (ip.startsWith('172.')) {
      const second = parseInt(ip.split('.')[1], 10)
      if (second >= 16 && second <= 31) return true
    }
    return false
  })

  return preferredIP || candidates[0] || '127.0.0.1'
}

/** 基础配置的类型 */
type BaseConfigType = {
  [key in keyof Omit<ConfigType, 'pushlist'>]: ConfigType[key]
}

/** 推送列表配置的类型，要单独处理 */
type PushConfigType = {
  'pushlist:douyin': ConfigType['pushlist']['douyin']
  'pushlist:bilibili': ConfigType['pushlist']['bilibili']
}

type SummaryParseFrontendModule = {
  summaryParse?: Array<Record<string, unknown>> | summaryParseConfig
  detailedSummaryParse?: Array<Record<string, unknown>> | detailedSummaryParseConfig
  transcriptOriginal?: Array<Record<string, unknown>> | transcriptOriginalConfig
}

type SummaryModuleKey = 'summaryParse' | 'detailedSummaryParse' | 'transcriptOriginal'
type FrontendModuleKey = keyof BaseConfigType | SummaryModuleKey

const summaryModuleKeys = new Set<SummaryModuleKey>(['summaryParse', 'detailedSummaryParse', 'transcriptOriginal'])

const isSummaryModuleKey = (key: string): key is SummaryModuleKey => {
  return summaryModuleKeys.has(key as SummaryModuleKey)
}

const normalizeSummaryModuleProp = (moduleKey: SummaryModuleKey, prop: string): string => {
  return prop.startsWith(`${moduleKey}:`) ? prop.slice(`${moduleKey}:`.length) : prop
}

/** 前端传回来新配置的类型 */
type newConfigType = BaseConfigType & PushConfigType & SummaryParseFrontendModule

const createSummaryParseAccordion = (all: ConfigType) => {
  const config = all.app.summaryParse
  const switchEnabled = config?.switch ?? false
  const reasoningEnabled = config?.llm?.reasoningEnabled ?? true

  return components.accordion.create('summaryParse', {
    label: '解析总结相关',
    children: [
      components.accordion.createItem('cfg:summaryParse', {
        title: '解析总结相关',
        className: 'ml-4 mr-4',
        subtitle: '解析链接后调用 OpenAI Responses 生成总结的专用设置',
        children: [
          components.divider.create('divider-summary-parse', {
            description: '解析总结配置',
            descPosition: 20
          }),
          components.switch.create('summaryParse:switch', {
            label: '启用解析总结',
            description: '命中 `#关键词 ` 开头的消息后，先解析链接内容，再调用 OpenAI Responses 生成总结',
            defaultSelected: config?.switch ?? false
          }),
          components.input.group('summaryParse:keywords', {
            label: '触发关键词',
            maxRows: 2,
            itemsPerRow: 4,
            data: config?.keywords ?? [],
            description: '不带前导 `#`；例如配置 `总结` 后，使用 `#总结 待解析内容`',
            template: components.input.string('summaryParse:keywords:item', {
              placeholder: '例如：总结',
              label: '',
              color: 'warning'
            })
          }),
          components.switch.create('summaryParse:sendParsedContent', {
            label: '继续发送原解析内容',
            description: '生成总结后，是否继续按原平台配置发送解析图文/视频等内容',
            defaultSelected: config?.sendParsedContent ?? false,
            isDisabled: !switchEnabled
          }),
          components.divider.create('divider-summary-parse-prompt-note', {
            description: '提示词为插件内置固定内容，并会根据本次实际输入是否包含图片/视频抽帧，以及是否启用联网搜索，自动切换对应版本',
            descPosition: 20
          }),
          components.input.string('summaryParse:llm:baseUrl', {
            label: 'Responses Base URL',
            type: 'text',
            description: 'OpenAI Responses API 接口基础地址',
            defaultValue: config?.llm?.baseUrl || '',
            placeholder: 'https://api.openai.com/v1',
            isRequired: false,
            isDisabled: !switchEnabled
          }),
          components.input.string('summaryParse:llm:apiKey', {
            label: 'Responses API Key',
            type: 'password',
            description: 'OpenAI Responses API 接口密钥',
            defaultValue: config?.llm?.apiKey || '',
            placeholder: '',
            isRequired: false,
            isDisabled: !switchEnabled
          }),
          components.input.string('summaryParse:llm:model', {
            label: 'Responses Model',
            type: 'text',
            description: 'OpenAI Responses API 模型名',
            defaultValue: config?.llm?.model || '',
            placeholder: 'gpt-4o-mini',
            isRequired: false,
            isDisabled: !switchEnabled
          }),
          components.input.number('summaryParse:llm:timeoutMs', {
            label: 'Responses 超时',
            description: '单位：毫秒',
            defaultValue: String(config?.llm?.timeoutMs ?? 60000),
            rules: [
              {
                min: 1000,
                max: 300000,
                error: '请输入一个范围在 1000 到 300000 之间的数字'
              }
            ],
            isDisabled: !switchEnabled
          }),
          components.input.number('summaryParse:llm:retryCount', {
            label: 'Responses 重试次数',
            description: '仅对超时、断连等瞬时失败生效；0 表示不重试',
            defaultValue: String(config?.llm?.retryCount ?? 1),
            rules: [
              {
                min: 0,
                max: 10,
                error: '请输入一个范围在 0 到 10 之间的数字'
              }
            ],
            isDisabled: !switchEnabled
          }),
          components.input.number('summaryParse:llm:retryDelayMs', {
            label: 'Responses 重试间隔',
            description: '单位：毫秒，失败后等待多久再发起下一次尝试',
            defaultValue: String(config?.llm?.retryDelayMs ?? 1500),
            rules: [
              {
                min: 0,
                max: 60000,
                error: '请输入一个范围在 0 到 60000 之间的数字'
              }
            ],
            isDisabled: !switchEnabled
          }),
          components.switch.create('summaryParse:llm:webSearchEnabled', {
            label: '启用联网搜索',
            description: '使用 OpenAI Responses 的 web_search 工具获取外部资料',
            defaultSelected: config?.llm?.webSearchEnabled ?? false,
            isDisabled: !switchEnabled
          }),
          components.switch.create('summaryParse:llm:reasoningEnabled', {
            label: '启用深度思考',
            description: '为支持的 Responses 模型显式设置 reasoning 参数',
            defaultSelected: config?.llm?.reasoningEnabled ?? true,
            isDisabled: !switchEnabled
          }),
          components.radio.group('summaryParse:llm:reasoningEffort', {
            label: '思考强度',
            description: 'OpenAI Responses reasoning.effort 参数',
            orientation: 'horizontal',
            defaultValue: config?.llm?.reasoningEffort || 'high',
            radio: [
              components.radio.create('summaryParse:llm:reasoningEffort-minimal', {
                label: 'Minimal',
                value: 'minimal'
              }),
              components.radio.create('summaryParse:llm:reasoningEffort-low', {
                label: 'Low',
                value: 'low'
              }),
              components.radio.create('summaryParse:llm:reasoningEffort-medium', {
                label: 'Medium',
                value: 'medium'
              }),
              components.radio.create('summaryParse:llm:reasoningEffort-high', {
                label: 'High',
                value: 'high'
              }),
              components.radio.create('summaryParse:llm:reasoningEffort-xhigh', {
                label: 'XHigh',
                value: 'xhigh'
              })
            ],
            isDisabled: !switchEnabled || !reasoningEnabled
          }),
          components.radio.group('summaryParse:asr:mode', {
            label: 'ASR 优先模式',
            description: '平台字幕不可用时，优先尝试云端还是本地 ASR',
            orientation: 'horizontal',
            defaultValue: config?.asr?.mode || 'cloud',
            radio: [
              components.radio.create('summaryParse:asr:mode-cloud', {
                label: '云端优先',
                value: 'cloud'
              }),
              components.radio.create('summaryParse:asr:mode-local', {
                label: '本地优先',
                value: 'local'
              })
            ],
            isDisabled: !switchEnabled
          }),
          components.input.string('summaryParse:asr:whisperCppPath', {
            label: 'whisper.cpp 路径',
            type: 'text',
            description: '本地 whisper.cpp CLI 可执行文件路径',
            defaultValue: config?.asr?.whisperCppPath || '',
            placeholder: 'whisper-cli',
            isRequired: false,
            isDisabled: !switchEnabled
          }),
          components.input.string('summaryParse:asr:modelPath', {
            label: 'whisper.cpp 模型路径',
            type: 'text',
            description: 'whisper.cpp 使用的模型文件路径',
            defaultValue: all.app.summaryParse?.asr?.modelPath || '',
            placeholder: '/models/ggml-base.bin',
            isRequired: false,
            isDisabled: !(all.app.summaryParse?.switch ?? false)
          }),
          components.input.string('summaryParse:asr:language', {
            label: 'ASR 语言',
            type: 'text',
            description: '例如 zh、en、ja',
            defaultValue: all.app.summaryParse?.asr?.language || 'zh',
            placeholder: 'zh',
            isRequired: false,
            isDisabled: !(all.app.summaryParse?.switch ?? false)
          }),
          components.input.number('summaryParse:asr:threads', {
            label: 'ASR 线程数',
            description: '调用 whisper.cpp 时使用的线程数',
            defaultValue: String(all.app.summaryParse?.asr?.threads ?? 4),
            rules: [
              {
                min: 1,
                max: 128,
                error: '请输入一个范围在 1 到 128 之间的数字'
              }
            ],
            isDisabled: !(all.app.summaryParse?.switch ?? false)
          }),
          components.input.string('summaryParse:asr:ffmpegPath', {
            label: 'ffmpeg 路径',
            type: 'text',
            description: '用于从视频抽取音频的 ffmpeg 可执行文件路径',
            defaultValue: all.app.summaryParse?.asr?.ffmpegPath || '',
            placeholder: 'ffmpeg',
            isRequired: false,
            isDisabled: !(all.app.summaryParse?.switch ?? false)
          }),
          components.input.number('summaryParse:asr:audioBitrateKbps', {
            label: '抽音码率',
            description: '单位：kbps，用于控制送 ASR 的音频体积',
            defaultValue: String(all.app.summaryParse?.asr?.audioBitrateKbps ?? 24),
            rules: [
              {
                min: 8,
                max: 320,
                error: '请输入一个范围在 8 到 320 之间的数字'
              }
            ],
            isDisabled: !(all.app.summaryParse?.switch ?? false)
          }),
          components.input.number('summaryParse:asr:maxSegmentMinutes', {
            label: '最长切片时长',
            description: '单位：分钟，超出时会自动按段切分后再转写',
            defaultValue: String(all.app.summaryParse?.asr?.maxSegmentMinutes ?? 30),
            rules: [
              {
                min: 1,
                max: 60,
                error: '请输入一个范围在 1 到 60 之间的数字'
              }
            ],
            isDisabled: !(all.app.summaryParse?.switch ?? false)
          }),
          components.input.string('summaryParse:asr:cloud:baseUrl', {
            label: '云端 ASR Base URL',
            type: 'text',
            description: 'OpenAI-compatible 音频转写接口基础地址',
            defaultValue: all.app.summaryParse?.asr?.cloud?.baseUrl || '',
            placeholder: 'https://api.siliconflow.cn/v1',
            isRequired: false,
            isDisabled: !(all.app.summaryParse?.switch ?? false)
          }),
          components.input.string('summaryParse:asr:cloud:apiKey', {
            label: '云端 ASR API Key',
            type: 'password',
            description: '云端音频转写接口密钥',
            defaultValue: all.app.summaryParse?.asr?.cloud?.apiKey || '',
            placeholder: '',
            isRequired: false,
            isDisabled: !(all.app.summaryParse?.switch ?? false)
          }),
          components.input.string('summaryParse:asr:cloud:model', {
            label: '云端 ASR Model',
            type: 'text',
            description: '云端音频转写模型名',
            defaultValue: all.app.summaryParse?.asr?.cloud?.model || '',
            placeholder: 'FunAudioLLM/SenseVoiceSmall',
            isRequired: false,
            isDisabled: !(all.app.summaryParse?.switch ?? false)
          }),
          components.input.number('summaryParse:asr:cloud:timeoutMs', {
            label: '云端 ASR 超时',
            description: '单位：毫秒',
            defaultValue: String(all.app.summaryParse?.asr?.cloud?.timeoutMs ?? 45000),
            rules: [
              {
                min: 1000,
                max: 300000,
                error: '请输入一个范围在 1000 到 300000 之间的数字'
              }
            ],
            isDisabled: !(all.app.summaryParse?.switch ?? false)
          }),
          components.input.number('summaryParse:asr:cloud:retryCount', {
            label: '云端 ASR 重试次数',
            description: '仅对云端音频转写的超时、断连等瞬时失败生效；0 表示不重试',
            defaultValue: String(all.app.summaryParse?.asr?.cloud?.retryCount ?? 1),
            rules: [
              {
                min: 0,
                max: 10,
                error: '请输入一个范围在 0 到 10 之间的数字'
              }
            ],
            isDisabled: !(all.app.summaryParse?.switch ?? false)
          }),
          components.input.number('summaryParse:asr:cloud:retryDelayMs', {
            label: '云端 ASR 重试间隔',
            description: '单位：毫秒，失败后等待多久再发起下一次云端转写',
            defaultValue: String(all.app.summaryParse?.asr?.cloud?.retryDelayMs ?? 1500),
            rules: [
              {
                min: 0,
                max: 60000,
                error: '请输入一个范围在 0 到 60000 之间的数字'
              }
            ],
            isDisabled: !(all.app.summaryParse?.switch ?? false)
          }),
          components.divider.create('divider-summary-parse-video-frames', {
            description: '视频抽帧配置',
            descPosition: 20
          }),
          components.switch.create('summaryParse:asr:videoFrames:enabled', {
            label: '启用视频抽帧',
            description: '从视频中按时间间隔导出画面，并作为多模态图片一起发给 LLM',
            defaultSelected: all.app.summaryParse?.asr?.videoFrames?.enabled ?? false,
            isDisabled: !(all.app.summaryParse?.switch ?? false)
          }),
          components.radio.group('summaryParse:asr:videoFrames:sourceMode', {
            label: '抽帧视频源',
            description: '自动：开启“继续发送原解析内容”时用正常解析质量，否则优先最小体积视频源',
            orientation: 'horizontal',
            defaultValue: all.app.summaryParse?.asr?.videoFrames?.sourceMode || 'auto',
            radio: [
              components.radio.create('summaryParse:asr:videoFrames:sourceMode-auto', {
                label: '自动',
                value: 'auto'
              }),
              components.radio.create('summaryParse:asr:videoFrames:sourceMode-summary-optimized', {
                label: '最小体积',
                value: 'summary_optimized'
              }),
              components.radio.create('summaryParse:asr:videoFrames:sourceMode-parsed-content', {
                label: '正常解析质量',
                value: 'parsed_content'
              })
            ],
            isDisabled: !(all.app.summaryParse?.switch ?? false) || !(all.app.summaryParse?.asr?.videoFrames?.enabled ?? false)
          }),
          components.input.number('summaryParse:asr:videoFrames:minIntervalSeconds', {
            label: '最低抽图间隔',
            description: '单位：秒；短视频按该间隔抽图，长视频会自动拉大间隔以满足最大数量限制',
            defaultValue: String(all.app.summaryParse?.asr?.videoFrames?.minIntervalSeconds ?? 30),
            rules: [
              {
                min: 1,
                max: 3600,
                error: '请输入一个范围在 1 到 3600 之间的数字'
              }
            ],
            isDisabled: !(all.app.summaryParse?.switch ?? false) || !(all.app.summaryParse?.asr?.videoFrames?.enabled ?? false)
          }),
          components.input.number('summaryParse:asr:videoFrames:maxImages', {
            label: '最大抽图数量',
            description: '长视频达到上限后会自动增大抽图间隔',
            defaultValue: String(all.app.summaryParse?.asr?.videoFrames?.maxImages ?? 6),
            rules: [
              {
                min: 1,
                max: 60,
                error: '请输入一个范围在 1 到 60 之间的数字'
              }
            ],
            isDisabled: !(all.app.summaryParse?.switch ?? false) || !(all.app.summaryParse?.asr?.videoFrames?.enabled ?? false)
          }),
          components.input.number('summaryParse:asr:videoFrames:skipStartSeconds', {
            label: '跳过片头秒数',
            description: '抽图时避开视频开头若干秒，减少片头空镜或片头 logo 干扰',
            defaultValue: String(all.app.summaryParse?.asr?.videoFrames?.skipStartSeconds ?? 3),
            rules: [
              {
                min: 0,
                max: 600,
                error: '请输入一个范围在 0 到 600 之间的数字'
              }
            ],
            isDisabled: !(all.app.summaryParse?.switch ?? false) || !(all.app.summaryParse?.asr?.videoFrames?.enabled ?? false)
          }),
          components.input.number('summaryParse:asr:videoFrames:skipEndSeconds', {
            label: '跳过片尾秒数',
            description: '抽图时避开视频结尾若干秒，减少片尾字幕、黑场或结束页干扰',
            defaultValue: String(all.app.summaryParse?.asr?.videoFrames?.skipEndSeconds ?? 3),
            rules: [
              {
                min: 0,
                max: 600,
                error: '请输入一个范围在 0 到 600 之间的数字'
              }
            ],
            isDisabled: !(all.app.summaryParse?.switch ?? false) || !(all.app.summaryParse?.asr?.videoFrames?.enabled ?? false)
          })
        ]
      })
    ]
  })
}

const createDetailedSummaryParseAccordion = (all: ConfigType) => {
  const config = all.app.detailedSummaryParse
  const switchEnabled = config?.switch ?? false
  const markdownRenderEnabled = config?.markdownRender?.enabled ?? false
  const videoFramesEnabled = config?.asr?.videoFrames?.enabled ?? false
  const reasoningEnabled = config?.llm?.reasoningEnabled ?? true

  return components.accordion.create('detailedSummaryParse', {
    label: '详细解析总结相关',
    children: [
      components.accordion.createItem('cfg:detailedSummaryParse', {
        title: '详细解析总结相关',
        className: 'ml-4 mr-4',
        subtitle: '解析链接后调用 OpenAI Responses 生成详细研报的专用设置',
        children: [
          components.divider.create('divider-detailed-summary-parse', {
            description: '详细解析总结配置',
            descPosition: 20
          }),
          components.switch.create('detailedSummaryParse:switch', {
            label: '启用详细解析总结',
            description: '命中 `#关键词 ` 开头的消息后，先解析链接内容，再调用 OpenAI Responses 生成详细研报',
            defaultSelected: switchEnabled
          }),
          components.input.group('detailedSummaryParse:keywords', {
            label: '触发关键词',
            maxRows: 2,
            itemsPerRow: 4,
            data: config?.keywords ?? [],
            description: '不带前导 `#`；例如配置 `详细总结` 后，使用 `#详细总结 待解析内容`',
            template: components.input.string('detailedSummaryParse:keywords:item', {
              placeholder: '例如：详细总结',
              label: '',
              color: 'warning'
            })
          }),
          components.switch.create('detailedSummaryParse:sendParsedContent', {
            label: '继续发送原解析内容',
            description: '生成详细研报后，是否继续按原平台配置发送解析图文/视频等内容',
            defaultSelected: config?.sendParsedContent ?? false,
            isDisabled: !switchEnabled
          }),
          components.switch.create('detailedSummaryParse:markdownRender:enabled', {
            label: '启用 Markdown 渲染图',
            description: '要求 LLM 输出原生 Markdown，并由插件内置渲染链路生成截图；失败时自动回退纯文本',
            defaultSelected: markdownRenderEnabled,
            isDisabled: !switchEnabled
          }),
          components.switch.create('detailedSummaryParse:markdownRender:sendTextVersion', {
            label: '附带纯文字版',
            description: '在截图合集后附带一份清洗过 Markdown 标记的纯文字版，便于复制和检索',
            defaultSelected: config?.markdownRender?.sendTextVersion ?? false,
            isDisabled: !switchEnabled || !markdownRenderEnabled
          }),
          components.input.number('detailedSummaryParse:markdownRender:fontSizePx', {
            label: 'Markdown 字体大小',
            description: '单位：px，仅对详细研报 Markdown 渲染图生效',
            defaultValue: String(config?.markdownRender?.fontSizePx ?? 16),
            rules: [
              {
                min: 12,
                max: 24,
                error: '请输入一个范围在 12 到 24 之间的数字'
              }
            ],
            isDisabled: !switchEnabled || !markdownRenderEnabled
          }),
          components.switch.create('detailedSummaryParse:markdownRender:multiPageEnabled', {
            label: '启用 Markdown 独立分页',
            description: '根据详细研报自身内容长度单独分页，不受全局渲染分页开关影响',
            defaultSelected: config?.markdownRender?.multiPageEnabled ?? true,
            isDisabled: !switchEnabled || !markdownRenderEnabled
          }),
          components.input.number('detailedSummaryParse:markdownRender:multiPageTriggerAspectRatio', {
            label: 'Markdown 分页触发比例',
            description: '当 Markdown 渲染图的高宽比超过该值时开始分页，默认 3',
            defaultValue: String(config?.markdownRender?.multiPageTriggerAspectRatio ?? 3),
            rules: [
              {
                min: 1.2,
                max: 10,
                error: '请输入一个范围在 1.2 到 10 之间的数字'
              }
            ],
            isDisabled: !switchEnabled || !markdownRenderEnabled || !(config?.markdownRender?.multiPageEnabled ?? true)
          }),
          components.input.number('detailedSummaryParse:markdownRender:multiPageMaxAspectRatio', {
            label: 'Markdown 分页后单页比例',
            description: '分页后每一页允许的最大高宽比，默认 2.2',
            defaultValue: String(config?.markdownRender?.multiPageMaxAspectRatio ?? 2.2),
            rules: [
              {
                min: 1.1,
                max: 10,
                error: '请输入一个范围在 1.1 到 10 之间的数字'
              }
            ],
            isDisabled: !switchEnabled || !markdownRenderEnabled || !(config?.markdownRender?.multiPageEnabled ?? true)
          }),
          components.divider.create('divider-detailed-summary-parse-prompt-note', {
            description: '提示词为插件内置固定研报模板，并会根据 Markdown 开关和本次输入是否包含图片/视频抽帧自动切换纯文本版、多模态版或 Markdown 版',
            descPosition: 20
          }),
          components.input.string('detailedSummaryParse:llm:baseUrl', {
            label: 'Responses Base URL',
            type: 'text',
            description: 'OpenAI Responses API 接口基础地址',
            defaultValue: config?.llm?.baseUrl || '',
            placeholder: 'https://api.openai.com/v1',
            isRequired: false,
            isDisabled: !switchEnabled
          }),
          components.input.string('detailedSummaryParse:llm:apiKey', {
            label: 'Responses API Key',
            type: 'password',
            description: 'OpenAI Responses API 接口密钥',
            defaultValue: config?.llm?.apiKey || '',
            placeholder: '',
            isRequired: false,
            isDisabled: !switchEnabled
          }),
          components.input.string('detailedSummaryParse:llm:model', {
            label: 'Responses Model',
            type: 'text',
            description: 'OpenAI Responses API 模型名',
            defaultValue: config?.llm?.model || '',
            placeholder: 'gpt-5',
            isRequired: false,
            isDisabled: !switchEnabled
          }),
          components.input.number('detailedSummaryParse:llm:timeoutMs', {
            label: 'Responses 超时',
            description: '单位：毫秒',
            defaultValue: String(config?.llm?.timeoutMs ?? 90000),
            rules: [
              {
                min: 1000,
                max: 300000,
                error: '请输入一个范围在 1000 到 300000 之间的数字'
              }
            ],
            isDisabled: !switchEnabled
          }),
          components.input.number('detailedSummaryParse:llm:retryCount', {
            label: 'Responses 重试次数',
            description: '仅对超时、断连等瞬时失败生效；0 表示不重试',
            defaultValue: String(config?.llm?.retryCount ?? 1),
            rules: [
              {
                min: 0,
                max: 10,
                error: '请输入一个范围在 0 到 10 之间的数字'
              }
            ],
            isDisabled: !switchEnabled
          }),
          components.input.number('detailedSummaryParse:llm:retryDelayMs', {
            label: 'Responses 重试间隔',
            description: '单位：毫秒，失败后等待多久再发起下一次尝试',
            defaultValue: String(config?.llm?.retryDelayMs ?? 1500),
            rules: [
              {
                min: 0,
                max: 60000,
                error: '请输入一个范围在 0 到 60000 之间的数字'
              }
            ],
            isDisabled: !switchEnabled
          }),
          components.switch.create('detailedSummaryParse:llm:webSearchEnabled', {
            label: '启用联网搜索',
            description: '使用 OpenAI Responses 的 web_search 工具联网补充与交叉验证资料',
            defaultSelected: config?.llm?.webSearchEnabled ?? true,
            isDisabled: !switchEnabled
          }),
          components.switch.create('detailedSummaryParse:llm:reasoningEnabled', {
            label: '启用深度思考',
            description: '为支持的 Responses 模型显式设置 reasoning 参数',
            defaultSelected: config?.llm?.reasoningEnabled ?? true,
            isDisabled: !switchEnabled
          }),
          components.radio.group('detailedSummaryParse:llm:reasoningEffort', {
            label: '思考强度',
            description: 'OpenAI Responses reasoning.effort 参数',
            orientation: 'horizontal',
            defaultValue: config?.llm?.reasoningEffort || 'high',
            radio: [
              components.radio.create('detailedSummaryParse:llm:reasoningEffort-minimal', {
                label: 'Minimal',
                value: 'minimal'
              }),
              components.radio.create('detailedSummaryParse:llm:reasoningEffort-low', {
                label: 'Low',
                value: 'low'
              }),
              components.radio.create('detailedSummaryParse:llm:reasoningEffort-medium', {
                label: 'Medium',
                value: 'medium'
              }),
              components.radio.create('detailedSummaryParse:llm:reasoningEffort-high', {
                label: 'High',
                value: 'high'
              }),
              components.radio.create('detailedSummaryParse:llm:reasoningEffort-xhigh', {
                label: 'XHigh',
                value: 'xhigh'
              })
            ],
            isDisabled: !switchEnabled || !reasoningEnabled
          }),
          components.radio.group('detailedSummaryParse:asr:mode', {
            label: 'ASR 优先模式',
            description: '平台字幕不可用时，优先尝试云端还是本地 ASR',
            orientation: 'horizontal',
            defaultValue: config?.asr?.mode || 'cloud',
            radio: [
              components.radio.create('detailedSummaryParse:asr:mode-cloud', {
                label: '云端优先',
                value: 'cloud'
              }),
              components.radio.create('detailedSummaryParse:asr:mode-local', {
                label: '本地优先',
                value: 'local'
              })
            ],
            isDisabled: !switchEnabled
          }),
          components.input.string('detailedSummaryParse:asr:whisperCppPath', {
            label: 'whisper.cpp 路径',
            type: 'text',
            description: '本地 whisper.cpp CLI 可执行文件路径',
            defaultValue: config?.asr?.whisperCppPath || '',
            placeholder: 'whisper-cli',
            isRequired: false,
            isDisabled: !switchEnabled
          }),
          components.input.string('detailedSummaryParse:asr:modelPath', {
            label: 'whisper.cpp 模型路径',
            type: 'text',
            description: 'whisper.cpp 使用的模型文件路径',
            defaultValue: config?.asr?.modelPath || '',
            placeholder: '/models/ggml-base.bin',
            isRequired: false,
            isDisabled: !switchEnabled
          }),
          components.input.string('detailedSummaryParse:asr:language', {
            label: 'ASR 语言',
            type: 'text',
            description: '例如 zh、en、ja',
            defaultValue: config?.asr?.language || 'zh',
            placeholder: 'zh',
            isRequired: false,
            isDisabled: !switchEnabled
          }),
          components.input.number('detailedSummaryParse:asr:threads', {
            label: 'ASR 线程数',
            description: '调用 whisper.cpp 时使用的线程数',
            defaultValue: String(config?.asr?.threads ?? 4),
            rules: [
              {
                min: 1,
                max: 128,
                error: '请输入一个范围在 1 到 128 之间的数字'
              }
            ],
            isDisabled: !switchEnabled
          }),
          components.input.string('detailedSummaryParse:asr:ffmpegPath', {
            label: 'ffmpeg 路径',
            type: 'text',
            description: '用于从视频抽取音频的 ffmpeg 可执行文件路径',
            defaultValue: config?.asr?.ffmpegPath || '',
            placeholder: 'ffmpeg',
            isRequired: false,
            isDisabled: !switchEnabled
          }),
          components.input.number('detailedSummaryParse:asr:audioBitrateKbps', {
            label: '抽音码率',
            description: '单位：kbps，用于控制送 ASR 的音频体积',
            defaultValue: String(config?.asr?.audioBitrateKbps ?? 24),
            rules: [
              {
                min: 8,
                max: 320,
                error: '请输入一个范围在 8 到 320 之间的数字'
              }
            ],
            isDisabled: !switchEnabled
          }),
          components.input.number('detailedSummaryParse:asr:maxSegmentMinutes', {
            label: '最长切片时长',
            description: '单位：分钟，超出时会自动按段切分后再转写',
            defaultValue: String(config?.asr?.maxSegmentMinutes ?? 30),
            rules: [
              {
                min: 1,
                max: 60,
                error: '请输入一个范围在 1 到 60 之间的数字'
              }
            ],
            isDisabled: !switchEnabled
          }),
          components.input.string('detailedSummaryParse:asr:cloud:baseUrl', {
            label: '云端 ASR Base URL',
            type: 'text',
            description: 'OpenAI-compatible 音频转写接口基础地址',
            defaultValue: config?.asr?.cloud?.baseUrl || '',
            placeholder: 'https://api.siliconflow.cn/v1',
            isRequired: false,
            isDisabled: !switchEnabled
          }),
          components.input.string('detailedSummaryParse:asr:cloud:apiKey', {
            label: '云端 ASR API Key',
            type: 'password',
            description: '云端音频转写接口密钥',
            defaultValue: config?.asr?.cloud?.apiKey || '',
            placeholder: '',
            isRequired: false,
            isDisabled: !switchEnabled
          }),
          components.input.string('detailedSummaryParse:asr:cloud:model', {
            label: '云端 ASR Model',
            type: 'text',
            description: '云端音频转写模型名',
            defaultValue: config?.asr?.cloud?.model || '',
            placeholder: 'gpt-4o-mini-transcribe',
            isRequired: false,
            isDisabled: !switchEnabled
          }),
          components.input.number('detailedSummaryParse:asr:cloud:timeoutMs', {
            label: '云端 ASR 超时',
            description: '单位：毫秒',
            defaultValue: String(config?.asr?.cloud?.timeoutMs ?? 45000),
            rules: [
              {
                min: 1000,
                max: 300000,
                error: '请输入一个范围在 1000 到 300000 之间的数字'
              }
            ],
            isDisabled: !switchEnabled
          }),
          components.input.number('detailedSummaryParse:asr:cloud:retryCount', {
            label: '云端 ASR 重试次数',
            description: '仅对云端音频转写的超时、断连等瞬时失败生效；0 表示不重试',
            defaultValue: String(config?.asr?.cloud?.retryCount ?? 1),
            rules: [
              {
                min: 0,
                max: 10,
                error: '请输入一个范围在 0 到 10 之间的数字'
              }
            ],
            isDisabled: !switchEnabled
          }),
          components.input.number('detailedSummaryParse:asr:cloud:retryDelayMs', {
            label: '云端 ASR 重试间隔',
            description: '单位：毫秒，失败后等待多久再发起下一次云端转写',
            defaultValue: String(config?.asr?.cloud?.retryDelayMs ?? 1500),
            rules: [
              {
                min: 0,
                max: 60000,
                error: '请输入一个范围在 0 到 60000 之间的数字'
              }
            ],
            isDisabled: !switchEnabled
          }),
          components.divider.create('divider-detailed-summary-parse-video-frames', {
            description: '视频抽帧配置',
            descPosition: 20
          }),
          components.switch.create('detailedSummaryParse:asr:videoFrames:enabled', {
            label: '启用视频抽帧',
            description: '从视频中按时间间隔导出画面，并作为多模态图片一起发给 LLM',
            defaultSelected: videoFramesEnabled,
            isDisabled: !switchEnabled
          }),
          components.radio.group('detailedSummaryParse:asr:videoFrames:sourceMode', {
            label: '抽帧视频源',
            description: '自动：开启“继续发送原解析内容”时用正常解析质量，否则优先最小体积视频源',
            orientation: 'horizontal',
            defaultValue: config?.asr?.videoFrames?.sourceMode || 'auto',
            radio: [
              components.radio.create('detailedSummaryParse:asr:videoFrames:sourceMode-auto', {
                label: '自动',
                value: 'auto'
              }),
              components.radio.create('detailedSummaryParse:asr:videoFrames:sourceMode-summary-optimized', {
                label: '最小体积',
                value: 'summary_optimized'
              }),
              components.radio.create('detailedSummaryParse:asr:videoFrames:sourceMode-parsed-content', {
                label: '正常解析质量',
                value: 'parsed_content'
              })
            ],
            isDisabled: !switchEnabled || !videoFramesEnabled
          }),
          components.input.number('detailedSummaryParse:asr:videoFrames:minIntervalSeconds', {
            label: '最低抽图间隔',
            description: '单位：秒；短视频按该间隔抽图，长视频会自动拉大间隔以满足最大数量限制',
            defaultValue: String(config?.asr?.videoFrames?.minIntervalSeconds ?? 30),
            rules: [
              {
                min: 1,
                max: 3600,
                error: '请输入一个范围在 1 到 3600 之间的数字'
              }
            ],
            isDisabled: !switchEnabled || !videoFramesEnabled
          }),
          components.input.number('detailedSummaryParse:asr:videoFrames:maxImages', {
            label: '最大抽图数量',
            description: '长视频达到上限后会自动增大抽图间隔',
            defaultValue: String(config?.asr?.videoFrames?.maxImages ?? 6),
            rules: [
              {
                min: 1,
                max: 60,
                error: '请输入一个范围在 1 到 60 之间的数字'
              }
            ],
            isDisabled: !switchEnabled || !videoFramesEnabled
          }),
          components.input.number('detailedSummaryParse:asr:videoFrames:skipStartSeconds', {
            label: '跳过片头秒数',
            description: '抽图时避开视频开头若干秒，减少片头空镜或片头 logo 干扰',
            defaultValue: String(config?.asr?.videoFrames?.skipStartSeconds ?? 3),
            rules: [
              {
                min: 0,
                max: 600,
                error: '请输入一个范围在 0 到 600 之间的数字'
              }
            ],
            isDisabled: !switchEnabled || !videoFramesEnabled
          }),
          components.input.number('detailedSummaryParse:asr:videoFrames:skipEndSeconds', {
            label: '跳过片尾秒数',
            description: '抽图时避开视频结尾若干秒，减少片尾字幕、黑场或结束页干扰',
            defaultValue: String(config?.asr?.videoFrames?.skipEndSeconds ?? 3),
            rules: [
              {
                min: 0,
                max: 600,
                error: '请输入一个范围在 0 到 600 之间的数字'
              }
            ],
            isDisabled: !switchEnabled || !videoFramesEnabled
          })
        ]
      })
    ]
  })
}

const createTranscriptOriginalAccordion = (all: ConfigType) => {
  const config = all.app.transcriptOriginal
  const switchEnabled = config?.switch ?? false
  const markdownRenderEnabled = config?.markdownRender?.enabled ?? false
  const videoFramesEnabled = config?.asr?.videoFrames?.enabled ?? false
  const reasoningEnabled = config?.llm?.reasoningEnabled ?? true

  return components.accordion.create('transcriptOriginal', {
    label: '转写原文相关',
    children: [
      components.accordion.createItem('cfg:transcriptOriginal', {
        title: '转写原文相关',
        className: 'ml-4 mr-4',
        subtitle: '解析链接后调用 OpenAI Responses 整理字幕 / ASR 原文',
        children: [
          components.divider.create('divider-transcript-original', {
            description: '转写原文配置',
            descPosition: 20
          }),
          components.switch.create('transcriptOriginal:switch', {
            label: '启用转写原文',
            description: '命中 `#关键词 ` 开头的消息后，先解析链接内容，再调用 OpenAI Responses 整理字幕 / ASR 原文',
            defaultSelected: switchEnabled
          }),
          components.input.group('transcriptOriginal:keywords', {
            label: '触发关键词',
            maxRows: 2,
            itemsPerRow: 4,
            data: config?.keywords ?? [],
            description: '不带前导 `#`；例如配置 `转写原文` 后，使用 `#转写原文 待解析内容`',
            template: components.input.string('transcriptOriginal:keywords:item', {
              placeholder: '例如：转写原文',
              label: '',
              color: 'warning'
            })
          }),
          components.switch.create('transcriptOriginal:sendParsedContent', {
            label: '继续发送原解析内容',
            description: '生成转写原文后，是否继续按原平台配置发送解析图文 / 视频等内容',
            defaultSelected: config?.sendParsedContent ?? false,
            isDisabled: !switchEnabled
          }),
          components.switch.create('transcriptOriginal:markdownRender:enabled', {
            label: '启用 Markdown 渲染图',
            description: '要求 LLM 输出原生 Markdown，并由插件内置渲染链路生成截图；失败时会自动回退纯文本',
            defaultSelected: markdownRenderEnabled,
            isDisabled: !switchEnabled
          }),
          components.switch.create('transcriptOriginal:markdownRender:sendTextVersion', {
            label: '附带纯文字版',
            description: '在截图合集后附带一份清洗过 Markdown 标记的纯文字版，便于复制和检索',
            defaultSelected: config?.markdownRender?.sendTextVersion ?? false,
            isDisabled: !switchEnabled || !markdownRenderEnabled
          }),
          components.input.number('transcriptOriginal:markdownRender:fontSizePx', {
            label: 'Markdown 字体大小',
            description: '单位：px，仅对转写原文 Markdown 渲染图生效',
            defaultValue: String(config?.markdownRender?.fontSizePx ?? 16),
            rules: [
              {
                min: 12,
                max: 24,
                error: '请输入一个范围在 12 到 24 之间的数字'
              }
            ],
            isDisabled: !switchEnabled || !markdownRenderEnabled
          }),
          components.switch.create('transcriptOriginal:markdownRender:multiPageEnabled', {
            label: '启用 Markdown 独立分页',
            description: '根据转写原文自身内容长度单独分页，不受全局渲染分页开关影响',
            defaultSelected: config?.markdownRender?.multiPageEnabled ?? true,
            isDisabled: !switchEnabled || !markdownRenderEnabled
          }),
          components.input.number('transcriptOriginal:markdownRender:multiPageTriggerAspectRatio', {
            label: 'Markdown 分页触发比例',
            description: '当 Markdown 渲染图的高宽比超过该值时开始分页，默认 3',
            defaultValue: String(config?.markdownRender?.multiPageTriggerAspectRatio ?? 3),
            rules: [
              {
                min: 1.2,
                max: 10,
                error: '请输入一个范围在 1.2 到 10 之间的数字'
              }
            ],
            isDisabled: !switchEnabled || !markdownRenderEnabled || !(config?.markdownRender?.multiPageEnabled ?? true)
          }),
          components.input.number('transcriptOriginal:markdownRender:multiPageMaxAspectRatio', {
            label: 'Markdown 分页后单页比例',
            description: '分页后每一页允许的最大高宽比，默认 2.2',
            defaultValue: String(config?.markdownRender?.multiPageMaxAspectRatio ?? 2.2),
            rules: [
              {
                min: 1.1,
                max: 10,
                error: '请输入一个范围在 1.1 到 10 之间的数字'
              }
            ],
            isDisabled: !switchEnabled || !markdownRenderEnabled || !(config?.markdownRender?.multiPageEnabled ?? true)
          }),
          components.divider.create('divider-transcript-original-prompt-note', {
            description: '提示词为插件内置固定原文整理模板，并会根据 Markdown 开关和本次输入是否包含图片 / 视频抽帧自动切换纯文本版、多模态版或 Markdown 版',
            descPosition: 20
          }),
          components.input.string('transcriptOriginal:llm:baseUrl', {
            label: 'Responses Base URL',
            type: 'text',
            description: 'OpenAI Responses API 接口基础地址',
            defaultValue: config?.llm?.baseUrl || '',
            placeholder: 'https://api.openai.com/v1',
            isRequired: false,
            isDisabled: !switchEnabled
          }),
          components.input.string('transcriptOriginal:llm:apiKey', {
            label: 'Responses API Key',
            type: 'password',
            description: 'OpenAI Responses API 接口密钥',
            defaultValue: config?.llm?.apiKey || '',
            placeholder: '',
            isRequired: false,
            isDisabled: !switchEnabled
          }),
          components.input.string('transcriptOriginal:llm:model', {
            label: 'Responses Model',
            type: 'text',
            description: 'OpenAI Responses API 模型名',
            defaultValue: config?.llm?.model || '',
            placeholder: 'gpt-5',
            isRequired: false,
            isDisabled: !switchEnabled
          }),
          components.input.number('transcriptOriginal:llm:timeoutMs', {
            label: 'Responses 超时',
            description: '单位：毫秒',
            defaultValue: String(config?.llm?.timeoutMs ?? 90000),
            rules: [
              {
                min: 1000,
                max: 300000,
                error: '请输入一个范围在 1000 到 300000 之间的数字'
              }
            ],
            isDisabled: !switchEnabled
          }),
          components.input.number('transcriptOriginal:llm:retryCount', {
            label: 'Responses 重试次数',
            description: '仅对超时、断连等瞬时失败生效；0 表示不重试',
            defaultValue: String(config?.llm?.retryCount ?? 1),
            rules: [
              {
                min: 0,
                max: 10,
                error: '请输入一个范围在 0 到 10 之间的数字'
              }
            ],
            isDisabled: !switchEnabled
          }),
          components.input.number('transcriptOriginal:llm:retryDelayMs', {
            label: 'Responses 重试间隔',
            description: '单位：毫秒，失败后等待多久再发起下一次尝试',
            defaultValue: String(config?.llm?.retryDelayMs ?? 1500),
            rules: [
              {
                min: 0,
                max: 60000,
                error: '请输入一个范围在 0 到 60000 之间的数字'
              }
            ],
            isDisabled: !switchEnabled
          }),
          components.switch.create('transcriptOriginal:llm:reasoningEnabled', {
            label: '启用深度思考',
            description: '为支持的 Responses 模型显式设置 reasoning 参数',
            defaultSelected: config?.llm?.reasoningEnabled ?? true,
            isDisabled: !switchEnabled
          }),
          components.radio.group('transcriptOriginal:llm:reasoningEffort', {
            label: '思考强度',
            description: 'OpenAI Responses reasoning.effort 参数',
            orientation: 'horizontal',
            defaultValue: config?.llm?.reasoningEffort || 'high',
            radio: [
              components.radio.create('transcriptOriginal:llm:reasoningEffort-minimal', {
                label: 'Minimal',
                value: 'minimal'
              }),
              components.radio.create('transcriptOriginal:llm:reasoningEffort-low', {
                label: 'Low',
                value: 'low'
              }),
              components.radio.create('transcriptOriginal:llm:reasoningEffort-medium', {
                label: 'Medium',
                value: 'medium'
              }),
              components.radio.create('transcriptOriginal:llm:reasoningEffort-high', {
                label: 'High',
                value: 'high'
              }),
              components.radio.create('transcriptOriginal:llm:reasoningEffort-xhigh', {
                label: 'XHigh',
                value: 'xhigh'
              })
            ],
            isDisabled: !switchEnabled || !reasoningEnabled
          }),
          components.radio.group('transcriptOriginal:asr:mode', {
            label: 'ASR 优先模式',
            description: '平台字幕不可用时，优先尝试云端还是本地 ASR',
            orientation: 'horizontal',
            defaultValue: config?.asr?.mode || 'cloud',
            radio: [
              components.radio.create('transcriptOriginal:asr:mode-cloud', {
                label: '云端优先',
                value: 'cloud'
              }),
              components.radio.create('transcriptOriginal:asr:mode-local', {
                label: '本地优先',
                value: 'local'
              })
            ],
            isDisabled: !switchEnabled
          }),
          components.input.string('transcriptOriginal:asr:whisperCppPath', {
            label: 'whisper.cpp 路径',
            type: 'text',
            description: '本地 whisper.cpp CLI 可执行文件路径',
            defaultValue: config?.asr?.whisperCppPath || '',
            placeholder: 'whisper-cli',
            isRequired: false,
            isDisabled: !switchEnabled
          }),
          components.input.string('transcriptOriginal:asr:modelPath', {
            label: 'whisper.cpp 模型路径',
            type: 'text',
            description: 'whisper.cpp 使用的模型文件路径',
            defaultValue: config?.asr?.modelPath || '',
            placeholder: '/models/ggml-base.bin',
            isRequired: false,
            isDisabled: !switchEnabled
          }),
          components.input.string('transcriptOriginal:asr:language', {
            label: 'ASR 语言',
            type: 'text',
            description: '例如 zh、en、ja',
            defaultValue: config?.asr?.language || 'zh',
            placeholder: 'zh',
            isRequired: false,
            isDisabled: !switchEnabled
          }),
          components.input.number('transcriptOriginal:asr:threads', {
            label: 'ASR 线程数',
            description: '调用 whisper.cpp 时使用的线程数',
            defaultValue: String(config?.asr?.threads ?? 4),
            rules: [
              {
                min: 1,
                max: 128,
                error: '请输入一个范围在 1 到 128 之间的数字'
              }
            ],
            isDisabled: !switchEnabled
          }),
          components.input.string('transcriptOriginal:asr:ffmpegPath', {
            label: 'ffmpeg 路径',
            type: 'text',
            description: '用于从视频抽取音频的 ffmpeg 可执行文件路径',
            defaultValue: config?.asr?.ffmpegPath || '',
            placeholder: 'ffmpeg',
            isRequired: false,
            isDisabled: !switchEnabled
          }),
          components.input.number('transcriptOriginal:asr:audioBitrateKbps', {
            label: '抽音码率',
            description: '单位：kbps，用于控制送 ASR 的音频体积',
            defaultValue: String(config?.asr?.audioBitrateKbps ?? 24),
            rules: [
              {
                min: 8,
                max: 320,
                error: '请输入一个范围在 8 到 320 之间的数字'
              }
            ],
            isDisabled: !switchEnabled
          }),
          components.input.number('transcriptOriginal:asr:maxSegmentMinutes', {
            label: '最长切片时长',
            description: '单位：分钟，超出时会自动按段切分后再转写',
            defaultValue: String(config?.asr?.maxSegmentMinutes ?? 30),
            rules: [
              {
                min: 1,
                max: 60,
                error: '请输入一个范围在 1 到 60 之间的数字'
              }
            ],
            isDisabled: !switchEnabled
          }),
          components.input.string('transcriptOriginal:asr:cloud:baseUrl', {
            label: '云端 ASR Base URL',
            type: 'text',
            description: 'OpenAI-compatible 音频转写接口基础地址',
            defaultValue: config?.asr?.cloud?.baseUrl || '',
            placeholder: 'https://api.openai.com/v1',
            isRequired: false,
            isDisabled: !switchEnabled
          }),
          components.input.string('transcriptOriginal:asr:cloud:apiKey', {
            label: '云端 ASR API Key',
            type: 'password',
            description: '云端音频转写接口密钥',
            defaultValue: config?.asr?.cloud?.apiKey || '',
            placeholder: '',
            isRequired: false,
            isDisabled: !switchEnabled
          }),
          components.input.string('transcriptOriginal:asr:cloud:model', {
            label: '云端 ASR Model',
            type: 'text',
            description: '云端音频转写模型名',
            defaultValue: config?.asr?.cloud?.model || '',
            placeholder: 'gpt-4o-mini-transcribe',
            isRequired: false,
            isDisabled: !switchEnabled
          }),
          components.input.number('transcriptOriginal:asr:cloud:timeoutMs', {
            label: '云端 ASR 超时',
            description: '单位：毫秒',
            defaultValue: String(config?.asr?.cloud?.timeoutMs ?? 45000),
            rules: [
              {
                min: 1000,
                max: 300000,
                error: '请输入一个范围在 1000 到 300000 之间的数字'
              }
            ],
            isDisabled: !switchEnabled
          }),
          components.input.number('transcriptOriginal:asr:cloud:retryCount', {
            label: '云端 ASR 重试次数',
            description: '仅对云端音频转写的超时、断连等瞬时失败生效；0 表示不重试',
            defaultValue: String(config?.asr?.cloud?.retryCount ?? 1),
            rules: [
              {
                min: 0,
                max: 10,
                error: '请输入一个范围在 0 到 10 之间的数字'
              }
            ],
            isDisabled: !switchEnabled
          }),
          components.input.number('transcriptOriginal:asr:cloud:retryDelayMs', {
            label: '云端 ASR 重试间隔',
            description: '单位：毫秒，失败后等待多久再发起下一次云端转写',
            defaultValue: String(config?.asr?.cloud?.retryDelayMs ?? 1500),
            rules: [
              {
                min: 0,
                max: 60000,
                error: '请输入一个范围在 0 到 60000 之间的数字'
              }
            ],
            isDisabled: !switchEnabled
          }),
          components.divider.create('divider-transcript-original-video-frames', {
            description: '视频抽帧配置',
            descPosition: 20
          }),
          components.switch.create('transcriptOriginal:asr:videoFrames:enabled', {
            label: '启用视频抽帧',
            description: '从视频中按时间间隔导出画面，并作为多模态图片一起发给 LLM',
            defaultSelected: videoFramesEnabled,
            isDisabled: !switchEnabled
          }),
          components.radio.group('transcriptOriginal:asr:videoFrames:sourceMode', {
            label: '抽帧视频源',
            description: '自动：开启“继续发送原解析内容”时用正常解析质量，否则优先最小体积视频源',
            orientation: 'horizontal',
            defaultValue: config?.asr?.videoFrames?.sourceMode || 'auto',
            radio: [
              components.radio.create('transcriptOriginal:asr:videoFrames:sourceMode-auto', {
                label: '自动',
                value: 'auto'
              }),
              components.radio.create('transcriptOriginal:asr:videoFrames:sourceMode-summary-optimized', {
                label: '最小体积',
                value: 'summary_optimized'
              }),
              components.radio.create('transcriptOriginal:asr:videoFrames:sourceMode-parsed-content', {
                label: '正常解析质量',
                value: 'parsed_content'
              })
            ],
            isDisabled: !switchEnabled || !videoFramesEnabled
          }),
          components.input.number('transcriptOriginal:asr:videoFrames:minIntervalSeconds', {
            label: '最低抽图间隔',
            description: '单位：秒；短视频按该间隔抽图，长视频会自动拉大间隔以满足最大数量限制',
            defaultValue: String(config?.asr?.videoFrames?.minIntervalSeconds ?? 30),
            rules: [
              {
                min: 1,
                max: 3600,
                error: '请输入一个范围在 1 到 3600 之间的数字'
              }
            ],
            isDisabled: !switchEnabled || !videoFramesEnabled
          }),
          components.input.number('transcriptOriginal:asr:videoFrames:maxImages', {
            label: '最大抽图数量',
            description: '长视频达到上限后会自动增大抽图间隔',
            defaultValue: String(config?.asr?.videoFrames?.maxImages ?? 6),
            rules: [
              {
                min: 1,
                max: 60,
                error: '请输入一个范围在 1 到 60 之间的数字'
              }
            ],
            isDisabled: !switchEnabled || !videoFramesEnabled
          }),
          components.input.number('transcriptOriginal:asr:videoFrames:skipStartSeconds', {
            label: '跳过片头秒数',
            description: '抽图时从视频开头跳过多少秒，避免封面、片头字幕过多',
            defaultValue: String(config?.asr?.videoFrames?.skipStartSeconds ?? 3),
            rules: [
              {
                min: 0,
                max: 3600,
                error: '请输入一个范围在 0 到 3600 之间的数字'
              }
            ],
            isDisabled: !switchEnabled || !videoFramesEnabled
          }),
          components.input.number('transcriptOriginal:asr:videoFrames:skipEndSeconds', {
            label: '跳过片尾秒数',
            description: '抽图时从视频结尾跳过多少秒，避免片尾黑屏和片尾字幕',
            defaultValue: String(config?.asr?.videoFrames?.skipEndSeconds ?? 3),
            rules: [
              {
                min: 0,
                max: 3600,
                error: '请输入一个范围在 0 到 3600 之间的数字'
              }
            ],
            isDisabled: !switchEnabled || !videoFramesEnabled
          })
        ]
      })
    ]
  })
}

export const webConfig = defineConfig({
  info: {
    id: 'karin-plugin-kkk',
    name: 'kkk插件',
    description: `Karin 的「抖音」「B站」视频解析/动态推送插件。v${Root.pluginVersion}`,
    icon: {
      name: 'radio_button_checked',
      color: '#F31260'
    },
    version: Root.pluginVersion,
    author: [
      {
        name: 'ikenxuan',
        home: 'https://github.com/ikenxuan',
        avatar: 'https://github.com/ikenxuan.png'
      },
      {
        name: 'sj817',
        home: 'https://github.com/sj817',
        avatar: 'https://github.com/sj817.png'
      }
    ]
  },
  components: async () => {
    const all = await Config.All()

    return [
      components.accordion.create('cookies', {
        label: 'Cookies 相关',
        children: [
          components.accordion.createItem('cfg:cookies', {
            title: 'Cookies 相关',
            className: 'ml-4 mr-4',
            subtitle: '建议配置，否则大部分功能无法使用',
            children: [
              components.input.string('douyin', {
                label: '抖音',
                type: 'text',
                description: '请输入你的抖音Cookies，不输入则无法使用抖音相关功能噢',
                defaultValue: all.cookies.douyin,
                placeholder: '',
                rules: undefined,
                isRequired: false
              }),
              components.input.string('bilibili', {
                label: 'B站',
                type: 'text',
                description: '请输入你的B站Cookies，不输入部分功能将受限噢',
                defaultValue: all.cookies.bilibili,
                placeholder: '',
                rules: undefined,
                isRequired: false
              }),
              components.input.string('kuaishou', {
                label: '快手',
                type: 'text',
                description: '请输入你的快手Cookies，不输入则无法使用快手相关功能噢',
                defaultValue: all.cookies.kuaishou,
                placeholder: '',
                rules: undefined,
                isRequired: false
              }),
              components.input.string('xiaohongshu', {
                label: '小红书',
                type: 'text',
                description: '请输入你的小红书Cookies，不输入则无法使用小红书相关功能噢',
                defaultValue: all.cookies.xiaohongshu,
                placeholder: '',
                rules: undefined,
                isRequired: false
              }),
              components.input.string('tiktok', {
                label: 'TikTok',
                type: 'text',
                description: '请输入你的 TikTok Cookies，不输入时将尝试使用游客 Cookie',
                defaultValue: all.cookies.tiktok,
                placeholder: '',
                rules: undefined,
                isRequired: false
              }),
              components.input.string('heybox', {
                label: '小黑盒',
                type: 'text',
                description: '请输入你的小黑盒 Cookies，不输入时将尝试使用游客 Token',
                defaultValue: all.cookies.heybox,
                placeholder: '',
                rules: undefined,
                isRequired: false
              }),
              components.input.string('zhihu', {
                label: '知乎',
                type: 'text',
                description: '请输入你的知乎 Cookies，不输入时将尝试使用游客 Cookie',
                defaultValue: all.cookies.zhihu,
                placeholder: '',
                rules: undefined,
                isRequired: false
              }),
              components.input.string('tieba', {
                label: '贴吧',
                type: 'text',
                description: '请输入你的贴吧 Cookies，公开帖子通常可不填',
                defaultValue: all.cookies.tieba,
                placeholder: '',
                rules: undefined,
                isRequired: false
              }),
              components.input.string('weibo', {
                label: '微博',
                type: 'text',
                description: '请输入你的微博 Cookies，公开微博通常可不填',
                defaultValue: all.cookies.weibo,
                placeholder: '',
                rules: undefined,
                isRequired: false
              })
            ]
          })
        ]
      }),
      createGuestCookieWebConfig(all.guestCookie),
      createSummaryParseAccordion(all),
      createDetailedSummaryParseAccordion(all),
      createTranscriptOriginalAccordion(all),
      components.accordion.create('app', {
        label: '插件应用相关',
        children: [
          components.accordion.createItem('cfg:app', {
            title: '插件应用相关',
            className: 'ml-4 mr-4',
            subtitle: '此处用于管理插件的基本设置',
            children: [
              components.divider.create('divider-app-cache', {
                description: '缓存设置',
                descPosition: 20
              }),
              components.switch.create('removeCache', {
                label: '缓存删除',
                description: '下载的视频缓存自动删除，非必要不修改！',
                defaultSelected: all.app.removeCache
              }),
              components.input.number('sharedCacheTtlHours', {
                label: '共享缓存过期时间',
                description: '可复用共享缓存保留时长，单位小时',
                defaultValue: String(all.app.sharedCacheTtlHours ?? 24),
                rules: [
                  {
                    min: 1,
                    max: 168
                  }
                ]
              }),
              components.divider.create('divider-app-priority', {
                description: '解析优先级设置',
                descPosition: 20
              }),
              components.switch.create('videoTool', {
                label: '默认解析',
                description: '即识别最高优先级，修改后重启生效',
                defaultSelected: all.app.videoTool
              }),
              components.input.number('priority', {
                label: '自定义优先级',
                description: '自定义优先级，「默认解析」关闭后才会生效。修改后重启生效',
                defaultValue: all.app.priority.toString(),
                isDisabled: all.app.videoTool,
                rules: undefined
              }),
              components.divider.create('divider-app-render', {
                description: '渲染配置',
                descPosition: 20
              }),
              components.input.number('renderScale', {
                label: '渲染精度',
                description: '可选值50~200，建议100。设置高精度会提高图片的精细度，过高可能会影响渲染与发送速度',
                defaultValue: all.app.renderScale.toString(),
                rules: [
                  {
                    min: 50,
                    max: 200
                  }
                ]
              }),
              components.radio.group('Theme', {
                label: '渲染图片的主题色',
                orientation: 'horizontal',
                defaultValue: all.app.Theme.toString(),
                radio: [
                  components.radio.create('Theme-1', {
                    label: '自动',
                    description: '06:00-18:00为浅色，18:00-06:00为深色',
                    value: '0'
                  }),
                  components.radio.create('Theme-2', {
                    label: '浅色',
                    value: '1'
                  }),
                  components.radio.create('Theme-3', {
                    label: '深色',
                    value: '2'
                  })
                ]
              }),
              components.switch.create('RemoveWatermark', {
                label: '移除版本信息',
                description: '渲染的图片是否移除底部版本信息',
                defaultSelected: all.app.RemoveWatermark
              }),
              components.input.number('RenderWaitTime', {
                label: '渲染图片的等待时间',
                description: os.platform() === 'linux' ? '单位：秒，Linux系统下不能为0' : '单位：秒，传递 0 可禁用',
                defaultValue: all.app.RenderWaitTime.toString(),
                rules: [
                  os.platform() === 'linux'
                    ? { min: 1, error: 'Linux系统下渲染等待时间不能为0' }
                    : { min: 0 }
                ]
              }),
              components.switch.create('multiPageRender', {
                label: '智能分页渲染',
                description: '将超长渲染图按安全位置拆成多页图片，避免一张长图过高',
                defaultSelected: all.app.multiPageRender
              }),
              components.input.number('multiPageTriggerAspectRatio', {
                label: '分页触发比例',
                description: '当渲染图的高宽比超过该值时开始分页，默认 3',
                defaultValue: all.app.multiPageTriggerAspectRatio.toString(),
                isDisabled: !all.app.multiPageRender,
                rules: [
                  { min: 1.2, max: 10, error: '请输入一个范围在 1.2 到 10 之间的数字' }
                ]
              }),
              components.input.number('multiPageMaxAspectRatio', {
                label: '分页后单页比例',
                description: '分页后每一页允许的最大高宽比，默认 2.2',
                defaultValue: all.app.multiPageMaxAspectRatio.toString(),
                isDisabled: !all.app.multiPageRender,
                rules: [
                  { min: 1.1, max: 10, error: '请输入一个范围在 1.1 到 10 之间的数字' }
                ]
              }),
              components.radio.group('renderImageFormat', {
                label: '渲染图输出格式',
                description: 'auto 使用内置推荐；JPG 体积更小；PNG 更清晰但更大',
                orientation: 'horizontal',
                defaultValue: all.app.renderImageFormat,
                radio: [
                  components.radio.create('renderImageFormat-auto', {
                    label: '自动',
                    description: '按模板使用内置推荐格式',
                    value: 'auto'
                  }),
                  components.radio.create('renderImageFormat-jpeg', {
                    label: 'JPG',
                    description: '优先减小体积',
                    value: 'jpeg'
                  }),
                  components.radio.create('renderImageFormat-png', {
                    label: 'PNG',
                    description: '保留无损输出',
                    value: 'png'
                  })
                ]
              }),
              components.input.number('renderImageQuality', {
                label: 'JPG 压缩质量',
                description: '1-100，数值越高画质越高、体积越大；PNG 输出时忽略',
                defaultValue: all.app.renderImageQuality.toString(),
                isDisabled: all.app.renderImageFormat === 'png',
                rules: [
                  { min: 1, max: 100, error: '请输入一个范围在 1 到 100 之间的数字' }
                ]
              }),
              components.divider.create('divider-app-live-photo', {
                description: 'Live Photo 兼容设置',
                descPosition: 20
              }),
              components.radio.group('livePhotoMode', {
                label: 'Live Photo 处理和发送方式',
                description: '解析遇到实况图时的处理和发送方式。注意：生成视频性能开销大，2C2G 服务器单张约需 20 秒',
                orientation: 'horizontal',
                defaultValue: all.app.livePhotoMode || 'video_and_livephoto',
                radio: [
                  components.radio.create('livePhotoMode-video-and-livephoto', {
                    label: '视频 + 实况图',
                    description: '生成并发送仿 iPhone Live Photo 播放效果的视频（播放三次）+ 对应系统的实况图',
                    value: 'video_and_livephoto'
                  }),
                  components.radio.create('livePhotoMode-video-only', {
                    label: '仅视频',
                    description: '仅生成并发送仿 iPhone Live Photo 播放效果的视频（播放三次）',
                    value: 'video_only'
                  }),
                  components.radio.create('livePhotoMode-livephoto-only', {
                    label: '仅实况图',
                    description: '仅生成并发送对应系统的实况图，性能开销小',
                    value: 'livephoto_only'
                  })
                ]
              }),
              components.radio.group('livePhotoSystem', {
                label: 'Live Photo 静态图兼容系统',
                description: '当解析到作品/动态包含 Live Photo 时，合并转发里发送的 Live Photo 静态图按所选系统生成。推荐 OPPO，兼容性最广',
                orientation: 'horizontal',
                defaultValue: all.app.livePhotoSystem || 'oppo',
                isDisabled: all.app.livePhotoMode === 'video_only',
                radio: [
                  components.radio.create('livePhotoSystem-google', {
                    label: 'Google',
                    description: 'Google Motion Photo 格式',
                    value: 'google'
                  }),
                  components.radio.create('livePhotoSystem-xiaomi', {
                    label: '小米（HyperOS）',
                    description: '兼容小米（任何版本）和 Google，但无法被 OPPO 识别',
                    value: 'xiaomi'
                  }),
                  components.radio.create('livePhotoSystem-oppo', {
                    label: 'OPPO（ColorOS）',
                    description: '推荐，兼容 OPPO、小米（较新版本）和 Google',
                    value: 'oppo'
                  }),
                  components.radio.create('livePhotoSystem-huawei-honor', {
                    label: '华为/荣耀（HarmonyOS/MagicOS）',
                    description: '理论可行但未实测（作者无对应设备）',
                    value: 'huawei_honor'
                  }),
                  components.radio.create('livePhotoSystem-vivo', {
                    label: 'vivo（Origin OS）',
                    description: '需要独立的图片和同名视频文件，暂不支持',
                    value: 'vivo',
                    isDisabled: true
                  }),
                  components.radio.create('livePhotoSystem-iphone', {
                    label: 'iPhone（iOS）',
                    description: '需要独立的图片和同名视频文件，暂不支持',
                    value: 'iphone',
                    isDisabled: true
                  })
                ]
              }),
              components.divider.create('divider-app-interaction', {
                description: '交互与认证设置',
                descPosition: 20
              }),
              components.switch.create('EmojiReply', {
                label: '表情回应',
                description: '在解析任务开始时添加表情回应，若适配器不支持需要关闭',
                defaultSelected: all.app.EmojiReply
              }),
              components.switch.create('parseTip', {
                label: '解析提示',
                description: '发送提示信息："检测到xxx链接，开始解析"',
                defaultSelected: all.app.parseTip
              }),
              components.switch.create('fakeForward', {
                label: '伪造合并转发消息',
                description: '开启后合并转发将使用触发者身份展示；关闭后使用机器人身份展示',
                defaultSelected: all.app.fakeForward
              }),
              components.switch.create('autoUpdate', {
                label: '自动更新',
                description: '关闭后，定时检查、提醒回复触发和手动更新命令都不会生效',
                defaultSelected: all.app.autoUpdate ?? false
              }),
              components.switch.create('autoRestartOnInstalledUpdate', {
                label: '已安装新版本后自动重启',
                description: '检测到磁盘上已安装比当前运行版本更高的新版本后，自动重启插件进程使其生效',
                defaultSelected: all.app.autoRestartOnInstalledUpdate ?? false
              }),
              components.switch.create('longTaskCompletionNotify', {
                label: '长任务完成提醒',
                description: '解析、总结、详细总结、转写任务耗时达到阈值后，回复结果消息提醒触发者',
                defaultSelected: all.app.longTaskCompletionNotify ?? true
              }),
              components.input.number('longTaskCompletionNotifyThresholdMs', {
                label: '长任务提醒阈值（毫秒）',
                description: '耗时达到该阈值后才发送完成提醒，默认 300000',
                defaultValue: String(all.app.longTaskCompletionNotifyThresholdMs ?? 300000),
                isDisabled: !(all.app.longTaskCompletionNotify ?? true),
                rules: [
                  {
                    min: 0,
                    max: 86400000,
                    error: '请输入一个范围在 0 到 86400000 之间的数字'
                  }
                ]
              }),
              components.checkbox.group('errorLogSendTo', {
                label: '错误日志',
                description: '遇到错误时谁会收到错误日志。注：推送任务只可发送给主人。「第一个主人」与「所有主人」互斥。',
                orientation: 'horizontal',
                defaultValue: all.app.errorLogSendTo,
                checkbox: [
                  components.checkbox.create('errorLogSendTo:checkbox:1', {
                    label: '第一个主人',
                    value: 'master'
                  }),
                  components.checkbox.create('errorLogSendTo:checkbox:2', {
                    label: '所有主人',
                    value: 'allMasters'
                  }),
                  components.checkbox.create('errorLogSendTo:checkbox:3', {
                    label: '触发者的群聊',
                    value: 'trigger'
                  })
                ]
              }),
              components.divider.create('divider-app-qrlogin', {
                description: '我的小玩具配置',
                descPosition: 20
              }),
              components.radio.group('qrLoginAddrType', {
                label: '扫码登录地址类型',
                description: '生成登录二维码时使用的服务器地址',
                orientation: 'horizontal',
                defaultValue: all.app.qrLoginAddrType || 'lan',
                radio: [
                  components.radio.create('qrLoginAddrType-lan', {
                    label: `局域网（${getLocalIP()}）`,
                    description: '适用于手机和服务器在同一局域网',
                    value: 'lan'
                  }),
                  components.radio.create('qrLoginAddrType-external', {
                    label: '外部地址',
                    description: '适用于远程访问，需手动配置',
                    value: 'external'
                  })
                ]
              }),
              components.input.string('qrLoginExternalAddr', {
                label: '外部访问地址',
                type: 'text',
                description: '公网 IP 或域名，如：123.45.67.89 或 example.com',
                defaultValue: all.app.qrLoginExternalAddr || '',
                placeholder: '请输入公网 IP 或域名',
                isDisabled: all.app.qrLoginAddrType !== 'external',
                isRequired: false
              })
            ]
          })
        ]
      }),
      ...DouyinWeb(all),
      ...TikTokWeb(all),
      ...BilibiliWeb(all),
      ...KuaishouWeb(all),
      ...XiaohongshuWeb(all),
      ...HeyboxWeb(all),
      ...GithubWeb(all),
      ...XWeb(all),
      ...ZhihuWeb(all),
      ...TiebaWeb(all),
      ...WechatWeb(all),
      ...WeiboWeb(all),
      components.accordion.create('upload', {
        label: '视频上传和下载相关',
        children: [
          components.accordion.createItem('cfg:upload', {
            title: '上传和下载相关',
            className: 'ml-4 mr-4',
            subtitle: '此处为视频上传和下载相关的用户偏好设置',
            children: [
              components.divider.create('divider-upload-method', {
                description: '发送方式配置',
                descPosition: 20
              }),
              components.radio.group('videoSendMode', {
                label: '本地视频发送方式',
                orientation: 'vertical',
                defaultValue: all.upload.videoSendMode,
                isDisabled: all.upload.usegroupfile,
                radio: [
                  components.radio.create('videoSendMode:radio-1', {
                    label: 'File 协议（本地文件）',
                    description: '使用 file 协议发送本地视频，需 Karin 与协议端在同一系统',
                    value: 'file'
                  }),
                  components.radio.create('videoSendMode:radio-2', {
                    label: 'Base64（编码传输）',
                    description: '将本地视频转换为 base64 发送，传输数据量增大约 30%，不在同一网络环境可能导致额外带宽成本，适合 karin 和协议端不在同一网络环境',
                    value: 'base64'
                  })
                ]
              }),
              components.switch.create('usegroupfile', {
                label: '群文件上传',
                description: '使用群文件上传，开启后会将视频文件上传到群文件中，需配置「群文件上传阈值」。与「本地视频发送方式 = Base64」互斥。',
                defaultSelected: all.upload.usegroupfile,
                isDisabled: all.upload.videoSendMode === 'base64'
              }),
              components.input.number('groupfilevalue', {
                label: '群文件上传阈值',
                description: '当文件大小超过该值时将使用群文件上传，单位：MB，「使用群文件上传」开启后才会生效',
                defaultValue: all.upload.groupfilevalue.toString(),
                rules: [{ min: 1 }],
                isDisabled: !all.upload.usegroupfile || all.upload.videoSendMode === 'base64'
              }),
              components.radio.group('imageSendMode', {
                label: '网络图片发送方式',
                orientation: 'vertical',
                defaultValue: all.upload.imageSendMode,
                radio: [
                  components.radio.create('imageSendMode:radio-1', {
                    label: 'URL 链接（直接传递）',
                    description: '直接传递 HTTP 链接给上游下载，可能因上游网络问题导致下载超时',
                    value: 'url'
                  }),
                  components.radio.create('imageSendMode:radio-2', {
                    label: 'File 协议（本地文件）',
                    description: '下载到本地后使用 file 协议发送，需 Karin 与协议端在同一系统',
                    value: 'file'
                  }),
                  components.radio.create('imageSendMode:radio-3', {
                    label: 'Base64（编码传输）',
                    description: '下载后转换为 base64 发送，传输数据量增大约 30%，不在同一网络环境可能导致额外带宽成本',
                    value: 'base64'
                  })
                ]
              }),
              components.divider.create('divider-upload-limit', {
                description: '上传拦截配置',
                descPosition: 20
              }),
              components.switch.create('usefilelimit', {
                label: '视频上传拦截',
                description: '开启后会根据视频文件大小判断是否需要上传，需配置「视频拦截阈值」。',
                defaultSelected: all.upload.usefilelimit
              }),
              components.input.number('filelimit', {
                label: '视频拦截阈值',
                description: '视频文件大于该数值则直接结束任务，不会上传，单位: MB，「视频上传拦截」开启后才会生效。',
                defaultValue: all.upload.filelimit.toString(),
                rules: [{ min: 1 }],
                isDisabled: !all.upload.usefilelimit
              }),
              components.divider.create('divider-upload-compress', {
                description: '视频压缩配置',
                descPosition: 20
              }),
              components.switch.create('compress', {
                label: '压缩视频',
                description: '开启后会将视频文件压缩后再上传，适合上传大文件，任务过程中会吃满CPU，对低配服务器不友好。需配置「压缩触发阈值」与「压缩后的值」',
                defaultSelected: all.upload.compress
              }),
              components.input.number('compresstrigger', {
                label: '压缩触发阈值',
                description: '触发视频压缩的阈值，单位：MB。当文件大小超过该值时，才会压缩视频，「压缩视频」开启后才会生效',
                defaultValue: all.upload.compresstrigger.toString(),
                rules: [{ min: 1 }],
                isDisabled: !all.upload.compress
              }),
              components.input.number('compressvalue', {
                label: '压缩后的值',
                description: '单位：MB，若视频文件大小大于「压缩触发阈值」的值，则会进行压缩至该值（±5%），「压缩视频」开启后才会生效',
                defaultValue: all.upload.compressvalue.toString(),
                rules: [{ min: 1 }],
                isDisabled: !all.upload.compress
              }),
              components.radio.group('compressPreset', {
                label: '压制编码预设',
                description: '自动探测或指定 GPU/CPU 编码器进行视频压制',
                orientation: 'horizontal',
                defaultValue: all.upload.compressPreset,
                isDisabled: !all.upload.compress,
                radio: [
                  components.radio.create('compressPreset:radio-auto', {
                    label: '自动',
                    value: 'auto',
                    description: '按 NVIDIA、Intel、AMD、CPU 顺序探测'
                  }),
                  components.radio.create('compressPreset:radio-nvidia', {
                    label: 'NVIDIA',
                    value: 'nvidia',
                    description: '使用 hevc_nvenc，最大码率受目标大小限制'
                  }),
                  components.radio.create('compressPreset:radio-intel', {
                    label: 'Intel 核显',
                    value: 'intel',
                    description: '使用 hevc_qsv 固定码率模式'
                  }),
                  components.radio.create('compressPreset:radio-amd', {
                    label: 'AMD',
                    value: 'amd',
                    description: '使用 hevc_amf 固定码率模式'
                  }),
                  components.radio.create('compressPreset:radio-cpu', {
                    label: 'CPU',
                    value: 'cpu',
                    description: '使用 libx265'
                  }),
                  components.radio.create('compressPreset:radio-custom', {
                    label: '自定义',
                    value: 'custom'
                  })
                ]
              }),
              components.input.string('compressCustomArgs', {
                label: '自定义压制参数',
                type: 'text',
                description: '完整 ffmpeg 视频编码参数，仅在「压制编码预设」为自定义时生效',
                defaultValue: all.upload.compressCustomArgs,
                placeholder: '-c:v hevc_nvenc -preset p5 -rc vbr -cq 19',
                isDisabled: !all.upload.compress || all.upload.compressPreset !== 'custom'
              }),
              components.divider.create('divider-upload-throttle', {
                description: '下载限速配置',
                descPosition: 20
              }),
              components.switch.create('downloadThrottle', {
                label: '下载限速',
                description: '开启后会限制下载速度，避免触发服务器风控导致连接被重置（ECONNRESET）。如果下载时经常报错"连接被重置"，建议开启',
                defaultSelected: all.upload.downloadThrottle
              }),
              components.input.number('downloadMaxSpeed', {
                label: '最大下载速度',
                description: '单位：MB/s，建议设置为 5-20 之间。设置过高可能触发风控，设置过低会影响下载体验',
                defaultValue: all.upload.downloadMaxSpeed.toString(),
                rules: [{ min: 1, max: 1000, error: '请输入一个范围在 1 到 1000 之间的数字' }],
                isDisabled: !all.upload.downloadThrottle
              }),
              components.switch.create('downloadAutoReduce', {
                label: '断流自动降速',
                description: '当检测到连接被重置时自动降低下载速度，每次断流后速度会降低到当前的 60%',
                defaultSelected: all.upload.downloadAutoReduce,
                isDisabled: !all.upload.downloadThrottle
              }),
              components.input.number('downloadMinSpeed', {
                label: '最低下载速度',
                description: '单位：MB/s，自动降速时不会低于此值',
                defaultValue: all.upload.downloadMinSpeed.toString(),
                rules: [{ min: 0.1, max: 100, error: '请输入一个范围在 0.1 到 100 之间的数字' }],
                isDisabled: !all.upload.downloadThrottle || !all.upload.downloadAutoReduce
              })
            ]
          })
        ]
      }),
      components.accordion.create('request', {
        label: '解析库请求配置相关',
        children: [
          components.accordion.createItem('cfg:request', {
            title: '解析库请求配置相关',
            className: 'ml-4 mr-4',
            subtitle: '此处用于管理解析库的网络请求配置',
            children: [
              components.input.number('timeout', {
                label: '请求超时时间',
                description: '网络请求的超时时间，单位：毫秒',
                defaultValue: all.request.timeout.toString(),
                rules: [
                  {
                    min: 1000,
                    max: 300000,
                    error: '请输入一个范围在 1000 到 300000 之间的数字'
                  }
                ]
              }),
              components.input.string('User-Agent', {
                label: 'User-Agent',
                type: 'text',
                description: '请求头中的User-Agent字段，用于标识客户端类型',
                defaultValue: all.request['User-Agent'],
                placeholder: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                rules: undefined,
                isRequired: false
              }),
              components.divider.create('divider-proxy', {
                description: '代理配置（可选）',
                descPosition: 20
              }),
              components.switch.create('proxy:switch', {
                label: '代理开关',
                description: '开启后需要配置「代理主机」「代理端口」',
                defaultSelected: all.request.proxy?.switch
              }),
              components.input.string('proxy:host', {
                label: '代理主机',
                type: 'text',
                description: '代理服务器的主机地址，如：127.0.0.1',
                defaultValue: all.request.proxy?.host || '',
                placeholder: '127.0.0.1',
                rules: undefined,
                isDisabled: !all.request.proxy?.switch
              }),
              components.input.number('proxy:port', {
                label: '代理端口',
                description: '代理服务器的端口号',
                defaultValue: all.request.proxy?.port?.toString() || '',
                rules: [
                  {
                    min: 1,
                    max: 65535,
                    error: '请输入一个范围在 1 到 65535 之间的数字'
                  }
                ],
                isDisabled: !all.request.proxy?.switch
              }),
              components.radio.group('proxy:protocol', {
                label: '代理协议',
                orientation: 'horizontal',
                defaultValue: all.request.proxy?.protocol || 'http',
                radio: [
                  components.radio.create('proxy-protocol-1', {
                    label: 'HTTP',
                    value: 'http'
                  }),
                  components.radio.create('proxy-protocol-2', {
                    label: 'HTTPS',
                    value: 'https'
                  })
                ],
                isDisabled: !all.request.proxy?.switch
              }),
              components.input.string('proxy:auth:username', {
                label: '代理用户名',
                type: 'text',
                description: '代理服务器的认证用户名（如果需要）',
                defaultValue: all.request.proxy?.auth?.username || '',
                placeholder: '',
                rules: undefined,
                isRequired: false,
                isDisabled: !all.request.proxy?.switch
              }),
              components.input.string('proxy:auth:password', {
                label: '代理密码',
                type: 'password',
                description: '代理服务器的认证密码（如果需要）',
                defaultValue: all.request.proxy?.auth?.password || '',
                placeholder: '',
                rules: undefined,
                isRequired: false,
                isDisabled: !all.request.proxy?.switch
              })
            ]
          })
        ]
      }),
      components.divider.create('divider-7', {
        description: '抖音推送列表相关',
        descPosition: 20
      }),
      components.accordionPro.create(
        'pushlist:douyin',
        all.pushlist.douyin.map((item) => {
          return {
            ...item,
            title: item.remark,
            subtitle: item.short_id
          }
        }),
        {
          label: '抖音推送列表',
          children: components.accordion.createItem('accordion-item-douyin', {
            className: 'ml-4 mr-4',
            children: [
              components.switch.create('switch', {
                label: '是否启用',
                description: '是否启用该订阅项',
                color: 'warning'
              }),
              components.input.string('short_id', {
                placeholder: '',
                label: '抖音号',
                description: '抖音号, 必填',
                errorMessage: '抖音号不能为空 Ciallo～(∠・ω< )⌒☆',
                color: 'warning'
              }),
              components.input.group('group_id', {
                label: '绑定推送群',
                maxRows: 2,
                data: [],
                template: components.input.string('accordion-item-douyin:push:douyin:group_id', {
                  placeholder: '必填，不能出现空值',
                  label: '群号:机器人账号',
                  color: 'warning',
                  rules: [
                    {
                      regex: /.+:.+/,
                      error: '请使用 `群号:机器人账号` 的格式'
                    }
                  ]
                })
              }),
              components.input.string('sec_uid', {
                color: 'default',
                placeholder: '可不填，会自动获取',
                label: 'UID',
                isRequired: false,
                description: '获取方法：PC浏览器打开某个博主主页，https://www.douyin.com/user/MS4wLj..... 其中的user/后的即为UID'
              }),
              components.input.string('remark', {
                color: 'default',
                placeholder: '可不填，会自动获取',
                label: '昵称',
                isRequired: false,
                description: '博主的抖音名称'
              }),
              components.divider.create('push:douyin:divider-pushTypes', {
                description: '推送类型配置',
                descPosition: 20
              }),
              components.checkbox.group('pushTypes', {
                label: '推送类型',
                description: '选择要推送的内容类型，可多选',
                orientation: 'horizontal',
                color: 'warning',
                checkbox: [
                  components.checkbox.create('pushTypes:checkbox:post', {
                    label: '作品列表',
                    description: '推送博主发布的作品',
                    value: 'post'
                  }),
                  components.checkbox.create('pushTypes:checkbox:favorite', {
                    label: '喜欢列表',
                    description: '推送博主喜欢的作品',
                    value: 'favorite'
                  }),
                  components.checkbox.create('pushTypes:checkbox:recommend', {
                    label: '推荐列表',
                    description: '推送博主的推荐作品',
                    value: 'recommend'
                  }),
                  components.checkbox.create('pushTypes:checkbox:live', {
                    label: '直播',
                    description: '推送博主开播通知',
                    value: 'live'
                  })
                ]
              }),
              components.divider.create('push:douyin:divider-1', {
                description: '过滤系统',
                descPosition: 20
              }),
              components.radio.group('filterMode', {
                label: '过滤模式',
                orientation: 'horizontal',
                color: 'warning',
                radio: [
                  components.radio.create('push:bilibili:filterMode.radio-1', {
                    label: '黑名单模式',
                    description: '命中以下内容时，不推送',
                    value: 'blacklist'
                  }),
                  components.radio.create('push:bilibili:filterMode.radio-2', {
                    label: '白名单模式',
                    description: '命中以下内容时，才推送',
                    value: 'whitelist'
                  })
                ]
              }),
              components.input.group('Keywords', {
                label: '关键词',
                maxRows: 2,
                itemsPerRow: 4,
                data: [],
                template: components.input.string('push:bilibili:filterKeywords', {
                  placeholder: '严禁提交空值',
                  label: '',
                  color: 'warning'
                })
              }),
              components.input.group('Tags', {
                label: '标签',
                maxRows: 2,
                itemsPerRow: 4,
                data: [],
                template: components.input.string('push:bilibili:filterTags', {
                  placeholder: '严禁提交空值',
                  label: '',
                  color: 'warning'
                })
              })
            ]
          })
        }
      ),
      components.divider.create('divider-8', {
        description: 'B站推送列表相关',
        descPosition: 20
      }),
      components.accordionPro.create(
        'pushlist:bilibili',
        all.pushlist.bilibili.map((item) => {
          return {
            ...item,
            title: item.remark,
            subtitle: item.host_mid
          }
        }),
        {
          label: 'B站推送列表',
          children: components.accordion.createItem('accordion-item-bilibili', {
            className: 'ml-4 mr-4',
            children: [
              components.switch.create('switch', {
                label: '是否启用',
                description: '是否启用该订阅项',
                color: 'warning'
              }),
              components.input.number('host_mid', {
                placeholder: '',
                label: 'UID',
                rules: undefined,
                description: 'B站用户的UID，必填',
                errorMessage: 'UID 不能为空 Ciallo～(∠・ω< )⌒☆',
                color: 'warning'
              }),
              components.input.group('group_id', {
                label: '绑定推送群',
                maxRows: 2,
                data: [],
                template: components.input.string('accordion-item-bilibili:push:bilibili:group_id', {
                  placeholder: '必填，不能出现空值',
                  label: '',
                  color: 'warning',
                  rules: [
                    {
                      regex: /.+:.+/,
                      error: '请使用 `群号:机器人账号` 的格式'
                    }
                  ]
                })
              }),
              components.input.string('remark', {
                color: 'default',
                placeholder: '可不填，会自动获取',
                label: '昵称',
                isRequired: false,
                description: 'UP主的昵称'
              }),
              components.divider.create('push:bilibili:divider-pushTypes', {
                description: '推送类型配置',
                descPosition: 20
              }),
              components.checkbox.group('pushTypes', {
                label: '推送类型',
                description: '选择要推送的动态类型，可多选',
                orientation: 'horizontal',
                color: 'warning',
                checkbox: [
                  components.checkbox.create('pushTypes:checkbox:video', {
                    label: '投稿视频',
                    description: '推送UP主投稿的视频',
                    value: 'video'
                  }),
                  components.checkbox.create('pushTypes:checkbox:draw', {
                    label: '图文动态',
                    description: '推送UP主发布的图文动态',
                    value: 'draw'
                  }),
                  components.checkbox.create('pushTypes:checkbox:word', {
                    label: '纯文动态',
                    description: '推送UP主发布的纯文字动态',
                    value: 'word'
                  }),
                  components.checkbox.create('pushTypes:checkbox:live', {
                    label: '直播动态',
                    description: '推送UP主的直播通知',
                    value: 'live'
                  }),
                  components.checkbox.create('pushTypes:checkbox:forward', {
                    label: '转发动态',
                    description: '推送UP主的转发动态',
                    value: 'forward'
                  }),
                  components.checkbox.create('pushTypes:checkbox:article', {
                    label: '投稿专栏',
                    description: '推送UP主投稿的专栏文章',
                    value: 'article'
                  })
                ]
              }),
              components.divider.create('push:bilibili:divider-filter', {
                description: '过滤系统',
                descPosition: 20
              }),
              components.radio.group('filterMode', {
                label: '过滤模式',
                orientation: 'horizontal',
                color: 'warning',
                radio: [
                  components.radio.create('push:bilibili:filterMode.radio-1', {
                    label: '黑名单模式',
                    description: '命中以下内容时，不推送',
                    value: 'blacklist'
                  }),
                  components.radio.create('push:bilibili:filterMode.radio-2', {
                    label: '白名单模式',
                    description: '命中以下内容时，才推送',
                    value: 'whitelist'
                  })
                ]
              }),
              components.input.group('Keywords', {
                label: '关键词',
                maxRows: 2,
                itemsPerRow: 4,
                data: [],
                description: '关键词，多个则使用逗号隔开',
                template: components.input.string('push:bilibili:filterKeywords', {
                  placeholder: '严禁提交空值',
                  label: '',
                  color: 'warning'
                })
              }),
              components.input.group('Tags', {
                label: '标签',
                maxRows: 2,
                itemsPerRow: 4,
                data: [],
                template: components.input.string('push:bilibili:filterTags', {
                  placeholder: '严禁提交空值',
                  label: '',
                  color: 'warning'
                })
              })
            ]
          })
        }
      )
    ]
  },

  /** 前端点击保存之后调用的方法 */
  save: async (config: newConfigType) => {
    const formatCfg = processFrontendData(config)
    const oldAllCfg = await Config.All()
    const mergeCfg = _.mergeWith({}, oldAllCfg, formatCfg, customizer)

    // 使用通用的扁平化字段清理方法
    cleanFlattenedFields(mergeCfg)

    let success = false
    let isChange = false
    let needReloadAmagi = false
    const shouldSyncSubscriptions = Object.hasOwn(formatCfg, 'pushlist')
    let persistenceFailed = false
    let pushlistPersistenceFailed = false
    let subscriptionSyncFailed = false
    let subscriptionSyncSucceeded = false

    for (const key of Object.keys(mergeCfg) as Array<keyof ConfigType>) {
      const configValue = mergeCfg[key]

      // 检查配置是否有效且不为空
      if (configValue &&
        typeof configValue === 'object' &&
        Object.keys(configValue).length > 0) {
        isChange = deepEqual(configValue, oldAllCfg[key])
        if (isChange) {
          const modifySuccess = await Config.ModifyPro(key, configValue)
          if (modifySuccess) {
            success = true
            // 检查是否需要重载 Amagi Client
            if (key === 'cookies' || key === 'request') {
              needReloadAmagi = true
            }
          } else if (key === 'pushlist') {
            persistenceFailed = true
            pushlistPersistenceFailed = true
          } else {
            persistenceFailed = true
          }
        }
      }
    }

    if (shouldSyncSubscriptions && !pushlistPersistenceFailed) {
      try {
        await Config.syncConfigToDatabase()
        subscriptionSyncSucceeded = true
      } catch {
        subscriptionSyncFailed = true
      }
    }

    // 如果 cookies 或 request 配置有变化，重载 Amagi Client
    if (needReloadAmagi) {
      reloadAmagiConfig()
    }

    const saveSucceeded = !persistenceFailed &&
      !subscriptionSyncFailed &&
      (success || subscriptionSyncSucceeded)

    return {
      mergeCfg,
      formatCfg,
      success: saveSucceeded,
      message: subscriptionSyncFailed
        ? '配置已保存，但订阅数据库同步失败'
        : persistenceFailed
          ? success ? '部分配置保存失败' : '配置保存失败'
          : saveSucceeded ? '保存成功 Ciallo～(∠・ω< )⌒☆' : '配置无变化 Ciallo～(∠・ω< )⌒☆'
    }
  }
})

export default webConfig

/**
 * 遇到数组时用新数组覆盖原始数组（而不是合并）
 * @param value 原始内容
 * @param srcValue 新内容
 * @returns
 */
const customizer = (value: any, srcValue: any) => {
  if (Array.isArray(srcValue)) {
    return srcValue // 直接返回新数组（覆盖旧数组）
  }
}

/**
 * 归递判断配置是否修改
 * @param a 前端传回来的配置
 * @param b 用户原本的配置
 * @returns 配置对象是否被修改
 */
const deepEqual = (a: any, b: any): boolean => {
  // 如果两个值严格相等，说明没有修改
  if (a === b) {
    return false
  }

  // 如果 a 和 b 都是字符串，比较是否相等
  if (typeof a === 'string' && typeof b === 'string') {
    if (a !== b) return true
  }

  // 如果 a 和 b 都是数字，比较是否相等
  if (typeof a === 'number' && typeof b === 'number') {
    if (a !== b) return true
  }

  // 如果 a 和 b 都是布尔值，比较是否相等
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    if (a !== b) return true
  }

  // 如果其中一个为 null 或者不是对象/数组，说明有修改
  if (a === null || b === null || typeof a !== typeof b) {
    return true
  }

  // 如果 a 和 b 都是数组
  if (Array.isArray(a) && Array.isArray(b)) {
    // 如果数组长度不同，说明有修改
    if (a.length !== b.length) {
      return true
    }

    // 递归比较数组中的每个元素
    for (let i = 0; i < a.length; i++) {
      if (deepEqual(a[i], b[i])) {
        return true // 如果某个元素有修改，返回 true
      }
    }
  }

  // 如果 a 和 b 都是对象
  if (typeof a === 'object' && typeof b === 'object') {
    // 获取两个对象的键
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)

    // 如果键的数量不同，说明对象结构有修改
    if (keysA.length !== keysB.length) {
      return true
    }

    // 遍历对象 a 的键
    for (const key of keysA) {
      // 如果 b 中没有该键，或者递归比较 a[key] 和 b[key] 有修改
      if (!keysB.includes(key)) {
        return true // 如果 b 中没有该键，返回 true
      }

      // 如果 a[key] 和 b[key] 不相等，返回 true
      if (deepEqual(a[key], b[key])) {
        return true
      }
    }
  }

  // 如果所有检查都没有发现修改，返回 false
  return false
}

/**
 * str 转 num
 * @param value 字符串
 * @returns
 */
const convertToNumber = (value: string): any => {
  // 检查字符串是否为有效的数字
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) {
    return Number(value)
  }
  return value
}

const stringOnlyFrontendProps = new Set([
  'proxy:auth:username',
  'proxy:auth:password',
  'proxy.auth.username',
  'proxy.auth.password'
])

const normalizeFrontendValue = (prop: string, value: unknown): unknown => {
  if ((prop === 'summaryParse:keywords' || prop === 'detailedSummaryParse:keywords' || prop === 'transcriptOriginal:keywords' || prop === 'keywords') && Array.isArray(value)) {
    return value
      .map(item => typeof item === 'string' ? item : (item && typeof item === 'object' && 'value' in item ? String((item as { value?: unknown }).value ?? '') : ''))
      .map(item => item.trim())
      .filter(Boolean)
  }
  if (typeof value !== 'string') return value
  if (stringOnlyFrontendProps.has(prop)) return value
  return convertToNumber(value)
}

/**
 * 获取数组中的第一个对象，如果数组为空则返回空对象
 * @param arr 数组
 * @returns 数组中的第一个对象或空对象
 */
const getFirstObject = <T> (arr: T[]): T => {
  return arr.length > 0 ? arr[0] : {} as T
}

/**
 * 设置嵌套属性值
 * @param obj 目标对象
 * @param keys 键路径数组
 * @param value 要设置的值
 */
const setNestedProperty = (obj: any, keys: string[], value: any) => {
  let current = obj

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {}
    }
    current = current[key]
  }

  const lastKey = keys[keys.length - 1]
  current[lastKey] = value
}

/**
 * 处理前端返回的数据，将其转换为 ConfigType 格式
 * @param data 前端返回的数据
 * @returns 处理后符合 ConfigType 格式的数据
 */
const processFrontendData = (data: newConfigType): ConfigType => {
  const result: Partial<Record<keyof ConfigType, any>> = {}

  const configKeys = Object.keys(data).filter((key): key is FrontendModuleKey => {
    return !key.includes('pushlist')
  })

  for (const key of configKeys) {
    const value = data[key]
    const firstObj = (Array.isArray(value)
      ? getFirstObject(value)
      : (value && typeof value === 'object' ? value : {})) as Record<string, unknown>

    // 检查是否有有效数据
    const objKeys = Object.keys(firstObj)
    if (objKeys.length === 0) {
      continue // 跳过空对象
    }

    // 初始化配置对象
    const configObj: Record<string, any> = {}
    let hasValidData = false

    // 先处理所有嵌套字段
    const nestedProps = objKeys.filter(prop => prop.includes(':'))
    const flatProps = objKeys.filter(prop => !prop.includes(':'))

    // 处理嵌套字段
    for (const prop of nestedProps) {
      const normalizedProp = isSummaryModuleKey(key)
        ? normalizeSummaryModuleProp(key, prop)
        : prop
      const propValue = normalizeFrontendValue(normalizedProp, firstObj[prop])

      if (propValue !== undefined && propValue !== null) {
        const keys = normalizedProp.split(':')
        setNestedProperty(configObj, keys, propValue)
        hasValidData = true
      }
    }

    // 处理扁平字段
    for (const prop of flatProps) {
      const normalizedProp = isSummaryModuleKey(key)
        ? normalizeSummaryModuleProp(key, prop)
        : prop
      const propValue = normalizeFrontendValue(normalizedProp, firstObj[prop])

      if (propValue !== undefined && propValue !== null) {
        configObj[normalizedProp] = propValue
        hasValidData = true
      }
    }

    // 只有当有有效数据时才添加到结果中
    if (hasValidData && Object.keys(configObj).length > 0) {
      if (key === 'guestCookie') {
        normalizeGuestCookieFrontendConfig(configObj)
      }
      if (isSummaryModuleKey(key)) {
        result.app = {
          ...(result.app ?? {}),
          [key]: configObj
        }
      } else if (key === 'app' && result.app) {
        result.app = {
          ...configObj,
          ...result.app
        }
      } else {
        result[key] = configObj
      }
    }
  }

  // 只在前端确实提交推送列表时生成 pushlist，避免保存其他模块时清空订阅。
  const submittedDouyinPushlist = Object.hasOwn(data, 'pushlist:douyin')
  const submittedBilibiliPushlist = Object.hasOwn(data, 'pushlist:bilibili')
  if (submittedDouyinPushlist || submittedBilibiliPushlist) {
    const pushlist: Partial<ConfigType['pushlist']> = {}
    if (submittedDouyinPushlist) {
      pushlist.douyin = data['pushlist:douyin'] || []
    }
    if (submittedBilibiliPushlist) {
      pushlist.bilibili = (data['pushlist:bilibili'] || []).map(item => {
        return {
          ...item,
          host_mid: Number(item.host_mid)
        }
      })
    }
    result.pushlist = pushlist as ConfigType['pushlist']
  }

  return result as ConfigType
}

/**
 * 通用的扁平化字段清理函数
 * 自动检测并清理与嵌套结构冲突的扁平化字段
 * @param obj 要清理的对象
 */
const cleanFlattenedFields = (obj: any): void => {
  if (!obj || typeof obj !== 'object') return

  for (const [, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // 递归处理嵌套对象
      cleanFlattenedFields(value)

      // 类型断言确保value是一个对象
      const valueObj = value as Record<string, any>

      // 收集所有扁平化字段（包含点号的字段）
      const flattenedKeys = Object.keys(valueObj).filter(k => k.includes('.'))

      for (const flatKey of flattenedKeys) {
        const parts = flatKey.split('.')

        // 检查是否存在对应的嵌套结构
        if (hasNestedStructure(valueObj, parts)) {
          // 删除扁平化字段
          delete valueObj[flatKey]
        }
      }
    }
  }
}

/**
 * 检查对象中是否存在指定路径的嵌套结构
 * @param obj 要检查的对象
 * @param path 路径数组
 * @returns 是否存在嵌套结构
 */
const hasNestedStructure = (obj: Record<string, any>, path: string[]): boolean => {
  let current = obj

  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]
    if (!current[key] || typeof current[key] !== 'object') {
      return false
    }
    current = current[key]
  }

  // 检查最后一个键是否存在
  const lastKey = path[path.length - 1]
  return lastKey in current
}
