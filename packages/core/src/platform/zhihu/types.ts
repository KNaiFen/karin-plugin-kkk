export type ZhihuContentType = 'answer' | 'article' | 'zvideo' | 'unknown'

export interface ZhihuIdData {
  type: ZhihuContentType
  url: string
  questionId?: string
  answerId?: string
  articleId?: string
  videoId?: string
}

export interface ZhihuAuthor {
  name: string
  headline?: string
  urlToken?: string
  avatarUrl?: string
}

export interface ZhihuQuestion {
  id: string
  title: string
  detail?: string
  answerCount?: number
  followerCount?: number
  commentCount?: number
  voteupCount?: number
}

export interface ZhihuVideoInfo {
  lensId: string
  url: string
  backupUrls: string[]
  title?: string
  cover?: string
}

export interface ZhihuRichContent {
  text: string
  images: string[]
  lensIds: string[]
  videos: ZhihuVideoInfo[]
}

export interface ZhihuAnswerDetail {
  type: 'answer'
  url: string
  question: ZhihuQuestion
  answer: {
    id: string
    author: ZhihuAuthor
    content: string
    createdTime?: number
    updatedTime?: number
    commentCount?: number
    voteupCount?: number
    ipInfo?: string
  }
  richContent: ZhihuRichContent
}

export interface ZhihuArticleDetail {
  type: 'article'
  url: string
  article: {
    id: string
    title: string
    author: ZhihuAuthor
    content: string
    createdTime?: number
    updatedTime?: number
    commentCount?: number
    voteupCount?: number
    ipInfo?: string
  }
  richContent: ZhihuRichContent
}

export type ZhihuDetail = ZhihuAnswerDetail | ZhihuArticleDetail
