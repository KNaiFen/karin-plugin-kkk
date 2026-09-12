import { describe, expect, it } from 'vitest'

import { extractDouyinLiveRoomId, parseDouyinLongLink } from '../src/platform/douyin/getID'

describe('Douyin link id helpers', () => {
  it('extracts live room id from direct live.douyin.com links', () => {
    expect(extractDouyinLiveRoomId('https://live.douyin.com/642667023283')).toBe('642667023283')
    expect(extractDouyinLiveRoomId('https://live.douyin.com/642667023283/')).toBe('642667023283')
    expect(extractDouyinLiveRoomId('https://live.douyin.com/642667023283?foo=bar')).toBe('642667023283')
  })

  it('parses direct live.douyin.com links as live room detail', () => {
    expect(parseDouyinLongLink('https://live.douyin.com/717267717594')).toEqual({
      type: 'live_room_detail',
      room_id: '717267717594'
    })
  })

  it('parses webcast reflow live links with room id and sec uid', () => {
    expect(parseDouyinLongLink('https://webcast.amemv.com/douyin/webcast/reflow/7644877342036544302?sec_user_id=MS4wLjABAAAAnWAF5QzclZOdkMFbCm2_mFDrTsHjtKvhPW_Rlxz1UrCfEjqW1RnSap9f9yhyKTG7')).toEqual({
      type: 'live_room_detail',
      room_id: '7644877342036544302',
      sec_uid: 'MS4wLjABAAAAnWAF5QzclZOdkMFbCm2_mFDrTsHjtKvhPW_Rlxz1UrCfEjqW1RnSap9f9yhyKTG7',
      source: 'webcast_reflow'
    })
  })
})
