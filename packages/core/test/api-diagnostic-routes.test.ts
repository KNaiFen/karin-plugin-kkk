import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const routes: Array<{ method: 'get' | 'post' | 'use', path: string }> = []
  const router = {
    get: vi.fn((path: string) => {
      routes.push({ method: 'get', path })
    }),
    put: vi.fn((path: string) => {
      routes.push({ method: 'post', path })
    }),
    patch: vi.fn((path: string) => {
      routes.push({ method: 'post', path })
    }),
    post: vi.fn((path: string) => {
      routes.push({ method: 'post', path })
    }),
    use: vi.fn((path: string) => {
      routes.push({ method: 'use', path })
    })
  }

  return {
    routes,
    router,
    authMiddleware: vi.fn(),
    signatureVerificationMiddleware: vi.fn(),
    createParseByUrlHandler: vi.fn((platform: string) => `handler:${platform}`),
    createSimulateHandlerByUrlHandler: vi.fn((platform: string) => `simulate:${platform}`)
  }
})

vi.mock('node-karin', () => ({
  authMiddleware: (...args: unknown[]) => state.authMiddleware(...args)
}))

vi.mock('node-karin/express', () => ({
  default: {
    Router: () => state.router
  }
}))

vi.mock('../src/module/server/auth', () => ({
  signatureVerificationMiddleware: (...args: unknown[]) => state.signatureVerificationMiddleware(...args)
}))

vi.mock('../src/platform/douyin/api', () => ({
  douyinApiRouter: 'douyin-router'
}))

vi.mock('../src/platform/bilibili/api', () => ({
  bilibiliApiRouter: 'bilibili-router'
}))

vi.mock('../src/module/server/api/bots', () => ({
  getBotGroups: vi.fn(),
  getBots: vi.fn(),
  getGroupsBatch: vi.fn()
}))

vi.mock('../src/module/server/api/config', () => ({
  getAllConfig: vi.fn(),
  getConfigModule: vi.fn(),
  patchConfigItem: vi.fn(),
  updateAllConfig: vi.fn(),
  updateConfigModule: vi.fn()
}))

vi.mock('../src/module/server/api/authCompat', () => ({
  writeAuthCompatibilityMiddleware: vi.fn()
}))

vi.mock('../src/module/server/api/groups', () => ({
  getGroups: vi.fn()
}))

vi.mock('../src/module/server/api/link', () => ({
  resolveLink: vi.fn()
}))

vi.mock('../src/module/server/api/schema', () => ({
  getFullSchema: vi.fn(),
  getModuleSchemaApi: vi.fn()
}))

vi.mock('../src/module/server/api/diagnosticParseByUrl', () => ({
  DIAGNOSTIC_PARSE_BY_URL_PLATFORMS: [
    'douyin',
    'bilibili',
    'tiktok',
    'kuaishou',
    'xiaohongshu',
    'heybox',
    'x',
    'github',
    'zhihu',
    'tieba',
    'wechat',
    'weibo'
  ],
  createParseByUrlHandler: (...args: unknown[]) => state.createParseByUrlHandler(...args),
  createSimulateHandlerByUrlHandler: (...args: unknown[]) => state.createSimulateHandlerByUrlHandler(...args)
}))

describe('diagnostic api routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    state.routes.length = 0
  })

  it('registers parse-by-url endpoints for every supported platform', async () => {
    await import('../src/module/server/api/index')

    const postRoutes = state.routes
      .filter(route => route.method === 'post')
      .map(route => route.path)

    expect(postRoutes).toEqual(expect.arrayContaining([
      '/platforms/douyin/parse-by-url',
      '/platforms/bilibili/parse-by-url',
      '/platforms/tiktok/parse-by-url',
      '/platforms/kuaishou/parse-by-url',
      '/platforms/xiaohongshu/parse-by-url',
      '/platforms/heybox/parse-by-url',
      '/platforms/x/parse-by-url',
      '/platforms/github/parse-by-url',
      '/platforms/zhihu/parse-by-url',
      '/platforms/tieba/parse-by-url',
      '/platforms/wechat/parse-by-url',
      '/platforms/weibo/parse-by-url'
    ]))
    expect(state.createParseByUrlHandler).toHaveBeenCalledTimes(12)
  })

  it('registers simulate-handler-by-url endpoints for every supported platform', async () => {
    await import('../src/module/server/api/index')

    const postRoutes = state.routes
      .filter(route => route.method === 'post')
      .map(route => route.path)

    expect(postRoutes).toEqual(expect.arrayContaining([
      '/platforms/douyin/simulate-handler-by-url',
      '/platforms/bilibili/simulate-handler-by-url',
      '/platforms/tiktok/simulate-handler-by-url',
      '/platforms/kuaishou/simulate-handler-by-url',
      '/platforms/xiaohongshu/simulate-handler-by-url',
      '/platforms/heybox/simulate-handler-by-url',
      '/platforms/x/simulate-handler-by-url',
      '/platforms/github/simulate-handler-by-url',
      '/platforms/zhihu/simulate-handler-by-url',
      '/platforms/tieba/simulate-handler-by-url',
      '/platforms/wechat/simulate-handler-by-url',
      '/platforms/weibo/simulate-handler-by-url'
    ]))
    expect(state.createSimulateHandlerByUrlHandler).toHaveBeenCalledTimes(12)
  })
})
