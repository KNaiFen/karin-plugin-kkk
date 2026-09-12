type DevPreviewPayload<T extends Record<string, unknown>> = T & {
  __extraProps?: Record<string, unknown>
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const toSerializableValue = (value: unknown): unknown => {
  if (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  if (Array.isArray(value)) {
    return value
      .map(item => toSerializableValue(item))
      .filter(item => item !== undefined)
  }

  if (!isPlainObject(value)) {
    return undefined
  }

  const output: Record<string, unknown> = {}

  for (const [key, entry] of Object.entries(value)) {
    const serializable = toSerializableValue(entry)
    if (serializable !== undefined) {
      output[key] = serializable
    }
  }

  return output
}

const buildDevPreviewPayload = <T extends Record<string, unknown>> (
  data: T,
  extraProps: Record<string, unknown>
): DevPreviewPayload<T> => {
  const payload: DevPreviewPayload<T> = { ...data }
  const serializableProps = toSerializableValue(extraProps)

  if (isPlainObject(serializableProps) && Object.keys(serializableProps).length > 0) {
    payload.__extraProps = serializableProps
  }

  return payload
}

/**
 * 插件工厂函数类型
 * 用于创建可配置的插件实例
 * @template T 插件配置类型
 */

export { buildDevPreviewPayload }
