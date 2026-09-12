import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  ffmpeg: vi.fn()
}))

vi.mock('node-karin', () => ({
  ffmpeg: (...args: unknown[]) => state.ffmpeg(...args),
  logger: {
    debug: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('../src/module/utils/Common', () => ({
  Common: {
    removeFile: vi.fn()
  }
}))

const { compressVideo } = await import('../src/module/utils/FFmpeg')

describe('compressVideo ffmpeg command', () => {
  it('uses strict bitrate caps, H.265 GPU encoding, and bounded audio bitrate', async () => {
    state.ffmpeg.mockResolvedValue({ status: true })

    await compressVideo({
      inputPath: '/tmp/input.mp4',
      outputPath: '/tmp/output.mp4',
      targetBitrate: 2000,
      audioBitrate: 80,
      encodePreset: 'nvidia',
      removeSource: false
    })

    const command = state.ffmpeg.mock.calls[0][0] as string
    expect(command).toContain('-b:v 2000k -maxrate 2000k -bufsize 2000k')
    expect(command).toContain('-c:v hevc_nvenc -preset p5 -rc vbr -cq 19')
    expect(command).toContain('-c:a aac -b:a 80k')
    expect(command).not.toContain('h264_nvenc')
  })
})
