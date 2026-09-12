export type ParsedPostPlatform =
  | 'zhihu'
  | 'tieba'
  | 'heybox'
  | 'weibo'
  | 'x'
  | 'bilibili'
  | 'douyin'
  | 'wechat'
  | 'xiaohongshu'
  | 'tiktok'
  | 'kuaishou'
  | 'github'

export type ParsedPostSubtype =
  | 'status'
  | 'video_show'
  | 'article'
  | 'answer'
  | 'video'
  | 'image'
  | 'dynamic'
  | 'bangumi'
  | 'live'
  | 'post'
  | 'note'
  | string

export type ParsedPostAuthor = {
  id?: string
  name: string
  avatar?: string
  description?: string
  screenName?: string
  location?: string
}

export type ParsedPostSubtitle = {
  source?: string
  language?: string
  label?: string
  text?: string
  url?: string
  headers?: Record<string, unknown>
}

export type ParsedPostImage = {
  url: string
  alt?: string
}

export type ParsedPostVideo = {
  url: string
  title?: string
  cover?: string
  backupUrls?: string[]
  audioUrl?: string
  audioBackupUrls?: string[]
  asrSourceType?: 'audio' | 'video'
  asrSourceUrl?: string
  asrSourceBackupUrls?: string[]
  durationSeconds?: number
  subtitles?: ParsedPostSubtitle[]
  headers?: Record<string, unknown>
}

export type ParsedPostStatsItem = {
  label: string
  value: string
}

export type ParsedPostMetaItem = {
  label: string
  value: string
}

export type ParsedPostBlock =
  | {
    type: 'text'
    text: string
  }
  | {
    type: 'html'
    html: string
    text?: string
  }
  | ({
    type: 'image'
  } & ParsedPostImage)
  | ({
    type: 'video'
  } & ParsedPostVideo)

export type ParsedPostRaw = Record<string, unknown> & {
  detail?: unknown
  idData?: unknown
  videos?: ParsedPostVideo[]
}

export type ParsedPost = {
  platform: ParsedPostPlatform
  platformLabel: string
  subtype: ParsedPostSubtype
  title: string
  author?: ParsedPostAuthor
  summary?: string
  url: string
  contentBlocks: ParsedPostBlock[]
  images: ParsedPostImage[]
  videos: ParsedPostVideo[]
  primaryVideo?: ParsedPostVideo
  stats: ParsedPostStatsItem[]
  meta: ParsedPostMetaItem[]
  raw: ParsedPostRaw
}

export const isParsedPostImageBlock = (
  block: ParsedPostBlock
): block is Extract<ParsedPostBlock, { type: 'image' }> => block.type === 'image'

export const isParsedPostVideoBlock = (
  block: ParsedPostBlock
): block is Extract<ParsedPostBlock, { type: 'video' }> => block.type === 'video'

export const isParsedPostTextBlock = (
  block: ParsedPostBlock
): block is Extract<ParsedPostBlock, { type: 'text' | 'html' }> =>
  block.type === 'text' || block.type === 'html'
