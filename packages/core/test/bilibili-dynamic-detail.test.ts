import { describe, expect, it } from 'vitest'

import {
  getBilibiliDynamicDrawImages,
  normalizeBilibiliDynamicDetailResult
} from '../src/platform/bilibili/dynamicDetail'

describe('bilibili dynamic detail helpers', () => {
  it('normalizes stale nested dynamic detail payloads to the current result shape', () => {
    const normalized = normalizeBilibiliDynamicDetailResult({
      data: {
        data: {
          item: {
            id_str: 'dyn-nested',
            type: 'DYNAMIC_TYPE_DRAW'
          }
        }
      }
    } as any)

    expect(normalized?.data?.item?.id_str).toBe('dyn-nested')
    expect(normalized?.data?.item?.type).toBe('DYNAMIC_TYPE_DRAW')
  })

  it('falls back to major.draw.items when opus.pics are absent', () => {
    expect(getBilibiliDynamicDrawImages({
      modules: {
        module_dynamic: {
          major: {
            opus: {
              title: '图文动态'
            },
            draw: {
              items: [
                { src: 'https://example.com/draw-item-1.jpg' },
                { src: 'https://example.com/draw-item-2.jpg' }
              ]
            }
          }
        }
      }
    } as any)).toEqual([
      { src: 'https://example.com/draw-item-1.jpg' },
      { src: 'https://example.com/draw-item-2.jpg' }
    ])
  })
})
