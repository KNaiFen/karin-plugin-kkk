import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export const SMOKE_PLATFORMS = [
  'douyin',
  'bilibili',
  'tiktok',
  'kuaishou',
  'xiaohongshu',
  'heybox',
  'x',
  'github',
  'zhihu',
  'tieba',
  'wechat',
  'weibo'
]

export const SMOKE_SAMPLES = [
  {
    id: 'douyin-share-video',
    platform: 'douyin',
    input: 'https://v.douyin.com/Br9x2Q4WNfQ/',
    expectSubtypes: ['video', 'image', 'note'],
    expectedHandler: {
      contains: {
        video: true
      }
    }
  },
  {
    id: 'douyin-article-graphic',
    platform: 'douyin',
    input: 'https://www.douyin.com/article/7636333515160484072',
    expectSubtypes: ['article'],
    expectedHandler: {
      contains: {
        image: true
      }
    }
  },
  {
    id: 'douyin-note-graphic',
    platform: 'douyin',
    input: 'https://v.douyin.com/Y_X0PQLygTY/',
    expectSubtypes: ['image', 'note'],
    expectedHandler: {
      contains: {
        image: true,
        record: true
      }
    }
  },
  {
    id: 'douyin-video-short-link-1',
    platform: 'douyin',
    input: 'https://v.douyin.com/zHQz696aRhA/',
    expectSubtypes: ['video'],
    expectedHandler: {
      contains: {
        video: true
      }
    }
  },
  {
    id: 'douyin-video-short-link-2',
    platform: 'douyin',
    input: 'https://v.douyin.com/wo2Il-n4-J4/',
    expectSubtypes: ['video'],
    expectedHandler: {
      contains: {
        video: true
      }
    }
  },
  {
    id: 'bilibili-share-video',
    platform: 'bilibili',
    input: 'https://b23.tv/EGrR7XL',
    expectSubtypes: ['video', 'dynamic', 'article'],
    requiredCookiePlatform: 'bilibili'
  },
  {
    id: 'tiktok-video',
    platform: 'tiktok',
    input: 'https://www.tiktok.com/@good.ball21/video/7643493503778966797',
    expectSubtypes: ['video']
  },
  {
    id: 'kuaishou-short-video',
    platform: 'kuaishou',
    input: 'https://www.kuaishou.com/short-video/3x8s2qmteama6ha',
    expectSubtypes: ['video']
  },
  {
    id: 'xiaohongshu-short-link',
    platform: 'xiaohongshu',
    input: 'http://xhslink.cn/o/1wPOQ9a9RyI',
    expectSubtypes: ['note', 'image', 'video']
  },
  {
    id: 'heybox-share-link',
    platform: 'heybox',
    input: 'https://api.xiaoheihe.cn/v3/bbs/app/api/web/share?link_id=77f871fa97e9',
    expectSubtypes: ['post', 'article', 'video', 'image']
  },
  {
    id: 'x-status',
    platform: 'x',
    input: 'https://x.com/cakedochi/status/2050564108114899179',
    expectSubtypes: ['status', 'video', 'image']
  },
  {
    id: 'github-repo',
    platform: 'github',
    input: 'https://github.com/openai/openai-node',
    expectSubtypes: ['repository', 'text', 'article']
  },
  {
    id: 'zhihu-article',
    platform: 'zhihu',
    input: 'https://zhuanlan.zhihu.com/p/2010754233901737586',
    expectSubtypes: ['article', 'answer', 'video']
  },
  {
    id: 'tieba-post',
    platform: 'tieba',
    input: 'https://tieba.baidu.com/p/5281940476',
    expectSubtypes: ['post']
  },
  {
    id: 'wechat-article',
    platform: 'wechat',
    input: 'https://mp.weixin.qq.com/s/tAJ1B8ClOjQ41TWYJbIFTA',
    expectSubtypes: ['article']
  },
  {
    id: 'weibo-status',
    platform: 'weibo',
    input: 'https://weibo.com/5177612153/R34sAiuo6',
    expectSubtypes: ['status', 'video_show']
  }
]

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CORE_DIR = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(CORE_DIR, '..', '..')
const OUTER_WORKSPACE_ROOT = path.resolve(REPO_ROOT, '..')
const PNPM_COMMAND = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

