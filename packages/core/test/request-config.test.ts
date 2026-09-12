import { describe, expect, it } from 'vitest'

import { buildConfiguredRequestOptions, normalizeAxiosProxy } from '../src/module/utils/RequestConfig'

describe('request config helpers', () => {
  it('disables axios proxy when the proxy switch is off or incomplete', () => {
    expect(normalizeAxiosProxy(undefined)).toBe(false)
    expect(normalizeAxiosProxy({
      switch: false,
      host: '127.0.0.1',
      port: 7890,
      protocol: 'http'
    })).toBe(false)
    expect(normalizeAxiosProxy({
      switch: true,
      host: '',
      port: 7890,
      protocol: 'http'
    })).toBe(false)
  })

  it('normalizes enabled proxy config to axios fields only', () => {
    expect(normalizeAxiosProxy({
      switch: true,
      host: ' 127.0.0.1 ',
      port: '7890' as unknown as number,
      protocol: 'http',
      auth: {
        username: ' user ',
        password: 'pass'
      }
    })).toEqual({
      host: '127.0.0.1',
      port: 7890,
      protocol: 'http',
      auth: {
        username: 'user',
        password: 'pass'
      }
    })
  })

  it('keeps numeric legacy proxy credentials as strings', () => {
    expect(normalizeAxiosProxy({
      switch: true,
      host: '127.0.0.1',
      port: 7890,
      protocol: 'http',
      auth: {
        username: 123456,
        password: 654321
      }
    } as any)).toEqual({
      host: '127.0.0.1',
      port: 7890,
      protocol: 'http',
      auth: {
        username: '123456',
        password: '654321'
      }
    })
  })

  it('builds axios request options with user agent, timeout, redirect limit, and sanitized proxy', () => {
    expect(buildConfiguredRequestOptions({
      timeout: 30000,
      'User-Agent': 'Mozilla/5.0',
      proxy: {
        switch: true,
        host: '127.0.0.1',
        port: 7890,
        protocol: 'http'
      }
    }, { maxRedirects: 10 })).toEqual({
      headers: {
        'User-Agent': 'Mozilla/5.0'
      },
      maxRedirects: 10,
      proxy: {
        host: '127.0.0.1',
        port: 7890,
        protocol: 'http'
      },
      timeout: 30000
    })
  })

  it('sanitizes configured user agent before passing it to axios', () => {
    expect(buildConfiguredRequestOptions({
      timeout: 30000,
      'User-Agent': 'Mozilla/5.0\r\nCookie: injected',
      proxy: { switch: false }
    }).headers).toEqual({
      'User-Agent': 'Mozilla/5.0 Cookie: injected'
    })
  })

  it('falls back when configured user agent is blank after sanitization', () => {
    expect(buildConfiguredRequestOptions({
      timeout: 30000,
      'User-Agent': '\r\n',
      proxy: { switch: false }
    }, { userAgentFallback: 'Fallback UA' }).headers).toEqual({
      'User-Agent': 'Fallback UA'
    })
  })
})
