import crypto from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  now: 1710000000000,
  loggerWarn: vi.fn(),
  loggerError: vi.fn()
}))

vi.mock('node-karin', () => ({
  createBadRequestResponse: (res: any, message: string) => res.status(400).json({ success: false, message }),
  createServerErrorResponse: (res: any, message: string) => res.status(500).json({ success: false, message }),
  logger: {
    warn: (...args: unknown[]) => state.loggerWarn(...args),
    error: (...args: unknown[]) => state.loggerError(...args)
  }
}))

const realDateNow = Date.now

const encodeSignature = (hex: string): string => {
  const offset = Array.from(hex).map(char => String.fromCharCode(char.charCodeAt(0) + 5)).join('')
  const asHex = Buffer.from(offset, 'utf8').toString('hex')
  const reversed = asHex.split('').reverse().join('')
  const base64Inner = Buffer.from(reversed, 'utf8').toString('base64')
  const urlEncoded = encodeURIComponent(base64Inner)
  return Buffer.from(urlEncoded, 'utf8').toString('base64')
}

const buildRequest = (overrides: Partial<any> = {}) => {
  const method = overrides.method ?? 'POST'
  const body = overrides.body ?? { hello: 'world' }
  const timestamp = String(overrides.timestamp ?? state.now)
  const nonce = overrides.nonce ?? 'nonce-1'
  const token = overrides.token ?? 'token-a'
  const url = overrides.originalUrl ?? '/api/kkk/v1/config'
  const signatureString = `${method}|${url}|${method === 'GET' ? '' : JSON.stringify(body)}|${timestamp}|${nonce}`
  const signature = encodeSignature(crypto.createHmac('sha256', token).update(signatureString).digest('hex'))

  return {
    method,
    originalUrl: url,
    body,
    headers: {
      authorization: `Bearer ${token}`,
      'x-signature': signature,
      'x-timestamp': timestamp,
      'x-nonce': nonce,
      ...(overrides.headers ?? {})
    }
  }
}

const createResponse = () => ({
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
})

describe('signature replay protection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Date.now = vi.fn(() => state.now)
  })

  afterEach(() => {
    Date.now = realDateNow
  })

  it('rejects replaying the same nonce for the same token within the window', async () => {
    const { signatureVerificationMiddleware } = await import('../src/module/server/auth')
    const next = vi.fn()

    const req = buildRequest()
    const firstRes = createResponse()
    signatureVerificationMiddleware(req as any, firstRes as any, next)

    expect(next).toHaveBeenCalledTimes(1)

    const secondRes = createResponse()
    signatureVerificationMiddleware(buildRequest() as any, secondRes as any, vi.fn())

    expect(secondRes.statusCode).toBe(400)
    expect(secondRes.payload?.message).toContain('nonce')
  })

  it('allows reusing the same nonce with a different token', async () => {
    const { signatureVerificationMiddleware } = await import('../src/module/server/auth')

    signatureVerificationMiddleware(buildRequest() as any, createResponse() as any, vi.fn())

    const next = vi.fn()
    signatureVerificationMiddleware(buildRequest({ token: 'token-b' }) as any, createResponse() as any, next)

    expect(next).toHaveBeenCalledTimes(1)
  })

  it('allows the same nonce again after the ttl expires', async () => {
    const { signatureVerificationMiddleware } = await import('../src/module/server/auth')

    signatureVerificationMiddleware(buildRequest() as any, createResponse() as any, vi.fn())

    state.now += 5 * 60 * 1000 + 1
    const next = vi.fn()
    signatureVerificationMiddleware(buildRequest({ timestamp: state.now }) as any, createResponse() as any, next)

    expect(next).toHaveBeenCalledTimes(1)
  })

  it('does not consume nonce entries when signature verification fails', async () => {
    const { signatureVerificationMiddleware } = await import('../src/module/server/auth')

    const badReq = buildRequest({
      headers: {
        authorization: 'Bearer token-a',
        'x-signature': encodeSignature('deadbeef'),
        'x-timestamp': String(state.now),
        'x-nonce': 'nonce-bad'
      }
    })

    const badRes = createResponse()
    signatureVerificationMiddleware(badReq as any, badRes as any, vi.fn())
    expect(badRes.statusCode).toBe(400)

    const next = vi.fn()
    signatureVerificationMiddleware(buildRequest({ nonce: 'nonce-bad' }) as any, createResponse() as any, next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('does not log sensitive inputs when signature verification fails', async () => {
    const { signatureVerificationMiddleware } = await import('../src/module/server/auth')
    const method = 'POST'
    const originalUrl = 'https://api.example.test/api/private/../config?credential=query-secret-marker'
    const body = { secret: 'body-secret-marker' }
    const token = 'token-secret-marker'
    const nonce = 'nonce-secret-marker'
    const actualSignature = 'actual-signature-marker'
    const signatureString = `${method}|${originalUrl}|${JSON.stringify(body)}|${state.now}|${nonce}`
    const expectedSignature = crypto.createHmac('sha256', token).update(signatureString).digest('hex')
    const encodedActualSignature = encodeSignature(actualSignature)
    const req = buildRequest({
      method,
      originalUrl,
      body,
      token,
      nonce,
      headers: {
        'x-signature': encodedActualSignature
      }
    })

    const res = createResponse()
    signatureVerificationMiddleware(req as any, res as any, vi.fn())

    expect(res.statusCode).toBe(400)
    expect(state.loggerWarn).toHaveBeenCalledTimes(1)

    const logOutput = state.loggerWarn.mock.calls
      .flat()
      .map(value => typeof value === 'string' ? value : JSON.stringify(value))
      .join(' ')

    expect(logOutput).toContain('method=POST')
    expect(logOutput).toContain('path="/api/config"')
    expect(logOutput).toContain('reason=signature_mismatch')
    expect(logOutput).not.toContain(body.secret)
    expect(logOutput).not.toContain(JSON.stringify(body))
    expect(logOutput).not.toContain(expectedSignature)
    expect(logOutput).not.toContain(actualSignature)
    expect(logOutput).not.toContain(encodedActualSignature)
    expect(logOutput).not.toContain(token)
    expect(logOutput).not.toContain(nonce)
    expect(logOutput).not.toContain('query-secret-marker')
  })

  it('rejects non-numeric timestamps before signature verification', async () => {
    const { signatureVerificationMiddleware } = await import('../src/module/server/auth')

    const res = createResponse()
    signatureVerificationMiddleware(buildRequest({ timestamp: 'not-a-number' }) as any, res as any, vi.fn())

    expect(res.statusCode).toBe(400)
    expect(res.payload?.message).toContain('时间戳')
  })
})
