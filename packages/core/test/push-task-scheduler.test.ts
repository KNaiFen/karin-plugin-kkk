import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type CapturedTask = {
  name: string
  cron: string
  handler: () => Promise<unknown>
  options: Record<string, unknown>
}

type CapturedCommand = {
  pattern: RegExp
  handler: (event: { msg: string }) => Promise<unknown>
}

const state = vi.hoisted(() => ({
  tasks: [] as CapturedTask[],
  commands: [] as CapturedCommand[],
  douyinAction: vi.fn(),
  bilibiliAction: vi.fn(),
  config: {
    douyin: {
      push: {
        switch: true,
        permission: 'master',
        cron: '*/10 * * * *',
        jitterSeconds: 120
      }
    },
    bilibili: {
      push: {
        switch: true,
        permission: 'master',
        cron: '*/10 * * * *',
        jitterSeconds: 90
      }
    },
    pushlist: {
      douyin: [],
      bilibili: []
    },
    cookies: {
      bilibili: ''
    }
  }
}))

vi.mock('node-karin', () => ({
  default: {
    task: (name: string, cron: string, handler: () => Promise<unknown>, options: Record<string, unknown>) => {
      state.tasks.push({ name, cron, handler, options })
      return { name, cron, handler, options }
    },
    command: (pattern: RegExp, handler: (event: { msg: string }) => Promise<unknown>) => {
      state.commands.push({ pattern, handler })
      return { pattern, handler }
    }
  },
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    mark: vi.fn(),
    warn: vi.fn()
  }
}))

vi.mock('@/module', () => ({
  Common: {
    removeFile: vi.fn()
  },
  Networks: class {
    getData = vi.fn()
  },
  Render: vi.fn()
}))

vi.mock('@/module/db', () => ({
  bilibiliDB: {
    addDynamicCache: vi.fn()
  },
  douyinDB: {
    updateGroupBotId: vi.fn()
  }
}))

vi.mock('@/module/utils/amagiClient', () => ({
  bilibiliFetcher: {
    fetchDynamicCard: vi.fn(),
    fetchUserCard: vi.fn()
  },
  douyinFetcher: {
    searchContent: vi.fn()
  }
}))

vi.mock('@/module/utils/Config', () => ({
  Config: state.config
}))

vi.mock('@/module/utils/ErrorHandler', () => ({
  wrapWithErrorHandler: (handler: unknown) => handler
}))

vi.mock('@/platform', () => ({
  Bilibilipush: class {
    action = state.bilibiliAction
    renderPushList = vi.fn()
    setting = vi.fn()
  },
  DouYinpush: class {
    action = state.douyinAction
    renderPushList = vi.fn()
    setting = vi.fn()
  },
  getBilibiliID: vi.fn(),
  getDouyinID: vi.fn()
}))

vi.mock('@/platform/douyin/workType', () => ({
  getWorkCoverUrl: vi.fn(),
  getWorkTypeInfo: vi.fn()
}))

const loadPushApp = async () => {
  vi.resetModules()
  state.tasks.length = 0
  state.commands.length = 0
  await import('../src/apps/push')
}

const taskByName = (name: string) => {
  const task = state.tasks.find(item => item.name === name)
  if (!task) throw new Error(`Missing task ${name}`)
  return task
}

const forcePushCommand = () => {
  const command = state.commands.find(item => item.pattern.test('#抖音强制推送'))
  if (!command) throw new Error('Missing force push command')
  return command
}

describe('scheduled push task jitter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.config.douyin.push.jitterSeconds = 120
    state.config.bilibili.push.jitterSeconds = 90
    state.douyinAction.mockResolvedValue(true)
    state.bilibiliAction.mockResolvedValue(true)
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('waits a random delay before running scheduled Douyin push', async () => {
    await loadPushApp()

    const run = taskByName('抖音推送').handler()
    await vi.advanceTimersByTimeAsync(59_999)
    expect(state.douyinAction).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await run

    expect(state.douyinAction).toHaveBeenCalledTimes(1)
  })

  it('waits a random delay before running scheduled Bilibili push', async () => {
    await loadPushApp()

    const run = taskByName('B站推送').handler()
    await vi.advanceTimersByTimeAsync(44_999)
    expect(state.bilibiliAction).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await run

    expect(state.bilibiliAction).toHaveBeenCalledTimes(1)
  })

  it('does not apply jitter to manual force push commands', async () => {
    await loadPushApp()

    await forcePushCommand().handler({ msg: '#抖音强制推送' })

    expect(state.douyinAction).toHaveBeenCalledTimes(1)
  })

  it('merges overlapping Douyin scheduled triggers into one serialized catch-up run', async () => {
    state.config.douyin.push.jitterSeconds = 0
    let finishFirstRun: (() => void) | undefined
    state.douyinAction
      .mockImplementationOnce(async () => await new Promise<void>(resolve => {
        finishFirstRun = resolve
      }))
      .mockResolvedValueOnce(true)

    await loadPushApp()
    const task = taskByName('抖音推送')
    const firstRun = task.handler()
    await vi.advanceTimersByTimeAsync(0)
    expect(state.douyinAction).toHaveBeenCalledTimes(1)

    await expect(task.handler()).resolves.toBe(true)
    expect(state.douyinAction).toHaveBeenCalledTimes(1)
    expect(task.options).not.toHaveProperty('type')

    finishFirstRun?.()
    await firstRun

    expect(state.douyinAction).toHaveBeenCalledTimes(2)
  })
})
