import fs from 'node:fs'
import path from 'node:path'

import type {
  DataTypeMap,
  RenderRequest,
  RenderResponse
} from '@kkk/template-contracts'
import { renderToString } from 'react-dom/server'

import { ComponentAutoRegistry } from '../utils/ComponentAutoRegistry'
import { DevDataManager } from '../utils/DevDataManager'
import { logger } from '../utils/logger'
import { ComponentRendererFactory } from './ComponentRendererFactory'
import { buildDevPreviewPayload } from './devPreviewPayload'
import { HtmlWrapper } from './HtmlWrapper'
import { PluginContainer } from './PluginContainer'
import { ResourcePathManager } from './ResourcePathManager'
import type { Plugin, PluginContext, TemplateResourcePaths } from './types'

class SSRRender {
  private outputDir: string
  private resourceManager: ResourcePathManager
  private htmlWrapper: HtmlWrapper
  private pluginContainer: PluginContainer

  constructor (options: { plugins?: Plugin[], outputDir: string, resourcePaths?: TemplateResourcePaths }) {
    const { plugins = [], outputDir, resourcePaths } = options
    this.resourceManager = new ResourcePathManager(resourcePaths)
    this.htmlWrapper = new HtmlWrapper(this.resourceManager)
    this.outputDir = outputDir
    this.pluginContainer = new PluginContainer(plugins)
  }

  /**
   * SSR 渲染组件为 HTML 字符串
   * @param request 渲染请求参数
   * @returns 渲染结果
   */
  public async render<T> (request: RenderRequest<T>): Promise<RenderResponse> {
    try {
      logger.debug('[SSR] 开始渲染组件，预设模板:', `${logger.yellow(`${request.templateType}/`)}${request.templateName}`)

      const ctx: PluginContext<T> = {
        request,
        outputDir: this.outputDir,
        resourceManager: this.resourceManager,
        state: { props: {}, component: null }
      }

      // 渲染前插件
      await this.pluginContainer.runBefore(ctx)

      // 创建组件（仅透传插件产生的 props）
      let component = await ComponentRendererFactory.createComponent(
        request,
        ctx.state.props
      )

      ctx.state.component = component

      // 渲染时插件（可包裹或替换组件）
      await this.pluginContainer.runDuring(ctx)

      const htmlContent = renderToString(ctx.state.component ?? component)

      ctx.state.html = htmlContent

      // 渲染后插件（可修改 HTML）
      await this.pluginContainer.runAfter(ctx)

      // 生成文件路径
      const safeTemplateName = request.templateName.replace(/\//g, '_')
      const fileName = `${request.templateType}_${safeTemplateName}_${Date.now()}.html`
      const filePath = path.join(this.outputDir, fileName)

      // 包装并写入
      const fullHtml = this.htmlWrapper.wrapContent(
        ctx.state.html ?? htmlContent,
        filePath,
        request.data.useDarkTheme ?? false
      )

      fs.writeFileSync(filePath, fullHtml, 'utf-8')

      if (process.env.NODE_ENV === 'development') {
        DevDataManager.saveRenderData(
          request.templateType,
          request.templateName,
          buildDevPreviewPayload(request.data, ctx.state.props)
        )
      }

      return {
        success: true,
        htmlPath: filePath
      }
    } catch (error) {
      logger.error('❌ 渲染组件失败:', error)
      return {
        success: false,
        htmlPath: '',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

/**
 * 渲染器配置选项接口
 * @template K 模板类型键
 */
interface ReactServerRenderOptions<K extends keyof DataTypeMap> {
  /** 渲染请求对象 */
  request: RenderRequest<DataTypeMap[K]>
  /** 输出目录路径 */
  outputDir: string
  /** 插件列表 */
  plugins?: Plugin[]
  /** 由调用方提供的模板样式与图片资源目录 */
  resourcePaths?: TemplateResourcePaths
}

/**
 * SSR 预渲染组件为 HTML 的具体实现
 *
 * @template K 模板类型键，用于类型推断
 * @param options 渲染配置选项
 * @returns 渲染结果 Promise
 *
 * # Example
 * ```typescript
 * // 基础使用
 * const result = await reactServerRender({
 *   request: {
 *     templateType: 'douyin',
 *     templateName: 'videoInfo',
 *     data: { share_url: 'https://example.com' }
 *   },
 *   outputDir: './output'
 * })
 *
 * // 使用插件
 * const result = await reactServerRender({
 *   request: renderRequest,
 *   outputDir: './output',
 *   plugins: [customPlugin()]
 * })
 * ```
 */
const reactServerRender = async <K extends keyof DataTypeMap> (
  options: ReactServerRenderOptions<K>
): Promise<RenderResponse> => {
  const {
    request,
    outputDir,
    plugins = [],
    resourcePaths
  } = options

  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // 初始化组件注册表
  await ComponentAutoRegistry.initialize()

  // 创建渲染器实例
  const renderClient = new SSRRender({ plugins, outputDir, resourcePaths })

  return await renderClient.render(request)
}

export { reactServerRender, SSRRender }
export type { ReactServerRenderOptions }
