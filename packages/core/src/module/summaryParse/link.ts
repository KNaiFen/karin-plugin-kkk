import {
  extractBilibiliMessageUrl,
  extractDouyinMessageUrl,
  extractGithubMessageUrl,
  extractHeyBoxMessageUrl,
  extractKuaishouMessageUrl,
  extractTiebaMessageUrl,
  extractTikTokMessageUrl,
  extractWechatMessageUrl,
  extractWeiboMessageUrl,
  extractXiaohongshuMessageUrl,
  extractXMessageUrl,
  extractZhihuMessageUrl,
  XIAOHONGSHU_MESSAGE_LINK_REGEX
} from '@/apps/linkExtractors'

import type { SummaryParsePlatform, SummaryResolvedLink, SummaryTrigger } from './types'

type Extractor = {
  platform: SummaryParsePlatform
  extract: (message: string) => string | null
}

const extractors: Extractor[] = [
  { platform: 'bilibili', extract: extractBilibiliMessageUrl },
  { platform: 'douyin', extract: extractDouyinMessageUrl },
  { platform: 'tiktok', extract: extractTikTokMessageUrl },
  { platform: 'kuaishou', extract: extractKuaishouMessageUrl },
  { platform: 'xiaohongshu', extract: extractXiaohongshuMessageUrl },
  { platform: 'heybox', extract: extractHeyBoxMessageUrl },
  { platform: 'x', extract: extractXMessageUrl },
  { platform: 'zhihu', extract: extractZhihuMessageUrl },
  { platform: 'tieba', extract: extractTiebaMessageUrl },
  { platform: 'wechat', extract: extractWechatMessageUrl },
  { platform: 'weibo', extract: extractWeiboMessageUrl },
  { platform: 'github', extract: extractGithubMessageUrl }
]

const bilibiliTokenRegex = /\b(?:BV[1-9a-zA-Z]{10}|av\d+)\b/ig

export const SUMMARY_COMMAND_PREFIX = '#'

const clean = (value: string): string => value.replace(/\\/g, '').trim()

const normalizeKeywords = (keywords: string[]): string[] => {
  const seen = new Set<string>()
  const normalized = keywords
    .map(item => item.trim())
    .filter(Boolean)
    .filter(item => {
      if (seen.has(item)) return false
      seen.add(item)
      return true
    })

  return normalized.sort((left, right) => right.length - left.length)
}

const findAllByRegex = (source: string, regex: RegExp): string[] => {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`
  const matcher = new RegExp(regex.source, flags)
  const result: string[] = []

  for (const match of source.matchAll(matcher)) {
    const value = match[0]?.trim()
    if (value) result.push(value)
  }

  return result
}

const findAllByExtractor = (
  source: string,
  regex: RegExp,
  extractor: (message: string) => string | null
): string[] => {
  return findAllByRegex(source, regex)
    .map(fragment => extractor(fragment))
    .filter((item): item is string => Boolean(item))
}

const dedupeLinks = (links: SummaryResolvedLink[]): SummaryResolvedLink[] => {
  const seen = new Set<string>()
  const result: SummaryResolvedLink[] = []

  for (const item of links) {
    const key = `${item.platform}:${item.url}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }

  return result
}

type IndexedLink = SummaryResolvedLink & {
  index: number
  end: number
}

