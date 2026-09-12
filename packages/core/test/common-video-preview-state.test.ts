import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  existsSync: vi.fn(() => true)
}))

vi.mock('node:fs', () => ({
  default: {
    existsSync: (...args: unknown[]) => state.existsSync(...args)
  }
}))

const { VideoPreviewStore } = await import('../src/module/utils/commonTools/videoPreviewState')

describe('VideoPreviewStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    state.existsSync.mockReturnValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('registers previews and marks them removed by filename', () => {
    const store = new VideoPreviewStore()
    const info = store.register('/tmp/demo.mp4', true, 1000)

    expect(info).toMatchObject({
      filename: 'demo.mp4',
      filePath: '/tmp/demo.mp4',
      removeCache: true
    })
    expect(store.get('demo.mp4')).toMatchObject({
      filename: 'demo.mp4'
    })

    const removed = store.markRemoved('demo.mp4')
    expect(removed?.removedAt).toBe(Date.now())
    expect(removed?.cleanupAt).toBe(Date.now() + 5 * 60 * 1000)
  })

  it('keeps removed previews briefly, then prunes them', () => {
    const store = new VideoPreviewStore()
    store.register('/tmp/expired.mp4', true, 1000)

    state.existsSync.mockReturnValue(false)
    vi.setSystemTime(new Date('2026-01-01T00:00:01.001Z'))

    expect(store.get('expired.mp4')).toMatchObject({
      filename: 'expired.mp4',
      removedAt: Date.now()
    })

    vi.setSystemTime(new Date(Date.now() + 5 * 60 * 1000 + 1))
    expect(store.get('expired.mp4')).toBeNull()
  })
})
