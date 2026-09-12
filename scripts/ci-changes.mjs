import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const requiresSourceValidation = (paths) => paths.length === 0 || paths.some(path => /(^|\/)package\.json$/.test(path) || !(
  path === 'README.md' || path === 'AGENTS.md' ||
  path.startsWith('packages/docs/') || path.startsWith('.agents/') || path.startsWith('.gkd/')
))

export const parseGitPaths = (buffer) => {
  const output = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer)
  if (output === '') return []
  assert.ok(output.endsWith('\0'), 'Git paths must be NUL terminated')
  const paths = output.slice(0, -1).split('\0')
  assert.ok(paths.every(path => path.length > 0), 'Git returned an empty path')
  return paths
}

export const detectChanges = ({ eventName, event, cwd }) => {
  const git = (...args) => execFileSync('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 })
  const commit = (sha) => {
    assert.match(sha, /^[0-9a-f]{40}$/, 'Expected an event commit SHA')
    return git('rev-parse', '--verify', `${sha}^{commit}`).toString().trim()
  }
  const checkout = git('rev-parse', '--verify', 'HEAD').toString().trim()
  let base = null
  let head = checkout
  let mergeBase = null
  let paths = []

  if (eventName === 'pull_request') {
    base = commit(event.pull_request.base.sha)
    head = commit(event.pull_request.head.sha)
    mergeBase = git('merge-base', base, head).toString().trim()
    paths = parseGitPaths(git('diff', '--name-only', '-z', '--no-renames', mergeBase, head, '--'))
  } else if (eventName === 'push') {
    head = commit(event.after)
    if (event.before !== '0'.repeat(40)) {
      base = commit(event.before)
      paths = parseGitPaths(git('diff', '--name-only', '-z', '--no-renames', base, head, '--'))
    }
  } else {
    assert.equal(eventName, 'workflow_dispatch', 'Unsupported CI event')
  }

  return { source: requiresSourceValidation(paths), base, head, checkout, mergeBase, paths }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = detectChanges({
    eventName: process.env.GITHUB_EVENT_NAME,
    event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')),
    cwd: process.cwd()
  })
  console.log(JSON.stringify(result, null, 2))
  appendFileSync(process.env.GITHUB_OUTPUT, `source=${result.source}\n`)
}
