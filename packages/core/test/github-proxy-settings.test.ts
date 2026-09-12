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

const { githubConfigSchema } = await import('../src/module/config/github.schema')
const { GithubWeb } = await import('../src/platform/github/web.config')

const collectComponentKeys = (value: unknown, result: string[] = []): string[] => {
  if (!value || typeof value !== 'object') return result
  if ('key' in value && typeof value.key === 'string') {
    result.push(value.key)
  }

  for (const child of Object.values(value as Record<string, unknown>)) {
    if (Array.isArray(child)) {
      for (const item of child) collectComponentKeys(item, result)
    } else if (child && typeof child === 'object') {
      collectComponentKeys(child, result)
    }
  }

  return result
}

const findComponentByKey = (value: unknown, targetKey: string): Record<string, any> | undefined => {
  if (!value || typeof value !== 'object') return undefined
  if ('key' in value && (value as Record<string, any>).key === targetKey) {
    return value as Record<string, any>
  }

  for (const child of Object.values(value as Record<string, unknown>)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findComponentByKey(item, targetKey)
        if (found) return found
      }
    } else if (child && typeof child === 'object') {
      const found = findComponentByKey(child, targetKey)
      if (found) return found
    }
  }

  return undefined
}

describe('GitHub proxy settings', () => {
  it('exposes dedicated proxy fields in the config schema', () => {
    expect(githubConfigSchema.fields.map(field => 'key' in field ? field.key : '')).toEqual(expect.arrayContaining([
      'proxy.switch',
      'proxy.host',
      'proxy.port',
      'proxy.protocol',
      'proxy.auth.username',
      'proxy.auth.password'
    ]))
  })

  it('renders dedicated proxy controls on the GitHub web config page', () => {
    const controls = GithubWeb({
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
        token: '',
        proxy: {
          switch: true,
          host: '127.0.0.1',
          port: 7890,
          protocol: 'http',
          auth: {
            username: 'proxy-user',
            password: 'proxy-pass'
          }
        }
      }
    } as any)

    expect(collectComponentKeys(controls)).toEqual(expect.arrayContaining([
      'proxy:switch',
      'proxy:host',
      'proxy:port',
      'proxy:protocol',
      'proxy:auth:username',
      'proxy:auth:password'
    ]))

    expect(findComponentByKey(controls, 'proxy:auth:username')).toMatchObject({ isRequired: false })
    expect(findComponentByKey(controls, 'proxy:auth:password')).toMatchObject({ isRequired: false })
  })
})
