import type { AxiosRequestConfig } from 'node-karin/axios'

import { Config } from '@/module/utils/Config'
import { buildConfiguredRequestOptions, normalizeAxiosProxy } from '@/module/utils/RequestConfig'

export const buildXConfiguredRequestOptions = (
  options: Parameters<typeof buildConfiguredRequestOptions>[1] = {}
): ReturnType<typeof buildConfiguredRequestOptions> => {
  return buildConfiguredRequestOptions({
    ...Config.request,
    proxy: Config.x?.proxy
  }, options)
}

export const buildXNetworkOptions = (): Pick<AxiosRequestConfig, 'proxy'> => {
  return {
    proxy: normalizeAxiosProxy(Config.x?.proxy)
  }
}
