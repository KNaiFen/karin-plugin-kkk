import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const parsePackResult = (json) => {
  const result = JSON.parse(json)
  const packs = Array.isArray(result) ? result : Object.values(result)
  assert.equal(packs.length, 1, 'Expected exactly one npm pack result')
  return packs[0]
}

export const verifyTarball = (pack, directory) => {
  assert.equal(path.basename(pack.filename), pack.filename, 'Expected an npm pack filename')
  assert.ok(pack.filename.endsWith('.tgz'), 'Expected a tgz archive')
  const archive = path.join(directory, pack.filename)
  assert.ok(statSync(archive).size > 0, 'Archive must not be empty')
  const unpacked = mkdtempSync(path.join(tmpdir(), 'kkk-ci-unpack-'))
  try {
    execFileSync('tar', ['-xzf', archive, '-C', unpacked])
    const packageDir = path.join(unpacked, 'package')
    const actual = readdirSync(packageDir, { recursive: true })
      .filter(file => statSync(path.join(packageDir, file)).isFile())
      .map(file => file.split(path.sep).join('/')).sort()
    const reported = pack.files.map(file => file.path).sort()
    assert.deepEqual(actual, reported, 'Archive contents differ from npm pack JSON')

    for (const file of actual) {
      assert.ok(!file.split('/').some(part => /^(?:\.env(?:\..*)?|\.agents|\.gkd|\.git|node_modules|data|logs?|runtime|temp|tmp|cache)$/.test(part)), `Unexpected private/runtime path: ${file}`)
      assert.ok(!/\.(?:env|log)$/.test(file), `Unexpected environment/log file: ${file}`)
    }
    const manifest = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8'))
    assert.equal(manifest.name, pack.name, 'Packed package name differs')
    assert.equal(manifest.version, pack.version, 'Packed package version differs')
    const requireFile = (file) => {
      assert.ok(actual.includes(file), `Missing packed file: ${file}`)
      assert.ok(statSync(path.join(packageDir, file)).size > 0, `Empty packed file: ${file}`)
    }
    const checkTargets = (value) => {
      if (typeof value === 'string') {
        assert.ok(value.startsWith('./'), `Expected a relative package target: ${value}`)
        requireFile(value.slice(2))
      } else if (value !== null) {
        for (const target of Object.values(value)) checkTargets(target)
      }
    }
    assert.ok(manifest.bin, 'Missing bin map')
    assert.ok(manifest.exports, 'Missing exports map')
    checkTargets(manifest.bin)
    checkTargets(manifest.exports)
    for (const file of [
      'scripts/auto-update-from-tgz.mjs',
      'lib/karin-plugin-kkk.css',
      'resources/font/mono/font.css',
      'resources/font/mono/JetBrainsMono-Regular.woff2',
      'resources/image/frame-logo.png'
    ]) requireFile(file)
    return { filename: pack.filename, name: manifest.name, version: manifest.version, files: actual.length }
  } finally {
    rmSync(unpacked, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const core = fileURLToPath(new URL('../packages/core/', import.meta.url))
  const directory = mkdtempSync(path.join(tmpdir(), 'kkk-ci-pack-'))
  try {
    const pack = parsePackResult(execFileSync('npm', ['pack', '--json', '--pack-destination', directory], {
      cwd: core, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024
    }))
    console.log(JSON.stringify(verifyTarball(pack, directory), null, 2))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
