import { describe, expect, it } from 'vitest'

import {
  MULTIMODAL_TRANSCRIPT_ORIGINAL_MARKDOWN_SYSTEM_PROMPT,
  MULTIMODAL_TRANSCRIPT_ORIGINAL_SYSTEM_PROMPT,
  TEXT_ONLY_TRANSCRIPT_ORIGINAL_MARKDOWN_SYSTEM_PROMPT,
  TEXT_ONLY_TRANSCRIPT_ORIGINAL_SYSTEM_PROMPT,
  getTranscriptOriginalSystemPrompt
} from '../src/module/transcriptOriginal/prompt'

describe('transcript original prompt', () => {
  it('uses the fixed text-only transcript prompt when inputs contain no visual content', () => {
    expect(TEXT_ONLY_TRANSCRIPT_ORIGINAL_SYSTEM_PROMPT).toContain('转写原文整理')
    expect(TEXT_ONLY_TRANSCRIPT_ORIGINAL_SYSTEM_PROMPT).toContain('不是总结')
    expect(TEXT_ONLY_TRANSCRIPT_ORIGINAL_SYSTEM_PROMPT).toContain('只改明显识别错误和格式问题')
    expect(TEXT_ONLY_TRANSCRIPT_ORIGINAL_SYSTEM_PROMPT).toContain('语义不确定时保守保留')
    expect(TEXT_ONLY_TRANSCRIPT_ORIGINAL_SYSTEM_PROMPT).toContain('不补写未出现的信息')
    expect(getTranscriptOriginalSystemPrompt([{ platform: 'weibo' } as any])).toBe(TEXT_ONLY_TRANSCRIPT_ORIGINAL_SYSTEM_PROMPT)
  })

  it('uses the fixed multimodal transcript prompt when inputs contain images', () => {
    expect(MULTIMODAL_TRANSCRIPT_ORIGINAL_SYSTEM_PROMPT).toContain('转写原文整理')
    expect(MULTIMODAL_TRANSCRIPT_ORIGINAL_SYSTEM_PROMPT).toContain('图片和视频抽帧')
    expect(MULTIMODAL_TRANSCRIPT_ORIGINAL_SYSTEM_PROMPT).toContain('不补写未出现的信息')
    expect(getTranscriptOriginalSystemPrompt([{ platform: 'weibo', blocks: [{ type: 'image', url: 'https://example.com/1.jpg' }] } as any])).toBe(MULTIMODAL_TRANSCRIPT_ORIGINAL_SYSTEM_PROMPT)
  })

  it('uses the markdown text-only prompt when markdown output is enabled', () => {
    expect(TEXT_ONLY_TRANSCRIPT_ORIGINAL_MARKDOWN_SYSTEM_PROMPT).toContain('Markdown')
    expect(TEXT_ONLY_TRANSCRIPT_ORIGINAL_MARKDOWN_SYSTEM_PROMPT).toContain('禁止代码围栏')
    expect(TEXT_ONLY_TRANSCRIPT_ORIGINAL_MARKDOWN_SYSTEM_PROMPT).toContain('禁止分析性章节')
    expect(TEXT_ONLY_TRANSCRIPT_ORIGINAL_MARKDOWN_SYSTEM_PROMPT).toContain('语义不确定时保守保留')
    expect(getTranscriptOriginalSystemPrompt([{ platform: 'weibo' } as any], {
      markdownOutput: true
    })).toBe(TEXT_ONLY_TRANSCRIPT_ORIGINAL_MARKDOWN_SYSTEM_PROMPT)
  })

  it('uses the markdown multimodal prompt when markdown output is enabled for visual inputs', () => {
    expect(MULTIMODAL_TRANSCRIPT_ORIGINAL_MARKDOWN_SYSTEM_PROMPT).toContain('Markdown')
    expect(MULTIMODAL_TRANSCRIPT_ORIGINAL_MARKDOWN_SYSTEM_PROMPT).toContain('图片和视频抽帧')
    expect(MULTIMODAL_TRANSCRIPT_ORIGINAL_MARKDOWN_SYSTEM_PROMPT).toContain('禁止代码围栏')
    expect(MULTIMODAL_TRANSCRIPT_ORIGINAL_MARKDOWN_SYSTEM_PROMPT).toContain('禁止分析性章节')
    expect(getTranscriptOriginalSystemPrompt([{ platform: 'weibo', blocks: [{ type: 'image', url: 'https://example.com/1.jpg' }] } as any], {
      markdownOutput: true
    })).toBe(MULTIMODAL_TRANSCRIPT_ORIGINAL_MARKDOWN_SYSTEM_PROMPT)
  })

  it('forbids any task preface before the transcript body', () => {
    expect(TEXT_ONLY_TRANSCRIPT_ORIGINAL_SYSTEM_PROMPT).toContain('只能输出整理后的正文')
    expect(TEXT_ONLY_TRANSCRIPT_ORIGINAL_SYSTEM_PROMPT).toContain('禁止输出任何任务说明')
    expect(TEXT_ONLY_TRANSCRIPT_ORIGINAL_SYSTEM_PROMPT).toContain('输出的第一行必须直接进入')
    expect(TEXT_ONLY_TRANSCRIPT_ORIGINAL_SYSTEM_PROMPT).toContain('不要解释原因')

    expect(MULTIMODAL_TRANSCRIPT_ORIGINAL_SYSTEM_PROMPT).toContain('只能输出整理后的正文')
    expect(MULTIMODAL_TRANSCRIPT_ORIGINAL_SYSTEM_PROMPT).toContain('禁止输出任何任务说明')
    expect(MULTIMODAL_TRANSCRIPT_ORIGINAL_MARKDOWN_SYSTEM_PROMPT).toContain('只能输出整理后的正文')
    expect(MULTIMODAL_TRANSCRIPT_ORIGINAL_MARKDOWN_SYSTEM_PROMPT).toContain('输出的第一行必须直接进入')
  })
})
