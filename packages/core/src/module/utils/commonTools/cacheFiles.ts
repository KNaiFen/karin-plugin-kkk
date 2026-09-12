import fs from 'node:fs'

import { logger } from 'node-karin'

import { Config } from '@/module/utils/Config'

import { isPathInsideTempRoot } from './tempDirectories'

export const removeCacheFile = async (
  filePath: string,
  tempRoot: string,
  force = false
): Promise<boolean> => {
  const normalizedPath = filePath.replace(/\\/g, '/')

  if (!isPathInsideTempRoot(normalizedPath, tempRoot)) {
    logger.warn(`拒绝删除非插件缓存目录文件: ${normalizedPath}`)
    return false
  }

  if (Config.app.removeCache || force) {
    try {
      await fs.promises.unlink(normalizedPath)
      logger.mark('缓存文件: ', normalizedPath + ' 删除成功！')
      return true
    } catch (err) {
      logger.error('缓存文件: ', normalizedPath + ' 删除失败！', err)
      return false
    }
  }

  return true
}
