import os from 'node:os'

import { ffmpeg, logger } from 'node-karin'

export type VideoEncodePreset = 'auto' | 'nvidia' | 'intel' | 'amd' | 'cpu' | 'custom'
export type VideoEncodeCodec = 'h264' | 'h265' | 'av1'

type HardwareVideoEncodePreset = Exclude<VideoEncodePreset, 'auto' | 'custom'>

type VideoEncodeArgsOptions = {
  preset?: VideoEncodePreset | string
  customArgs?: string
  codec?: VideoEncodeCodec
}

type ResolveVideoEncodeArgsOptions = VideoEncodeArgsOptions & {
  canUseEncoder?: (encoder: string) => Promise<boolean>
}

const VIDEO_ENCODE_PRESETS = ['auto', 'nvidia', 'intel', 'amd', 'cpu', 'custom'] as const

const AUTO_ENCODER_PRIORITY: Record<VideoEncodeCodec, readonly string[]> = {
  h264: ['h264_nvenc', 'h264_qsv', 'h264_amf'],
  h265: ['hevc_nvenc', 'hevc_qsv', 'hevc_amf'],
  av1: ['av1_nvenc', 'av1_qsv', 'av1_amf']
}

const PRESET_ENCODERS: Record<VideoEncodeCodec, Record<HardwareVideoEncodePreset, string>> = {
  h264: {
    nvidia: 'h264_nvenc',
    intel: 'h264_qsv',
    amd: 'h264_amf',
    cpu: 'libx264'
  },
  h265: {
    nvidia: 'hevc_nvenc',
    intel: 'hevc_qsv',
    amd: 'hevc_amf',
    cpu: 'libx265'
  },
  av1: {
    nvidia: 'av1_nvenc',
    intel: 'av1_qsv',
    amd: 'av1_amf',
    cpu: 'libsvtav1'
  }
}

const detectedAutoArgs: Partial<Record<VideoEncodeCodec, string>> = {}

export const normalizeVideoEncodePreset = (preset: unknown): VideoEncodePreset => {
  return typeof preset === 'string' && VIDEO_ENCODE_PRESETS.includes(preset as VideoEncodePreset)
    ? preset as VideoEncodePreset
    : 'auto'
}

const normalizeVideoEncodeCodec = (codec: unknown): VideoEncodeCodec => {
  return codec === 'h264' || codec === 'av1' ? codec : 'h265'
}

const cpuThreadArgs = () => `-threads ${Math.max(1, Math.floor(os.cpus().length / 2))}`

const buildEncoderArgs = (encoder: string): string => {
  if (encoder === 'h264_nvenc') return '-c:v h264_nvenc -preset p5 -rc vbr -cq 19 -spatial-aq 1'
  if (encoder === 'h264_qsv') return '-c:v h264_qsv -preset medium'
  if (encoder === 'h264_amf') return '-c:v h264_amf -quality quality -rc cbr -enforce_hrd 1'
  if (encoder === 'libx264') return '-c:v libx264 -preset medium'

  if (encoder === 'hevc_nvenc') return '-c:v hevc_nvenc -preset p5 -rc vbr -cq 19 -spatial-aq 1'
  if (encoder === 'hevc_qsv') return '-c:v hevc_qsv -preset medium'
  if (encoder === 'hevc_amf') return '-c:v hevc_amf -quality quality -rc cbr -enforce_hrd 1'
  if (encoder === 'libx265') return `-c:v libx265 -preset medium ${cpuThreadArgs()}`

  if (encoder === 'av1_nvenc') return '-c:v av1_nvenc -preset p4 -rc vbr -cq 30'
  if (encoder === 'av1_qsv') return '-c:v av1_qsv -preset medium -global_quality 30'
  if (encoder === 'av1_amf') return '-c:v av1_amf -quality balanced -rc cqp -qp_i 30 -qp_p 30'
  if (encoder === 'libsvtav1') return `-c:v libsvtav1 -preset 6 -crf 30 ${cpuThreadArgs()}`

  return '-c:v libx265 -preset medium'
}

export const buildVideoEncodeArgs = (options: VideoEncodeArgsOptions = {}): string => {
  const preset = normalizeVideoEncodePreset(options.preset)
  const codec = normalizeVideoEncodeCodec(options.codec)

  if (preset === 'custom') {
    const customArgs = options.customArgs?.trim()
    return customArgs || buildEncoderArgs(PRESET_ENCODERS[codec].cpu)
  }

  if (preset === 'auto') {
    return buildEncoderArgs(PRESET_ENCODERS[codec].cpu)
  }

  return buildEncoderArgs(PRESET_ENCODERS[codec][preset])
}

const defaultCanUseEncoder = async (encoder: string): Promise<boolean> => {
  try {
    const result = await ffmpeg(
      `-f lavfi -i color=c=black:s=320x240:d=0.1 -c:v ${encoder} -f null -`,
      { timeout: 5000 }
    )
    return result.status
  } catch {
    return false
  }
}

export const resolveVideoEncodeArgs = async (options: ResolveVideoEncodeArgsOptions = {}): Promise<string> => {
  const preset = normalizeVideoEncodePreset(options.preset)
  const codec = normalizeVideoEncodeCodec(options.codec)

  if (preset !== 'auto') return buildVideoEncodeArgs({ ...options, preset, codec })
  if (detectedAutoArgs[codec]) return detectedAutoArgs[codec]!

  const canUseEncoder = options.canUseEncoder ?? defaultCanUseEncoder
  for (const encoder of AUTO_ENCODER_PRIORITY[codec]) {
    if (await canUseEncoder(encoder)) {
      const args = buildEncoderArgs(encoder)
      detectedAutoArgs[codec] = args
      logger.info(`[VideoEncodePreset] 自动选择 ${codec.toUpperCase()} 编码器: ${encoder}`)
      return args
    }
  }

  const fallbackArgs = buildEncoderArgs(PRESET_ENCODERS[codec].cpu)
  detectedAutoArgs[codec] = fallbackArgs
  logger.info(`[VideoEncodePreset] 未检测到可用硬件编码器，回退到 ${codec.toUpperCase()} CPU 编码`)
  return fallbackArgs
}

export const buildBitrateLimitArgs = (targetBitrate: number, maxRate = targetBitrate, bufSize = targetBitrate): string => {
  return `-b:v ${Math.round(targetBitrate)}k -maxrate ${Math.round(maxRate)}k -bufsize ${Math.round(bufSize)}k`
}

export const resetVideoEncoderDetectionCache = () => {
  for (const codec of Object.keys(detectedAutoArgs) as VideoEncodeCodec[]) {
    delete detectedAutoArgs[codec]
  }
}
