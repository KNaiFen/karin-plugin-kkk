import path from 'node:path'

import { karinPathTemp } from 'node-karin/root'

import { Root } from '../../../root'

export type TempDirectories = {
  /** 插件缓存目录 */
  default: string
  /** 视频缓存文件 */
  video: string
  /** 图片缓存文件 */
  images: string
  /** 可复用共享缓存 */
  cache: {
    root: string
    parsedPost: string
    workBundle: string
    media: string
    renderAssets: string
    derived: string
  }
}

export const createTempDirectories = (): TempDirectories => {
  const root = `${karinPathTemp}/${Root.pluginName}/`.replace(/\\/g, '/')
  const cacheRoot = `${root}cache/`

  return {
    default: root,
    video: `${root}kkkdownload/video/`,
    images: `${root}kkkdownload/images/`,
    cache: {
      root: cacheRoot,
      parsedPost: `${cacheRoot}parsed-post/`,
      workBundle: `${cacheRoot}work-bundle/`,
      media: `${cacheRoot}media/`,
      renderAssets: `${cacheRoot}render-assets/`,
      derived: `${cacheRoot}derived/`
    }
  }
}

export const normalizeCachePath = (filePath: string): string => {
  return path.resolve(filePath).replace(/\\/g, '/')
}

export const isPathInsideTempRoot = (filePath: string, tempRoot: string): boolean => {
  const normalizedRoot = normalizeCachePath(tempRoot)
  const normalizedPath = normalizeCachePath(filePath)
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`)
}
