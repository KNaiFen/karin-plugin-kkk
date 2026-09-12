export type PlainTitleReplyType = 'video' | 'image' | 'article' | 'live' | 'text'

export interface plainTitleReplyConfig {
  switch: boolean
  types: PlainTitleReplyType[]
}

export type plainTitleReplyConfigCompat = boolean | plainTitleReplyConfig
