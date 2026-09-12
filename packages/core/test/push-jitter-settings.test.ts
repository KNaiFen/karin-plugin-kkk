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

const { bilibiliConfigSchema } = await import('../src/module/config/bilibili.schema')
const { douyinConfigSchema } = await import('../src/module/config/douyin.schema')
const { BilibiliWeb } = await import('../src/platform/bilibili/web.config')
const { DouyinWeb } = await import('../src/platform/douyin/web.config')

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
  app: {
    livePhotoMode: 'video_and_livephoto'
  },
  bilibili: {
    switch: true,
    sendContent: ['video'],
    plainTitleReply: {
      switch: true,
      types: ['video', 'image', 'article', 'live', 'text']
    },
    numcomment: 5,
    commentImageCollection: true,
    realCommentCount: false,
    imageLayout: 'auto',
    videoQuality: 127,
    maxAutoVideoSize: 50,
    liveRecordSeconds: 10,
    liveQuality: 10000,
    videoInfoMode: 'image',
    displayContent: ['cover', 'title', 'author', 'stats', 'desc'],
    burnDanmaku: false,
    danmakuArea: 0.5,
    danmakuFontSize: 'medium',
    danmakuOpacity: 0.8,
    verticalMode: 'off',
    videoCodec: 'h265',
    loginPerm: 'master',
    push: {
      switch: true,
      permission: 'master',
      cron: '*/10 * * * *',
      jitterSeconds: 120,
      riskCooldownEnabled: true,
      riskCooldownMs: 3600000,
      parsedynamic: false,
      pushVideoQuality: 0,
      pushMaxAutoVideoSize: 50
    }
  },
  douyin: {
    switch: true,
    sendContent: ['video'],
    plainTitleReply: {
      switch: true,
      types: ['video', 'image', 'article', 'live']
    },
    numcomment: 5,
    subCommentLimit: 5,
    commentImageCollection: true,
    liveImageMergeMode: 'continuous',
    liveRecordSeconds: 10,
    liveQuality: 'auto',
    videoQuality: '4k',
    maxAutoVideoSize: 50,
    videoInfoMode: 'image',
    displayContent: ['cover', 'title', 'author', 'stats'],
    burnDanmaku: false,
    danmakuArea: 0.5,
    danmakuFontSize: 'medium',
    danmakuOpacity: 0.8,
    verticalMode: 'off',
    videoCodec: 'h265',
    loginPerm: 'master',
    push: {
      switch: true,
      permission: 'master',
      cron: '*/10 * * * *',
      jitterSeconds: 120,
      parsedynamic: false,
      shareType: 'web',
      pushVideoQuality: 'adapt',
      pushMaxAutoVideoSize: 50
    }
  }
}

describe('push jitter settings', () => {
  it('exposes jitterSeconds in Bilibili and Douyin config schemas', () => {
    expect(bilibiliConfigSchema.fields.map(field => 'key' in field ? field.key : '')).toContain('push.jitterSeconds')
    expect(douyinConfigSchema.fields.map(field => 'key' in field ? field.key : '')).toContain('push.jitterSeconds')
  })

  it('renders jitterSeconds in Bilibili and Douyin web config pages', () => {
    expect(collectComponentKeys(BilibiliWeb(baseConfig as any))).toContain('push:jitterSeconds')
    expect(collectComponentKeys(BilibiliWeb(baseConfig as any))).toContain('push:riskCooldownEnabled')
    expect(collectComponentKeys(BilibiliWeb(baseConfig as any))).toContain('push:riskCooldownMs')
    expect(collectComponentKeys(DouyinWeb(baseConfig as any))).toContain('push:jitterSeconds')
  })

  it('disables jitterSeconds input when push is disabled', () => {
    const config = structuredClone(baseConfig)
    config.bilibili.push.switch = false
    config.douyin.push.switch = false

    expect(findComponentByKey(BilibiliWeb(config as any), 'push:jitterSeconds')?.isDisabled).toBe(true)
    expect(findComponentByKey(BilibiliWeb(config as any), 'push:riskCooldownEnabled')?.isDisabled).toBe(true)
    expect(findComponentByKey(BilibiliWeb(config as any), 'push:riskCooldownMs')?.isDisabled).toBe(true)
    expect(findComponentByKey(DouyinWeb(config as any), 'push:jitterSeconds')?.isDisabled).toBe(true)
  })
})
