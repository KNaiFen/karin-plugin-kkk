import fs from 'node:fs'
import path from 'node:path'

import YAML from 'node-karin/yaml'

import { appConfigSchema } from '@/module/config/app.schema'
import { bilibiliConfigSchema } from '@/module/config/bilibili.schema'
import { cookiesConfigSchema } from '@/module/config/cookies.schema'
import { detailedSummaryParseConfigSchema } from '@/module/config/detailedSummaryParse.schema'
import { douyinConfigSchema } from '@/module/config/douyin.schema'
import { githubConfigSchema } from '@/module/config/github.schema'
import { heyboxConfigSchema } from '@/module/config/heybox.schema'
import { kuaishouConfigSchema } from '@/module/config/kuaishou.schema'
import { requestConfigSchema } from '@/module/config/request.schema'
import type { FieldSchema, SectionSchema } from '@/module/config/schema'
import { summaryParseConfigSchema } from '@/module/config/summaryParse.schema'
import { tiebaConfigSchema } from '@/module/config/tieba.schema'
import { tiktokConfigSchema } from '@/module/config/tiktok.schema'
import { transcriptOriginalConfigSchema } from '@/module/config/transcriptOriginal.schema'
import { uploadConfigSchema } from '@/module/config/upload.schema'
import { wechatConfigSchema } from '@/module/config/wechat.schema'
import { weiboConfigSchema } from '@/module/config/weibo.schema'
import { xConfigSchema } from '@/module/config/x.schema'
import { xiaohongshuConfigSchema } from '@/module/config/xiaohongshu.schema'
import { zhihuConfigSchema } from '@/module/config/zhihu.schema'
import { isPlainObject, normalizeDottedConfigObject } from '@/module/utils/configPath'
import { Root } from '@/root'
import type { ConfigType } from '@/types'

type AppAliasModuleKey = 'summaryParse' | 'detailedSummaryParse' | 'transcriptOriginal'
type ConfigModuleKey = keyof ConfigType | AppAliasModuleKey

type ValidationSuccess<T> = {
  ok: true
  normalized: T
}

type ValidationFailure = {
  ok: false
  invalidKeys: string[]
}

type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure

const pushlistModuleKey = 'pushlist'
const guestCookieModuleKey = 'guestCookie'
const appAliasModules = new Set<AppAliasModuleKey>(['summaryParse', 'detailedSummaryParse', 'transcriptOriginal'])
const dangerousConfigSegments = new Set(['__proto__', 'prototype', 'constructor'])
const pushlistArrayItemKeys = {
  douyin: new Set(['switch', 'sec_uid', 'short_id', 'group_id', 'remark', 'pushTypes', 'filterMode', 'Keywords', 'Tags']),
  bilibili: new Set(['switch', 'host_mid', 'group_id', 'remark', 'pushTypes', 'filterMode', 'Keywords', 'Tags'])
} as const
const pushlistRequiredItemKeys = {
  douyin: ['group_id'],
  bilibili: ['host_mid', 'group_id']
} as const
const pushlistArrayFields = new Set(['group_id', 'pushTypes', 'Keywords', 'Tags'])
const schemaSections: Partial<Record<ConfigModuleKey, SectionSchema>> = {
  app: appConfigSchema,
  bilibili: bilibiliConfigSchema,
  cookies: cookiesConfigSchema,
  detailedSummaryParse: detailedSummaryParseConfigSchema,
  transcriptOriginal: transcriptOriginalConfigSchema,
  douyin: douyinConfigSchema,
  heybox: heyboxConfigSchema,
  github: githubConfigSchema,
  kuaishou: kuaishouConfigSchema,
  request: requestConfigSchema,
  summaryParse: summaryParseConfigSchema,
  tieba: tiebaConfigSchema,
  tiktok: tiktokConfigSchema,
  upload: uploadConfigSchema,
  wechat: wechatConfigSchema,
  weibo: weiboConfigSchema,
  x: xConfigSchema,
  xiaohongshu: xiaohongshuConfigSchema,
  zhihu: zhihuConfigSchema
}
const guestCookieNumberRules: Record<string, { min: number, max: number }> = {
  refreshIntervalHours: { min: 1, max: 336 },
  refreshJitterMinutes: { min: 0, max: 1440 },
  minRefreshAgeHours: { min: 0, max: 336 },
  httpTimeoutSeconds: { min: 1, max: 120 },
  browserTimeoutSeconds: { min: 5, max: 180 },
  pageSettleSeconds: { min: 0, max: 30 },
  'logging.retentionDays': { min: 1, max: 365 },
  'logging.maxFileSizeMB': { min: 1, max: 200 }
}

