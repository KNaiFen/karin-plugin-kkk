import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { detectChanges, parseGitPaths, requiresSourceValidation } from './ci-changes.mjs'
import { checkGate } from './ci-gate.mjs'
import { parsePackResult, verifyTarball } from './ci-pack.mjs'

for (const [label, paths, expected] of [
  ['docs', ['packages/docs/src/page.md'], false],
  ['records', ['.agents/context.md', '.gkd/progress.md', 'AGENTS.md', 'README.md'], false],
  ['core', ['packages/core/src/index.ts'], true],
  ['core package docs', ['packages/core/README.md', 'packages/core/CHANGELOG.md'], true],
  ['template', ['packages/template/src/index.ts'], true],
  ['richtext', ['packages/richtext/src/index.ts'], true],
  ['contracts', ['packages/template-contracts/src/index.ts'], true],
  ['lockfile', ['pnpm-lock.yaml'], true],
  ['workspace', ['pnpm-workspace.yaml'], true],
  ['manifest', ['package.json'], true],
  ['docs manifest', ['packages/docs/package.json'], true],
  ['release', ['.release-please-manifest.json'], true],
  ['workflow', ['.github/workflows/ci.yml'], true],
  ['submodules', ['packages/amagi', 'Karin', '.gitmodules'], true],
  ['unknown', ['README.en.md'], true],
  ['mixed', ['packages/docs/page.md', 'packages/core/src/index.ts'], true],
  ['no diff', [], true]
]) {
  test(`change classification: ${label}`, () => {
    assert.equal(requiresSourceValidation(paths), expected)
  })
}

test('NUL parsing preserves whitespace and rejects invalid output', () => {
  assert.deepEqual(parseGitPaths(Buffer.from('docs/a\nb\t c\0core/d\0')), ['docs/a\nb\t c', 'core/d'])
  assert.equal(requiresSourceValidation(parseGitPaths(Buffer.from('\uFEFFREADME.md\0'))), true)
  assert.throws(() => parseGitPaths(Buffer.from('README.md')), /NUL terminated/)
  assert.throws(() => parseGitPaths(Buffer.from('README.md\0\0')), /empty path/)
  assert.throws(() => parseGitPaths(Buffer.from([0xff, 0])), /encoded data/)
})

const gitFixture = (t) => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'kkk-ci-git-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-b', 'main')
  git('config', 'user.name', 'CI Fixture')
  git('config', 'user.email', 'ci@example.invalid')
  git('config', 'core.hooksPath', '/dev/null')
  git('config', 'commit.gpgsign', 'false')
  const write = (file, content = file) => {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true })
    writeFileSync(path.join(cwd, file), content)
  }
  const commit = (message) => {
    git('add', '.')
    git('commit', '-m', message)
    return git('rev-parse', 'HEAD')
  }
  write('README.md')
  write('packages/core/source.ts')
  write('packages/docs/page.md')
  const initial = commit('initial')
  return { cwd, git, write, commit, initial }
}

test('PR uses base/head merge-base while recording the checkout merge commit', (t) => {
  const { cwd, git, write, commit, initial } = gitFixture(t)
  write('packages/core/source.ts', 'main changed')
  const base = commit('main source change')
  git('checkout', '-b', 'pr', initial)
  write('packages/docs/page.md', 'PR docs change')
  const head = commit('PR docs')
  git('checkout', 'main')
  git('merge', '--no-ff', 'pr', '-m', 'platform merge')
  const checkout = git('rev-parse', 'HEAD')
  const event = { pull_request: { base: { sha: base }, head: { sha: head } } }
  const result = detectChanges({ cwd, eventName: 'pull_request', event })
  assert.deepEqual(result, { source: false, base, head, checkout, mergeBase: initial, paths: ['packages/docs/page.md'] })

  const eventFile = path.join(cwd, 'event.json')
  const outputFile = path.join(cwd, 'output')
  writeFileSync(eventFile, JSON.stringify(event))
  const output = execFileSync(process.execPath, [new URL('./ci-changes.mjs', import.meta.url).pathname], {
    cwd, encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: eventFile, GITHUB_OUTPUT: outputFile }
  })
  assert.deepEqual(JSON.parse(output), result)
  assert.equal(readFileSync(outputFile, 'utf8'), 'source=false\n')
})

test('push includes both rename ends and deleted source paths', (t) => {
  const { cwd, write, commit, initial } = gitFixture(t)
  renameSync(path.join(cwd, 'packages/core/source.ts'), path.join(cwd, 'packages/docs/moved.md'))
  const moved = commit('move source to docs')
  const rename = detectChanges({ cwd, eventName: 'push', event: { before: initial, after: moved } })
  assert.deepEqual(rename.paths, ['packages/core/source.ts', 'packages/docs/moved.md'])
  assert.equal(rename.source, true)
  write('packages/core/new.ts')
  const added = commit('add source')
  rmSync(path.join(cwd, 'packages/core/new.ts'))
  const removed = commit('delete source')
  const deletion = detectChanges({ cwd, eventName: 'push', event: { before: added, after: removed } })
  assert.deepEqual(deletion.paths, ['packages/core/new.ts'])
  assert.equal(deletion.source, true)
})

