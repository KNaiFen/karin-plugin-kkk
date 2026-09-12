import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  formatFailureTraceTime,
  getFailureTraceSnapshot,
  persistFailureTrace,
  recordFailureTraceStep,
  resolveFailureTraceEventTime,
  runWithFailureTraceContext
} from '../src/module/utils/ErrorTrace'

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe('error trace persistence', () => {
  it('writes the full collected trace to a dedicated error file when parsing fails', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kkk-error-trace-'))
    tempDirs.push(outputDir)

    const filePath = await runWithFailureTraceContext({
      businessName: '抖音视频解析',
      event: {
        message: 'https://v.douyin.com/Br9x2Q4WNfQ/',
        userId: '123456',
        groupId: '654321'
      }
    }, async () => {
      recordFailureTraceStep('handler.start', {
        platform: 'douyin'
      })
      recordFailureTraceStep('douyin.id.resolve', {
        url: 'https://v.douyin.com/Br9x2Q4WNfQ/'
      })

      return persistFailureTrace({
        error: new Error('抖音数据获取失败'),
        outputDir,
        rawLogs: [
          '[00:00:00.000][INFO] [Douyin] 开始解析',
          '[00:00:01.000][WARN] [Douyin] 常规接口获取作品详情失败'
        ]
      })
    })

    expect(filePath).toBeTruthy()
    expect(fs.existsSync(filePath!)).toBe(true)

    const payload = JSON.parse(fs.readFileSync(filePath!, 'utf8')) as {
      businessName: string
      event: {
        message: {
          kind: string
          length: number
          sha256: string
          url?: { host: string, pathTemplate: string }
        }
        userId: string
        groupId: string
      }
      entries: Array<{ step: string }>
      error: { message: string }
      rawLogs: string[]
    }

    expect(payload.businessName).toBe('抖音视频解析')
    expect(payload.event.message).toMatchObject({
      kind: 'url',
      length: 'https://v.douyin.com/Br9x2Q4WNfQ/'.length,
      url: {
        host: 'v.douyin.com',
        pathTemplate: '/:id'
      }
    })
    expect(payload.event.message.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(payload.event.userId).toMatch(/^user_[a-f0-9]{16}$/)
    expect(payload.event.groupId).toMatch(/^group_[a-f0-9]{16}$/)
    expect(payload.event.userId).not.toContain('123456')
    expect(payload.event.groupId).not.toContain('654321')
    expect(payload.entries.map(item => item.step)).toEqual([
      'handler.start',
      'douyin.id.resolve'
    ])
    expect(payload.error.message).toBe('抖音数据获取失败')
    expect(payload.rawLogs).toHaveLength(2)
  })

  it('writes a recovered trace file when primary parsing fails but fallback succeeds', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kkk-error-trace-'))
    tempDirs.push(outputDir)

    const filePath = await runWithFailureTraceContext({
      businessName: '抖音视频解析',
      event: {
        message: 'https://v.douyin.com/Br9x2Q4WNfQ/',
        userId: '123456',
        groupId: '654321'
      }
    }, async () => {
      recordFailureTraceStep('handler.start', {
        platform: 'douyin'
      })
      recordFailureTraceStep('douyin.work.fetch.api.error', {
        message: '获取响应数据失败！接口返回内容为空'
      })
      recordFailureTraceStep('douyin.work.fetch.browser.success', {
        awemeId: '7657916175708779685'
      })

      return persistFailureTrace({
        error: new Error('常规接口失败，浏览器兜底成功'),
        outputDir,
        extra: {
          recoveryStage: 'browser-fallback'
        },
        outcome: 'recovered'
      })
    })

    expect(filePath).toBeTruthy()
    expect(fs.existsSync(filePath!)).toBe(true)

    const payload = JSON.parse(fs.readFileSync(filePath!, 'utf8')) as {
      outcome: string
      entries: Array<{ step: string }>
      extra?: { recoveryStage?: string }
      error: { message: string }
    }

    expect(payload.outcome).toBe('recovered')
    expect(payload.entries.map(item => item.step)).toEqual([
      'handler.start',
      'douyin.work.fetch.api.error',
      'douyin.work.fetch.browser.success'
    ])
    expect(payload.extra?.recoveryStage).toBe('browser-fallback')
    expect(payload.error.message).toBe('常规接口失败，浏览器兜底成功')
  })

  it('uses the triggering message time and system timezone for trace timestamps', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kkk-error-trace-'))
    tempDirs.push(outputDir)
    const messageTimeSeconds = 1784788800
    const messageTimeMilliseconds = messageTimeSeconds * 1000
    const finishedAt = new Date(messageTimeMilliseconds + 5_000)
    const expectedStartedAt = formatFailureTraceTime(new Date(messageTimeMilliseconds))

    expect(resolveFailureTraceEventTime(messageTimeSeconds)?.getTime()).toBe(messageTimeMilliseconds)
    expect(resolveFailureTraceEventTime(messageTimeMilliseconds)?.getTime()).toBe(messageTimeMilliseconds)
    expect(resolveFailureTraceEventTime('invalid')).toBeUndefined()

    const filePath = await runWithFailureTraceContext({
      businessName: '小红书视频解析',
      event: {
        message: 'http://xhslink.com/o/9nPpqdXq2j2',
        time: messageTimeSeconds
      }
    }, async () => {
      recordFailureTraceStep('handler.start')
      return persistFailureTrace({
        error: new Error('测试错误'),
        outputDir,
        now: () => finishedAt
      })
    })

    expect(filePath).toBeTruthy()
    const payload = JSON.parse(fs.readFileSync(filePath!, 'utf8')) as {
      startedAt: string
      finishedAt: string
      event?: { time?: number }
      entries: Array<{ time: string }>
    }

    expect(payload.event?.time).toBe(messageTimeSeconds)
    expect(payload.startedAt).toBe(expectedStartedAt)
    expect(payload.finishedAt).toBe(formatFailureTraceTime(finishedAt))
    expect(payload.entries[0]?.time).toMatch(/T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/)
    expect(path.basename(filePath!).startsWith(`${expectedStartedAt.replace(/:/g, '-')}_`)).toBe(true)
  })

  it('keeps trace ids unique for messages received in the same second', async () => {
    const meta = {
      businessName: '小红书视频解析',
      event: { time: 1784788800 }
    }
    const first = await runWithFailureTraceContext(meta, () => getFailureTraceSnapshot()?.traceId)
    const second = await runWithFailureTraceContext(meta, () => getFailureTraceSnapshot()?.traceId)

    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
    expect(first).not.toBe(second)
    expect(first).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('persists sanitized nested error causes for adapter failures', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kkk-error-trace-'))
    tempDirs.push(outputDir)
    const adapterCause: Record<string, unknown> = {
      status: 'failed',
      retcode: 1200,
      message: 'Timeout: NTEvent',
      accessToken: 'secret-token',
      password: 123456,
      apiKey: 'secret-api-key'
    }
    adapterCause.loop = adapterCause
    const error = new Error('视频发送回执超时', {
      cause: new Error('node-karin wrapped response', { cause: adapterCause })
    })

    const filePath = persistFailureTrace({
      error,
      outputDir
    })

    expect(filePath).toBeTruthy()
    const payload = JSON.parse(fs.readFileSync(filePath!, 'utf8')) as {
      error: {
        cause?: {
          name?: string
          message?: string
          cause?: Record<string, unknown>
        }
      }
    }
    expect(payload.error.cause).toMatchObject({
      name: 'Error',
      message: 'node-karin wrapped response',
      cause: {
        status: 'failed',
        retcode: 1200,
        message: 'Timeout: NTEvent',
        accessToken: '<redacted>',
        password: '<redacted>',
        apiKey: '<redacted>',
        loop: '[Circular]'
      }
    })
  })

  it('redacts signed URL query credentials embedded in error text', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kkk-error-trace-'))
    tempDirs.push(outputDir)

    const filePath = persistFailureTrace({
      error: new Error(
        'requestUrl: \'https://www.douyin.com/aweme/v1/web/aweme/detail/?msToken=ms-secret&verifyFp=fp-secret&verify_fp=fp-underscore&uifid=ui-secret&a_bogus=bogus-secret&webid=web-secret&web_id=web-underscore&upsig=bili-signature&token="quoted-secret")&page=3\''
      ),
      outputDir
    })

    expect(filePath).toBeTruthy()
    const payload = JSON.parse(fs.readFileSync(filePath!, 'utf8')) as {
      error: { message: string, stack?: string }
    }

    for (const secret of [
      'ms-secret',
      'fp-secret',
      'fp-underscore',
      'ui-secret',
      'bogus-secret',
      'web-secret',
      'web-underscore',
      'bili-signature',
      'quoted-secret'
    ]) {
      expect(payload.error.message).not.toContain(secret)
      expect(payload.error.stack).not.toContain(secret)
    }
    expect(payload.error.message).toContain('msToken=<redacted>')
    expect(payload.error.message).toContain('verifyFp=<redacted>')
    expect(payload.error.message).toContain('page=3')
    expect(payload.error.message).toContain(')')
  })

  it('does not persist inline credentials or original event identifiers', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kkk-error-trace-'))
    tempDirs.push(outputDir)

    const filePath = await runWithFailureTraceContext({
      businessName: '敏感信息测试',
      event: {
        message: 'https://example.com/private/123456789?token=event-token',
        userId: 'user-raw-123',
        groupId: 'group-raw-456',
        selfId: 'bot-raw-789'
      }
    }, async () => {
      recordFailureTraceStep('request.failed', {
        payload: '{"token":"nested-token","web_session":"nested-session"}',
        authorization: 'Bearer bearer-secret',
        cookieLine: 'Cookie: ttwid=cookie-secret; msToken=ms-secret'
      })
      return persistFailureTrace({
        error: new Error('request failed: apiKey=api-secret password="password-secret"'),
        outputDir,
        rawLogs: ['Authorization: Bearer raw-log-token', 'cookie: web_session=raw-log-session'],
        structuredLogs: {
          userId: 'structured-user-id'
        }
      })
    })

    expect(filePath).toBeTruthy()
    const serialized = fs.readFileSync(filePath!, 'utf8')
    for (const secret of [
      'event-token',
      'nested-token',
      'nested-session',
      'bearer-secret',
      'cookie-secret',
      'ms-secret',
      'api-secret',
      'password-secret',
      'raw-log-token',
      'raw-log-session',
      'structured-user-id',
      'user-raw-123',
      'group-raw-456',
      'bot-raw-789'
    ]) {
      expect(serialized).not.toContain(secret)
    }
    expect(serialized).toContain('<redacted>')
    expect(serialized).toContain('"kind": "url"')
  })

  it('writes and rotates a compact daily diagnostics index', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kkk-error-trace-'))
    tempDirs.push(outputDir)
    const now = new Date('2026-07-23T08:00:00.000Z')

    for (let index = 0; index < 3; index++) {
      persistFailureTrace({
        error: new Error(`索引测试错误 ${index}`),
        outputDir,
        now: () => now,
        maxIndexFileSizeBytes: 1
      })
    }

    const indexDir = path.join(outputDir, 'diagnostics')
    const files = fs.readdirSync(indexDir).filter(file => file.endsWith('.jsonl')).sort()
    const entries = files.flatMap(file => fs.readFileSync(path.join(indexDir, file), 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as Record<string, unknown>))

    expect(files.length).toBeGreaterThan(1)
    expect(entries).toHaveLength(3)
    expect(entries.every(entry => entry.outcome === 'failed')).toBe(true)
    expect(entries.every(entry => typeof entry.traceId === 'string')).toBe(true)
  })
})
