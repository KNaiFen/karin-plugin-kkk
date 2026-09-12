import fs from 'node:fs'
import path from 'node:path'

import type { requestConfig } from '../../types/config/request'

type BrowserLike = {
  close: () => Promise<void> | void
}

type BrowserHandleLike = {
  browser?: BrowserLike
}

export type BrowserLaunchOptions = {
  headless: 'new'
  protocolTimeout: number
  executablePath?: string
  findBrowser: boolean
  download: {
    enable: boolean
    dir: string
    browser?: 'chrome' | 'chromium' | 'chrome-headless-shell'
    version?: string
    baseUrl?: string
  }
  args: string[]
  ignoreDefaultArgs: string[]
}

const BROWSER_CLOSE_TIMEOUT_MS = 1_500
const PROJECT_BROWSER_CONFIG_FILE = '.kkk-browser.json'
const PROJECT_BROWSER_CACHE_DIR = path.join('.cache', 'kkk-browser')
const PROJECT_ROOT_MARKER_FILE = 'pnpm-workspace.yaml'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const isEnabledFlag = (value?: string): boolean => {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

const resolvePathFrom = (baseDir: string, candidate: string): string => {
  return path.isAbsolute(candidate) ? candidate : path.resolve(baseDir, candidate)
}

const findUp = (
  startDir: string,
  fileName: string,
  exists: (path: string) => boolean
): string | undefined => {
  let currentDir = path.resolve(startDir)

  while (true) {
    const candidate = path.join(currentDir, fileName)
    if (exists(candidate)) return candidate

    const parent = path.dirname(currentDir)
    if (parent === currentDir) return undefined
    currentDir = parent
  }
}

const resolveProjectBrowserConfigPath = (
  env: NodeJS.ProcessEnv,
  exists: (path: string) => boolean,
  startDir: string
): string | undefined => {
  const configuredPath = env.KKK_BROWSER_CONFIG_PATH?.trim()
  if (configuredPath) {
    const resolved = resolvePathFrom(startDir, configuredPath)
    return exists(resolved) ? resolved : undefined
  }

  return findUp(startDir, PROJECT_BROWSER_CONFIG_FILE, exists)
}

const resolveProjectRoot = (
  startDir: string,
  exists: (path: string) => boolean
): string => {
  const workspaceMarker = findUp(startDir, PROJECT_ROOT_MARKER_FILE, exists)
  return workspaceMarker ? path.dirname(workspaceMarker) : path.resolve(startDir)
}

export const resolveProjectBrowserExecutablePath = (
  env: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => boolean = fs.existsSync,
  startDir: string = process.cwd(),
  readFile: (path: string, encoding: BufferEncoding) => string = fs.readFileSync
): string | undefined => {
  const configPath = resolveProjectBrowserConfigPath(env, exists, startDir)
  if (!configPath) return undefined

  try {
    const raw = readFile(configPath, 'utf8')
    const config = JSON.parse(raw) as { executablePath?: unknown }
    if (typeof config.executablePath !== 'string') return undefined

    const executablePath = resolvePathFrom(path.dirname(configPath), config.executablePath.trim())
    return executablePath && exists(executablePath) ? executablePath : undefined
  } catch {
    return undefined
  }
}

export const resolveProjectBrowserDownloadDir = (
  env: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => boolean = fs.existsSync,
  startDir: string = process.cwd()
): string => {
  const configuredDir = env.KKK_BROWSER_DOWNLOAD_DIR?.trim()
  if (configuredDir) return resolvePathFrom(startDir, configuredDir)

  const configPath = resolveProjectBrowserConfigPath(env, exists, startDir)
  const projectRoot = configPath ? path.dirname(configPath) : resolveProjectRoot(startDir, exists)
  return path.resolve(projectRoot, PROJECT_BROWSER_CACHE_DIR)
}

export const isSystemBrowserDiscoveryDisabled = (
  env: NodeJS.ProcessEnv = process.env
): boolean => isEnabledFlag(env.KKK_BROWSER_DISABLE_SYSTEM_DISCOVERY)

const windowsBrowserCandidates = (env: NodeJS.ProcessEnv): string[] => {
  const programFiles = env.ProgramFiles
  const programFilesX86 = env['ProgramFiles(x86)']
  const localAppData = env.LOCALAPPDATA

  return [
    programFiles && path.win32.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    programFilesX86 && path.win32.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    localAppData && path.win32.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    programFiles && path.win32.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    programFilesX86 && path.win32.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    localAppData && path.win32.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
  ].filter((item): item is string => Boolean(item))
}

const macBrowserCandidates = (): string[] => [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
]

const linuxBrowserCandidates = (): string[] => [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge'
]

const normalizeBrowserProxyProtocol = (protocol?: string): string => {
  const value = protocol?.trim() || 'http'
  return value.replace(/:$/, '')
}

export const resolveBrowserProxyServer = (proxy?: requestConfig['proxy']): string | undefined => {
  if (!proxy?.switch) return undefined

  const host = proxy.host?.trim()
  const port = Number(proxy.port)
  if (!host || !Number.isFinite(port) || port < 1) return undefined

  return `${normalizeBrowserProxyProtocol(proxy.protocol)}://${host}:${port}`
}

export const getBrowserProxyCredentials = (proxy?: requestConfig['proxy']): { username: string, password: string } | undefined => {
  if (!resolveBrowserProxyServer(proxy)) return undefined

  const username = proxy?.auth?.username?.trim()
  if (!username) return undefined

  return {
    username,
    password: proxy?.auth?.password ?? ''
  }
}

export const applyBrowserProxyToLaunchOptions = (
  options: BrowserLaunchOptions,
  proxy?: requestConfig['proxy']
): BrowserLaunchOptions => {
  const proxyServer = resolveBrowserProxyServer(proxy)
  if (!proxyServer) return options

  return {
    ...options,
    args: [
      ...options.args.filter(arg => !arg.startsWith('--proxy-server=')),
      `--proxy-server=${proxyServer}`
    ]
  }
}

export const resolveBrowserExecutablePath = (
  env: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => boolean = fs.existsSync,
  platform: NodeJS.Platform = process.platform,
  startDir: string = process.cwd(),
  readFile: (path: string, encoding: BufferEncoding) => string = fs.readFileSync
): string | undefined => {
  const executablePath = env.KKK_CHROME_EXECUTABLE_PATH?.trim()
  if (executablePath && exists(executablePath)) {
    return executablePath
  }

  const projectExecutablePath = resolveProjectBrowserExecutablePath(env, exists, startDir, readFile)
  if (projectExecutablePath) return projectExecutablePath

  if (isSystemBrowserDiscoveryDisabled(env)) return undefined

  if (platform === 'win32') {
    return windowsBrowserCandidates(env).find(candidate => exists(candidate))
  }

  if (platform === 'darwin') {
    return macBrowserCandidates().find(candidate => exists(candidate))
  }

  if (platform === 'linux') {
    return linuxBrowserCandidates().find(candidate => exists(candidate))
  }

  return undefined
}

export const getBrowserLaunchOptions = (
  protocolTimeout: number,
  env: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => boolean = fs.existsSync,
  platform: NodeJS.Platform = process.platform,
  startDir: string = process.cwd(),
  readFile: (path: string, encoding: BufferEncoding) => string = fs.readFileSync
): BrowserLaunchOptions => {
  const executablePath = resolveBrowserExecutablePath(env, exists, platform, startDir, readFile)

  return {
    headless: 'new',
    protocolTimeout,
    executablePath,
    findBrowser: !executablePath && !isSystemBrowserDiscoveryDisabled(env),
    download: {
      enable: true,
      dir: resolveProjectBrowserDownloadDir(env, exists, startDir),
      browser: env.KKK_BROWSER_DOWNLOAD_BROWSER as BrowserLaunchOptions['download']['browser'] | undefined,
      version: env.KKK_BROWSER_DOWNLOAD_VERSION?.trim() || undefined,
      baseUrl: env.KKK_BROWSER_DOWNLOAD_BASE_URL?.trim() || undefined
    },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--mute-audio',
      '--window-size=1280,720',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-notifications',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-translate'
    ],
    ignoreDefaultArgs: ['--enable-automation']
  }
}

