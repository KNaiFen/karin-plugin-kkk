import { describe, expect, it } from 'vitest'

import {
  extractSummaryResolvedLinks,
  extractSummaryTrigger,
  stripResolvedLinksFromMessage
} from '../src/module/summaryParse/link'

describe('summary parse link helpers', () => {
  it('matches configured hash keywords and preserves the remaining text', () => {
    expect(extractSummaryTrigger('#总结 看看这个 https://www.zhihu.com/question/1/answer/2', ['总结', '解析总结'])).toEqual({
      keyword: '总结',
      rest: '看看这个 https://www.zhihu.com/question/1/answer/2'
    })

    expect(extractSummaryTrigger('#解析总结 标题 https://www.xiaoheihe.cn/app/bbs/link/4a9471857e40', ['总结', '解析总结'])).toEqual({
      keyword: '解析总结',
      rest: '标题 https://www.xiaoheihe.cn/app/bbs/link/4a9471857e40'
    })
  })

  it('matches hash keywords when the share text starts on the next line', () => {
    expect(extractSummaryTrigger(`#总结
9.23 Dhb:/ m@D.hB :6pm 06/20 跨世纪大型回旋镖，带英沦为印度殖民地 # 全球深度看抖音 # 零基础看懂全球 # 全球创作者计划 https://v.douyin.com/Wdv0YPvpaYg/ 复制此链接，打开Dou音搜索，直接观看视频！`, ['总结', '解析总结'])).toEqual({
      keyword: '总结',
      rest: '9.23 Dhb:/ m@D.hB :6pm 06/20 跨世纪大型回旋镖，带英沦为印度殖民地 # 全球深度看抖音 # 零基础看懂全球 # 全球创作者计划 https://v.douyin.com/Wdv0YPvpaYg/ 复制此链接，打开Dou音搜索，直接观看视频！'
    })
  })

  it('prefers the longer matching keyword when multiple trigger words coexist', () => {
    expect(extractSummaryTrigger('#转写原文 链接 https://weibo.com/1', ['原文', '转写原文'])).toEqual({
      keyword: '转写原文',
      rest: '链接 https://weibo.com/1'
    })
  })

  it('does not accept the legacy slash prefix', () => {
    expect(extractSummaryTrigger('/总结 https://www.zhihu.com/question/1/answer/2', ['总结'])).toBeNull()
    expect(extractSummaryTrigger('/详细总结 https://www.zhihu.com/question/1/answer/2', ['详细总结'])).toBeNull()
    expect(extractSummaryTrigger('/转写原文 https://weibo.com/1', ['转写原文'])).toBeNull()
  })

  it('extracts supported platform links from mixed share text', () => {
    const links = extractSummaryResolvedLinks('标题 https://www.zhihu.com/question/19550283/answer/122329247 还有这个 https://mp.weixin.qq.com/s/tAJ1B8ClOjQ41TWYJbIFTA 和微博 https://weibo.com/1980237443/Qeq3Dpa2b 以及仓库 https://github.com/openai/openai-node')

    expect(links).toEqual([
      {
        platform: 'zhihu',
        url: 'https://www.zhihu.com/question/19550283/answer/122329247'
      },
      {
        platform: 'wechat',
        url: 'https://mp.weixin.qq.com/s/tAJ1B8ClOjQ41TWYJbIFTA'
      },
      {
        platform: 'weibo',
        url: 'https://weibo.com/1980237443/Qeq3Dpa2b'
      },
      {
        platform: 'github',
        url: 'https://github.com/openai/openai-node'
      }
    ])
  })

  it('extracts new Xiaohongshu xhslink.cn short links', () => {
    const link = 'http://xhslink.cn/o/1wPOQ9a9RyI'

    expect(extractSummaryResolvedLinks(`小红书新短链 ${link}`)).toEqual([
      { platform: 'xiaohongshu', url: link }
    ])
  })

  it('skips truncated WeChat previews when a share card contains its full jump URL', () => {
    const previewLink = 'https://mp.weixin.qq.com/s/qYm19SUiC4Cid'
    const jumpUrl = 'https://mp.weixin.qq.com/s/qYm19SUiC4CidTfI3gsurA'
    const shareCard = JSON.stringify({
      meta: {
        news: {
          desc: `${previewLink}…`,
          jumpUrl
        }
      }
    })

    expect(extractSummaryResolvedLinks(shareCard)).toEqual([
      { platform: 'wechat', url: jumpUrl }
    ])
  })

  it('extracts multiple links from the same platform and bilibili BV tokens', () => {
    const links = extractSummaryResolvedLinks('先看 BV12uLq6dEdv 再看 https://www.bilibili.com/video/BV1xx411c7mD?p=1 还有 https://www.bilibili.com/video/BV1Q541167Qg')

    expect(links).toEqual([
      { platform: 'bilibili', url: 'BV12uLq6dEdv' },
      { platform: 'bilibili', url: 'https://www.bilibili.com/video/BV1xx411c7mD?p=1' },
      { platform: 'bilibili', url: 'https://www.bilibili.com/video/BV1Q541167Qg' }
    ])
  })

  it('keeps non-link share context after stripping recognized links', () => {
    const links = extractSummaryResolvedLinks('标题党 https://www.tiktok.com/@good.ball21/video/7643493503778966797?_r=1 这段文案也要保留')
    expect(stripResolvedLinksFromMessage('标题党 https://www.tiktok.com/@good.ball21/video/7643493503778966797?_r=1 这段文案也要保留', links)).toBe('标题党 这段文案也要保留')
  })
})

describe('summary parse input builder', () => {
  it('renders external-post content into ordered LLM text with images preserved as placeholders', async () => {
    const { buildSummaryInputFromExternalPostCard, renderSummaryInputForLLM, renderMergedSummaryInputsForLLM } = await import('../src/module/summaryParse/input')

    const input = buildSummaryInputFromExternalPostCard({
      platform: { key: 'zhihu', label: '知乎', accentColor: '#1772f6' },
      title: '标题',
      author: { name: '作者' },
      summary: '摘要',
      url: 'https://www.zhihu.com/question/1/answer/2',
      images: ['https://img.example/1.jpg'],
      content: [
        { type: 'text', text: '第一段' },
        { type: 'image', url: 'https://img.example/1.jpg', alt: '配图' },
        { type: 'html', html: '<p>第二段<strong>重点</strong></p>' }
      ],
      stats: [{ label: '赞同', value: '42' }],
      meta: [{ label: '类型', value: '回答' }]
    }, '用户附言')

    const rendered = renderSummaryInputForLLM(input)

    expect(rendered).toContain('平台：知乎')
    expect(rendered).toContain('标题：标题')
    expect(rendered).toContain('用户附带文案：用户附言')
    expect(rendered).toContain('1. 文本：第一段')
    expect(rendered).toContain('2. 图片：配图')
    expect(rendered).toContain('3. 文本：第二段 重点')
    expect(rendered).not.toContain('https://img.example/1.jpg')
    expect(rendered).not.toContain('https://www.zhihu.com/question/1/answer/2')

    const merged = renderMergedSummaryInputsForLLM([
      input,
      {
        ...input,
        platform: 'weibo',
        platformLabel: '微博',
        title: '第二条内容'
      }
    ])
    expect(merged).toContain('内容 1')
    expect(merged).toContain('内容 2')
    expect(merged).toContain('第二条内容')
  })
})
