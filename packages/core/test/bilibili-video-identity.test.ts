import { describe, expect, it } from 'vitest'

import {
  resolveBilibiliVideoAid,
  resolveBilibiliVideoCid
} from '../src/module/summaryParse/bilibiliVideoIdentity'

describe('bilibili video identity helpers', () => {
  it('resolves aid from idData when available', () => {
    expect(resolveBilibiliVideoAid({
      idData: {
        aid: 123456
      }
    })).toBe(123456)
  })

  it('resolves aid from nested detail payloads', () => {
    expect(resolveBilibiliVideoAid({
      detail: {
        data: {
          data: {
            aid: 234567
          }
        }
      }
    })).toBe(234567)
  })

  it('resolves aid from dynamic archive detail payloads', () => {
    expect(resolveBilibiliVideoAid({
      detail: {
        data: {
          item: {
            modules: {
              module_dynamic: {
                major: {
                  archive: {
                    aid: 345678
                  }
                }
              }
            }
          }
        }
      }
    })).toBe(345678)
  })

  it('returns 0 when aid cannot be found', () => {
    expect(resolveBilibiliVideoAid({
      detail: {
        data: {
          data: {
            cid: 456789
          }
        }
      }
    })).toBe(0)
  })

  it('keeps current page cid selection for multi-page videos', () => {
    expect(resolveBilibiliVideoCid({
      idData: {
        type: 'one_video',
        bvid: 'BV1xx411c7mD',
        p: 2
      },
      detail: {
        data: {
          data: {
            cid: 11111,
            pages: [
              { cid: 11111, duration: 42 },
              { cid: 22222, duration: 84 }
            ]
          }
        }
      }
    })).toBe(22222)
  })
})
