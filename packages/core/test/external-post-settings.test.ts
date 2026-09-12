import { describe, expect, it, vi } from 'vitest'

const component = (kind: string) => (key: string, props: Record<string, any> = {}) => ({
  kind,
  key,
  ...props
})

vi.mock('node-karin', () => ({
  components: {
    accordion: {
      create: component('accordion'),
      createItem: component('accordionItem')
    },
    checkbox: {
      create: component('checkbox'),
      group: component('checkboxGroup')
    },
    divider: {
      create: component('divider')
    },
    input: {
      number: component('numberInput'),
      string: component('stringInput')
    },
    radio: {
      create: component('radio'),
      group: component('radioGroup')
    },
    switch: {
      create: component('switch')
    }
  }
}))

const { heyboxConfigSchema } = await import('../src/module/config/heybox.schema')
const { githubConfigSchema } = await import('../src/module/config/github.schema')
const { tiebaConfigSchema } = await import('../src/module/config/tieba.schema')
const { weiboConfigSchema } = await import('../src/module/config/weibo.schema')
const { xConfigSchema } = await import('../src/module/config/x.schema')
const { zhihuConfigSchema } = await import('../src/module/config/zhihu.schema')
const { HeyboxWeb } = await import('../src/platform/heybox/web.config')
const { GithubWeb } = await import('../src/platform/github/web.config')
const { TiebaWeb } = await import('../src/platform/tieba/web.config')
const { WeiboWeb } = await import('../src/platform/weibo/web.config')
const { XWeb } = await import('../src/platform/x/web.config')
const { ZhihuWeb } = await import('../src/platform/zhihu/web.config')

const collectComponentKeys = (value: unknown, result: string[] = []): string[] => {
  if (!value || typeof value !== 'object') return result
  if ('key' in value && typeof value.key === 'string') result.push(value.key)

  for (const child of Object.values(value as Record<string, unknown>)) {
    if (Array.isArray(child)) {
      for (const item of child) collectComponentKeys(item, result)
    } else if (child && typeof child === 'object') {
      collectComponentKeys(child, result)
    }
  }

  return result
}

const findComponentByKey = (value: unknown, key: string): Record<string, any> | null => {
  if (!value || typeof value !== 'object') return null
  if ('key' in value && (value as Record<string, unknown>).key === key) return value as Record<string, any>

  for (const child of Object.values(value as Record<string, unknown>)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findComponentByKey(item, key)
        if (found) return found
      }
    } else if (child && typeof child === 'object') {
      const found = findComponentByKey(child, key)
      if (found) return found
    }
  }

  return null
}

const baseConfig = {
  heybox: {
    switch: true,
    sendContent: ['info', 'image', 'video'],
    renderCard: {
      enable: true,
      includeImages: false
    },
    plainTitleReply: {
      switch: true,
      types: ['video', 'image', 'text']
    },
    numcomment: 5
  },
  zhihu: {
    switch: true,
    sendContent: ['info', 'image', 'video'],
    renderCard: {
      enable: true,
      includeImages: false
    },
    plainTitleReply: {
      switch: true,
      types: ['video', 'image', 'text']
    }
  },
  x: {
    switch: true,
    sendContent: ['info', 'image', 'video'],
    renderCard: {
      enable: true,
      includeImages: false
    },
    plainTitleReply: {
      switch: true,
      types: ['video', 'image', 'text']
    }
  },
  github: {
    switch: true,
    sendContent: ['info', 'image'],
    renderCard: {
      enable: true,
      includeImages: false
    },
    plainTitleReply: {
      switch: true,
      types: ['text', 'image']
    },
    token: ''
  },
  tieba: {
    switch: true,
    sendContent: ['info', 'image', 'video'],
    renderCard: {
      enable: true,
      includeImages: false
    },
    plainTitleReply: {
      switch: true,
      types: ['video', 'image', 'text']
    },
    numcomment: 5
  },
  weibo: {
    switch: true,
    sendContent: ['info', 'image', 'video'],
    renderCard: {
      enable: true,
      includeImages: false
    },
    plainTitleReply: {
      switch: true,
      types: ['video', 'image', 'text']
    }
  }
}

describe('external post settings exposure', () => {
  it('exposes render card fields in dynamic config schemas', () => {
    for (const schema of [heyboxConfigSchema, githubConfigSchema, zhihuConfigSchema, xConfigSchema, tiebaConfigSchema, weiboConfigSchema]) {
      const keys = schema.fields.map(field => 'key' in field ? field.key : '')
      expect(keys).toContain('renderCard.enable')
      expect(keys).toContain('renderCard.includeImages')
    }
  })

  it('renders render card switches in Karin Web config pages', () => {
    const pages = [
      HeyboxWeb(baseConfig as any),
      GithubWeb(baseConfig as any),
      ZhihuWeb(baseConfig as any),
      XWeb(baseConfig as any),
      TiebaWeb(baseConfig as any),
      WeiboWeb(baseConfig as any)
    ]

    for (const page of pages) {
      expect(collectComponentKeys(page)).toContain('renderCard:enable')
      expect(collectComponentKeys(page)).toContain('renderCard:includeImages')
    }
  })

  it('disables includeImages when info rendering or render card is unavailable', () => {
    const config = structuredClone(baseConfig)
    config.heybox.sendContent = ['image']
    config.github.sendContent = ['image']
    config.zhihu.renderCard.enable = false
    config.x.renderCard.enable = false
    config.tieba.switch = false

    expect(findComponentByKey(HeyboxWeb(config as any), 'renderCard:includeImages')?.isDisabled).toBe(true)
    expect(findComponentByKey(GithubWeb(config as any), 'renderCard:includeImages')?.isDisabled).toBe(true)
    expect(findComponentByKey(ZhihuWeb(config as any), 'renderCard:includeImages')?.isDisabled).toBe(true)
    expect(findComponentByKey(XWeb(config as any), 'renderCard:includeImages')?.isDisabled).toBe(true)
    expect(findComponentByKey(TiebaWeb(config as any), 'renderCard:includeImages')?.isDisabled).toBe(true)
    expect(findComponentByKey(WeiboWeb(config as any), 'renderCard:includeImages')?.isDisabled).toBe(false)
  })
})
