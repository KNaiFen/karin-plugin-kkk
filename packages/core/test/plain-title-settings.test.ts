import fs from 'node:fs'

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
const { heyboxConfigSchema } = await import('../src/module/config/heybox.schema')
const { githubConfigSchema } = await import('../src/module/config/github.schema')
const { tiebaConfigSchema } = await import('../src/module/config/tieba.schema')
const { tiktokConfigSchema } = await import('../src/module/config/tiktok.schema')
const { xConfigSchema } = await import('../src/module/config/x.schema')
const { xiaohongshuConfigSchema } = await import('../src/module/config/xiaohongshu.schema')
const { zhihuConfigSchema } = await import('../src/module/config/zhihu.schema')
const { BilibiliWeb } = await import('../src/platform/bilibili/web.config')
const { DouyinWeb } = await import('../src/platform/douyin/web.config')
const { HeyboxWeb } = await import('../src/platform/heybox/web.config')
const { GithubWeb } = await import('../src/platform/github/web.config')
const { TiebaWeb } = await import('../src/platform/tieba/web.config')
const { TikTokWeb } = await import('../src/platform/tiktok/web.config')
const { XWeb } = await import('../src/platform/x/web.config')
const { XiaohongshuWeb } = await import('../src/platform/xiaohongshu/web.config')
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
      switch: false,
      permission: 'master',
      cron: '*/10 * * * *',
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
    longTitleFullText: false,
    longTitleFullTextThreshold: 25,
    displayContent: ['cover', 'title', 'author', 'stats'],
    burnDanmaku: false,
    danmakuArea: 0.5,
    danmakuFontSize: 'medium',
    danmakuOpacity: 0.8,
    verticalMode: 'off',
    videoCodec: 'h265',
    loginPerm: 'master',
    push: {
      switch: false,
      permission: 'master',
      cron: '*/10 * * * *',
      parsedynamic: false,
      shareType: 'web',
      pushVideoQuality: 'adapt',
      pushMaxAutoVideoSize: 50
    }
  },
  xiaohongshu: {
    switch: true,
    sendContent: ['video'],
    plainTitleReply: {
      switch: true,
      types: ['video', 'image']
    },
    numcomment: 10,
    videoQuality: '4k',
    maxAutoVideoSize: 50
  },
  tiktok: {
    switch: true,
    videoTool: true,
    priority: 800,
    plainTitleReply: {
      switch: true,
      types: ['video']
    },
    proxy: {
      switch: false,
      host: '',
      port: '',
      protocol: 'http',
      auth: {
        username: '',
        password: ''
      }
    }
  },
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
  }
}

describe('plain title reply settings', () => {
  it('exposes the setting in all relevant config schemas', () => {
    for (const schema of [bilibiliConfigSchema, douyinConfigSchema, xiaohongshuConfigSchema, tiktokConfigSchema, heyboxConfigSchema, githubConfigSchema, xConfigSchema, zhihuConfigSchema, tiebaConfigSchema]) {
      const keys = schema.fields.map(field => 'key' in field ? field.key : '')
      expect(keys).toContain('plainTitleReply.switch')
      expect(keys).toContain('plainTitleReply.types')
    }
  })

  it('renders the setting in all relevant web config pages', () => {
    const pages = [
      BilibiliWeb(baseConfig as any),
      DouyinWeb(baseConfig as any),
      XiaohongshuWeb(baseConfig as any),
      TikTokWeb(baseConfig as any),
      HeyboxWeb(baseConfig as any),
      GithubWeb(baseConfig as any),
      XWeb(baseConfig as any),
      ZhihuWeb(baseConfig as any),
      TiebaWeb(baseConfig as any)
    ]

    for (const page of pages) {
      expect(collectComponentKeys(page)).toContain('plainTitleReply:switch')
      expect(collectComponentKeys(page)).toContain('plainTitleReply:types')
    }
  })

  it('exposes the independent Douyin long title full text switch', () => {
    const keys = douyinConfigSchema.fields.map(field => 'key' in field ? field.key : '')
    expect(keys).toContain('longTitleFullText')
    expect(keys).toContain('longTitleFullTextThreshold')

    const page = DouyinWeb(baseConfig as any)
    const switchComponent = findComponentByKey(page, 'longTitleFullText')
    const thresholdComponent = findComponentByKey(page, 'longTitleFullTextThreshold')
    expect(switchComponent?.defaultSelected).toBe(false)
    expect(thresholdComponent).toMatchObject({
      defaultValue: '25',
      isDisabled: true,
      rules: [{ min: 1, max: 10000 }]
    })

    const defaultConfig = fs.readFileSync(
      new URL('../config/default_config/douyin.yaml', import.meta.url),
      'utf8'
    )
    expect(defaultConfig).toMatch(/^longTitleFullText: false$/m)
    expect(defaultConfig).toMatch(/^longTitleFullTextThreshold: 25$/m)
  })

  it('keeps plain title reply switches enabled when video output is not selected', () => {
    const config = structuredClone(baseConfig)
    config.bilibili.sendContent = ['info']
    config.douyin.sendContent = ['info']
    config.xiaohongshu.sendContent = ['image']
    config.heybox.sendContent = ['info']
    config.x.sendContent = ['info']
    config.zhihu.sendContent = ['info']
    config.tieba.sendContent = ['info']

    expect(findComponentByKey(BilibiliWeb(config as any), 'plainTitleReply:switch')?.isDisabled).toBe(false)
    expect(findComponentByKey(DouyinWeb(config as any), 'plainTitleReply:switch')?.isDisabled).toBe(false)
    expect(findComponentByKey(XiaohongshuWeb(config as any), 'plainTitleReply:switch')?.isDisabled).toBe(false)
    expect(findComponentByKey(HeyboxWeb(config as any), 'plainTitleReply:switch')?.isDisabled).toBe(false)
    expect(findComponentByKey(XWeb(config as any), 'plainTitleReply:switch')?.isDisabled).toBe(false)
    expect(findComponentByKey(ZhihuWeb(config as any), 'plainTitleReply:switch')?.isDisabled).toBe(false)
    expect(findComponentByKey(TiebaWeb(config as any), 'plainTitleReply:switch')?.isDisabled).toBe(false)
    expect(findComponentByKey(BilibiliWeb(config as any), 'plainTitleReply:types')?.isDisabled).toBe(false)
    expect(findComponentByKey(DouyinWeb(config as any), 'plainTitleReply:types')?.isDisabled).toBe(false)
    expect(findComponentByKey(XiaohongshuWeb(config as any), 'plainTitleReply:types')?.isDisabled).toBe(false)
    expect(findComponentByKey(HeyboxWeb(config as any), 'plainTitleReply:types')?.isDisabled).toBe(false)
    expect(findComponentByKey(XWeb(config as any), 'plainTitleReply:types')?.isDisabled).toBe(false)
    expect(findComponentByKey(ZhihuWeb(config as any), 'plainTitleReply:types')?.isDisabled).toBe(false)
    expect(findComponentByKey(TiebaWeb(config as any), 'plainTitleReply:types')?.isDisabled).toBe(false)
  })
})
