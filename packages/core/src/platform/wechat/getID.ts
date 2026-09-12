export type WechatIdData = {
  url: string
  path: string
  articleId?: string
  biz?: string
  mid?: string
  idx?: string
  sn?: string
}

export const normalizeWechatArticleUrl = (input: string): string => {
  const trimmed = input.trim().replace(/\\/g, '')
  const url = trimmed.startsWith('http://') || trimmed.startsWith('https://')
    ? new URL(trimmed)
    : new URL(`https://${trimmed}`)

  if (url.hostname !== 'mp.weixin.qq.com') {
    throw new Error('不是有效的微信公众号文章链接')
  }

  url.hash = ''
  return url.toString()
}

export const getWechatID = async (url: string): Promise<WechatIdData> => {
  const normalizedUrl = normalizeWechatArticleUrl(url)
  const parsed = new URL(normalizedUrl)
  const pathSegments = parsed.pathname.split('/').filter(Boolean)

  return {
    url: normalizedUrl,
    path: parsed.pathname,
    articleId: pathSegments[0] === 's' && pathSegments[1] ? pathSegments[1] : undefined,
    biz: parsed.searchParams.get('__biz') ?? undefined,
    mid: parsed.searchParams.get('mid') ?? undefined,
    idx: parsed.searchParams.get('idx') ?? undefined,
    sn: parsed.searchParams.get('sn') ?? undefined
  }
}
