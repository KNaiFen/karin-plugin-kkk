import type { BaseComponentProps } from '../../index'

export type ExternalPostPlatformKey =
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

export type ExternalPostContentBlock =
  | { type: 'html', html: string, trusted?: boolean }
  | { type: 'text', text: string }
  | { type: 'image', url: string, alt?: string }

export interface ExternalPostPagination {
  pageIndex: number
  pageCount: number
}

export interface ExternalPostCardData {
  platform: {
    key: ExternalPostPlatformKey
    label: string
    accentColor: string
  }
  title: string
  author: {
    name: string
    avatar?: string
  }
  summary: string
  url: string
  images: string[]
  content?: ExternalPostContentBlock[]
  stats: Array<{
    label: string
    value: string
  }>
  meta: Array<{
    label: string
    value: string
  }>
  pagination?: ExternalPostPagination
}

export interface ExternalPostCardProps extends BaseComponentProps<ExternalPostCardData> {}
