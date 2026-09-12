import fs from 'node:fs'
import path from 'node:path'

import { createNotFoundResponse, logger } from 'node-karin'
import type { Response } from 'node-karin/express'

export const validateVideoRequest = (
  filename: string | undefined,
  res: Response,
  videoDir: string
): string | null => {
  if (!filename) {
    createNotFoundResponse(res, '无效的文件名')
    return null
  }

  const intendedBaseDir = path.resolve(videoDir)
  const requestedPath = path.join(intendedBaseDir, filename)
  const resolvedPath = path.normalize(requestedPath)

  if (!resolvedPath.startsWith(intendedBaseDir + path.sep) || filename.includes('/') || filename.includes('\\')) {
    logger.warn(`潜在的路径穿越尝试或无效文件名: ${filename}, 解析路径: ${resolvedPath}`)
    createNotFoundResponse(res, '无效的文件名或路径')
    return null
  }

  if (path.basename(filename) !== filename) {
    logger.warn(`文件名包含路径分隔符: ${filename}`)
    createNotFoundResponse(res, '无效的文件名')
    return null
  }

  if (!fs.existsSync(resolvedPath)) {
    createNotFoundResponse(res, '视频文件未找到')
    return null
  }

  return resolvedPath
}
