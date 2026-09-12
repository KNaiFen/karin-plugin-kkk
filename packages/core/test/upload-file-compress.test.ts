import fs from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join, sep } = await import('node:path')
  return {
    tempDir: `${mkdtempSync(join(tmpdir(), 'kkk-upload-file-test-'))}${sep}`,
    calculateBitrate: vi.fn(),
    compressVideo: vi.fn(),
    getVideoFileSize: vi.fn(),
    getMediaDuration: vi.fn(),
    karinSendMsg: vi.fn(),
    contactGroup: vi.fn(),
    getBot: vi.fn(),
    loggerError: vi.fn(),
    loggerWarn: vi.fn()
  }
})

vi.mock('node-karin', () => ({
  default: {
    sendMsg: state.karinSendMsg,
    contactGroup: state.contactGroup,
    getBot: state.getBot
  },
  logger: {
    blue: (text: string) => text,
    debug: vi.fn(),
    error: state.loggerError,
    green: (text: string) => text,
    info: vi.fn(),
    mark: vi.fn(),
    warn: state.loggerWarn,
    yellow: (text: string) => text,
    chalk: {
      rgb: () => (text: string) => text
    }
  },
  Message: class {},
  segment: {
    reply: (messageId: string) => ({ type: 'reply', messageId }),
    text: (text: string) => ({ type: 'text', text }),
    video: (file: string) => ({ type: 'video', file })
  }
}))

vi.mock('@/module/utils/Config', () => ({
  Config: {
    app: {
      removeCache: false
    },
    upload: {
      compress: true,
      compressCustomArgs: '',
      compressPreset: 'cpu',
      compresstrigger: 1,
      compressvalue: 8,
      groupfilevalue: 100,
      usegroupfile: false,
      videoSendMode: 'file'
    }
  }
}))

vi.mock('@/module/utils', () => ({
  baseHeaders: {},
  Common: {
    calculateBitrate: (...args: unknown[]) => state.calculateBitrate(...args),
    getVideoFileSize: (...args: unknown[]) => state.getVideoFileSize(...args),
    markVideoPreviewRemoved: vi.fn(),
    registerVideoPreview: vi.fn(),
    removeFile: vi.fn(async () => true),
    tempDri: {
      video: state.tempDir
    }
  },
  compressVideo: (...args: unknown[]) => state.compressVideo(...args),
  extractTotalBytesFromHeaders: vi.fn(),
  getMediaDuration: (...args: unknown[]) => state.getMediaDuration(...args),
  Networks: class {}
}))

vi.mock('@/module/utils/Common', () => ({
  Common: {
    calculateBitrate: (...args: unknown[]) => state.calculateBitrate(...args),
    getVideoFileSize: (...args: unknown[]) => state.getVideoFileSize(...args),
    markVideoPreviewRemoved: vi.fn(),
    registerVideoPreview: vi.fn(),
    removeFile: vi.fn(async () => true),
    tempDri: {
      video: state.tempDir
    }
  }
}))

vi.mock('@/module/utils/FFmpeg', () => ({
  compressVideo: (...args: unknown[]) => state.compressVideo(...args),
  getMediaDuration: (...args: unknown[]) => state.getMediaDuration(...args)
}))

vi.mock('@/module/utils/Network/constants', () => ({
  BASE_HEADERS: {}
}))

vi.mock('@/module/utils/Network/helpers', () => ({
  extractTotalBytesFromHeaders: vi.fn()
}))

vi.mock('@/module/utils/Network/Network', () => ({
  Network: class {}
}))

vi.mock('../src/module/utils/amagiClient', () => ({
  AmagiBase: class {}
}))

const { Count, uploadFile } = await import('../src/module/utils/Base')

