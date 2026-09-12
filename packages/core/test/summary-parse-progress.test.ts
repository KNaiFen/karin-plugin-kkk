import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    mark: vi.fn(),
    warn: vi.fn()
  }
}))

vi.mock('node-karin', () => ({
  logger: state.logger
}))

const {
  cleanupSummaryTaskProgress,
  createSummaryTaskProgress,
  endSummaryProgressTimer,
  startSummaryProgressTimer
} = await import('../src/module/summaryParse/progress')

describe('summary task progress lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-24T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('cleans only the requested task prefix and all of its pending timers', () => {
    const event = {
      bot: { account: { selfId: 'bot-1' } },
      isGroup: true,
      contact: { peer: 'group-1' },
      userId: 'user-1',
      sender: { nick: '用户' }
    } as any
    const cleanedTask = createSummaryTaskProgress(1, event, { businessName: '清理目标' })
    const activeTask = createSummaryTaskProgress(1, event, { businessName: '保留目标' })

    startSummaryProgressTimer({
      scope: 'task',
      stage: '处理中',
      taskId: cleanedTask.taskId,
      totalLinks: 1
    })
    startSummaryProgressTimer({
      scope: 'task',
      stage: '处理中',
      taskId: activeTask.taskId,
      totalLinks: 1
    })
    vi.advanceTimersByTime(250)

    cleanupSummaryTaskProgress(cleanedTask.taskId)
    endSummaryProgressTimer({
      scope: 'task',
      stage: '处理中',
      taskId: cleanedTask.taskId,
      totalLinks: 1
    })
    endSummaryProgressTimer({
      scope: 'task',
      stage: '处理中',
      taskId: activeTask.taskId,
      totalLinks: 1
    })

    const cleanedLine = state.logger.mark.mock.calls.at(-2)?.[0] as string
    const activeLine = state.logger.mark.mock.calls.at(-1)?.[0] as string
    expect(cleanedLine).not.toContain('清理目标')
    expect(cleanedLine).not.toContain('(250ms)')
    expect(activeLine).toContain('保留目标')
    expect(activeLine).toContain('(250ms)')

    cleanupSummaryTaskProgress(activeTask.taskId)
  })
})
