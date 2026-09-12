import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSummaryCliActivity } from '../src/module/summaryParse/cliProgress'

describe('summary parse cli progress', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renders local ASR activity lines without the animated progress bar', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-22T00:00:00.000Z'))

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const activity = createSummaryCliActivity({
      icon: '📝',
      label: 'summary_parse_transcript_1782128102169_9tejbbtgsp6_0_0.wav',
      statusText: '本地 ASR 第 1/1 段',
      showActivityBar: false
    })

    vi.advanceTimersByTime(34500)
    activity.stop()

    expect(logSpy.mock.calls.at(-1)?.[0]).toBe(
      '📝  summary_parse_transcript_1782128102169_9tejbbtgsp6_0_0.wav: 本地 ASR 第 1/1 段 已耗时: 34s\r'
    )
  })
})
