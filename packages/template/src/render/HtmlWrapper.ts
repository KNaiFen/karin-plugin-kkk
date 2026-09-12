import fs from 'node:fs'
import path from 'node:path'

import { logger } from '../utils/logger'
import type { ResourceManagerLike } from './types'

const FONT_FACE_BLOCK_RE = /@font-face\s*{[\s\S]*?}\s*/g
const REMOTE_FONT_PATH_MARKER = 'commonResource/font/'
const HARMONY_FONT_FAMILY_RE = /font-family:\s*(["']?)HarmonyOSHans-Regular\1/g
const SYSTEM_SANS_FONT_STACK = [
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  '"PingFang SC"',
  '"Hiragino Sans GB"',
  '"Microsoft YaHei"',
  '"Noto Sans SC"',
  'sans-serif'
].join(', ')

class HtmlWrapper {
  private resourceManager: ResourceManagerLike

  constructor (resourceManager: ResourceManagerLike) {
    this.resourceManager = resourceManager
  }

  private resolvePrimaryStyleFiles (cssDir: string): string[] {
    const preferredFiles = [
      path.join(cssDir, 'karin-plugin-kkk.css'),
      path.join(cssDir, 'main.css')
    ]

    const existingPreferredFiles = preferredFiles.filter(filePath => fs.existsSync(filePath))
    if (existingPreferredFiles.length > 0) return existingPreferredFiles

    if (!fs.existsSync(cssDir)) return []

    return fs.readdirSync(cssDir)
      .filter(fileName => fileName.endsWith('.css'))
      .sort((left, right) => left.localeCompare(right))
      .map(fileName => path.join(cssDir, fileName))
  }

  private getAssetMimeType (assetPath: string): string {
    const ext = path.extname(assetPath).toLowerCase()

    switch (ext) {
      case '.woff2': return 'font/woff2'
      case '.woff': return 'font/woff'
      case '.ttf': return 'font/ttf'
      case '.otf': return 'font/otf'
      case '.eot': return 'application/vnd.ms-fontobject'
      case '.svg': return 'image/svg+xml'
      case '.png': return 'image/png'
      case '.jpg':
      case '.jpeg': return 'image/jpeg'
      case '.gif': return 'image/gif'
      case '.webp': return 'image/webp'
      case '.avif': return 'image/avif'
      default: return 'application/octet-stream'
    }
  }

  private toDataUri (assetPath: string): string | null {
    if (!fs.existsSync(assetPath)) {
      logger.warn('未找到静态资源文件，跳过内联:', assetPath)
      return null
    }

    const mimeType = this.getAssetMimeType(assetPath)
    const fileBuffer = fs.readFileSync(assetPath)
    return `data:${mimeType};base64,${fileBuffer.toString('base64')}`
  }

  /**
   * 加载并处理CSS文件，将其中的相对资源路径转换为内联 data URI
   * @param cssFilePath CSS文件的完整路径
   * @returns 处理后的CSS内容字符串
   */
  private loadInlineCss (cssFilePath: string): string {
    if (!fs.existsSync(cssFilePath)) {
      logger.warn('未找到 CSS 文件，跳过内联:', cssFilePath)
      return ''
    }

    const cssDir = path.dirname(cssFilePath)
    const cssContent = this.normalizeInlineCss(fs.readFileSync(cssFilePath, 'utf-8'))

    return cssContent.replace(
      /url\((['"]?)(?!data:|https?:|file:|#)([^)'"]+)\1\)/g,
      (_match, quote: string, assetPath: string) => {
        const normalizedAssetPath = assetPath.trim()
        if (!normalizedAssetPath || normalizedAssetPath.startsWith('/')) {
          return `url(${quote}${normalizedAssetPath}${quote})`
        }

        const absoluteAssetPath = path.resolve(cssDir, normalizedAssetPath)
        const dataUri = this.toDataUri(absoluteAssetPath)
        return dataUri ? `url(${quote}${dataUri}${quote})` : `url(${quote}${normalizedAssetPath}${quote})`
      }
    )
  }

  private normalizeInlineCss (cssContent: string): string {
    return cssContent
      .replace(
        FONT_FACE_BLOCK_RE,
        fontFaceBlock => fontFaceBlock.includes(REMOTE_FONT_PATH_MARKER) ? '' : fontFaceBlock
      )
      .replace(HARMONY_FONT_FAMILY_RE, 'font-family: var(--kkk-sans-font)')
  }

  /**
   * 收集并内联加载多个CSS样式文件的内容
   * @param htmlFilePath HTML文件的路径，用于计算相对路径
   * @param includeFonts 是否包含字体样式文件，默认为true
   * @returns 合并后的CSS样式内容字符串
   */
  getInlineStyles (_htmlFilePath: string, includeFonts: boolean = true): string {
    const { cssDir, imageDir } = this.resourceManager.getResourcePaths()
    const fontDir = path.join(path.dirname(imageDir), 'font')
    const styleFiles = this.resolvePrimaryStyleFiles(cssDir)

    if (includeFonts) {
      styleFiles.unshift(
        path.join(fontDir, 'bilifont', 'font.css'),
        path.join(fontDir, 'mono', 'font.css'),
        path.join(fontDir, 'fansmedal-num', 'font.css')
      )
    }

    return styleFiles
      .map(filePath => this.loadInlineCss(filePath))
      .filter(Boolean)
      .join('\n')
  }

  /**
   * 包装内容为完整的 HTML 文档
   * @param htmlContent 组件渲染后的 HTML 内容
   * @param htmlFilePath HTML 文件的输出路径
   * @param isDark 是否使用深色主题
   * @returns 完整的 HTML 文档字符串
   */
  wrapContent (htmlContent: string, htmlFilePath: string, isDark: boolean = false): string {
    const htmlDir = path.dirname(htmlFilePath)
    const { imageDir } = this.resourceManager.getResourcePaths()
    const inlineStyles = this.getInlineStyles(htmlFilePath)

    // 计算相对路径
    const imageRelativePath = path.relative(htmlDir, imageDir).replace(/\\/g, '/')

    // 处理图片路径 - 替换所有可能的图片路径格式
    let processedHtml = htmlContent
      // 处理 /image/ 开头的路径
      .replace(/src="\/image\//g, `src="${imageRelativePath}/`)
      // 处理 src="/image/ 的情况
      .replace(/src='\/image\//g, `src='${imageRelativePath}/`)
      // 处理可能的绝对路径
      .replace(/src="image\//g, `src="${imageRelativePath}/`)

    return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width">
      <style>${inlineStyles}</style>
      <style>
        :root {
          --kkk-sans-font: ${SYSTEM_SANS_FONT_STACK};
        }
        html, body {
          margin: 0;
          padding: 0;
          background: #ffffff !important;
          font-family: var(--kkk-sans-font);
        }
        body {
          display: flex;
          align-items: flex-start;
          justify-content: flex-start;
        }
        #container {
          border-radius: 5rem;
          overflow: hidden;
          background-clip: padding-box;
        }
      </style>
    </head>
    <body class="${isDark ? 'dark' : ''}">
      ${processedHtml}
    </body>
    </html>
    `
  }
}

export { HtmlWrapper }
