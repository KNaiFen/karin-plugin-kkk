import type { RenderRequest } from '@kkk/template-contracts'
import React from 'react'

import { ComponentAutoRegistry } from '../utils/ComponentAutoRegistry'

class ComponentRendererFactory {
  /**
   * 创建组件实例
   * @param request 渲染请求对象
   * @param extraProps 额外的组件属性
   * @returns React 组件元素
   * @throws 当组件未找到或数据验证失败时抛出错误
   */
  static async createComponent<T> (
    request: RenderRequest<T>,
    extraProps: Record<string, unknown> = {}
  ): Promise<React.ReactElement> {
    const { templateType, templateName } = request

    const registryItem = ComponentAutoRegistry.get(templateType, templateName)

    if (!registryItem) {
      throw new Error(`未找到组件配置: ${templateType}:${templateName}`)
    }

    if (registryItem.validateData && !registryItem.validateData(request.data)) {
      throw new Error(`数据验证失败: ${templateType}:${templateName}`)
    }

    const props = {
      data: request.data,
      version: request.version,
      scale: request.scale,
      watermarkTextBitSize: request.watermarkTextBitSize,
      ...extraProps
    }

    // 处理嵌套模板名称（如 dynamic/DYNAMIC_TYPE_DRAW）
    if (templateName.includes('/')) {
      const subType = templateName.split('/')[1]
        ; (props as Record<string, unknown>).subType = subType
    }

    return React.createElement(
      registryItem.component as React.ComponentType<typeof props>,
      props
    )
  }
}

export { ComponentRendererFactory }
