import type { ExternalPostCardData } from '@/platform/externalPostCard'
import { buildSummaryInputFromParsedPost } from '@/platform/parsedPostAdapters'
import type { ParsedPost } from '@/platform/parsedPost'

import type {
  SummaryBuildSource,
  SummaryInput
} from './types'

export const buildSummaryInput = (
  source: SummaryBuildSource,
  shareContext?: string
): SummaryInput => {
  return buildSummaryInputFromParsedPost(source as ParsedPost, shareContext)
}

export const renderSummaryInputForLLM = (input: SummaryInput): string => {
  const lines: string[] = [
    `平台：${input.platformLabel}`,
    `标题：${input.title}`
  ]

  if (input.author) lines.push(`作者：${input.author}`)
  if (input.summary) lines.push(`摘要：${input.summary}`)

  if (input.meta.length > 0) {
    lines.push('元信息：')
    for (const item of input.meta) {
      lines.push(`- ${item.label}：${item.value}`)
    }
  }

  if (input.stats.length > 0) {
    lines.push('统计信息：')
    for (const item of input.stats) {
      lines.push(`- ${item.label}：${item.value}`)
    }
  }

  if (input.shareContext) {
    lines.push(`用户附带文案：${input.shareContext}`)
  }

  if (input.blocks.length > 0) {
    lines.push('解析内容：')
    for (const [index, block] of input.blocks.entries()) {
      if (block.type === 'text') {
        lines.push(`${index + 1}. 文本：${block.text}`)
        continue
      }
      if (block.type === 'html') {
        lines.push(`${index + 1}. 文本：${block.text}`)
        continue
      }
      if (block.type === 'image') {
        lines.push(`${index + 1}. 图片：${block.alt ?? '图片'}`)
        continue
      }
      lines.push(`${index + 1}. 视频：${block.title ?? '视频'}`)
    }
  }

  if (input.asrTexts.length > 0) {
    lines.push('视频转写：')
    for (const [index, item] of input.asrTexts.entries()) {
      lines.push(`${index + 1}. ${item.title ?? '视频'}：${item.text}`)
    }
  }

  if (input.videoFrames.length > 0) {
    lines.push('视频抽帧：')
    for (const [index, item] of input.videoFrames.entries()) {
      lines.push(`${index + 1}. ${item.title ?? '视频'}：共 ${item.images.length} 张画面`)
    }
  }

  return lines.join('\n')
}

export const buildSummaryInputFromExternalPostCard = (
  card: ExternalPostCardData,
  shareContext?: string
): SummaryInput => {
  return buildSummaryInputFromParsedPost({
    platform: card.platform.key,
    platformLabel: card.platform.label,
    subtype: 'post',
    title: card.title,
    author: {
      name: card.author.name,
      avatar: card.author.avatar
    },
    summary: card.summary,
    url: card.url,
    contentBlocks: (card.content ?? []).map(block => {
      if (block.type === 'text') {
        return { type: 'text', text: block.text }
      }
      if (block.type === 'html') {
        return { type: 'html', html: block.html }
      }
      return { type: 'image', url: block.url, alt: block.alt }
    }),
    images: card.images.map(url => ({ url })),
    videos: [],
    stats: card.stats,
    meta: card.meta,
    raw: {}
  }, shareContext)
}

export const renderMergedSummaryInputsForLLM = (inputs: SummaryInput[]): string => {
  return inputs
    .map((input, index) => `内容 ${index + 1}\n${renderSummaryInputForLLM(input)}`)
    .join('\n\n---\n\n')
}
