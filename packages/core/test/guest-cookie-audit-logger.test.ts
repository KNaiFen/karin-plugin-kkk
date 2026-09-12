import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  GuestCookieAuditLogger,
  summarizeCookieHeader
} from '../src/module/utils/GuestCookieAuditLogger'

const tempDirs: string[] = []

const createTempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kkk-guest-cookie-log-'))
  tempDirs.push(dir)
  return dir
}

const readJsonl = (dir: string) => {
  const files = fs.readdirSync(dir).filter(file => file.endsWith('.jsonl')).sort()
  return files.flatMap(file => fs.readFileSync(path.join(dir, file), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as Record<string, any>))
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('GuestCookieAuditLogger', () => {
  it('writes JSONL audit events without cookie values', () => {
    const dir = createTempDir()
    const logger = new GuestCookieAuditLogger({
      enabled: true,
      directory: dir,
      retentionDays: 30,
      maxFileSizeBytes: 10 * 1024 * 1024,
      now: () => new Date('2026-05-26T10:00:00.000Z')
    })

    logger.record({
      level: 'info',
      event: 'refresh.success',
      platform: 'douyin',
      cookieSummary: summarizeCookieHeader('ttwid=secret-ttwid; msToken=secret-token', ['ttwid', 'missing_cookie'])
    })

    const content = fs.readFileSync(path.join(dir, '2026-05-26.jsonl'), 'utf8')
    const entries = readJsonl(dir)

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      time: '2026-05-26T10:00:00.000Z',
      level: 'info',
      event: 'refresh.success',
      platform: 'douyin',
      cookieSummary: {
        names: ['ttwid', 'msToken'],
        count: 2,
        length: 40,
        missingRequired: ['missing_cookie']
      }
    })
    expect(content).not.toContain('secret-ttwid')
    expect(content).not.toContain('secret-token')
  })

  it('rotates files when the current log exceeds the configured size', () => {
    const dir = createTempDir()
    const logger = new GuestCookieAuditLogger({
      enabled: true,
      directory: dir,
      retentionDays: 30,
      maxFileSizeBytes: 120,
      now: () => new Date('2026-05-26T10:00:00.000Z')
    })

    for (let index = 0; index < 5; index++) {
      logger.record({
        level: 'info',
        event: 'refresh.start',
        platform: 'xiaohongshu',
        error: { name: 'ExampleError', message: `large-message-${index}` }
      })
    }

    const files = fs.readdirSync(dir).filter(file => file.endsWith('.jsonl')).sort()
    expect(files.length).toBeGreaterThan(1)
    expect(files).toContain('2026-05-26.jsonl')
    expect(files).toContain('2026-05-26.1.jsonl')
  })

  it('removes log files older than the retention window', () => {
    const dir = createTempDir()
    fs.writeFileSync(path.join(dir, '2026-04-01.jsonl'), '{}\n')
    fs.writeFileSync(path.join(dir, '2026-05-20.jsonl'), '{}\n')

    const logger = new GuestCookieAuditLogger({
      enabled: true,
      directory: dir,
      retentionDays: 7,
      maxFileSizeBytes: 10 * 1024 * 1024,
      now: () => new Date('2026-05-26T10:00:00.000Z')
    })

    logger.record({
      level: 'info',
      event: 'refresh.start',
      platform: 'douyin'
    })

    const files = fs.readdirSync(dir).filter(file => file.endsWith('.jsonl')).sort()
    expect(files).not.toContain('2026-04-01.jsonl')
    expect(files).toContain('2026-05-20.jsonl')
    expect(files).toContain('2026-05-26.jsonl')
  })

  it('does not scan and remove expired logs on every record for the same logger day', () => {
    const dir = createTempDir()
    fs.writeFileSync(path.join(dir, '2026-04-01.jsonl'), '{}\n')

    const logger = new GuestCookieAuditLogger({
      enabled: true,
      directory: dir,
      retentionDays: 7,
      maxFileSizeBytes: 10 * 1024 * 1024,
      now: () => new Date('2026-05-26T10:00:00.000Z')
    })

    logger.record({
      level: 'info',
      event: 'refresh.start',
      platform: 'douyin'
    })

    expect(fs.existsSync(path.join(dir, '2026-04-01.jsonl'))).toBe(false)

    fs.writeFileSync(path.join(dir, '2026-04-01.jsonl'), '{}\n')
    logger.record({
      level: 'info',
      event: 'refresh.success',
      platform: 'douyin'
    })

    expect(fs.existsSync(path.join(dir, '2026-04-01.jsonl'))).toBe(true)
  })

  it('does not create files when disabled', () => {
    const dir = createTempDir()
    const logger = new GuestCookieAuditLogger({
      enabled: false,
      directory: dir,
      retentionDays: 30,
      maxFileSizeBytes: 10 * 1024 * 1024,
      now: () => new Date('2026-05-26T10:00:00.000Z')
    })

    logger.record({
      level: 'info',
      event: 'refresh.start',
      platform: 'douyin'
    })

    expect(fs.readdirSync(dir)).toEqual([])
  })
})
