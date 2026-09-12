import fs from 'node:fs'

import { logger } from 'node-karin'

import { Config } from '@/module/utils/Config'
import { executeSafeAxiosRequest } from '@/module/utils/OutboundRequest'
import { buildConfiguredRequestOptions, normalizeAxiosProxy } from '@/module/utils/RequestConfig'
import {
  buildSharedCacheHash,
  buildSharedCachePath,
  isSharedCacheFileFresh,
  onSharedCacheFileRemoved,
  writeSharedCacheFileAtomically
} from '@/module/utils/sharedCache'
import type { requestConfig } from '@/types/config/request'

import type { ParsedPost, ParsedPostBlock, ParsedPostImage } from './parsedPost'
import {
  buildWeiboCredentialHeaders,
  shouldPrefetchWeiboMedia
} from './weibo/api'

const normalizeImageContentType = (value: unknown): string => {
  const contentType = String(value ?? '').trim().toLowerCase()
  if (contentType.startsWith('image/')) return contentType.split(';')[0]
  return 'image/jpeg'
}

const isEmbeddedRenderableImage = (value: string): boolean => {
  return value.startsWith('data:image/') || value.startsWith('base64://') || value.startsWith('file://')
}

const hasEnabledProxy = (proxy?: requestConfig['proxy']): boolean => {
  return normalizeAxiosProxy(proxy) !== false
}

const MAX_RENDER_ASSET_CACHE_ENTRIES = 256

type RenderAssetCacheEntry = {
  value: string
  cachePath: string
}

const renderAssetCache = new Map<string, RenderAssetCacheEntry>()
const pendingRenderAssetLoads = new Map<string, Promise<string>>()

onSharedCacheFileRemoved((filePath) => {
  for (const [url, entry] of renderAssetCache) {
    if (entry.cachePath === filePath) renderAssetCache.delete(url)
  }
})

const normalizeRenderAssetKey = (url: string): string => url.trim()

const rememberRenderAsset = (url: string, value: string, cachePath: string): void => {
  const key = normalizeRenderAssetKey(url)
  renderAssetCache.delete(key)
  renderAssetCache.set(key, { value, cachePath })

  while (renderAssetCache.size > MAX_RENDER_ASSET_CACHE_ENTRIES) {
    const oldestKey = renderAssetCache.keys().next().value
    if (typeof oldestKey !== 'string') return
    renderAssetCache.delete(oldestKey)
  }
}

const buildRenderAssetCachePath = (url: string): string => {
  return buildSharedCachePath({
    scope: 'render-assets',
    key: buildSharedCacheHash('render-asset', url.trim())
  }, '.txt')
}

const readCachedRenderAsset = (url: string): string | null => {
  const key = normalizeRenderAssetKey(url)
  const cached = renderAssetCache.get(key)
  if (cached) {
    if (isSharedCacheFileFresh(cached.cachePath)) {
      rememberRenderAsset(key, cached.value, cached.cachePath)
      return cached.value
    }
    renderAssetCache.delete(key)
  }

  try {
    const cachePath = buildRenderAssetCachePath(key)
    if (!isSharedCacheFileFresh(cachePath)) return null
    const value = String(fs.readFileSync(cachePath, 'utf8') ?? '').trim()
    if (!value) return null
    rememberRenderAsset(key, value, cachePath)
    return value
  } catch {
    return null
  }
}

const writeCachedRenderAsset = (url: string, value: string): void => {
  const key = normalizeRenderAssetKey(url)
  const cachePath = buildRenderAssetCachePath(key)

  try {
    if (writeSharedCacheFileAtomically(cachePath, value)) {
      rememberRenderAsset(key, value, cachePath)
    } else {
      renderAssetCache.delete(key)
    }
  } catch (error) {
    renderAssetCache.delete(key)
    logger.debug(`[ParsedPost] 渲染资源缓存写入失败，已忽略：${error instanceof Error ? error.message : String(error)}`)
  }
}

const resolveRenderAsset = async (
  url: string,
  loader: () => Promise<string>
): Promise<string> => {
  const key = normalizeRenderAssetKey(url)
  const cached = readCachedRenderAsset(key)
  if (cached) return cached

  const pending = pendingRenderAssetLoads.get(key)
  if (pending) return await pending

  const task = (async () => {
    const value = await loader()
    writeCachedRenderAsset(key, value)
    return value
  })()
  pendingRenderAssetLoads.set(key, task)

  try {
    return await task
  } finally {
    pendingRenderAssetLoads.delete(key)
  }
}

