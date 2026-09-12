import { describe, expect, it } from 'vitest'

import {
  getDetailedSummarySystemPrompt,
  MULTIMODAL_DETAILED_SUMMARY_MARKDOWN_SYSTEM_PROMPT,
  MULTIMODAL_DETAILED_SUMMARY_SYSTEM_PROMPT,
  TEXT_ONLY_DETAILED_SUMMARY_MARKDOWN_SYSTEM_PROMPT,
  TEXT_ONLY_DETAILED_SUMMARY_SYSTEM_PROMPT } from '../src/module/detailedSummaryParse/prompt'

describe('detailed summary parse prompt', () => {
  it('uses the fixed text-only research prompt when inputs contain no visual content', () => {
    expect(TEXT_ONLY_DETAILED_SUMMARY_SYSTEM_PROMPT).toContain('你是中文研报编辑')
    expect(TEXT_ONLY_DETAILED_SUMMARY_SYSTEM_PROMPT).toContain('一、核心结论')
    expect(TEXT_ONLY_DETAILED_SUMMARY_SYSTEM_PROMPT).toContain('五、风险与不确定性')
    expect(TEXT_ONLY_DETAILED_SUMMARY_SYSTEM_PROMPT).toContain('不要输出 Markdown')
    expect(TEXT_ONLY_DETAILED_SUMMARY_SYSTEM_PROMPT).toContain('原内容中的观点不一定正确')
    expect(TEXT_ONLY_DETAILED_SUMMARY_SYSTEM_PROMPT).toContain('最终给出更稳妥、更接近事实的结论')
    expect(TEXT_ONLY_DETAILED_SUMMARY_SYSTEM_PROMPT).not.toContain('web_search')
    expect(getDetailedSummarySystemPrompt([{ platform: 'weibo' } as any])).toBe(TEXT_ONLY_DETAILED_SUMMARY_SYSTEM_PROMPT)
  })

  it('uses the fixed multimodal research prompt when inputs contain images', () => {
    expect(MULTIMODAL_DETAILED_SUMMARY_SYSTEM_PROMPT).toContain('你是中文研报编辑')
    expect(MULTIMODAL_DETAILED_SUMMARY_SYSTEM_PROMPT).toContain('图片和视频抽帧')
    expect(MULTIMODAL_DETAILED_SUMMARY_SYSTEM_PROMPT).toContain('交叉验证')
    expect(MULTIMODAL_DETAILED_SUMMARY_SYSTEM_PROMPT).toContain('视频中的观点不一定正确')
    expect(MULTIMODAL_DETAILED_SUMMARY_SYSTEM_PROMPT).toContain('最终给出更稳妥、更接近事实的结论')
    expect(getDetailedSummarySystemPrompt([{ platform: 'weibo', blocks: [{ type: 'image', url: 'https://example.com/1.jpg' }] } as any])).toBe(MULTIMODAL_DETAILED_SUMMARY_SYSTEM_PROMPT)
  })

  it('uses the markdown text-only prompt when markdown output is enabled', () => {
    expect(TEXT_ONLY_DETAILED_SUMMARY_MARKDOWN_SYSTEM_PROMPT).toContain('Markdown')
    expect(TEXT_ONLY_DETAILED_SUMMARY_MARKDOWN_SYSTEM_PROMPT).toContain('## 一、核心结论')
    expect(TEXT_ONLY_DETAILED_SUMMARY_MARKDOWN_SYSTEM_PROMPT).toContain('禁止输出总标题')
    expect(TEXT_ONLY_DETAILED_SUMMARY_MARKDOWN_SYSTEM_PROMPT).toContain('原内容中的观点不一定正确')
    expect(TEXT_ONLY_DETAILED_SUMMARY_MARKDOWN_SYSTEM_PROMPT).toContain('最终给出更稳妥、更接近事实的结论')
    expect(getDetailedSummarySystemPrompt([{ platform: 'weibo' } as any], {
      markdownOutput: true
    })).toBe(TEXT_ONLY_DETAILED_SUMMARY_MARKDOWN_SYSTEM_PROMPT)
  })

  it('uses the markdown multimodal prompt when markdown output is enabled for visual inputs', () => {
    expect(MULTIMODAL_DETAILED_SUMMARY_MARKDOWN_SYSTEM_PROMPT).toContain('Markdown')
    expect(MULTIMODAL_DETAILED_SUMMARY_MARKDOWN_SYSTEM_PROMPT).toContain('图片和视频抽帧')
    expect(MULTIMODAL_DETAILED_SUMMARY_MARKDOWN_SYSTEM_PROMPT).toContain('## 五、风险与不确定性')
    expect(MULTIMODAL_DETAILED_SUMMARY_MARKDOWN_SYSTEM_PROMPT).toContain('视频中的观点不一定正确')
    expect(MULTIMODAL_DETAILED_SUMMARY_MARKDOWN_SYSTEM_PROMPT).toContain('最终给出更稳妥、更接近事实的结论')
    expect(getDetailedSummarySystemPrompt([{ platform: 'weibo', blocks: [{ type: 'image', url: 'https://example.com/1.jpg' }] } as any], {
      markdownOutput: true
    })).toBe(MULTIMODAL_DETAILED_SUMMARY_MARKDOWN_SYSTEM_PROMPT)
  })
})
