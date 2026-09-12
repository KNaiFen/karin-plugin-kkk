import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  files: new Set<string>(),
  fileContents: new Map<string, Buffer>(),
  fileVersions: new Map<string, { mtimeMs: number, ctimeMs: number, ino: number }>(),
  now: Date.now(),
  nextIno: 1,
  failCacheCommit: false,
  ffmpeg: vi.fn(),
  ffprobe: vi.fn()
}))

const ensureFile = (filePath: string, content: string | Buffer = 'file'): void => {
  state.files.add(filePath)
  state.fileContents.set(filePath, Buffer.isBuffer(content) ? Buffer.from(content) : Buffer.from(content))
  state.fileVersions.set(filePath, {
    mtimeMs: state.now,
    ctimeMs: state.now,
    ino: state.nextIno++
  })
}

vi.mock('node-karin', () => ({
  ffmpeg: (...args: unknown[]) => state.ffmpeg(...args),
  ffprobe: (...args: unknown[]) => state.ffprobe(...args),
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    mark: vi.fn(),
    warn: vi.fn()
  }
}))

vi.mock('@/module/utils/Common', () => ({
  Common: {
    tempDri: {
      cache: {
        root: '/tmp/shared-cache/',
        parsedPost: '/tmp/shared-cache/parsed-post/',
        workBundle: '/tmp/shared-cache/work-bundle/',
        media: '/tmp/shared-cache/media/',
        renderAssets: '/tmp/shared-cache/render-assets/',
        derived: '/tmp/shared-cache/derived/'
      }
    },
    removeFile: vi.fn()
  }
}))

vi.mock('@/module/utils/Config', () => ({
  Config: {
    app: {
      sharedCacheTtlHours: 24,
      livePhotoSystem: 'google'
    }
  }
}))

vi.mock('@/module/utils/VideoEncodePreset', () => ({
  buildBitrateLimitArgs: vi.fn(() => '-b:v 1000k -maxrate 2000k -bufsize 4000k'),
  resolveVideoEncodeArgs: vi.fn(async () => '-c:v libx264')
}))

vi.mock('@/module/utils', async () => {
  const derivedCache = await import('../src/module/utils/derivedCache')
  return {
    Common: {
      tempDri: {
        cache: {
          root: '/tmp/shared-cache/',
          parsedPost: '/tmp/shared-cache/parsed-post/',
          workBundle: '/tmp/shared-cache/work-bundle/',
          media: '/tmp/shared-cache/media/',
          renderAssets: '/tmp/shared-cache/render-assets/',
          derived: '/tmp/shared-cache/derived/'
        }
      },
      removeFile: vi.fn()
    },
    buildBitrateLimitArgs: vi.fn(() => '-b:v 1000k -maxrate 2000k -bufsize 4000k'),
    resolveVideoEncodeArgs: vi.fn(async () => '-c:v libx264'),
    buildDerivedCacheIdentity: derivedCache.buildDerivedCacheIdentity,
    resolveDerivedArtifact: derivedCache.resolveDerivedArtifact,
    resolveFileCacheIdentity: derivedCache.resolveFileCacheIdentity
  }
})

vi.mock('node:fs', () => ({
  default: {
    existsSync: (filePath: string) => state.files.has(filePath),
    mkdirSync: vi.fn(),
    writeFileSync: (filePath: string, content: string | Buffer) => {
      ensureFile(filePath, content)
    },
    readFileSync: (filePath: string) => state.fileContents.get(filePath) ?? Buffer.from(''),
    unlinkSync: (filePath: string) => {
      state.files.delete(filePath)
      state.fileContents.delete(filePath)
      state.fileVersions.delete(filePath)
    },
    rmSync: (filePath: string) => {
      state.files.delete(filePath)
      state.fileContents.delete(filePath)
      state.fileVersions.delete(filePath)
    },
    copyFileSync: (source: string, target: string) => {
      ensureFile(target, state.fileContents.get(source) ?? Buffer.from(''))
    },
    renameSync: (source: string, target: string) => {
      if (state.failCacheCommit && source.includes('.tmp-') && target.includes('/derived/')) {
        state.failCacheCommit = false
        throw new Error('cache commit failed')
      }
      ensureFile(target, state.fileContents.get(source) ?? Buffer.from(''))
      state.files.delete(source)
      state.fileContents.delete(source)
      state.fileVersions.delete(source)
    },
    statSync: vi.fn((filePath: string) => {
      const version = state.fileVersions.get(filePath) ?? {
        mtimeMs: state.now,
        ctimeMs: state.now,
        ino: 0
      }
      return {
        size: (state.fileContents.get(filePath) ?? Buffer.from('file')).length,
        isDirectory: () => false,
        birthtimeMs: version.mtimeMs,
        mtimeMs: version.mtimeMs,
        ctimeMs: version.ctimeMs,
        ino: version.ino
      }
    })
  }
}))