const buildDefaultConfigPath = (module: keyof ConfigType): string => {
  const runtimePath = path.join(Root.pluginPath, 'config', 'default_config', `${module}.yaml`)
  if (fs.existsSync(runtimePath)) {
    return runtimePath
  }

  return path.resolve(Root.pluginPath, '..', '..', 'config', 'default_config', `${module}.yaml`)
}

const listFieldKeys = (sectionKey: string): string[] => {
  const schema = schemaSections[sectionKey as ConfigModuleKey]
  if (!schema) return []

  return schema.fields
    .flatMap(field => ('key' in field ? [field.key] : []))
    .filter((key): key is string => Boolean(key))
}

const flattenObjectKeys = (value: unknown, prefix = ''): string[] => {
  if (Array.isArray(value)) {
    return prefix ? [prefix] : []
  }

  if (!isPlainObject(value)) {
    return prefix ? [prefix] : []
  }

  const keys: string[] = []
  for (const [key, nestedValue] of Object.entries(value)) {
    const currentKey = prefix ? `${prefix}.${key}` : key
    keys.push(...flattenObjectKeys(nestedValue, currentKey))
  }

  return keys
}

const readModuleDefaultShapeKeys = (module: keyof ConfigType): Set<string> => {
  const filePath = buildDefaultConfigPath(module)
  const content = fs.readFileSync(filePath, 'utf8')
  const parsed = YAML.parse(content) as unknown
  return new Set(flattenObjectKeys(parsed))
}

const getAllowedDottedKeys = (module: ConfigModuleKey): Set<string> => {
  if (appAliasModules.has(module as AppAliasModuleKey)) {
    return new Set(listFieldKeys(module))
  }

  const defaultKeys = readModuleDefaultShapeKeys(module as keyof ConfigType)
  for (const key of listFieldKeys(module)) defaultKeys.add(key)

  if (module === 'app') {
    for (const aliasModule of appAliasModules) {
      for (const key of listFieldKeys(aliasModule)) defaultKeys.add(`${aliasModule}.${key}`)
    }
  }

  return defaultKeys
}

const isDangerousSegment = (segment: string): boolean => {
  return !segment || dangerousConfigSegments.has(segment) || /^\d+$/.test(segment)
}

const isValidDottedKey = (key: string): boolean => {
  return key.split('.').every(segment => !isDangerousSegment(segment))
}

const collectLeafKeys = (value: unknown, prefix = ''): string[] => {
  if (Array.isArray(value)) {
    return prefix ? [prefix] : []
  }

  if (!isPlainObject(value)) {
    return prefix ? [prefix] : []
  }

  const keys: string[] = []
  for (const [key, nestedValue] of Object.entries(value)) {
    const currentKey = prefix ? `${prefix}.${key}` : key
    keys.push(...collectLeafKeys(nestedValue, currentKey))
  }

  return keys
}

const normalizeAppAliasPatchKey = (module: AppAliasModuleKey, key: string): string => {
  return key.startsWith(`${module}.`) ? key.slice(`${module}.`.length) : key
}

const getFieldSchemaMap = (module: ConfigModuleKey): Map<string, FieldSchema & { key: string }> => {
  const fields = new Map<string, FieldSchema & { key: string }>()

  const addSection = (section: SectionSchema | undefined, prefix = '') => {
    if (!section) return
    for (const field of section.fields) {
      if (!('key' in field)) continue
      fields.set(`${prefix}${field.key}`, field)
    }
  }

  if (module === 'app') {
    addSection(appConfigSchema)
    for (const aliasModule of appAliasModules) {
      addSection(schemaSections[aliasModule], `${aliasModule}.`)
    }
  } else {
    addSection(schemaSections[module])
  }

  return fields
}

