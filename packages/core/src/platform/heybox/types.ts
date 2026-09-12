export type HeyboxSendContent = 'info' | 'image' | 'video' | 'comment'

export type HeyboxConfig = {
  sendContent?: HeyboxSendContent[]
}

export type HeyboxIdData = {
  type: 'link' | 'unknown'
  link_id?: string
  url?: string
}

export type HeyboxContentPart =
  | {
    type: 'text'
    text: string
  }
  | {
    type: 'image'
    url: string
  }
  | {
    type: 'video'
    url: string
    cover?: string
  }

export type HeyboxAuthor = {
  id?: string
  name: string
  avatar?: string
  location?: string
}

export type HeyboxStats = {
  view: number
  like: number
  comment: number
  share: number
  collect: number
}

export type HeyboxComment = {
  author: HeyboxAuthor
  content: HeyboxContentPart[]
  createdAt?: number
  location?: string
  stats: {
    like: number
    reply: number
  }
  replies: HeyboxComment[]
}

export type HeyboxDetail = {
  linkId: string
  url: string
  title: string
  description: string
  author: HeyboxAuthor
  createdAt?: number
  content: HeyboxContentPart[]
  images: string[]
  video?: {
    url: string
    cover?: string
  }
  stats: HeyboxStats
  comments: HeyboxComment[]
  raw: unknown
}

export type HeyboxApiUser = {
  avatar?: string
  username?: string
  userid?: string | number
}

export type HeyboxApiImage = {
  url?: string
}

export type HeyboxApiCommentItem = {
  is_cy?: number
  create_at?: number
  text?: string
  ip_location?: string
  child_num?: number
  up?: number
  user?: HeyboxApiUser
  imgs?: HeyboxApiImage[]
}

export type HeyboxApiCommentData = {
  comment?: HeyboxApiCommentItem[]
}

export type HeyboxApiLink = {
  has_video?: number
  title?: string
  description?: string
  text?: string
  ip_location?: string
  click?: number
  comment_num?: number
  create_at?: number
  favour_count?: number
  link_award_num?: number
  forward_num?: number
  user?: HeyboxApiUser
  video_url?: string | null
  video_thumb?: string | null
}

export type HeyboxApiResult = {
  comments?: HeyboxApiCommentData[]
  link?: HeyboxApiLink
}

export type HeyboxApiResponse = {
  status?: string
  result?: HeyboxApiResult
  msg?: string
  message?: string
}
