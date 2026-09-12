import YAML from 'node-karin/yaml'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  files: new Map<string, string>(),
  writes: [] as Array<{ path: string, content: string }>,
  logError: vi.fn(),
  updateFilterMode: vi.fn(),
  syncDouyinSubscriptions: vi.fn(),
  syncBilibiliSubscriptions: vi.fn()
}))

const defaultDir = '/tmp/plugin-root/config/default_config'
const userDir = '/tmp/karin-base/karin-plugin-kkk/config'
const defaultPath = `${defaultDir}/pushlist.yaml`
const userPath = `${userDir}/pushlist.yaml`

vi.mock('node-karin', () => ({
  copyConfigSync: vi.fn(),
  filesByExt: vi.fn((_dir: string, _ext: string, mode: string) => mode === 'name' ? [] : []),
  logger: {
    debug: vi.fn(),
    error: state.logError
  },
  watch: vi.fn()
}))

vi.mock('node-karin/root', () => ({
  karinPathBase: '/tmp/karin-base'
}))

vi.mock('@/root', () => ({
  Root: {
    pluginName: 'karin-plugin-kkk',
    pluginPath: '/tmp/plugin-root'
  }
}))

vi.mock('@/module/db', () => ({
  getDouyinDB: vi.fn(async () => ({
    updateFilterMode: state.updateFilterMode,
    getFilterWords: vi.fn(async () => []),
    getFilterTags: vi.fn(async () => []),
    removeFilterWord: vi.fn(),
    addFilterWord: vi.fn(),
    removeFilterTag: vi.fn(),
    addFilterTag: vi.fn(),
    syncConfigSubscriptions: state.syncDouyinSubscriptions
  })),
  getBilibiliDB: vi.fn(async () => ({
    syncConfigSubscriptions: state.syncBilibiliSubscriptions
  }))
}))

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    default: {
      ...actual.default,
      readdirSync: vi.fn(() => ['pushlist.yaml']),
      readFileSync: vi.fn((filePath: string) => {
        const content = state.files.get(String(filePath).replace(/\/$/, ''))
        if (content !== undefined) return content

        const error = new Error(`ENOENT: ${String(filePath)}`) as NodeJS.ErrnoException
        error.code = 'ENOENT'
        throw error
      }),
      writeFileSync: vi.fn((filePath: string, content: string) => {
        const path = String(filePath).replace(/\/$/, '')
        const text = String(content)
        state.files.set(path, text)
        state.writes.push({ path, content: text })
      })
    }
  }
})

