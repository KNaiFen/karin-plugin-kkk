import { Networks } from '@/module'

export interface XiaohongshuIdData {
  type: 'note' | 'unknown'
  [x: string]: any
}

const isDomainOrSubdomain = (hostname: string, domain: string): boolean => {
  const normalizedHostname = hostname.toLowerCase()
  const isValidHostname = normalizedHostname.length <= 253 && normalizedHostname
    .split('.')
    .every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  return isValidHostname && (
    normalizedHostname === domain || normalizedHostname.endsWith(`.${domain}`)
  )
}

const isAllowedXiaohongshuHostname = (hostname: string): boolean => {
  return ['xiaohongshu.com', 'xhslink.com', 'xhslink.cn'].some(domain => isDomainOrSubdomain(hostname, domain))
}

const parseXiaohongshuUrl = (value: string): URL | undefined => {
  const source = value.trim()
  if (!source) return undefined

  const candidates = [source]
  try {
    const decoded = decodeURIComponent(source)
    if (decoded !== source) candidates.push(decoded)
  } catch {
    // Keep the original input when it contains malformed percent encoding.
  }

  for (const candidate of candidates) {
    try {
      const withProtocol = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`
      const parsed = new URL(withProtocol)
      if (!['http:', 'https:'].includes(parsed.protocol)) continue
      if (!isAllowedXiaohongshuHostname(parsed.hostname)) continue
      return parsed
    } catch {
      // Try the decoded candidate, if available.
    }
  }

  return undefined
}

const decodeSafely = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const resolveEffectiveXiaohongshuUrl = (url: URL): URL | undefined => {
  const redirectPath = url.searchParams.get('redirectPath')
  if (!redirectPath) return url

  const decodedRedirectPath = decodeSafely(redirectPath)
  const redirectUrl = decodedRedirectPath.startsWith('/')
    ? `https://www.xiaohongshu.com${decodedRedirectPath}`
    : decodedRedirectPath
  return parseXiaohongshuUrl(redirectUrl)
}

const pickXsecToken = (url: URL): string | undefined => {
  const queryToken = url.searchParams.get('xsec_token') || url.searchParams.get('XSEC_TOKEN')
  if (queryToken) return queryToken

  const hashMatch = /(?:^|[?&#])(?:xsec_token|XSEC_TOKEN)=([^&#]+)/.exec(url.hash)
  return hashMatch?.[1]
}

export const parseXiaohongshuLongLink = (longLink: string): XiaohongshuIdData => {
  const sourceUrl = parseXiaohongshuUrl(longLink)
  if (!sourceUrl || !isDomainOrSubdomain(sourceUrl.hostname, 'xiaohongshu.com')) {
    return { type: 'unknown' }
  }

  const effectiveUrl = resolveEffectiveXiaohongshuUrl(sourceUrl)
  if (!effectiveUrl || !isDomainOrSubdomain(effectiveUrl.hostname, 'xiaohongshu.com')) {
    return { type: 'unknown' }
  }

  const pathMatch = /^\/(?:discovery\/item|explore)\/([0-9a-zA-Z]+)(?:\/|$)/.exec(effectiveUrl.pathname)
  const targetNoteId = /^\/explore\/?$/.test(effectiveUrl.pathname)
    ? effectiveUrl.searchParams.get('target_note_id')
    : undefined
  const noteId = pathMatch?.[1] || (targetNoteId && /^[0-9a-zA-Z]+$/.test(targetNoteId) ? targetNoteId : undefined)
  if (!noteId) return { type: 'unknown' }

  return {
    type: 'note',
    note_id: noteId,
    xsec_token: pickXsecToken(effectiveUrl) ?? pickXsecToken(sourceUrl)
  }
}

const hasRequiredXsecToken = (result: XiaohongshuIdData): boolean => {
  return result.type === 'note' && typeof result.xsec_token === 'string' && result.xsec_token.trim().length > 0
}

const shouldResolveXiaohongshuRedirect = (url: string): boolean => {
  return Boolean(parseXiaohongshuUrl(url))
}

/**
 * 解析小红书分享链接，提取作品ID
 * - 典型长链接: https://www.xiaohongshu.com/explore/<note_id>
 * - 短链: http(s)://xhslink.com/<code> 或 http(s)://xhslink.cn/<code>（会重定向到长链接）
 */
export const getXiaohongshuID = async (url: string, log = true): Promise<XiaohongshuIdData> => {
  const directResult = parseXiaohongshuLongLink(url)
  if (hasRequiredXsecToken(directResult)) {
    return directResult
  }

  const longLink = shouldResolveXiaohongshuRedirect(url)
    ? await new Networks({
      url,
      outboundProfile: 'xiaohongshu-redirect',
      timeout: 15000
    }).getLongLink()
    : url
  const result = parseXiaohongshuLongLink(longLink)

  if (result.type === 'unknown') {
    throw new Error('无法从链接中提取小红书笔记ID')
  }
  if (!hasRequiredXsecToken(result)) {
    throw new Error('无法从链接中提取有效的小红书 xsec_token')
  }
  if (log) {
    console.log(result)
  }
  return result
}
