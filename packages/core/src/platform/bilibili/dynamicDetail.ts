import type { BiliDynamicInfoUnion, Result } from '@ikenxuan/amagi'

type MaybeRecord = Record<string, any>

const isRecord = (value: unknown): value is MaybeRecord => {
  return typeof value === 'object' && value !== null
}

export const extractBilibiliDynamicDetailPayload = (
  value: unknown
): BiliDynamicInfoUnion | null => {
  const queue: unknown[] = [value]
  const seen = new Set<unknown>()

  while (queue.length > 0) {
    const candidate = queue.shift()
    if (!isRecord(candidate) || seen.has(candidate)) continue
    seen.add(candidate)

    if (isRecord(candidate.item)) {
      return candidate as BiliDynamicInfoUnion
    }

    if (isRecord(candidate.data)) {
      queue.push(candidate.data)
    }
  }

  return null
}

export const normalizeBilibiliDynamicDetailResult = <T extends { data?: unknown } | null | undefined> (
  value: T
): (T & Result<BiliDynamicInfoUnion>) | T => {
  if (!isRecord(value)) return value

  const payload = extractBilibiliDynamicDetailPayload(value.data ?? value)
  if (!payload) return value
  if (value.data === payload) return value as (T & Result<BiliDynamicInfoUnion>)

  return {
    ...value,
    data: payload
  } as (T & Result<BiliDynamicInfoUnion>)
}

export const getBilibiliDynamicItem = (value: unknown): Record<string, any> | null => {
  return extractBilibiliDynamicDetailPayload(value)?.item as Record<string, any> | null
}

export const getBilibiliDynamicType = (value: unknown): string => {
  return String(getBilibiliDynamicItem(value)?.type ?? '').trim()
}

export const getBilibiliDynamicDrawImages = (item: unknown): Array<Record<string, any>> => {
  const drawItems = Array.isArray((item as MaybeRecord)?.modules?.module_dynamic?.major?.draw?.items)
    ? (item as MaybeRecord).modules.module_dynamic.major.draw.items
    : []

  if (drawItems.length > 0) {
    return drawItems
  }

  return Array.isArray((item as MaybeRecord)?.modules?.module_dynamic?.major?.opus?.pics)
    ? (item as MaybeRecord).modules.module_dynamic.major.opus.pics
    : []
}
