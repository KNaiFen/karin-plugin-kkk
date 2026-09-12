import dns from 'node:dns/promises'
import net from 'node:net'
import path from 'node:path'
import { URL, fileURLToPath } from 'node:url'

import axios from 'node-karin/axios'
import type {
  AxiosError,
  AxiosRequestConfig,
  AxiosResponse,
  Method,
  RawAxiosRequestHeaders,
  ResponseType
} from 'node-karin/axios'

const DEFAULT_BUFFER_LIMIT_BYTES = 5 * 1024 * 1024

type HostMatcher = string | RegExp | ((hostname: string) => boolean)

export type OutboundRequestProfile =
  | 'generic-public'
  | 'redirect-resolution'
  | 'douyin-redirect'
  | 'bilibili-redirect'
  | 'weibo-redirect'
  | 'zhihu-redirect'
  | 'tieba-redirect'
  | 'heybox-redirect'
  | 'kuaishou-redirect'
  | 'xiaohongshu-redirect'
  | 'github-redirect'
  | 'x-redirect'
  | 'github-api'
  | 'github-page'
  | 'tiktok-page'
  | 'weibo-page'
  | 'weibo-media'
  | 'summary-inline-image'
  | 'summary-subtitle'
  | 'qr-image-scan'

type ProfileDefinition = {
  allowHttp: boolean
  allowHttps: boolean
  allowPrivateAddress: boolean
  hostMatchers?: HostMatcher[]
  maxRedirects: number
  maxBytes?: number
}

type SafeAxiosRequester = <T = any>(config: AxiosRequestConfig) => Promise<AxiosResponse<T>>

export type OutboundSecurityOptions = {
  profile?: OutboundRequestProfile
  maxRedirects?: number
  maxBytes?: number
  requester?: SafeAxiosRequester
}

type SafeAxiosRequestConfig = Pick<
AxiosRequestConfig,
'headers' | 'timeout' | 'proxy' | 'httpAgent' | 'httpsAgent' | 'validateStatus' | 'responseType' | 'data' | 'params' | 'signal'
> & {
  url: string
  method?: Method | string
}

const exactHost = (value: string): HostMatcher => {
  const normalized = value.toLowerCase()
  return (hostname: string) => hostname === normalized
}

const domainHost = (value: string): HostMatcher => {
  const normalized = value.toLowerCase()
  return (hostname: string) => hostname === normalized || hostname.endsWith(`.${normalized}`)
}

const WEIBO_PAGE_HOSTS = [
  domainHost('weibo.com'),
  exactHost('m.weibo.cn'),
  exactHost('video.weibo.com'),
  exactHost('h5.video.weibo.com')
]

const WEIBO_MEDIA_HOSTS = [
  ...WEIBO_PAGE_HOSTS,
  domainHost('sinaimg.cn')
]

