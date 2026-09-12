import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const corePackageJsonPath = path.resolve(testDir, '../package.json')
const templatePackageJsonPath = path.resolve(testDir, '../../template/package.json')
const templateIndexPath = path.resolve(testDir, '../../template/src/index.ts')
const templateServerSourcePath = path.resolve(testDir, '../../template/src/server.ts')
const templateResourceManagerPath = path.resolve(testDir, '../../template/src/render/ResourcePathManager.ts')
const templateViteConfigPath = path.resolve(testDir, '../../template/vite.config.ts')

describe('package boundaries', () => {
  it('does not expose server-only APIs from template root', () => {
    const templatePackageJson = JSON.parse(readFileSync(templatePackageJsonPath, 'utf-8'))
    const templateRootSource = readFileSync(templateIndexPath, 'utf-8')

    expect(templatePackageJson.exports['.'].import).toBe('./dist/index.js')
    expect(templateRootSource).not.toContain('reactServerRender')
    expect(templateRootSource).not.toContain('renderVideoPreviewPage')
  })

  it('provides server-only APIs from template/server', () => {
    const templatePackageJson = JSON.parse(readFileSync(templatePackageJsonPath, 'utf-8'))
    const templateServerSource = readFileSync(templateServerSourcePath, 'utf-8')

    expect(templatePackageJson.exports['./server'].import).toBe('./dist/server.js')
    expect(templateServerSource).toContain('reactServerRender')
    expect(templateServerSource).toContain('renderVideoPreviewPage')
    expect(templateServerSource).toContain('Plugin')
    expect(templateServerSource).toContain('PluginContext')
    expect(templateServerSource).toContain('ReactServerRenderOptions')
  })

  it('does not re-export template or amagi from core package exports', () => {
    const packageJson = JSON.parse(readFileSync(corePackageJsonPath, 'utf-8'))

    expect(packageJson.exports).not.toHaveProperty('./template')
    expect(packageJson.exports).not.toHaveProperty('./amagi')
  })

  it('bundles template server without leaking a workspace production dependency', () => {
    const packageJson = JSON.parse(readFileSync(corePackageJsonPath, 'utf-8'))

    expect(packageJson.dependencies.template).toBeUndefined()
  })

  it('keeps template resource discovery independent from the core source layout', () => {
    const resourceManagerSource = readFileSync(templateResourceManagerPath, 'utf-8')
    const viteConfigSource = readFileSync(templateViteConfigPath, 'utf-8')

    expect(resourceManagerSource).not.toContain('\'../core')
    expect(resourceManagerSource).not.toContain('\'karin-plugin-kkk\'')
    expect(viteConfigSource).not.toContain('\'../core/lib\'')
    expect(viteConfigSource).not.toContain('\'../core/resources\'')
  })
})
