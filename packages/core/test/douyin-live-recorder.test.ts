import { describe, expect, it, vi } from 'vitest'

import {
  buildDouyinLiveRecordCommand,
  buildDouyinLiveRecordHeaders,
  buildDouyinLiveReflowInfoUrl,
  buildDouyinLiveWebEnterInfoUrl,
  fetchDouyinLiveDataFromReflow,
  getDouyinLiveContainer,
  getDouyinLiveItem,
  getDouyinLiveStatus,
  getDouyinLiveWebRid,
  isDouyinLiveStatusActive,
  normalizeDouyinLiveQuality,
  normalizeDouyinLiveRecordSeconds,
  parseDouyinLiveApiObject,
  selectDouyinLiveStream
} from '../src/platform/douyin/liveRecorder'

const createLiveItem = () => ({
  stream_url: {
    default_resolution: 'HD1',
    flv_pull_url: {
      FULL_HD1: 'https://pull-flv.example.com/fullhd.flv',
      HD1: 'https://pull-flv.example.com/hd.flv',
      SD1: 'https://pull-flv.example.com/sd.flv'
    },
    hls_pull_url_map: {
      FULL_HD1: 'https://pull-hls.example.com/fullhd.m3u8',
      HD1: 'https://pull-hls.example.com/hd.m3u8',
      SD1: 'https://pull-hls.example.com/sd.m3u8'
    },
    hls_pull_url: 'https://pull-hls.example.com/default.m3u8'
  }
})

