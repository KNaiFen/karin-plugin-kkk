import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  files: new Map<string, string>(),
  mtimes: new Map<string, number>(),
  now: Date.now(),
  failTempWrite: false
}))

const renameFile = (source: string, target: string): void => {
  const content = state.files.get(source)
  if (content === undefined) throw new Error('missing source')
  state.files.set(target, content)
  state.mtimes.set(target, state.mtimes.get(source) ?? state.now)
  state.files.delete(source)
  state.mtimes.delete(source)
}

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
    }
  }
}))

vi.mock('@/module/utils/Config', () => ({
  Config: {
    app: {
      sharedCacheTtlHours: 24
    }
  }
}))

vi.mock('node:fs', () => ({
  default: {
    existsSync: (filePath: string) => state.files.has(filePath),
    mkdirSync: vi.fn(),
    readFileSync: (filePath: string) => state.files.get(filePath) ?? '',
    writeFileSync: (filePath: string, content: string) => {
      if (state.failTempWrite && filePath.includes('.tmp-')) throw new Error('disk full')
      state.files.set(filePath, String(content))
      state.mtimes.set(filePath, state.now)
    },
    readdirSync: vi.fn(() => []),
    statSync: vi.fn((filePath: string) => ({
      isDirectory: () => false,
      birthtimeMs: state.mtimes.get(filePath) ?? state.now,
      mtimeMs: state.mtimes.get(filePath) ?? state.now
    })),
    renameSync: vi.fn(renameFile),
    rmSync: (filePath: string) => {
      state.files.delete(filePath)
      state.mtimes.delete(filePath)
    },
    unlinkSync: (filePath: string) => {
      state.files.delete(filePath)
      state.mtimes.delete(filePath)
    },
    rmdirSync: vi.fn()
  }
}))

const {
  buildSharedCachePath,
  removeExpiredFilesRecursively,
  resolveSharedJsonCache,
  writeSharedJsonCache
} = await import('../src/module/utils/sharedCache')

describe('resolveSharedJsonCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.files = new Map()
    state.mtimes = new Map()
    state.now = Date.now()
    state.failTempWrite = false
  })

  it('loads once and reuses the cached bundle on repeated calls', async () => {
    const loader = vi.fn(async () => ({ title: 'bundle' }))
    const identity = {
      scope: 'work-bundle' as const,
      key: 'kuaishou:photo:abc123'
    }

    const first = await resolveSharedJsonCache(identity, loader)
    const second = await resolveSharedJsonCache(identity, loader)

    expect(first).toEqual({
      value: { title: 'bundle' },
      cacheHit: false
    })
    expect(second).toEqual({
      value: { title: 'bundle' },
      cacheHit: true
    })
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('coalesces concurrent loads for the same identity', async () => {
    let resolveLoader: (() => void) | null = null
    const loader = vi.fn(async () => {
      await new Promise<void>(resolve => {
        resolveLoader = resolve
      })
      return { title: 'bundle' }
    })
    const identity = {
      scope: 'work-bundle' as const,
      key: 'douyin:aweme:123456'
    }

    const first = resolveSharedJsonCache(identity, loader)
    const second = resolveSharedJsonCache(identity, loader)
    resolveLoader?.()

    await expect(first).resolves.toEqual({
      value: { title: 'bundle' },
      cacheHit: false
    })
    await expect(second).resolves.toEqual({
      value: { title: 'bundle' },
      cacheHit: false
    })
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('treats an expired file as a miss immediately and replaces it', async () => {
    const identity = {
      scope: 'work-bundle' as const,
      key: 'expired-bundle'
    }
    const cachePath = buildSharedCachePath(identity, '.json')
    state.files.set(cachePath, JSON.stringify({ title: 'stale' }))
    state.mtimes.set(cachePath, state.now - 25 * 60 * 60 * 1000)
    const loader = vi.fn(async () => ({ title: 'fresh' }))

    await expect(resolveSharedJsonCache(identity, loader)).resolves.toEqual({
      value: { title: 'fresh' },
      cacheHit: false
    })
    expect(loader).toHaveBeenCalledTimes(1)
    expect(JSON.parse(state.files.get(cachePath) ?? '{}')).toEqual({ title: 'fresh' })
  })

  it('keeps the previous file intact when the atomic temporary write fails', () => {
    const identity = {
      scope: 'work-bundle' as const,
      key: 'atomic-write'
    }
    const cachePath = buildSharedCachePath(identity, '.json')
    state.files.set(cachePath, JSON.stringify({ title: 'previous' }))
    state.mtimes.set(cachePath, state.now)
    state.failTempWrite = true

    writeSharedJsonCache(identity, { title: 'new' })

    expect(JSON.parse(state.files.get(cachePath) ?? '{}')).toEqual({ title: 'previous' })
  })

  it('keeps the previous file intact when the atomic rename fails', async () => {
    const identity = {
      scope: 'work-bundle' as const,
      key: 'atomic-rename'
    }
    const cachePath = buildSharedCachePath(identity, '.json')
    state.files.set(cachePath, JSON.stringify({ title: 'previous' }))
    state.mtimes.set(cachePath, state.now)
    const fsModule = await import('node:fs')
    vi.mocked(fsModule.default.renameSync).mockImplementationOnce(() => {
      throw new Error('rename failed')
    })

    writeSharedJsonCache(identity, { title: 'new' })

    expect(JSON.parse(state.files.get(cachePath) ?? '{}')).toEqual({ title: 'previous' })
  })

  it('clears a rejected single-flight task so the next call can recover', async () => {
    const identity = {
      scope: 'work-bundle' as const,
      key: 'retry-after-rejection'
    }
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({ title: 'recovered' })

    await expect(resolveSharedJsonCache(identity, loader)).rejects.toThrow('temporary failure')
    await expect(resolveSharedJsonCache(identity, loader)).resolves.toEqual({
      value: { title: 'recovered' },
      cacheHit: false
    })
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('can return a value without persisting unsuccessful business responses', async () => {
    const identity = {
      scope: 'work-bundle' as const,
      key: 'business-failure'
    }
    const loader = vi.fn(async () => ({ success: false }))

    await resolveSharedJsonCache(identity, loader, {
      shouldPersist: value => value.success
    })
    await resolveSharedJsonCache(identity, loader, {
      shouldPersist: value => value.success
    })

    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('uses mtime rather than birthtime during scheduled space reclamation', async () => {
    const filePath = '/tmp/shared-cache/work-bundle/recently-refreshed.json'
    state.files.set(filePath, '{}')
    state.mtimes.set(filePath, state.now)
    const fsModule = await import('node:fs')
    vi.mocked(fsModule.default.readdirSync).mockReturnValueOnce(['recently-refreshed.json'] as never)
    vi.mocked(fsModule.default.statSync).mockReturnValueOnce({
      isDirectory: () => false,
      birthtimeMs: state.now - 48 * 60 * 60 * 1000,
      mtimeMs: state.now
    } as never)

    expect(removeExpiredFilesRecursively('/tmp/shared-cache/work-bundle', state.now - 24 * 60 * 60 * 1000)).toBe(0)
    expect(state.files.has(filePath)).toBe(true)
  })
})
