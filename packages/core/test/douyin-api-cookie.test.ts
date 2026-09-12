import { describe, expect, it } from 'vitest'

import { getDouyinDefaultConfig } from '../../amagi/packages/core/src/platform/defaultConfigs'
import { createDouyinApiUrls } from '../../amagi/packages/core/src/platform/douyin/API'

const getQueryParam = (url: string, name: string): string | null => {
  return new URL(url).searchParams.get(name)
}

describe('Douyin API cookie identity', () => {
  const guestCookie = 'ttwid=guest-ttwid; s_v_web_id=verify_guest_fp; msToken=guest-ms-token; UIFID_TEMP=guest-uifid; __kkk_guest_douyin_web_id=7000000000000000001'

  it('uses guest cookie identity values when building work detail URLs', () => {
    const api = createDouyinApiUrls(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      guestCookie
    )

    const url = api.getWorkDetail({ aweme_id: '7643744539958136955' })

    expect(getQueryParam(url, 'webid')).toBe('7000000000000000001')
    expect(getQueryParam(url, 'verifyFp')).toBe('verify_guest_fp')
    expect(getQueryParam(url, 'fp')).toBe('verify_guest_fp')
    expect(getQueryParam(url, 'msToken')).toBe('guest-ms-token')
    expect(getQueryParam(url, 'uifid')).toBe('guest-uifid')
    expect(getQueryParam(url, 'request_source')).toBe('600')
    expect(getQueryParam(url, 'origin_type')).toBe('video_page')
  })

  it('omits hardcoded webid fallback when the guest cookie has no real browser webid', () => {
    const api = createDouyinApiUrls(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'ttwid=guest-ttwid; s_v_web_id=verify_guest_fp; msToken=guest-ms-token; UIFID_TEMP=guest-uifid'
    )

    const url = api.getWorkDetail({ aweme_id: '7643744539958136955' })

    expect(getQueryParam(url, 'webid')).toBeNull()
    expect(getQueryParam(url, 'verifyFp')).toBe('verify_guest_fp')
    expect(getQueryParam(url, 'fp')).toBe('verify_guest_fp')
    expect(getQueryParam(url, 'msToken')).toBe('guest-ms-token')
    expect(getQueryParam(url, 'uifid')).toBe('guest-uifid')
  })

  it('uses guest cookie identity values when building user profile URLs for push monitoring', () => {
    const api = createDouyinApiUrls(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      guestCookie
    )

    const url = api.getUserProfile({ sec_uid: 'MS4wLjABAAAA-test' })

    expect(getQueryParam(url, 'webid')).toBe('7000000000000000001')
    expect(getQueryParam(url, 'verifyFp')).toBe('verify_guest_fp')
    expect(getQueryParam(url, 'fp')).toBe('verify_guest_fp')
    expect(getQueryParam(url, 'msToken')).toBe('')
  })

  it('uses guest cookie identity values and current user-page params when building post list URLs', () => {
    const api = createDouyinApiUrls(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      guestCookie
    )

    const url = api.getUserVideoList({ sec_uid: 'MS4wLjABAAAA-test', number: 15 })

    expect(getQueryParam(url, 'webid')).toBe('7000000000000000001')
    expect(getQueryParam(url, 'verifyFp')).toBe('verify_guest_fp')
    expect(getQueryParam(url, 'fp')).toBe('verify_guest_fp')
    expect(getQueryParam(url, 'msToken')).toBe('')
    expect(getQueryParam(url, 'from_user_page')).toBe('1')
    expect(getQueryParam(url, 'pc_libra_divert')).toBe('Windows')
    expect(getQueryParam(url, 'update_version_code')).toBe('170400')
  })

  it('uses guest cookie identity values when building favorite and recommend list URLs for push monitoring', () => {
    const api = createDouyinApiUrls(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      guestCookie
    )

    const favoriteUrl = api.getUserFavoriteList({ sec_uid: 'MS4wLjABAAAA-test', number: 15 })
    const recommendUrl = api.getUserRecommendList({ sec_uid: 'MS4wLjABAAAA-test', number: 15 })

    for (const url of [favoriteUrl, recommendUrl]) {
      expect(getQueryParam(url, 'webid')).toBe('7000000000000000001')
      expect(getQueryParam(url, 'verifyFp')).toBe('verify_guest_fp')
      expect(getQueryParam(url, 'fp')).toBe('verify_guest_fp')
      expect(getQueryParam(url, 'msToken')).toBe('')
    }
  })

  it('does not send internal guest identity metadata as real Douyin cookies', () => {
    const config = getDouyinDefaultConfig(
      'ttwid=guest-ttwid; __kkk_guest_douyin_web_id=7000000000000000001; __kkk_guest_douyin_verify_fp=verify_guest_fp'
    )

    expect(config.headers?.Cookie).toBe('ttwid=guest-ttwid')
  })
})
