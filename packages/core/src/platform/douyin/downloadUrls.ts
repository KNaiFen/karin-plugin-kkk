import { logger } from 'node-karin'
import type { AxiosRequestConfig } from 'node-karin/axios'

import { Networks } from '@/module/utils'

import { isDouyinWrappedVideoUrl, resolveDouyinPlayableVideoUrls } from './workType'

type DouyinVideoAddr = {
  uri?: string
  url_list?: string[]
}

type DouyinVideoLike = {
  play_addr_h264?: DouyinVideoAddr
  play_addr?: DouyinVideoAddr
  bit_rate?: Array<{
    play_addr?: DouyinVideoAddr
  }>
}

export type DouyinDownloadUrlCandidates = {
  videoUrl: string
  backupUrls: string[]
}

type ResolveDouyinDownloadUrlOptions = {
  headers?: Record<string, string>
  networkOptions?: Pick<AxiosRequestConfig, 'httpAgent' | 'httpsAgent' | 'proxy'>
  logContext?: string
}

const dedupeUrls = (urls: string[]): string[] => {
  return [...new Set(urls.map(url => url.trim()).filter(Boolean))]
}

const toCandidates = (urls: string[]): DouyinDownloadUrlCandidates => ({
  videoUrl: urls[0] ?? '',
  backupUrls: urls.slice(1)
})

export const getDouyinDownloadUrlCandidates = (
  video?: DouyinVideoLike | null
): DouyinDownloadUrlCandidates => {
  return toCandidates(dedupeUrls(resolveDouyinPlayableVideoUrls(video)))
}

export const resolveDouyinDownloadUrlCandidates = async (
  video: DouyinVideoLike | null | undefined,
  options: ResolveDouyinDownloadUrlOptions = {}
): Promise<DouyinDownloadUrlCandidates> => {
  const initialCandidates = dedupeUrls(resolveDouyinPlayableVideoUrls(video))
  if (initialCandidates.length === 0) {
    return { videoUrl: '', backupUrls: [] }
  }

  const directCandidates = initialCandidates.filter(url => !isDouyinWrappedVideoUrl(url))
  if (directCandidates.length > 0) {
    return toCandidates(dedupeUrls(directCandidates.concat(initialCandidates.filter(isDouyinWrappedVideoUrl))))
  }

  const resolvedDirectCandidates: string[] = []
  for (const wrappedUrl of initialCandidates) {
    try {
      const finalUrl = await new Networks({
        url: wrappedUrl,
        headers: options.headers,
        networkOptions: options.networkOptions
      }).getLongLink()

      if (finalUrl && !isDouyinWrappedVideoUrl(finalUrl)) {
        resolvedDirectCandidates.push(finalUrl)
      }
    } catch (error) {
      logger.warn(`[Douyin] ${options.logContext ?? '视频下载'} 包装链接解析直链失败，保留原始候选继续尝试：${wrappedUrl}`)
      logger.debug(error)
    }
  }

  return toCandidates(dedupeUrls([...resolvedDirectCandidates, ...initialCandidates]))
}
