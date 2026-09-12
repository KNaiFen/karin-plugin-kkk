export type ResponsesReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

export interface sharedSummaryLlmConfig {
  /** 接口基础地址 */
  baseUrl: string
  /** API Key */
  apiKey: string
  /** 模型名 */
  model: string
  /** 请求超时，毫秒 */
  timeoutMs: number
  /** 重试次数，仅对首次失败后的追加尝试次数生效 */
  retryCount: number
  /** 重试间隔，毫秒 */
  retryDelayMs: number
}

export interface summaryParseLlmConfig extends sharedSummaryLlmConfig {
  /** 是否启用联网搜索 */
  webSearchEnabled?: boolean
  /** 是否启用深度思考 */
  reasoningEnabled?: boolean
  /** 深度思考强度 */
  reasoningEffort?: ResponsesReasoningEffort
}

export interface detailedSummaryParseLlmConfig extends sharedSummaryLlmConfig {
  /** 是否启用联网搜索 */
  webSearchEnabled: boolean
  /** 是否启用深度思考 */
  reasoningEnabled: boolean
  /** 深度思考强度 */
  reasoningEffort: ResponsesReasoningEffort
}

export interface transcriptOriginalLlmConfig extends sharedSummaryLlmConfig {
  /** 是否启用深度思考 */
  reasoningEnabled: boolean
  /** 深度思考强度 */
  reasoningEffort: ResponsesReasoningEffort
}

export interface summaryParseAsrConfig {
  /** ASR 优先模式 */
  mode: 'cloud' | 'local'
  /** whisper.cpp CLI 路径 */
  whisperCppPath: string
  /** whisper.cpp 模型路径 */
  modelPath: string
  /** 语种 */
  language: string
  /** 转写线程数 */
  threads: number
  /** ffmpeg 路径 */
  ffmpegPath: string
  /** 抽音目标码率（kbps） */
  audioBitrateKbps: number
  /** 单段最大时长（分钟） */
  maxSegmentMinutes: number
  /** 视频抽帧配置 */
  videoFrames?: {
    /** 是否启用视频抽帧 */
    enabled: boolean
    /** 最小抽图间隔（秒） */
    minIntervalSeconds: number
    /** 最大抽图数量 */
    maxImages: number
    /** 跳过片头秒数 */
    skipStartSeconds: number
    /** 跳过片尾秒数 */
    skipEndSeconds: number
    /** 抽帧视频源策略 */
    sourceMode: 'auto' | 'summary_optimized' | 'parsed_content'
  }
  /** 云端 ASR 配置 */
  cloud: {
    /** 接口基础地址 */
    baseUrl: string
    /** API Key */
    apiKey: string
    /** 模型名 */
    model: string
    /** 请求超时，毫秒 */
    timeoutMs: number
    /** 重试次数，仅对云端音频转写生效 */
    retryCount: number
    /** 重试间隔，毫秒 */
    retryDelayMs: number
  }
}

export interface summaryParseSharedConfig<LlmConfig = summaryParseLlmConfig> {
  /** 解析总结开关 */
  switch: boolean
  /** 触发关键词列表，不包含前导斜杠 */
  keywords: string[]
  /** 生成总结后是否继续发送原始解析内容 */
  sendParsedContent: boolean
  /** OpenAI-compatible LLM 配置 */
  llm: LlmConfig
  /** 视频 ASR 配置 */
  asr: summaryParseAsrConfig
}

/** 定义视频解析工具的配置接口 */
export interface summaryParseConfig extends summaryParseSharedConfig {}

export interface detailedSummaryParseConfig extends summaryParseSharedConfig<detailedSummaryParseLlmConfig> {
  /** Markdown 渲染配置 */
  markdownRender: {
    /** 是否启用 Markdown 消息段渲染 */
    enabled: boolean
    /** 是否附带发送清洗后的纯文字版本 */
    sendTextVersion: boolean
    /** Markdown 渲染字体大小（px） */
    fontSizePx: number
    /** 是否启用详细研报独立分页 */
    multiPageEnabled: boolean
    /** Markdown 渲染图分页触发高宽比 */
    multiPageTriggerAspectRatio: number
    /** Markdown 渲染图分页后单页最大高宽比 */
    multiPageMaxAspectRatio: number
  }
}

export interface transcriptOriginalConfig extends summaryParseSharedConfig<transcriptOriginalLlmConfig> {
  /** Markdown 渲染配置 */
  markdownRender: {
    /** 是否启用 Markdown 消息段渲染 */
    enabled: boolean
    /** 是否附带发送清洗后的纯文字版本 */
    sendTextVersion: boolean
    /** Markdown 渲染字体大小（px） */
    fontSizePx: number
    /** 是否启用独立分页 */
    multiPageEnabled: boolean
    /** Markdown 渲染图分页触发高宽比 */
    multiPageTriggerAspectRatio: number
    /** Markdown 渲染图分页后单页最大高宽比 */
    multiPageMaxAspectRatio: number
  }
}

