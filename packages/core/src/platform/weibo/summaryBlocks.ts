import {
  createExternalPostMeta,
  createExternalPostStats,
  type ExternalPostCardData,
  type ExternalPostContentBlock,
  truncateExternalPostText } from '../externalPostCard'
import type { WeiboDetail, WeiboStatus, WeiboVideoInfo } from './types'

const escapeHtml = (value: string): string => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const textToHtml = (value: string): string => {
  return escapeHtml(value).replace(/\n/g, '<br>')
}

const getWeiboImageIdentity = (value: string): string => {
  const normalized = value.trim()
  if (!normalized) return ''
  if (normalized.startsWith('data:image/') || normalized.startsWith('base64://') || normalized.startsWith('file://')) {
    return normalized
  }

  try {
    const parsed = new URL(normalized)
    return parsed.pathname.split('/').filter(Boolean).at(-1)?.toLowerCase() ?? normalized.toLowerCase()
  } catch {
    return normalized.split('?')[0].split('/').filter(Boolean).at(-1)?.toLowerCase() ?? normalized.toLowerCase()
  }
}

const dedupeWeiboImages = (images: string[]): string[] => {
  const seen = new Set<string>()
  const deduped: string[] = []

  for (const image of images) {
    const identity = getWeiboImageIdentity(image)
    if (!identity || seen.has(identity)) continue
    seen.add(identity)
    deduped.push(image)
  }

  return deduped
}

const dedupeWeiboImageBlocks = (blocks: ExternalPostContentBlock[]): ExternalPostContentBlock[] => {
  const seen = new Set<string>()
  const deduped: ExternalPostContentBlock[] = []

  for (const block of blocks) {
    if (block.type !== 'image') {
      deduped.push(block)
      continue
    }

    const identity = getWeiboImageIdentity(block.url)
    if (!identity || seen.has(identity)) continue
    seen.add(identity)
    deduped.push(block)
  }

  return deduped
}

const buildStatusTitle = (status: WeiboStatus): string => {
  if (status.title?.trim()) return status.title
  const firstLine = status.text.split('\n').find(line => line.trim())
  if (firstLine) return firstLine.slice(0, 60)
  if (status.repostedStatus?.author.name) return `转发 @${status.repostedStatus.author.name} 的微博`
  return '微博动态'
}

const collectStatusImageUrls = (
  status: WeiboStatus,
  includeVideoCover = false,
  seen = new Set<string>()
): string[] => {
  const images: string[] = []
  const appendImage = (image?: string) => {
    if (!image) return
    const identity = getWeiboImageIdentity(image)
    if (!identity || seen.has(identity)) return
    seen.add(identity)
    images.push(image)
  }

  if (includeVideoCover) appendImage(status.video?.cover)
  for (const image of status.images) appendImage(image)

  if (status.repostedStatus) {
    images.push(...collectStatusImageUrls(status.repostedStatus, includeVideoCover, seen))
  }

  return images
}

const appendStatusBlocks = (
  blocks: ExternalPostContentBlock[],
  status: WeiboStatus,
  nested = false,
  seen = new Set<string>()
): void => {
  if (!nested && status.text) {
    blocks.push({ type: 'text', text: status.text })
  }

  const appendImageBlock = (image?: string, alt?: string) => {
    if (!image) return
    const identity = getWeiboImageIdentity(image)
    if (!identity || seen.has(identity)) return
    seen.add(identity)
    blocks.push(alt ? { type: 'image', url: image, alt } : { type: 'image', url: image })
  }

  appendImageBlock(status.video?.cover, nested ? '转发视频封面' : '视频封面')
  for (const image of status.images) appendImageBlock(image)

  if (!status.repostedStatus) return

  const repostText = status.repostedStatus.text || '这条转发微博暂无可提取纯文本内容'
  blocks.push({
    type: 'html',
    html: `<blockquote><p><strong>转发 @${escapeHtml(status.repostedStatus.author.name)}</strong></p><p>${textToHtml(repostText)}</p></blockquote>`
  })

  appendStatusBlocks(blocks, status.repostedStatus, true, seen)
}

export const pickPrimaryVideo = (status: WeiboStatus): WeiboVideoInfo | undefined => {
  if (status.video) return status.video
  if (status.repostedStatus) return pickPrimaryVideo(status.repostedStatus)
  return undefined
}

export const buildWeiboStatusCard = (detail: Extract<WeiboDetail, { type: 'status' }>): ExternalPostCardData => {
  const status = detail.status
  const blocks: ExternalPostContentBlock[] = []
  appendStatusBlocks(blocks, status)

  return {
    platform: { key: 'weibo', label: '微博', accentColor: '#ff6a4d' },
    title: buildStatusTitle(status),
    author: {
      name: status.author.name,
      avatar: status.author.avatar
    },
    summary: truncateExternalPostText(status.text || '这条微博暂无可提取纯文本内容'),
    url: detail.url,
    images: dedupeWeiboImages(collectStatusImageUrls(status, true)),
    content: dedupeWeiboImageBlocks(blocks),
    stats: createExternalPostStats([
      ['转发', status.stats.repost],
      ['评论', status.stats.comment],
      ['点赞', status.stats.like]
    ]),
    meta: createExternalPostMeta([
      ['来源', status.source],
      ['地区', status.regionName],
      ['微博', status.bid]
    ])
  }
}

export const buildWeiboShowCard = (detail: Extract<WeiboDetail, { type: 'video_show' }>): ExternalPostCardData => {
  const { show } = detail
  const blocks: ExternalPostContentBlock[] = []
  if (show.text) blocks.push({ type: 'text', text: show.text })
  if (show.video.cover) blocks.push({ type: 'image', url: show.video.cover, alt: '视频封面' })

  return {
    platform: { key: 'weibo', label: '微博', accentColor: '#ff6a4d' },
    title: show.title,
    author: {
      name: show.author.name,
      avatar: show.author.avatar
    },
    summary: truncateExternalPostText(show.text || show.author.description || '这条微博视频暂无可提取纯文本内容'),
    url: detail.url,
    images: show.video.cover ? [show.video.cover] : [],
    content: blocks,
    stats: [],
    meta: createExternalPostMeta([
      ['类型', '视频号'],
      ['作者简介', show.author.description]
    ])
  }
}
