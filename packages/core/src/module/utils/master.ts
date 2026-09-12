import { config, logger } from 'node-karin'

let warnedMissingMasterConfig = false

export const getConfiguredMasters = (): string[] => {
  try {
    const masters = config.master()
    return Array.isArray(masters) ? masters : []
  } catch (error) {
    if (!warnedMissingMasterConfig) {
      warnedMissingMasterConfig = true
      logger.warn(`[MasterConfig] 读取主人配置失败，按未配置处理: ${error}`)
    }
    return []
  }
}

export const getNonConsoleMasters = (): string[] => {
  return getConfiguredMasters().filter(id => id !== 'console')
}
