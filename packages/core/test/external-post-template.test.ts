import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('ExternalPostCard image layout', () => {
  const source = readFileSync(
    resolve(import.meta.dirname, '../../template/src/components/platforms/other/ExternalPost.tsx'),
    'utf8'
  )

  it('uses full-width inline image classes instead of contain shrinkage', () => {
    expect(source).toContain(".external-post-inline-image {\n      margin: 0;\n      width: 100%;\n    }")
    expect(source).toContain("className='external-post-inline-image overflow-hidden rounded-[8px] bg-surface border border-border'")
    expect(source).toContain("className='block w-full h-auto'")
    expect(source).not.toContain("className='w-full max-h-[860px] object-contain'")
  })

  it('renders a single complete header and leaves pagination UI to the renderer', () => {
    expect(source).toContain("<div className='text-[32px] font-semibold text-foreground/45'>内容来源</div>")
    expect(source).toContain("<span className='truncate'>{getHost(data.url)}</span>")
    expect(source).toContain("<span>作者</span>")
    expect(source).not.toContain('const isContinuationPage')
    expect(source).not.toContain('PaginationBadge')
    expect(source).not.toContain('第 {pagination.pageIndex} / {pagination.pageCount} 页')
  })

  it('keeps github badge images inline and uses a high-contrast link color', () => {
    expect(source).toContain('.external-post-richtext a img {')
    expect(source).toContain('display: inline-block;')
    expect(source).toContain('vertical-align: middle;')
    expect(source).toContain('margin: 0 0.18em 0.12em 0;')
    expect(source).toContain("const linkColor = '#0969da'")
    expect(source).toContain("style={{ backgroundColor: '#ffffff' }}")
    expect(source).toContain("'--external-post-link': linkColor")
    expect(source).toContain('color: var(--external-post-link);')
  })
})
