import fs from 'node:fs'
import path from 'node:path'

export type VideoPreviewInfo = {
  filename: string
  filePath: string
  createdAt: number
  expireAt?: number
  removeCache: boolean
  removedAt?: number
  cleanupAt?: number
}

export class VideoPreviewStore {
  private static readonly REMOVED_RETENTION_MS = 5 * 60 * 1000
  private static readonly SWEEP_INTERVAL_MS = 10 * 60 * 1000

  private readonly state = new Map<string, VideoPreviewInfo>()

  constructor () {
    const cleanupTimer = setInterval(() => {
      this.prune()
    }, VideoPreviewStore.SWEEP_INTERVAL_MS)
    cleanupTimer.unref?.()
  }

  register (filePath: string, removeCache: boolean, ttlMs: number): VideoPreviewInfo {
    this.prune()
    const filename = path.basename(filePath)
    const createdAt = Date.now()
    const expireAt = removeCache ? createdAt + ttlMs : undefined
    const info: VideoPreviewInfo = {
      filename,
      filePath,
      createdAt,
      expireAt,
      removeCache
    }
    this.state.set(filename, info)
    return info
  }

  get (filename: string): VideoPreviewInfo | null {
    this.prune()
    return this.state.get(filename) ?? null
  }

  markRemoved (filePathOrFilename: string): VideoPreviewInfo | null {
    this.prune()
    const filename = filePathOrFilename.includes('/') || filePathOrFilename.includes('\\')
      ? path.basename(filePathOrFilename)
      : filePathOrFilename
    const info = this.state.get(filename)
    if (!info) return null

    const updated: VideoPreviewInfo = {
      ...info,
      removedAt: Date.now(),
      cleanupAt: Date.now() + VideoPreviewStore.REMOVED_RETENTION_MS
    }
    this.state.set(filename, updated)
    return updated
  }

  private prune (now = Date.now()) {
    for (const [filename, info] of this.state) {
      const fileMissing = !fs.existsSync(info.filePath)
      const shouldMarkRemoved = !info.removedAt && (
        (info.removeCache && typeof info.expireAt === 'number' && now >= info.expireAt && fileMissing) ||
        (!info.removeCache && fileMissing)
      )

      if (shouldMarkRemoved) {
        const removedAt = now
        this.state.set(filename, {
          ...info,
          removedAt,
          cleanupAt: removedAt + VideoPreviewStore.REMOVED_RETENTION_MS
        })
        continue
      }

      if (info.cleanupAt && now >= info.cleanupAt) {
        this.state.delete(filename)
      }
    }
  }
}