const getPathValue = (value: unknown, dottedKey: string): unknown => {
  let current = value
  for (const segment of dottedKey.split('.')) {
    if (!isPlainObject(current) || !Object.hasOwn(current, segment)) return undefined
    current = current[segment]
  }
  return current
}

const isValidFieldValue = (field: FieldSchema & { key: string }, value: unknown): boolean => {
  if (value === undefined) return !field.required

  if (field.type === 'switch') return typeof value === 'boolean'

  if (field.type === 'checkbox') {
    if (!Array.isArray(value)) return false
    const allowed = new Set(field.options.map(option => option.value))
    return value.every(item => typeof item === 'string' && allowed.has(item))
  }

  if (field.type === 'radio') {
    return field.options.some(option => Object.is(option.value, value))
  }

  if (field.inputType === 'number') {
    if ((value === '' || value === 0) && field.key === 'proxy.port') return true
    if (typeof value !== 'number' || !Number.isFinite(value)) return false
    return (field.rules ?? []).every(rule =>
      (rule.min === undefined || value >= rule.min) &&
      (rule.max === undefined || value <= rule.max)
    )
  }

  // 前端的 input group 会复用 text schema 表达字符串数组。
  if (value === null && field.required !== true) return true
  if (Array.isArray(value)) return value.every(item => typeof item === 'string')
  if (typeof value !== 'string') return false
  if (field.required && value.trim().length === 0) return false

  return (field.rules ?? []).every(rule => {
    if (rule.minLength !== undefined && value.length < rule.minLength) return false
    if (rule.maxLength !== undefined && value.length > rule.maxLength) return false
    if (rule.regex === undefined) return true
    const regex = typeof rule.regex === 'string' ? new RegExp(rule.regex) : rule.regex
    return regex.test(value)
  })
}

const isValidGuestCookieValue = (key: string, value: unknown): boolean => {
  const numberRule = guestCookieNumberRules[key]
  if (numberRule) {
    return typeof value === 'number' && Number.isFinite(value) && value >= numberRule.min && value <= numberRule.max
  }
  if (key === 'switch' || key === 'blockMedia' || key === 'blockFont' || key.endsWith('.switch')) {
    return typeof value === 'boolean'
  }
  if (key.endsWith('.requiredCookies')) {
    return Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string' && item.trim().length > 0)
  }
  if (key.endsWith('.pageUrl') || key.endsWith('.testUrl')) {
    return typeof value === 'string' && value.trim().length > 0
  }
  return true
}

const validateAgainstAllowedKeys = <T>(
  module: ConfigModuleKey,
  value: unknown,
  allowedKeys: Set<string>
): ValidationResult<T> => {
  if (!isPlainObject(value)) {
    return { ok: false, invalidKeys: ['<body>'] }
  }

  const invalidKeys = new Set<string>()
  for (const rawKey of Object.keys(value)) {
    if (!isValidDottedKey(rawKey)) {
      invalidKeys.add(rawKey)
      continue
    }

    const normalized = normalizeDottedConfigObject({ [rawKey]: (value as Record<string, unknown>)[rawKey] })
    const normalizedKeys = collectLeafKeys(normalized)
    if (normalizedKeys.length === 0) {
      invalidKeys.add(rawKey)
      continue
    }

    for (const key of normalizedKeys) {
      if (!allowedKeys.has(key)) {
        invalidKeys.add(key)
      }
    }
  }

  if (invalidKeys.size > 0) {
    return { ok: false, invalidKeys: [...invalidKeys].sort() }
  }

  const normalized = normalizeDottedConfigObject(value) as T
  const fieldSchemas = getFieldSchemaMap(module)
  for (const key of collectLeafKeys(normalized)) {
    const field = fieldSchemas.get(key)
    if (field && !isValidFieldValue(field, getPathValue(normalized, key))) {
      invalidKeys.add(key)
    }
    if (module === guestCookieModuleKey && !isValidGuestCookieValue(key, getPathValue(normalized, key))) {
      invalidKeys.add(key)
    }
  }

  if (invalidKeys.size > 0) {
    return { ok: false, invalidKeys: [...invalidKeys].sort() }
  }

  return {
    ok: true,
    normalized
  }
}

