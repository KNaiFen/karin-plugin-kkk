import type { ExternalPostContentBlock } from '@/platform/externalPostCard'
import type {
  ParsedPost,
  ParsedPostBlock,
  ParsedPostImage,
  ParsedPostSubtitle,
  ParsedPostVideo
} from '@/platform/parsedPost'
import type { summaryParseConfig } from '@/types/config/app'

export type SummaryTrigger = {
  keyword: string
  rest: string
}

export type SummaryParsePlatform =
  | 'bilibili'
  | 'douyin'
  | 'tiktok'
  | 'kuaishou'
  | 'xiaohongshu'
  | 'heybox'
  | 'x'
  | 'zhihu'
  | 'tieba'
  | 'wechat'
  | 'weibo'
  | 'github'

export type SummaryResolvedLink = {
  platform: SummaryParsePlatform
  url: string
}

export type SummaryMediaReference =
  | ({ type: 'image' } & ParsedPostImage)
  | ({ type: 'subtitle' } & ParsedPostSubtitle)
  | ({ type: 'video' } & ParsedPostVideo)

export type SummaryInputBlock = Extract<ParsedPostBlock, {
  type: 'text' | 'html' | 'image' | 'video'
}>

export type SummaryInput = {
  platform: SummaryParsePlatform
  platformLabel: string
  title: string
  author?: string
  summary?: string
  blocks: SummaryInputBlock[]
  videos: Array<Extract<SummaryMediaReference, { type: 'video' }>>
  stats: Array<{ label: string; value: string }>
  meta: Array<{ label: string; value: string }>
  shareContext?: string
  asrTexts: Array<{
    title?: string
    text: string
  }>
  videoFrames: Array<{
    title?: string
    images: Array<Extract<SummaryMediaReference, { type: 'image' }>>
  }>
  rawSource: ParsedPost
}

export type SummaryResult = {
  inputs: SummaryInput[]
  summaryText: string
  taskId?: string
  totalLinks?: number
}

export type SummaryExecutionOptions = {
  config: summaryParseConfig
}

export type SummaryTaskProgressContext = {
  taskId: string
  totalLinks: number
}

export type SummaryLinkProgressContext = SummaryTaskProgressContext & {
  linkIndex: number
  platform: string
  title?: string
}

export type NormalizedMultimodalImage = {
  url?: string
  deliveryMode:
    | 'inline-data-url'
    | 'remote-url-fallback'
    | 'prebuilt-data-url'
    | 'file-data-url'
    | 'base64-data-url'
    | 'skip'
  reason?: string
}

export type OpenAICompatibleMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<
    | {
      type: 'text'
      text: string
    }
    | {
      type: 'image_url'
      image_url: {
        url: string
      }
    }
  >
}

export type OpenAICompatibleChatRequest = {
  model: string
  messages: OpenAICompatibleMessage[]
  temperature?: number
  stream?: boolean
  enable_thinking?: boolean
}

export type OpenAICompatibleChatResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

export type OpenAICompatibleChatStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string | Array<
        | string
        | {
          type?: string
          text?: string
        }
      >
    }
    message?: {
      content?: string
    }
    finish_reason?: string | null
  }>
  error?: {
    message?: string
    code?: string
  }
}

export type SummaryRuntimeContext = {
  trigger: SummaryTrigger
  shareContext: string
  links: SummaryResolvedLink[]
}

export type SummaryTextRenderableBlock = Extract<SummaryInputBlock, { type: 'text' | 'html' }>

export const isExternalPostBlock = (
  block: ExternalPostContentBlock | undefined
): block is ExternalPostContentBlock => Boolean(block)

export type SummaryBuildSource = ParsedPost
export type SummaryExternalPostNormalization = {
  title: string
  author?: string
  summary?: string
  blocks: SummaryInputBlock[]
  videos: Array<Extract<SummaryMediaReference, { type: 'video' }>>
}

export type SummarySourceFactory = (
  url: string
) => Promise<SummaryBuildSource>
