import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const corePackageJsonPath = path.resolve(testDir, '../package.json')
const copyAssetsPluginPath = path.resolve(testDir, '../vite.plugin/copy-assets.ts')
const viteConfigPath = path.resolve(testDir, '../vite.config.ts')

describe('external post render build pipeline', () => {
  it('builds template assets before core so external-post css exists for packaging', () => {
    const packageJson = JSON.parse(readFileSync(corePackageJsonPath, 'utf-8'))

    expect(packageJson.scripts.build).toContain('--filter template run build')
  })

  it('does not keep the local amagi workspace package as a production dependency', () => {
    const packageJson = JSON.parse(readFileSync(corePackageJsonPath, 'utf-8'))

    expect(packageJson.dependencies['@ikenxuan/amagi']).toBeUndefined()
    expect(packageJson.devDependencies['@ikenxuan/amagi']).toBe('workspace:*')
  })

  it('copies the built template css into core lib output', () => {
    const source = readFileSync(copyAssetsPluginPath, 'utf-8')

    expect(source).toContain('const cssSourceFile = resolve(rootDir, \'../template/dist/main.css\')')
    expect(source).toContain('const cssTargetFile = resolve(rootDir, \'lib/karin-plugin-kkk.css\')')
    expect(source).toContain('CSS文件已复制到:')
  })

  it('bundles the local amagi runtime instead of leaving it as a production external', () => {
    const source = readFileSync(viteConfigPath, 'utf-8')

    expect(source).not.toContain('\'@ikenxuan/amagi\'')
  })
})
