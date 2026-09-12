import { describe, expect, it } from 'vitest'

import { getDouyinPlayableVideoUrl, getDouyinShareableVideoUrl, resolveDouyinPlayableVideoUrls } from '../src/platform/douyin/workType'

describe('Douyin video url helpers', () => {
  it('prefers direct playable urls when downloading', () => {
    const video = {
      play_addr_h264: {
        uri: 'v2700fgi0000d9363svog65pv4qlt2ug',
        url_list: ['https://example.com/direct.mp4']
      },
      play_addr: {
        uri: 'fallback-uri',
        url_list: ['https://example.com/fallback.mp4']
      }
    }

    expect(getDouyinPlayableVideoUrl(video)).toBe('https://example.com/direct.mp4')
  })

  it('prefers wrapped douyin urls when a real media uri exists', () => {
    const video = {
      play_addr_h264: {
        uri: 'v2700fgi0000d9363svog65pv4qlt2ug',
        url_list: ['https://example.com/direct.mp4']
      }
    }

    expect(getDouyinShareableVideoUrl(video)).toBe(
      'https://aweme.snssdk.com/aweme/v1/play/?video_id=v2700fgi0000d9363svog65pv4qlt2ug&ratio=1080p&line=0'
    )
  })

  it('falls back to direct playable urls when the media uri is polluted by a cdn url', () => {
    const video = {
      play_addr_h264: {
        uri: 'https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/test-video',
        url_list: ['https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/test-video?is_ssr=1&temp=1']
      }
    }

    expect(getDouyinShareableVideoUrl(video)).toBe(
      'https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/test-video?is_ssr=1&temp=1'
    )
  })

  it('unwraps broken aweme wrapper urls whose video_id is already an absolute cdn url', () => {
    const directUrl = 'https://sf6-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/oA1uoDVLXAUIrBiszAxMNjNQBCWmwvfELEYBi3'
    const wrappedUrl = `${'https://aweme.snssdk.com/aweme/v1/playwm/?video_id='}${directUrl}&ratio=720p&line=0`
    const video = {
      play_addr: {
        uri: directUrl,
        url_list: [wrappedUrl]
      },
      bit_rate: [{
        play_addr: {
          url_list: [wrappedUrl]
        }
      }]
    }

    expect(getDouyinPlayableVideoUrl(video as any)).toBe(directUrl)
    expect(getDouyinShareableVideoUrl(video as any)).toBe(directUrl)
  })

  it('prefers a synthesized play wrapper when only playwm urls and a stable media uri are available', () => {
    const video = {
      play_addr: {
        uri: 'v1e00fgi0000d7f5g1fog65jfn7cv8c0',
        url_list: [
          'https://aweme.snssdk.com/aweme/v1/playwm/?line=0&logo_name=aweme_diversion_search&ratio=720p&video_id=v1e00fgi0000d7f5g1fog65jfn7cv8c0'
        ]
      }
    }

    expect(resolveDouyinPlayableVideoUrls(video as any)[0]).toBe(
      'https://aweme.snssdk.com/aweme/v1/play/?video_id=v1e00fgi0000d7f5g1fog65jfn7cv8c0&ratio=1080p&line=0'
    )
    expect(getDouyinPlayableVideoUrl(video as any)).toBe(
      'https://aweme.snssdk.com/aweme/v1/play/?video_id=v1e00fgi0000d7f5g1fog65jfn7cv8c0&ratio=1080p&line=0'
    )
  })
})