const {
  mergeVideoAudio,
  loopVideoWithTransition,
  buildGoogleMotionPhoto
} = await import('../src/module/utils/FFmpeg')
const { Common } = await import('@/module/utils/Common')
const {
  mergeAndBurnBili
} = await import('../src/platform/bilibili/danmaku')
const {
  burnDouyinDanmaku
} = await import('../src/platform/douyin/danmaku')

describe('derived artifact cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.files = new Set()
    state.fileContents = new Map()
    state.fileVersions = new Map()
    state.now = Date.now()
    state.nextIno = 1
    state.failCacheCommit = false

    ensureFile('/tmp/input-video.mp4')
    ensureFile('/tmp/input-audio.m4a')
    ensureFile('/tmp/input-static.jpg', Buffer.from([0xFF, 0xD8, 0xFF, 0xD9]))
    ensureFile('/tmp/input-live.mp4')

    state.ffprobe.mockImplementation(async (command: string) => {
      if (command.includes('show_entries format=duration')) {
        return { stdout: '2.5\n' }
      }
      if (command.includes('show_entries stream=avg_frame_rate')) {
        return { stdout: '30/1\n' }
      }
      if (command.includes('show_entries stream=width,height')) {
        return { stdout: '1080x1920\n' }
      }
      if (command.includes('show_entries stream=r_frame_rate')) {
        return { stdout: '30/1\n' }
      }
      if (command.includes('show_entries stream=bit_rate')) {
        return { stdout: '1000000\n' }
      }
      if (command.includes('show_entries format=bit_rate')) {
        return { stdout: '1000000\n' }
      }
      return { stdout: '0\n' }
    })
    state.ffmpeg.mockImplementation(async (command: string) => {
      const outputPath = command.match(/"([^"]+)"\s*$/)?.[1]
      if (outputPath) ensureFile(outputPath)
      return { status: true, stderr: '' }
    })
  })

  it('reuses mergeVideoAudio results without rerunning ffmpeg', async () => {
    const cacheIdentity = {
      scope: 'derived' as const,
      key: 'merge-video-audio-test'
    }

    await expect(mergeVideoAudio('/tmp/input-video.mp4', '/tmp/input-audio.m4a', '/tmp/output-first.mp4', cacheIdentity)).resolves.toBe(true)
    await expect(mergeVideoAudio('/tmp/input-video.mp4', '/tmp/input-audio.m4a', '/tmp/output-second.mp4', cacheIdentity)).resolves.toBe(true)

    expect(state.ffmpeg).toHaveBeenCalledTimes(1)
    expect(state.files.has('/tmp/output-first.mp4')).toBe(true)
    expect(state.files.has('/tmp/output-second.mp4')).toBe(true)
  })

  it('keeps the derived temp output extension so ffmpeg can infer the muxer on Windows paths', async () => {
    const cacheIdentity = {
      scope: 'derived' as const,
      key: 'merge-video-audio-windows-path'
    }
    const originalDerivedDir = Common.tempDri.cache.derived
    Common.tempDri.cache.derived = 'C:\\cache\\derived\\'

    try {
      await expect(mergeVideoAudio('/tmp/input-video.mp4', '/tmp/input-audio.m4a', '/tmp/windows-output.mp4', cacheIdentity)).resolves.toBe(true)
    } finally {
      Common.tempDri.cache.derived = originalDerivedDir
    }

    const ffmpegCommand = state.ffmpeg.mock.calls[0]?.[0]
    expect(ffmpegCommand).toContain('.tmp-')
    expect(ffmpegCommand).toContain('.mp4"')
    expect(ffmpegCommand).not.toContain('.mp4.tmp-')
  })

  it('reuses mergeAndBurnBili results without rerunning ffmpeg', async () => {
    const cacheIdentity = {
      scope: 'derived' as const,
      key: 'merge-burn-bili-test'
    }

    const danmakuList = [{
      progress: 0,
      mode: 1,
      fontsize: 25,
      color: 16777215,
      content: 'hello'
    }]

    await expect(mergeAndBurnBili('/tmp/input-video.mp4', '/tmp/input-audio.m4a', danmakuList, '/tmp/bili-first.mp4', {}, cacheIdentity)).resolves.toBe(true)
    await expect(mergeAndBurnBili('/tmp/input-video.mp4', '/tmp/input-audio.m4a', danmakuList, '/tmp/bili-second.mp4', {}, cacheIdentity)).resolves.toBe(true)

    expect(state.ffmpeg).toHaveBeenCalledTimes(1)
  })

  it('reuses burnDouyinDanmaku results without rerunning ffmpeg', async () => {
    const cacheIdentity = {
      scope: 'derived' as const,
      key: 'burn-douyin-test'
    }

    const danmakuList = [{
      danmaku_id: '1',
      offset_time: 0,
      text: 'hello'
    }]

    await expect(burnDouyinDanmaku('/tmp/input-video.mp4', danmakuList, '/tmp/douyin-first.mp4', {}, cacheIdentity)).resolves.toBe(true)
    await expect(burnDouyinDanmaku('/tmp/input-video.mp4', danmakuList, '/tmp/douyin-second.mp4', {}, cacheIdentity)).resolves.toBe(true)

    expect(state.ffmpeg).toHaveBeenCalledTimes(1)
  })

  it('reuses loopVideoWithTransition results and restores cached context', async () => {
    const cacheIdentity = {
      scope: 'derived' as const,
      key: 'loop-video-transition-test'
    }

    const first = await loopVideoWithTransition({
      inputPath: '/tmp/input-live.mp4',
      outputPath: '/tmp/live-first.mp4',
      loopCount: 3,
      staticImagePath: '/tmp/input-static.jpg',
      transitionEnabled: true,
      cacheIdentity,
      mergeMode: 'continuous',
      context: {
        bgmPath: '/tmp/input-audio.m4a',
        bgmDuration: 10,
        usedDuration: 1
      }
    })
    const second = await loopVideoWithTransition({
      inputPath: '/tmp/input-live.mp4',
      outputPath: '/tmp/live-second.mp4',
      loopCount: 3,
      staticImagePath: '/tmp/input-static.jpg',
      transitionEnabled: true,
      cacheIdentity,
      mergeMode: 'continuous',
      context: {
        bgmPath: '/tmp/input-audio.m4a',
        bgmDuration: 10,
        usedDuration: 1
      }
    })

    expect(first.success).toBe(true)
    expect(second).toEqual(first)
    expect(state.ffmpeg).toHaveBeenCalledTimes(1)
  })

  it('reuses buildGoogleMotionPhoto results without rebuilding the output', async () => {
    const cacheIdentity = {
      scope: 'derived' as const,
      key: 'motion-photo-test'
    }

    await expect(buildGoogleMotionPhoto({
      imagePath: '/tmp/input-static.jpg',
      videoPath: '/tmp/input-live.mp4',
      outputPath: '/tmp/motion-first.jpg',
      cacheIdentity
    })).resolves.toBe(true)
    await expect(buildGoogleMotionPhoto({
      imagePath: '/tmp/input-static.jpg',
      videoPath: '/tmp/input-live.mp4',
      outputPath: '/tmp/motion-second.jpg',
      cacheIdentity
    })).resolves.toBe(true)

    expect(state.ffmpeg).toHaveBeenCalledTimes(0)
    expect(state.files.has('/tmp/motion-first.jpg')).toBe(true)
    expect(state.files.has('/tmp/motion-second.jpg')).toBe(true)
  })

  it('invalidates a remembered source identity when the source file changes or disappears', async () => {
    const { rememberFileCacheIdentity, resolveFileCacheIdentity } = await import('../src/module/utils/derivedCache')
    const originalIdentity = {
      scope: 'media' as const,
      key: 'source-video'
    }

    rememberFileCacheIdentity('/tmp/input-video.mp4', originalIdentity)
    const first = resolveFileCacheIdentity('/tmp/input-video.mp4')
    expect(first?.key).toContain('source-video:source-')

    state.now += 1000
    ensureFile('/tmp/input-video.mp4', 'new-content')
    expect(resolveFileCacheIdentity('/tmp/input-video.mp4')).toBeNull()

    rememberFileCacheIdentity('/tmp/input-video.mp4', originalIdentity)
    state.files.delete('/tmp/input-video.mp4')
    state.fileContents.delete('/tmp/input-video.mp4')
    state.fileVersions.delete('/tmp/input-video.mp4')
    expect(resolveFileCacheIdentity('/tmp/input-video.mp4')).toBeNull()
  })

  it('coalesces concurrent derived builds and clears the pending entry afterwards', async () => {
    const { resolveDerivedArtifact } = await import('../src/module/utils/derivedCache')
    const cacheIdentity = {
      scope: 'derived' as const,
      key: 'concurrent-build'
    }
    let releaseBuilder: (() => void) | null = null
    const builder = vi.fn(async (cachePath: string) => {
      await new Promise<void>(resolve => {
        releaseBuilder = resolve
      })
      ensureFile(cachePath, 'derived')
      return { success: true }
    })

    const first = resolveDerivedArtifact(cacheIdentity, '/tmp/concurrent-first.mp4', builder)
    const second = resolveDerivedArtifact(cacheIdentity, '/tmp/concurrent-second.mp4', builder)
    releaseBuilder?.()
    await Promise.all([first, second])
    await resolveDerivedArtifact(cacheIdentity, '/tmp/concurrent-third.mp4', builder)

    expect(builder).toHaveBeenCalledTimes(1)
    expect(state.files.has('/tmp/concurrent-first.mp4')).toBe(true)
    expect(state.files.has('/tmp/concurrent-second.mp4')).toBe(true)
    expect(state.files.has('/tmp/concurrent-third.mp4')).toBe(true)
  })

  it('clears a rejected derived build so a later call can recover', async () => {
    const { resolveDerivedArtifact } = await import('../src/module/utils/derivedCache')
    const cacheIdentity = {
      scope: 'derived' as const,
      key: 'retry-rejected-build'
    }
    const builder = vi.fn(async (cachePath: string) => {
      if (builder.mock.calls.length === 1) throw new Error('temporary builder failure')
      ensureFile(cachePath, 'recovered-artifact')
      return { success: true }
    })

    await expect(resolveDerivedArtifact(cacheIdentity, '/tmp/rejected-first.mp4', builder)).rejects.toThrow('temporary builder failure')
    await expect(resolveDerivedArtifact(cacheIdentity, '/tmp/rejected-second.mp4', builder)).resolves.toEqual({ success: true })

    expect(builder).toHaveBeenCalledTimes(2)
    expect(state.files.has('/tmp/rejected-second.mp4')).toBe(true)
  })

  it('keeps a concurrent artifact when committing the new build fails', async () => {
    const { resolveDerivedArtifact } = await import('../src/module/utils/derivedCache')
    const cacheIdentity = {
      scope: 'derived' as const,
      key: 'failed-replacement'
    }
    const cachePath = '/tmp/shared-cache/derived/failed-replacement.mp4'
    ensureFile(cachePath, 'previous-artifact')
    state.files.delete(cachePath)
    state.fileContents.delete(cachePath)
    state.fileVersions.delete(cachePath)

    const result = await resolveDerivedArtifact(cacheIdentity, '/tmp/replacement-output.mp4', async (tempPath) => {
      ensureFile(tempPath, 'new-artifact')
      ensureFile(cachePath, 'concurrent-artifact')
      state.failCacheCommit = true
      return { success: true }
    })

    expect(result.success).toBe(false)
    expect(state.fileContents.get(cachePath)?.toString()).toBe('concurrent-artifact')
    expect(state.files.has('/tmp/replacement-output.mp4')).toBe(false)
  })
})
