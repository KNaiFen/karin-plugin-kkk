import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  sendMaster: vi.fn(),
  render: vi.fn(),
  getBot: vi.fn(() => ({
    getFriendList: vi.fn(async () => [{ userId: '10001' }])
  })),
  commandHandler: null as any
}))

vi.mock('node-karin', () => {
  const karin = {
    getBot: (...args: unknown[]) => state.getBot(...args),
    sendMaster: (...args: unknown[]) => state.sendMaster(...args),
    command: (_pattern: RegExp, handler: any) => {
      state.commandHandler = handler
      return { handler }
    },
    logger: {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
  }
  return {
    default: karin,
    logger: karin.logger
  }
})

vi.mock('@/module/utils/ErrorHandler', () => ({
  wrapWithErrorHandler: (fn: any) => fn
}))

vi.mock('@/module/utils/Render', () => ({
  Render: (...args: unknown[]) => state.render(...args)
}))

await import('../src/apps/qrlogin')

describe('qrlogin disable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a disabled notice and does not render or send qr payloads', async () => {
    const reply = vi.fn(async () => true)

    const result = await state.commandHandler({
      selfId: 'bot-1',
      userId: '10001',
      isGroup: false,
      reply
    })

    expect(result).toBe(true)
    expect(reply).toHaveBeenCalledWith(expect.stringContaining('暂时停用'))
    expect(state.render).not.toHaveBeenCalled()
    expect(state.sendMaster).not.toHaveBeenCalled()
  })
})
