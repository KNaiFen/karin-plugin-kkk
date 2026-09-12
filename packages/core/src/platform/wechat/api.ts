import { logger } from 'node-karin'
import axios from 'node-karin/axios'

import { baseHeaders } from '@/module'
import {
  applyBrowserProxyToLaunchOptions,
  closeBrowserSafely,
  configureRequestBlocking,
  createInjectedPage,
  getBrowserLaunchOptions,
  getBrowserProxyCredentials
} from '@/module/utils/BrowserRuntime'
import { Config } from '@/module/utils/Config'
import { buildConfiguredRequestOptions } from '@/module/utils/RequestConfig'
import type { ParsedPostBlock } from '@/platform/parsedPost'

import { normalizeWechatArticleUrl } from './getID'

type PuppeteerBrowser = Awaited<ReturnType<typeof import('@snapka/puppeteer')['snapka']['launch']>>
type BrowserPage = Awaited<ReturnType<typeof import('fingerprint-injector')['newInjectedPage']>> & {
  authenticate?: (credentials: { username: string, password: string }) => Promise<void>
  waitForTimeout?: (timeout: number) => Promise<void>
  url: () => string
}

export type WechatArticleDetail = {
  contentType: 'article' | 'image'
  url: string
  title: string
  summary: string
  description?: string
  accountName?: string
  accountAlias?: string
  accountAvatar?: string
  accountSignature?: string
  cover?: string
  publishTime?: string
  createTime?: number
  serviceType?: string
  sourceUrl?: string
  contentBlocks: ParsedPostBlock[]
  images: string[]
  text: string
  contentHtml: string
  via: 'http' | 'browser'
}

