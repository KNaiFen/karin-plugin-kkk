import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  render: vi.fn(),
  serverRender: vi.fn(async ({ request }: { request: { templateType: string, templateName: string } }) => ({
    success: true,
    htmlPath: `/tmp/karin-html/kkk/${request.templateType}/${request.templateName.replace(/\//g, '-')}.html`
  }))
}))

const watermarkState = vi.hoisted(() => ({
  embedWatermark: vi.fn((buffer: Buffer) => buffer)
}))

const appConfig = vi.hoisted(() => ({
  RemoveWatermark: true,
  RenderWaitTime: 60,
  multiPageRender: true,
  multiPageTriggerAspectRatio: 3,
  multiPageMaxAspectRatio: 2.2,
  renderScale: 100,
  renderImageFormat: 'auto' as const,
  renderImageQuality: 95
}))

const createRgbaBuffer = (): Buffer => {
  const rgba = Buffer.alloc(2 * 2 * 4)
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 24
    rgba[i + 1] = 112
    rgba[i + 2] = 218
    rgba[i + 3] = 255
  }
  return rgba
}

const createJpegBase64 = (): string => {
  return Buffer.from(jpeg.encode({
    data: createRgbaBuffer(),
    width: 2,
    height: 2
  }, 95).data).toString('base64')
}

const createPngBase64 = (): string => {
  const png = new PNG({ width: 2, height: 2 })
  createRgbaBuffer().copy(png.data)
  return PNG.sync.write(png).toString('base64')
}

const createTallJpegBase64 = (): string => {
  const width = 100
  const height = 360
  const rgba = Buffer.alloc(width * height * 4, 255)

  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i + 3] = 255
  }

  const fillRect = (top: number, bottom: number, left: number, right: number, color: [number, number, number]) => {
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const idx = ((y * width) + x) * 4
        rgba[idx] = color[0]
        rgba[idx + 1] = color[1]
        rgba[idx + 2] = color[2]
      }
    }
  }

  fillRect(20, 90, 12, 88, [32, 32, 32])
  fillRect(185, 280, 8, 92, [64, 64, 64])

  return Buffer.from(jpeg.encode({
    data: rgba,
    width,
    height
  }, 95).data).toString('base64')
}

const createLargeImageCrossingBreakBase64 = (): string => {
  const width = 100
  const height = 360
  const rgba = Buffer.alloc(width * height * 4, 255)

  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i + 3] = 255
  }

  const fillRect = (top: number, bottom: number, left: number, right: number, color: [number, number, number]) => {
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const idx = ((y * width) + x) * 4
        rgba[idx] = color[0]
        rgba[idx + 1] = color[1]
        rgba[idx + 2] = color[2]
      }
    }
  }

  fillRect(80, 198, 6, 94, [56, 56, 56])

  return Buffer.from(jpeg.encode({
    data: rgba,
    width,
    height
  }, 95).data).toString('base64')
}

const createLargeImageWithThinWhiteGapBase64 = (): string => {
  const width = 100
  const height = 420
  const rgba = Buffer.alloc(width * height * 4, 255)

  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i + 3] = 255
  }

  const fillRect = (top: number, bottom: number, left: number, right: number, color: [number, number, number]) => {
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const idx = ((y * width) + x) * 4
        rgba[idx] = color[0]
        rgba[idx + 1] = color[1]
        rgba[idx + 2] = color[2]
      }
    }
  }

  fillRect(80, 206, 6, 94, [56, 56, 56])
  fillRect(188, 189, 6, 94, [255, 255, 255])

  return Buffer.from(jpeg.encode({
    data: rgba,
    width,
    height
  }, 95).data).toString('base64')
}

const createTitleGapTrapBase64 = (): string => {
  const width = 100
  const height = 420
  const rgba = Buffer.alloc(width * height * 4, 255)

  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i + 3] = 255
  }

  const fillRect = (top: number, bottom: number, left: number, right: number, color: [number, number, number]) => {
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const idx = ((y * width) + x) * 4
        rgba[idx] = color[0]
        rgba[idx + 1] = color[1]
        rgba[idx + 2] = color[2]
      }
    }
  }

  fillRect(18, 62, 10, 90, [48, 48, 48])
  fillRect(120, 198, 6, 94, [70, 70, 70])

  return Buffer.from(jpeg.encode({
    data: rgba,
    width,
    height
  }, 95).data).toString('base64')
}

