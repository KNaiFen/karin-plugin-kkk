import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  authMiddleware: vi.fn(),
  signatureVerificationMiddleware: vi.fn()
}))

vi.mock('node-karin', () => ({
  authMiddleware: (...args: unknown[]) => state.authMiddleware(...args)
}))

vi.mock('../src/module/server/auth', () => ({
  signatureVerificationMiddleware: (...args: unknown[]) => state.signatureVerificationMiddleware(...args)
}))

const { writeAuthCompatibilityMiddleware } = await import('../src/module/server/api/authCompat')

const createResponse = () => {
  const response = {
    statusCode: 200,
    payload: null as any,
    status (code: number) {
      this.statusCode = code
      return this
    },
    json (payload: any) {
      this.payload = payload
      return this
    }
  }

  return response
}

describe('config api auth compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes put config requests through the auth compatibility layer before signature verification', async () => {
    const next = vi.fn()
    state.authMiddleware.mockImplementation(async (req: any, _res: any, done: any) => {
      expect(req.method).toBe('POST')
      req.authCheckedMethod = req.method
      req.method = req.originalMethod
      done()
    })
    state.signatureVerificationMiddleware.mockImplementation((req: any, _res: any, done: any) => {
      expect(req.authCheckedMethod).toBe('POST')
      expect(req.method).toBe('PUT')
      done()
    })

    const req = {
      method: 'PUT',
      body: {},
      headers: {}
    }
    const res = createResponse()

    await writeAuthCompatibilityMiddleware(req, res, next)
    state.signatureVerificationMiddleware(req, res, next)

    expect(state.authMiddleware).toHaveBeenCalledTimes(1)
  })

  it('routes patch config requests through the auth compatibility layer before signature verification', async () => {
    const next = vi.fn()
    state.authMiddleware.mockImplementation(async (req: any, _res: any, done: any) => {
      expect(req.method).toBe('POST')
      req.authCheckedMethod = req.method
      req.method = req.originalMethod
      done()
    })
    state.signatureVerificationMiddleware.mockImplementation((req: any, _res: any, done: any) => {
      expect(req.authCheckedMethod).toBe('POST')
      expect(req.method).toBe('PATCH')
      done()
    })

    const req = {
      method: 'PATCH',
      body: {},
      headers: {}
    }
    const res = createResponse()

    await writeAuthCompatibilityMiddleware(req, res, next)
    state.signatureVerificationMiddleware(req, res, next)

    expect(state.authMiddleware).toHaveBeenCalledTimes(1)
  })
})