const PROFILES: Record<OutboundRequestProfile, ProfileDefinition> = {
  'generic-public': {
    allowHttp: true,
    allowHttps: true,
    allowPrivateAddress: false,
    maxRedirects: 5
  },
  'redirect-resolution': {
    allowHttp: true,
    allowHttps: true,
    allowPrivateAddress: false,
    maxRedirects: 10,
    maxBytes: 512 * 1024
  },
  'douyin-redirect': {
    allowHttp: true,
    allowHttps: true,
    allowPrivateAddress: false,
    maxRedirects: 10,
    maxBytes: 512 * 1024,
    hostMatchers: [
      domainHost('douyin.com'),
      domainHost('iesdouyin.com'),
      domainHost('amemv.com'),
      exactHost('aweme.snssdk.com'),
      exactHost('snssdk.com')
    ]
  },
  'bilibili-redirect': {
    allowHttp: true,
    allowHttps: true,
    allowPrivateAddress: false,
    maxRedirects: 10,
    maxBytes: 512 * 1024,
    hostMatchers: [
      domainHost('bilibili.com'),
      exactHost('b23.tv'),
      exactHost('bili2233.cn')
    ]
  },
  'weibo-redirect': {
    allowHttp: true,
    allowHttps: true,
    allowPrivateAddress: false,
    maxRedirects: 10,
    maxBytes: 512 * 1024,
    hostMatchers: WEIBO_PAGE_HOSTS
  },
  'zhihu-redirect': {
    allowHttp: true,
    allowHttps: true,
    allowPrivateAddress: false,
    maxRedirects: 10,
    maxBytes: 512 * 1024,
    hostMatchers: [
      domainHost('zhihu.com')
    ]
  },
  'tieba-redirect': {
    allowHttp: true,
    allowHttps: true,
    allowPrivateAddress: false,
    maxRedirects: 10,
    maxBytes: 512 * 1024,
    hostMatchers: [
      domainHost('baidu.com'),
      exactHost('jump.bdimg.com')
    ]
  },
  'heybox-redirect': {
    allowHttp: true,
    allowHttps: true,
    allowPrivateAddress: false,
    maxRedirects: 10,
    maxBytes: 512 * 1024,
    hostMatchers: [
      domainHost('xiaoheihe.cn')
    ]
  },
  'kuaishou-redirect': {
    allowHttp: true,
    allowHttps: true,
    allowPrivateAddress: false,
    maxRedirects: 10,
    maxBytes: 512 * 1024,
    hostMatchers: [
      domainHost('kuaishou.com')
    ]
  },
  'xiaohongshu-redirect': {
    allowHttp: true,
    allowHttps: true,
    allowPrivateAddress: false,
    maxRedirects: 10,
    maxBytes: 512 * 1024,
    hostMatchers: [
      domainHost('xhslink.com'),
      domainHost('xhslink.cn'),
      domainHost('xiaohongshu.com')
    ]
  },
  'x-redirect': {
    allowHttp: true,
    allowHttps: true,
    allowPrivateAddress: false,
    maxRedirects: 10,
    maxBytes: 512 * 1024,
    hostMatchers: [
      exactHost('x.com'),
      exactHost('www.x.com'),
      exactHost('twitter.com'),
      exactHost('www.twitter.com'),
      exactHost('fxtwitter.com'),
      exactHost('vxtwitter.com')
    ]
  },
  'github-redirect': {
    allowHttp: true,
    allowHttps: true,
    allowPrivateAddress: false,
    maxRedirects: 10,
    maxBytes: 512 * 1024,
    hostMatchers: [
      domainHost('github.com')
    ]
  },
  'github-api': {
    allowHttp: false,
    allowHttps: true,
    allowPrivateAddress: false,
    maxRedirects: 5,
    maxBytes: 2 * 1024 * 1024,
    hostMatchers: [
      exactHost('api.github.com')
    ]
  },
  'github-page': {
    allowHttp: false,
    allowHttps: true,
    allowPrivateAddress: false,
    maxRedirects: 5,
    maxBytes: 2 * 1024 * 1024,
    hostMatchers: [
      domainHost('github.com')
    ]
  },
  'tiktok-page': {
    allowHttp: true,
    allowHttps: true,
    allowPrivateAddress: false,
    maxRedirects: 10,
    maxBytes: 2 * 1024 * 1024,
    hostMatchers: [
      domainHost('tiktok.com')
    ]
  },
  'weibo-page': {
    allowHttp: false,
    allowHttps: true,
    allowPrivateAddress: false,
    maxRedirects: 5,
    maxBytes: 2 * 1024 * 1024,
    hostMatchers: WEIBO_PAGE_HOSTS
  },
  'weibo-media': {
    allowHttp: false,
    allowHttps: true,
    allowPrivateAddress: false,
    maxRedirects: 5,
    maxBytes: DEFAULT_BUFFER_LIMIT_BYTES,
    hostMatchers: WEIBO_MEDIA_HOSTS
  },
  'summary-inline-image': {
    allowHttp: false,
    allowHttps: true,
    allowPrivateAddress: false,
    maxRedirects: 5,
    maxBytes: DEFAULT_BUFFER_LIMIT_BYTES
  },
  'summary-subtitle': {
    allowHttp: false,
    allowHttps: true,
    allowPrivateAddress: false,
    maxRedirects: 5,
    maxBytes: 2 * 1024 * 1024
  },
  'qr-image-scan': {
    allowHttp: false,
    allowHttps: true,
    allowPrivateAddress: false,
    maxRedirects: 5,
    maxBytes: DEFAULT_BUFFER_LIMIT_BYTES
  }
}

