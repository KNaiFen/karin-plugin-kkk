import type { SummaryResolvedLink } from '@/module/summaryParse/types'
import { recordFailureTraceStep } from '@/module/utils/ErrorTrace'
import type { ParsedPost, ParsedPostPlatform } from '@/platform/parsedPost'

import {
  resolveBilibiliParsedPost,
  resolveDouyinParsedPost,
  resolveGithubParsedPost,
  resolveHeyboxParsedPost,
  resolveKuaishouParsedPost,
  resolveTiebaParsedPost,
  resolveTikTokParsedPost,
  resolveWechatParsedPost,
  resolveWeiboParsedPost,
  resolveXParsedPost,
  resolveXiaohongshuParsedPost,
  resolveZhihuParsedPost
} from './lazyResolvers'

export type ParsedPostResolver = (url: string) => Promise<ParsedPost>

export const platformResolvers: Record<ParsedPostPlatform, ParsedPostResolver> = {
  bilibili: resolveBilibiliParsedPost,
  douyin: resolveDouyinParsedPost,
  tiktok: resolveTikTokParsedPost,
  kuaishou: resolveKuaishouParsedPost,
  xiaohongshu: resolveXiaohongshuParsedPost,
  heybox: resolveHeyboxParsedPost,
  github: resolveGithubParsedPost,
  x: resolveXParsedPost,
  zhihu: resolveZhihuParsedPost,
  tieba: resolveTiebaParsedPost,
  wechat: resolveWechatParsedPost,
  weibo: resolveWeiboParsedPost
}

export const resolveParsedPostFromResolvedLink = async (
  link: SummaryResolvedLink
): Promise<ParsedPost> => {
  recordFailureTraceStep('parsed-post.resolve.start', {
    platform: link.platform,
    url: link.url
  })
  const resolver = platformResolvers[link.platform]
  if (!resolver) {
    recordFailureTraceStep('parsed-post.resolve.unsupported', {
      platform: link.platform
    })
    throw new Error(`暂不支持的平台：${link.platform}`)
  }
  const parsedPost = await resolver(link.url)
  recordFailureTraceStep('parsed-post.resolve.success', {
    platform: link.platform,
    title: parsedPost.title,
    subtype: parsedPost.subtype
  })
  return parsedPost
}