const toRenderDataUrl = async (url: string, referer: string): Promise<string> => {
  if (!url || isEmbeddedRenderableImage(url)) return url
  return await resolveRenderAsset(url, async () => {
    if (!shouldPrefetchWeiboMedia(url)) {
      throw new Error(`微博媒体地址不在白名单内，已跳过预取: ${url}`)
    }

    const { response } = await executeSafeAxiosRequest({
      url,
      method: 'GET',
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: buildWeiboCredentialHeaders(url, referer)
    }, {
      profile: 'weibo-media'
    })
    const mime = normalizeImageContentType(response.headers?.['content-type'])
    const buffer = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data)
    return `data:${mime};base64,${buffer.toString('base64')}`
  })
}

const toReplyImageUrl = async (url: string, referer: string): Promise<string> => {
  const dataUrl = await toRenderDataUrl(url, referer)
  const base64Prefix = ';base64,'
  if (!dataUrl.startsWith('data:image/') || !dataUrl.includes(base64Prefix)) return dataUrl
  return `base64://${dataUrl.slice(dataUrl.indexOf(base64Prefix) + base64Prefix.length)}`
}

const toRenderDataUrlByProxy = async (
  url: string,
  options: {
    referer: string
    proxy?: requestConfig['proxy']
    userAgentFallback?: string
  }
): Promise<string> => {
  if (!url || isEmbeddedRenderableImage(url)) return url
  return await resolveRenderAsset(url, async () => {
    const requestOptions = buildConfiguredRequestOptions({
      ...Config.request,
      proxy: options.proxy
    }, {
      userAgentFallback: options.userAgentFallback
    })

    const { response } = await executeSafeAxiosRequest({
      url,
      method: 'GET',
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: {
        ...requestOptions.headers,
        Referer: options.referer
      },
      proxy: requestOptions.proxy
    }, {
      profile: 'summary-inline-image'
    })

    const mime = normalizeImageContentType(response.headers?.['content-type'])
    const buffer = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data)
    return `data:${mime};base64,${buffer.toString('base64')}`
  })
}

