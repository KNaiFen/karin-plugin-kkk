import { describe, expect, it } from 'vitest'

import { shouldRetryLLMRequestError } from '../src/module/utils/llmRetry'

describe('shouldRetryLLMRequestError', () => {
  it('retries upstream gateway errors', () => {
    const error = Object.assign(new Error('LLM 请求失败：HTTP 524'), {
      response: {
        status: 524
      }
    })

    expect(shouldRetryLLMRequestError(error)).toBe(true)
  })

  it('does not retry client request errors caused by our payload', () => {
    const error = Object.assign(new Error('LLM 请求失败：HTTP 400 Bad Request'), {
      response: {
        status: 400
      }
    })

    expect(shouldRetryLLMRequestError(error)).toBe(false)
  })

  it('does not retry obvious local programming errors', () => {
    expect(shouldRetryLLMRequestError(new TypeError('Cannot read properties of undefined'))).toBe(false)
  })
})
