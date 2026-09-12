import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { Common } from '@/module/utils/Common'
import { Config } from '@/module/utils/Config'

export type CacheScope = 'parsed-post' | 'work-bundle' | 'media' | 'render-assets' | 'derived'

export type CacheIdentity = {
  scope: CacheScope
  key: string
}

type CacheDirectoryKey = 'parsedPost' | 'workBundle' | 'media' | 'renderAssets' | 'derived'

const pendingJsonCacheLoads = new Map<string, Promise<unknown>>()
const sharedCacheFileRemovalListeners = new Set<(filePath: string) => void>()

const buildAtomicTempPath = (targetPath: string): string => {
  return `${targetPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const removeFileQuietly = (filePath: string): void => {
  try {
    const existed = fs.existsSync(filePath)
    if (typeof fs.rmSync === 'function') {
      fs.rmSync(filePath, { force: true })
    } else if (existed && typeof fs.unlinkSync === 'function') {
      fs.unlinkSync(filePath)
    }
    if (existed) {
      notifySharedCacheFileRemoved(filePath)
    }
  } catch {}
}

const notifySharedCacheFileRemoved = (filePath: string): void => {
  for (const listener of sharedCacheFileRemovalListeners) {
    try {
      listener(filePath)
    } catch {}
  }
}

const cacheScopeDirMap: Record<CacheScope, CacheDirectoryKey> = {
  'parsed-post': 'parsedPost',
  'work-bundle': 'workBundle',
  media: 'media',
  'render-assets': 'renderAssets',
  derived: 'derived'
}

export const sanitizeSharedCacheKey = (value: string): string => {
  const normalized = String(value ?? '').trim()
  if (!normalized) return 'cache'

  return normalized
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 180) || 'cache'
}

export const normalizeSharedCacheExtension = (value: string, fallback: string): string => {
  if (!value) return fallback
  return /^\.[a-z0-9]{1,16}$/i.test(value) ? value.toLowerCase() : fallback
}

export const buildSharedCacheFilename = (
  key: string,
  extension: string
): string => `${sanitizeSharedCacheKey(key)}${normalizeSharedCacheExtension(extension, '')}`

export const getSharedCacheDirectory = (scope: CacheScope): string => {
  return Common.tempDri.cache[cacheScopeDirMap[scope]]
}

export const ensureDirectorySync = (dir: string): void => {
  if (!fs.existsSync(dir) && typeof fs.mkdirSync === 'function') {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export const ensureSharedCacheDirectories = (): void => {
  ensureDirectorySync(Common.tempDri.cache.root)
  ensureDirectorySync(Common.tempDri.cache.parsedPost)
  ensureDirectorySync(Common.tempDri.cache.workBundle)
  ensureDirectorySync(Common.tempDri.cache.media)
  ensureDirectorySync(Common.tempDri.cache.renderAssets)
  ensureDirectorySync(Common.tempDri.cache.derived)
}

export const buildSharedCachePath = (
  identity: CacheIdentity,
  extension: string
): string => {
  ensureDirectorySync(getSharedCacheDirectory(identity.scope))
  return path.join(
    getSharedCacheDirectory(identity.scope),
    buildSharedCacheFilename(identity.key, extension)
  )
}

export const buildSharedCacheHash = (...parts: string[]): string => {
  const hash = createHash('sha1')
  for (const part of parts) {
    hash.update(part)
  }
  return hash.digest('hex')
}

export const getSharedCacheTtlMs = (): number => {
  const hours = Number(Config.app?.sharedCacheTtlHours ?? 24)
  return Math.max(1, Number.isFinite(hours) ? hours : 24) * 60 * 60 * 1000
}

export const removeSharedCacheFile = (filePath: string): void => {
  removeFileQuietly(filePath)
}

export const onSharedCacheFileRemoved = (
  listener: (filePath: string) => void
): (() => void) => {
  sharedCacheFileRemovalListeners.add(listener)
  return () => sharedCacheFileRemovalListeners.delete(listener)
}

export const isSharedCacheFileFresh = (
  filePath: string,
  now: number = Date.now()
): boolean => {
  try {
    if (!fs.existsSync(filePath)) return false
    if (typeof fs.statSync !== 'function') return true

    const mtimeMs = Number(fs.statSync(filePath).mtimeMs)
    if (!Number.isFinite(mtimeMs) || mtimeMs <= 0) return true
    if (now - mtimeMs < getSharedCacheTtlMs()) return true

    removeFileQuietly(filePath)
    return false
  } catch {
    return false
  }
}

export const writeSharedCacheFileAtomically = (
  targetPath: string,
  payload: string | NodeJS.ArrayBufferView
): boolean => {
  const tempPath = buildAtomicTempPath(targetPath)

  try {
    ensureDirectorySync(path.dirname(targetPath))

    fs.writeFileSync(tempPath, payload)
    if (typeof fs.renameSync === 'function') {
      fs.renameSync(tempPath, targetPath)
    } else {
      // Some embedders expose only the basic synchronous fs surface. Writing the
      // temporary file first still prevents serialization failures from truncating
      // an existing cache entry before the final replacement.
      fs.writeFileSync(targetPath, payload)
      removeFileQuietly(tempPath)
    }
    return true
  } catch {
    removeFileQuietly(tempPath)
    return false
  }
}

export const readSharedJsonCache = <T> (
  identity: CacheIdentity
): T | null => {
  try {
    const cachePath = buildSharedCachePath(identity, '.json')
    if (!isSharedCacheFileFresh(cachePath)) return null
    const raw = String(fs.readFileSync(cachePath, 'utf8') ?? '').trim()
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export const writeSharedJsonCache = (
  identity: CacheIdentity,
  payload: unknown
): void => {
  try {
    const serialized = JSON.stringify(payload)
    if (serialized === undefined) return
    writeSharedCacheFileAtomically(buildSharedCachePath(identity, '.json'), serialized)
  } catch {}
}

export type SharedJsonCacheOptions<T> = {
  shouldPersist?: (value: T) => boolean
}

export const resolveSharedJsonCache = async <T> (
  identity: CacheIdentity,
  loader: () => Promise<T>,
  options: SharedJsonCacheOptions<T> = {}
): Promise<{ value: T, cacheHit: boolean }> => {
  const cached = readSharedJsonCache<T>(identity)
  if (cached !== null) {
    return {
      value: cached,
      cacheHit: true
    }
  }

  const cachePath = buildSharedCachePath(identity, '.json')
  const pending = pendingJsonCacheLoads.get(cachePath) as Promise<T> | undefined
  if (pending) {
    return {
      value: await pending,
      cacheHit: false
    }
  }

  const task = (async () => {
    const value = await loader()
    if (options.shouldPersist?.(value) !== false) {
      writeSharedJsonCache(identity, value)
    }
    return value
  })()

  pendingJsonCacheLoads.set(cachePath, task)

  try {
    return {
      value: await task,
      cacheHit: false
    }
  } finally {
    pendingJsonCacheLoads.delete(cachePath)
  }
}

export type SharedJsonCacheMergeOptions<T> = {
  isComplete: (cached: T) => boolean
  loadMissing: (cached: T | null) => Promise<T | Partial<T>>
  merge: (cached: T | null, loaded: T | Partial<T>) => T
  shouldPersist?: (value: T) => boolean
}

export const resolveSharedJsonCacheWithMerge = async <T> (
  identity: CacheIdentity,
  options: SharedJsonCacheMergeOptions<T>
): Promise<{ value: T, cacheHit: boolean }> => {
  const cachePath = buildSharedCachePath(identity, '.json')
  let sawCachedValue = false

  while (true) {
    const cached = readSharedJsonCache<T>(identity)
    if (cached !== null) {
      sawCachedValue = true
      if (options.isComplete(cached)) {
        return {
          value: cached,
          cacheHit: true
        }
      }
    }

    const pending = pendingJsonCacheLoads.get(cachePath) as Promise<T> | undefined
    if (pending) {
      await pending
      continue
    }

    const task = (async () => {
      const latestCached = readSharedJsonCache<T>(identity)
      const loaded = await options.loadMissing(latestCached)
      const merged = options.merge(latestCached, loaded)
      if (options.shouldPersist?.(merged) !== false) {
        writeSharedJsonCache(identity, merged)
      }
      return merged
    })()

    pendingJsonCacheLoads.set(cachePath, task)

    try {
      return {
        value: await task,
        cacheHit: sawCachedValue
      }
    } finally {
      pendingJsonCacheLoads.delete(cachePath)
    }
  }
}

export const removeExpiredFilesRecursively = (
  dir: string,
  beforeTimestamp: number
): number => {
  let deletedCount = 0
  if (!fs.existsSync(dir)) return deletedCount

  for (const name of fs.readdirSync(dir)) {
    const filePath = path.join(dir, name)
    const stats = fs.statSync(filePath)
    if (stats.isDirectory()) {
      deletedCount += removeExpiredFilesRecursively(filePath, beforeTimestamp)
      if (fs.readdirSync(filePath).length === 0) {
        fs.rmdirSync(filePath)
      }
      continue
    }

    if (stats.mtimeMs < beforeTimestamp) {
      fs.unlinkSync(filePath)
      notifySharedCacheFileRemoved(filePath)
      deletedCount++
    }
  }

  return deletedCount
}
