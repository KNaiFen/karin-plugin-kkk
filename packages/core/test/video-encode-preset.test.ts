import { describe, expect, it, vi } from 'vitest'

import {
  buildBitrateLimitArgs,
  buildVideoEncodeArgs,
  resetVideoEncoderDetectionCache,
  resolveVideoEncodeArgs,
  type VideoEncodePreset
} from '../src/module/utils/VideoEncodePreset'

describe('video encode presets', () => {
  it.each([
    ['nvidia', '-c:v hevc_nvenc -preset p5 -rc vbr -cq 19 -spatial-aq 1'],
    ['intel', '-c:v hevc_qsv -preset medium'],
    ['amd', '-c:v hevc_amf -quality quality -rc cbr -enforce_hrd 1'],
    ['cpu', expect.stringContaining('-c:v libx265 -preset medium')]
  ] as Array<[VideoEncodePreset, string]>)('uses %s preset args', (preset, expected) => {
    expect(buildVideoEncodeArgs({ preset })).toEqual(expected)
  })

  it('keeps Intel and AMD presets in bitrate-only mode', () => {
    expect(buildVideoEncodeArgs({ preset: 'intel' })).not.toContain('-global_quality')
    expect(buildVideoEncodeArgs({ preset: 'amd' })).not.toMatch(/\s-rc\s+cqp\b/)
  })

  it('uses strict bitrate caps by default', () => {
    expect(buildBitrateLimitArgs(2000)).toBe('-b:v 2000k -maxrate 2000k -bufsize 2000k')
  })

  it('uses non-empty custom args when custom preset is selected', () => {
    expect(buildVideoEncodeArgs({
      preset: 'custom',
      customArgs: ' -c:v h264_nvenc -preset p7 -cq 24 '
    })).toBe('-c:v h264_nvenc -preset p7 -cq 24')
  })

  it('falls custom preset back to cpu when args are empty', () => {
    expect(buildVideoEncodeArgs({ preset: 'custom', customArgs: '   ' })).toContain('-c:v libx265 -preset medium')
  })

  it('detects auto preset in GPU priority order and caches the result', async () => {
    resetVideoEncoderDetectionCache()
    const canUseEncoder = vi.fn(async (encoder: string) => encoder === 'hevc_qsv')

    await expect(resolveVideoEncodeArgs({ preset: 'auto', canUseEncoder })).resolves.toBe('-c:v hevc_qsv -preset medium')
    await expect(resolveVideoEncodeArgs({ preset: 'auto', canUseEncoder })).resolves.toBe('-c:v hevc_qsv -preset medium')

    expect(canUseEncoder).toHaveBeenCalledTimes(2)
    expect(canUseEncoder).toHaveBeenNthCalledWith(1, 'hevc_nvenc')
    expect(canUseEncoder).toHaveBeenNthCalledWith(2, 'hevc_qsv')
  })

  it('falls auto preset back to cpu when no hardware encoder is available', async () => {
    resetVideoEncoderDetectionCache()
    const canUseEncoder = vi.fn(async () => false)

    await expect(resolveVideoEncodeArgs({ preset: 'auto', canUseEncoder })).resolves.toContain('-c:v libx265 -preset medium')

    expect(canUseEncoder).toHaveBeenCalledWith('hevc_nvenc')
    expect(canUseEncoder).toHaveBeenCalledWith('hevc_qsv')
    expect(canUseEncoder).toHaveBeenCalledWith('hevc_amf')
  })
})