const localizeHtmlImageSources = async (
  html: string,
  options: {
    referer: string
    proxy?: requestConfig['proxy']
    userAgentFallback?: string
  }
): Promise<string> => {
  const source = String(html ?? '')
  if (!source.trim()) return source

  const replacements = new Map<string, string>()
  const matches = Array.from(source.matchAll(/<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi))

  for (const match of matches) {
    const rawSrc = String(match[2] ?? '').trim()
    if (!rawSrc || replacements.has(rawSrc) || isEmbeddedRenderableImage(rawSrc)) continue

    try {
      replacements.set(rawSrc, await toRenderDataUrlByProxy(rawSrc, options))
    } catch (error) {
      logger.warn(`[ParsedPost] 富文本图片预取失败，保留原始地址: ${rawSrc}`, error)
    }
  }

  if (replacements.size === 0) return source

  return source.replace(/(<img\b[^>]*\bsrc\s*=\s*)(["'])(.*?)\2/gi, (full, prefix: string, quote: string, rawSrc: string) => {
    const replacement = replacements.get(String(rawSrc).trim())
    return replacement ? `${prefix}${quote}${replacement}${quote}` : full
  })
}

const localizeRenderImages = async (
  images: ParsedPostImage[],
  referer: string
): Promise<ParsedPostImage[]> => {
  return await Promise.all(images.map(async image => {
    try {
      return {
        ...image,
        url: await toRenderDataUrl(image.url, referer)
      }
    } catch (error) {
      logger.warn(`[ParsedPost] 微博渲染卡图片预取失败，已跳过本地化: ${image.url}`, error)
      return {
        ...image,
        url: image.url
      }
    }
  }))
}

const localizeRenderBlocks = async (
  blocks: ParsedPostBlock[],
  referer: string
): Promise<ParsedPostBlock[]> => {
  return await Promise.all(blocks.map(async block => {
    if (block.type !== 'image') return block
    try {
      return {
        ...block,
        url: await toRenderDataUrl(block.url, referer)
      }
    } catch (error) {
      logger.warn(`[ParsedPost] 微博渲染卡内容图片预取失败，已跳过本地化: ${block.url}`, error)
      return block
    }
  }))
}

const localizeAuthorAvatar = async (
  avatar: string | undefined,
  referer: string
): Promise<string | undefined> => {
  if (!avatar) return undefined

  try {
    return await toRenderDataUrl(avatar, referer)
  } catch (error) {
    logger.warn(`[ParsedPost] 微博渲染卡头像预取失败，已跳过本地化: ${avatar}`, error)
    return avatar
  }
}

const localizeRenderImagesByProxy = async (
  images: ParsedPostImage[],
  options: {
    referer: string
    proxy?: requestConfig['proxy']
    userAgentFallback?: string
    platformLabel: string
  }
): Promise<ParsedPostImage[]> => {
  return await Promise.all(images.map(async image => {
    try {
      return {
        ...image,
        url: await toRenderDataUrlByProxy(image.url, options)
      }
    } catch (error) {
      logger.warn(`[ParsedPost] ${options.platformLabel} 渲染卡图片预取失败，保留原始地址: ${image.url}`, error)
      return image
    }
  }))
}

const localizeRenderBlocksByProxy = async (
  blocks: ParsedPostBlock[],
  options: {
    referer: string
    proxy?: requestConfig['proxy']
    userAgentFallback?: string
    platformLabel: string
  }
): Promise<ParsedPostBlock[]> => {
  return await Promise.all(blocks.map(async block => {
    if (block.type === 'image') {
      try {
        return {
          ...block,
          url: await toRenderDataUrlByProxy(block.url, options)
        }
      } catch (error) {
        logger.warn(`[ParsedPost] ${options.platformLabel} 渲染卡内容图片预取失败，保留原始地址: ${block.url}`, error)
        return block
      }
    }

    if (block.type === 'html') {
      return {
        ...block,
        html: await localizeHtmlImageSources(block.html, options)
      }
    }

    return block
  }))
}

const localizeAuthorAvatarByProxy = async (
  avatar: string | undefined,
  options: {
    referer: string
    proxy?: requestConfig['proxy']
    userAgentFallback?: string
    platformLabel: string
  }
): Promise<string | undefined> => {
  if (!avatar) return undefined

  try {
    return await toRenderDataUrlByProxy(avatar, options)
  } catch (error) {
    logger.warn(`[ParsedPost] ${options.platformLabel} 渲染卡头像预取失败，保留原始地址: ${avatar}`, error)
    return avatar
  }
}

const prepareProxyBackedParsedPost = async (
  post: ParsedPost,
  options: {
    proxy?: requestConfig['proxy']
    userAgentFallback?: string
    platformLabel: string
  }
): Promise<ParsedPost> => {
  if (!hasEnabledProxy(options.proxy)) return post

  return {
    ...post,
    author: post.author
      ? {
        ...post.author,
        avatar: await localizeAuthorAvatarByProxy(post.author.avatar, {
          referer: post.url,
          proxy: options.proxy,
          userAgentFallback: options.userAgentFallback,
          platformLabel: options.platformLabel
        })
      }
      : post.author,
    images: await localizeRenderImagesByProxy(post.images, {
      referer: post.url,
      proxy: options.proxy,
      userAgentFallback: options.userAgentFallback,
      platformLabel: options.platformLabel
    }),
    contentBlocks: await localizeRenderBlocksByProxy(post.contentBlocks, {
      referer: post.url,
      proxy: options.proxy,
      userAgentFallback: options.userAgentFallback,
      platformLabel: options.platformLabel
    })
  }
}

const prepareWeiboParsedPost = async (post: ParsedPost): Promise<ParsedPost> => {
  const referer = post.url
  const replyImages = await Promise.all(post.images.map(async image => {
    try {
      return await toReplyImageUrl(image.url, referer)
    } catch (error) {
      logger.warn(`[ParsedPost] 微博回复图片预取失败，保留原始地址: ${image.url}`, error)
      return image.url
    }
  }))

  return {
    ...post,
    author: post.author
      ? {
        ...post.author,
        avatar: await localizeAuthorAvatar(post.author.avatar, referer)
      }
      : post.author,
    images: await localizeRenderImages(post.images, referer),
    contentBlocks: await localizeRenderBlocks(post.contentBlocks, referer),
    raw: {
      ...post.raw,
      replyImages
    }
  }
}

export const prepareParsedPostForCardRender = async (post: ParsedPost): Promise<ParsedPost> => {
  if (post.platform === 'weibo') {
    return await prepareWeiboParsedPost(post)
  }

  if (post.platform === 'x') {
    return await prepareProxyBackedParsedPost(post, {
      proxy: Config.x?.proxy,
      userAgentFallback: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      platformLabel: 'X'
    })
  }

  if (post.platform === 'github') {
    return await prepareProxyBackedParsedPost(post, {
      proxy: Config.github?.proxy,
      userAgentFallback: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      platformLabel: 'GitHub'
    })
  }

  return post
}
