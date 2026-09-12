#!/usr/bin/env node

import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const DEFAULT_PACKAGE_NAME = 'karin-plugin-kkk'
const DEFAULT_INTERVAL_MS = 10_000
const DEFAULT_STATE_FILE_NAME = '.kkk-auto-update-state.json'
const PNPM_COMMAND = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

const semverPattern = /^(?:v)?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const parseSemver = (value) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  const match = trimmed.match(semverPattern)
  if (!match) return null

  return {
    raw: trimmed,
    major: Number.parseInt(match[1] ?? '0', 10) || 0,
    minor: Number.parseInt(match[2] ?? '0', 10) || 0,
    patch: Number.parseInt(match[3] ?? '0', 10) || 0,
    prerelease: match[4] ? match[4].split('.') : []
  }
}

const compareSemverIdentifiers = (left, right) => {
  const leftNumeric = /^\d+$/.test(left)
  const rightNumeric = /^\d+$/.test(right)

  if (leftNumeric && rightNumeric) {
    const leftNumber = Number.parseInt(left, 10)
    const rightNumber = Number.parseInt(right, 10)
    if (leftNumber === rightNumber) return 0
    return leftNumber > rightNumber ? 1 : -1
  }

  if (leftNumeric && !rightNumeric) return -1
  if (!leftNumeric && rightNumeric) return 1
  if (left === right) return 0
  return left > right ? 1 : -1
}

export const compareSemver = (left, right) => {
  const parsedLeft = parseSemver(left)
  const parsedRight = parseSemver(right)

  if (!parsedLeft && !parsedRight) return 0
  if (!parsedLeft) return -1
  if (!parsedRight) return 1

  if (parsedLeft.major !== parsedRight.major) return parsedLeft.major > parsedRight.major ? 1 : -1
  if (parsedLeft.minor !== parsedRight.minor) return parsedLeft.minor > parsedRight.minor ? 1 : -1
  if (parsedLeft.patch !== parsedRight.patch) return parsedLeft.patch > parsedRight.patch ? 1 : -1

  if (parsedLeft.prerelease.length === 0 && parsedRight.prerelease.length === 0) return 0
  if (parsedLeft.prerelease.length === 0) return 1
  if (parsedRight.prerelease.length === 0) return -1

  const limit = Math.min(parsedLeft.prerelease.length, parsedRight.prerelease.length)
  for (let index = 0; index < limit; index += 1) {
    const result = compareSemverIdentifiers(parsedLeft.prerelease[index], parsedRight.prerelease[index])
    if (result !== 0) return result
  }

  if (parsedLeft.prerelease.length === parsedRight.prerelease.length) return 0
  return parsedLeft.prerelease.length > parsedRight.prerelease.length ? 1 : -1
}

export const parseReleaseFilename = (fileName, packageName = DEFAULT_PACKAGE_NAME) => {
  const regex = new RegExp(`^${escapeRegExp(packageName)}-(.+)\\.tgz$`)
  const match = fileName.match(regex)
  if (!match) return null

  const version = match[1]
  if (!parseSemver(version)) return null

  return {
    fileName,
    version
  }
}

export const findLatestRelease = (fileNames, packageName = DEFAULT_PACKAGE_NAME) => {
  let latest = null

  for (const fileName of fileNames) {
    const parsed = parseReleaseFilename(fileName, packageName)
    if (!parsed) continue

    if (!latest || compareSemver(parsed.version, latest.version) > 0) {
      latest = parsed
    }
  }

  return latest
}

const defaultStateFile = (runtimeDir) => path.join(runtimeDir, DEFAULT_STATE_FILE_NAME)

const readJsonFile = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

const getHigherVersion = (...versions) => {
  return versions
    .filter((value) => typeof value === 'string' && parseSemver(value))
    .reduce((highest, current) => {
      if (!highest) return current
      return compareSemver(current, highest) > 0 ? current : highest
    }, null)
}

export const readInstalledVersion = async (runtimeDir, packageName = DEFAULT_PACKAGE_NAME) => {
  const packageJsonPath = path.join(runtimeDir, 'node_modules', packageName, 'package.json')
  const parsed = await readJsonFile(packageJsonPath)

  if (!parsed || typeof parsed.version !== 'string' || !parseSemver(parsed.version)) {
    return null
  }

  return parsed.version.trim()
}

