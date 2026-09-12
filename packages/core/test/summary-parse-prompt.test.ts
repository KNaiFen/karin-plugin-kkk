import { describe, expect, it } from 'vitest'

import {
  getSummarySystemPrompt,
  hasVisualSummaryContent,
  MULTIMODAL_SUMMARY_SYSTEM_PROMPT,
  TEXT_ONLY_SUMMARY_SYSTEM_PROMPT
} from '../src/module/summaryParse/prompt'
import type { SummaryInput } from '../src/module/summaryParse/types'

const createInput = (overrides: Partial<SummaryInput> = {}): SummaryInput => ({
  platform: 'weibo',
  platformLabel: '微博',
  title: '标题',
  author: '作者',
  summary: '摘要',
  blocks: [{ type: 'text', text: '纯文本内容' }],
  videos: [],
  stats: [],
  meta: [],
  asrTexts: [],
  videoFrames: [],
  rawSource: {
    mode: 'video',
    platform: 'weibo',
    platformLabel: '微博',
    title: '标题',
    url: 'https://weibo.com/1',
    videos: []
  },
  ...overrides
})

describe('summary parse prompt resolution', () => {
  it('returns the fixed text-only system prompt when inputs contain no visual content', () => {
    const inputs = [createInput()]

    expect(hasVisualSummaryContent(inputs)).toBe(false)
    expect(getSummarySystemPrompt(inputs)).toBe(TEXT_ONLY_SUMMARY_SYSTEM_PROMPT)
    expect(getSummarySystemPrompt(inputs)).toContain('你是中文资讯编辑')
    expect(getSummarySystemPrompt(inputs)).not.toContain('视频抽帧图片')
    expect(getSummarySystemPrompt(inputs)).toContain('平台字幕和视频转写')
  })

  it('returns the fixed multimodal system prompt when inputs contain image blocks', () => {
    const inputs = [
      createInput({
        blocks: [
          { type: 'text', text: '正文' },
          { type: 'image', url: 'https://example.com/image.jpg', alt: '配图' }
        ]
      })
    ]

    expect(hasVisualSummaryContent(inputs)).toBe(true)
    expect(getSummarySystemPrompt(inputs)).toBe(MULTIMODAL_SUMMARY_SYSTEM_PROMPT)
    expect(getSummarySystemPrompt(inputs)).toContain('你是中文资讯编辑')
    expect(getSummarySystemPrompt(inputs)).toContain('视频抽帧图片')
    expect(getSummarySystemPrompt(inputs)).toContain('不要把抽帧当作逐帧解说任务')
  })

  it('returns the fixed multimodal system prompt when inputs contain extracted video frames', () => {
    const inputs = [
      createInput({
        videoFrames: [
          {
            title: '视频标题',
            images: [
              { type: 'image', url: 'file:///tmp/frame-1.jpg', alt: '抽帧一' }
            ]
          }
        ]
      })
    ]

    expect(hasVisualSummaryContent(inputs)).toBe(true)
    expect(getSummarySystemPrompt(inputs)).toBe(MULTIMODAL_SUMMARY_SYSTEM_PROMPT)
  })

  it('keeps the two built-in prompts fixed and independent from model names or custom text', () => {
    expect(TEXT_ONLY_SUMMARY_SYSTEM_PROMPT).toContain('你是中文资讯编辑')
    expect(MULTIMODAL_SUMMARY_SYSTEM_PROMPT).toContain('你是中文资讯编辑')
    expect(TEXT_ONLY_SUMMARY_SYSTEM_PROMPT).not.toContain('{{model}}')
    expect(MULTIMODAL_SUMMARY_SYSTEM_PROMPT).not.toContain('{{model}}')
    expect(TEXT_ONLY_SUMMARY_SYSTEM_PROMPT).not.toContain('结构化内容编辑')
    expect(MULTIMODAL_SUMMARY_SYSTEM_PROMPT).not.toContain('结构化内容编辑')
  })

  it('switches to a web-search-aware prompt only when explicitly enabled', () => {
    const inputs = [createInput()]

    expect(getSummarySystemPrompt(inputs)).toBe(TEXT_ONLY_SUMMARY_SYSTEM_PROMPT)
    expect(getSummarySystemPrompt(inputs, { webSearchEnabled: false })).toBe(TEXT_ONLY_SUMMARY_SYSTEM_PROMPT)
    expect(getSummarySystemPrompt(inputs, { webSearchEnabled: true })).toContain('仅在必要时可使用联网搜索')
    expect(getSummarySystemPrompt(inputs, { webSearchEnabled: true })).not.toContain('不得补背景、查外部信息、猜测或胡编')
  })
})
