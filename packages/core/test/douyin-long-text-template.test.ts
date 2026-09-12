import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DouyinLongTextWork } from '../../template/src/components/platforms/douyin/LongTextWork'
import { componentConfigs } from '../../template/src/config/config'
import { baseComponentConfigs } from '../../template/src/config/config-base'

const data = {
  text: '第一段原文\n\n**不是粗体** <strong>不是 HTML</strong>\n最后一段原文',
  work_type: '图集' as const,
  image_url: 'https://example.com/original-cover.jpg',
  create_time: '2026-07-26 08:00',
  author: {
    name: '长文作者',
    avatar: 'https://example.com/avatar.jpg',
    douyin_id: 'long-text-author',
    follower_count: 100,
    total_favorited: 200,
    following_count: 30
  },
  statistics: {
    digg_count: 1,
    comment_count: 2,
    collect_count: 3,
    share_count: 4
  },
  music: {
    author: '音乐作者',
    title: '作品原声'
  },
  share_url: 'https://www.douyin.com/note/7659034267062673515'
}

describe('Douyin long text work template', () => {
  it('registers the long text render path and validates its contract', () => {
    const baseDouyin = baseComponentConfigs.find(platform => platform.name === '抖音')
    const runtimeDouyin = componentConfigs.find(platform => platform.name === '抖音')
    const baseComponent = baseDouyin?.components.find(component => component.id === 'long-text-work')
    const runtimeComponent = runtimeDouyin?.components.find(component => component.id === 'long-text-work')

    expect(baseComponent?.componentPath).toBe('platforms/douyin/LongTextWork')
    expect(baseComponent?.exportName).toBe('DouyinLongTextWork')
    expect(runtimeComponent?.component).toBe(DouyinLongTextWork)
    expect(runtimeComponent?.validateData?.(data)).toBe(true)
    expect(runtimeComponent?.validateData?.({ ...data, text: undefined })).toBe(false)
  })

  it('renders full multiline content as plain paragraph text with pagination markers', () => {
    const html = renderToStaticMarkup(createElement(DouyinLongTextWork, {
      data,
      qrCodeDataUrl: 'data:image/png;base64,qr'
    }))

    expect(html).toContain('第一段原文')
    expect(html).toContain('**不是粗体**')
    expect(html).toContain('&lt;strong&gt;不是 HTML&lt;/strong&gt;')
    expect(html).toContain('最后一段原文')
    expect(html).toContain('图集作品')
    expect(html).toContain('data-page-block="true"')
    expect(html).toContain('data-page-avoid-split="true"')
    expect(html).not.toContain('阅读时长')
    expect(html).not.toContain('<strong>不是 HTML</strong>')
  })
})