const isStringArray = (value: unknown): value is string[] => {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

const isValidPushlistItemValue = (
  moduleKey: keyof typeof pushlistArrayItemKeys,
  key: string,
  value: unknown
): boolean => {
  if (key === 'switch') return typeof value === 'boolean'
  if (key === 'host_mid') return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
  if (key === 'filterMode') return value === 'blacklist' || value === 'whitelist'
  if (pushlistArrayFields.has(key)) {
    if (!isStringArray(value)) return false
    if (key === 'group_id') return value.length > 0 && value.every(item => /^.+:.+$/.test(item))
    if (key === 'pushTypes') {
      const allowed = moduleKey === 'douyin'
        ? new Set(['post', 'favorite', 'recommend', 'live'])
        : new Set(['video', 'draw', 'word', 'live', 'forward', 'article'])
      return value.every(item => allowed.has(item))
    }
    return true
  }
  if (key === 'sec_uid' || key === 'short_id' || key === 'remark') {
    return value === undefined || typeof value === 'string'
  }
  return typeof value === 'string'
}

const validatePushlistValue = (value: unknown): ValidationResult<ConfigType['pushlist']> => {
  if (!isPlainObject(value)) {
    return { ok: false, invalidKeys: ['<body>'] }
  }

  const invalidKeys = new Set<string>()
  for (const [moduleKey, rawItems] of Object.entries(value)) {
    if (moduleKey !== 'douyin' && moduleKey !== 'bilibili') {
      invalidKeys.add(moduleKey)
      continue
    }

    if (!Array.isArray(rawItems)) {
      invalidKeys.add(moduleKey)
      continue
    }

    for (const [index, item] of rawItems.entries()) {
      if (!isPlainObject(item)) {
        invalidKeys.add(`${moduleKey}[${index}]`)
        continue
      }

      for (const key of Object.keys(item)) {
        if (!pushlistArrayItemKeys[moduleKey].has(key as never) || !isValidDottedKey(key) || key.includes('.')) {
          invalidKeys.add(`${moduleKey}[${index}].${key}`)
          continue
        }
        if (!isValidPushlistItemValue(moduleKey, key, item[key])) {
          invalidKeys.add(`${moduleKey}[${index}].${key}`)
        }
      }

      for (const requiredKey of pushlistRequiredItemKeys[moduleKey]) {
        if (!Object.hasOwn(item, requiredKey)) invalidKeys.add(`${moduleKey}[${index}].${requiredKey}`)
      }

      if (moduleKey === 'douyin' && !item.sec_uid && !item.short_id) {
        invalidKeys.add(`${moduleKey}[${index}].sec_uid|short_id`)
      }
    }
  }

  if (invalidKeys.size > 0) {
    return { ok: false, invalidKeys: [...invalidKeys].sort() }
  }

  return {
    ok: true,
    normalized: value as ConfigType['pushlist']
  }
}

export const validateModuleConfigPayload = (
  module: ConfigModuleKey,
  value: unknown
): ValidationResult<unknown> => {
  if (module === pushlistModuleKey) {
    return validatePushlistValue(value)
  }

  return validateAgainstAllowedKeys(module, value, getAllowedDottedKeys(module))
}

export const validateAppAliasPatchKey = (
  module: AppAliasModuleKey,
  key: string
): ValidationResult<string> => {
  const normalizedKey = normalizeAppAliasPatchKey(module, String(key ?? ''))
  if (!normalizedKey || !isValidDottedKey(normalizedKey)) {
    return { ok: false, invalidKeys: [String(key)] }
  }

  const allowedKeys = getAllowedDottedKeys(module)
  if (!allowedKeys.has(normalizedKey)) {
    return { ok: false, invalidKeys: [normalizedKey] }
  }

  return {
    ok: true,
    normalized: normalizedKey
  }
}

export const validateSummaryParsePatchKey = (key: string): ValidationResult<string> => {
  return validateAppAliasPatchKey('summaryParse', key)
}

export const buildInvalidConfigMessage = (module: string, invalidKeys: string[]): string => {
  return `配置模块 "${module}" 包含非法配置项: ${invalidKeys.join(', ')}`
}
