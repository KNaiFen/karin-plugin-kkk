import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { logger } from '../utils/logger'
import type { TemplateResourcePaths } from './types'

class ResourcePathManager {
  private static packageDir: string | undefined
  private readonly resourcePaths?: TemplateResourcePaths

  constructor (resourcePaths?: TemplateResourcePaths) {
    this.resourcePaths = resourcePaths
  }

  /**
   * 获取静态资源路径配置。调用方显式传入的路径优先于模板包自带资源。
   */
  getResourcePaths (): TemplateResourcePaths {
    if (this.resourcePaths) {
      return this.resourcePaths
    }

    const possiblePaths = this.getPossibleResourcePaths(ResourcePathManager.getTemplatePackageDir())
    const cssDir = possiblePaths.cssPaths.find(candidate => fs.existsSync(candidate)) ?? possiblePaths.cssPaths[0]
    const imageDir = possiblePaths.imagePaths.find(candidate => fs.existsSync(candidate)) ?? possiblePaths.imagePaths[0]

    return { cssDir, imageDir }
  }

  private getPossibleResourcePaths (packageDir: string): { cssPaths: string[]; imagePaths: string[] } {
    return {
      cssPaths: [
        path.join(packageDir, 'dist'),
        packageDir
      ],
      imagePaths: [
        path.join(packageDir, 'dist', 'image'),
        path.join(packageDir, 'public', 'image')
      ]
    }
  }

  private static getTemplatePackageDir (): string {
    if (!ResourcePathManager.packageDir) {
      ResourcePathManager.packageDir = ResourcePathManager.findTemplatePackageDir()
    }
    return ResourcePathManager.packageDir
  }

  private static findTemplatePackageDir (): string {
    try {
      let currentDir = path.dirname(fileURLToPath(import.meta.url))

      for (let i = 0; i < 10; i++) {
        const packageJsonPath = path.join(currentDir, 'package.json')
        if (fs.existsSync(packageJsonPath)) {
          try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as { name?: string }
            if (packageJson.name === 'template') {
              return currentDir
            }
          } catch {
            // 继续向上查找包根目录。
          }
        }

        const parentDir = path.dirname(currentDir)
        if (parentDir === currentDir) break
        currentDir = parentDir
      }
    } catch (error) {
      logger.debug('查找 template 包目录失败:', error)
    }

    return process.cwd()
  }
}

export { ResourcePathManager }
