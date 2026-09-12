/**
 * API 路由聚合
 */
import { authMiddleware } from 'node-karin'
import express from 'node-karin/express'

import { bilibiliApiRouter } from '@/platform/bilibili/api'
import { douyinApiRouter } from '@/platform/douyin/api'

import { signatureVerificationMiddleware } from '../auth'
import {
  createParseByUrlHandler,
  createSimulateHandlerByUrlHandler,
  DIAGNOSTIC_PARSE_BY_URL_PLATFORMS
} from './diagnosticParseByUrl'
import { getBotGroups, getBots, getGroupsBatch } from './bots'
import {
  getAllConfig,
  getConfigModule,
  patchConfigItem,
  updateAllConfig,
  updateConfigModule } from './config'
import { writeAuthCompatibilityMiddleware } from './authCompat'
import { getGroups } from './groups'
import { resolveLink } from './link'
import { getFullSchema, getModuleSchemaApi } from './schema'

const apiRouter = express.Router()

// 认证中间件
const authMiddlewares = [authMiddleware, signatureVerificationMiddleware]
const writeAuthMiddlewares = [writeAuthCompatibilityMiddleware, signatureVerificationMiddleware]

// Bot 管理
apiRouter.get('/bots', ...authMiddlewares, getBots)
apiRouter.get('/bots/:botId/groups', ...authMiddlewares, getBotGroups)

// 群组管理
apiRouter.get('/groups', ...authMiddlewares, getGroups)
apiRouter.post('/groups/batch', ...authMiddlewares, getGroupsBatch)

// 链接解析
apiRouter.post('/link/resolve', ...authMiddlewares, resolveLink)

// 配置管理 API
apiRouter.get('/config', ...authMiddlewares, getAllConfig)
apiRouter.put('/config', ...writeAuthMiddlewares, updateAllConfig)
apiRouter.post('/config', ...authMiddlewares, updateAllConfig)
apiRouter.get('/config/:module', ...authMiddlewares, getConfigModule)
apiRouter.put('/config/:module', ...writeAuthMiddlewares, updateConfigModule)
apiRouter.post('/config/:module', ...authMiddlewares, updateConfigModule)
apiRouter.patch('/config/:module', ...writeAuthMiddlewares, patchConfigItem)

// 配置 Schema API
apiRouter.get('/schema', ...authMiddlewares, getFullSchema)
apiRouter.get('/schema/:module', ...authMiddlewares, getModuleSchemaApi)

// 平台诊断解析 API
for (const platform of DIAGNOSTIC_PARSE_BY_URL_PLATFORMS) {
  apiRouter.post(`/platforms/${platform}/parse-by-url`, ...authMiddlewares, createParseByUrlHandler(platform))
  apiRouter.post(`/platforms/${platform}/simulate-handler-by-url`, ...authMiddlewares, createSimulateHandlerByUrlHandler(platform))
}

// 平台路由
apiRouter.use('/platforms/douyin', ...authMiddlewares, douyinApiRouter)
apiRouter.use('/platforms/bilibili', ...authMiddlewares, bilibiliApiRouter)

export { apiRouter }
export * from './bots'
export * from './config'
export * from './groups'
export * from './link'
export * from './schema'
