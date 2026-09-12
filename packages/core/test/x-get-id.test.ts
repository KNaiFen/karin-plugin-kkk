import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  getLongLink: vi.fn(),
  networkCalls: [] as Array<Record<string, any>>,
  config: {
    request: {
      proxy: {
        switch: true,
        host: 'global-proxy.local',
        port: 7999,
        protocol: 'http',
        auth: {
          username: 'global-user',
          password: 'global-pass'
        }
      }
    },
    x: {
      proxy: {
        switch: true,
        host: '127.0.0.1',
        port: 7890,
        protocol: 'http',
        auth: {
          username: 'x-user',
          password: 'x-pass'
        }
      }
    }
  }
}))

vi.mock('node-karin', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  }
}))

vi.mock('@/module/utils/Config', () => ({
  Config: state.config
}))

vi.mock('@/module/utils/Networks', () => ({
  Networks: class {
    constructor (data: Record<string, any>) {
      state.networkCalls.push(data)
    }

    async getLongLink () {
      return await state.getLongLink()
    }
  }
}))

const { getXID } = await import('../src/platform/x/getID')

describe('X link id helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.networkCalls = []
  })

  it('uses the X-specific proxy when resolving short links', async () => {
    state.getLongLink.mockResolvedValue('https://x.com/cakedochi/status/2050564108114899179')

    await expect(getXID('https://t.co/demo')).resolves.toEqual({
      type: 'status',
      statusId: '2050564108114899179',
      screenName: 'cakedochi',
      url: 'https://x.com/cakedochi/status/2050564108114899179'
    })

    expect(state.networkCalls).toEqual([
      expect.objectContaining({
        url: 'https://t.co/demo',
        networkOptions: {
          proxy: {
            host: '127.0.0.1',
            port: 7890,
            protocol: 'http',
            auth: {
              username: 'x-user',
              password: 'x-pass'
            }
          }
        }
      })
    ])
  })
})
