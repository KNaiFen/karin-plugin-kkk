import { describe, expect, it } from 'vitest'

import { appConfigSchema } from '../src/module/config/app.schema'

describe('app config schema', () => {
  it('exposes shared cache ttl hours as a user-visible setting with bounded validation', () => {
    const field = appConfigSchema.fields.find(item => 'key' in item && item.key === 'sharedCacheTtlHours')

    expect(field).toMatchObject({
      key: 'sharedCacheTtlHours',
      type: 'input',
      inputType: 'number',
      label: '共享缓存过期时间',
      rules: [
        {
          min: 1,
          max: 168
        }
      ]
    })
  })
})
