import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  applyBrowserProxyToLaunchOptions,
  getBrowserLaunchOptions,
  getBrowserProxyCredentials,
  resolveBrowserExecutablePath,
  resolveProjectBrowserDownloadDir
} from '../src/module/utils/BrowserRuntime'

describe('browser runtime', () => {
  it('uses an explicit browser executable path when it exists', () => {
    expect(resolveBrowserExecutablePath({ KKK_CHROME_EXECUTABLE_PATH: '/opt/chrome/chrome' }, filePath => filePath === '/opt/chrome/chrome'))
      .toBe('/opt/chrome/chrome')
  })

  it('uses a project headless browser config before system browser discovery', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kkk-browser-runtime-'))
    const nestedDir = path.join(rootDir, 'packages', 'core')
    const executablePath = path.join(rootDir, '.cache', 'kkk-browser', 'chrome-headless-shell')
    fs.mkdirSync(path.dirname(executablePath), { recursive: true })
    fs.mkdirSync(nestedDir, { recursive: true })
    fs.writeFileSync(executablePath, '')
    fs.writeFileSync(path.join(rootDir, '.kkk-browser.json'), JSON.stringify({
      executablePath: path.relative(rootDir, executablePath)
    }))

    try {
      expect(resolveBrowserExecutablePath({}, fs.existsSync, 'darwin', nestedDir)).toBe(executablePath)
    } finally {
      fs.rmSync(rootDir, { force: true, recursive: true })
    }
  })

  it('leaves browser discovery to puppeteer when no explicit executable path is configured on unsupported platforms', () => {
    expect(resolveBrowserExecutablePath({}, () => false, 'freebsd', '/tmp/kkk-no-browser-config')).toBeUndefined()
  })

  it('disables system browser discovery when requested', () => {
    const env = { KKK_BROWSER_DISABLE_SYSTEM_DISCOVERY: '1' }
    const existingPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

    expect(resolveBrowserExecutablePath(env, filePath => filePath === existingPath, 'darwin', '/tmp/kkk-no-browser-config'))
      .toBeUndefined()
  })

  it('auto-detects Chrome from common Windows install paths', () => {
    const env = {
      ProgramFiles: 'C:\\Program Files',
      'ProgramFiles(x86)': 'C:\\Program Files (x86)',
      LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local'
    }
    const existingPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

    expect(resolveBrowserExecutablePath(env, filePath => filePath === existingPath, 'win32', 'C:\\repo')).toBe(existingPath)
  })

  it('auto-detects Edge when Chrome is not installed on Windows', () => {
    const env = {
      ProgramFiles: 'C:\\Program Files',
      'ProgramFiles(x86)': 'C:\\Program Files (x86)',
      LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local'
    }
    const existingPath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

    expect(resolveBrowserExecutablePath(env, filePath => filePath === existingPath, 'win32', 'C:\\repo')).toBe(existingPath)
  })

  it('auto-detects Chrome from common macOS install paths', () => {
    const existingPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

    expect(resolveBrowserExecutablePath({}, filePath => filePath === existingPath, 'darwin', '/tmp/kkk-no-browser-config')).toBe(existingPath)
  })

  it('uses the project root as the default browser download directory', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kkk-browser-runtime-'))
    const nestedDir = path.join(rootDir, 'packages', 'core')
    fs.mkdirSync(nestedDir, { recursive: true })
    fs.writeFileSync(path.join(rootDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')

    try {
      expect(resolveProjectBrowserDownloadDir({}, fs.existsSync, nestedDir))
        .toBe(path.join(rootDir, '.cache', 'kkk-browser'))
    } finally {
      fs.rmSync(rootDir, { force: true, recursive: true })
    }
  })

  it('passes project-local download settings to snapka when system discovery is disabled', () => {
    const options = getBrowserLaunchOptions(
      30_000,
      {
        KKK_BROWSER_DISABLE_SYSTEM_DISCOVERY: '1',
        KKK_BROWSER_DOWNLOAD_DIR: '.cache/kkk-browser-test',
        KKK_BROWSER_DOWNLOAD_BROWSER: 'chrome-headless-shell'
      },
      () => false,
      'darwin',
      '/repo'
    )

    expect(options.executablePath).toBeUndefined()
    expect(options.findBrowser).toBe(false)
    expect(options.download).toMatchObject({
      enable: true,
      browser: 'chrome-headless-shell',
      dir: path.join('/repo', '.cache', 'kkk-browser-test')
    })
  })

  it('converts configured request proxy into Chromium launch options', () => {
    const options = getBrowserLaunchOptions(30_000, {}, () => false, 'darwin', '/repo')
    const proxied = applyBrowserProxyToLaunchOptions(options, {
      switch: true,
      protocol: 'http',
      host: '127.0.0.1',
      port: 7890,
      auth: {
        username: 'proxy-user',
        password: 'proxy-pass'
      }
    })

    expect(proxied.args).toContain('--proxy-server=http://127.0.0.1:7890')
    expect(getBrowserProxyCredentials({
      switch: true,
      protocol: 'http',
      host: '127.0.0.1',
      port: 7890,
      auth: {
        username: 'proxy-user',
        password: 'proxy-pass'
      }
    })).toEqual({
      username: 'proxy-user',
      password: 'proxy-pass'
    })
  })
})
