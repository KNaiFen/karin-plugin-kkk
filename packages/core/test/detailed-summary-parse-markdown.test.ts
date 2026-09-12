import jpeg from 'jpeg-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  renderMarkdownHtml: vi.fn((markdownText: string) => `<article>${markdownText}</article>`),
  render: vi.fn(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    mark: vi.fn()
  }
}))

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

vi.mock('node:fs', () => ({
  default: {
    mkdirSync: (...args: unknown[]) => state.mkdirSync(...args),
    writeFileSync: (...args: unknown[]) => state.writeFileSync(...args),
    unlinkSync: (...args: unknown[]) => state.unlinkSync(...args)
  },
  mkdirSync: (...args: unknown[]) => state.mkdirSync(...args),
  writeFileSync: (...args: unknown[]) => state.writeFileSync(...args),
  unlinkSync: (...args: unknown[]) => state.unlinkSync(...args)
}))

vi.mock('@karinjs/md-html', () => ({
  markdown: (...args: unknown[]) => state.renderMarkdownHtml(...args)
}))

vi.mock('node-karin', () => ({
  render: {
    render: (...args: unknown[]) => state.render(...args)
  },
  logger: state.logger
}))

vi.mock('node-karin/root', () => ({
  karinPathHtml: '/tmp/karin-html'
}))

vi.mock('@/root', () => ({
  Root: {
    pluginName: 'karin-plugin-kkk'
  }
}))

const { renderDetailedSummaryMarkdownImages, stripMarkdownToPlainText, buildDetailedSummaryMarkdownRenderHtml } = await import('../src/module/detailedSummaryParse/markdown')

describe('detailed summary markdown helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.render.mockResolvedValue(createTallJpegBase64())
  })

  it('cleans markdown into readable plain text while preserving links, images and tables', () => {
    const plainText = stripMarkdownToPlainText([
      '# 总标题',
      '',
      '## 一、核心结论',
      '> 引用内容',
      '- **重点** [资料](https://example.com/doc)',
      '![配图](https://example.com/image.png)',
      '',
      '| 列1 | 列2 |',
      '| --- | --- |',
      '| A | B |',
      '',
      '```ts',
      'const answer = 42',
      '```'
    ].join('\n'))

    expect(plainText).toContain('总标题')
    expect(plainText).toContain('一、核心结论')
    expect(plainText).toContain('重点 资料（https://example.com/doc）')
    expect(plainText).toContain('配图（https://example.com/image.png）')
    expect(plainText).toContain('列1 | 列2')
    expect(plainText).toContain('A | B')
    expect(plainText).toContain('const answer = 42')
    expect(plainText).not.toContain('```')
    expect(plainText).not.toContain('**')
    expect(plainText).not.toContain('| --- | --- |')
  })

  it('applies the configured font size and paginates tall markdown screenshots with custom thresholds', async () => {
    const images = await renderDetailedSummaryMarkdownImages('# 标题\n\n## 一、核心结论', {
      fontSizePx: 18,
      multiPageEnabled: true,
      multiPageTriggerAspectRatio: 1.5,
      multiPageMaxAspectRatio: 1.8
    })

    expect(images.length).toBeGreaterThan(1)
    expect(state.renderMarkdownHtml).toHaveBeenCalledWith('# 标题\n\n## 一、核心结论', expect.any(Object))
    expect(state.writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('font-size: 18px'),
      'utf8'
    )
  })

  it('preserves strong and emphasis markup in the rendered html shell', () => {
    const html = buildDetailedSummaryMarkdownRenderHtml('这是 **内容** 和 *强调* 测试')

    expect(html).toContain('<article>这是 **内容** 和 *强调* 测试</article>')
    expect(html).toContain('font-weight: 700 !important;')
    expect(html).toContain('font-style: italic;')
  })
})