const defaultExecCommand = (command, args, options) => {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
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

const writeStateFile = async (stateFile, state) => {
  await fs.mkdir(path.dirname(stateFile), { recursive: true })
  await fs.writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

export const runReleaseCheck = async ({
  watchDir,
  runtimeDir = process.cwd(),
  packageName = DEFAULT_PACKAGE_NAME,
  stateFile = defaultStateFile(runtimeDir),
  execCommand = defaultExecCommand,
  logger = console
}) => {
  const directoryEntries = await fs.readdir(watchDir, { withFileTypes: true })
  const release = findLatestRelease(
    directoryEntries.filter(item => item.isFile()).map(item => item.name),
    packageName
  )

  if (!release) {
    return {
      status: 'no_release'
    }
  }

  const [state, installedVersion] = await Promise.all([
    readJsonFile(stateFile),
    readInstalledVersion(runtimeDir, packageName)
  ])

  const currentVersion = getHigherVersion(state?.installedVersion, installedVersion)
  if (currentVersion && compareSemver(release.version, currentVersion) <= 0) {
    return {
      status: 'up_to_date',
      currentVersion,
      release
    }
  }

  const releasePath = path.resolve(watchDir, release.fileName)
  logger.info?.(`[kkk-auto-update] 检测到新安装包 ${release.fileName}，准备安装`)

  const installResult = await execCommand(PNPM_COMMAND, ['add', releasePath], { cwd: runtimeDir })
  if (installResult.code !== 0) {
    logger.error?.(`[kkk-auto-update] 安装失败：${installResult.stderr || installResult.stdout || '未知错误'}`)
    return {
      status: 'install_failed',
      currentVersion,
      release,
      installResult
    }
  }

  const restartResult = await execCommand(PNPM_COMMAND, ['exec', 'karin', 'rs'], { cwd: runtimeDir })
  if (restartResult.code !== 0) {
    logger.error?.(`[kkk-auto-update] 重启失败：${restartResult.stderr || restartResult.stdout || '未知错误'}`)
    return {
      status: 'restart_failed',
      currentVersion,
      release,
      restartResult
    }
  }

  await writeStateFile(stateFile, {
    installedVersion: release.version,
    installedFile: release.fileName,
    installedFrom: releasePath,
    installedAt: new Date().toISOString()
  })

  logger.info?.(`[kkk-auto-update] 已完成安装并触发重启：${currentVersion ?? 'unknown'} -> ${release.version}`)
  return {
    status: 'updated',
    currentVersion,
    release
  }
}

const sleep = (ms) => new Promise(resolve => {
  setTimeout(resolve, ms)
})

const parseArgs = (argv) => {
  const options = {
    watchDir: '',
    runtimeDir: process.cwd(),
    packageName: DEFAULT_PACKAGE_NAME,
    intervalMs: DEFAULT_INTERVAL_MS,
    once: false,
    stateFile: ''
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--release-dir' || arg === '--watch-dir') {
      options.watchDir = argv[index + 1] ?? ''
      index += 1
      continue
    }

    if (arg === '--runtime-dir') {
      options.runtimeDir = argv[index + 1] ?? options.runtimeDir
      index += 1
      continue
    }

    if (arg === '--package-name') {
      options.packageName = argv[index + 1] ?? options.packageName
      index += 1
      continue
    }

    if (arg === '--state-file') {
      options.stateFile = argv[index + 1] ?? ''
      index += 1
      continue
    }

    if (arg === '--interval-ms') {
      const nextValue = Number.parseInt(argv[index + 1] ?? '', 10)
      if (Number.isFinite(nextValue) && nextValue > 0) {
        options.intervalMs = nextValue
      }
      index += 1
      continue
    }

    if (arg === '--once') {
      options.once = true
      continue
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }

    throw new Error(`未知参数：${arg}`)
  }

  return options
}

const printHelp = () => {
  console.log(`kkk-auto-update

用法：
  kkk-auto-update --release-dir <dir> [--runtime-dir <dir>] [--interval-ms <ms>] [--once]

参数：
  --release-dir, --watch-dir   存放 karin-plugin-kkk-<version>.tgz 的目录（必填）
  --runtime-dir                Karin 运行目录，默认当前目录
  --state-file                 安装状态文件，默认 <runtime-dir>/${DEFAULT_STATE_FILE_NAME}
  --package-name               包名，默认 ${DEFAULT_PACKAGE_NAME}
  --interval-ms                轮询间隔，默认 ${DEFAULT_INTERVAL_MS}
  --once                       只执行一次扫描，不进入常驻轮询
`)
}

export const runWatcher = async (options) => {
  const stateFile = options.stateFile || defaultStateFile(options.runtimeDir)
  let stopping = false

  const stop = () => {
    stopping = true
  }

  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)

  try {
    while (!stopping) {
      try {
        await runReleaseCheck({
          watchDir: options.watchDir,
          runtimeDir: options.runtimeDir,
          packageName: options.packageName,
          stateFile
        })
      } catch (error) {
        console.error(`[kkk-auto-update] 轮询失败：${error instanceof Error ? error.message : String(error)}`)
      }

      if (options.once) break
      await sleep(options.intervalMs)
    }
  } finally {
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
  }
}

export const main = async (argv = process.argv.slice(2)) => {
  const options = parseArgs(argv)

  if (options.help) {
    printHelp()
    return
  }

  if (!options.watchDir) {
    throw new Error('缺少 --release-dir 参数')
  }

  await runWatcher(options)
}

const entryPath = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === entryPath) {
  main().catch((error) => {
    console.error(`[kkk-auto-update] 启动失败：${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
