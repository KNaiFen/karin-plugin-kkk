import { describe, expect, it } from 'vitest'

import type { ParsedPost } from '../src/platform/parsedPost'
import { buildParsedPostVideoDownloadEntries } from '../src/platform/parsedPostAdapters'

const createVideoPost = (overrides: Partial<ParsedPost>): ParsedPost => ({
  platform: 'bilibili',
  platformLabel: 'B站',
  subtype: 'video',
  title: '测试视频',
  url: 'https://www.bilibili.com/video/BV1xx411c7mD',
  contentBlocks: [],
  images: [],
  videos: [{
    url: 'https://cdn.example.com/video.mp4?token=1',
    backupUrls: ['https://cdn.example.com/video.mp4?token=2']
  }],
  primaryVideo: {
    url: 'https://cdn.example.com/video.mp4?token=1',
    backupUrls: ['https://cdn.example.com/video.mp4?token=2']
  },
  stats: [],
  meta: [],
  raw: {},
  ...overrides
})

describe('buildParsedPostVideoDownloadEntries cache identity', () => {
  it('builds the same media cache identity for xiaohongshu notes even when share tokens change', () => {
    const first = createVideoPost({
      platform: 'xiaohongshu',
      platformLabel: '小红书',
      url: 'https://www.xiaohongshu.com/discovery/item/abc?xsec_token=token-a',
      raw: {
        idData: {
          type: 'note',
          note_id: 'abc',
          xsec_token: 'token-a'
        }
      }
    })
    const second = createVideoPost({
      platform: 'xiaohongshu',
      platformLabel: '小红书',
      url: 'https://www.xiaohongshu.com/discovery/item/abc?xsec_token=token-b',
      raw: {
        idData: {
          type: 'note',
          note_id: 'abc',
          xsec_token: 'token-b'
        }
      }
    })

    expect(buildParsedPostVideoDownloadEntries(first)[0]?.options.cacheIdentity).toEqual(
      buildParsedPostVideoDownloadEntries(second)[0]?.options.cacheIdentity
    )
  })

  it('keeps bilibili page-specific videos from colliding across different pages', () => {
    const page1 = createVideoPost({
      raw: {
        idData: {
          type: 'one_video',
          bvid: 'BV1xx411c7mD',
          p: 1,
          cid: 1001
        }
      }
    })
    const page2 = createVideoPost({
      raw: {
        idData: {
          type: 'one_video',
          bvid: 'BV1xx411c7mD',
          p: 2,
          cid: 1002
        }
      }
    })

    expect(buildParsedPostVideoDownloadEntries(page1)[0]?.options.cacheIdentity).not.toEqual(
      buildParsedPostVideoDownloadEntries(page2)[0]?.options.cacheIdentity
    )
  })
})