const findBottomRightInkBounds = (image: { file: string, width?: number, height?: number }) => {
  const buffer = Buffer.from(image.file.replace(/^base64:\/\//, ''), 'base64')
  const decoded = jpeg.decode(buffer, { useTArray: true })
  const startX = Math.floor(decoded.width * 0.6)
  const startY = Math.floor(decoded.height * 0.6)
  let minX = decoded.width
  let minY = decoded.height
  let maxX = -1
  let maxY = -1

  for (let y = startY; y < decoded.height; y++) {
    for (let x = startX; x < decoded.width; x++) {
      const idx = ((y * decoded.width) + x) * 4
      const r = decoded.data[idx]
      const g = decoded.data[idx + 1]
      const b = decoded.data[idx + 2]
      if (r > 245 && g > 245 && b > 245) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  return {
    width: maxX >= minX ? (maxX - minX + 1) : 0,
    height: maxY >= minY ? (maxY - minY + 1) : 0
  }
}

const collectPageBreaks = (images: Array<{ height?: number }>): number[] => {
  const pageBreaks: number[] = []
  let offset = 0

  for (const image of images.slice(0, -1)) {
    offset += image.height ?? 0
    pageBreaks.push(offset)
  }

  return pageBreaks
}

vi.mock('node-karin', () => ({
  db: {
    get: vi.fn()
  },
  karinPathHtml: '/tmp/karin-html',
  logger: {
    debug: vi.fn(),
    warn: vi.fn()
  },
  render: {
    render: (...args: unknown[]) => state.render(...args)
  },
  segment: {
    image: (file: string, options?: Record<string, unknown>) => ({ type: 'image', ...options, file })
  }
}))

vi.mock('node-karin/root', () => ({
  karinPathHtml: '/tmp/karin-html'
}))

vi.mock('template/server', () => ({
  default: (...args: unknown[]) => state.serverRender(...args)
}))

vi.mock('../src/module/utils/Render/wm', () => ({
  embedWatermark: (...args: [Buffer, string]) => watermarkState.embedWatermark(...args)
}))

vi.mock('@/module', () => ({
  Common: {
    useDarkTheme: vi.fn(() => false)
  },
  Root: {
    karinVersion: '1.0.0-test',
    pluginName: 'karin-plugin-kkk',
    pluginPath: '/tmp/karin-plugin-kkk',
    pluginVersion: '0.0.0-test'
  }
}))

vi.mock('@/module/utils/Config', () => ({
  Config: {
    app: appConfig
  }
}))

const { Common } = await import('@/module')
const { Render, applyWatermarkToImages, getRenderNavigationOptions, planDomPaginationPages } = await import('../src/module/utils/Render')

describe('Render options', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(Common.useDarkTheme).mockReturnValue(false)
    state.render.mockResolvedValue(createJpegBase64())
    watermarkState.embedWatermark.mockImplementation((buffer: Buffer) => buffer)
    appConfig.RemoveWatermark = true
    appConfig.RenderWaitTime = 60
    appConfig.multiPageRender = true
    appConfig.multiPageTriggerAspectRatio = 3
    appConfig.multiPageMaxAspectRatio = 2.2
    appConfig.renderScale = 100
    appConfig.renderImageFormat = 'auto'
    appConfig.renderImageQuality = 95
  })

  it('keeps renderer multiPage disabled because smart pagination is handled after rendering', async () => {
    await Render(
      {
        bot: {
          account: { selfId: 'bot-1', name: 'bot' },
          adapter: { protocol: 'onebot' }
        }
      } as any,
      'bilibili/dynamic/DYNAMIC_TYPE_DRAW',
      {
        share_url: 'https://t.bilibili.com/1'
      } as any,
      { multiPage: false }
    )

    expect(state.render).toHaveBeenCalledWith(expect.objectContaining({
      multiPage: false,
      selector: '#container'
    }))
  })

  it('uses configured jpeg quality for large social platform render cards', async () => {
    const event = {
      bot: {
        account: { selfId: 'bot-1', name: 'bot' },
        adapter: { protocol: 'onebot' }
      }
    } as any
    appConfig.renderImageQuality = 88

    await Render(event, 'bilibili/dynamic/DYNAMIC_TYPE_DRAW', { share_url: 'https://t.bilibili.com/1' } as any)
    await Render(event, 'douyin/video-work', { share_url: 'https://www.douyin.com/video/1' } as any)
    await Render(event, 'xiaohongshu/noteInfo', { share_url: 'https://www.xiaohongshu.com/explore/1' } as any)
    await Render(event, 'other/external-post', {
      platform: { key: 'zhihu', label: '知乎', accentColor: '#1772f6' },
      title: '标题',
      author: { name: '作者' },
      summary: '正文',
      url: 'https://example.com',
      images: [],
      stats: [],
      meta: []
    } as any)

    for (const call of state.render.mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({
        type: 'jpeg',
        quality: 88,
        omitBackground: false
      }))
    }
  })

  it('keeps non-target render cards as png', async () => {
    await Render(
      {
        bot: {
          account: { selfId: 'bot-1', name: 'bot' },
          adapter: { protocol: 'onebot' }
        }
      } as any,
      'other/help',
      {} as any
    )

    expect(state.render.mock.calls[0][0]).toEqual(expect.objectContaining({
      type: 'png',
      omitBackground: true
    }))
    expect(state.render.mock.calls[0][0]).not.toHaveProperty('quality')
  })

  it('allows forcing png output globally for render cards', async () => {
    appConfig.renderImageFormat = 'png'

    await Render(
      {
        bot: {
          account: { selfId: 'bot-1', name: 'bot' },
          adapter: { protocol: 'onebot' }
        }
      } as any,
      'other/external-post',
      {
        platform: { key: 'zhihu', label: '知乎', accentColor: '#1772f6' },
        title: '标题',
        author: { name: '作者' },
        summary: '正文',
        url: 'https://example.com',
        images: [],
        stats: [],
        meta: []
      } as any
    )

    expect(state.render.mock.calls[0][0]).toEqual(expect.objectContaining({
      type: 'png',
      omitBackground: false
    }))
    expect(state.render.mock.calls[0][0]).not.toHaveProperty('quality')
  })

  it('normalizes jpeg-target render outputs to actual jpg buffers', async () => {
    state.render.mockResolvedValue(createPngBase64())

    const [image] = await Render(
      {
        bot: {
          account: { selfId: 'bot-1', name: 'bot' },
          adapter: { protocol: 'onebot' }
        }
      } as any,
      'other/external-post',
      {
        platform: { key: 'zhihu', label: '知乎', accentColor: '#1772f6' },
        title: '标题',
        author: { name: '作者' },
        summary: '正文',
        url: 'https://example.com',
        images: [],
        stats: [],
        meta: []
      } as any,
      { multiPage: false }
    )

    const buffer = Buffer.from(image.file.replace(/^base64:\/\//, ''), 'base64')
    expect(buffer.subarray(0, 3)).toEqual(Buffer.from([0xFF, 0xD8, 0xFF]))
    expect(image.name).toMatch(/\.jpg$/)
  })

  it('keeps jpeg-target render outputs as jpg buffers after watermarking', async () => {
    state.render.mockResolvedValue(createPngBase64())
    appConfig.RemoveWatermark = false
    watermarkState.embedWatermark.mockReturnValue(Buffer.from(createPngBase64(), 'base64'))

    const [image] = await Render(
      {
        bot: {
          account: { selfId: 'bot-1', name: 'bot' },
          adapter: { protocol: 'onebot' }
        }
      } as any,
      'other/external-post',
      {
        platform: { key: 'zhihu', label: '知乎', accentColor: '#1772f6' },
        title: '标题',
        author: { name: '作者' },
        summary: '正文',
        url: 'https://example.com',
        images: [],
        stats: [],
        meta: []
      } as any,
      { multiPage: false }
    )

    const buffer = Buffer.from(image.file.replace(/^base64:\/\//, ''), 'base64')
    expect(buffer.subarray(0, 3)).toEqual(Buffer.from([0xFF, 0xD8, 0xFF]))
    expect(image.name).toMatch(/\.jpg$/)
  })

  it('preserves jpg buffers when applying watermark to pre-rendered jpg images', async () => {
    appConfig.RemoveWatermark = false
    watermarkState.embedWatermark.mockReturnValue(Buffer.from(createPngBase64(), 'base64'))

    const images = await Render(
      {
        bot: {
          account: { selfId: 'bot-1', name: 'bot' },
          adapter: { protocol: 'onebot' }
        }
      } as any,
      'other/external-post',
      {
        platform: { key: 'zhihu', label: '知乎', accentColor: '#1772f6' },
        title: '标题',
        author: { name: '作者' },
        summary: '正文',
        url: 'https://example.com',
        images: [],
        stats: [],
        meta: []
      } as any,
      { multiPage: false, skipWatermark: true }
    )

    const [watermarked] = applyWatermarkToImages(images, {
      bot: {
        account: { selfId: 'bot-2', name: 'push-bot' }
      }
    } as any)

    const buffer = Buffer.from(watermarked.file.replace(/^base64:\/\//, ''), 'base64')
    expect(buffer.subarray(0, 3)).toEqual(Buffer.from([0xFF, 0xD8, 0xFF]))
    expect(watermarked.name).toMatch(/\.jpg$/)
  })

  it('splits very tall generic render cards into safe pages with page aspect ratio <= 2.2', async () => {
    state.render.mockResolvedValue(createTallJpegBase64())

    const images = await Render(
      {
        bot: {
          account: { selfId: 'bot-1', name: 'bot' },
          adapter: { protocol: 'onebot' }
        }
      } as any,
      'bilibili/dynamic/DYNAMIC_TYPE_DRAW',
      {
        share_url: 'https://t.bilibili.com/1'
      } as any
    )

    expect(images).toHaveLength(2)
    expect(images[0].width).toBe(100)
    expect(images[0].height).toBeGreaterThanOrEqual(170)
    expect(images[0].height).toBeLessThanOrEqual(184)

    for (const image of images) {
      expect(image.height).toBeLessThanOrEqual(Math.floor(image.width * 2.2))
      expect(image.name).toMatch(/\.jpg$/)
    }

    const badgeBounds = findBottomRightInkBounds(images[0])
    expect(badgeBounds.width).toBeGreaterThanOrEqual(26)
    expect(badgeBounds.height).toBeGreaterThanOrEqual(18)
  })

  it('smart-paginates external-post in Render so long cards use the shared safe splitter', async () => {
    state.render.mockResolvedValue(createTallJpegBase64())

    const images = await Render(
      {
        bot: {
          account: { selfId: 'bot-1', name: 'bot' },
          adapter: { protocol: 'onebot' }
        }
      } as any,
      'other/external-post',
      {
        platform: { key: 'weibo', label: '微博', accentColor: '#e6162d' },
        title: '图文微博',
        author: { name: '作者' },
        summary: '正文',
        url: 'https://weibo.com/example',
        images: [],
        stats: [],
        meta: []
      } as any
    )

    expect(images).toHaveLength(2)
    for (const image of images) {
      expect(image.height).toBeLessThanOrEqual(Math.floor((image.width ?? 0) * 2.2))
    }
  })

  it('keeps page boundaries outside nested avoid-split media blocks', () => {
    const pages = planDomPaginationPages({
      x: 0,
      y: 0,
      width: 1440,
      height: 4732,
      blocks: [
        { top: 200, bottom: 2729, avoidSplit: false, explicit: false },
        { top: 2729, bottom: 4005, avoidSplit: true, explicit: true },
        { top: 2777, bottom: 3957, avoidSplit: true, explicit: false },
        { top: 4005, bottom: 4732, avoidSplit: false, explicit: false }
      ]
    }, {
      enabled: true,
      triggerAspectRatio: 3,
      maxAspectRatio: 2.2
    })

    expect(pages).toEqual([
      { top: 0, height: 2729 },
      { top: 2729, height: 2003 }
    ])
  })

  it('uses domcontentloaded navigation for external-post render cards', () => {
    expect(getRenderNavigationOptions('other/external-post')).toEqual({
      waitUntil: 'domcontentloaded',
      timeout: appConfig.RenderWaitTime * 1000
    })
    expect(getRenderNavigationOptions('bilibili/dynamic/DYNAMIC_TYPE_DRAW')).toEqual({
      waitUntil: 'load',
      timeout: appConfig.RenderWaitTime * 1000
    })
  })

  it('passes domcontentloaded navigation options to external-post renderer', async () => {
    await Render(
      {
        bot: {
          account: { selfId: 'bot-1', name: 'bot' },
          adapter: { protocol: 'onebot' }
        }
      } as any,
      'other/external-post',
      {
        platform: { key: 'weibo', label: '微博', accentColor: '#e6162d' },
        title: '图文微博',
        author: { name: '作者' },
        summary: '正文',
        url: 'https://weibo.com/example',
        images: [],
        stats: [],
        meta: []
      } as any
    )

    expect(state.render.mock.calls[0][0]).toEqual(expect.objectContaining({
      pageGotoParams: {
        waitUntil: 'domcontentloaded',
        timeout: appConfig.RenderWaitTime * 1000
      }
    }))
  })

  it('forces external-post render cards to stay in light theme even when the global theme is dark', async () => {
    vi.mocked(Common.useDarkTheme).mockReturnValue(true)

    await Render(
      {
        bot: {
          account: { selfId: 'bot-1', name: 'bot' },
          adapter: { protocol: 'onebot' }
        }
      } as any,
      'other/external-post',
      {
        platform: { key: 'weibo', label: '微博', accentColor: '#e6162d' },
        title: '图文微博',
        author: { name: '作者' },
        summary: '正文',
        url: 'https://weibo.com/example',
        images: [],
        stats: [],
        meta: []
      } as any
    )

    expect(state.serverRender.mock.calls[0][0]).toEqual(expect.objectContaining({
      request: expect.objectContaining({
        useDarkTheme: false,
        data: expect.objectContaining({
          useDarkTheme: false
        })
      })
    }))
  })

  it('skips smart pagination when the caller disables it for a specific render', async () => {
    state.render.mockResolvedValue(createTallJpegBase64())

    const images = await Render(
      {
        bot: {
          account: { selfId: 'bot-1', name: 'bot' },
          adapter: { protocol: 'onebot' }
        }
      } as any,
      'bilibili/dynamic/DYNAMIC_TYPE_DRAW',
      {
        share_url: 'https://t.bilibili.com/1'
      } as any,
      { multiPage: false }
    )

    expect(images).toHaveLength(1)
  })

  it('skips smart pagination when the global app setting is disabled', async () => {
    state.render.mockResolvedValue(createTallJpegBase64())
    appConfig.multiPageRender = false

    const images = await Render(
      {
        bot: {
          account: { selfId: 'bot-1', name: 'bot' },
          adapter: { protocol: 'onebot' }
        }
      } as any,
      'bilibili/dynamic/DYNAMIC_TYPE_DRAW',
      {
        share_url: 'https://t.bilibili.com/1'
      } as any
    )

    expect(images).toHaveLength(1)
  })

  it('prefers the blank band after a large image block when it still fits within page height', async () => {
    state.render.mockResolvedValue(createLargeImageCrossingBreakBase64())

    const images = await Render(
      {
        bot: {
          account: { selfId: 'bot-1', name: 'bot' },
          adapter: { protocol: 'onebot' }
        }
      } as any,
      'bilibili/dynamic/DYNAMIC_TYPE_DRAW',
      {
        share_url: 'https://t.bilibili.com/1'
      } as any
    )

    expect(images.length).toBeGreaterThan(1)
    const pageBreaks = collectPageBreaks(images)
    expect(pageBreaks).not.toContainEqual(expect.toSatisfy((value: number) => value > 80 && value < 198))
    for (const image of images) {
      expect(image.height).toBeLessThanOrEqual(Math.floor((image.width ?? 0) * 2.2))
    }
  })

  it('does not treat a thin white gap inside an image block as a safe page break when a real blank band exists later', async () => {
    state.render.mockResolvedValue(createLargeImageWithThinWhiteGapBase64())

    const images = await Render(
      {
        bot: {
          account: { selfId: 'bot-1', name: 'bot' },
          adapter: { protocol: 'onebot' }
        }
      } as any,
      'bilibili/dynamic/DYNAMIC_TYPE_DRAW',
      {
        share_url: 'https://t.bilibili.com/1'
      } as any
    )

    expect(images.length).toBeGreaterThan(1)
    const pageBreaks = collectPageBreaks(images)
    expect(pageBreaks).not.toContainEqual(expect.toSatisfy((value: number) => value > 80 && value < 206))
    for (const image of images) {
      expect(image.height).toBeLessThanOrEqual(Math.floor((image.width ?? 0) * 2.2))
    }
  })

  it('does not jump back to a title gap when a later blank band still fits within page height', async () => {
    state.render.mockResolvedValue(createTitleGapTrapBase64())

    const images = await Render(
      {
        bot: {
          account: { selfId: 'bot-1', name: 'bot' },
          adapter: { protocol: 'onebot' }
        }
      } as any,
      'bilibili/dynamic/DYNAMIC_TYPE_DRAW',
      {
        share_url: 'https://t.bilibili.com/1'
      } as any
    )

    expect(images.length).toBeGreaterThan(1)
    const pageBreaks = collectPageBreaks(images)
    expect(pageBreaks).not.toContainEqual(expect.toSatisfy((value: number) => value > 62 && value < 198))
  })
})