const resolvePackSmokeBrowserCandidates = () => {
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    ]
  }

  if (process.platform === 'win32') {
    return [
      process.env.KKK_CHROME_EXECUTABLE_PATH,
      process.env.ProgramFiles && path.win32.join(process.env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      process.env['ProgramFiles(x86)'] && path.win32.join(process.env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
      process.env.LOCALAPPDATA && path.win32.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      process.env.ProgramFiles && path.win32.join(process.env.ProgramFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      process.env['ProgramFiles(x86)'] && path.win32.join(process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      process.env.LOCALAPPDATA && path.win32.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    ].filter(Boolean)
  }

  return [
    process.env.KKK_CHROME_EXECUTABLE_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge'
  ].filter(Boolean)
}

const resolvePackSmokeBrowserExecutablePath = async () => {
  const configured = process.env.KKK_CHROME_EXECUTABLE_PATH?.trim()
  const candidates = configured
    ? [configured, ...resolvePackSmokeBrowserCandidates()]
    : resolvePackSmokeBrowserCandidates()

  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      await fs.access(candidate)
      return candidate
    } catch {}
  }

  return undefined
}

export const buildPackSmokePuppeteerConfig = (browserExecutablePath) => {
  const normalizedPath = String(browserExecutablePath ?? '').trim()
  if (!normalizedPath) return null

  return {
    protocol: 'cdp',
    headless: 'new',
    findBrowser: false,
    executablePath: normalizedPath,
    download: {
      enable: false
    }
  }
}

const SHARED_CHANGE_PATTERNS = [
  'packages/core/package.json',
  'packages/core/scripts/',
  'packages/core/src/apps/',
  'packages/core/src/module/server/',
  'packages/core/src/module/summaryParse/',
  'packages/core/src/platform/resolveParsedPost/',
  'packages/core/src/platform/parsedPost',
  'packages/core/src/module/utils/GuestCookieManager',
  'packages/core/src/module/utils/BrowserRuntime',
  'packages/core/src/module/utils/OutboundRequest',
  'packages/core/config/default_config/'
]

const normalizePath = (value) => String(value ?? '').replace(/\\/g, '/').replace(/^\.\//, '')

const normalizePlatformList = (platforms = []) => {
  const seen = new Set()
  const result = []

  for (const platform of platforms) {
    const normalized = String(platform ?? '').trim()
    if (!normalized || seen.has(normalized) || !SMOKE_PLATFORMS.includes(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

export const inferSmokePlatformsFromChangedFiles = (files = []) => {
  const normalizedFiles = files.map(normalizePath).filter(Boolean)
  const matchedPlatforms = new Set()
  let requiresFullRun = normalizedFiles.length === 0

  for (const file of normalizedFiles) {
    if (SHARED_CHANGE_PATTERNS.some(pattern => file.startsWith(pattern))) {
      requiresFullRun = true
      continue
    }

    let matchedSpecificPlatform = false
    for (const platform of SMOKE_PLATFORMS) {
      if (file.includes(`/src/platform/${platform}/`) || file.includes(`/test/${platform}`)) {
        matchedPlatforms.add(platform)
        matchedSpecificPlatform = true
      }
    }

    if (!matchedSpecificPlatform && file.startsWith('packages/core/')) {
      requiresFullRun = true
    }
  }

  if (requiresFullRun || matchedPlatforms.size === 0) {
    return {
      requiresFullRun: true,
      platforms: [...SMOKE_PLATFORMS]
    }
  }

  return {
    requiresFullRun: false,
    platforms: [...matchedPlatforms].sort((left, right) => SMOKE_PLATFORMS.indexOf(left) - SMOKE_PLATFORMS.indexOf(right))
  }
}

export const selectSmokeSamples = ({
  full = false,
  changedFiles = [],
  explicitPlatforms = []
} = {}) => {
  const explicit = normalizePlatformList(explicitPlatforms)
  const inferred = full
    ? { platforms: [...SMOKE_PLATFORMS] }
    : inferSmokePlatformsFromChangedFiles(changedFiles)

  const targetPlatforms = explicit.length > 0
    ? inferred.platforms.filter(platform => explicit.includes(platform))
    : inferred.platforms

  return SMOKE_SAMPLES.filter(sample => targetPlatforms.includes(sample.platform))
}

const offsetSignature = (hex) => Array.from(hex).map(char => String.fromCharCode(char.charCodeAt(0) + 5)).join('')

export const encodeSignatureHex = (hex) => {
  const asHex = Buffer.from(offsetSignature(hex), 'utf8').toString('hex')
  const reversed = asHex.split('').reverse().join('')
  const base64Inner = Buffer.from(reversed, 'utf8').toString('base64')
  const urlEncoded = encodeURIComponent(base64Inner)
  return Buffer.from(urlEncoded, 'utf8').toString('base64')
}

const createNonce = () => crypto.randomBytes(8).toString('hex')

export const createSignedRequestHeaders = ({
  method,
  urlPath,
  body,
  timestamp = Date.now(),
  nonce = createNonce(),
  token
}) => {
  const normalizedMethod = String(method ?? 'GET').toUpperCase()
  const normalizedBody = normalizedMethod === 'GET' ? '' : JSON.stringify(body ?? {})
  const signatureString = `${normalizedMethod}|${urlPath}|${normalizedBody}|${timestamp}|${nonce}`
  const hex = crypto.createHmac('sha256', token).update(signatureString).digest('hex')

  return {
    authorization: `Bearer ${token}`,
    'x-signature': encodeSignatureHex(hex),
    'x-timestamp': String(timestamp),
    'x-nonce': nonce
  }
}

const yamlEscape = (value) => `'${String(value ?? '').replace(/'/g, "''")}'`

const getCookieEnvCandidates = (platform) => {
  const upper = String(platform).toUpperCase()
  return [
    `KKK_SMOKE_COOKIE_${upper}`,
    `KKK_SMOKE_${upper}_COOKIE`,
    `${upper}_COOKIE`
  ]
}

const readCookieFromEnv = (platform) => {
  for (const key of getCookieEnvCandidates(platform)) {
    const value = process.env[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

const GUEST_COOKIE_PLATFORMS = ['douyin', 'xiaohongshu', 'tiktok', 'heybox', 'zhihu', 'weibo']

const writeRuntimeConfigFiles = async (runtimeDir, samples = []) => {
  const configDir = path.join(runtimeDir, '@karinjs', 'karin-plugin-kkk', 'config')
  await fs.mkdir(configDir, { recursive: true })

  const cookies = Object.fromEntries([
    'douyin',
    'bilibili',
    'kuaishou',
    'xiaohongshu',
    'tiktok',
    'heybox',
    'zhihu',
    'tieba',
    'weibo'
  ].map(platform => [platform, readCookieFromEnv(platform)]))

  const cookiesYaml = [
    '# generated by pack-smoke',
    ...Object.entries(cookies).map(([key, value]) => `${key}: ${yamlEscape(value)}`)
  ].join('\n') + '\n'

  const selectedGuestPlatforms = new Set(
    samples
      .map(sample => sample.platform)
      .filter(platform => GUEST_COOKIE_PLATFORMS.includes(platform))
  )

  const guestCookieYaml = [
    '# generated by pack-smoke',
    `switch: ${selectedGuestPlatforms.size > 0 ? 'true' : 'false'}`,
    'logging:',
    '  switch: false',
    ...GUEST_COOKIE_PLATFORMS.flatMap(platform => [
      `${platform}:`,
      `  switch: ${selectedGuestPlatforms.has(platform) ? 'true' : 'false'}`
    ])
  ].join('\n') + '\n'

  await fs.writeFile(path.join(configDir, 'cookies.yaml'), cookiesYaml, 'utf8')
  await fs.writeFile(path.join(configDir, 'guestCookie.yaml'), guestCookieYaml, 'utf8')
}

const execCommand = (command, args, options = {}) => {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...(options.env ?? {})
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', chunk => {
      stdout += chunk.toString()
    })

    child.stderr?.on('data', chunk => {
      stderr += chunk.toString()
    })

    child.on('error', error => {
      resolve({
        code: 1,
        stdout,
        stderr: stderr || error.message
      })
    })

    child.on('close', code => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr
      })
    })
  })
}

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'))

const stripWrappingQuotes = (value) => String(value ?? '').trim().replace(/^['"]|['"]$/g, '')

const readWorkspaceAllowedBuildDependencies = async () => {
  const allowed = new Set()

  try {
    const rootPackageJson = await readJson(path.join(REPO_ROOT, 'package.json'))
    for (const dependency of rootPackageJson.pnpm?.onlyBuiltDependencies ?? []) {
      const normalized = stripWrappingQuotes(dependency)
      if (normalized) allowed.add(normalized)
    }
  } catch {}

  try {
    const workspaceYaml = await fs.readFile(path.join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8')
    const match = workspaceYaml.match(/(?:^|\n)onlyBuiltDependencies:\s*\n((?:\s+-\s+.*\n)+)/m)
    if (match?.[1]) {
      for (const line of match[1].split(/\r?\n/)) {
        const dependencyMatch = line.match(/^\s*-\s+(.+?)\s*$/)
        const normalized = stripWrappingQuotes(dependencyMatch?.[1] ?? '')
        if (normalized) allowed.add(normalized)
      }
    }
  } catch {}

  return [...allowed]
}

const readWorkspaceVersions = async () => {
  const rootPackageJson = await readJson(path.join(REPO_ROOT, 'package.json'))
  const corePackageJson = await readJson(path.join(CORE_DIR, 'package.json'))

  return {
    nodeKarinVersion: rootPackageJson.dependencies?.['node-karin'] ?? '1.15.5',
    puppeteerPluginVersion: corePackageJson.devDependencies?.['@karinjs/plugin-puppeteer'] ?? '^2.3.1',
    allowedBuildDependencies: await readWorkspaceAllowedBuildDependencies()
  }
}

const parseSemver = (value) => {
  const match = String(value ?? '').trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/)
  if (!match) return null
  return match.slice(1, 4).map(part => Number.parseInt(part, 10))
}

const compareSemver = (left, right) => {
  const a = parseSemver(left)
  const b = parseSemver(right)
  if (!a && !b) return 0
  if (!a) return -1
  if (!b) return 1
  for (let index = 0; index < 3; index += 1) {
    if (a[index] === b[index]) continue
    return a[index] > b[index] ? 1 : -1
  }
  return 0
}

const findLatestPackagedTgz = async (searchDirs) => {
  let latest = null

  for (const directory of searchDirs) {
    let entries
    try {
      entries = await fs.readdir(directory)
    } catch {
      continue
    }

    for (const fileName of entries) {
      const match = fileName.match(/^karin-plugin-kkk-(.+)\.tgz$/)
      if (!match) continue
      if (!latest || compareSemver(match[1], latest.version) > 0) {
        latest = {
          fileName,
          version: match[1],
          path: path.resolve(directory, fileName)
        }
      }
    }
  }

  return latest
}

const getFreePort = async () => {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('无法获取空闲端口'))
        return
      }
      const { port } = address
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })
}

