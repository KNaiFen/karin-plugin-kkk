/**
 * 配置管理 API
 * 提供配置的增删改查接口，供 APP 端使用
 */
import type { Request, Response } from 'node-karin/express'

import { Config } from '@/module/utils/Config'
import { mergeConfigObjects, normalizeDottedConfigObject } from '@/module/utils/configPath'
import type { ConfigType } from '@/types'

import {
  buildInvalidConfigMessage,
  validateAppAliasPatchKey,
  validateModuleConfigPayload,
  validateSummaryParsePatchKey
} from './configValidation'

type AppAliasModuleKey = 'summaryParse' | 'detailedSummaryParse' | 'transcriptOriginal'
type ConfigModuleKey = keyof ConfigType | AppAliasModuleKey

const appAliasModules = new Set<AppAliasModuleKey>(['summaryParse', 'detailedSummaryParse', 'transcriptOriginal'])

const isAppAliasModule = (module: string): module is AppAliasModuleKey => appAliasModules.has(module as AppAliasModuleKey)

const mergeAppAliasIntoAppConfig = (
  appConfig: ConfigType['app'],
  module: AppAliasModuleKey,
  aliasConfig: unknown
): ConfigType['app'] => {
  return mergeConfigObjects(appConfig, {
    [module]: normalizeDottedConfigObject(aliasConfig)
  } as Partial<ConfigType['app']>)
}

const getAppAliasConfig = (
  appConfig: ConfigType['app'],
  module: AppAliasModuleKey
) => appConfig[module]

const stripHttpMethodOverride = (body: unknown): unknown => {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.hasOwn(body, '_method')) {
    return body
  }

  const { _method: _ignored, ...configBody } = body as Record<string, unknown>
  return configBody
}

/**
 * 获取所有配置
 * GET /api/kkk/v1/config
 */
export const getAllConfig = async (_req: Request, res: Response) => {
  try {
    const config = await Config.All()
    res.json({
      success: true,
      message: '获取配置成功',
      data: config
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `获取配置失败: ${error.message}`,
      data: null
    })
  }
}

/**
 * 获取指定配置模块
 * GET /api/kkk/v1/config/:module
 */
export const getConfigModule = async (req: Request, res: Response) => {
  try {
    const { module } = req.params as { module: ConfigModuleKey }
    const allConfig = await Config.All()

    if (isAppAliasModule(module)) {
      return res.json({
        success: true,
        message: '获取配置成功',
        data: getAppAliasConfig(allConfig.app, module)
      })
    }

    if (!(module in allConfig)) {
      return res.status(400).json({
        success: false,
        message: `配置模块 "${module}" 不存在`,
        data: null
      })
    }

    res.json({
      success: true,
      message: '获取配置成功',
      data: allConfig[module]
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `获取配置失败: ${error.message}`,
      data: null
    })
  }
}

/**
 * 更新指定配置模块
 * PUT/POST /api/kkk/v1/config/:module
 */
export const updateConfigModule = async (req: Request, res: Response) => {
  try {
    const { module } = req.params as { module: ConfigModuleKey }
    // 支持两种格式：直接传配置对象，或者 { config: 配置对象 }
    const requestBody = stripHttpMethodOverride(req.body) as Record<string, unknown> | undefined
    const newConfig = requestBody?.config ?? requestBody

    if (!newConfig || typeof newConfig !== 'object') {
      return res.status(400).json({
        success: false,
        message: '请求体必须是有效的配置对象',
        data: null
      })
    }

    const allConfig = await Config.All()
    if (!isAppAliasModule(module) && !(module in allConfig)) {
      return res.status(400).json({
        success: false,
        message: `配置模块 "${module}" 不存在`,
        data: null
      })
    }

    const validation = validateModuleConfigPayload(module, newConfig)
    if (!validation.ok) {
      return res.status(400).json({
        success: false,
        message: buildInvalidConfigMessage(module, validation.invalidKeys),
        data: null
      })
    }

    const normalizedConfig = validation.normalized
    const success = isAppAliasModule(module)
      ? await Config.ModifyPro('app', mergeAppAliasIntoAppConfig(allConfig.app, module, normalizedConfig))
      : await Config.ModifyPro(module, normalizedConfig as ConfigType[typeof module])

    if (success) {
      // 如果是 pushlist，同步到数据库
      if (module === 'pushlist') {
        try {
          await Config.syncConfigToDatabase()
        } catch {
          return res.status(500).json({
            success: false,
            message: '配置已保存，但订阅数据库同步失败',
            data: null
          })
        }
      }

      // 返回更新后的配置
      const updatedConfig = await Config.All()
      res.json({
        success: true,
        message: '配置更新成功',
        data: isAppAliasModule(module) ? getAppAliasConfig(updatedConfig.app, module) : updatedConfig[module]
      })
    } else {
      res.status(500).json({
        success: false,
        message: '配置更新失败',
        data: null
      })
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `配置更新失败: ${error.message}`,
      data: null
    })
  }
}

/**
 * 更新单个配置项
 * PATCH /api/kkk/v1/config/:module
 * Body: { key: string, value: any }
 */
