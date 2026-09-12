import fs from 'node:fs'
import path from 'node:path'

import { logger } from 'node-karin'

import {
  buildSharedCacheHash,
  buildSharedCachePath,
  type CacheIdentity,
  getSharedCacheTtlMs,
  isSharedCacheFileFresh,
  normalizeSharedCacheExtension,
  onSharedCacheFileRemoved,
  removeSharedCacheFile,
  writeSharedCacheFileAtomically
} from './sharedCache'

export type { CacheIdentity } from './sharedCache'

type DerivedArtifactResult<T> = {
  success: boolean
  payload?: T
}

const pendingDerivedBuilds = new Map<string, Promise<DerivedArtifactResult<unknown>>>()
const MAX_FILE_CACHE_IDENTITIES = 512

type FileCacheIdentityEntry = {
  identity: CacheIdentity
  sourceVersion: string
  expiresAt: number
}

const fileCacheIdentityMap = new Map<string, FileCacheIdentityEntry>()

onSharedCacheFileRemoved((filePath) => {
  fileCacheIdentityMap.delete(filePath)
})

const normalizeStructuredValue = (value: unknown): unknown => {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(item => normalizeStructuredValue(item))
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nestedValue]) => typeof nestedValue !== 'function' && typeof nestedValue !== 'symbol')
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, normalizeStructuredValue(nestedValue)])
    )
  }
  return String(value)
}

const stableStringify = (value: unknown): string => JSON.stringify(normalizeStructuredValue(value))

