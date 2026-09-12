import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  fetchData: vi.fn(),
  wbiSign: vi.fn()
}))

vi.mock('amagi/model/networks', async () => {
  const actual = await vi.importActual<any>('amagi/model/networks')
  return {
    ...actual,
    fetchData: state.fetchData,
    isNetworkErrorResult: vi.fn(() => false),
    getHeadersAndData: vi.fn()
  }
})

vi.mock('../../amagi/packages/core/src/platform/bilibili/sign/wbi', async () => {
  const actual = await vi.importActual<any>('../../amagi/packages/core/src/platform/bilibili/sign/wbi')
  return {
    ...actual,
    wbi_sign: (...args: unknown[]) => state.wbiSign(...args)
  }
})

const { bilibiliApiUrls } = await import('../../amagi/packages/core/src/platform/bilibili/API')
const { fetchUserDynamicList } = await import('../../amagi/packages/core/src/model/fetchers/bilibili/user')

describe('amagi bilibili userDynamicList request', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.wbiSign.mockResolvedValue('&w_rid=test-sign&wts=1711111111')
    state.fetchData.mockResolvedValue({
      code: 0,
      data: {
        items: []
      },
      message: '0'
    })
  })

  it('keeps old behavior when optional web-like params are omitted', () => {
    const url = new URL(bilibiliApiUrls.getUserDynamicList({ host_mid: 672328094 }))

    expect(url.searchParams.get('host_mid')).toBe('672328094')
    expect(url.searchParams.get('timezone_offset')).toBeNull()
    expect(url.searchParams.get('web_location')).toBeNull()
    expect(url.searchParams.get('x-bili-device-req-json')).toBeNull()
    expect(url.searchParams.get('features')).toContain('cardsEnhance')
    expect(url.searchParams.get('features')).toContain('eva3CardUser')
  })

  it('builds and signs userDynamicList with the conservative web-like params', async () => {
    await fetchUserDynamicList({
      host_mid: 672328094,
      timezone_offset: -480,
      web_location: '333.1387',
      deviceReqJson: '{"platform":"web","device":"pc","spmid":"333.1387"}',
      typeMode: 'strict'
    }, 'SESSDATA=test')

    const signedBaseUrl = state.wbiSign.mock.calls[0]?.[0]
    expect(String(signedBaseUrl)).toContain('host_mid=672328094')
    expect(String(signedBaseUrl)).toContain('timezone_offset=-480')
    expect(String(signedBaseUrl)).toContain('web_location=333.1387')
    expect(String(signedBaseUrl)).toContain('x-bili-device-req-json=%7B%22platform%22%3A%22web%22%2C%22device%22%3A%22pc%22%2C%22spmid%22%3A%22333.1387%22%7D')
    expect(String(signedBaseUrl)).toContain('cardsEnhance')
    expect(String(signedBaseUrl)).toContain('eva3CardUser')

    const requestUrl = state.fetchData.mock.calls[0]?.[0]?.url as string
    expect(requestUrl).toBe(`${signedBaseUrl}&w_rid=test-sign&wts=1711111111`)
  })
})