const resolveProfile = (profile?: OutboundRequestProfile): ProfileDefinition => {
  return PROFILES[profile ?? 'generic-public']
}

const isLoopbackOrPrivateIPv4 = (value: string): boolean => {
  const parts = value.split('.').map(item => Number(item))
  if (parts.length !== 4 || parts.some(item => !Number.isInteger(item) || item < 0 || item > 255)) return true
  if (parts[0] === 10) return true
  if (parts[0] === 127) return true
  if (parts[0] === 0) return true
  if (parts[0] === 169 && parts[1] === 254) return true
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  if (parts[0] === 192 && parts[1] === 168) return true
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true
  if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true
  if (parts[0] >= 224) return true
  return false
}

const expandIPv6 = (input: string): string[] => {
  const value = input.toLowerCase()
  if (value.includes('.')) {
    const lastColon = value.lastIndexOf(':')
    const head = value.slice(0, lastColon)
    const tail = value.slice(lastColon + 1)
    const octets = tail.split('.').map(item => Number(item))
    if (octets.length !== 4 || octets.some(item => !Number.isInteger(item) || item < 0 || item > 255)) {
      return []
    }
    const partA = ((octets[0] << 8) | octets[1]).toString(16)
    const partB = ((octets[2] << 8) | octets[3]).toString(16)
    return expandIPv6(`${head}:${partA}:${partB}`)
  }

  const [left, right = ''] = value.split('::')
  const leftParts = left ? left.split(':').filter(Boolean) : []
  const rightParts = right ? right.split(':').filter(Boolean) : []
  if (value.includes('::')) {
    const missing = 8 - leftParts.length - rightParts.length
    if (missing < 0) return []
    return [
      ...leftParts,
      ...Array.from({ length: missing }, () => '0'),
      ...rightParts
    ].map(item => item.padStart(4, '0'))
  }
  const parts = value.split(':')
  if (parts.length !== 8) return []
  return parts.map(item => item.padStart(4, '0'))
}

const isLoopbackOrPrivateIPv6 = (value: string): boolean => {
  const normalized = value.toLowerCase()
  if (normalized === '::1') return true
  if (normalized === '::') return true

  const parts = expandIPv6(normalized)
  if (parts.length !== 8) return true

  if (parts[0] === 'fe80' || parts[0].startsWith('fe9') || parts[0].startsWith('fea') || parts[0].startsWith('feb')) {
    return true
  }
  if (parts[0].startsWith('fc') || parts[0].startsWith('fd')) return true
  if (parts[0] === '2001' && parts[1] === '0db8') return true

  const isIPv4Mapped = parts.slice(0, 5).every(item => item === '0000') && parts[5] === 'ffff'
  if (isIPv4Mapped) {
    const tailHigh = Number.parseInt(parts[6], 16)
    const tailLow = Number.parseInt(parts[7], 16)
    const ipv4 = [
      (tailHigh >> 8) & 0xff,
      tailHigh & 0xff,
      (tailLow >> 8) & 0xff,
      tailLow & 0xff
    ].join('.')
    return isLoopbackOrPrivateIPv4(ipv4)
  }

  return false
}

const isPrivateOrLoopbackAddress = (address: string): boolean => {
  const family = net.isIP(address)
  if (family === 4) return isLoopbackOrPrivateIPv4(address)
  if (family === 6) return isLoopbackOrPrivateIPv6(address)
  return true
}

const matchHost = (hostname: string, matcher: HostMatcher): boolean => {
  if (typeof matcher === 'string') return hostname === matcher.toLowerCase()
  if (matcher instanceof RegExp) return matcher.test(hostname)
  return matcher(hostname)
}

const isHostAllowed = (hostname: string, profile: ProfileDefinition): boolean => {
  if (!profile.hostMatchers || profile.hostMatchers.length === 0) return true
  return profile.hostMatchers.some(matcher => matchHost(hostname, matcher))
}

