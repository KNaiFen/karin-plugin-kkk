export type XSendContent = 'info' | 'image' | 'video'

export interface XIdData {
  type: 'status' | 'unknown'
  url: string
  statusId?: string
  screenName?: string
}

export interface XAuthor {
  name: string
  screenName: string
  avatar?: string
  description?: string
}

export interface XVideoInfo {
  url: string
  backupUrls: string[]
  cover?: string
  duration?: number
}

export interface XStatusStats {
  view?: number
  like?: number
  comment?: number
  bookmark?: number
  share?: number
}

export interface XStatus {
  id: string
  text: string
  sensitive: boolean
  createdAt?: number
  author: XAuthor
  images: string[]
  video?: XVideoInfo
  stats: XStatusStats
  quotedStatus?: XStatus
  retweetedStatus?: XStatus
}

export interface XStatusDetail {
  type: 'status'
  url: string
  status: XStatus
}

export type XDetail = XStatusDetail
