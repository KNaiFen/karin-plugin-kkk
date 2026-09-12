export type WeiboSendContent = 'info' | 'image' | 'video'

export interface WeiboIdData {
  type: 'status' | 'video_show' | 'unknown'
  url: string
  statusId?: string
  fid?: string
}

export interface WeiboAuthor {
  id?: string
  name: string
  avatar?: string
  description?: string
}

export interface WeiboVideoInfo {
  url: string
  backupUrls: string[]
  cover?: string
  title?: string
}

export interface WeiboStatusStats {
  repost?: number
  comment?: number
  like?: number
}

export interface WeiboStatus {
  id: string
  bid: string
  title?: string
  text: string
  source?: string
  regionName?: string
  createdAt?: number
  author: WeiboAuthor
  images: string[]
  video?: WeiboVideoInfo
  stats: WeiboStatusStats
  repostedStatus?: WeiboStatus
}

export interface WeiboShowDetail {
  fid: string
  title: string
  text: string
  createdAt?: number
  author: WeiboAuthor
  video: WeiboVideoInfo
}

export interface WeiboStatusDetail {
  type: 'status'
  url: string
  status: WeiboStatus
}

export interface WeiboVideoShowDetail {
  type: 'video_show'
  url: string
  show: WeiboShowDetail
}

export type WeiboDetail = WeiboStatusDetail | WeiboVideoShowDetail
