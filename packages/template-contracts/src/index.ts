export type {
  BaseComponentProps,
  DataTypeMap,
  DynamicRenderPath,
  ExtractDataTypeFromPath,
  QRCodeSectionProps,
  RenderRequest,
  RenderResponse,
  TypedRenderRequest
} from './types/index'
export const PlatformType = {
  DOUYIN: 'douyin',
  BILIBILI: 'bilibili',
  KUAISHOU: 'kuaishou',
  XIAOHONGSHU: 'xiaohongshu',
  HELP: 'help',
  OTHER: 'other',
  STATISTICS: 'statistics'
} as const

export type PlatformType = typeof PlatformType[keyof typeof PlatformType]
export type {
  BaseTemplateData,
  PlatformConfig,
  TemplateConfig
} from './types/platforms'
export type {
  ApiErrorProps
} from './types/platforms/other/handlerError'
export type {
  BilibiliPosterPalette
} from './types/platforms/bilibili/dynamic/live'
export type {
  BilibiliUserListProps
} from './types/platforms/bilibili/userlist'
export type {
  ChangelogProps
} from './types/platforms/other/changelog'
export type {
  CommentItem,
  SubCommentItem
} from './types/platforms/bilibili/comment'
export type {
  DecorationCardData
} from './types/platforms/bilibili/dynamic/normal'
export type {
  DouyinCommentProps
} from './types/platforms/douyin/comment'
export type {
  KuaishouCommentItem
} from './types/platforms/kuaishou/comment'
export type {
  UserVideoListData
} from './types/platforms/douyin/UserVideoList'
export type {
  XiaohongshuCommentItem,
  XiaohongshuSubComment
} from './types/platforms/xiaohongshu/comment'
export type {
  BilibiliCommentProps,
  FanCardInfo,
  FansDetail
} from './types/platforms/bilibili/comment'
export type {
  BangumiBilibiliData,
  BangumiBilibiliHeaderProps,
  BilibiliBangumiProps
} from './types/platforms/bilibili/bangumi'
export type {
  BilibiliArticleDynamicProps
} from './types/platforms/bilibili/dynamic/article'
export type {
  BilibiliForwardDynamicProps,
  OriginalContentAV,
  OriginalContentDraw,
  OriginalContentLiveRcmd,
  OriginalContentWord
} from './types/platforms/bilibili/dynamic/forward'
export type {
  BilibiliLiveDynamicProps
} from './types/platforms/bilibili/dynamic/live'
export type {
  BilibiliAdditionalData,
  BilibiliDynamicBaseData,
  BilibiliDynamicContentProps,
  BilibiliDynamicFooterProps,
  BilibiliDynamicProps,
  BilibiliWordContentProps,
  BilibiliWordDynamicProps,
  UsernameMetadata
} from './types/platforms/bilibili/dynamic/normal'
export type {
  BilibiliVideoDynamicProps
} from './types/platforms/bilibili/dynamic/video'
export type {
  BilibiliQrcodeImgProps
} from './types/platforms/bilibili/index'
export type {
  BilibiliVideoInfoProps
} from './types/platforms/bilibili/videoInfo'
export type {
  DouyinArticleWorkProps
} from './types/platforms/douyin/articleWork'
export type {
  DouyinSubComment
} from './types/platforms/douyin/comment'
export type {
  DouyinDynamicProps
} from './types/platforms/douyin/dynamic'
export type {
  DouyinFavoriteListProps
} from './types/platforms/douyin/favorite-list'
export type {
  DouyinImageWorkProps
} from './types/platforms/douyin/imageWork'
export type {
  DouyinQrcodeImgProps
} from './types/platforms/douyin/index'
export type {
  DouyinLiveProps
} from './types/platforms/douyin/live'
export type {
  DouyinLongTextWorkCreator,
  DouyinLongTextWorkData,
  DouyinLongTextWorkProps,
  DouyinLongTextWorkType
} from './types/platforms/douyin/longTextWork'
export type {
  DouyinMusicInfoProps,
  MusicAuthorInfoProps,
  MusicCoverProps,
  MusicInfoProps,
  MusicQRCodeProps
} from './types/platforms/douyin/musicinfo'
export type {
  DouyinRecommendListProps
} from './types/platforms/douyin/recommend-list'
export type {
  DouyinUserListProps
} from './types/platforms/douyin/userlist'
export type {
  DouyinUserVideoListProps
} from './types/platforms/douyin/UserVideoList'
export type {
  DouyinVideoInfoProps
} from './types/platforms/douyin/videoInfo'
export type {
  DouyinVideoWorkProps
} from './types/platforms/douyin/videoWork'
export type {
  KuaishouCommentItemComponentProps,
  KuaishouCommentProps,
  KuaishouQRCodeSectionProps,
  KuaishouVideoInfoHeaderProps
} from './types/platforms/kuaishou/comment'
export type {
  ExternalPostCardProps,
  ExternalPostContentBlock
} from './types/platforms/other/externalPost'
export type {
  BusinessError,
  LogLevel
} from './types/platforms/other/handlerError'
export type {
  HelpProps,
  MenuGroup,
  MenuItem
} from './types/platforms/other/help'
export type {
  LivePhotoTipProps
} from './types/platforms/other/livePhotoTip'
export type {
  QrLoginProps
} from './types/platforms/other/qrlogin'
export type {
  GlobalStatisticsProps,
  GroupStatisticsProps
} from './types/platforms/other/statistics'
export type {
  VersionWarningProps
} from './types/platforms/other/VersionWarningProps'
export type {
  XiaohongshuCommentItemComponentProps,
  XiaohongshuCommentProps,
  XiaohongshuNoteInfoHeaderProps,
  XiaohongshuQRCodeSectionProps
} from './types/platforms/xiaohongshu/comment'
export type {
  XiaohongshuNoteInfoProps
} from './types/platforms/xiaohongshu/noteInfo'
