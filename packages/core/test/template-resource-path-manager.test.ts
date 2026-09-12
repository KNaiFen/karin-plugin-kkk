import { describe, expect, it, vi } from 'vitest'

const fileSystem = vi.hoisted(() => ({
  existsSync: vi.fn(() => {
    throw new Error('explicit resource paths must not probe the file system')
  }),
  readFileSync: vi.fn(() => {
    throw new Error('explicit resource paths must not read package metadata')
  })
}))

vi.mock('node:fs', () => ({
  default: fileSystem
}))

vi.mock('node-karin', () => ({
  logger: {
    debug: vi.fn()
  }
}))

const { ResourcePathManager } = await import('../../template/src/render/ResourcePathManager')

describe('template resource path manager', () => {
  it('uses injected paths without probing the package layout', () => {
    const resourcePaths = {
      cssDir: '/plugin/lib',
      imageDir: '/plugin/resources/image'
    }

    expect(new ResourcePathManager(resourcePaths).getResourcePaths()).toBe(resourcePaths)
    expect(fileSystem.existsSync).not.toHaveBeenCalled()
    expect(fileSystem.readFileSync).not.toHaveBeenCalled()
  })
})
