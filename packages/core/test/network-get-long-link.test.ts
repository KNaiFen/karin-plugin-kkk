import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  executeSafeAxiosRequest: vi.fn(),
  axiosCreate: vi.fn(() => ({
    interceptors: {
      response: {
        use: vi.fn()
      }
    }
  })),
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  }
}))

vi.mock('node-karin', () => ({
  logger: state.logger
}))

vi.mock('node-karin/axios', () => {
  class MockAxiosError extends Error {
    code?: string
  }

  return {
    default: {
      create: state.axiosCreate
    },
    AxiosError: MockAxiosError
  }
})

vi.mock('../src/module/utils/OutboundRequest', () => ({
  executeSafeAxiosRequest: (...args: unknown[]) => state.executeSafeAxiosRequest(...args)
}))

vi.mock('../src/module/utils/Config', () => ({
  Config: {
    request: {
      proxy: {
        switch: false
      }
    }
  }
}))

vi.mock('../src/module/utils/RequestConfig', () => ({
  normalizeAxiosProxy: vi.fn(() => false)
}))

const { Network } = await import('../src/module/utils/Network/Network')

describe('Network.getLongLink', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.executeSafeAxiosRequest.mockReset()
  })

  it('uses streaming GET fallback when HEAD redirect probing fails', async () => {
    const stream = {
      on: vi.fn(),
      destroy: vi.fn()
    }

    state.executeSafeAxiosRequest
      .mockRejectedValueOnce(Object.assign(new Error('HEAD not allowed'), { code: 'ERR_BAD_REQUEST' }))
      .mockResolvedValueOnce({
        finalUrl: 'https://www.xiaohongshu.com/explore/65abc123?xsec_token=redirect-token',
        response: {
          data: stream
        }
      })

    const network = new Network({
      url: 'http://xhslink.com/o/37BoQX0cLV9',
      outboundProfile: 'xiaohongshu-redirect',
      timeout: 15000
    } as any)

    await expect(network.getLongLink()).resolves.toBe(
      'https://www.xiaohongshu.com/explore/65abc123?xsec_token=redirect-token'
    )

    expect(state.executeSafeAxiosRequest).toHaveBeenCalledTimes(2)

    expect(state.executeSafeAxiosRequest.mock.calls[0]?.[0]).toMatchObject({
      method: 'head',
      responseType: 'text',
      url: 'http://xhslink.com/o/37BoQX0cLV9'
    })

    expect(state.executeSafeAxiosRequest.mock.calls[1]?.[0]).toMatchObject({
      method: 'get',
      responseType: 'stream',
      url: 'http://xhslink.com/o/37BoQX0cLV9'
    })
    expect(state.executeSafeAxiosRequest.mock.calls[1]?.[0]?.headers).toMatchObject({
      Range: 'bytes=0-0'
    })

    expect(stream.on).toHaveBeenCalledWith('error', expect.any(Function))
    expect(stream.destroy).toHaveBeenCalledOnce()
  })
})