const validateParsedUrl = async (url: URL, profile: ProfileDefinition): Promise<void> => {
  const protocol = url.protocol.toLowerCase()
  if (protocol === 'http:' && !profile.allowHttp) {
    throw new Error(`出站请求已拒绝：不允许使用 HTTP 协议 (${url.href})`)
  }
  if (protocol === 'https:' && !profile.allowHttps) {
    throw new Error(`出站请求已拒绝：不允许使用 HTTPS 协议 (${url.href})`)
  }
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(`出站请求已拒绝：仅允许 http/https (${url.href})`)
  }

  const hostname = url.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error(`出站请求已拒绝：不允许访问 localhost (${url.href})`)
  }
  if (!isHostAllowed(hostname, profile)) {
    throw new Error(`出站请求已拒绝：目标主机不在白名单内 (${hostname})`)
  }

  if (profile.allowPrivateAddress) return

  if (net.isIP(hostname)) {
    if (isPrivateOrLoopbackAddress(hostname)) {
      throw new Error(`出站请求已拒绝：目标地址不是公网地址 (${hostname})`)
    }
    return
  }

  const records = await dns.lookup(hostname, { all: true, verbatim: true })
  if (records.some(record => isPrivateOrLoopbackAddress(record.address))) {
    throw new Error(`出站请求已拒绝：目标主机解析到了非公网地址 (${hostname})`)
  }
}

const parseAndValidateUrl = async (
  input: string,
  profile: ProfileDefinition
): Promise<URL> => {
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    throw new Error(`无效 URL: ${input || '(empty)'}`)
  }
  await validateParsedUrl(parsed, profile)
  return parsed
}

const normalizeHeaders = (
  headers?: AxiosRequestConfig['headers']
): RawAxiosRequestHeaders | undefined => {
  if (!headers) return undefined
  return headers as RawAxiosRequestHeaders
}

const buildRedirectAwareValidateStatus = (
  validateStatus?: AxiosRequestConfig['validateStatus']
): NonNullable<AxiosRequestConfig['validateStatus']> => {
  return (status: number) => {
    if (status >= 300 && status < 400) return true
    if (typeof validateStatus === 'function') {
      return validateStatus(status)
    }
    return status >= 200 && status < 300
  }
}

const buildRequestConfig = (
  url: string,
  config: SafeAxiosRequestConfig,
  method: Method | string | undefined,
  maxBytes: number | undefined
): AxiosRequestConfig => {
  return {
    ...config,
    url,
    method,
    headers: normalizeHeaders(config.headers),
    validateStatus: buildRedirectAwareValidateStatus(config.validateStatus),
    maxRedirects: 0,
    maxContentLength: maxBytes,
    maxBodyLength: maxBytes
  }
}

const executeAxiosRequest: SafeAxiosRequester = async <T = any>(requestConfig: AxiosRequestConfig): Promise<AxiosResponse<T>> => {
  const axiosWithRequest = axios as typeof axios & {
    request?: SafeAxiosRequester
    head?: (url: string, config?: AxiosRequestConfig) => Promise<AxiosResponse<T>>
    get?: (url: string, config?: AxiosRequestConfig) => Promise<AxiosResponse<T>>
    post?: (url: string, data?: any, config?: AxiosRequestConfig) => Promise<AxiosResponse<T>>
  }

  if (typeof axiosWithRequest.request === 'function') {
    return await axiosWithRequest.request<T>(requestConfig)
  }

  const method = String(requestConfig.method ?? 'GET').toLowerCase()
  if (method === 'head' && typeof axiosWithRequest.head === 'function') {
    return await axiosWithRequest.head(requestConfig.url ?? '', requestConfig)
  }
  if ((method === 'get' || method === 'delete') && typeof axiosWithRequest.get === 'function') {
    return await axiosWithRequest.get(requestConfig.url ?? '', requestConfig)
  }
  if (method === 'post' && typeof axiosWithRequest.post === 'function') {
    return await axiosWithRequest.post(requestConfig.url ?? '', requestConfig.data, requestConfig)
  }

  throw new Error(`当前 axios mock 不支持 ${method.toUpperCase()} 请求`)
}

const getRedirectLocation = (response: AxiosResponse): string | null => {
  const location = response.headers?.location
  if (!location) return null
  return Array.isArray(location) ? String(location[0] ?? '') : String(location)
}