const DETAIL_TIMEOUT_MS = 30_000
const PAGE_SETTLE_MS = 1_500
const WECHAT_BLOCKED_RESOURCE_TYPES = ['media', 'font', 'image'] as const
const WECHAT_VERIFY_PAGE_PATTERN = /环境异常|完成验证后即可继续访问|访问过于频繁|register_code|wappoc_appmsgcaptcha|secitptpage|mmlas-verifyresult/i
const WECHAT_CONTENT_PATTERN = /id=["']js_content["']|class=["'][^"']*rich_media_content[^"']*["']/i
const WECHAT_IMAGE_MESSAGE_PATTERNS = [
  /\bitem_show_type\s*(?:=|:)\s*['"]?8['"]?(?:\s*\*\s*1)?/i,
  /\bappmsg_type\s*(?:=|:)\s*['"]?10002['"]?/i
]
const WECHAT_ASSET_BASE_URL = 'https://mp.weixin.qq.com/'

const requestOptions = () => ({
  ...buildConfiguredRequestOptions(Config.request, {
    maxRedirects: 5,
    userAgentFallback: String((baseHeaders as Record<string, unknown>)?.['User-Agent'] ?? '')
  }),
  headers: {
    ...baseHeaders,
    ...buildConfiguredRequestOptions(Config.request, {
      maxRedirects: 5,
      userAgentFallback: String((baseHeaders as Record<string, unknown>)?.['User-Agent'] ?? '')
    }).headers,
    Referer: 'https://mp.weixin.qq.com/'
  }
})

const decodeCodePoint = (raw: string, radix: number, fallback: string): string => {
  const codePoint = Number.parseInt(raw, radix)
  return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : fallback
}

const decodeScriptString = (value: string): string => {
  const simpleEscapes: Record<string, string> = {
    '"': '"',
    '\'': '\'',
    '\\': '\\',
    '/': '/',
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t'
  }

  return value
    .replace(/\\x([0-9a-f]{2})/gi, (full, code: string) => decodeCodePoint(code, 16, full))
    .replace(/\\u\{([0-9a-f]{1,6})\}/gi, (full, code: string) => decodeCodePoint(code, 16, full))
    .replace(/\\u([0-9a-f]{4})/gi, (full, code: string) => decodeCodePoint(code, 16, full))
    .replace(/\\(["'\\/bfnrt])/g, (full, escaped: string) => simpleEscapes[escaped] ?? full)
}

const decodeHtmlEntities = (value: string): string => {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: '\'',
    nbsp: ' '
  }

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (full, entity: string) => {
    const lower = entity.toLowerCase()
    if (lower.startsWith('#x')) {
      return decodeCodePoint(lower.slice(2), 16, full)
    }
    if (lower.startsWith('#')) {
      return decodeCodePoint(lower.slice(1), 10, full)
    }
    return named[lower] ?? full
  })
}

const normalizeWhitespace = (value: string): string => {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

const normalizeText = (value: string): string => normalizeWhitespace(decodeHtmlEntities(value))

const normalizeHtmlText = (value: string): string => {
  return normalizeWhitespace(
    decodeHtmlEntities(decodeScriptString(value))
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|section|article|blockquote|figure|figcaption|li|ul|ol|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
}

const normalizeAssetUrl = (value: string | undefined, baseUrl: string): string => {
  const raw = decodeHtmlEntities(decodeHtmlEntities(String(value ?? '').trim()))
  if (!raw || /^data:/i.test(raw)) return ''
  const unescaped = raw.replace(/^\\+/, '')
  if (unescaped.startsWith('//')) return `https:${unescaped}`

  try {
    return new URL(unescaped, baseUrl).toString()
  } catch {
    return unescaped
  }
}

const normalizeHttpAssetUrl = (value: string | undefined, baseUrl: string): string => {
  const normalized = normalizeAssetUrl(value, baseUrl)
  if (!normalized) return ''

  try {
    const parsed = new URL(normalized)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : ''
  } catch {
    return ''
  }
}

const findBalancedEnd = (
  source: string,
  startIndex: number,
  open: '[' | '{',
  close: ']' | '}'
): number => {
  if (source[startIndex] !== open) return -1

  let depth = 0
  let quote = ''
  let escaped = false

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = ''
      }
      continue
    }

    if (char === '"' || char === '\'' || char === '`') {
      quote = char
      continue
    }
    if (char === open) {
      depth += 1
      continue
    }
    if (char === close) {
      depth -= 1
      if (depth === 0) return index + 1
    }
  }

  return -1
}

const readScriptQuotedValue = (source: string, startIndex: number, endIndex: number): string | undefined => {
  const quote = source[startIndex]
  if (quote !== '"' && quote !== '\'') return undefined

  let raw = ''
  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const char = source[index]
    if (char === '\\' && index + 1 < endIndex) {
      raw += char + source[index + 1]
      index += 1
      continue
    }
    if (char === quote) return decodeScriptString(raw)
    raw += char
  }

  return undefined
}

const isScriptIdentifierChar = (value: string | undefined): boolean => Boolean(value && /[a-z0-9_$]/i.test(value))

// Image-message payloads are JavaScript object literals, so scan only their top-level string field without evaluating them.
const extractTopLevelCdnUrl = (source: string, startIndex: number, endIndex: number): string | undefined => {
  const property = 'cdn_url'
  let depth = 0
  let quote = ''
  let escaped = false

  for (let index = startIndex; index < endIndex; index += 1) {
    const char = source[index]
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = ''
      }
      continue
    }

    if (char === '"' || char === '\'' || char === '`') {
      quote = char
      continue
    }
    if (char === '{') {
      depth += 1
      continue
    }
    if (char === '}') {
      depth -= 1
      continue
    }
    if (depth !== 1 || !source.startsWith(property, index)) continue
    if (isScriptIdentifierChar(source[index - 1]) || isScriptIdentifierChar(source[index + property.length])) continue

    let cursor = index + property.length
    while (/\s/.test(source[cursor] ?? '')) cursor += 1
    if (source[cursor] !== ':') continue
    cursor += 1
    while (/\s/.test(source[cursor] ?? '')) cursor += 1

    return readScriptQuotedValue(source, cursor, endIndex)
  }

  return undefined
}

const extractWechatImageListUrls = (
  source: string,
  arrayStart: number,
  arrayEnd: number,
  pageUrl: string
): string[] => {
  const images: string[] = []
  const imageSet = new Set<string>()
  let objectStart = -1
  let objectDepth = 0
  let quote = ''
  let escaped = false

  for (let index = arrayStart + 1; index < arrayEnd - 1; index += 1) {
    const char = source[index]
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = ''
      }
      continue
    }

    if (char === '"' || char === '\'' || char === '`') {
      quote = char
      continue
    }
    if (char === '{') {
      if (objectDepth === 0) objectStart = index
      objectDepth += 1
      continue
    }
    if (char !== '}' || objectDepth === 0) continue

    objectDepth -= 1
    if (objectDepth !== 0 || objectStart < 0) continue

    const imageUrl = normalizeHttpAssetUrl(
      extractTopLevelCdnUrl(source, objectStart, index + 1),
      pageUrl
    )
    if (imageUrl && !imageSet.has(imageUrl)) {
      imageSet.add(imageUrl)
      images.push(imageUrl)
    }
    objectStart = -1
  }

  return images
}

