import { describe, expect, it } from 'vitest'

import {
  buildExternalPostCardFromParsedPost,
  buildParsedPostImageReplyElements,
  buildParsedPostVideoDownloadEntries,
  buildSummaryInputFromParsedPost
} from '../src/platform/parsedPostAdapters'
import type { ParsedPost } from '../src/platform/parsedPost'

const createParsedPost = (overrides: Partial<ParsedPost> = {}): ParsedPost => ({
  platform: 'weibo',
  platformLabel: '微博',
  subtype: 'status',
  title: '默认标题',
  author: {
    name: '默认作者',
    avatar: 'https://example.com/avatar.jpg'
  },
  summary: '默认摘要',
  url: 'https://weibo.com/default',
  contentBlocks: [
    { type: 'text', text: '第一段文本' },
    { type: 'image', url: 'https://example.com/image-1.jpg', alt: '主图' },
    { type: 'html', html: '<p>第二段</p>', text: '第二段' },
    { type: 'video', url: 'https://example.com/video.mp4', title: '视频标题', cover: 'https://example.com/cover.jpg' }
  ],
  images: [
    { url: 'https://example.com/image-1.jpg', alt: '主图' }
  ],
  videos: [
    {
      url: 'https://example.com/video.mp4',
      title: '视频标题',
      cover: 'https://example.com/cover.jpg',
      backupUrls: ['https://example.com/video-backup.mp4'],
      headers: {
        Referer: 'https://weibo.com/default'
      }
    }
  ],
  primaryVideo: {
    url: 'https://example.com/video.mp4',
    title: '视频标题',
    cover: 'https://example.com/cover.jpg'
  },
  stats: [{ label: '点赞', value: '12' }],
  meta: [{ label: 'IP', value: '北京' }],
  raw: {
    accentColor: '#ff6a4d'
  },
  ...overrides
})

describe('parsed post adapters', () => {
  it('builds summary input from parsed post while preserving block order', () => {
    const input = buildSummaryInputFromParsedPost(createParsedPost(), '附带文案')

    expect(input).toMatchObject({
      platform: 'weibo',
      platformLabel: '微博',
      title: '默认标题',
      author: '默认作者',
      shareContext: '附带文案',
      stats: [{ label: '点赞', value: '12' }],
      meta: [{ label: 'IP', value: '北京' }]
    })
    expect(input.blocks).toEqual([
      { type: 'text', text: '第一段文本' },
      { type: 'image', url: 'https://example.com/image-1.jpg', alt: '主图' },
      { type: 'html', html: '<p>第二段</p>', text: '第二段' },
      { type: 'video', url: 'https://example.com/video.mp4', title: '视频标题', cover: 'https://example.com/cover.jpg' }
    ])
    expect(input.videos).toEqual([
      expect.objectContaining({
        type: 'video',
        url: 'https://example.com/video.mp4',
        backupUrls: ['https://example.com/video-backup.mp4']
      })
    ])
  })

  it('builds external post card and maps video blocks to cover images', () => {
    const card = buildExternalPostCardFromParsedPost(createParsedPost())

    expect(card).toMatchObject({
      platform: {
        key: 'weibo',
        label: '微博',
        accentColor: '#ff6a4d'
      },
      title: '默认标题',
      summary: '默认摘要',
      images: ['https://example.com/image-1.jpg']
    })
    expect(card.content).toEqual([
      { type: 'text', text: '第一段文本' },
      { type: 'image', url: 'https://example.com/image-1.jpg', alt: '主图' },
      { type: 'html', html: '<p>第二段</p>' },
      { type: 'image', url: 'https://example.com/cover.jpg', alt: '视频封面' }
    ])
  })

  it('preserves trusted github html blocks with images and tables', () => {
    const card = buildExternalPostCardFromParsedPost(createParsedPost({
      platform: 'github',
      platformLabel: 'GitHub',
      contentBlocks: [
        {
          type: 'html',
          html: '<div align="center"><img alt="Stars" src="https://img.shields.io/github/stars/example/repo"></div><table><tbody><tr><td>Codex</td><td>Agent</td></tr></tbody></table>'
        }
      ],
      raw: {
        accentColor: '#24292f',
        trustedRichTextPlatform: 'github'
      }
    }))

    expect(card.content).toEqual([
      {
        type: 'html',
        trusted: true,
        html: '<div><img src="https://img.shields.io/github/stars/example/repo" alt="Stars"></div><table><tbody><tr><td>Codex</td><td>Agent</td></tr></tbody></table>'
      }
    ])
  })

  it('prefers replyImages in raw payload when building image reply elements', async () => {
    const elements = await buildParsedPostImageReplyElements(createParsedPost({
      raw: {
        replyImages: ['base64://image-a', 'base64://image-b']
      }
    }))

    expect(elements).toHaveLength(2)
    expect(elements[0]).toMatchObject({
      type: 'image',
      file: 'base64://image-a'
    })
    expect(elements[1]).toMatchObject({
      type: 'image',
      file: 'base64://image-b'
    })
  })

  it('builds downloadable video entries from parsed post videos', () => {
    const entries = buildParsedPostVideoDownloadEntries(createParsedPost({
      platform: 'tiktok',
      title: '跨世纪大型回旋镖'
    }))

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      video: expect.objectContaining({
        url: 'https://example.com/video.mp4'
      }),
      options: {
        video_url: 'https://example.com/video.mp4',
        backupUrls: ['https://example.com/video-backup.mp4'],
        headers: {
          Referer: 'https://weibo.com/default'
        },
        title: {
          originTitle: '视频标题.mp4'
        }
      }
    })
    expect(entries[0]?.options.title.timestampTitle).toMatch(/^tiktok_\d+_0\.mp4$/)
  })
})