describe('Config.ModifyPro rollback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    state.writes = []
    state.logError.mockReset()
    state.updateFilterMode.mockReset()
    state.updateFilterMode.mockRejectedValue(new Error('database unavailable'))
    state.syncDouyinSubscriptions.mockReset()
    state.syncDouyinSubscriptions.mockResolvedValue(undefined)
    state.syncBilibiliSubscriptions.mockReset()
    state.syncBilibiliSubscriptions.mockResolvedValue(undefined)

    const existingPushlist = YAML.stringify({
      douyin: [{
        switch: true,
        sec_uid: 'old-sec-uid',
        short_id: '',
        group_id: ['123:456'],
        remark: '旧配置'
      }],
      bilibili: []
    })
    state.files = new Map([
      [defaultPath, YAML.stringify({ douyin: [], bilibili: [] })],
      [userPath, existingPushlist]
    ])
  })

  it('restores YAML and the in-memory snapshot when filter database sync fails', async () => {
    const { Config } = await import('../src/module/utils/Config')
    const existingContent = state.files.get(userPath)

    const success = await Config.ModifyPro('pushlist', {
      douyin: [{
        switch: true,
        sec_uid: 'new-sec-uid',
        short_id: '',
        group_id: ['123:456'],
        remark: '新配置',
        filterMode: 'whitelist',
        Keywords: ['关键词'],
        Tags: ['标签']
      }],
      bilibili: []
    })

    expect(success).toBe(false)
    expect(state.updateFilterMode).toHaveBeenCalledWith('new-sec-uid', 'whitelist')
    expect(state.files.get(userPath)).toBe(existingContent)
    expect(state.writes.at(-1)).toEqual({ path: userPath, content: existingContent })
    expect(Config.pushlist.douyin).toEqual([expect.objectContaining({
      sec_uid: 'old-sec-uid',
      remark: '旧配置'
    })])
  })

  it('reports a fixed aggregate error when subscription database sync fails', async () => {
    state.syncDouyinSubscriptions.mockRejectedValue(new Error('database unavailable'))
    const { Config } = await import('../src/module/utils/Config')

    await expect(Config.syncConfigToDatabase()).rejects.toThrow('订阅数据库同步失败')
    expect(state.syncBilibiliSubscriptions).toHaveBeenCalledTimes(1)
    expect(state.syncDouyinSubscriptions).toHaveBeenCalledTimes(1)
    expect(state.logError).toHaveBeenCalledWith('[DouyinDB] 配置同步到数据库失败')
    expect(state.logError.mock.calls.flat().join(' ')).not.toContain('database unavailable')
  })

  it('still attempts Douyin sync when Bilibili sync fails first', async () => {
    state.syncBilibiliSubscriptions.mockRejectedValue(new Error('bilibili database unavailable'))
    const { Config } = await import('../src/module/utils/Config')

    await expect(Config.syncConfigToDatabase()).rejects.toThrow('订阅数据库同步失败')
    expect(state.syncBilibiliSubscriptions).toHaveBeenCalledTimes(1)
    expect(state.syncDouyinSubscriptions).toHaveBeenCalledTimes(1)
    expect(state.logError).toHaveBeenCalledWith('[BilibiliDB] 配置同步到数据库失败')
    expect(state.logError.mock.calls.flat().join(' ')).not.toContain('bilibili database unavailable')
  })

  it('serializes subscription sync and reads the latest snapshot for queued work', async () => {
    let releaseFirstSync!: () => void
    const firstSyncGate = new Promise<void>(resolve => {
      releaseFirstSync = resolve
    })
    let markFirstSyncStarted!: (config: unknown) => void
    const firstSyncStarted = new Promise<unknown>(resolve => {
      markFirstSyncStarted = resolve
    })
    state.syncDouyinSubscriptions
      .mockImplementationOnce(async (config: unknown) => {
        markFirstSyncStarted(config)
        await firstSyncGate
      })
      .mockResolvedValue(undefined)

    const { Config } = await import('../src/module/utils/Config')
    const firstSync = Config.syncConfigToDatabase()
    const firstConfig = await firstSyncStarted
    expect(firstConfig).toEqual([expect.objectContaining({ sec_uid: 'old-sec-uid' })])

    const nextDouyin = [{
      switch: true,
      sec_uid: 'new-sec-uid',
      short_id: '',
      group_id: ['123:456'],
      remark: '新配置'
    }]
    await expect(Config.ModifyPro('pushlist', {
      douyin: nextDouyin,
      bilibili: []
    })).resolves.toBe(true)
    expect(YAML.parse(state.files.get(userPath) ?? '').douyin).toEqual(nextDouyin)
    expect(Config.pushlist.douyin).toEqual(nextDouyin)

    const secondSync = Config.syncConfigToDatabase()
    expect(state.syncDouyinSubscriptions).toHaveBeenCalledTimes(1)

    releaseFirstSync()
    await firstSync
    await secondSync

    expect(state.syncDouyinSubscriptions).toHaveBeenCalledTimes(2)
    expect(state.syncDouyinSubscriptions.mock.calls[1][0]).toEqual(nextDouyin)
  })

  it('does not let a failed transaction roll back a later successful update', async () => {
    let releaseFailedTransaction!: () => void
    const failedTransactionGate = new Promise<void>(resolve => {
      releaseFailedTransaction = resolve
    })
    let markFailedTransactionStarted!: () => void
    const failedTransactionStarted = new Promise<void>(resolve => {
      markFailedTransactionStarted = resolve
    })
    state.updateFilterMode.mockImplementationOnce(async () => {
      markFailedTransactionStarted()
      await failedTransactionGate
      throw new Error('database unavailable')
    })

    const { Config } = await import('../src/module/utils/Config')
    const failedUpdate = Config.ModifyPro('pushlist', {
      douyin: [{
        switch: true,
        sec_uid: 'failed-sec-uid',
        short_id: '',
        group_id: ['123:456'],
        remark: '失败配置',
        filterMode: 'whitelist'
      }],
      bilibili: []
    })
    await failedTransactionStarted

    const successfulBilibili = [{
      switch: true,
      host_mid: 123456,
      group_id: ['123:456'],
      remark: '成功配置'
    }]
    const successfulUpdate = Config.ModifyPro('pushlist', {
      bilibili: successfulBilibili
    } as any)

    releaseFailedTransaction()
    await expect(failedUpdate).resolves.toBe(false)
    await expect(successfulUpdate).resolves.toBe(true)

    expect(Config.pushlist.douyin).toEqual([expect.objectContaining({
      sec_uid: 'old-sec-uid'
    })])
    expect(Config.pushlist.bilibili).toEqual(successfulBilibili)
  })

  it('does not let a failed transaction roll back a newer direct pushlist write', async () => {
    let releaseFailedTransaction!: () => void
    const failedTransactionGate = new Promise<void>(resolve => {
      releaseFailedTransaction = resolve
    })
    let markFailedTransactionStarted!: () => void
    const failedTransactionStarted = new Promise<void>(resolve => {
      markFailedTransactionStarted = resolve
    })
    state.updateFilterMode.mockImplementationOnce(async () => {
      markFailedTransactionStarted()
      await failedTransactionGate
      throw new Error('database unavailable')
    })

    const { Config } = await import('../src/module/utils/Config')
    const failedUpdate = Config.ModifyPro('pushlist', {
      douyin: [{
        switch: true,
        sec_uid: 'failed-sec-uid',
        short_id: '',
        group_id: ['123:456'],
        remark: '失败配置',
        filterMode: 'whitelist'
      }],
      bilibili: []
    })
    await failedTransactionStarted

    const successfulBilibili = [{
      switch: true,
      host_mid: 123456,
      group_id: ['123:456'],
      remark: '成功配置'
    }]
    Config.Modify('pushlist', 'bilibili', successfulBilibili)

    releaseFailedTransaction()
    await expect(failedUpdate).resolves.toBe(false)

    expect(Config.pushlist.douyin).toEqual([expect.objectContaining({
      sec_uid: 'old-sec-uid'
    })])
    expect(Config.pushlist.bilibili).toEqual(successfulBilibili)
  })
})
