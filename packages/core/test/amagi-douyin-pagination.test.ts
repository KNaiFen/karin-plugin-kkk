import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  fetchData: vi.fn(),
  emitApiError: vi.fn(),
  emitApiSuccess: vi.fn()
}))

vi.mock('amagi/model/networks', async () => {
  const actual = await vi.importActual<any>('amagi/model/networks')
  return {
    ...actual,
    fetchData: state.fetchData,
    isNetworkErrorResult: vi.fn(() => false)
  }
})

vi.mock('amagi/model/events', async () => {
  const actual = await vi.importActual<any>('amagi/model/events')
  return {
    ...actual,
    emitApiError: state.emitApiError,
    emitApiSuccess: state.emitApiSuccess
  }
})

const { fetchUserVideoList } = await import('../../amagi/packages/core/src/model/fetchers/douyin/user')
const { createDouyinApiUrls } = await import('../../amagi/packages/core/src/platform/douyin/API')

describe('amagi douyin userVideoList pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('continues fetching next pages when the first page is shorter than requested but still reports has_more', async () => {
    state.fetchData
      .mockResolvedValueOnce({
        status_code: 0,
        aweme_list: Array.from({ length: 17 }, (_, index) => ({ aweme_id: `page1-${index}` })),
        has_more: 1,
        max_cursor: 1775869800000,
        request_item_cursor: 0,
        time_list: ['2026·06', '2026·05']
      })
      .mockResolvedValueOnce({
        status_code: 0,
        aweme_list: Array.from({ length: 18 }, (_, index) => ({ aweme_id: `page2-${index}` })),
        has_more: 0,
        max_cursor: 1770000000000
      })

    const result = await fetchUserVideoList({
      sec_uid: 'sec-user',
      number: 30,
      typeMode: 'loose'
    })

    expect(state.fetchData).toHaveBeenCalledTimes(2)
    const secondUrl = new URL(state.fetchData.mock.calls[1][0].url)
    expect(secondUrl.searchParams.get('max_cursor')).toBe('1775869800000')
    expect(secondUrl.searchParams.get('request_item_cursor')).toBe('0')
    expect(secondUrl.searchParams.get('time_list')).toBe('2026·06,2026·05')
    expect(result.success).toBe(true)
    expect(result.data.aweme_list).toHaveLength(30)
    expect(result.data.aweme_list[0].aweme_id).toBe('page1-0')
    expect(result.data.aweme_list[16].aweme_id).toBe('page1-16')
    expect(result.data.aweme_list[17].aweme_id).toBe('page2-0')
    expect(result.data.aweme_list[29].aweme_id).toBe('page2-12')
  })

  it('continues fetching next pages when has_more is boolean true', async () => {
    state.fetchData
      .mockResolvedValueOnce({
        status_code: 0,
        aweme_list: Array.from({ length: 18 }, (_, index) => ({ aweme_id: `page1-${index}` })),
        has_more: true,
        max_cursor: 100
      })
      .mockResolvedValueOnce({
        status_code: 0,
        aweme_list: Array.from({ length: 12 }, (_, index) => ({ aweme_id: `page2-${index}` })),
        has_more: false,
        max_cursor: 200
      })

    const result = await fetchUserVideoList({
      sec_uid: 'sec-user',
      number: 30,
      typeMode: 'loose'
    })

    expect(state.fetchData).toHaveBeenCalledTimes(2)
    expect(result.success).toBe(true)
    expect(result.data.aweme_list).toHaveLength(30)
    expect(result.data.aweme_list[0].aweme_id).toBe('page1-0')
    expect(result.data.aweme_list[29].aweme_id).toBe('page2-11')
  })

  it('builds the user video list url with the full browser-style pagination params', () => {
    const api = createDouyinApiUrls(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      [
        '__kkk_guest_douyin_web_id=7648510691041478190',
        '__kkk_guest_douyin_verify_fp=verify_mq3awsv9_QqliYc5d_YvjE_4Kbb_AbEx_NRDkPstgGlBZ',
        'UIFID_TEMP=test-uifid'
      ].join('; ')
    )

    const url = new URL(api.getUserVideoList({
      sec_uid: 'sec-user',
      number: 18,
      max_cursor: '0'
    }))

    expect(url.searchParams.get('from_user_page')).toBe('1')
    expect(url.searchParams.get('show_live_replay_strategy')).toBe('1')
    expect(url.searchParams.get('need_time_list')).toBe('1')
    expect(url.searchParams.get('time_list_query')).toBe('0')
    expect(url.searchParams.get('support_h265')).toBe('0')
    expect(url.searchParams.get('support_dash')).toBe('1')
    expect(url.searchParams.get('uifid')).toBe('test-uifid')
    expect(url.searchParams.get('timestamp')).toBeTruthy()
  })
})
