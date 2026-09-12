import { beforeAll, describe, expect, it } from 'vitest'

import { ComponentRendererFactory } from '../../template/src/render/ComponentRendererFactory'
import { ComponentAutoRegistry } from '../../template/src/utils/ComponentAutoRegistry'

const validExternalPostData = {
  platform: {
    key: 'wechat',
    label: '微信公众号',
    accentColor: '#07c160'
  },
  title: '测试文章',
  author: {
    name: '测试作者'
  },
  summary: '',
  url: 'https://mp.weixin.qq.com/s/example',
  images: [],
  stats: [],
  meta: []
}

describe('external-post template validation', () => {
  beforeAll(async () => {
    await ComponentAutoRegistry.initialize()
  })

  it('creates a component for the object-shaped platform required by the external-post contract', async () => {
    const component = await ComponentRendererFactory.createComponent({
      templateType: 'other',
      templateName: 'external-post',
      watermarkTextBitSize: 0,
      data: validExternalPostData
    })

    expect(component.props.data).toEqual(validExternalPostData)
  })

  it('rejects string or incomplete platform data before rendering', async () => {
    await expect(ComponentRendererFactory.createComponent({
      templateType: 'other',
      templateName: 'external-post',
      watermarkTextBitSize: 0,
      data: {
        ...validExternalPostData,
        platform: 'wechat'
      }
    })).rejects.toThrow('数据验证失败: other:external-post')

    await expect(ComponentRendererFactory.createComponent({
      templateType: 'other',
      templateName: 'external-post',
      watermarkTextBitSize: 0,
      data: {
        ...validExternalPostData,
        platform: {
          key: 'wechat',
          label: '微信公众号'
        }
      }
    })).rejects.toThrow('数据验证失败: other:external-post')
  })
})
