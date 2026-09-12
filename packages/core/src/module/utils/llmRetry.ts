const retryableHttpStatuses = new Set([408, 409, 425, 429])
const explicitClientSideMessagePattern = /bad request|unauthorized|forbidden|not found|invalid api key|invalid_request|invalid model|unsupported parameter|unsupported model|missing api key|missing model|missing base url|schema|payload .*invalid/i
const transientNetworkMessagePattern = /timeout|timed out|ECONNRESET|ECONNABORTED|ECONNREFUSED|EPIPE|ETIMEDOUT|network|socket|fetch failed|abort(?:ed|error)?|temporary|temporarily|upstream|gateway/i

const isProgrammingError = (error: unknown): boolean => {
  return error instanceof TypeError ||
    error instanceof ReferenceError ||
    error instanceof SyntaxError ||
    error instanceof RangeError
}

const getHttpStatus = (error: unknown): number => {
  if (!error || typeof error !== 'object') return 0

  if ('response' in error) {
    const status = Number((error as { response?: { status?: unknown } }).response?.status ?? 0)
    if (Number.isFinite(status) && status > 0) return status
  }

  if ('status' in error) {
    const status = Number((error as { status?: unknown }).status ?? 0)
    if (Number.isFinite(status) && status > 0) return status
  }

  return 0
}

export const shouldRetryLLMRequestError = (error: unknown): boolean => {
  if (isProgrammingError(error)) return false

  const status = getHttpStatus(error)
  if (status > 0) {
    if (status >= 500) return true
    if (retryableHttpStatuses.has(status)) return true
    if (status >= 400 && status < 500) return false
  }

  const message = error instanceof Error ? error.message : String(error)
  if (explicitClientSideMessagePattern.test(message)) {
    return false
  }

  if (transientNetworkMessagePattern.test(message)) {
    return true
  }

  return true
}
