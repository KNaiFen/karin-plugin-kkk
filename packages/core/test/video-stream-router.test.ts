import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const stream = {
    pipe: vi.fn(),
    on: vi.fn()
  }

  return {
    stream,
    statSync: vi.fn(() => ({ size: 100 })),
    createReadStream: vi.fn(() => stream),
    validateVideoRequest: vi.fn(() => '/tmp/demo.mp4')
  }
})

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => JSON.stringify({ name: 'karin-plugin-kkk', version: '0.0.0-test' })),
    statSync: (...args: unknown[]) => state.statSync(...args),
    createReadStream: (...args: unknown[]) => state.createReadStream(...args)
  }
}))

vi.mock('node-karin', () => ({
  createNotFoundResponse: vi.fn(),
  logger: {
    error: vi.fn()
  }
}))

vi.mock('template/server', () => ({
  renderVideoPreviewPage: vi.fn()
}))

vi.mock('../src/module/utils', () => ({
  Common: {
    validateVideoRequest: (...args: unknown[]) => state.validateVideoRequest(...args)
  }
}))

vi.mock('../src/module/utils/Config', () => ({
  Config: {
    app: {
      removeCache: false
    }
  }
}))

const { videoStreamRouter } = await import('../src/module/server/router')

const createResponse = () => {
  const response = {
    headersSent: false,
    writableEnded: false,
    setHeader: vi.fn(),
    status: vi.fn(),
    send: vi.fn(),
    writeHead: vi.fn(),
    end: vi.fn()
  }
  response.status.mockReturnValue(response)
  return response
}

const requestRange = (range?: string) => {
  const response = createResponse()
  videoStreamRouter({
    params: { filename: 'demo.mp4' },
    headers: range === undefined ? {} : { range }
  } as any, response as any, vi.fn())
  return response
}

describe('videoStreamRouter byte ranges', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.statSync.mockReturnValue({ size: 100 })
    state.validateVideoRequest.mockReturnValue('/tmp/demo.mp4')
  })

  it.each([
    ['bytes=10-19', 10, 19, 10],
    ['bytes=90-', 90, 99, 10],
    ['bytes=-10', 90, 99, 10],
    ['bytes=90-999', 90, 99, 10],
    ['bytes=-999', 0, 99, 100]
  ])('serves a valid single range %s', (range, start, end, contentLength) => {
    const response = requestRange(range)

    expect(state.createReadStream).toHaveBeenCalledWith('/tmp/demo.mp4', { start, end })
    expect(response.writeHead).toHaveBeenCalledWith(206, {
      'Content-Range': `bytes ${start}-${end}/100`,
      'Accept-Ranges': 'bytes',
      'Content-Length': contentLength,
      'Content-Type': 'video/mp4'
    })
    expect(state.stream.pipe).toHaveBeenCalledWith(response)
  })

  it.each([
    'bytes=abc-1',
    'bytes=1-abc',
    'bytes=-',
    'bytes=-0',
    'bytes=0-1,3-4',
    'bytes=100-',
    'bytes=20-10',
    'bytes=9007199254740992-',
    'items=0-1'
  ])('rejects an invalid or unsatisfiable range %s', (range) => {
    const response = requestRange(range)

    expect(response.setHeader).toHaveBeenCalledWith('Content-Range', 'bytes */100')
    expect(response.setHeader).toHaveBeenCalledWith('Accept-Ranges', 'bytes')
    expect(response.status).toHaveBeenCalledWith(416)
    expect(response.send).toHaveBeenCalledWith('Requested range not satisfiable')
    expect(state.createReadStream).not.toHaveBeenCalled()
    expect(response.writeHead).not.toHaveBeenCalled()
  })

  it('rejects every range for an empty file', () => {
    state.statSync.mockReturnValue({ size: 0 })

    const response = requestRange('bytes=-1')

    expect(response.setHeader).toHaveBeenCalledWith('Content-Range', 'bytes */0')
    expect(response.status).toHaveBeenCalledWith(416)
    expect(state.createReadStream).not.toHaveBeenCalled()
  })
})
