import {
  createExternalPostMeta,
  createExternalPostStats,
  truncateExternalPostText,
  type ExternalPostCardData,
  type ExternalPostContentBlock
} from '../externalPostCard'
import type { XDetail, XStatus, XVideoInfo } from './types'

const getStatusTitle = (status: XStatus): string => {
  const firstLine = status.text.split('\n').map(line => line.trim()).find(Boolean)
  if (firstLine) return firstLine
  if (status.author.name) return `@${status.author.screenName} 的 X 动态`
  return 'X动态'
}

export const pickPrimaryVideo = (status: XStatus): XVideoInfo | undefined => {
  if (status.video) return status.video
  if (status.quotedStatus) return pickPrimaryVideo(status.quotedStatus)
  if (status.retweetedStatus) return pickPrimaryVideo(status.retweetedStatus)
  return undefined
}

const appendQuotedBlocks = (
  blocks: ExternalPostContentBlock[],
  status: XStatus,
  relation: '引用' | '转推'
): void => {
  const nested = relation === '引用' ? status.quotedStatus : status.retweetedStatus
  if (!nested) return

  const summary = truncateExternalPostText(nested.text || '该关联推文暂无可提取文本内容', 320)
  blocks.push({
    type: 'html',
    html: `<blockquote><p><strong>${relation} @${nested.author.screenName}</strong></p><p>${summary}</p></blockquote>`
  })

  if (nested.text) {
    blocks.push({ type: 'text', text: nested.text })
  }

  for (const image of nested.images) {
    blocks.push({ type: 'image', url: image, alt: `${relation}推文图片` })
  }

  appendQuotedBlocks(blocks, nested, '引用')
  appendQuotedBlocks(blocks, nested, '转推')
}

export const buildXExternalPostCard = (detail: XDetail): ExternalPostCardData => {
  const status = detail.status
  const blocks: ExternalPostContentBlock[] = []

  if (status.text) {
    blocks.push({ type: 'text', text: status.text })
  }

  for (const image of status.images) {
    blocks.push({ type: 'image', url: image, alt: '推文图片' })
  }

  appendQuotedBlocks(blocks, status, '引用')
  appendQuotedBlocks(blocks, status, '转推')

  return {
    platform: { key: 'x', label: 'X', accentColor: '#1d9bf0' },
    title: getStatusTitle(status),
    author: {
      name: status.author.name,
      avatar: status.author.avatar
    },
    summary: truncateExternalPostText(status.text || '该推文暂无可提取文本内容'),
    url: detail.url,
    images: status.images,
    content: blocks,
    stats: createExternalPostStats([
      ['浏览', status.stats.view],
      ['点赞', status.stats.like],
      ['评论', status.stats.comment],
      ['收藏', status.stats.bookmark],
      ['分享', status.stats.share]
    ]),
    meta: createExternalPostMeta([
      ['作者', `@${status.author.screenName}`],
      ['敏感内容', status.sensitive ? '是' : '否']
    ])
  }
}
