import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'

import type { AxiosRequestConfig } from 'node-karin/axios'

import type { requestConfig } from '@/types/config/request'

type AxiosProxyLike = NonNullable<AxiosRequestConfig['proxy']>

class HttpsConnectProxyAgent extends https.Agent {
  private readonly proxyUrl: URL

  constructor (proxyUrl: string) {
    super()
    this.proxyUrl = new URL(proxyUrl)
  }

  createConnection (
    options: https.RequestOptions,
    callback?: (error: Error | null, socket: net.Socket) => void
  ): net.Socket | null | undefined {
    const done = callback ?? (() => {})
    const proxyPort = Number(this.proxyUrl.port || (this.proxyUrl.protocol === 'https:' ? 443 : 80))
    const onProxyConnected = () => {
      const targetHost = options.host || options.hostname
      const targetPort = Number(options.port || 443)
      const headers = [
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1`,
        `Host: ${targetHost}:${targetPort}`,
        'Connection: close'
      ]

      if (this.proxyUrl.username) {
        const auth = Buffer.from(`${decodeURIComponent(this.proxyUrl.username)}:${decodeURIComponent(this.proxyUrl.password)}`).toString('base64')
        headers.push(`Proxy-Authorization: Basic ${auth}`)
      }

      proxySocket.write(`${headers.join('\r\n')}\r\n\r\n`)
    }
    const proxySocket = this.proxyUrl.protocol === 'https:'
      ? tls.connect({ host: this.proxyUrl.hostname, port: proxyPort }, onProxyConnected)
      : net.connect({ host: this.proxyUrl.hostname, port: proxyPort }, onProxyConnected)

    let responseBuffer = Buffer.alloc(0)
    const cleanup = () => {
      proxySocket.off('data', onData)
      proxySocket.off('error', fail)
    }
    const fail = (error: Error) => {
      cleanup()
      done(error, undefined as unknown as net.Socket)
    }
    const onData = (chunk: Buffer) => {
      responseBuffer = Buffer.concat([responseBuffer, chunk])
      const responseText = responseBuffer.toString('latin1')
      const headerEndIndex = responseText.indexOf('\r\n\r\n')
      if (headerEndIndex === -1) return

      const statusLine = responseText.slice(0, headerEndIndex).split('\r\n')[0]
      const status = Number(statusLine.match(/HTTP\/\d\.\d\s+(\d+)/)?.[1])
      if (status !== 200) {
        fail(new Error(`TikTok proxy CONNECT failed: ${statusLine}`))
        return
      }

      cleanup()
      const rest = responseBuffer.subarray(headerEndIndex + 4)
      if (rest.length) proxySocket.unshift(rest)

      const servername = String(options.servername || options.host || options.hostname || '')
      const tlsSocket = tls.connect({
        socket: proxySocket,
        ...(servername ? { servername } : {})
      }, () => done(null, tlsSocket))
      tlsSocket.once('error', fail)
    }

    proxySocket.on('data', onData)
    proxySocket.once('error', fail)
    return undefined
  }
}

const normalizeProtocol = (protocol?: string): string => {
  const value = protocol?.trim() || 'http'
  return value.endsWith(':') ? value : `${value}:`
}

const normalizeProxyAuthValue = (value: unknown): string => {
  return value === undefined || value === null ? '' : String(value)
}

const proxyObjectToUrl = (proxy: AxiosProxyLike): string | undefined => {
  if (proxy === false) return undefined
  const host = String(proxy.host ?? '').trim()
  const port = Number(proxy.port)
  if (!host || !Number.isFinite(port)) return undefined

  const protocol = normalizeProtocol(proxy.protocol)
  const username = normalizeProxyAuthValue(proxy.auth?.username).trim()
  const password = normalizeProxyAuthValue(proxy.auth?.password)
  const auth = username
    ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
    : ''
  return `${protocol}//${auth}${host}:${port}`
}

const configuredProxyToUrl = (proxy: requestConfig['proxy']): string | undefined => {
  if (!proxy?.switch) return undefined
  const host = proxy.host?.trim()
  const port = Number(proxy.port)
  if (!host || !Number.isFinite(port)) return undefined

  const protocol = normalizeProtocol(proxy.protocol)
  const username = normalizeProxyAuthValue(proxy.auth?.username).trim()
  const password = normalizeProxyAuthValue(proxy.auth?.password)
  const auth = username ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : ''
  return `${protocol}//${auth}${host}:${port}`
}

export const resolveTikTokProxyUrl = (proxy?: requestConfig['proxy'], env: NodeJS.ProcessEnv = process.env): string | undefined => {
  return configuredProxyToUrl(proxy) ||
    env.HTTPS_PROXY ||
    env.https_proxy ||
    env.HTTP_PROXY ||
    env.http_proxy
}

export const applyTikTokProxyAgent = <T extends AxiosRequestConfig>(
  options: T,
  proxyConfig?: requestConfig['proxy'],
  env: NodeJS.ProcessEnv = process.env
): T => {
  const rawProxy = (options as any).proxy
  const explicitProxyUrl = rawProxy && rawProxy !== false
    ? proxyObjectToUrl(rawProxy)
    : undefined
  const proxyUrl = explicitProxyUrl || resolveTikTokProxyUrl(proxyConfig, env)
  const next = { ...options } as T

  if (!proxyUrl) {
    if ((next as any).proxy === false) delete (next as any).proxy
    return next
  }

  if (!/^https?:\/\//i.test(proxyUrl)) {
    if ((next as any).proxy === false) delete (next as any).proxy
    return next
  }

  const agent = new HttpsConnectProxyAgent(proxyUrl)
  ;(next as any).proxy = false
  ;(next as AxiosRequestConfig).httpsAgent = agent
  return next
}
