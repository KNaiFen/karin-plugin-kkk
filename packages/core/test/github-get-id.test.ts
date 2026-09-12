import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  getLongLink: vi.fn(),
  networkCalls: [] as Array<Record<string, any>>
}))

vi.mock('node-karin', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  }
}))

vi.mock('@/module/utils/Networks', () => ({
  Networks: class {
    constructor (data: Record<string, any>) {
      state.networkCalls.push(data)
    }

    async getLongLink () {
      return await state.getLongLink()
    }
  }
}))

const { getGithubID, parseGithubLongLink } = await import('../src/platform/github/getID')

describe('GitHub link id helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.networkCalls = []
  })

  it('parses repository and tree links into repository identity', () => {
    expect(parseGithubLongLink('https://github.com/openai/openai-node')).toEqual({
      type: 'repository',
      owner: 'openai',
      repo: 'openai-node',
      url: 'https://github.com/openai/openai-node'
    })

    expect(parseGithubLongLink('https://github.com/vercel/next.js/tree/canary')).toEqual({
      type: 'repository',
      owner: 'vercel',
      repo: 'next.js',
      branch: 'canary',
      url: 'https://github.com/vercel/next.js'
    })
  })

  it('rejects non-repository github resources', () => {
    expect(parseGithubLongLink('https://github.com/openai/openai-node/issues/1').type).toBe('unknown')
    expect(parseGithubLongLink('https://github.com/openai/openai-node/blob/main/README.md').type).toBe('unknown')
  })

  it('uses redirect expansion for short github links', async () => {
    state.getLongLink.mockResolvedValue('https://github.com/openai/openai-node')

    await expect(getGithubID('https://github.com/openai/openai-node/')).resolves.toEqual({
      type: 'repository',
      owner: 'openai',
      repo: 'openai-node',
      url: 'https://github.com/openai/openai-node'
    })
  })
})
