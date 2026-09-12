import { describe, expect, it } from 'vitest'

import {
  buildDouyinLongTextWorkData,
  countDouyinTitleGraphemes,
  resolveDouyinWorkDisplayText,
  shouldUseDouyinLongTextCard
} from '../src/platform/douyin/longTextCard'

const createAweme = (overrides: Record<string, unknown> = {}) => ({
  aweme_id: '7659034267062673515',
  aweme_type: 0,
  desc: '默认标题',
  preview_title: '预览标题',
  share_url: 'https://www.douyin.com/video/7659034267062673515',
  create_time: 1784995200,
  author: {
    uid: 'author-uid',
    sec_uid: 'author-sec',
    nickname: '作品作者',
    short_id: 'author-short',
    avatar_thumb: { url_list: ['https://example.com/author.jpg'] }
  },
  statistics: {
    digg_count: 101,
    comment_count: 22,
    collect_count: 33,
    share_count: 44
  },
  video: {
    duration: 123000,
    width: 1080,
    height: 1920,
    ratio: '1080p',
    cover_original_scale: { url_list: ['https://example.com/video-cover.jpg'] },
    cover: { url_list: ['https://example.com/video-cover-fallback.jpg'] }
  },
  ...overrides
})

describe('Douyin long text card selection', () => {
  it('switches only after 25 grapheme clusters', () => {
    const aweme = createAweme()

    expect(countDouyinTitleGraphemes('字'.repeat(25))).toBe(25)
    expect(shouldUseDouyinLongTextCard(aweme, '字'.repeat(25))).toBe(false)
    expect(countDouyinTitleGraphemes('字'.repeat(26))).toBe(26)
    expect(shouldUseDouyinLongTextCard(aweme, '字'.repeat(26))).toBe(true)
  })

  it('uses a custom threshold while keeping the boundary exclusive', () => {
    const aweme = createAweme()

    expect(shouldUseDouyinLongTextCard(aweme, '字'.repeat(40), 40)).toBe(false)
    expect(shouldUseDouyinLongTextCard(aweme, '字'.repeat(41), 40)).toBe(true)
  })

  it('falls back to 25 when a custom threshold is invalid', () => {
    const aweme = createAweme()

    expect(shouldUseDouyinLongTextCard(aweme, '字'.repeat(26), 0)).toBe(true)
    expect(shouldUseDouyinLongTextCard(aweme, '字'.repeat(26), Number.NaN)).toBe(true)
  })

  it('trims only outer whitespace before counting and keeps emoji sequences as one grapheme', () => {
    const familyEmoji = '👩‍👩‍👧‍👧'
    const exactlyTwentyFive = `  \n${familyEmoji}${'字'.repeat(24)}\t `
    const twentySix = `${familyEmoji}${'字'.repeat(25)}`

    expect(countDouyinTitleGraphemes(exactlyTwentyFive)).toBe(25)
    expect(shouldUseDouyinLongTextCard(createAweme(), exactlyTwentyFive)).toBe(false)
    expect(countDouyinTitleGraphemes(twentySix)).toBe(26)
    expect(shouldUseDouyinLongTextCard(createAweme(), twentySix)).toBe(true)
  })

  it('uses resolved title first, then desc and preview_title', () => {
    const aweme = createAweme({ desc: '描述全文', preview_title: '预览标题' })

    expect(resolveDouyinWorkDisplayText(aweme, ' \n解析标题\n ')).toBe(' \n解析标题\n ')
    expect(resolveDouyinWorkDisplayText(aweme)).toBe('描述全文')
    expect(resolveDouyinWorkDisplayText(createAweme({ desc: ' ', preview_title: '预览标题' }))).toBe('预览标题')
  })

  it('never switches real articles or live rooms', () => {
    const longTitle = '字'.repeat(100)

    expect(shouldUseDouyinLongTextCard(createAweme({ aweme_type: 163 }), longTitle)).toBe(false)
    expect(shouldUseDouyinLongTextCard(createAweme({ live_data: {} }), longTitle)).toBe(false)
  })
})

describe('Douyin long text card data adapter', () => {
  it('builds video metadata without changing the work type', () => {
    const data = buildDouyinLongTextWorkData(createAweme({
      desc: '第一行\n第二行',
      music: {
        author: '音乐作者',
        title: '背景音乐',
        cover_hd: { url_list: ['https://example.com/music.jpg'] }
      },
      cooperation_info: {
        co_creator_nums: 2,
        co_creators: [{
          uid: 'partner-uid',
          nickname: '共创者',
          role_title: '出镜',
          avatar_thumb: { url_list: ['https://example.com/partner.jpg'] }
        }]
      }
    }), {
      profile: {
        uid: 'author-uid',
        nickname: '作品作者',
        unique_id: 'profile-id',
        follower_count: 1000,
        total_favorited: 2000,
        following_count: 30
      },
      createTime: '2026-07-26 08:00',
      shareUrl: 'https://www.douyin.com/video/shareable',
      dynamicType: '作品动态推送'
    })

    expect(data).toMatchObject({
      text: '第一行\n第二行',
      work_type: '视频',
      image_url: 'https://example.com/video-cover.jpg',
      create_time: '2026-07-26 08:00',
      share_url: 'https://www.douyin.com/video/shareable',
      dynamicTYPE: '作品动态推送',
      author: {
        name: '作品作者',
        douyin_id: 'profile-id',
        follower_count: 1000,
        total_favorited: 2000,
        following_count: 30
      },
      statistics: {
        digg_count: 101,
        comment_count: 22,
        collect_count: 33,
        share_count: 44
      },
      video: {
        duration: 123000,
        width: 1080,
        height: 1920,
        ratio: '1080p'
      },
      music: {
        author: '音乐作者',
        title: '背景音乐',
        cover: 'https://example.com/music.jpg'
      },
      cooperation_info: {
        co_creator_nums: 2,
        subscriber_role: '作者'
      }
    })
    expect(data.cooperation_info?.co_creators).toEqual([
      expect.objectContaining({ nickname: '作品作者', role_title: '作者' }),
      expect.objectContaining({ nickname: '共创者', role_title: '出镜' })
    ])
  })

  it.each([
    { isSlides: false, expectedType: '图集' },
    { isSlides: true, expectedType: '合辑' }
  ])('builds $expectedType data from image works without video metadata', ({ isSlides, expectedType }) => {
    const data = buildDouyinLongTextWorkData(createAweme({
      aweme_type: 68,
      is_slides: isSlides,
      images: [{
        width: 1080,
        height: 1440,
        url_list: ['https://example.com/image-cover.jpg']
      }]
    }), {
      createTime: '2026-07-26 08:00'
    })

    expect(data.work_type).toBe(expectedType)
    expect(data.image_url).toBe('https://example.com/image-cover.jpg')
    expect(data.video).toBeUndefined()
  })
})
