import { describe, expect, it, vi } from 'vitest'

const sharedBaseHeaders = {
  Accept: '*/*',
  'User-Agent': 'Unit Test UA'
}

vi.mock('node-karin', () => ({
  default: {},
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    mark: vi.fn(),
    warn: vi.fn()
  },
  Message: class {},
  segment: {}
}))

vi.mock('@/module/utils', () => ({
  baseHeaders: sharedBaseHeaders,
  Common: {
    tempDri: {
      video: '/tmp/',
      images: '/tmp/'
    },
    registerVideoPreview: vi.fn(),
    markVideoPreviewRemoved: vi.fn(),
    removeFile: vi.fn(async () => true)
  },
  compressVideo: vi.fn(),
  extractTotalBytesFromHeaders: vi.fn(() => 0),
  getMediaDuration: vi.fn(async () => 1),
  Networks: class {}
}))

vi.mock('@/module/utils/Config', () => ({
  Config: {
    app: {
      removeCache: true
    },
    upload: {},
    pushlist: {
      douyin: [],
      bilibili: []
    }
  }
}))

vi.mock('../src/module/utils/amagiClient', () => ({
  AmagiBase: class {
    amagi = {}
  }
}))

vi.mock('../src/module/utils/LongTaskCompletionNotify', () => ({
  recordLongTaskCompletionAnchor: vi.fn()
}))

const { Base } = await import('../src/module/utils/Base')

describe('Base headers isolation', () => {
  it('creates an isolated headers object for each instance', () => {
    const first = new Base({} as any)
    first.headers!.Referer = 'https://www.bilibili.com/'
    first.headers!.Cookie = 'bili-cookie'

    const second = new Base({} as any)

    expect(first.headers).not.toBe(sharedBaseHeaders)
    expect(second.headers).not.toBe(sharedBaseHeaders)
    expect(second.headers).not.toBe(first.headers)
    expect(sharedBaseHeaders).not.toHaveProperty('Referer')
    expect(sharedBaseHeaders).not.toHaveProperty('Cookie')
    expect(second.headers).not.toHaveProperty('Referer')
    expect(second.headers).not.toHaveProperty('Cookie')
  })
})