const sleep = (ms) => new Promise(resolve => {
  setTimeout(resolve, ms)
})

const tail = (value, lineCount = 40) => {
  return String(value ?? '').split(/\r?\n/).slice(-lineCount).join('\n')
}

const extractBaseUrlFromLogs = (stdout, fallbackBaseUrl) => {
  const match = String(stdout ?? '').match(/WebUI 访问地址:\s*(https?:\/\/[^\s/]+)(?:\/web\/login\?token=|\/?)/)
  return match?.[1] ?? fallbackBaseUrl
}

const resolveLoggedBaseUrl = async ({ runtime, fallbackBaseUrl, timeoutMs = 30000 }) => {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const current = extractBaseUrlFromLogs(runtime.getLogs().stdout, fallbackBaseUrl)
    if (current !== fallbackBaseUrl) {
      return current
    }
    await sleep(500)
  }

  return extractBaseUrlFromLogs(runtime.getLogs().stdout, fallbackBaseUrl)
}

const waitForServerReady = async ({ baseUrl, token, timeoutMs = 120000 }) => {
  const deadline = Date.now() + timeoutMs
  let lastFailure = '尚未发起检查'

  while (Date.now() < deadline) {
    try {
      const pathName = '/api/kkk/v1/bots'
      const headers = createSignedRequestHeaders({
        method: 'GET',
        urlPath: pathName,
        token
      })
      const response = await fetch(`${baseUrl}${pathName}`, {
        method: 'GET',
        headers
      })

      if (response.ok) {
        return true
      }
      const text = await response.text().catch(() => '')
      lastFailure = `HTTP ${response.status} ${text}`
    } catch {}
    if (!lastFailure.startsWith('HTTP')) {
      lastFailure = '连接失败或服务尚未监听端口'
    }

    await sleep(1500)
  }

  return lastFailure
}

