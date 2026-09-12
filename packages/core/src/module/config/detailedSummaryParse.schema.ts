import type { SectionSchema } from './schema'
import { $not } from './schema'

export const detailedSummaryParseConfigSchema: SectionSchema = {
  key: 'detailedSummaryParse',
  title: '详细解析总结相关',
  subtitle: '此处用于管理解析链接后调用 OpenAI Responses 生成研报的专用设置',
  fields: [
    { type: 'divider', title: '详细解析总结配置' },
    {
      key: 'switch',
      type: 'switch',
      label: '启用详细解析总结',
      description: '命中 `#关键词 ` 开头的消息后，先解析链接内容，再调用 OpenAI Responses 生成研报'
    },
    {
      key: 'keywords',
      type: 'input',
      inputType: 'text',
      label: '触发关键词',
      description: '前端保存时会作为关键词数组处理；使用方式：#关键词 待解析内容',
      placeholder: '例如：详细总结'
    },
    {
      key: 'sendParsedContent',
      type: 'switch',
      label: '继续发送原解析内容',
      description: '生成研报后，是否继续按原平台配置发送解析图文/视频等内容',
      disabled: $not('switch')
    },
    {
      key: 'markdownRender.enabled',
      type: 'switch',
      label: '启用 Markdown 渲染图',
      description: '要求 LLM 输出原生 Markdown，并由插件内置渲染链路生成截图；失败时会自动回退纯文本',
      disabled: $not('switch')
    },
    {
      key: 'markdownRender.sendTextVersion',
      type: 'switch',
      label: '附带纯文字版',
      description: 'Markdown 渲染图发送后，再附带一份清洗后的纯文字版，便于复制和检索',
      disabled: $not('markdownRender.enabled')
    },
    {
      key: 'markdownRender.fontSizePx',
      type: 'input',
      inputType: 'number',
      label: 'Markdown 字体大小',
      description: '单位：px，仅对 Markdown 渲染图生效',
      disabled: $not('markdownRender.enabled'),
      rules: [{ min: 12, max: 24, error: '请输入一个范围在 12 到 24 之间的数字' }]
    },
    {
      key: 'markdownRender.multiPageEnabled',
      type: 'switch',
      label: '启用 Markdown 独立分页',
      description: '根据详细研报自身内容长度单独分页，不受全局渲染分页开关影响',
      disabled: $not('markdownRender.enabled')
    },
    {
      key: 'markdownRender.multiPageTriggerAspectRatio',
      type: 'input',
      inputType: 'number',
      label: 'Markdown 分页触发比例',
      description: '当 Markdown 渲染图的高宽比超过该值时开始分页',
      disabled: $not('markdownRender.enabled'),
      rules: [{ min: 1.2, max: 10, error: '请输入一个范围在 1.2 到 10 之间的数字' }]
    },
    {
      key: 'markdownRender.multiPageMaxAspectRatio',
      type: 'input',
      inputType: 'number',
      label: 'Markdown 分页后单页比例',
      description: '分页后每一页允许的最大高宽比',
      disabled: $not('markdownRender.enabled'),
      rules: [{ min: 1.1, max: 10, error: '请输入一个范围在 1.1 到 10 之间的数字' }]
    },
    {
      key: 'llm.baseUrl',
      type: 'input',
      inputType: 'text',
      label: 'Responses Base URL',
      description: 'OpenAI Responses API 接口基础地址，例如 https://api.openai.com/v1',
      disabled: $not('switch')
    },
    {
      key: 'llm.apiKey',
      type: 'input',
      inputType: 'password',
      label: 'Responses API Key',
      description: 'OpenAI Responses API 接口密钥',
      disabled: $not('switch')
    },
    {
      key: 'llm.model',
      type: 'input',
      inputType: 'text',
      label: 'Responses Model',
      description: 'OpenAI Responses API 模型名',
      disabled: $not('switch')
    },
    {
      key: 'llm.timeoutMs',
      type: 'input',
      inputType: 'number',
      label: 'Responses 超时',
      description: '单位：毫秒',
      disabled: $not('switch'),
      rules: [{ min: 1000, max: 300000, error: '请输入一个范围在 1000 到 300000 之间的数字' }]
    },
    {
      key: 'llm.retryCount',
      type: 'input',
      inputType: 'number',
      label: 'Responses 重试次数',
      description: '仅对超时、断连等瞬时失败生效；0 表示不重试',
      disabled: $not('switch'),
      rules: [{ min: 0, max: 10, error: '请输入一个范围在 0 到 10 之间的数字' }]
    },
    {
      key: 'llm.retryDelayMs',
      type: 'input',
      inputType: 'number',
      label: 'Responses 重试间隔',
      description: '单位：毫秒，失败后等待多久再发起下一次尝试',
      disabled: $not('switch'),
      rules: [{ min: 0, max: 60000, error: '请输入一个范围在 0 到 60000 之间的数字' }]
    },
    {
      key: 'llm.webSearchEnabled',
      type: 'switch',
      label: '启用联网搜索',
      description: '使用 OpenAI Responses 的 web_search 工具获取外部资料',
      disabled: $not('switch')
    },
    {
      key: 'llm.reasoningEnabled',
      type: 'switch',
      label: '启用深度思考',
      description: '为支持的 Responses 模型显式设置 reasoning 参数',
      disabled: $not('switch')
    },
    {
      key: 'llm.reasoningEffort',
      type: 'radio',
      label: '思考强度',
      description: 'OpenAI Responses reasoning.effort 参数',
      orientation: 'horizontal',
      disabled: $not('switch'),
      options: [
        { label: 'Minimal', value: 'minimal' },
        { label: 'Low', value: 'low' },
        { label: 'Medium', value: 'medium' },
        { label: 'High', value: 'high' },
        { label: 'XHigh', value: 'xhigh' }
      ]
    },
    {
      key: 'asr.mode',
      type: 'radio',
      label: 'ASR 优先模式',
      description: '平台字幕不可用时，优先尝试云端还是本地 ASR',
      orientation: 'horizontal',
      disabled: $not('switch'),
      options: [
        { label: '云端优先', value: 'cloud' },
        { label: '本地优先', value: 'local' }
      ]
    },
    {
      key: 'asr.whisperCppPath',
      type: 'input',
      inputType: 'text',
      label: 'whisper.cpp 路径',
      description: '本地 whisper.cpp CLI 可执行文件路径',
      disabled: $not('switch')
    },
    {
      key: 'asr.modelPath',
      type: 'input',
      inputType: 'text',
      label: 'whisper.cpp 模型路径',
      description: 'whisper.cpp 使用的模型文件路径',
      disabled: $not('switch')
    },
    {
      key: 'asr.language',
      type: 'input',
      inputType: 'text',
      label: 'ASR 语言',
      description: '例如 zh、en、ja',
      disabled: $not('switch')
    },
    {
      key: 'asr.threads',
      type: 'input',
      inputType: 'number',
      label: 'ASR 线程数',
      description: '调用 whisper.cpp 时使用的线程数',
      disabled: $not('switch'),
      rules: [{ min: 1, max: 128, error: '请输入一个范围在 1 到 128 之间的数字' }]
    },
    {
      key: 'asr.ffmpegPath',
      type: 'input',
      inputType: 'text',
      label: 'ffmpeg 路径',
      description: '用于从视频抽取音频的 ffmpeg 可执行文件路径',
      disabled: $not('switch')
    },
    {
      key: 'asr.audioBitrateKbps',
      type: 'input',
      inputType: 'number',
      label: '抽音码率',
      description: '单位：kbps，用于控制送 ASR 的音频体积',
      disabled: $not('switch'),
      rules: [{ min: 8, max: 320, error: '请输入一个范围在 8 到 320 之间的数字' }]
    },
    {
      key: 'asr.maxSegmentMinutes',
      type: 'input',
      inputType: 'number',
      label: '最长切片时长',
      description: '单位：分钟，超出时会自动按段切分后再转写',
      disabled: $not('switch'),
      rules: [{ min: 1, max: 60, error: '请输入一个范围在 1 到 60 之间的数字' }]
    },
    {
      key: 'asr.cloud.baseUrl',
      type: 'input',
      inputType: 'text',
      label: '云端 ASR Base URL',
      description: 'OpenAI-compatible 音频转写接口基础地址，例如 https://api.siliconflow.cn/v1',
      disabled: $not('switch')
    },
    {
      key: 'asr.cloud.apiKey',
      type: 'input',
      inputType: 'password',
      label: '云端 ASR API Key',
      description: '云端音频转写接口密钥',
      disabled: $not('switch')
    },
    {
      key: 'asr.cloud.model',
      type: 'input',
      inputType: 'text',
      label: '云端 ASR Model',
      description: '云端音频转写模型名',
      disabled: $not('switch')
    },
    {
      key: 'asr.cloud.timeoutMs',
      type: 'input',
      inputType: 'number',
      label: '云端 ASR 超时',
      description: '单位：毫秒',
      disabled: $not('switch'),
      rules: [{ min: 1000, max: 300000, error: '请输入一个范围在 1000 到 300000 之间的数字' }]
    },
    {
      key: 'asr.cloud.retryCount',
      type: 'input',
      inputType: 'number',
      label: '云端 ASR 重试次数',
      description: '仅对云端音频转写的超时、断连等瞬时失败生效；0 表示不重试',
      disabled: $not('switch'),
      rules: [{ min: 0, max: 10, error: '请输入一个范围在 0 到 10 之间的数字' }]
    },
    {
      key: 'asr.cloud.retryDelayMs',
      type: 'input',
      inputType: 'number',
      label: '云端 ASR 重试间隔',
      description: '单位：毫秒，失败后等待多久再发起下一次云端转写',
      disabled: $not('switch'),
      rules: [{ min: 0, max: 60000, error: '请输入一个范围在 0 到 60000 之间的数字' }]
    },
    {
      key: 'asr.videoFrames.enabled',
      type: 'switch',
      label: '启用视频抽帧',
      description: '从视频中按时间间隔导出画面，并作为多模态图片一起发给 LLM',
      disabled: $not('switch')
    },
    {
      key: 'asr.videoFrames.sourceMode',
      type: 'radio',
      label: '抽帧视频源',
      description: '自动：开启“继续发送原解析内容”时用正常解析质量，否则优先最小体积视频源',
      orientation: 'horizontal',
      disabled: $not('switch'),
      options: [
        { label: '自动', value: 'auto' },
        { label: '最小体积', value: 'summary_optimized' },
        { label: '正常解析质量', value: 'parsed_content' }
      ]
    },
    {
      key: 'asr.videoFrames.minIntervalSeconds',
      type: 'input',
      inputType: 'number',
      label: '最低抽图间隔',
      description: '单位：秒；短视频按该间隔抽图，长视频会自动拉大间隔以满足最大数量限制',
      disabled: $not('switch'),
      rules: [{ min: 1, max: 3600, error: '请输入一个范围在 1 到 3600 之间的数字' }]
    },
    {
      key: 'asr.videoFrames.maxImages',
      type: 'input',
      inputType: 'number',
      label: '最大抽图数量',
      description: '长视频达到上限后会自动增大抽图间隔',
      disabled: $not('switch'),
      rules: [{ min: 1, max: 60, error: '请输入一个范围在 1 到 60 之间的数字' }]
    },
    {
      key: 'asr.videoFrames.skipStartSeconds',
      type: 'input',
      inputType: 'number',
      label: '跳过片头秒数',
      description: '抽图时避开视频开头若干秒，减少片头空镜或片头 logo 干扰',
      disabled: $not('switch'),
      rules: [{ min: 0, max: 600, error: '请输入一个范围在 0 到 600 之间的数字' }]
    },
    {
      key: 'asr.videoFrames.skipEndSeconds',
      type: 'input',
      inputType: 'number',
      label: '跳过片尾秒数',
      description: '抽图时避开视频结尾若干秒，减少片尾字幕、黑场或结束页干扰',
      disabled: $not('switch'),
      rules: [{ min: 0, max: 600, error: '请输入一个范围在 0 到 600 之间的数字' }]
    }
  ]
}
