import type { RenderRequest } from '@kkk/template-contracts'
import type React from 'react'

export type { DataTypeMap, TypedRenderRequest } from '@kkk/template-contracts'

export type PluginEnforce = 'pre' | 'normal' | 'post'

export type TemplateResourcePaths = {
  cssDir: string
  imageDir: string
}

export type ResourceManagerLike = {
  getResourcePaths: () => TemplateResourcePaths
}

/**
 * 渲染状态接口
 * 用于在插件之间传递和修改渲染状态
 */
export interface RenderState {
  /** 传递给组件的额外属性 */
  props: Record<string, unknown>
  /** React 组件实例 */
  component?: React.ReactElement | null
  /** 渲染后的 HTML 字符串 */
  html?: string
}

/**
 * 插件上下文接口
 * 提供插件执行时所需的所有上下文信息
 * @template T 渲染数据类型
 */
export interface PluginContext<T = Record<string, unknown>> {
  /** 渲染请求对象 */
  request: RenderRequest<T>
  /** 输出目录路径 */
  outputDir: string
  /** 资源路径管理器实例 */
  resourceManager: ResourceManagerLike
  /** 当前渲染状态 */
  state: RenderState
}

/**
 * 模板插件接口
 * 定义插件的生命周期钩子和配置
 * @template T 渲染数据类型
 */
export interface TemplatePlugin<T = Record<string, unknown>> {
  /** 插件名称，用于标识和调试 */
  name: string
  /** 插件执行时机，默认为 'normal' */
  enforce?: PluginEnforce
  /** 插件应用条件，返回 true 时插件生效 */
  apply?: (request: RenderRequest<T>) => boolean
  /** 渲染前钩子，用于准备数据和属性 */
  beforeRender?: (ctx: PluginContext<T>) => Promise<void> | void
  /** 渲染时钩子，可以包装或替换组件 */
  render?: (ctx: PluginContext<T>) => Promise<void> | void
  /** 渲染后钩子，可以修改最终的 HTML */
  afterRender?: (ctx: PluginContext<T>) => Promise<void> | void
}

/**
 * 简化的插件类型，下游使用时无需手动指定泛型
 * 自动使用 Record<string, unknown> 作为数据类型
 */
export type Plugin = TemplatePlugin<Record<string, unknown>>

export type PluginFactory<T = Record<string, unknown>> = (options?: T) => Plugin
