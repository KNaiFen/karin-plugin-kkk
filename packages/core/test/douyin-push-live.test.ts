import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  getLiveStatus: vi.fn(),
  updateLiveStatus: vi.fn(),
  info: vi.fn(),
  warn: vi.fn()
}))

vi.mock('node-karin', () => ({
  logger: {
    info: state.info,
    warn: state.warn
  }
}))

vi.mock('@/module', () => ({
  douyinDB: {
    getLiveStatus: state.getLiveStatus,
    updateLiveStatus: state.updateLiveStatus
  }
}))

const { processLiveStream } = await import('../src/platform/douyin/push/live')

const createProfile = (overrides: Record<string, unknown> = {}) => ({
  data: {
    user: {
      live_status: 1,
      sec_uid: 'sec-user',
      room_id_str: 'room-old',
      nickname: '测试主播',
      avatar_larger: {
        uri: 'avatar-uri'
      },
      ...overrides
    }
  }
})

describe('Douyin push live processing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.getLiveStatus.mockResolvedValue({ living: false })
  })

  it('uses room_data from the confirmed live profile when the first profile omits it', async () => {
    const confirmedRoomData = {
      owner: {
        web_rid: 'fresh-web-rid'
      }
    }
    const fetchLiveRoomInfo = vi.fn(async () => ({ data: { ok: true } }))
    const amagi = {
      douyin: {
        fetcher: {
          fetchLiveRoomInfo
        }
      }
    }

    const result = await processLiveStream(
      'sec-user',
      createProfile({ room_data: undefined }),
      { remark: '测试主播' },
      [{ groupId: '10000', botId: '20000' }],
      amagi,
      operation => operation(),
      async () => createProfile({
        room_id_str: 'room-fresh',
        room_data: JSON.stringify(confirmedRoomData)
      })
    )

    expect(fetchLiveRoomInfo).toHaveBeenCalledWith({
      room_id: 'room-fresh',
      web_rid: 'fresh-web-rid',
      typeMode: 'strict'
    })
    expect(result?.Detail_Data.room_data).toEqual(confirmedRoomData)
  })

  it('skips live push when confirmed room_data does not contain owner.web_rid', async () => {
    const fetchLiveRoomInfo = vi.fn(async () => {
      throw new Error('fetchLiveRoomInfo should not be called')
    })
    const amagi = {
      douyin: {
        fetcher: {
          fetchLiveRoomInfo
        }
      }
    }

    const result = await processLiveStream(
      'sec-user',
      createProfile({ room_data: JSON.stringify({ owner: { web_rid: 'old-web-rid' } }) }),
      { remark: '测试主播' },
      [{ groupId: '10000', botId: '20000' }],
      amagi,
      operation => operation(),
      async () => createProfile({
        room_id_str: 'room-fresh',
        room_data: JSON.stringify({ owner: {} })
      })
    )

    expect(result).toBeNull()
    expect(fetchLiveRoomInfo).not.toHaveBeenCalled()
    expect(state.warn).toHaveBeenCalledWith(expect.stringContaining('web_rid'))
  })
})
