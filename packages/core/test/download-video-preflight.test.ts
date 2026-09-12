import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  compress: false,
  downloadCalls: [] as string[],
  failingHeaderUrls: new Set<string>(),
  headerCalls: [] as string[],
  headerSizeBytes: 5 * 1024 * 1024,
  karinSendMsg: vi.fn(),
  usefilelimit: true
}))

vi.mock('node-karin', () => ({
  default: {
    contactFriend: vi.fn(() => ({ type: 'friend', id: 'bot-1' })),
    contactGroup: vi.fn(() => ({ type: 'group', id: 'group-1' })),
    sendMsg: state.karinSendMsg
  },
  logger: {
    blue: (value: unknown) => String(value),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    mark: vi.fn(),
    warn: vi.fn(),
    yellow: (value: unknown) => String(value)
  },
  Message: class {},
  segment: {
    text: vi.fn((text: string) => ({ type: 'text', text })),
    video: vi.fn((file: string) => ({ type: 'video', file }))
  }
}))

vi.mock('@/module/utils/Config', () => ({
  Config: {
    app: {
      removeCache: false
    },
    upload: {
      get compress () {
        return state.compress
      },
      compresstrigger: 100,
      downloadAutoReduce: false,
      downloadMaxSpeed: 10,
      downloadMinSpeed: 1,
      downloadThrottle: false,
      filelimit: 1,
      groupfilevalue: 100,
      imageSendMode: 'file',
      get usefilelimit () {
        return state.usefilelimit
      },
      usegroupfile: false,
      videoSendMode: 'file'
    }
  }
}))

vi.mock('@/module/utils', () => ({
  baseHeaders: {},
  Common: {
    registerVideoPreview: vi.fn(),
    removeFile: vi.fn(async () => true),
    tempDri: {
      video: '/tmp/'
    }
  },
  compressVideo: vi.fn(),
  extractTotalBytesFromHeaders: vi.fn(() => state.headerSizeBytes),
  getMediaDuration: vi.fn(),
  Networks: class {
    private readonly url: string
    private readonly filepath?: string

    constructor (data: { url: string, filepath?: string }) {
      this.url = data.url
      this.filepath = data.filepath
    }

    async getHeaders () {
      state.headerCalls.push(this.url)
      if (state.failingHeaderUrls.has(this.url)) {
        throw new Error(`获取响应头失败: 所有探测方式均未返回有效响应, URL: ${this.url}`)
      }
      return { headers: { 'content-length': String(state.headerSizeBytes) } }
    }

    async downloadStream () {
      state.downloadCalls.push(this.url)
      return {
        filepath: this.filepath ?? '/tmp/video.mp4',
        totalBytes: 512 * 1024
      }
    }
  }
}))

vi.mock('@/module/utils/Common', () => ({
  Common: {
    registerVideoPreview: vi.fn(),
    removeFile: vi.fn(async () => true),
    tempDri: {
      video: '/tmp/'
    }
  }
}))

vi.mock('@/module/utils/FFmpeg', () => ({
  compressVideo: vi.fn(),
  getMediaDuration: vi.fn()
}))

vi.mock('@/module/utils/Network/constants', () => ({
  BASE_HEADERS: {}
}))

vi.mock('@/module/utils/Network/helpers', () => ({
  extractTotalBytesFromHeaders: vi.fn(() => state.headerSizeBytes)
}))

vi.mock('@/module/utils/Network/Network', () => ({
  Network: class {
    private readonly url: string
    private readonly filepath?: string

    constructor (data: { url: string, filepath?: string }) {
      this.url = data.url
      this.filepath = data.filepath
    }

    async getHeaders () {
      state.headerCalls.push(this.url)
      if (state.failingHeaderUrls.has(this.url)) {
        throw new Error(`获取响应头失败: 所有探测方式均未返回有效响应, URL: ${this.url}`)
      }
      return { headers: { 'content-length': String(state.headerSizeBytes) } }
    }

    async downloadStream () {
      state.downloadCalls.push(this.url)
      return {
        filepath: this.filepath ?? '/tmp/video.mp4',
        totalBytes: 512 * 1024
      }
    }
  }
}))

vi.mock('../src/module/utils/amagiClient', () => ({
  AmagiBase: class {}
}))

const { downloadVideo } = await import('../src/module/utils/Base')

const createEvent = () => ({
  contact: { type: 'group', id: 'group-1' },
  reply: vi.fn(async () => ({ messageId: 'msg-1' })),
  selfId: 'bot-1'
} as any)

describe('downloadVideo preflight policy', () => {
  beforeEach(() => {
    state.compress = false
    state.downloadCalls = []
    state.failingHeaderUrls = new Set()
    state.headerCalls = []
    state.headerSizeBytes = 5 * 1024 * 1024
    state.karinSendMsg.mockClear()
    state.usefilelimit = true
  })

  it('downloads immediately without probing headers when file limit is disabled', async () => {
    state.usefilelimit = false
    const event = createEvent()
    const result = await downloadVideo(event, {
      video_url: 'https://cdn.example/video.mp4',
      title: { originTitle: 'video.mp4' }
    } as any)

    expect(result).toBe(true)
    expect(state.headerCalls).toEqual([])
    expect(state.downloadCalls).toEqual(['https://cdn.example/video.mp4'])
  })

  it('uses known file size for limit checks without probing headers', async () => {
    const event = createEvent()
    const result = await downloadVideo(event, {
      knownFileSizeBytes: 5 * 1024 * 1024,
      title: { originTitle: 'video.mp4' },
      video_url: 'https://cdn.example/video.mp4'
    } as any)

    expect(result).toBe(false)
    expect(state.headerCalls).toEqual([])
    expect(state.downloadCalls).toEqual([])
    expect(state.karinSendMsg).toHaveBeenCalled()
  })

  it('falls back to header probing when the file limit needs an unknown size', async () => {
    const event = createEvent()
    const result = await downloadVideo(event, {
      title: { originTitle: 'video.mp4' },
      video_url: 'https://cdn.example/video.mp4'
    } as any)

    expect(result).toBe(false)
    expect(state.headerCalls).toEqual(['https://cdn.example/video.mp4'])
    expect(state.downloadCalls).toEqual([])
  })

  it('does not let file-limit preflight block the compression path', async () => {
    state.compress = true
    const event = createEvent()
    const result = await downloadVideo(event, {
      title: { originTitle: 'video.mp4' },
      video_url: 'https://cdn.example/video.mp4'
    } as any)

    expect(result).toBe(true)
    expect(state.headerCalls).toEqual([])
    expect(state.downloadCalls).toEqual(['https://cdn.example/video.mp4'])
  })

  it('does not let failed preflight block douyin wrapped video downloads', async () => {
    const wrappedUrl = 'https://aweme.snssdk.com/aweme/v1/playwm/?line=0&logo_name=aweme_diversion_search&ratio=720p&video_id=v1e00fgi0000d7f5g1fog65jfn7cv8c0'
    state.failingHeaderUrls = new Set([wrappedUrl])

    const event = createEvent()
    const result = await downloadVideo(event, {
      title: { originTitle: 'video.mp4' },
      video_url: wrappedUrl
    } as any)

    expect(result).toBe(true)
    expect(state.headerCalls).toEqual([wrappedUrl])
    expect(state.downloadCalls).toEqual([wrappedUrl])
  })
})
