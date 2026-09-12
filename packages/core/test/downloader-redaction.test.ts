import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'

import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  executeSafeAxiosRequest: vi.fn()
}))

vi.mock('../src/module/utils/OutboundRequest', () => ({
  executeSafeAxiosRequest: (...args: unknown[]) => state.executeSafeAxiosRequest(...args)
}))

const { logger } = await import('node-karin')
const { Downloader } = await import('../src/module/utils/Network/Downloader')

const tempDirs: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  state.executeSafeAxiosRequest.mockReset()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('Downloader diagnostic redaction', () => {
  it('does not expose signed URLs, request headers, response headers, or error bodies', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kkk-downloader-redaction-'))
    tempDirs.push(outputDir)
    const filepath = path.join(outputDir, 'video.mp4')
    const signedUrl = 'https://cdn.example.com/private/video-id?token=url-secret&upsig=signed-secret'
    const requestHeaders = {
      Authorization: 'Bearer request-secret',
      Cookie: 'a1=cookie-secret',
      Referer: 'https://private.example/ref?token=referer-secret'
    }
    const responseBody = '{"token":"body-secret","message":"private upstream details"}'
    const logged: unknown[] = []

    for (const level of ['debug', 'warn', 'error'] as const) {
      vi.spyOn(logger, level).mockImplementation((...args: unknown[]) => {
        logged.push(args)
      })
    }

    state.executeSafeAxiosRequest.mockResolvedValue({
      response: {
        status: 403,
        headers: {
          'content-length': String(Buffer.byteLength(responseBody)),
          'set-cookie': 'session=response-header-secret',
          'x-signature': 'signature-header-secret'
        },
        data: Readable.from([responseBody])
      }
    })

    const downloader = new Downloader(
      vi.fn() as any,
      signedUrl,
      filepath,
      requestHeaders,
      1_000,
      0,
      { enabled: false }
    )

    const thrown = await downloader.download(vi.fn()).catch(error => error as Error)
    const diagnostics = JSON.stringify({
      logs: logged,
      error: {
        name: thrown.name,
        message: thrown.message,
        cause: (thrown as Error & { cause?: unknown }).cause
      }
    })

    expect(thrown.message).toContain('HTTP 403')
    expect(diagnostics).toContain('cdn.example.com')
    expect(diagnostics).toContain('sha256=')
    expect(diagnostics).toContain(`length=${responseBody.length}`)

    for (const secret of [
      'url-secret',
      'signed-secret',
      'request-secret',
      'cookie-secret',
      'referer-secret',
      'response-header-secret',
      'signature-header-secret',
      'body-secret',
      'private upstream details',
      '/private/video-id'
    ]) {
      expect(diagnostics).not.toContain(secret)
    }
  })
})
