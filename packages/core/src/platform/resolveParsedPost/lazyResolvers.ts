import type { DouyinWorkResult } from '@/module/utils'
import type { getDouyinID } from '@/platform/douyin/getID'
import type { ParsedPost } from '@/platform/parsedPost'

type DouyinIdData = Awaited<ReturnType<typeof getDouyinID>>

export const resolveBilibiliParsedPost = async (url: string): Promise<ParsedPost> => {
  const { resolveBilibiliParsedPost: resolver } = await import('./resolvers/bilibili')
  return resolver(url)
}

export const resolveDouyinParsedPost = async (url: string): Promise<ParsedPost> => {
  const { resolveDouyinParsedPost: resolver } = await import('./resolvers/douyin')
  return resolver(url)
}

export const resolveDouyinParsedPostFromWorkData = async (
  url: string,
  workData: DouyinWorkResult,
  idData?: DouyinIdData
): Promise<ParsedPost> => {
  const { resolveDouyinParsedPostFromWorkData: resolver } = await import('./resolvers/douyin')
  return resolver(url, workData, idData)
}

export const resolveGithubParsedPost = async (url: string): Promise<ParsedPost> => {
  const { resolveGithubParsedPost: resolver } = await import('./resolvers/github')
  return resolver(url)
}

export const resolveHeyboxParsedPost = async (url: string): Promise<ParsedPost> => {
  const { resolveHeyboxParsedPost: resolver } = await import('./resolvers/heybox')
  return resolver(url)
}

export const resolveKuaishouParsedPost = async (url: string): Promise<ParsedPost> => {
  const { resolveKuaishouParsedPost: resolver } = await import('./resolvers/kuaishou')
  return resolver(url)
}

export const resolveTiebaParsedPost = async (url: string): Promise<ParsedPost> => {
  const { resolveTiebaParsedPost: resolver } = await import('./resolvers/tieba')
  return resolver(url)
}

export const resolveTikTokParsedPost = async (url: string): Promise<ParsedPost> => {
  const { resolveTikTokParsedPost: resolver } = await import('./resolvers/tiktok')
  return resolver(url)
}

export const resolveWechatParsedPost = async (url: string): Promise<ParsedPost> => {
  const { resolveWechatParsedPost: resolver } = await import('./resolvers/wechat')
  return resolver(url)
}

export const resolveWeiboParsedPost = async (url: string): Promise<ParsedPost> => {
  const { resolveWeiboParsedPost: resolver } = await import('./resolvers/weibo')
  return resolver(url)
}

export const resolveXParsedPost = async (url: string): Promise<ParsedPost> => {
  const { resolveXParsedPost: resolver } = await import('./resolvers/x')
  return resolver(url)
}

export const resolveXiaohongshuParsedPost = async (url: string): Promise<ParsedPost> => {
  const { resolveXiaohongshuParsedPost: resolver } = await import('./resolvers/xiaohongshu')
  return resolver(url)
}

export const resolveZhihuParsedPost = async (url: string): Promise<ParsedPost> => {
  const { resolveZhihuParsedPost: resolver } = await import('./resolvers/zhihu')
  return resolver(url)
}