export interface appConfig {
  /** 自动更新开关，关闭后定时检查、提醒回复和手动更新命令都不会生效 */
  autoUpdate: boolean

  /** 检测到已安装新版本后自动重启，让新版本生效 */
  autoRestartOnInstalledUpdate: boolean

  /** 长任务完成后提醒触发者 */
  longTaskCompletionNotify: boolean

  /** 长任务提醒阈值，单位毫秒 */
  longTaskCompletionNotifyThresholdMs: number

  /** 默认解析，即识别最高优先级，修改后重启生效 */
  videoTool: boolean

  /** 自定义优先级，「默认解析」关闭后才会生效。修改后重启生效 */
  priority: number

  /** 缓存自动删除，非必要不修改！ */
  removeCache: boolean

  /** 可复用共享缓存保留时长，单位小时 */
  sharedCacheTtlHours: number

  /** 渲染精度，可选值50~200，建议100。设置高精度会提高图片的精细度，过高可能会影响渲染与发送速度 */
  renderScale: number

  /** 渲染图片的主题色，0为自动，1为浅色，2为深色 */
  Theme: number

  /** 渲染的图片是否移除底部水印 */
  RemoveWatermark: boolean

  /** 渲染图片的等待时间，单位：秒；传递0可禁用 */
  RenderWaitTime: number

  /** 表情回应，若适配器不支持需要关闭 */
  EmojiReply: boolean

  /** 解析提示，发送提示信息："检测到xxx链接，开始解析" */
  parseTip: boolean

  /** 是否伪造合并转发消息，开启后使用触发者身份展示转发 */
  fakeForward: boolean

  // /**
  //  * 表情 ID
  //  * @see https://github.com/NapNeko/NapCatQQ/blob/main/packages/napcat-core/external/face_config.json
  //  */
  // EmojiReplyID: number

  // /** 忽略表情回应失败，开启后表情回应失败时不会抛出错误 */
  // EmojiReplyIgnoreError: boolean

  /** 遇到错误时谁会收到错误日志？可选值：'master'（除'console'外的第一个主人）、'allMasters'（所有主人，排除console）、'trigger'（触发者） */
  errorLogSendTo: Array<'master' | 'allMasters' | 'trigger'>

  /** 智能分页渲染，将超长渲染图按安全位置拆成多页图片，默认开启 */
  multiPageRender: boolean

  /** 渲染图高宽比超过该值时触发智能分页 */
  multiPageTriggerAspectRatio: number

  /** 智能分页后，单页允许的最大高宽比 */
  multiPageMaxAspectRatio: number

  /** 渲染图输出格式，auto 为按模板使用内置推荐 */
  renderImageFormat: 'auto' | 'png' | 'jpeg'

  /** JPEG 渲染质量，1-100；auto/手动 JPEG 输出时生效 */
  renderImageQuality: number

  /** 解析包含 Live Photo 作品时，发送的静态图兼容系统
   * - 'google': Google Motion Photo 格式
   * - 'xiaomi': 小米实况照片格式，兼容小米（支持实况照片的任何版本）和 Google，但无法被 OPPO 识别
   * - 'oppo': OPPO 实况照片格式（推荐），兼容 OPPO、小米（较新版本）和 Google，兼容性最广
   * - 'huawei_honor': 华为/荣耀实况照片格式（理论可行但未实测，作者无对应设备）
   * 注：vivo（Origin OS）和 iPhone（iOS）需要独立的图片和同名视频文件，暂不支持
   */
  livePhotoSystem: 'google' | 'xiaomi' | 'oppo' | 'huawei_honor'

  /** 解析遇到实况图时的处理和发送方式
   * - 'video_and_livephoto': 生成并发送仿 iPhone Live Photo 播放效果的视频（播放三次，性能开销大，2C2G 服务器约 20s/张）+ 对应系统的实况图
   * - 'video_only': 仅生成并发送仿 iPhone Live Photo 播放效果的视频（播放三次，性能开销大，2C2G 服务器约 20s/张）
   * - 'livephoto_only': 仅生成并发送对应系统的实况图
   */
  livePhotoMode: 'video_and_livephoto' | 'video_only' | 'livephoto_only'

  /** 扫码登录时使用的地址类型，可选值：'lan'（局域网IP）、'external'（外部地址） */
  qrLoginAddrType: 'lan' | 'external'

  /** 外部访问地址（当 qrLoginAddrType 为 'external' 时使用，可以是公网IP或域名） */
  qrLoginExternalAddr: string

  /** 解析总结配置 */
  summaryParse: summaryParseConfig

  /** 详细解析总结配置 */
  detailedSummaryParse: detailedSummaryParseConfig

  /** 转写原文配置 */
  transcriptOriginal: transcriptOriginalConfig
}
