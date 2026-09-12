import { describe, expect, it, vi } from 'vitest'

vi.mock('@/module', () => ({
  Render: vi.fn(),
  replyRenderedImages: vi.fn()
}))

import { buildWeiboStatusCard } from '../src/platform/weibo/summaryBlocks'
import { buildXExternalPostCard } from '../src/platform/x/summaryBlocks'

describe('summary parse shared platform block builders', () => {
  it('preserves Weibo repost text and images in source order', () => {
    const card = buildWeiboStatusCard({
      type: 'status',
      url: 'https://weibo.com/1980237443/Qeq3Dpa2b',
      status: {
        id: '5234367615996775',
        bid: 'Qeq3Dpa2b',
        title: '微博标题',
        text: '主微博正文',
        source: '微博网页版',
        regionName: '河南',
        author: {
          id: '1980237443',
          name: '青冥童子',
          avatar: 'https://example.com/weibo-avatar.jpg'
        },
        images: ['https://example.com/weibo-image.jpg'],
        video: {
          url: 'https://example.com/weibo-video.mp4',
          backupUrls: [],
          cover: 'https://example.com/weibo-cover.jpg'
        },
        stats: {
          repost: 30,
          comment: 2,
          like: 21
        },
        repostedStatus: {
          id: '5234001406855704',
          bid: 'QegwYsLtS',
          text: '转发原文第一段',
          author: {
            id: '5819071204',
            name: '野比大雄',
            avatar: 'https://example.com/repost-avatar.jpg'
          },
          images: ['https://example.com/repost-image.jpg'],
          video: {
            url: 'https://example.com/repost-video.mp4',
            backupUrls: [],
            cover: 'https://example.com/repost-cover.jpg'
          },
          stats: {
            repost: 1670,
            comment: 386,
            like: 9890
          }
        }
      }
    })

    expect(card.content).toEqual([
      { type: 'text', text: '主微博正文' },
      { type: 'image', url: 'https://example.com/weibo-cover.jpg', alt: '视频封面' },
      { type: 'image', url: 'https://example.com/weibo-image.jpg' },
      expect.objectContaining({ type: 'html', html: expect.stringContaining('转发 @野比大雄') }),
      { type: 'image', url: 'https://example.com/repost-cover.jpg', alt: '转发视频封面' },
      { type: 'image', url: 'https://example.com/repost-image.jpg' }
    ])
    expect(card.images).toEqual([
      'https://example.com/weibo-cover.jpg',
      'https://example.com/weibo-image.jpg',
      'https://example.com/repost-cover.jpg',
      'https://example.com/repost-image.jpg'
    ])
  })

  it('preserves X quoted and retweeted text and images in source order', () => {
    const card = buildXExternalPostCard({
      type: 'status',
      url: 'https://x.com/main/status/1',
      status: {
        id: '1',
        text: '主帖正文',
        sensitive: false,
        author: {
          name: 'Main',
          screenName: 'main',
          avatar: 'https://example.com/main.jpg'
        },
        images: ['https://example.com/main-1.jpg'],
        stats: {
          view: 1,
          like: 2,
          comment: 3,
          bookmark: 4,
          share: 5
        },
        quotedStatus: {
          id: '2',
          text: '引用正文',
          sensitive: false,
          author: {
            name: 'Quoted',
            screenName: 'quoted'
          },
          images: ['https://example.com/quoted-1.jpg'],
          stats: {}
        },
        retweetedStatus: {
          id: '3',
          text: '转推正文',
          sensitive: false,
          author: {
            name: 'Retweeted',
            screenName: 'retweeted'
          },
          images: ['https://example.com/retweeted-1.jpg'],
          stats: {}
        }
      }
    })

    expect(card.content).toEqual([
      { type: 'text', text: '主帖正文' },
      { type: 'image', url: 'https://example.com/main-1.jpg', alt: '推文图片' },
      expect.objectContaining({ type: 'html', html: expect.stringContaining('引用 @quoted') }),
      { type: 'text', text: '引用正文' },
      { type: 'image', url: 'https://example.com/quoted-1.jpg', alt: '引用推文图片' },
      expect.objectContaining({ type: 'html', html: expect.stringContaining('转推 @retweeted') }),
      { type: 'text', text: '转推正文' },
      { type: 'image', url: 'https://example.com/retweeted-1.jpg', alt: '转推推文图片' }
    ])
  })
})
