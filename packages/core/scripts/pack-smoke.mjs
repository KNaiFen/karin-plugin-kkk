#!/usr/bin/env node

import process from 'node:process'

import { runPackSmokeSuite } from './pack-smoke-lib.mjs'

const printHelp = () => {
  console.log(`kkk pack smoke

Usage:
  node ./scripts/pack-smoke.mjs [--full] [--platform <name[,name]>] [--mode <parse|handler>] [--tgz <path>] [--keep-runtime] [--verbose]

Options:
  --changed           根据当前工作区变更自动选平台（默认）
  --full              全平台全样例
  --platform <list>   显式指定平台，逗号分隔，可与 --changed/--full 叠加
  --mode <type>       smoke 模式：parse（默认）或 handler
  --tgz <path>        指定待安装的 karin-plugin-kkk tgz
  --keep-runtime      保留临时运行目录，便于排查
  --verbose           透传运行时 stdout/stderr
  --help              查看帮助
`)
}

const parseArgs = (argv) => {
  const options = {
    full: false,
    explicitPlatforms: [],
    mode: 'parse',
    tgzPath: '',
    keepRuntime: false,
    verbose: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case '--full':
        options.full = true
        break
      case '--changed':
        options.full = false
        break
      case '--platform':
        options.explicitPlatforms.push(...String(argv[index + 1] ?? '').split(','))
        index += 1
        break
      case '--mode':
        options.mode = String(argv[index + 1] ?? 'parse') || 'parse'
        index += 1
        break
      case '--tgz':
        options.tgzPath = String(argv[index + 1] ?? '')
        index += 1
        break
      case '--keep-runtime':
        options.keepRuntime = true
        break
      case '--verbose':
        options.verbose = true
        break
      case '--help':
      case '-h':
        options.help = true
        break
      default:
        break
    }
  }

  return options
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const result = await runPackSmokeSuite(options)

  if (result.status === 'no_samples') {
    console.log('没有选出需要执行的 smoke 样例。')
    return
  }

  console.log(`使用安装包：${result.tgzPath}`)
  console.log(`模式：${result.mode}`)
  console.log(`命中样例：${result.samples.length}`)
  console.log(`通过：${result.passed.length}`)
  console.log(`跳过：${result.skipped.length}`)
  console.log(`失败：${result.failed.length}`)

  for (const item of result.skipped) {
    console.log(`- SKIP ${item.sample.id}: ${item.reason}`)
  }

  for (const item of result.passed) {
    if (result.mode === 'handler') {
      const contains = item.data?.simulation?.contains ?? {}
      const summary = ['image', 'record', 'video']
        .filter(key => contains[key])
        .join('+') || 'unknown'
      console.log(`- PASS ${item.sample.id}: ${summary}`)
    } else {
      const title = item.data?.contentSummary?.title ?? '(无标题)'
      const subtype = item.data?.contentSummary?.subtype ?? 'unknown'
      console.log(`- PASS ${item.sample.id}: ${subtype} ${title}`)
    }
  }

  if (result.failed.length > 0) {
    for (const item of result.failed) {
      console.error(`- FAIL ${item.sample.id}: ${item.error}`)
    }
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(`[pack-smoke] 运行失败：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
