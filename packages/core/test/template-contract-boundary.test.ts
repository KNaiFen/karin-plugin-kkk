import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const componentsDir = path.resolve(testDir, '../../template/src/components')
const localTypesDir = path.resolve(testDir, '../../template/src/types')

const collectFiles = (directory: string, extension: string): string[] => {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectFiles(entryPath, extension)
    return entry.name.endsWith(extension) ? [entryPath] : []
  })
}

describe('template contracts boundary', () => {
  it('imports component contracts only from @kkk/template-contracts', () => {
    for (const componentFile of collectFiles(componentsDir, '.tsx')) {
      const source = readFileSync(componentFile, 'utf-8')
      expect(source, componentFile).not.toMatch(/from ['"][^'"]*\/types(?:\/[^'"]*)?['"]/)
    }
  })

  it('keeps component contracts in the dedicated contracts package only', () => {
    const localContractFiles = existsSync(localTypesDir)
      ? collectFiles(localTypesDir, '.ts')
      : []

    expect(localContractFiles).toEqual([])
  })
})
