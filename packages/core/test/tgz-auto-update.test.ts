import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  findLatestRelease,
  parseReleaseFilename,
  runReleaseCheck
} from '../scripts/auto-update-from-tgz.mjs'

const tempDirs: string[] = []

const createTempDir = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kkk-auto-update-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })))
})

describe('auto-update tgz watcher', () => {
  it('parses release filenames and ignores other packages', () => {
    expect(parseReleaseFilename('karin-plugin-kkk-4.0.23.tgz', 'karin-plugin-kkk')).toMatchObject({
      fileName: 'karin-plugin-kkk-4.0.23.tgz',
      version: '4.0.23'
    })
    expect(parseReleaseFilename('other-plugin-1.0.0.tgz', 'karin-plugin-kkk')).toBeNull()
    expect(parseReleaseFilename('karin-plugin-kkk-latest.zip', 'karin-plugin-kkk')).toBeNull()
  })

  it('finds the latest tgz release by semver', () => {
    const release = findLatestRelease([
      'karin-plugin-kkk-4.0.22.tgz',
      'karin-plugin-kkk-4.0.24-beta.1.tgz',
      'karin-plugin-kkk-4.0.24.tgz',
      'other-plugin-9.9.9.tgz'
    ], 'karin-plugin-kkk')

    expect(release).toMatchObject({
      fileName: 'karin-plugin-kkk-4.0.24.tgz',
      version: '4.0.24'
    })
  })

  it('installs the newest release, then restarts, then writes state', async () => {
    const watchDir = await createTempDir()
    const runtimeDir = await createTempDir()
    const stateFile = path.join(runtimeDir, '.kkk-auto-update-state.json')

    await fs.mkdir(path.join(runtimeDir, 'node_modules', 'karin-plugin-kkk'), { recursive: true })
    await fs.writeFile(
      path.join(runtimeDir, 'node_modules', 'karin-plugin-kkk', 'package.json'),
      JSON.stringify({ version: '4.0.22' }, null, 2)
    )
    await fs.writeFile(path.join(watchDir, 'karin-plugin-kkk-4.0.23.tgz'), 'pkg')

    const execCommands: string[] = []
    const execCommand = vi.fn(async (command: string, args: string[], options: { cwd: string }) => {
      execCommands.push([command, ...args, `cwd=${options.cwd}`].join(' '))
      return { code: 0, stdout: '', stderr: '' }
    })

    const result = await runReleaseCheck({
      watchDir,
      runtimeDir,
      packageName: 'karin-plugin-kkk',
      stateFile,
      execCommand
    })

    expect(result).toMatchObject({
      status: 'updated',
      release: {
        version: '4.0.23'
      }
    })
    expect(execCommands).toEqual([
      `${process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'} add ${path.join(watchDir, 'karin-plugin-kkk-4.0.23.tgz')} cwd=${runtimeDir}`,
      `${process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'} exec karin rs cwd=${runtimeDir}`
    ])

    const state = JSON.parse(await fs.readFile(stateFile, 'utf8')) as Record<string, unknown>
    expect(state.installedVersion).toBe('4.0.23')
    expect(state.installedFile).toBe('karin-plugin-kkk-4.0.23.tgz')
    expect(state.installedFrom).toBe(path.join(watchDir, 'karin-plugin-kkk-4.0.23.tgz'))
  })

  it('does not write state or restart when install fails', async () => {
    const watchDir = await createTempDir()
    const runtimeDir = await createTempDir()
    const stateFile = path.join(runtimeDir, '.kkk-auto-update-state.json')

    await fs.mkdir(path.join(runtimeDir, 'node_modules', 'karin-plugin-kkk'), { recursive: true })
    await fs.writeFile(
      path.join(runtimeDir, 'node_modules', 'karin-plugin-kkk', 'package.json'),
      JSON.stringify({ version: '4.0.22' }, null, 2)
    )
    await fs.writeFile(path.join(watchDir, 'karin-plugin-kkk-4.0.23.tgz'), 'pkg')

    const execCommand = vi.fn(async (command: string) => {
      if (command === (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')) {
        return { code: 1, stdout: '', stderr: 'install failed' }
      }

      return { code: 0, stdout: '', stderr: '' }
    })

    const result = await runReleaseCheck({
      watchDir,
      runtimeDir,
      packageName: 'karin-plugin-kkk',
      stateFile,
      execCommand
    })

    expect(result).toMatchObject({
      status: 'install_failed',
      release: {
        version: '4.0.23'
      }
    })
    expect(execCommand).toHaveBeenCalledTimes(1)
    await expect(fs.readFile(stateFile, 'utf8')).rejects.toThrow()
  })

  it('skips when the newest release is already installed according to state or node_modules', async () => {
    const watchDir = await createTempDir()
    const runtimeDir = await createTempDir()
    const stateFile = path.join(runtimeDir, '.kkk-auto-update-state.json')

    await fs.mkdir(path.join(runtimeDir, 'node_modules', 'karin-plugin-kkk'), { recursive: true })
    await fs.writeFile(
      path.join(runtimeDir, 'node_modules', 'karin-plugin-kkk', 'package.json'),
      JSON.stringify({ version: '4.0.23' }, null, 2)
    )
    await fs.writeFile(
      stateFile,
      JSON.stringify({ installedVersion: '4.0.23' }, null, 2)
    )
    await fs.writeFile(path.join(watchDir, 'karin-plugin-kkk-4.0.23.tgz'), 'pkg')

    const execCommand = vi.fn(async () => ({ code: 0, stdout: '', stderr: '' }))

    const result = await runReleaseCheck({
      watchDir,
      runtimeDir,
      packageName: 'karin-plugin-kkk',
      stateFile,
      execCommand
    })

    expect(result).toMatchObject({
      status: 'up_to_date',
      currentVersion: '4.0.23'
    })
    expect(execCommand).not.toHaveBeenCalled()
  })
})
