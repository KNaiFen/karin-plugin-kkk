import { describe, expect, it } from 'vitest'

import { buildDouyinGraphicReplyPlan, resolveDouyinMusicUrl } from '../src/platform/douyin/graphicReply'

describe('Douyin graphic reply music planning', () => {
  it('prefers query-bearing music urls over bare play_url uri values', () => {
    const musicUrl = resolveDouyinMusicUrl({
      play_url: {
        uri: 'https://sf11-cdn-tos.douyinstatic.com/obj/ies-music/7634223845754407716.mp3',
        url_list: ['https://sf6-cdn-tos.douyinstatic.com/obj/ies-music/7634223845754407716.mp3?is_ssr=1']
      }
    })

    expect(musicUrl).toBe(
      'https://sf6-cdn-tos.douyinstatic.com/obj/ies-music/7634223845754407716.mp3?is_ssr=1'
    )
  })

  it('appends is_ssr=1 when only a bare music cdn url is available', () => {
    const plan = buildDouyinGraphicReplyPlan({
      aweme_type: 68,
      preview_title: '图文标题',
      desc: '图文标题',
      images: [{
        url_list: ['https://example.com/note-1.jpg'],
        clip_type: 2
      }],
      music: {
        play_url: {
          uri: 'https://sf11-cdn-tos.douyinstatic.com/obj/ies-music/7634223845754407716.mp3'
        }
      }
    })

    expect(plan.bgmUrl).toBe(
      'https://sf11-cdn-tos.douyinstatic.com/obj/ies-music/7634223845754407716.mp3?is_ssr=1'
    )
  })

  it('keeps alternate music cdn candidates for retry when the primary one fails', () => {
    const plan = buildDouyinGraphicReplyPlan({
      aweme_type: 163,
      preview_title: '文章标题',
      desc: '文章标题',
      article_info: {
        fe_data: JSON.stringify({
          image_list: [{ url: 'https://example.com/article-image.jpg' }]
        })
      },
      music: {
        play_url: {
          uri: 'https://sf6-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/article-audio',
          url_list: ['https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/article-audio']
        }
      }
    })

    expect(plan.bgmUrl).toBe('https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/article-audio')
    expect(plan.bgmBackupUrls).toEqual([
      'https://sf6-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/article-audio'
    ])
  })

  it('falls back to article head poster when fe_data image_list is empty', () => {
    const plan = buildDouyinGraphicReplyPlan({
      aweme_type: 163,
      preview_title: '文章标题',
      desc: '文章标题',
      article_info: {
        article_content: JSON.stringify({
          head_poster_list: {
            url_list: ['https://example.com/article-head-poster-from-content.jpg']
          }
        }),
        fe_data: JSON.stringify({
          image_list: [],
          head_poster_list: {
            url_list: ['https://example.com/article-head-poster.jpg']
          }
        })
      }
    })

    expect(plan.baseImages).toEqual([
      {
        index: 0,
        url: 'https://example.com/article-head-poster.jpg'
      }
    ])
  })
})