export const createInjectedPage = async (
  browser: unknown,
  options: Record<string, unknown> = {}
) => {
  const { newInjectedPage } = await import('fingerprint-injector')

  return newInjectedPage(browser as never, {
    fingerprintOptions: {
      devices: ['desktop'],
      operatingSystems: ['windows']
    },
    ...options
  })
}

export const closeBrowserSafely = async (
  browserOrHandle: BrowserLike | BrowserHandleLike | undefined,
  timeoutMs = BROWSER_CLOSE_TIMEOUT_MS
) => {
  const browser: BrowserLike | undefined = browserOrHandle && 'close' in browserOrHandle
    ? browserOrHandle
    : browserOrHandle?.browser

  await Promise.race([
    browser?.close?.(),
    sleep(timeoutMs)
  ]).catch(() => {})
}

export const configureRequestBlocking = async (
  page: {
    setRequestInterception: (enabled: boolean) => Promise<void>
    on: (event: 'request', handler: (request: any) => void) => void
  },
  resourceTypes: Iterable<string>
) => {
  const blockedResourceTypes = new Set(resourceTypes)
  if (blockedResourceTypes.size === 0) return

  await page.setRequestInterception(true)
  page.on('request', (request: any) => {
    const resourceType = request.resourceType()
    if (blockedResourceTypes.has(resourceType)) {
      void request.abort()
      return
    }
    void request.continue()
  })
}