describe('uploadFile compression handling', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    await fs.promises.rm(state.tempDir, { recursive: true, force: true })
    await fs.promises.mkdir(state.tempDir, { recursive: true })
    state.karinSendMsg.mockResolvedValue({ messageId: 'compress-message' })
    state.contactGroup.mockImplementation((groupId: string) => ({ type: 'group', groupId }))
    state.getBot.mockReturnValue({ uploadFile: vi.fn() })
    state.calculateBitrate.mockReturnValue(800)
    state.getMediaDuration.mockResolvedValue(10)
  })

  afterEach(async () => {
    vi.useRealTimers()
    await fs.promises.rm(state.tempDir, { recursive: true, force: true })
  })

  it('falls back to the original file when compression does not produce an output file', async () => {
    const originalPath = `${state.tempDir}original.mp4`
    await fs.promises.writeFile(originalPath, 'original')
    state.compressVideo.mockResolvedValue(false)
    state.getVideoFileSize.mockImplementation(async (path: string) => {
      if (path !== originalPath) throw new Error(`unexpected compressed path: ${path}`)
      return 20
    })
    const event = {
      selfId: 'bot-1',
      contact: { type: 'group', groupId: '10000' },
      reply: vi.fn(async () => ({ messageId: 'video-message' }))
    } as any

    await expect(uploadFile(event, {
      filepath: originalPath,
      totalBytes: 20
    }, '')).resolves.toBe(true)

    expect(event.reply).toHaveBeenCalledWith({
      type: 'video',
      file: `file://${originalPath}`
    })
    const sentText = state.karinSendMsg.mock.calls
      .flatMap(call => Array.isArray(call[2]) ? call[2] : [call[2]])
      .map((item: any) => item?.text ?? '')
      .join('\n')
    expect(sentText).toContain('压缩失败')
  })

  it('uploads the compressed output when compression succeeds', async () => {
    const originalPath = `${state.tempDir}original-success.mp4`
    await fs.promises.writeFile(originalPath, 'original')
    state.compressVideo.mockImplementation(async ({ outputPath }: { outputPath: string }) => {
      await fs.promises.writeFile(outputPath, 'compressed')
      return true
    })
    state.getVideoFileSize.mockResolvedValue(6)
    const event = {
      selfId: 'bot-1',
      contact: { type: 'group', groupId: '10000' },
      reply: vi.fn(async () => ({ messageId: 'video-message' }))
    } as any

    await expect(uploadFile(event, {
      filepath: originalPath,
      totalBytes: 20
    }, '')).resolves.toBe(true)

    const uploadedVideo = event.reply.mock.calls.at(-1)?.[0]
    expect(uploadedVideo.file).toContain(`file://${state.tempDir}tmp_`)
    expect(uploadedVideo.file).not.toBe(`file://${originalPath}`)
  })

  it('calculates compression bitrate from the target compressed size', async () => {
    const originalPath = `${state.tempDir}original-bitrate.mp4`
    await fs.promises.writeFile(originalPath, 'original')
    state.compressVideo.mockResolvedValue(false)
    state.getVideoFileSize.mockResolvedValue(20)
    const event = {
      selfId: 'bot-1',
      contact: { type: 'group', groupId: '10000' },
      reply: vi.fn(async () => ({ messageId: 'video-message' }))
    } as any

    await uploadFile(event, {
      filepath: originalPath,
      totalBytes: 20
    }, '')

    expect(state.calculateBitrate).toHaveBeenCalledWith(8, 10)
    expect(state.compressVideo).toHaveBeenCalledWith(expect.objectContaining({
      audioBitrate: expect.any(Number),
      targetBitrate: expect.any(Number)
    }))
  })

  it('formats invalid counts as unavailable', () => {
    expect(Count(Number.NaN)).toBe('无法获取')
    expect(Count(Number.POSITIVE_INFINITY)).toBe('无法获取')
  })

  it('treats qqnt video send timeout as a soft success', async () => {
    const originalPath = `${state.tempDir}original-timeout.mp4`
    await fs.promises.writeFile(originalPath, 'original')
    state.compressVideo.mockResolvedValue(false)
    state.getVideoFileSize.mockResolvedValue(20)
    const timeoutError = new Error(`[3107069495][sendApi] 请求错误:
  action: send_group_msg
  params: {"echo":"242","action":"send_group_msg","params":{"group_id":692617391,"message":[{"type":"video","data":{"file":"file://${originalPath}"}}],"auto_escape":false}}
  retcode: 1200
  message: Timeout: NTEvent serviceAndMethod:NodeIKernelMsgService/sendMsg ListenerName:NodeIKernelMsgListener/onMsgInfoListUpdate EventRet:
{}
`)
    const event = {
      selfId: 'bot-1',
      contact: { type: 'group', groupId: '10000' },
      reply: vi.fn(async () => {
        throw timeoutError
      })
    } as any

    await expect(uploadFile(event, {
      filepath: originalPath,
      totalBytes: 20
    }, '')).resolves.toBe(true)

    expect(state.loggerWarn).toHaveBeenCalledWith(expect.stringContaining('视频发送回执超时，按疑似已发送处理'))
    expect(state.loggerError).not.toHaveBeenCalledWith(expect.stringContaining('视频文件上传错误'))
  })

  it('treats node-karin wrapped qqnt timeout errors as a soft success', async () => {
    const originalPath = `${state.tempDir}original-wrapped-timeout.mp4`
    await fs.promises.writeFile(originalPath, 'original')
    state.compressVideo.mockResolvedValue(false)
    state.getVideoFileSize.mockResolvedValue(20)
    const timeoutCause = new Error(`[3107069495][sendApi] 请求错误:
  action: send_group_msg
  params: {"echo":"242","action":"send_group_msg","params":{"group_id":692617391,"message":[{"type":"video","data":{"file":"file://${originalPath}"}}],"auto_escape":false}}
  retcode: 1200
  message: Timeout: NTEvent serviceAndMethod:NodeIKernelMsgService/sendMsg ListenerName:NodeIKernelMsgListener/onMsgInfoListUpdate EventRet:
{}
`)
    const wrappedError = new Error(`[3107069495][sendApi] 请求错误:
  action: send_group_msg
  params: {"echo":"242","action":"send_group_msg","params":{"group_id":692617391,"message":[{"type":"video","data":{"file":"file://${originalPath}"}}],"auto_escape":false}}`, { cause: timeoutCause })
    const event = {
      selfId: 'bot-1',
      contact: { type: 'group', groupId: '10000' },
      reply: vi.fn(async () => {
        throw wrappedError
      })
    } as any

    await expect(uploadFile(event, {
      filepath: originalPath,
      totalBytes: 20
    }, '')).resolves.toBe(true)

    expect(state.loggerWarn).toHaveBeenCalledWith(expect.stringContaining('视频发送回执超时，按疑似已发送处理'))
    expect(state.loggerError).not.toHaveBeenCalledWith(expect.stringContaining('视频文件上传错误'))
  })

  it('treats node-karin response object qqnt timeouts as a soft success', async () => {
    const originalPath = `${state.tempDir}original-response-timeout.mp4`
    await fs.promises.writeFile(originalPath, 'original')
    state.compressVideo.mockResolvedValue(false)
    state.getVideoFileSize.mockResolvedValue(20)
    const timeoutError = new Error(`[3107069495][sendApi] 请求错误:
  action: send_group_msg
  params: {"echo":"242","action":"send_group_msg","params":{"group_id":692617391,"message":[{"type":"video","data":{"file":"file://${originalPath}"}}],"auto_escape":false}}`, {
      cause: {
        status: 'failed',
        retcode: 1200,
        message: 'Timeout: NTEvent serviceAndMethod:NodeIKernelMsgService/sendMsg ListenerName:NodeIKernelMsgListener/onMsgInfoListUpdate EventRet: {}'
      }
    })
    const event = {
      selfId: 'bot-1',
      contact: { type: 'group', groupId: '10000' },
      reply: vi.fn(async () => {
        throw timeoutError
      })
    } as any

    await expect(uploadFile(event, {
      filepath: originalPath,
      totalBytes: 20
    }, '')).resolves.toBe(true)

    expect(state.loggerWarn).toHaveBeenCalledWith(expect.stringContaining('视频发送回执超时，按疑似已发送处理'))
    expect(state.loggerError).not.toHaveBeenCalledWith(expect.stringContaining('视频文件上传错误'))
  })

  it.each([
    {
      description: 'retcode 1200 without QQNT timeout signatures',
      retcode: 1200,
      responseMessage: 'video upload rejected'
    },
    {
      description: 'QQNT timeout signatures without retcode 1200',
      retcode: 100,
      responseMessage: 'Timeout: NTEvent serviceAndMethod:NodeIKernelMsgService/sendMsg ListenerName:NodeIKernelMsgListener/onMsgInfoListUpdate EventRet: {}'
    }
  ])('still throws for $description', async ({ retcode, responseMessage }) => {
    const originalPath = `${state.tempDir}original-partial-timeout-${retcode}.mp4`
    await fs.promises.writeFile(originalPath, 'original')
    state.compressVideo.mockResolvedValue(false)
    state.getVideoFileSize.mockResolvedValue(20)
    const sendError = new Error('[3107069495][sendApi] 请求错误:', {
      cause: {
        status: 'failed',
        retcode,
        message: responseMessage
      }
    })
    const event = {
      selfId: 'bot-1',
      contact: { type: 'group', groupId: '10000' },
      reply: vi.fn(async () => {
        throw sendError
      })
    } as any

    await expect(uploadFile(event, {
      filepath: originalPath,
      totalBytes: 20
    }, '')).rejects.toThrow('[sendApi] 请求错误')

    expect(state.loggerWarn).not.toHaveBeenCalledWith(expect.stringContaining('视频发送回执超时，按疑似已发送处理'))
    expect(state.loggerError).toHaveBeenCalledWith(expect.stringContaining('视频文件上传错误'))
  })

  it('still throws for non-timeout video send failures', async () => {
    const originalPath = `${state.tempDir}original-hard-failure.mp4`
    await fs.promises.writeFile(originalPath, 'original')
    state.compressVideo.mockResolvedValue(false)
    state.getVideoFileSize.mockResolvedValue(20)
    const hardError = new Error('send_group_msg failed: invalid file')
    const event = {
      selfId: 'bot-1',
      contact: { type: 'group', groupId: '10000' },
      reply: vi.fn(async () => {
        throw hardError
      })
    } as any

    await expect(uploadFile(event, {
      filepath: originalPath,
      totalBytes: 20
    }, '')).rejects.toThrow('invalid file')

    expect(state.loggerError).toHaveBeenCalledWith(expect.stringContaining('视频文件上传错误'))
  })
})
