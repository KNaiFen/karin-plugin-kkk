import type { BaseComponentProps } from '../../index'

export type DouyinLongTextWorkType = '视频' | '图集' | '合辑'

export interface DouyinLongTextWorkCreator {
  avatar_url?: string
  nickname: string
  role_title: string
}

export interface DouyinLongTextWorkData {
  useDarkTheme?: boolean
  text: string
  work_type: DouyinLongTextWorkType
  image_url?: string
  create_time: string
  author: {
    name: string
    avatar: string
    douyin_id: string
    follower_count?: number
    total_favorited?: number
    following_count?: number
  }
  statistics: {
    digg_count: number
    comment_count: number
    collect_count: number
    share_count: number
  }
  music?: {
    author: string
    title: string
    cover?: string
  }
  video?: {
    duration: number
    width: number
    height: number
    ratio?: string
  }
  cooperation_info?: {
    co_creator_nums: number
    co_creators: DouyinLongTextWorkCreator[]
    subscriber_role?: string
  }
  dynamicTYPE?: string
  share_url: string
}

export interface DouyinLongTextWorkProps extends BaseComponentProps<DouyinLongTextWorkData> {
  qrCodeDataUrl?: string
}
