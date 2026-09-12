import fs from 'node:fs'
import { resolve } from 'node:path'

import type { Plugin } from 'vite'

/**
 * 递归复制目录
 * @param sourceDir 源目录路径
 * @param targetDir 目标目录路径
 */
const copyDirectory = (sourceDir: string, targetDir: string) => {
  if (!fs.existsSync(sourceDir)) {
    console.warn('⚠️ 源目录不存在:', sourceDir)
    return
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }

  const files = fs.readdirSync(sourceDir)

  files.forEach(file => {
    const sourcePath = resolve(sourceDir, file)
    const targetPath = resolve(targetDir, file)

    if (fs.statSync(sourcePath).isDirectory()) {
      copyDirectory(sourcePath, targetPath)
    } else {
      fs.copyFileSync(sourcePath, targetPath)
    }
  })
}

/**
 * 复制 template 样式和静态资源的 Vite 插件
 * @description 在构建时将 template CSS 复制到 core 的 lib 目录，将 public 静态资源复制到 resources 目录
 * @param rootDir 项目根目录路径
 * @returns Vite 插件对象
 */
export const copyTemplateAssetsPlugin = (rootDir: string): Plugin => {
  return {
    name: 'copy-template-assets',
    writeBundle() {
      const cssSourceFile = resolve(rootDir, '../template/dist/main.css')
      const cssTargetFile = resolve(rootDir, 'lib/karin-plugin-kkk.css')
      const cssTargetDir = resolve(rootDir, 'lib')

      if (!fs.existsSync(cssTargetDir)) {
        fs.mkdirSync(cssTargetDir, { recursive: true })
      }

      if (fs.existsSync(cssSourceFile)) {
        fs.copyFileSync(cssSourceFile, cssTargetFile)
        console.log('✅ CSS文件已复制到:', cssTargetFile)
      } else {
        console.warn('⚠️ template CSS 文件不存在，外链长卡可能缺少样式:', cssSourceFile)
      }

      // 1. 复制 template 包的静态资源
      const SourceDir = resolve(rootDir, '../template/public')
      const TargetDir = resolve(rootDir, 'resources')

      console.log('🔍 开始复制 template 静态资源...')
      console.log('📁 源目录:', SourceDir)
      console.log('📁 目标目录:', TargetDir)

      // 先删除原有目标文件夹
      if (fs.existsSync(TargetDir)) {
        console.log('🗑️ 删除原有目标目录:', TargetDir)
        // recursive: true 递归删除文件夹；force: true 不存在也不抛错
        fs.rmSync(TargetDir, { recursive: true, force: true })
      }

      // 再全新复制
      copyDirectory(SourceDir, TargetDir)
      console.log('✅ template 静态资源已复制到:', TargetDir)
    }
  }
}