const extractWechatImageMessageImages = (html: string, pageUrl: string): string[] => {
  if (!WECHAT_IMAGE_MESSAGE_PATTERNS.some(pattern => pattern.test(html))) return []

  const pattern = /\bpicture_page_info_list\s*(?:=|:)\s*\[/gi
  let match: RegExpExecArray | null

  while ((match = pattern.exec(html))) {
    const arrayStart = match.index + match[0].lastIndexOf('[')
    const arrayEnd = findBalancedEnd(html, arrayStart, '[', ']')
    if (arrayEnd < 0) continue

    const images = extractWechatImageListUrls(html, arrayStart, arrayEnd, pageUrl)
    if (images.length > 0) return images
    pattern.lastIndex = arrayEnd
  }

  return []
}

const extractAttribute = (tag: string, name: string): string | undefined => {
  const pattern = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
  const match = tag.match(pattern)
  return match?.[1] ?? match?.[2] ?? match?.[3]
}

const extractMetaContent = (html: string, key: string, attr: 'property' | 'name' = 'property'): string | undefined => {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`<meta[^>]+${attr}=["']${escapedKey}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${escapedKey}["'][^>]*>`, 'i')
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return decodeHtmlEntities(match[1]).trim()
  }

  return undefined
}

const extractScriptValue = (html: string, patterns: RegExp[]): string | undefined => {
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return decodeHtmlEntities(decodeScriptString(match[1]).trim())
  }

  return undefined
}

const extractScriptNumber = (html: string, patterns: RegExp[]): number | undefined => {
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (!match?.[1]) continue
    const value = Number.parseInt(match[1], 10)
    if (Number.isFinite(value)) return value
  }

  return undefined
}

