const dangerousConfigSegments = new Set(['__proto__', 'prototype', 'constructor'])

export const isPlainObject = (value: unknown): value is Record<string, any> => {
  return Object.prototype.toString.call(value) === '[object Object]'
}

const isDangerousConfigSegment = (segment: string): boolean => {
  return dangerousConfigSegments.has(segment) || /^\d+$/.test(segment)
}

const assertSafeConfigPath = (path: string[]) => {
  for (const segment of path) {
    if (!segment || isDangerousConfigSegment(segment)) {
      throw new Error(`非法配置路径: ${path.join('.')}`)
    }
  }
}

const assertSafeConfigObject = (value: unknown, path: string[] = []) => {
  if (Array.isArray(value)) {
    value.forEach(item => assertSafeConfigObject(item, path))
    return
  }

  if (!isPlainObject(value)) return

  for (const [key, nestedValue] of Object.entries(value)) {
    const nextPath = [...path, key]
    assertSafeConfigPath(nextPath)
    assertSafeConfigObject(nestedValue, nextPath)
  }
}

export const mergeConfigObjects = <T> (base: T, patch: Partial<T>): T => {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return patch as T
  }

  const result: Record<string, any> = { ...base }

  for (const [key, value] of Object.entries(patch)) {
    if (isDangerousConfigSegment(key)) {
      continue
    }

    const existing = result[key]
    if (isPlainObject(existing) && isPlainObject(value)) {
      result[key] = mergeConfigObjects(existing, value)
      continue
    }

    result[key] = value
  }

  return result as T
}

export const setNestedConfigProperty = (obj: Record<string, any>, path: string[], value: unknown) => {
  assertSafeConfigPath(path)
  let current = obj

  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]
    const next = current[key]

    if (!isPlainObject(next)) {
      current[key] = {}
    }

    current = current[key]
  }

  const lastKey = path[path.length - 1]
  const existing = current[lastKey]

  if (isPlainObject(existing) && isPlainObject(value)) {
    current[lastKey] = mergeConfigObjects(existing, value)
    return
  }

  current[lastKey] = value
}

export const normalizeDottedConfigObject = <T> (input: T): T => {
  if (Array.isArray(input)) {
    return input.map(item => normalizeDottedConfigObject(item)) as T
  }

  if (!isPlainObject(input)) {
    return input
  }

  assertSafeConfigObject(input)

  const flattenedValues: Record<string, any> = {}
  const directValues: Record<string, any> = {}

  for (const [key, rawValue] of Object.entries(input)) {
    const value = normalizeDottedConfigObject(rawValue)

    if (key.includes('.')) {
      setNestedConfigProperty(flattenedValues, key.split('.'), value)
      continue
    }

    directValues[key] = value
  }

  return mergeConfigObjects(flattenedValues, directValues) as T
}
