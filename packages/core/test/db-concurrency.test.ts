import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  tempRoot: '',
  loggerDebug: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerMark: vi.fn(),
  config: {
    pushlist: {
      douyin: [],
      bilibili: []
    }
  }
}))

vi.mock('node-karin', () => ({
  logger: {
    debug: (...args: unknown[]) => state.loggerDebug(...args),
    info: (...args: unknown[]) => state.loggerInfo(...args),
    mark: (...args: unknown[]) => state.loggerMark(...args),
    warn: (...args: unknown[]) => state.loggerWarn(...args),
    error: (...args: unknown[]) => state.loggerError(...args),
    green: (value: string) => value
  }
}))

vi.mock('node-karin/root', () => ({
  get karinPathBase () {
    return state.tempRoot
  }
}))

vi.mock('@/module/utils', () => ({
  Root: {
    pluginName: 'karin-plugin-kkk-test'
  }
}))

vi.mock('@/module/utils/Config', () => ({
  Config: state.config
}))

vi.mock('@ikenxuan/amagi', () => ({
  DynamicType: {
    FORWARD: 'forward',
    AV: 'av'
  }
}))

describe('database concurrency safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kkk-db-concurrency-'))
    state.config.pushlist.douyin = []
  })

  afterEach(() => {
    if (state.tempRoot) {
      fs.rmSync(state.tempRoot, { recursive: true, force: true })
      state.tempRoot = ''
    }
  })

  it('upserts parse statistics without unique constraint failures under concurrent first writes', async () => {
    const { StatisticsDBBase } = await import('../src/module/db/statistics')
    const db = await new StatisticsDBBase().init()

    const results = await Promise.allSettled(Array.from({ length: 12 }, () =>
      db.recordParse('group-1', 'user-1', 'douyin')
    ))

    expect(results.every(result => result.status === 'fulfilled')).toBe(true)
    expect(await db.getTotalParses()).toBe(12)
    expect(await db.getTotalGroups()).toBe(1)
    expect(await db.getPlatformTotalParses('douyin')).toBe(12)
    expect((await db.getGroupStatistics('group-1'))).toHaveLength(1)
    expect((await db.getGroupStatistics('group-1'))[0]?.parseCount).toBe(12)
  })

  it('creates douyin subscription/cache rows safely under concurrent first writes', async () => {
    const { DouyinDBBase } = await import('../src/module/db/douyin')
    const db = await new DouyinDBBase().init()

    const subscribeResults = await Promise.allSettled(Array.from({ length: 10 }, () =>
      db.subscribeDouyinUser('group-1', 'bot-1', 'sec-1', 'short-1', '主播')
    ))
    expect(subscribeResults.every(result => result.status === 'fulfilled')).toBe(true)

    const cacheResults = await Promise.allSettled(Array.from({ length: 10 }, () =>
      db.addAwemeCache('aweme-1', 'sec-1', 'group-1', 'post')
    ))
    expect(cacheResults.every(result => result.status === 'fulfilled')).toBe(true)
    expect(await db.isAwemePushed('aweme-1', 'sec-1', 'group-1', 'post')).toBe(true)

    const repeatedSubscription = await db.subscribeDouyinUser('group-1', 'bot-1', 'sec-1', 'short-1', '主播')
    expect(repeatedSubscription.groupId).toBe('group-1')
  })

  it('creates bilibili subscription/cache rows safely under concurrent first writes', async () => {
    const { BilibiliDBBase } = await import('../src/module/db/bilibili')
    const db = await new BilibiliDBBase().init()

    const subscribeResults = await Promise.allSettled(Array.from({ length: 10 }, () =>
      db.subscribeBilibiliUser('group-1', 'bot-1', 1001, 'UP主')
    ))
    expect(subscribeResults.every(result => result.status === 'fulfilled')).toBe(true)

    const cacheResults = await Promise.allSettled(Array.from({ length: 10 }, () =>
      db.addDynamicCache('dynamic-1', 1001, 'group-1', 'video')
    ))
    expect(cacheResults.every(result => result.status === 'fulfilled')).toBe(true)
    expect(await db.isDynamicPushed('dynamic-1', 1001, 'group-1')).toBe(true)

    const repeatedSubscription = await db.subscribeBilibiliUser('group-1', 'bot-1', 1001, 'UP主')
    expect(repeatedSubscription.host_mid).toBe(1001)
  })

  it('recovers legacy AwemeCaches_old tables during init', async () => {
    const { DouyinDBBase } = await import('../src/module/db/douyin')
    const dbFile = path.join(state.tempRoot, 'karin-plugin-kkk-test/data/douyin.db')
    fs.mkdirSync(path.dirname(dbFile), { recursive: true })
    state.config.pushlist.douyin = [{
      switch: true,
      sec_uid: 'sec-live',
      short_id: '',
      group_id: ['group-live:bot-live'],
      remark: '恢复主播',
      pushTypes: ['post']
    }]
    const sqlite3 = (await import('node-karin/sqlite3')).default
    const raw = new sqlite3.Database(dbFile)

    await new Promise<void>((resolve, reject) => {
      raw.serialize(() => {
        raw.run('CREATE TABLE DouyinUsers (sec_uid TEXT PRIMARY KEY, short_id TEXT, remark TEXT, living INTEGER DEFAULT 0, filterMode TEXT DEFAULT \'blacklist\', createdAt TEXT DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT DEFAULT CURRENT_TIMESTAMP)', (err) => {
          if (err) return reject(err)
          raw.run('CREATE TABLE Groups (id TEXT NOT NULL, botId TEXT NOT NULL, createdAt TEXT DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id, botId))', (groupErr) => {
            if (groupErr) return reject(groupErr)
            raw.run('CREATE TABLE GroupUserSubscriptions (groupId TEXT, sec_uid TEXT, createdAt TEXT DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (groupId, sec_uid))', (subscriptionErr) => {
              if (subscriptionErr) return reject(subscriptionErr)
              raw.run(`
            CREATE TABLE AwemeCaches_old (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              aweme_id TEXT NOT NULL,
              sec_uid TEXT NOT NULL,
              groupId TEXT NOT NULL,
              pushType TEXT DEFAULT 'post',
              createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
              updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
            )
          `, (createErr) => {
                if (createErr) return reject(createErr)
                raw.run('INSERT INTO DouyinUsers (sec_uid, short_id, remark) VALUES (?, ?, ?)', ['sec-live', '', '恢复主播'], (userErr) => {
                  if (userErr) return reject(userErr)
                  raw.run('INSERT INTO Groups (id, botId) VALUES (?, ?)', ['group-live', 'bot-live'], (insertGroupErr) => {
                    if (insertGroupErr) return reject(insertGroupErr)
                    raw.run('INSERT INTO GroupUserSubscriptions (groupId, sec_uid) VALUES (?, ?)', ['group-live', 'sec-live'], (insertSubscriptionErr) => {
                      if (insertSubscriptionErr) return reject(insertSubscriptionErr)
                      raw.run(
                        'INSERT INTO AwemeCaches_old (aweme_id, sec_uid, groupId, pushType) VALUES (?, ?, ?, ?)',
                        ['aweme-live', 'sec-live', 'group-live', 'post'],
                        (insertErr) => insertErr ? reject(insertErr) : resolve()
                      )
                    })
                  })
                })
              })
            })
          })
        })
      })
    })
    await new Promise<void>((resolve) => raw.close(() => resolve()))

    const recovered = await new DouyinDBBase().init()
    const inspect = new sqlite3.Database(dbFile)
    const awemeRows = await new Promise<any[]>((resolve, reject) => {
      inspect.all('SELECT aweme_id, sec_uid, groupId, pushType FROM AwemeCaches', (err, rows) => {
        if (err) reject(err)
        else resolve(rows as any[])
      })
    })
    await new Promise<void>((resolve) => inspect.close(() => resolve()))
    expect(awemeRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        aweme_id: 'aweme-live',
        sec_uid: 'sec-live',
        groupId: 'group-live',
        pushType: 'post'
      })
    ]))
    expect(await recovered.isAwemePushed('aweme-live', 'sec-live', 'group-live', 'post')).toBe(true)
  })
})