const createRuntimePackageJson = async (runtimeDir) => {
  const packageJson = {
    name: 'kkk-pack-smoke-runtime',
    private: true,
    type: 'module'
  }

  await fs.writeFile(
    path.join(runtimeDir, 'package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`,
    'utf8'
  )
}

const createRuntimeEnvFile = async ({ runtimeDir, port, token }) => {
  const lines = [
    'HTTP_ENABLE="true"',
    `HTTP_PORT="${port}"`,
    'HTTP_HOST="127.0.0.1"',
    `HTTP_AUTH_KEY="${token}"`,
    'PM2_RESTART="false"',
    'NODE_ENV="production"'
  ]

  await fs.writeFile(path.join(runtimeDir, '.env'), `${lines.join('\n')}\n`, 'utf8')
}

const writeRuntimePuppeteerConfig = async ({ runtimeDir, browserExecutablePath }) => {
  const config = buildPackSmokePuppeteerConfig(browserExecutablePath)
  if (!config) return

  const configPath = path.join(
    runtimeDir,
    '@karinjs',
    '@karinjs-plugin-puppeteer',
    'config',
    'config.json'
  )
  await fs.mkdir(path.dirname(configPath), { recursive: true })
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}

const installRuntime = async ({ runtimeDir, tgzPath, cacheDir }) => {
  const versions = await readWorkspaceVersions()
  const allowBuildArgs = versions.allowedBuildDependencies.flatMap(dependency => [`--allow-build=${dependency}`])
  const result = await execCommand(
    PNPM_COMMAND,
    [
      'add',
      ...allowBuildArgs,
      `node-karin@${versions.nodeKarinVersion}`,
      `@karinjs/plugin-puppeteer@${versions.puppeteerPluginVersion}`,
      tgzPath
    ],
    {
      cwd: runtimeDir,
      env: {
        NPM_CONFIG_CACHE: cacheDir
      }
    }
  )

  if (result.code !== 0) {
    throw new Error(`安装打包运行时失败：${result.stderr || result.stdout || '未知错误'}`)
  }
}

const startRuntimeProcess = async ({ runtimeDir, port, token, cacheDir, browserExecutablePath, verbose = false }) => {
  const env = {
    ...process.env,
    EBV_FILE: '.env',
    NPM_CONFIG_CACHE: cacheDir,
    HTTP_ENABLE: 'true',
    HTTP_PORT: String(port),
    HTTP_AUTH_KEY: token,
    PM2_RESTART: 'false',
    NODE_ENV: 'production'
  }
  if (browserExecutablePath) {
    env.KKK_CHROME_EXECUTABLE_PATH = browserExecutablePath
  }

  const child = spawn(PNPM_COMMAND, ['exec', 'karin', 'app'], {
    cwd: runtimeDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  let stdout = ''
  let stderr = ''

  child.stdout?.on('data', chunk => {
    const text = chunk.toString()
    stdout += text
    if (verbose) process.stdout.write(text)
  })

  child.stderr?.on('data', chunk => {
    const text = chunk.toString()
    stderr += text
    if (verbose) process.stderr.write(text)
  })

  return {
    child,
    getLogs: () => ({
      stdout,
      stderr
    })
  }
}

const stopRuntimeProcess = async (child) => {
  if (!child || child.exitCode !== null) return

  child.kill('SIGINT')
  await Promise.race([
    new Promise(resolve => child.once('close', resolve)),
    sleep(5000)
  ])

  if (child.exitCode === null) {
    child.kill('SIGKILL')
  }
}

export const buildSmokeRequestPath = (platform, mode = 'parse') => {
  return mode === 'handler'
    ? `/api/kkk/v1/platforms/${platform}/simulate-handler-by-url`
    : `/api/kkk/v1/platforms/${platform}/parse-by-url`
}

const assertParseResponse = (sample, data) => {
  if (!data || data.platform !== sample.platform) {
    throw new Error(`平台返回不匹配：期望 ${sample.platform}，收到 ${data?.platform ?? 'unknown'}`)
  }
  if (!String(data.extractedUrl ?? '').trim()) {
    throw new Error('extractedUrl 为空')
  }
  if (!String(data.contentSummary?.title ?? '').trim()) {
    throw new Error('contentSummary.title 为空')
  }
  if (Array.isArray(sample.expectSubtypes) && sample.expectSubtypes.length > 0) {
    const subtype = String(data.contentSummary?.subtype ?? '')
    if (!sample.expectSubtypes.includes(subtype)) {
      throw new Error(`subtype 不在预期范围内：${subtype}`)
    }
  }
  const plannedOutputs = Array.isArray(data.replySummary?.plannedOutputs)
    ? data.replySummary.plannedOutputs
    : []
  const plainTitleText = String(data.replySummary?.plainTitleText ?? '').trim()
  if (plannedOutputs.length === 0 && !plainTitleText) {
    throw new Error('replySummary 缺少 plannedOutputs/plainTitleText')
  }
}

const assertHandlerResponse = (sample, data) => {
  if (!data || data.platform !== sample.platform) {
    throw new Error(`平台返回不匹配：期望 ${sample.platform}，收到 ${data?.platform ?? 'unknown'}`)
  }
  if (!String(data.extractedUrl ?? '').trim()) {
    throw new Error('extractedUrl 为空')
  }
  const outputs = Array.isArray(data.simulation?.outputs) ? data.simulation.outputs : []
  if (outputs.length === 0) {
    throw new Error('handler 输出为空')
  }

  const requiredContains = sample.expectedHandler?.contains ?? {}
  for (const [key, expected] of Object.entries(requiredContains)) {
    if (!expected) continue
    if (!data.simulation?.contains?.[key]) {
      throw new Error(`handler 输出缺少 ${key}`)
    }
  }
}

export const assertSmokeResponse = (sample, mode, data) => {
  if (mode === 'handler') {
    assertHandlerResponse(sample, data)
    return
  }

  assertParseResponse(sample, data)
}

const requestSmokeSample = async ({ baseUrl, token, sample, mode = 'parse' }) => {
  const pathName = buildSmokeRequestPath(sample.platform, mode)
  const body = {
    input: sample.input
  }
  const headers = {
    'content-type': 'application/json',
    ...createSignedRequestHeaders({
      method: 'POST',
      urlPath: pathName,
      body,
      token
    })
  }

  const response = await fetch(`${baseUrl}${pathName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })
  const text = await response.text()
  let payload = null

  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    throw new Error(`响应不是合法 JSON：${text}`)
  }

  if (!response.ok) {
    throw new Error(`接口请求失败：HTTP ${response.status} ${payload?.message ?? text}`)
  }

  if (payload?.success === false) {
    throw new Error(`接口请求失败：HTTP ${response.status} ${payload?.message ?? text}`)
  }

  const data = payload?.data ?? payload
  assertSmokeResponse(sample, mode, data)
  return data
}

const collectChangedFiles = async () => {
  const diffResult = await execCommand('git', ['diff', '--name-only', 'HEAD'], { cwd: REPO_ROOT })
  const untrackedResult = await execCommand('git', ['ls-files', '--others', '--exclude-standard'], { cwd: REPO_ROOT })

  const files = new Set(
    `${diffResult.stdout}\n${untrackedResult.stdout}`
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
  )

  return [...files]
}

export const runPackSmokeSuite = async ({
  tgzPath,
  full = false,
  explicitPlatforms = [],
  mode = 'parse',
  changedFiles,
  keepRuntime = false,
  verbose = false
} = {}) => {
  const effectiveChangedFiles = Array.isArray(changedFiles)
    ? changedFiles
    : await collectChangedFiles()
  const samples = selectSmokeSamples({
    full,
    changedFiles: effectiveChangedFiles,
    explicitPlatforms
  })

  if (samples.length === 0) {
    return {
      status: 'no_samples',
      samples: [],
      changedFiles: effectiveChangedFiles
    }
  }

  const resolvedTgz = tgzPath
    ? path.resolve(tgzPath)
    : (await findLatestPackagedTgz([
        process.cwd(),
        REPO_ROOT,
        OUTER_WORKSPACE_ROOT
      ]))?.path

  if (!resolvedTgz) {
    throw new Error('未找到可用的 karin-plugin-kkk-*.tgz，请先 build + pack 或显式传入 --tgz')
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kkk-pack-smoke-'))
  const runtimeDir = path.join(tempRoot, 'runtime')
  const cacheDir = path.join(tempRoot, 'npm-cache')
  const token = `smoke-${crypto.randomBytes(6).toString('hex')}`
  const port = await getFreePort()
  const fallbackBaseUrl = `http://127.0.0.1:${port}`
  const browserExecutablePath = await resolvePackSmokeBrowserExecutablePath()

  await fs.mkdir(runtimeDir, { recursive: true })
  await fs.mkdir(cacheDir, { recursive: true })
  await createRuntimePackageJson(runtimeDir)
  await createRuntimeEnvFile({ runtimeDir, port, token })
  await installRuntime({ runtimeDir, tgzPath: resolvedTgz, cacheDir })
  await writeRuntimePuppeteerConfig({ runtimeDir, browserExecutablePath })
  await writeRuntimeConfigFiles(runtimeDir, samples)

  const runtime = await startRuntimeProcess({
    runtimeDir,
    port,
    token,
    cacheDir,
    browserExecutablePath,
    verbose
  })

  try {
    const baseUrl = await resolveLoggedBaseUrl({
      runtime,
      fallbackBaseUrl
    })
    const ready = await waitForServerReady({ baseUrl, token })
    if (ready !== true) {
      const logs = runtime.getLogs()
      throw new Error(`打包运行时服务启动超时（最后一次检查：${ready}）。\nstdout:\n${tail(logs.stdout)}\n\nstderr:\n${tail(logs.stderr)}`)
    }

    const results = {
      passed: [],
      failed: [],
      skipped: []
    }

    for (const sample of samples) {
      if (sample.requiredCookiePlatform && !readCookieFromEnv(sample.requiredCookiePlatform)) {
        results.skipped.push({
          sample,
          reason: `缺少 ${sample.requiredCookiePlatform} Cookie 环境变量`
        })
        continue
      }

      try {
        const data = await requestSmokeSample({
          baseUrl,
          token,
          sample,
          mode
        })
        results.passed.push({
          sample,
          data
        })
      } catch (error) {
        results.failed.push({
          sample,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    return {
      status: results.failed.length === 0 ? 'passed' : 'failed',
      tgzPath: resolvedTgz,
      runtimeDir,
      baseUrl,
      port,
      mode,
      changedFiles: effectiveChangedFiles,
      samples,
      ...results
    }
  } finally {
    await stopRuntimeProcess(runtime.child)
    if (!keepRuntime) {
      await fs.rm(tempRoot, { recursive: true, force: true })
    }
  }
}