const formatUnixSeconds = (value: number | undefined): string | undefined => {
  if (!value || !Number.isFinite(value)) return undefined
  const date = new Date(value * 1000)
  if (Number.isNaN(date.getTime())) return undefined

  const pad = (input: number) => String(input).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

const mapServiceType = (value: string | undefined): string | undefined => {
  if (!value) return undefined

  const normalized = value.trim()
  switch (normalized) {
    case '1':
      return '订阅号'
    case '2':
      return '服务号'
    case '3':
      return '企业号'
    default:
      return normalized
  }
}

const stripDangerousHtml = (html: string): string => {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
}

const findContainerInnerHtml = (html: string): string => {
  const patterns = [
    /<div\b[^>]*id=["']js_content["'][^>]*>/i,
    /<div\b[^>]*class=["'][^"']*\brich_media_content\b[^"']*["'][^>]*>/i
  ]

  for (const pattern of patterns) {
    const startMatch = pattern.exec(html)
    if (!startMatch || startMatch.index === undefined) continue

    const openTagEnd = html.indexOf('>', startMatch.index)
    if (openTagEnd < 0) continue

    const tagPattern = /<div\b[^>]*>|<\/div>/gi
    tagPattern.lastIndex = openTagEnd + 1
    let depth = 1
    let match: RegExpExecArray | null

    while ((match = tagPattern.exec(html))) {
      if (/^<\/div/i.test(match[0])) {
        depth -= 1
      } else {
        depth += 1
      }

      if (depth === 0) {
        return html.slice(openTagEnd + 1, match.index)
      }
    }
  }

  return ''
}

const isLineBreakTag = (tag: string): boolean => {
  return /^(?:<br\b|<\/(?:p|div|section|article|blockquote|figure|figcaption|li|ul|ol|h[1-6])\b|<(?:p|div|section|article|blockquote|figure|figcaption|li|ul|ol|h[1-6])\b)/i.test(tag)
}

const buildContentBlocks = (
  contentHtml: string,
  pageUrl: string
): {
  contentBlocks: ParsedPostBlock[]
  images: string[]
  text: string
} => {
  const source = stripDangerousHtml(contentHtml)
  const blocks: ParsedPostBlock[] = []
  const images: string[] = []
  const imageSet = new Set<string>()
  const tagPattern = /<img\b[^>]*>|<[^>]+>/gi
  let lastIndex = 0
  let textBuffer = ''

  const flushText = () => {
    const normalized = normalizeText(textBuffer)
    if (normalized) {
      blocks.push({
        type: 'text',
        text: normalized
      })
    }
    textBuffer = ''
  }

  for (const match of source.matchAll(tagPattern)) {
    const index = match.index ?? 0
    textBuffer += source.slice(lastIndex, index)
    const tag = match[0]

    if (/^<img\b/i.test(tag)) {
      flushText()
      const imageUrl = normalizeAssetUrl(
        extractAttribute(tag, 'data-src') ||
          extractAttribute(tag, 'data-backsrc') ||
          extractAttribute(tag, 'src'),
        pageUrl
      )
      if (imageUrl && !imageSet.has(imageUrl)) {
        imageSet.add(imageUrl)
        images.push(imageUrl)
        blocks.push({
          type: 'image',
          url: imageUrl,
          alt: normalizeText(extractAttribute(tag, 'data-alt') || extractAttribute(tag, 'alt') || '文章配图')
        })
      }
      textBuffer += '\n'
    } else if (isLineBreakTag(tag)) {
      textBuffer += '\n'
    }

    lastIndex = index + tag.length
  }

  textBuffer += source.slice(lastIndex)
  flushText()

  const text = blocks
    .filter((block): block is Extract<ParsedPostBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('\n\n')
    .trim()

  return {
    contentBlocks: blocks,
    images,
    text
  }
}

const buildImageMessageContent = (
  images: string[],
  description: string
): {
  contentBlocks: ParsedPostBlock[]
  images: string[]
  text: string
} => {
  const contentBlocks: ParsedPostBlock[] = []
  if (description) {
    contentBlocks.push({
      type: 'text',
      text: description
    })
  }
  images.forEach((url, index) => {
    contentBlocks.push({
      type: 'image',
      url,
      alt: `图片消息第 ${index + 1} 张`
    })
  })

  return {
    contentBlocks,
    images,
    text: description
  }
}

const extractSourceUrl = (html: string, pageUrl: string): string | undefined => {
  const patterns = [
    /<a\b[^>]*id=["']js_view_source["'][^>]*href=["']([^"']+)["'][^>]*>/i,
    /<a\b[^>]*class=["'][^"']*original_page[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/i,
    /<div\b[^>]*class=["'][^"']*original_page[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*>/i
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) {
      const normalized = normalizeAssetUrl(match[1], pageUrl)
      if (normalized) return normalized
    }
  }

  return undefined
}

const hasWechatArticleContent = (html: string): boolean => {
  return WECHAT_CONTENT_PATTERN.test(html) || extractWechatImageMessageImages(html, WECHAT_ASSET_BASE_URL).length > 0
}

export const isWechatVerifyPage = (html: string, finalUrl?: string): boolean => {
  return WECHAT_VERIFY_PAGE_PATTERN.test(finalUrl || '') || WECHAT_VERIFY_PAGE_PATTERN.test(html)
}

const wait = async (timeout: number) => {
  await new Promise(resolve => setTimeout(resolve, timeout))
}

export const fetchWechatArticleHtmlByBrowser = async (
  url: string
): Promise<{ html: string, finalUrl: string, via: 'browser' }> => {
  let puppeteer: PuppeteerBrowser | undefined

  try {
    const { snapka } = await import('@snapka/puppeteer')
    puppeteer = await snapka.launch(
      applyBrowserProxyToLaunchOptions(
        getBrowserLaunchOptions(DETAIL_TIMEOUT_MS),
        Config.request.proxy
      )
    )

    const page: BrowserPage = await createInjectedPage(puppeteer.browser)
    const proxyCredentials = getBrowserProxyCredentials(Config.request.proxy)
    if (proxyCredentials && typeof page.authenticate === 'function') {
      await page.authenticate(proxyCredentials)
    }

    await configureRequestBlocking(page, WECHAT_BLOCKED_RESOURCE_TYPES)
    await page.goto(url, {
      timeout: DETAIL_TIMEOUT_MS,
      waitUntil: 'domcontentloaded'
    })
    if (typeof page.waitForTimeout === 'function') {
      await page.waitForTimeout(PAGE_SETTLE_MS)
    } else {
      await wait(PAGE_SETTLE_MS)
    }

    const finalUrl = page.url()
    const html = await page.content()
    if (isWechatVerifyPage(html, finalUrl)) {
      throw new Error('微信公众号文章访问被微信验证页拦截，请稍后重试或更换网络/IP')
    }
    if (!hasWechatArticleContent(html)) {
      throw new Error('微信公众号文章页面未提取到正文容器')
    }

    return {
      html,
      finalUrl,
      via: 'browser'
    }
  } finally {
    await closeBrowserSafely(puppeteer)
  }
}

export const fetchWechatArticleHtml = async (
  url: string
): Promise<{ html: string, finalUrl: string, via: 'http' | 'browser' }> => {
  const normalizedUrl = normalizeWechatArticleUrl(url)

  try {
    const response = await axios.get<string>(normalizedUrl, {
      ...requestOptions(),
      responseType: 'text',
      transformResponse: [data => data]
    })
    const html = String(response.data ?? '')
    const finalUrl = response.request?.res?.responseUrl || normalizedUrl

    if (isWechatVerifyPage(html, finalUrl)) {
      logger.warn(`[Wechat] 直连命中验证页，尝试浏览器兜底：${normalizedUrl}`)
      return await fetchWechatArticleHtmlByBrowser(normalizedUrl)
    }

    if (!hasWechatArticleContent(html)) {
      logger.warn(`[Wechat] 直连未提取到正文容器，尝试浏览器兜底：${normalizedUrl}`)
      return await fetchWechatArticleHtmlByBrowser(normalizedUrl)
    }

    return {
      html,
      finalUrl,
      via: 'http'
    }
  } catch (error) {
    logger.warn(`[Wechat] 直连抓取失败，尝试浏览器兜底：${error instanceof Error ? error.message : String(error)}`)
    return await fetchWechatArticleHtmlByBrowser(normalizedUrl)
  }
}

export const parseWechatArticleHtml = (
  url: string,
  html: string,
  via: 'http' | 'browser' = 'http'
): WechatArticleDetail => {
  const normalizedUrl = normalizeWechatArticleUrl(url)
  if (isWechatVerifyPage(html, normalizedUrl)) {
    throw new Error('微信公众号文章访问被微信验证页拦截，请稍后重试或更换网络/IP')
  }

  const imageMessageImages = extractWechatImageMessageImages(html, normalizedUrl)
  const contentType = imageMessageImages.length > 0 ? 'image' : 'article'
  const contentHtml = contentType === 'article' ? findContainerInnerHtml(html) : ''
  if (contentType === 'article' && !contentHtml) {
    throw new Error('微信公众号文章正文为空或结构暂不支持')
  }

  const title = extractMetaContent(html, 'og:title') ||
    extractMetaContent(html, 'twitter:title', 'name') ||
    decodeHtmlEntities(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim() ||
    '微信公众号文章'
  const cover = normalizeAssetUrl(extractMetaContent(html, 'og:image') || extractMetaContent(html, 'twitter:image', 'name'), normalizedUrl)
  const rawDescription = extractMetaContent(html, 'og:description') ||
    extractMetaContent(html, 'description', 'name')
  const description = contentType === 'image' && rawDescription
    ? normalizeHtmlText(rawDescription) || undefined
    : rawDescription
  const accountName = extractScriptValue(html, [
    /var\s+nickname\s*=\s*htmlDecode\("([^"]*)"\)/i,
    /nickname\s*=\s*htmlDecode\("([^"]*)"\)/i,
    /var\s+user_name\s*=\s*"([^"]*)"/i
  ]) || extractMetaContent(html, 'author', 'name')
  const accountAlias = extractScriptValue(html, [
    /alias:\s*'([^']*)'/i,
    /var\s+user_name_new\s*=\s*"([^"]*)"/i
  ])
  const accountAvatar = normalizeAssetUrl(extractScriptValue(html, [
    /var\s+hd_head_img\s*=\s*"([^"]*)"/i
  ]), normalizedUrl)
  const accountSignature = extractScriptValue(html, [
    /var\s+profile_signature\s*=\s*"([^"]*)"/i
  ])
  const createTime = extractScriptNumber(html, [
    /var\s+oriCreateTime\s*=\s*['"]?(\d+)['"]?/i
  ])
  const publishTime = formatUnixSeconds(createTime)
  const serviceType = mapServiceType(extractScriptValue(html, [
    /var\s+new_service_type\s*=\s*['"]?(\d+)['"]?/i
  ]))
  const sourceUrl = extractSourceUrl(html, normalizedUrl)
  const { contentBlocks, images, text } = contentType === 'image'
    ? buildImageMessageContent(imageMessageImages, description ?? '')
    : buildContentBlocks(contentHtml, normalizedUrl)
  const fallbackSummary = contentType === 'image'
    ? '该图片消息暂无可提取纯文本内容'
    : '该文章暂无可提取纯文本内容'
  const summary = normalizeText(description || text.slice(0, 240) || fallbackSummary)

  return {
    contentType,
    url: normalizedUrl,
    title,
    summary,
    description,
    accountName,
    accountAlias,
    accountAvatar,
    accountSignature,
    cover: cover || undefined,
    publishTime,
    createTime,
    serviceType,
    sourceUrl,
    contentBlocks,
    images,
    text,
    contentHtml,
    via
  }
}

export const fetchWechatArticleDetail = async (url: string): Promise<WechatArticleDetail> => {
  const fetched = await fetchWechatArticleHtml(url)
  return parseWechatArticleHtml(fetched.finalUrl || url, fetched.html, fetched.via)
}
