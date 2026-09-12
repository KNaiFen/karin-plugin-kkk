export const BILIBILI_MESSAGE_URL_REGEX = /(https?:\/\/(?:(?:www\.|m\.|t\.|live\.)?bilibili\.com|b23\.tv|bili2233\.cn)\/[a-zA-Z0-9_\-.~:\/?#[\]@!$&'()*+,;=]+)/
export const DOUYIN_MESSAGE_URL_REGEX = /(https?:\/\/)?(?:www|v|jx|m|jingxuan|live)\.(?:douyin|iesdouyin)\.com/i
export const DOUYIN_MESSAGE_LINK_REGEX = /https?:\/\/(?:www|v|jx|m|jingxuan|live)\.(?:douyin|iesdouyin)\.com[a-zA-Z0-9_\-.~:\/?#[\]@!$&'()*+,;=%]*/i
export const TIKTOK_MESSAGE_URL_REGEX = /(https?:\/\/)?(?:www|m|vm|vt)\.tiktok\.com/i
export const TIKTOK_MESSAGE_LINK_REGEX = /https?:\/\/(?:www|m|vm|vt)\.tiktok\.com[a-zA-Z0-9_\-.~:\/?#[\]@!$&'()*+,;=%]*/i
export const KUAISHOU_MESSAGE_URL_REGEX = /(https?:\/\/)?(?:v\.kuaishou\.com|www\.kuaishou\.com\/(?:f\/[a-zA-Z0-9]+|short-video\/[^?\s"'<>]+))/i
export const KUAISHOU_MESSAGE_LINK_REGEX = /https?:\/\/(?:v\.kuaishou\.com\/\w+|www\.kuaishou\.com\/(?:f\/[a-zA-Z0-9]+|short-video\/[^?\s"'<>]+))/i
export const XIAOHONGSHU_MESSAGE_URL_REGEX = /(?:^|[^a-z0-9.-])(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:xiaohongshu\.com|xhslink\.(?:com|cn))(?=[:/?#]|$)/i
export const XIAOHONGSHU_MESSAGE_LINK_REGEX = /https?:\/\/(?:[a-z0-9-]+\.)*(?:xiaohongshu\.com|xhslink\.(?:com|cn))(?::\d+)?(?:[/?#][^\s"'<>]*)?/i
export const HEYBOX_MESSAGE_URL_REGEX = /(https?:\/\/)?(?:(?:api|www)\.)?xiaoheihe\.cn/i
export const HEYBOX_MESSAGE_LINK_REGEX = /https?:\/\/(?:(?:api|www)\.)?xiaoheihe\.cn[a-zA-Z0-9_\-.~:\/?#[\]@!$&'()*+,;=%]*/i
export const X_MESSAGE_URL_REGEX = /(https?:\/\/)?(?:(?:www\.)?(?:x|twitter)\.com)\/[A-Za-z0-9_]{1,20}\/status\/\d+(?:\/[a-zA-Z0-9_\-.~:\/?#[\]@!$&'()*+,;=%]*)?/i
export const X_MESSAGE_LINK_REGEX = /https?:\/\/(?:(?:www\.)?(?:x|twitter)\.com)\/[A-Za-z0-9_]{1,20}\/status\/\d+(?:\/[a-zA-Z0-9_\-.~:\/?#[\]@!$&'()*+,;=%]*)?/i
export const ZHIHU_MESSAGE_URL_REGEX = /(https?:\/\/)?(?:(?:www|m)\.)?zhihu\.com|zhuanlan\.zhihu\.com|link\.zhihu\.com/i
export const ZHIHU_MESSAGE_LINK_REGEX = /https?:\/\/(?:(?:(?:www|m)\.)?zhihu\.com|zhuanlan\.zhihu\.com|link\.zhihu\.com)[a-zA-Z0-9_\-.~:\/?#[\]@!$&'()*+,;=%]*/i
export const TIEBA_MESSAGE_URL_REGEX = /(https?:\/\/)?(?:tieba|tiebac)\.baidu\.com|jump\.bdimg\.com/i
export const TIEBA_MESSAGE_LINK_REGEX = /https?:\/\/(?:(?:tieba|tiebac)\.baidu\.com|jump\.bdimg\.com)[a-zA-Z0-9_\-.~:\/?#[\]@!$&'()*+,;=%]*/i
export const WECHAT_MESSAGE_URL_REGEX = /(https?:\/\/)?mp\.weixin\.qq\.com\/s(?:\/[a-zA-Z0-9_-]+|\?[a-zA-Z0-9_\-.~:\/?#[\]@!$&'()*+,;=%]*)/i
export const WECHAT_MESSAGE_LINK_REGEX = /https?:\/\/mp\.weixin\.qq\.com\/s(?:\/[a-zA-Z0-9_-]+|\?[a-zA-Z0-9_\-.~:\/?#[\]@!$&'()*+,;=%]*)/i
export const WEIBO_MESSAGE_URL_REGEX = /(https?:\/\/)?(?:(?:www\.)?weibo\.com|m\.weibo\.cn|video\.weibo\.com|mapp\.api\.weibo\.cn)/i
export const WEIBO_MESSAGE_LINK_REGEX = /https?:\/\/(?:(?:www\.)?weibo\.com|m\.weibo\.cn|video\.weibo\.com|mapp\.api\.weibo\.cn)[a-zA-Z0-9_\-.~:\/?#[\]@!$&'()*+,;=%]*/i
export const GITHUB_MESSAGE_URL_REGEX = /(https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/tree\/[A-Za-z0-9_.\-/%]+)?(?:[a-zA-Z0-9_\-.~:\/?#[\]@!$&'()*+,;=%]*)?/i
export const GITHUB_MESSAGE_LINK_REGEX = /https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/tree\/[A-Za-z0-9_.\-/%]+)?(?:[a-zA-Z0-9_\-.~:\/?#[\]@!$&'()*+,;=%]*)?/i

const extractWechatShareJumpUrl = (message: string): string | null => {
  const source = message.trim()
  if (!source.startsWith('{')) return null

  try {
    const payload: unknown = JSON.parse(source)
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null

    const meta = (payload as Record<string, unknown>).meta
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null

    for (const item of Object.values(meta as Record<string, unknown>)) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const jumpUrl = (item as Record<string, unknown>).jumpUrl
      if (typeof jumpUrl !== 'string') continue

      const matched = jumpUrl.replace(/\\/g, '').match(WECHAT_MESSAGE_LINK_REGEX)?.[0]
      if (matched) return matched
    }
  } catch {
    // Ordinary chat messages are not JSON share cards.
  }

  return null
}

export const extractBilibiliMessageUrl = (message: string): string | null => {
  return message.replace(/\\/g, '').match(BILIBILI_MESSAGE_URL_REGEX)?.[0] ?? null
}

export const extractDouyinMessageUrl = (message: string): string | null => {
  return message.replace(/\\/g, '').match(DOUYIN_MESSAGE_LINK_REGEX)?.[0] ?? null
}

export const extractTikTokMessageUrl = (message: string): string | null => {
  return message.replace(/\\/g, '').match(TIKTOK_MESSAGE_LINK_REGEX)?.[0] ?? null
}

export const extractKuaishouMessageUrl = (message: string): string | null => {
  return message.replace(/\\/g, '').match(KUAISHOU_MESSAGE_LINK_REGEX)?.[0] ?? null
}

const isXiaohongshuHostname = (hostname: string): boolean => {
  const normalizedHostname = hostname.toLowerCase()
  const isValidHostname = normalizedHostname.length <= 253 && normalizedHostname
    .split('.')
    .every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  if (!isValidHostname) return false

  return ['xiaohongshu.com', 'xhslink.com', 'xhslink.cn'].some(domain => (
    normalizedHostname === domain || normalizedHostname.endsWith(`.${domain}`)
  ))
}

export const extractXiaohongshuMessageUrl = (message: string): string | null => {
  const source = message.replace(/\\/g, '')
  const candidates = source.match(/https?:\/\/[^\s"'<>]+/ig) ?? []

  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate)
      if (isXiaohongshuHostname(parsed.hostname)) return candidate
    } catch {
      // Ignore malformed URL-like fragments and continue scanning the message.
    }
  }

  return null
}

export const extractHeyBoxMessageUrl = (message: string): string | null => {
  return message.replace(/\\/g, '').match(HEYBOX_MESSAGE_LINK_REGEX)?.[0] ?? null
}

export const extractXMessageUrl = (message: string): string | null => {
  return message.replace(/\\/g, '').match(X_MESSAGE_LINK_REGEX)?.[0] ?? null
}

export const extractZhihuMessageUrl = (message: string): string | null => {
  return message.replace(/\\/g, '').match(ZHIHU_MESSAGE_LINK_REGEX)?.[0] ?? null
}

export const extractTiebaMessageUrl = (message: string): string | null => {
  return message.replace(/\\/g, '').match(TIEBA_MESSAGE_LINK_REGEX)?.[0] ?? null
}

export const extractWechatMessageUrl = (message: string): string | null => {
  const jumpUrl = extractWechatShareJumpUrl(message)
  if (jumpUrl) return jumpUrl

  const source = message.replace(/\\/g, '')
  const matches = Array.from(source.matchAll(new RegExp(WECHAT_MESSAGE_LINK_REGEX.source, 'ig')))
  const completeMatch = matches.find((match) => {
    if (match.index === undefined) return true
    const suffix = source.slice(match.index + match[0].length)
    return !/^(?:…|\.{3})/.test(suffix)
  })

  return completeMatch?.[0] ?? matches[0]?.[0] ?? null
}

export const extractWeiboMessageUrl = (message: string): string | null => {
  return message.replace(/\\/g, '').match(WEIBO_MESSAGE_LINK_REGEX)?.[0] ?? null
}

export const extractGithubMessageUrl = (message: string): string | null => {
  return message.replace(/\\/g, '').match(GITHUB_MESSAGE_LINK_REGEX)?.[0] ?? null
}

const normalizeOnlyLinkMessagePart = (value: string): string => {
  return value
    .replace(/\\/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
}

export const isOnlyExtractedLinkMessage = (message: string, extractedLink: string | null | undefined): boolean => {
  if (!extractedLink) return false
  return normalizeOnlyLinkMessagePart(message) === normalizeOnlyLinkMessagePart(extractedLink)
}

export const shouldReplyPlainVideoTitle = (
  enabled: boolean | undefined,
  message: string,
  extractedLink: string | null | undefined
): boolean => {
  return enabled !== false && isOnlyExtractedLinkMessage(message, extractedLink)
}
