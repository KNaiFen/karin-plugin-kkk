import { describe, expect, it } from 'vitest'

import {
  collectBilibiliCdnBackupUrls,
  isBilibiliMcdnUrl,
  preferBilibiliNonMcdnUrls,
  rewriteBilibiliCdnUrlCarrier
} from '../src/platform/bilibili/cdnSelector'

describe('Bilibili CDN selector', () => {
  it('detects root and subdomain low-priority CDN hosts', () => {
    expect(isBilibiliMcdnUrl('https://mcdn.bilivideo.cn/video.m4s')).toBe(true)
    expect(isBilibiliMcdnUrl('https://xy116x196x140x195xy.mcdn.bilivideo.cn:8082/video.m4s')).toBe(true)
    expect(isBilibiliMcdnUrl('https://xy12x34x56x78xy.pcdn.bilivideo.cn:8082/video.m4s')).toBe(true)
    expect(isBilibiliMcdnUrl('https://upos-sz-mirrorcoso1.bilivideo.com/video.m4s')).toBe(false)
  })

  it('prefers non-MCDN backup URL within the selected DASH stream', () => {
    const mcdnUrl = 'https://xy116x196x140x195xy.mcdn.bilivideo.cn:8082/v1/resource/video.m4s'
    const primaryUrl = 'https://cn-zjjh-ct-04-03.bilivideo.com/upgcxcode/video.m4s'
    const backupUrl = 'https://upos-sz-mirrorcoso1.bilivideo.com/upgcxcode/video.m4s'
    const stream = preferBilibiliNonMcdnUrls({
      id: 16,
      base_url: mcdnUrl,
      baseUrl: mcdnUrl,
      backup_url: [primaryUrl, backupUrl],
      backupUrl: [primaryUrl, backupUrl],
      width: 640,
      height: 360
    })

    expect(stream.base_url).toBe(primaryUrl)
    expect(stream.baseUrl).toBe(primaryUrl)
    expect(stream.backup_url).toEqual([backupUrl, mcdnUrl])
    expect(stream.backupUrl).toEqual([backupUrl, mcdnUrl])
  })

  it('prefers non-MCDN backup URL for durl streams', () => {
    const mcdnUrl = 'https://xy116x196x140x195xy.mcdn.bilivideo.cn:8082/v1/resource/video.mp4'
    const primaryUrl = 'https://cn-zjjh-ct-04-03.bilivideo.com/upgcxcode/video.mp4'

    const stream = rewriteBilibiliCdnUrlCarrier({
      url: mcdnUrl,
      backup_url: [primaryUrl]
    })

    expect(stream.url).toBe(primaryUrl)
    expect(stream.backup_url).toEqual([mcdnUrl])
  })

  it('keeps MCDN as fallback when no non-MCDN URL exists', () => {
    const mcdnUrl = 'https://xy116x196x140x195xy.mcdn.bilivideo.cn:8082/v1/resource/video.m4s'
    const backupMcdnUrl = 'https://xy42x177x91x30xy.mcdn.bilivideo.cn:8082/v1/resource/video.m4s'

    const stream = preferBilibiliNonMcdnUrls({
      base_url: mcdnUrl,
      backup_url: [backupMcdnUrl]
    })

    expect(stream.base_url).toBe(mcdnUrl)
    expect(stream.backup_url).toEqual([backupMcdnUrl])
  })

  it('puts regular CDN ahead of both PCDN and MCDN backups', () => {
    const pcdnUrl = 'https://xy12x34x56x78xy.pcdn.bilivideo.cn:8082/v1/resource/video.m4s'
    const mcdnUrl = 'https://xy116x196x140x195xy.mcdn.bilivideo.cn:8082/v1/resource/video.m4s'
    const primaryUrl = 'https://upos-sz-mirrorcoso1.bilivideo.com/upgcxcode/video.m4s'

    const stream = preferBilibiliNonMcdnUrls({
      base_url: pcdnUrl,
      backup_url: [mcdnUrl, primaryUrl]
    })

    expect(stream.base_url).toBe(primaryUrl)
    expect(stream.backup_url).toEqual([pcdnUrl, mcdnUrl])
  })

  it('deduplicates backup URLs across snake_case and camelCase fields', () => {
    const backupUrl = 'https://upos-sz-mirrorcoso1.bilivideo.com/upgcxcode/video.m4s'

    expect(collectBilibiliCdnBackupUrls({
      backup_url: [backupUrl],
      backupUrl: [backupUrl, 'https://cn-zjjh-ct-04-03.bilivideo.com/upgcxcode/video.m4s']
    })).toEqual([
      backupUrl,
      'https://cn-zjjh-ct-04-03.bilivideo.com/upgcxcode/video.m4s'
    ])
  })
})