test('dispatch and initial push require full validation; missing or malformed baselines fail', (t) => {
  const { cwd, initial } = gitFixture(t)
  assert.equal(detectChanges({ cwd, eventName: 'workflow_dispatch', event: {} }).source, true)
  assert.equal(detectChanges({ cwd, eventName: 'push', event: { before: '0'.repeat(40), after: initial } }).source, true)
  assert.throws(() => detectChanges({ cwd, eventName: 'push', event: { before: 'f'.repeat(40), after: initial } }))
  assert.throws(() => detectChanges({ cwd, eventName: 'push', event: { before: 'main', after: initial } }), /commit SHA/)
  assert.throws(() => detectChanges({ cwd, eventName: 'pull_request', event: { pull_request: { base: { sha: 'f'.repeat(40) }, head: { sha: initial } } } }))
  assert.throws(() => detectChanges({ cwd, eventName: 'unknown', event: {} }), /Unsupported CI event/)
})

test('CI Gate accepts only the complete requested result set', () => {
  const results = ['success', 'failure', 'cancelled', 'skipped']
  for (const source of ['true', 'false', '', undefined]) {
    for (const changes of results) {
      for (const verify of results) {
        for (const compatibility of results) {
          const needs = { changes: { result: changes, outputs: { source } }, verify: { result: verify }, compatibility: { result: compatibility } }
          const pass = changes === 'success' && (
            (source === 'true' && verify === 'success' && compatibility === 'success') ||
            (source === 'false' && verify === 'skipped' && compatibility === 'skipped')
          )
          if (pass) assert.doesNotThrow(() => checkGate(needs))
          else assert.throws(() => checkGate(needs))
        }
      }
    }
  }
})

test('npm pack JSON accepts array and keyed results and rejects ambiguous output', () => {
  const pack = { filename: 'karin-plugin-kkk-1.0.0.tgz', files: [] }
  assert.deepEqual(parsePackResult(JSON.stringify([pack])), pack)
  assert.deepEqual(parsePackResult(JSON.stringify({ 'karin-plugin-kkk': pack })), pack)
  for (const result of [[], {}, [pack, pack], { one: pack, two: pack }]) {
    assert.throws(() => parsePackResult(JSON.stringify(result)), /exactly one/)
  }
  assert.throws(() => parsePackResult('broken JSON'))
})

test('archive verification checks the exact archive, manifest targets, assets and exclusions', async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'kkk-ci-pack-test-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const manifest = {
    name: 'karin-plugin-kkk', version: '1.0.0',
    bin: { 'kkk-auto-update': './scripts/auto-update-from-tgz.mjs' },
    exports: { '.': './lib/index.js', './richtext': { types: './lib/richtext.d.mts', import: './lib/richtext.js' } }
  }
  const files = {
    'package.json': JSON.stringify(manifest),
    'lib/index.js': 'export {}',
    'lib/richtext.js': 'export {}',
    'lib/richtext.d.mts': 'export {}',
    'scripts/auto-update-from-tgz.mjs': 'export {}',
    'lib/karin-plugin-kkk.css': 'body {}',
    'resources/font/mono/font.css': 'body {}',
    'resources/font/mono/JetBrainsMono-Regular.woff2': 'fixture',
    'resources/image/frame-logo.png': 'fixture'
  }
  const archive = (contents) => {
    const packageDir = path.join(directory, 'package')
    rmSync(packageDir, { recursive: true, force: true })
    for (const [file, content] of Object.entries(contents)) {
      mkdirSync(path.dirname(path.join(packageDir, file)), { recursive: true })
      writeFileSync(path.join(packageDir, file), content)
    }
    const filename = 'karin-plugin-kkk-1.0.0.tgz'
    execFileSync('tar', ['-czf', path.join(directory, filename), '-C', directory, 'package'], { env: { ...process.env, COPYFILE_DISABLE: '1' } })
    return { filename, name: manifest.name, version: manifest.version, files: Object.keys(contents).map(file => ({ path: file })) }
  }
  await t.test('ignores an unrelated higher-version archive', () => {
    writeFileSync(path.join(directory, 'karin-plugin-kkk-99.0.0.tgz'), 'unrelated')
    assert.equal(verifyTarball(archive(files), directory).files, Object.keys(files).length)
  })
  await t.test('accepts real npm pack JSON and its exact archive without installing dependencies', () => {
    const pack = parsePackResult(execFileSync('npm', ['pack', '--offline', '--ignore-scripts', '--json', '--pack-destination', directory], {
      cwd: path.join(directory, 'package'), encoding: 'utf8',
      env: { ...process.env, NPM_CONFIG_CACHE: path.join(directory, 'npm-cache'), NPM_CONFIG_UPDATE_NOTIFIER: 'false' }
    }))
    assert.equal(verifyTarball(pack, directory).files, Object.keys(files).length)
  })
  for (const missing of ['lib/index.js', 'lib/richtext.d.mts', 'scripts/auto-update-from-tgz.mjs', 'lib/karin-plugin-kkk.css', 'resources/image/frame-logo.png']) {
    await t.test(`rejects missing ${missing}`, () => {
      const contents = { ...files }
      delete contents[missing]
      assert.throws(() => verifyTarball(archive(contents), directory), /Missing packed file/)
    })
  }
  for (const extra of ['.env', '.env.production', 'development.env', '.agents/context.md', '.gkd/progress.md', 'data/state.json', 'logs/app.log', 'runtime/state.json']) {
    await t.test(`rejects ${extra}`, () => {
      assert.throws(() => verifyTarball(archive({ ...files, [extra]: 'private' }), directory), /Unexpected/)
    })
  }
  await t.test('rejects disagreement with npm pack metadata', () => {
    const pack = archive(files)
    pack.files.push({ path: 'missing' })
    assert.throws(() => verifyTarball(pack, directory), /Archive contents differ/)
  })
  await t.test('rejects mismatched package identity', () => {
    const pack = archive(files)
    pack.version = '2.0.0'
    assert.throws(() => verifyTarball(pack, directory), /package version differs/)
  })
})
