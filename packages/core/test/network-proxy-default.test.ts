import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  axiosCreate: vi.fn(() => ({
    interceptors: {
      response: {
        use: vi.fn()
      }
    }
  })),
  normalizeAxiosProxy: vi.fn(() => false),
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

vi.mock('node-karin/axios', () => ({
  default: {
    create: state.axiosCreate
  },
  AxiosError: class MockAxiosError extends Error {}
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
  normalizeAxiosProxy: (...args: unknown[]) => state.normalizeAxiosProxy(...args)
}))

const { Network } = await import('../src/module/utils/Network/Network')

describe('Network proxy defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('disables ambient proxy env usage when request proxy switch is off', () => {
    new Network({
      url: 'https://example.com/file.mp4'
    } as any)

    expect(state.normalizeAxiosProxy).toHaveBeenCalledWith({
      switch: false
    })
    expect(state.axiosCreate).toHaveBeenCalledWith(expect.objectContaining({
      proxy: false
    }))
  })
})