const ensureParentDirectory = (filePath: string): void => {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

const copyArtifactToTarget = (sourcePath: string, targetPath: string): void => {
  if (sourcePath === targetPath) return

  ensureParentDirectory(targetPath)
  const tempTargetPath = buildDerivedTempPath(targetPath)
  const previousTargetPath = fs.existsSync(targetPath) ? buildDerivedTempPath(targetPath) : null

  try {
    try {
      fs.linkSync(sourcePath, tempTargetPath)
    } catch {
      fs.copyFileSync(sourcePath, tempTargetPath)
    }

    if (typeof fs.renameSync === 'function') {
      if (previousTargetPath) {
        fs.renameSync(targetPath, previousTargetPath)
      }
      fs.renameSync(tempTargetPath, targetPath)
      if (previousTargetPath) cleanupDerivedTempFile(previousTargetPath)
    } else {
      fs.copyFileSync(tempTargetPath, targetPath)
      cleanupDerivedTempFile(tempTargetPath)
    }
  } catch (error) {
    cleanupDerivedTempFile(tempTargetPath)
    if (previousTargetPath && fs.existsSync(previousTargetPath) && !fs.existsSync(targetPath)) {
      try {
        fs.renameSync(previousTargetPath, targetPath)
      } catch {}
    }
    throw error
  }
}

const readDerivedPayload = <T> (payloadPath: string): T | undefined => {
  if (!isSharedCacheFileFresh(payloadPath)) return undefined

  try {
    const raw = String(fs.readFileSync(payloadPath, 'utf8') ?? '').trim()
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { payload?: T }
    return parsed.payload
  } catch (error) {
    logger.warn(`[DerivedCache] 读取派生产物元数据失败，已忽略：${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

const writeDerivedPayload = <T> (payloadPath: string, payload: T | undefined): void => {
  if (payload === undefined) return

  try {
    ensureParentDirectory(payloadPath)
    writeSharedCacheFileAtomically(payloadPath, JSON.stringify({ payload }))
  } catch (error) {
    logger.warn(`[DerivedCache] 写入派生产物元数据失败，已忽略：${error instanceof Error ? error.message : String(error)}`)
  }
}

const cleanupDerivedTempFile = (filePath: string): void => {
  if (!fs.existsSync(filePath)) return

  try {
    fs.rmSync(filePath, { force: true })
  } catch (error) {
    logger.warn(`[DerivedCache] 清理派生产物临时文件失败：${filePath} ${error instanceof Error ? error.message : String(error)}`)
  }
}

const buildDerivedTempPath = (cachePath: string): string => {
  const extension = path.extname(cachePath)
  const suffix = `.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`

  if (!extension) {
    return `${cachePath}${suffix}`
  }

  return `${cachePath.slice(0, -extension.length)}${suffix}${extension}`
}

const resolveFileSourceVersion = (filePath: string): string | null => {
  try {
    if (!fs.existsSync(filePath)) return null
    if (typeof fs.statSync !== 'function') return 'unversioned'

    const stats = fs.statSync(filePath)
    return buildSharedCacheHash(
      String(stats.size),
      String(stats.mtimeMs),
      String(stats.ctimeMs ?? ''),
      String(stats.ino ?? '')
    )
  } catch {
    return null
  }
}

const trimFileCacheIdentityMap = (): void => {
  while (fileCacheIdentityMap.size > MAX_FILE_CACHE_IDENTITIES) {
    const oldestPath = fileCacheIdentityMap.keys().next().value
    if (typeof oldestPath !== 'string') return
    fileCacheIdentityMap.delete(oldestPath)
  }
}

const forgetFileCacheIdentity = (filePath: string): void => {
  fileCacheIdentityMap.delete(filePath)
}

const isFreshDerivedArtifact = (cachePath: string, payloadPath: string): boolean => {
  if (isSharedCacheFileFresh(cachePath)) return true

  removeSharedCacheFile(payloadPath)
  forgetFileCacheIdentity(cachePath)
  return false
}

const refreshFileCacheIdentity = (
  filePath: string,
  cacheIdentity: CacheIdentity
): void => {
  const entry = fileCacheIdentityMap.get(filePath)
  if (!entry) {
    rememberFileCacheIdentity(filePath, cacheIdentity)
    return
  }

  fileCacheIdentityMap.delete(filePath)
  fileCacheIdentityMap.set(filePath, {
    ...entry,
    identity: cacheIdentity,
    expiresAt: Date.now() + getSharedCacheTtlMs()
  })
}

export const rememberFileCacheIdentity = (
  filePath: string | undefined | null,
  cacheIdentity: CacheIdentity | undefined | null
): void => {
  const normalizedPath = String(filePath ?? '').trim()
  if (!normalizedPath || !cacheIdentity) return
  const sourceVersion = resolveFileSourceVersion(normalizedPath)
  if (!sourceVersion) {
    forgetFileCacheIdentity(normalizedPath)
    return
  }

  fileCacheIdentityMap.delete(normalizedPath)
  fileCacheIdentityMap.set(normalizedPath, {
    identity: cacheIdentity,
    sourceVersion,
    expiresAt: Date.now() + getSharedCacheTtlMs()
  })
  trimFileCacheIdentityMap()
}

export const resolveFileCacheIdentity = (
  filePath: string | undefined | null
): CacheIdentity | null => {
  const normalizedPath = String(filePath ?? '').trim()
  if (!normalizedPath) return null
  const entry = fileCacheIdentityMap.get(normalizedPath)
  if (!entry) return null

  const sourceVersion = resolveFileSourceVersion(normalizedPath)
  if (!sourceVersion || sourceVersion !== entry.sourceVersion || entry.expiresAt <= Date.now()) {
    forgetFileCacheIdentity(normalizedPath)
    return null
  }

  fileCacheIdentityMap.delete(normalizedPath)
  fileCacheIdentityMap.set(normalizedPath, entry)
  return {
    ...entry.identity,
    key: `${entry.identity.key}:source-${entry.sourceVersion}`
  }
}

export const buildDerivedCacheIdentity = (
  kind: string,
  sourceIdentities: Array<CacheIdentity | null | undefined>,
  config?: unknown
): CacheIdentity | null => {
  const sourceKeys = sourceIdentities
    .map(identity => identity ? `${identity.scope}:${identity.key}` : '')
    .filter(Boolean)

  if (sourceKeys.length !== sourceIdentities.filter(Boolean).length) {
    return null
  }
  if (sourceKeys.length === 0) return null

  return {
    scope: 'derived',
    key: `${kind}:${buildSharedCacheHash(
      ...sourceKeys,
      stableStringify(config ?? null)
    )}`
  }
}

export const resolveDerivedArtifact = async <T> (
  cacheIdentity: CacheIdentity | null | undefined,
  outputPath: string,
  builder: (cacheOutputPath: string) => Promise<DerivedArtifactResult<T>>
): Promise<DerivedArtifactResult<T>> => {
  if (!cacheIdentity) {
    return await builder(outputPath)
  }

  const extension = normalizeSharedCacheExtension(path.extname(outputPath), '.bin')
  const cachePath = buildSharedCachePath(cacheIdentity, extension)
  const payloadPath = buildSharedCachePath(cacheIdentity, '.json')

  if (isFreshDerivedArtifact(cachePath, payloadPath)) {
    copyArtifactToTarget(cachePath, outputPath)
    refreshFileCacheIdentity(cachePath, cacheIdentity)
    rememberFileCacheIdentity(outputPath, cacheIdentity)
    return {
      success: true,
      payload: readDerivedPayload<T>(payloadPath)
    }
  }

  const pending = pendingDerivedBuilds.get(cachePath) as Promise<DerivedArtifactResult<T>> | undefined
  if (pending) {
    const result = await pending
    if (result.success && isFreshDerivedArtifact(cachePath, payloadPath)) {
      copyArtifactToTarget(cachePath, outputPath)
      refreshFileCacheIdentity(cachePath, cacheIdentity)
      rememberFileCacheIdentity(outputPath, cacheIdentity)
    }
    return result
  }

  const tempCachePath = buildDerivedTempPath(cachePath)
  const task = (async () => {
    let result: DerivedArtifactResult<T>
    try {
      result = await builder(tempCachePath)
    } catch (error) {
      cleanupDerivedTempFile(tempCachePath)
      throw error
    }

    if (!result.success || !fs.existsSync(tempCachePath)) {
      cleanupDerivedTempFile(tempCachePath)
      return result
    }

    ensureParentDirectory(cachePath)
    const staleCachePath = fs.existsSync(cachePath) ? buildDerivedTempPath(cachePath) : null
    try {
      if (staleCachePath) {
        fs.renameSync(cachePath, staleCachePath)
      }
      fs.renameSync(tempCachePath, cachePath)
      if (staleCachePath) cleanupDerivedTempFile(staleCachePath)
    } catch (error) {
      cleanupDerivedTempFile(tempCachePath)
      if (staleCachePath && fs.existsSync(staleCachePath) && !fs.existsSync(cachePath)) {
        try {
          fs.renameSync(staleCachePath, cachePath)
        } catch {}
      }
      logger.warn(`[DerivedCache] 原子提交派生产物失败，保留原缓存：${error instanceof Error ? error.message : String(error)}`)
      return { success: false }
    }
    writeDerivedPayload(payloadPath, result.payload)
    refreshFileCacheIdentity(cachePath, cacheIdentity)
    return result
  })()

  pendingDerivedBuilds.set(cachePath, task)

  try {
    const result = await task
    if (result.success && isFreshDerivedArtifact(cachePath, payloadPath)) {
      copyArtifactToTarget(cachePath, outputPath)
      refreshFileCacheIdentity(cachePath, cacheIdentity)
      rememberFileCacheIdentity(outputPath, cacheIdentity)
    }
    return result
  } finally {
    pendingDerivedBuilds.delete(cachePath)
  }
}
