import { describe, expect, it } from 'vitest'

import { mergeConfigObjects, normalizeDottedConfigObject } from '../src/module/utils/configPath'

describe('dotted config normalization', () => {
  it('expands dotted keys into nested objects', () => {
    expect(normalizeDottedConfigObject({
      'renderCard.enable': false,
      'renderCard.includeImages': true,
      'plainTitleReply.switch': false,
      'plainTitleReply.types': ['image']
    })).toEqual({
      renderCard: {
        enable: false,
        includeImages: true
      },
      plainTitleReply: {
        switch: false,
        types: ['image']
      }
    })
  })

  it('prefers direct nested values over stale dotted keys while keeping unmatched dotted fields', () => {
    expect(normalizeDottedConfigObject({
      'renderCard.enable': false,
      'renderCard.includeImages': true,
      renderCard: {
        enable: true
      }
    })).toEqual({
      renderCard: {
        enable: true,
        includeImages: true
      }
    })
  })

  it('merges normalized user config over defaults', () => {
    const defaults = normalizeDottedConfigObject({
      renderCard: {
        enable: true,
        includeImages: false
      },
      plainTitleReply: {
        switch: true,
        types: ['video', 'image', 'text']
      }
    })

    const userConfig = normalizeDottedConfigObject({
      'renderCard.enable': false,
      plainTitleReply: {
        switch: false
      }
    })

    expect(mergeConfigObjects(defaults, userConfig)).toEqual({
      renderCard: {
        enable: false,
        includeImages: false
      },
      plainTitleReply: {
        switch: false,
        types: ['video', 'image', 'text']
      }
    })
  })

  it('rejects dangerous prototype pollution keys', () => {
    expect(() => normalizeDottedConfigObject({
      'renderCard.__proto__.polluted': true
    })).toThrow(/非法配置路径/)

    expect(() => normalizeDottedConfigObject(JSON.parse('{"renderCard":{"__proto__":{"polluted":true}}}'))).toThrow(/非法配置路径/)
  })

  it('rejects constructor and prototype segments in dotted paths', () => {
    expect(() => normalizeDottedConfigObject({
      'constructor.prototype.polluted': true
    })).toThrow(/非法配置路径/)

    expect(() => normalizeDottedConfigObject({
      'renderCard.constructor.prototype.polluted': true
    })).toThrow(/非法配置路径/)
  })

  it('rejects empty and array-index path segments', () => {
    expect(() => normalizeDottedConfigObject({
      'renderCard..enable': true
    })).toThrow(/非法配置路径/)

    expect(() => normalizeDottedConfigObject({
      'renderCard.0.enable': true
    })).toThrow(/非法配置路径/)
  })
})