describe('Douyin live recorder helpers', () => {
  it('selects the highest HTTP-FLV stream by default', () => {
    expect(selectDouyinLiveStream(createLiveItem(), 'auto')).toEqual({
      url: 'https://pull-flv.example.com/fullhd.flv',
      format: 'flv',
      quality: 'FULL_HD1'
    })
  })

  it('selects the requested FLV quality and falls back when it is unavailable', () => {
    expect(selectDouyinLiveStream(createLiveItem(), 'HD1')).toEqual({
      url: 'https://pull-flv.example.com/hd.flv',
      format: 'flv',
      quality: 'HD1'
    })

    expect(selectDouyinLiveStream(createLiveItem(), 'SD2')).toEqual({
      url: 'https://pull-flv.example.com/fullhd.flv',
      format: 'flv',
      quality: 'FULL_HD1'
    })
  })

  it('falls back to HLS when FLV streams are unavailable', () => {
    const liveItem = createLiveItem()
    liveItem.stream_url.flv_pull_url = {}

    expect(selectDouyinLiveStream(liveItem, 'HD1')).toEqual({
      url: 'https://pull-hls.example.com/hd.m3u8',
      format: 'hls',
      quality: 'HD1'
    })
  })

  it('reads web_stream_url from nested live response data as a fallback source', () => {
    expect(selectDouyinLiveStream({
      data: {
        web_stream_url: {
          flv_pull_url: {
            HD1: 'https://web-stream.example.com/hd.flv'
          }
        }
      }
    }, 'HD1')).toEqual({
      url: 'https://web-stream.example.com/hd.flv',
      format: 'flv',
      quality: 'HD1'
    })
  })

  it('reads live item and web stream fallback from Amagi live response wrappers', () => {
    const liveItem = {
      title: '直播中',
      stream_url: {
        flv_pull_url: {
          FULL_HD1: 'https://item-stream.example.com/fullhd.flv'
        }
      }
    }
    const liveResponse = {
      success: true,
      data: {
        data: {
          data: [liveItem],
          web_stream_url: {
            flv_pull_url: {
              HD1: 'https://web-stream.example.com/hd.flv'
            }
          }
        }
      }
    }

    expect(getDouyinLiveContainer(liveResponse)?.data).toEqual([liveItem])
    expect(getDouyinLiveItem(liveResponse)).toBe(liveItem)
    expect(selectDouyinLiveStream(liveResponse, 'HD1')).toEqual({
      url: 'https://item-stream.example.com/fullhd.flv',
      format: 'flv',
      quality: 'FULL_HD1'
    })

    liveItem.stream_url.flv_pull_url = {}
    expect(selectDouyinLiveStream(liveResponse, 'HD1')).toEqual({
      url: 'https://web-stream.example.com/hd.flv',
      format: 'flv',
      quality: 'HD1'
    })
  })

  it('reads reflow room responses fetched by internal room_id', () => {
    const room = {
      id_str: '7644877342036544302',
      status: 4,
      title: '直播已结束',
      owner: {
        web_rid: '170812596736'
      }
    }
    const liveResponse = {
      data: {
        room
      }
    }

    expect(getDouyinLiveContainer(liveResponse)?.room).toBe(room)
    expect(getDouyinLiveItem(liveResponse)).toBe(room)
    expect(getDouyinLiveWebRid(liveResponse)).toBe('170812596736')
  })

  it('parses JSON string responses returned by the reflow request helper', () => {
    const parsed = parseDouyinLiveApiObject(JSON.stringify({
      data: {
        room: {
          id_str: '7644877342036544302',
          owner: {
            web_rid: '170812596736'
          }
        }
      }
    }), '测试接口')

    expect(getDouyinLiveWebRid(parsed)).toBe('170812596736')
  })

  it('refreshes reflow room data through web enter when owner web_rid is available', async () => {
    const staleReflow = {
      data: {
        room: {
          id_str: '7644877342036544302',
          status: 4,
          owner: {
            web_rid: '170812596736'
          },
          stream_url: {
            flv_pull_url: {
              FULL_HD1: 'http://pull-flv.example.com/stale.flv'
            }
          }
        }
      }
    }
    const freshWebEnter = {
      data: {
        data: {
          data: [{
            id_str: '7644877342036544302',
            status: 2,
            owner: {
              web_rid: '170812596736'
            },
            stream_url: {
              flv_pull_url: {
                FULL_HD1: 'https://pull-flv.example.com/fresh.flv'
              }
            }
          }]
        }
      }
    }
    const fetchReflowInfo = vi.fn(async () => staleReflow)
    const fetchLiveRoomInfo = vi.fn(async () => freshWebEnter)

    const liveData = await fetchDouyinLiveDataFromReflow({
      roomId: '7644877342036544302',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      fetchReflowInfo,
      fetchLiveRoomInfo
    })

    expect(fetchLiveRoomInfo).toHaveBeenCalledWith({
      room_id: '7644877342036544302',
      web_rid: '170812596736',
      typeMode: 'strict'
    })
    expect(liveData).toBe(freshWebEnter)
    expect(isDouyinLiveStatusActive(liveData)).toBe(true)
    expect(selectDouyinLiveStream(liveData)).toEqual({
      url: 'https://pull-flv.example.com/fresh.flv',
      format: 'flv',
      quality: 'FULL_HD1'
    })
  })

  it('keeps reflow data when web enter returns a failed wrapper without room data', async () => {
    const staleReflow = {
      data: {
        room: {
          id_str: '7644877342036544302',
          status: 4,
          owner: {
            web_rid: '170812596736'
          }
        }
      }
    }

    const liveData = await fetchDouyinLiveDataFromReflow({
      roomId: '7644877342036544302',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      fetchReflowInfo: vi.fn(async () => staleReflow),
      fetchLiveRoomInfo: vi.fn(async () => ({
        success: false,
        code: 500,
        message: '抖音数据获取失败'
      }))
    })

    expect(liveData).toBe(staleReflow)
  })

  it('preserves reflow web_rid when fresh web enter data omits it', async () => {
    const liveData = await fetchDouyinLiveDataFromReflow({
      roomId: '7644877342036544302',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      fetchReflowInfo: vi.fn(async () => ({
        data: {
          room: {
            id_str: '7644877342036544302',
            owner: {
              web_rid: '170812596736'
            }
          }
        }
      })),
      fetchLiveRoomInfo: vi.fn(async () => ({
        data: {
          data: [{
            id_str: '7644888287487773491',
            status: 2,
            stream_url: {
              flv_pull_url: {
                FULL_HD1: 'https://pull-flv.example.com/fresh.flv'
              }
            }
          }]
        }
      }))
    })

    expect(getDouyinLiveWebRid(liveData)).toBe('170812596736')
  })

  it('treats stale reflow stream URLs as offline when room status is not live', () => {
    const room = {
      status: 4,
      stream_url: {
        flv_pull_url: {
          FULL_HD1: 'http://pull-flv.example.com/stale.flv'
        }
      }
    }

    expect(getDouyinLiveStatus({ data: { room } })).toBe(4)
    expect(selectDouyinLiveStream({ data: { room } })).toEqual({
      url: 'http://pull-flv.example.com/stale.flv',
      format: 'flv',
      quality: 'FULL_HD1'
    })
    expect(isDouyinLiveStatusActive({ data: { room } })).toBe(false)
  })

  it('returns undefined when no playable stream exists', () => {
    expect(selectDouyinLiveStream({ stream_url: {} }, 'auto')).toBeUndefined()
  })

  it('normalizes live record seconds and quality with safe defaults', () => {
    expect(normalizeDouyinLiveRecordSeconds(0)).toBe(10)
    expect(normalizeDouyinLiveRecordSeconds(6)).toBe(6)
    expect(normalizeDouyinLiveRecordSeconds(3600)).toBe(120)
    expect(normalizeDouyinLiveQuality('HD1')).toBe('HD1')
    expect(normalizeDouyinLiveQuality('bad')).toBe('auto')
  })

  it('builds ffmpeg record headers without Cookie', () => {
    expect(buildDouyinLiveRecordHeaders({ userAgent: 'Mozilla/5.0', cookie: 'ttwid=test' })).toEqual({
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://live.douyin.com'
    })
  })

  it('sanitizes record header values before passing them to ffmpeg', () => {
    expect(buildDouyinLiveRecordHeaders({
      userAgent: 'Mozilla/5.0\r\nCookie: injected',
      cookie: 'ttwid=test'
    })).toEqual({
      'User-Agent': 'Mozilla/5.0 Cookie: injected',
      Referer: 'https://live.douyin.com'
    })
  })

  it('builds the room_id reflow info URL without needing web_rid', () => {
    const url = buildDouyinLiveReflowInfoUrl('7644877342036544302')

    expect(url).toContain('https://webcast.amemv.com/webcast/room/reflow/info/?')
    expect(url).toContain('room_id=7644877342036544302')
    expect(url).toContain('app_id=1128')
  })

  it('builds the live web enter URL with web_rid and optional room_id_str', () => {
    const url = buildDouyinLiveWebEnterInfoUrl('7644877342036544302', '170812596736')

    expect(url).toContain('https://live.douyin.com/webcast/room/web/enter/?')
    expect(url).toContain('web_rid=170812596736')
    expect(url).toContain('room_id_str=7644877342036544302')
    expect(url).toContain('app_name=douyin_web')
  })

  it('builds an ffmpeg record command with duration, headers, input, and output path', () => {
    const command = buildDouyinLiveRecordCommand({
      streamUrl: 'https://pull-flv.example.com/fullhd.flv',
      outputPath: '/tmp/douyin live.mp4',
      durationSeconds: 10,
      headers: buildDouyinLiveRecordHeaders({
        userAgent: 'Mozilla/5.0',
        cookie: 'ttwid=test'
      })
    })

    expect(command).toContain('-t 10')
    expect(command).toContain('-user_agent "Mozilla/5.0"')
    expect(command).toContain('-referer "https://live.douyin.com"')
    expect(command).not.toContain('-headers')
    expect(command).not.toContain('Cookie:')
    expect(command).toContain('-i "https://pull-flv.example.com/fullhd.flv"')
    expect(command).toContain('"/tmp/douyin live.mp4"')
    expect(command).toContain('-c copy')
  })

  it('builds a single-line ffmpeg command so Windows cmd does not split HTTP options', () => {
    const command = buildDouyinLiveRecordCommand({
      streamUrl: 'https://pull-flv.example.com/fullhd.flv',
      outputPath: '/tmp/douyin live.mp4',
      durationSeconds: 10,
      headers: buildDouyinLiveRecordHeaders({
        userAgent: 'Mozilla/5.0\r\nX-Injected: yes',
        cookie: 'ttwid=test'
      })
    })

    expect(command).not.toContain('\r')
    expect(command).not.toContain('\n')
    expect(command).toContain('-user_agent "Mozilla/5.0 X-Injected: yes"')
    expect(command).not.toContain('Cookie:')
  })
})
