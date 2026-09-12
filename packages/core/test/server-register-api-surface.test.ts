import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const routerUses: Array<{ path: string, handler: unknown }> = []
  const appUses: Array<{ path: string, handler: unknown }> = []

  const createRouter = () => ({
    use: vi.fn((path: string, handler: unknown) => {
      routerUses.push({ path, handler })
      return undefined
    }),
    get: vi.fn()
  })

  return {
    routerUses,
    appUses,
    router: createRouter(),
    createRouter,
    karinAppUse: vi.fn((path: string, handler: unknown) => {
      appUses.push({ path, handler })
      return undefined
    }),
    checkPort: vi.fn(() => Promise.resolve(true)),
    logger: {
      error: vi.fn()
    },
    amagiClientFactory: vi.fn(),
    createBilibiliRoutes: vi.fn(),
    createDouyinRoutes: vi.fn(),
    serverFactory: vi.fn(() => ({
      use: vi.fn(),
      listen: vi.fn(() => ({
        on: vi.fn()
      }))
    }))
  }
})

vi.mock('node-karin', () => ({
  app: {
    use: (...args: unknown[]) => state.karinAppUse(...args)
  },
  checkPort: (...args: unknown[]) => state.checkPort(...args),
  logger: state.logger
}))

vi.mock('@ikenxuan/amagi', () => ({
  default: (...args: unknown[]) => state.amagiClientFactory(...args),
  createBilibiliRoutes: (...args: unknown[]) => state.createBilibiliRoutes(...args),
  createDouyinRoutes: (...args: unknown[]) => state.createDouyinRoutes(...args)
}))

vi.mock('node-karin/express', () => {
  const factory = (() => state.serverFactory()) as any
  factory.Router = () => state.router
  factory.json = vi.fn(() => 'json-middleware')
  factory.urlencoded = vi.fn(() => 'urlencoded-middleware')
  return {
    default: factory
  }
})

vi.mock('cors', () => ({
  default: vi.fn(() => 'cors-middleware')
}))

vi.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: vi.fn(() => 'proxy-middleware')
}))

vi.mock('../src/module/server/api', () => ({
  apiRouter: 'api-router'
}))

vi.mock('../src/module/server/router', () => ({
  getVideoRouter: vi.fn(),
  videoPreviewEventsRouter: vi.fn(),
  videoStreamRouter: vi.fn()
}))

vi.mock('../src/module/utils/Config', () => ({
  Config: {
    app: {},
    cookies: {}
  }
}))

describe('server register api surface', () => {
  it('only mounts the plugin-owned /v1 api surface under /api/kkk', async () => {
    await import('../src/module/server/Register')

    expect(state.karinAppUse).toHaveBeenCalledWith('/api/kkk', state.router)
    expect(state.routerUses.map(item => item.path)).toContain('/v1')
    expect(state.routerUses.map(item => item.path)).not.toContain('/amagi/api/bilibili')
    expect(state.routerUses.map(item => item.path)).not.toContain('/amagi/api/douyin')
    expect(state.amagiClientFactory).not.toHaveBeenCalled()
    expect(state.createBilibiliRoutes).not.toHaveBeenCalled()
    expect(state.createDouyinRoutes).not.toHaveBeenCalled()
  })
})
