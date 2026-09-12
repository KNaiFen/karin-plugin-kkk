#!/usr/bin/env node

import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDir, '..')
const CHROME_FOR_TESTING_BASE_URL = 'https://storage.googleapis.com/chrome-for-testing-public'
const CHROME_FOR_TESTING_MIRROR_URL = 'https://registry.npmmirror.com/-/binary/chrome-for-testing'
const CHROME_FOR_TESTING_LKG_URL = 'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json'

const browserArgs = [
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
]

const parseArgs = (argv) => {
  const options = {
    root: repositoryRoot,
    browser: process.env.KKK_BROWSER_DOWNLOAD_BROWSER || (process.platform === 'win32' ? 'chromium' : 'chrome-headless-shell'),
    version: process.env.KKK_BROWSER_DOWNLOAD_VERSION || 'stable',
    baseUrl: process.env.KKK_BROWSER_DOWNLOAD_BASE_URL || undefined
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === '--') continue

    if (arg === '--root' && next) {
      options.root = path.resolve(next)
      index += 1
      continue
    }

    if (arg === '--browser' && next) {
      options.browser = next
      index += 1
      continue
    }

    if (arg === '--version' && next) {
      options.version = next
      index += 1
      continue
    }

    if (arg === '--base-url' && next) {
      options.baseUrl = next
      index += 1
    }
  }

  return options
}

const resolveVersion = async (version) => {
  if (!version || version === 'stable') {
    const response = await fetch(CHROME_FOR_TESTING_LKG_URL)
    if (!response.ok) {
      throw new Error(`获取 Chrome stable 版本失败: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data.channels?.Stable?.version
  }

  return version
}

const resolvePlatformSlug = () => {
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64'
  }

  if (process.platform === 'win32') {
    return 'win64'
  }

  if (process.platform === 'linux' && process.arch === 'x64') {
    return 'linux64'
  }

  throw new Error(`当前平台暂不支持自动下载 Chrome for Testing: ${os.platform()}_${os.arch()}`)
}

const resolveExtractedExecutablePath = (installDir, browser, platformSlug) => {
  if (browser !== 'chrome-headless-shell') {
    throw new Error('手动下载兜底只支持 chrome-headless-shell')
  }

  const executableName = process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell'
  return path.join(installDir, `chrome-headless-shell-${platformSlug}`, executableName)
}

const downloadWithCurl = async (url, targetPath) => {
  await new Promise((resolve, reject) => {
    const curl = spawn('curl', [
      '-L',
      '--fail',
      '--retry',
      '2',
      '--connect-timeout',
      '20',
      '--output',
      targetPath,
      url
    ], { stdio: 'inherit' })

    curl.on('error', reject)
    curl.on('exit', (code) => {
      if (code === 0) {
        resolve(undefined)
        return
      }

      reject(new Error(`curl 下载失败，退出码: ${code}`))
    })
  })
}

const downloadWithFetch = async (url, targetPath) => {
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`下载失败: ${response.status} ${response.statusText}`)
  }

  await pipeline(Readable.fromWeb(response.body), createWriteStream(targetPath))
}

const downloadFile = async (url, targetPath) => {
  try {
    await downloadWithCurl(url, targetPath)
    return
  } catch (error) {
    console.warn(`curl 下载失败，改用 fetch: ${error instanceof Error ? error.message : String(error)}`)
  }

  await downloadWithFetch(url, targetPath)
}

const manualDownloadHeadlessBrowser = async (options, cacheDir, requireFromSnapka) => {
  const version = await resolveVersion(options.version)
  const platformSlug = resolvePlatformSlug()
  const installDir = path.join(cacheDir, 'manual', 'chrome-headless-shell', version, platformSlug)
  const executablePath = resolveExtractedExecutablePath(installDir, options.browser, platformSlug)

  try {
    await fs.access(executablePath)
    return { executablePath, version }
  } catch {}

  const extractZipPath = requireFromSnapka.resolve('extract-zip')
  const extractZip = (await import(pathToFileURL(extractZipPath).href)).default
  const zipName = `chrome-headless-shell-${platformSlug}.zip`
  const zipPath = path.join(cacheDir, 'downloads', version, zipName)
  const baseUrls = [
    CHROME_FOR_TESTING_BASE_URL,
    options.baseUrl,
    CHROME_FOR_TESTING_MIRROR_URL
  ].filter((item, index, list) => item && list.indexOf(item) === index)

  await fs.mkdir(path.dirname(zipPath), { recursive: true })
  await fs.mkdir(installDir, { recursive: true })

  let lastError
  for (const baseUrl of baseUrls) {
    const url = `${baseUrl}/${version}/${platformSlug}/${zipName}`
    try {
      console.log(`Download URL: ${url}`)
      await fs.rm(zipPath, { force: true }).catch(() => {})
      await downloadFile(url, zipPath)
      await extractZip(zipPath, { dir: installDir })
      await fs.chmod(executablePath, 0o755).catch(() => {})
      return { executablePath, version }
    } catch (error) {
      lastError = error
      await fs.rm(zipPath, { force: true }).catch(() => {})
    }
  }

  throw lastError ?? new Error('无头浏览器下载失败')
}

const launchProjectBrowser = async (snapka, options, executablePath) => {
  return snapka.launch({
    headless: 'new',
    findBrowser: false,
    protocolTimeout: 30_000,
    executablePath,
    download: executablePath
      ? { enable: false }
      : {
          enable: true,
          dir: options.cacheDir,
          browser: options.browser,
          version: options.version,
          baseUrl: options.baseUrl
        },
    args: browserArgs,
    ignoreDefaultArgs: ['--enable-automation']
  })
}

const writeBrowserConfig = async (root, executablePath, options) => {
  const relativeExecutablePath = path.relative(root, executablePath)
  const configPath = path.join(root, '.kkk-browser.json')
  const config = {
    executablePath: relativeExecutablePath,
    browser: options.browser,
    version: options.version,
    generatedAt: new Date().toISOString()
  }

  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`)
  return configPath
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  const root = options.root
  const cacheDir = path.join(root, '.cache', 'kkk-browser')
  const requireFromCore = createRequire(path.join(repositoryRoot, 'packages', 'core', 'package.json'))
  const snapkaPath = requireFromCore.resolve('@snapka/puppeteer')
  const requireFromSnapka = createRequire(snapkaPath)
  const { snapka } = await import(pathToFileURL(snapkaPath).href)

  await fs.mkdir(cacheDir, { recursive: true })
  options.cacheDir = cacheDir

  let resolvedVersion = options.version
  let puppeteer
  try {
    puppeteer = await launchProjectBrowser(snapka, options)
  } catch (error) {
    console.warn(`Snapka 下载启动失败，改用手动下载兜底: ${error instanceof Error ? error.message : String(error)}`)
    const manual = await manualDownloadHeadlessBrowser(options, cacheDir, requireFromSnapka)
    resolvedVersion = manual.version
    puppeteer = await launchProjectBrowser(snapka, options, manual.executablePath)
  }

  try {
    const executablePath = puppeteer.executablePath()
    if (!executablePath) {
      throw new Error('未能获取无头浏览器可执行文件路径')
    }

    const configPath = await writeBrowserConfig(root, executablePath, { ...options, version: resolvedVersion })
    console.log(`Headless browser executable: ${executablePath}`)
    console.log(`Browser config written: ${configPath}`)
  } finally {
    await puppeteer.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