const resolveResponseUrl = (response: AxiosResponse, fallback: string): string => {
  return (
    (response.request as { res?: { responseUrl?: string }, responseURL?: string } | undefined)?.res?.responseUrl ||
    (response.request as { responseURL?: string } | undefined)?.responseURL ||
    response.config?.url ||
    fallback
  )
}

const unwrapRedirectErrorResponse = <T = any>(error: unknown): AxiosResponse<T> | null => {
  const response = (error as AxiosError<T> | undefined)?.response
  if (!response) return null
  return response.status >= 300 && response.status < 400 ? response : null
}

type RequestResult<T = any> = {
  finalUrl: string
  response: AxiosResponse<T>
}

export const executeSafeAxiosRequest = async <T = any> (
  config: SafeAxiosRequestConfig,
  security: OutboundSecurityOptions = {}
): Promise<RequestResult<T>> => {
  const profile = resolveProfile(security.profile)
  const maxRedirects = security.maxRedirects ?? profile.maxRedirects
  const maxBytes = security.maxBytes ?? profile.maxBytes
  const requester = security.requester ?? executeAxiosRequest
  const visited = new Set<string>()
  let currentUrl = config.url
  let lastResponse: AxiosResponse<T> | null = null

  for (let redirectIndex = 0; redirectIndex <= maxRedirects; redirectIndex += 1) {
    const parsed = await parseAndValidateUrl(currentUrl, profile)
    const normalized = parsed.href
    if (visited.has(normalized)) {
      throw new Error(`出站请求已拒绝：检测到重定向循环 (${normalized})`)
    }
    visited.add(normalized)

    const requestConfig = buildRequestConfig(normalized, config, config.method, maxBytes)
    const response = await requester<T>(requestConfig).catch((error) => {
      const redirectResponse = unwrapRedirectErrorResponse<T>(error)
      if (redirectResponse) return redirectResponse
      throw error
    })
    lastResponse = response

    if (response.status >= 300 && response.status < 400) {
      const location = getRedirectLocation(response)
      if (!location) {
        return {
          finalUrl: resolveResponseUrl(response, normalized),
          response
        }
      }
      currentUrl = new URL(location, normalized).href
      continue
    }

    const finalUrl = resolveResponseUrl(response, normalized)
    await parseAndValidateUrl(finalUrl, profile)
    return {
      finalUrl,
      response
    }
  }

  throw new Error(`出站请求已拒绝：重定向次数超过限制 (${maxRedirects})`)
}

export const sanitizeWeiboCredentialHeaders = (
  headers: Record<string, string>,
  targetUrl: string
): Record<string, string> => {
  const hostname = new URL(targetUrl).hostname.toLowerCase()
  if (WEIBO_PAGE_HOSTS.some(matcher => matchHost(hostname, matcher))) {
    return headers
  }

  const next = { ...headers }
  if (WEIBO_MEDIA_HOSTS.some(matcher => matchHost(hostname, matcher))) {
    delete next.Cookie
    delete next.cookie
  }
  return next
}

export const isTrustedWeiboPageUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      WEIBO_PAGE_HOSTS.some(matcher => matchHost(hostname, matcher))
  } catch {
    return false
  }
}

export const isTrustedWeiboMediaUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      WEIBO_MEDIA_HOSTS.some(matcher => matchHost(hostname, matcher))
  } catch {
    return false
  }
}

export const isTrustedTikTokUrl = (url: string): boolean => {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return hostname === 'tiktok.com' || hostname.endsWith('.tiktok.com')
  } catch {
    return false
  }
}

export const assertSafeFileUrlWithinRoot = (url: string, rootPath: string): string => {
  const filePath = fileURLToPath(url)
  const normalizedRoot = path.resolve(rootPath)
  const resolved = path.resolve(filePath)
  if (resolved !== normalizedRoot && !resolved.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error(`本地文件越界，已拒绝读取: ${resolved}`)
  }
  return resolved
}

export const assertPathWithinRoot = (candidate: string, rootPath: string): string => {
  const resolvedRoot = path.resolve(rootPath)
  const resolvedCandidate = path.resolve(candidate)
  if (resolvedCandidate !== resolvedRoot && !resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`路径越界，已拒绝访问: ${resolvedCandidate}`)
  }
  return resolvedCandidate
}
