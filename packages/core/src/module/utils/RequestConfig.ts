import type { AxiosProxyConfig, AxiosRequestConfig } from 'node-karin/axios'

import type { requestConfig } from '../../types/config/request'
import type { OutboundRequestProfile } from './OutboundRequest'

const DEFAULT_USER_AGENT = 'Apifox/1.0.0 (https://apifox.com)'

type BuildRequestOptions = {
  maxRedirects?: number
  userAgentFallback?: string
  outboundProfile?: OutboundRequestProfile
  maxContentLength?: number
}

const sanitizeHeaderValue = (value: string): string => {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

const normalizeProxyAuthValue = (value: unknown): string => {
  return value === undefined || value === null ? '' : String(value)
}

export const normalizeAxiosProxy = (proxy: requestConfig['proxy']): AxiosProxyConfig | false => {
  if (!proxy?.switch) return false

  const host = proxy.host?.trim()
  const port = Number(proxy.port)
  if (!host || !Number.isFinite(port) || port < 1) return false

  const username = normalizeProxyAuthValue(proxy.auth?.username).trim()
  const password = normalizeProxyAuthValue(proxy.auth?.password)

  return {
    host,
    port,
    protocol: proxy.protocol || 'http',
    ...(username
      ? {
          auth: {
            username,
            password
          }
        }
      : {})
  }
}

export const buildConfiguredRequestOptions = (
  request: Pick<requestConfig, 'timeout' | 'User-Agent' | 'proxy' | 'headers'>,
  options: BuildRequestOptions = {}
): Pick<AxiosRequestConfig, 'headers' | 'maxRedirects' | 'proxy' | 'timeout' | 'maxContentLength' | 'maxBodyLength'> & {
  outboundProfile?: OutboundRequestProfile
} => {
  const userAgent = sanitizeHeaderValue(request['User-Agent']) ||
    sanitizeHeaderValue(options.userAgentFallback ?? '') ||
    DEFAULT_USER_AGENT

  const extraHeaders = Object.fromEntries(
    Object.entries(request.headers ?? {})
      .map(([key, value]) => [key, sanitizeHeaderValue(String(value))])
      .filter(([, value]) => value)
  )

  return {
    headers: {
      'User-Agent': userAgent,
      ...extraHeaders
    },
    maxRedirects: options.maxRedirects,
    proxy: normalizeAxiosProxy(request.proxy),
    timeout: request.timeout,
    ...(typeof options.maxContentLength === 'number'
      ? {
          maxContentLength: options.maxContentLength,
          maxBodyLength: options.maxContentLength
        }
      : {}),
    ...(options.outboundProfile
      ? {
          outboundProfile: options.outboundProfile
        }
      : {})
  }
}
