import { describe, expect, it } from 'vitest'

import {
  buildBilibiliLiveApiHeaders,
  buildBilibiliLivePlayInfoUrl,
  buildBilibiliLiveRecordHeaders,
  buildBilibiliLiveRecordCommand,
  normalizeBilibiliLiveQuality,
  normalizeBilibiliLiveRecordSeconds,
  parseBilibiliLiveApiObject,
  selectBilibiliLiveStream
} from '../src/platform/bilibili/liveRecorder'

const createPlayInfo = () => ({
  data: {
    playurl_info: {
      playurl: {
        stream: [
          {
            protocol_name: 'http_hls',
            format: [
              {
                format_name: 'ts',
                codec: [
                  {
                    codec_name: 'avc',
                    current_qn: 400,
                    base_url: '/live-bvc/example.m3u8?',
                    url_info: [
                      {
                        host: 'https://hls.example.com',
                        extra: 'token=hls'
                      }
                    ]
                  }
                ]
              }
            ]
          },
          {
            protocol_name: 'http_stream',
            format: [
              {
                format_name: 'flv',
                codec: [
                  {
                    codec_name: 'avc',
                    current_qn: 10000,
                    base_url: '/live-bvc/example.flv?',
                    url_info: [
                      {
                        host: 'https://flv.example.com',
                        extra: 'token=flv'
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    }
  }
})

describe('Bilibili live recorder helpers', () => {
  it('builds the getRoomPlayInfo URL with web playback parameters', () => {
    expect(buildBilibiliLivePlayInfoUrl(23058, 10000)).toBe(
      'https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?room_id=23058&protocol=0%2C1&format=0%2C1%2C2&codec=0&qn=10000&platform=web&ptype=8&dolby=5&panorama=1'
    )
  })

  it('selects HTTP-FLV AVC before HLS and joins host, base_url, and extra', () => {
    const stream = selectBilibiliLiveStream(createPlayInfo())

    expect(stream).toMatchObject({
      url: 'https://flv.example.com/live-bvc/example.flv?token=flv',
      protocolName: 'http_stream',
      formatName: 'flv',
      codecName: 'avc',
      currentQn: 10000
    })
  })

  it('parses JSON string responses returned by the live play info request', () => {
    const parsed = parseBilibiliLiveApiObject(JSON.stringify(createPlayInfo()), '测试接口')

    expect(selectBilibiliLiveStream(parsed)).toMatchObject({
      url: 'https://flv.example.com/live-bvc/example.flv?token=flv'
    })
  })

  it('falls back to HLS when HTTP-FLV is unavailable', () => {
    const playInfo = createPlayInfo()
    playInfo.data.playurl_info.playurl.stream = playInfo.data.playurl_info.playurl.stream.slice(0, 1)

    expect(selectBilibiliLiveStream(playInfo)?.url).toBe('https://hls.example.com/live-bvc/example.m3u8?token=hls')
  })

  it('returns undefined when no playable stream exists', () => {
    expect(selectBilibiliLiveStream({ data: { playurl_info: { playurl: { stream: [] } } } })).toBeUndefined()
  })

  it('normalizes live record seconds and quality with safe defaults', () => {
    expect(normalizeBilibiliLiveRecordSeconds(0)).toBe(10)
    expect(normalizeBilibiliLiveRecordSeconds(5)).toBe(5)
    expect(normalizeBilibiliLiveRecordSeconds(3600)).toBe(120)
    expect(normalizeBilibiliLiveQuality(12345)).toBe(10000)
    expect(normalizeBilibiliLiveQuality(250)).toBe(250)
  })

  it('builds API headers with Cookie so getRoomPlayInfo can return higher qualities', () => {
    expect(buildBilibiliLiveApiHeaders({ userAgent: 'Mozilla/5.0', cookie: 'SESSDATA=test' })).toEqual({
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://live.bilibili.com',
      Cookie: 'SESSDATA=test'
    })
  })

  it('sanitizes API header values before requesting live play info', () => {
    expect(buildBilibiliLiveApiHeaders({
      userAgent: 'Mozilla/5.0\r\nX-Injected: yes',
      cookie: 'SESSDATA=test\r\nX-Injected: yes'
    })).toEqual({
      'User-Agent': 'Mozilla/5.0 X-Injected: yes',
      Referer: 'https://live.bilibili.com',
      Cookie: 'SESSDATA=test X-Injected: yes'
    })
  })

  it('builds ffmpeg record headers without Cookie because stream pull does not need it', () => {
    expect(buildBilibiliLiveRecordHeaders({ userAgent: 'Mozilla/5.0', cookie: 'SESSDATA=test' })).toEqual({
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://live.bilibili.com'
    })
  })

  it('builds an ffmpeg record command with duration, headers, input, and output path', () => {
    const command = buildBilibiliLiveRecordCommand({
      streamUrl: 'https://flv.example.com/live-bvc/example.flv?token=flv',
      outputPath: '/tmp/live output.mp4',
      durationSeconds: 10,
      headers: buildBilibiliLiveRecordHeaders({
        userAgent: 'Mozilla/5.0',
        cookie: 'SESSDATA=test'
      })
    })

    expect(command).toContain('-t 10')
    expect(command).toContain('-user_agent "Mozilla/5.0"')
    expect(command).toContain('-referer "https://live.bilibili.com"')
    expect(command).not.toContain('-headers')
    expect(command).not.toContain('Cookie:')
    expect(command).toContain('-i "https://flv.example.com/live-bvc/example.flv?token=flv"')
    expect(command).toContain('"/tmp/live output.mp4"')
    expect(command).toContain('-c copy')
  })

  it('builds a single-line ffmpeg command so Windows cmd does not split HTTP options', () => {
    const command = buildBilibiliLiveRecordCommand({
      streamUrl: 'https://flv.example.com/live-bvc/example.flv?token=flv',
      outputPath: '/tmp/live output.mp4',
      durationSeconds: 10,
      headers: buildBilibiliLiveRecordHeaders({
        userAgent: 'Mozilla/5.0\r\nX-Injected: yes',
        cookie: 'SESSDATA=test'
      })
    })

    expect(command).not.toContain('\r')
    expect(command).not.toContain('\n')
    expect(command).toContain('-user_agent "Mozilla/5.0 X-Injected: yes"')
    expect(command).not.toContain('Cookie:')
  })
})
