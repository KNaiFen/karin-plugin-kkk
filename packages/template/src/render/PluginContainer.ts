import type { RenderRequest } from '@kkk/template-contracts'

import { logger } from '../utils/logger'
import type { PluginContext, TemplatePlugin } from './types'

class PluginContainer {
  private plugins: TemplatePlugin[] = []

  constructor (plugins: TemplatePlugin[]) {
    const order = { pre: -1, normal: 0, post: 1 }
    this.plugins = [...plugins].sort((a, b) => (order[a.enforce ?? 'normal']) - (order[b.enforce ?? 'normal']))
  }

  /**
   * 判断插件是否应该应用于当前请求
   * @param plugin 插件实例
   * @param request 渲染请求
   * @returns 是否应用插件
   */
  private shouldApply (plugin: TemplatePlugin, request: RenderRequest<any>): boolean {
    try {
      return plugin.apply ? plugin.apply(request) : true
    } catch (err) {
      logger.warn(`插件 ${plugin.name} 的 apply() 抛出异常，已跳过`, err)
      return false
    }
  }

  /**
   * 执行渲染前插件
   * @param ctx 插件上下文
   */
  async runBefore (ctx: PluginContext<any>): Promise<void> {
    for (const plugin of this.plugins) {
      if (this.shouldApply(plugin, ctx.request)) {
        await plugin.beforeRender?.(ctx)
      }
    }
  }

  /**
   * 执行渲染时插件
   * @param ctx 插件上下文
   */
  async runDuring (ctx: PluginContext<any>): Promise<void> {
    for (const plugin of this.plugins) {
      if (this.shouldApply(plugin, ctx.request)) {
        await plugin.render?.(ctx)
      }
    }
  }

  /**
   * 执行渲染后插件
   * @param ctx 插件上下文
   */
  async runAfter (ctx: PluginContext<any>): Promise<void> {
    for (const plugin of this.plugins) {
      if (this.shouldApply(plugin, ctx.request)) {
        await plugin.afterRender?.(ctx)
      }
    }
  }
}

export { PluginContainer }