export const extractSummaryResolvedLinks = (message: string): SummaryResolvedLink[] => {
  const source = clean(message)
  const indexed: IndexedLink[] = []
  const pushMatches = (platform: SummaryParsePlatform, regex: RegExp, extractor?: (message: string) => string | null) => {
    const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`
    const matcher = new RegExp(regex.source, flags)
    for (const match of source.matchAll(matcher)) {
      const raw = match[0]?.trim()
      if (!raw || match.index === undefined) continue
      if (platform === 'wechat' && /^(?:…|\.{3})/.test(source.slice(match.index + raw.length))) continue
      const resolved = extractor ? extractor(raw) : raw
      if (!resolved) continue
      indexed.push({
        platform,
        url: resolved,
        index: match.index,
        end: match.index + raw.length
      })
    }
  }

  pushMatches('bilibili', /(https?:\/\/(?:(?:www\.|m\.|t\.|live\.)?bilibili\.com|b23\.tv|bili2233\.cn)\/[a-zA-Z0-9_\-.~:/?#[\]@!$&'()*+,;=]+)/ig, extractBilibiliMessageUrl)
  pushMatches('douyin', /https?:\/\/(?:www|v|jx|m|jingxuan|live)\.(?:douyin|iesdouyin)\.com[a-zA-Z0-9_\-.~:/?#[\]@!$&'()*+,;=%]*/ig, extractDouyinMessageUrl)
  pushMatches('tiktok', /https?:\/\/(?:www|m|vm|vt)\.tiktok\.com[a-zA-Z0-9_\-.~:/?#[\]@!$&'()*+,;=%]*/ig, extractTikTokMessageUrl)
  pushMatches('heybox', /https?:\/\/(?:(?:api|www)\.)?xiaoheihe\.cn[a-zA-Z0-9_\-.~:/?#[\]@!$&'()*+,;=%]*/ig, extractHeyBoxMessageUrl)
  pushMatches('x', /https?:\/\/(?:(?:www\.)?(?:x|twitter)\.com)\/[A-Za-z0-9_]{1,20}\/status\/\d+(?:\/[a-zA-Z0-9_\-.~:/?#[\]@!$&'()*+,;=%]*)?/ig, extractXMessageUrl)
  pushMatches('zhihu', /https?:\/\/(?:(?:(?:www|m)\.)?zhihu\.com|zhuanlan\.zhihu\.com|link\.zhihu\.com)[a-zA-Z0-9_\-.~:/?#[\]@!$&'()*+,;=%]*/ig, extractZhihuMessageUrl)
  pushMatches('tieba', /https?:\/\/(?:(?:tieba|tiebac)\.baidu\.com|jump\.bdimg\.com)[a-zA-Z0-9_\-.~:/?#[\]@!$&'()*+,;=%]*/ig, extractTiebaMessageUrl)
  pushMatches('wechat', /https?:\/\/mp\.weixin\.qq\.com\/s(?:\/[a-zA-Z0-9_-]+|\?[a-zA-Z0-9_\-.~:/?#[\]@!$&'()*+,;=%]*)/ig, extractWechatMessageUrl)
  pushMatches('weibo', /https?:\/\/(?:(?:www\.)?weibo\.com|m\.weibo\.cn|video\.weibo\.com|mapp\.api\.weibo\.cn)[a-zA-Z0-9_\-.~:/?#[\]@!$&'()*+,;=%]*/ig, extractWeiboMessageUrl)
  pushMatches('github', /https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/tree\/[A-Za-z0-9_.\-/%]+)?(?:[a-zA-Z0-9_\-.~:/?#[\]@!$&'()*+,;=%]*)?/ig, extractGithubMessageUrl)
  pushMatches('xiaohongshu', XIAOHONGSHU_MESSAGE_LINK_REGEX, extractXiaohongshuMessageUrl)
  pushMatches('kuaishou', /https?:\/\/(?:v\.kuaishou\.com\/\w+|www\.kuaishou\.com\/(?:f\/[a-zA-Z0-9]+|short-video\/[^?\s]+))/ig, extractKuaishouMessageUrl)

  const bilibiliRanges = indexed
    .filter(item => item.platform === 'bilibili')
    .map(item => ({ start: item.index, end: item.end }))

  for (const match of source.matchAll(new RegExp(bilibiliTokenRegex.source, bilibiliTokenRegex.flags))) {
    const token = match[0]?.trim()
    if (!token || match.index === undefined) continue
    const start = match.index
    const end = start + token.length
    if (bilibiliRanges.some(range => start >= range.start && end <= range.end)) continue
    indexed.push({
      platform: 'bilibili',
      url: token,
      index: start,
      end
    })
  }

  indexed.sort((a, b) => a.index - b.index)
  return dedupeLinks(indexed.map(({ platform, url }) => ({ platform, url })))
}

export const extractSummaryTrigger = (
  message: string,
  keywords: string[]
): SummaryTrigger | null => {
  const trimmed = message.trim()
  if (!trimmed.startsWith(SUMMARY_COMMAND_PREFIX)) return null

  for (const keyword of normalizeKeywords(keywords)) {
    const prefix = `${SUMMARY_COMMAND_PREFIX}${keyword}`
    if (trimmed === prefix) {
      return {
        keyword,
        rest: ''
      }
    }
    if (trimmed.startsWith(prefix)) {
      const nextChar = trimmed.slice(prefix.length, prefix.length + 1)
      if (!nextChar || !/\s/.test(nextChar)) continue
      return {
        keyword,
        rest: trimmed.slice(prefix.length).trim()
      }
    }
  }

  return null
}

export const stripResolvedLinksFromMessage = (message: string, links: SummaryResolvedLink[]): string => {
  let result = clean(message)

  for (const link of links) {
    result = result.replace(link.url, ' ')
  }

  return result.replace(/\s+/g, ' ').trim()
}