export const patchConfigItem = async (req: Request, res: Response) => {
  try {
    const { module } = req.params as { module: ConfigModuleKey }
    const { key, value } = stripHttpMethodOverride(req.body) as { key?: unknown, value?: unknown }

    if (!key) {
      return res.status(400).json({
        success: false,
        message: '缺少配置项 key',
        data: null
      })
    }

    const allConfig = await Config.All()
    if (!isAppAliasModule(module) && !(module in allConfig)) {
      return res.status(400).json({
        success: false,
        message: `配置模块 "${module}" 不存在`,
        data: null
      })
    }

    if (isAppAliasModule(module)) {
      const validation = module === 'summaryParse'
        ? validateSummaryParsePatchKey(String(key))
        : validateAppAliasPatchKey(module, String(key))
      if (!validation.ok) {
        return res.status(400).json({
          success: false,
          message: buildInvalidConfigMessage(module, validation.invalidKeys),
          data: null
        })
      }

      const valueValidation = validateModuleConfigPayload(module, {
        [validation.normalized]: value
      })
      if (!valueValidation.ok) {
        return res.status(400).json({
          success: false,
          message: buildInvalidConfigMessage(module, valueValidation.invalidKeys),
          data: null
        })
      }
      Config.Modify('app', `${module}.${validation.normalized}`, value)
    } else {
      const validation = validateModuleConfigPayload(module, { [String(key)]: value })
      if (!validation.ok) {
        return res.status(400).json({
          success: false,
          message: buildInvalidConfigMessage(module, validation.invalidKeys),
          data: null
        })
      }

      if (module === 'pushlist') {
        // 只合并本次提交的平台，避免并发 PATCH 用旧快照覆盖另一平台。
        const success = await Config.ModifyPro(
          'pushlist',
          validation.normalized as ConfigType['pushlist']
        )
        if (!success) {
          return res.status(500).json({
            success: false,
            message: '配置更新失败',
            data: null
          })
        }

        try {
          await Config.syncConfigToDatabase()
        } catch {
          return res.status(500).json({
            success: false,
            message: '配置已保存，但订阅数据库同步失败',
            data: null
          })
        }
      } else {
        Config.Modify(module, String(key), value)
      }
    }

    // 返回更新后的配置
    const updatedConfig = await Config.All()
    res.json({
      success: true,
      message: '配置项更新成功',
      data: isAppAliasModule(module) ? getAppAliasConfig(updatedConfig.app, module) : updatedConfig[module]
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `配置项更新失败: ${error.message}`,
      data: null
    })
  }
}

/**
 * 批量更新配置
 * PUT /api/kkk/v1/config
 * Body: Partial<ConfigType>
 */
export const updateAllConfig = async (req: Request, res: Response) => {
  try {
    const newConfig = stripHttpMethodOverride(req.body) as Partial<Record<ConfigModuleKey, unknown>>

    if (!newConfig || typeof newConfig !== 'object') {
      return res.status(400).json({
        success: false,
        message: '请求体必须是有效的配置对象',
        data: null
      })
    }

    const allConfig = await Config.All()
    const normalizedModules: Partial<Record<keyof ConfigType, unknown>> = {}
    const validationErrors: string[] = []

    for (const [module, config] of Object.entries(newConfig)) {
      if (isAppAliasModule(module)) {
        const validation = validateModuleConfigPayload(module, config)
        if (!validation.ok) {
          validationErrors.push(buildInvalidConfigMessage(module, validation.invalidKeys))
          continue
        }

        normalizedModules.app = mergeAppAliasIntoAppConfig(
          normalizedModules.app
            ? mergeConfigObjects(allConfig.app, normalizedModules.app as Partial<ConfigType['app']>)
            : allConfig.app,
          module,
          validation.normalized
        )
        continue
      }

      if (!(module in allConfig)) {
        validationErrors.push(`配置模块 "${module}" 不存在`)
        continue
      }

      const validation = validateModuleConfigPayload(module as keyof ConfigType, config)
      if (!validation.ok) {
        validationErrors.push(buildInvalidConfigMessage(module, validation.invalidKeys))
        continue
      }

      const normalizedConfig = validation.normalized
      if (module === 'app' && normalizedModules.app) {
        normalizedModules.app = mergeConfigObjects(
          normalizedModules.app as ConfigType['app'],
          normalizedConfig as Partial<ConfigType['app']>
        )
        continue
      }

      normalizedModules[module as keyof ConfigType] = normalizedConfig
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: validationErrors.join('; '),
        data: null
      })
    }

    const results: { module: string; success: boolean; error?: string }[] = []
    for (const [module, config] of Object.entries(normalizedModules) as Array<[keyof ConfigType, unknown]>) {
      try {
        const success = await Config.ModifyPro(module, config as ConfigType[keyof ConfigType])
        results.push({ module, success })
      } catch (error: any) {
        results.push({ module, success: false, error: error.message })
      }
    }

    const pushlistResult = results.find(result => result.module === 'pushlist')
    if (pushlistResult?.success) {
      try {
        await Config.syncConfigToDatabase()
      } catch {
        pushlistResult.success = false
        pushlistResult.error = '订阅数据库同步失败'
      }
    }

    const allSuccess = results.every(r => r.success)
    const updatedConfig = await Config.All()

    res.json({
      success: allSuccess,
      message: allSuccess ? '所有配置更新成功' : '部分配置更新失败',
      data: {
        config: updatedConfig,
        results
      }
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `配置更新失败: ${error.message}`,
      data: null
    })
  }
}
