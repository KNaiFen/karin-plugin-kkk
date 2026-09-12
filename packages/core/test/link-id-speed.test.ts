import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  axiosGet: vi.fn(),
  networkGetLongLink: vi.fn(),
  config: {
    cookies: {
      douyin: '',
      bilibili: '',
      kuaishou: '',
      xiaohongshu: '',
      tiktok: '',
      x: '',
      heybox: '',
      zhihu: '',
      tieba: '',
      weibo: ''
    },
    request: {
      'User-Agent': 'Unit Test UA',
      proxy: { switch: false },
      timeout: 10000,
      headers: {}
    }
  },
  convertAvToBv: vi.fn()
}))

vi.mock('node-karin/axios', () => ({
  default: {
    get: state.axiosGet
  }
}))

vi.mock('node-karin', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  }
}))

vi.mock('@ikenxuan/amagi', () => ({
  default: Object.assign(vi.fn(() => ({
    reload: vi.fn(),
    bilibili: {
      fetcher: {}
    },
    douyin: {
      fetcher: {}
    },
    kuaishou: {
      fetcher: {}
    },
    xiaohongshu: {
      fetcher: {}
    }
  })), {
    bilibiliFetcher: {
      convertAvToBv: state.convertAvToBv
    }
  })
}))

vi.mock('@/module/utils/Config', () => ({
  Config: state.config
}))

vi.mock('@/module', () => {
  class MockNetworks {
    getLongLink = (...args: unknown[]) => state.networkGetLongLink(...args)
  }

  return {
    Networks: MockNetworks
  }
})

const { getBilibiliID } = await import('../src/platform/bilibili/getID')
const { getDouyinID } = await import('../src/platform/douyin/getID')
const { getHeyboxID } = await import('../src/platform/heybox/getID')
const { getKuaishouID } = await import('../src/platform/kuaishou/getID')
const { getTiebaID } = await import('../src/platform/tieba/getID')
const { getWeiboID } = await import('../src/platform/weibo/getID')
const { getXID } = await import('../src/platform/x/getID')
const { getXiaohongshuID, parseXiaohongshuLongLink } = await import('../src/platform/xiaohongshu/getID')
const { getZhihuID } = await import('../src/platform/zhihu/getID')

describe('direct link id parsing hot paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.convertAvToBv.mockResolvedValue({ data: { data: { bvid: 'BVconverted01' } } })
    state.networkGetLongLink.mockReset()
  })

  it('parses direct Bilibili video links without resolving redirects', async () => {
    await expect(getBilibiliID('https://www.bilibili.com/video/BV1YLVH6UEGa?p=2')).resolves.toEqual({
      type: 'one_video',
      bvid: 'BV1YLVH6UEGa',
      p: 2
    })

    expect(state.axiosGet).not.toHaveBeenCalled()
  })

  it('still resolves Bilibili short links through redirects', async () => {
    state.axiosGet.mockResolvedValue({
      request: {
        res: {
          responseUrl: 'https://www.bilibili.com/video/BV1YLVH6UEGa?p=1'
        }
      },
      config: {
        url: 'https://b23.tv/abc'
      }
    })

    await expect(getBilibiliID('https://b23.tv/abc')).resolves.toEqual({
      type: 'one_video',
      bvid: 'BV1YLVH6UEGa',
      p: 1
    })
    expect(state.axiosGet).toHaveBeenCalledOnce()
  })

  it('parses direct Douyin work and live links without resolving redirects', async () => {
    await expect(getDouyinID({} as any, 'https://www.douyin.com/video/7578099589354425613')).resolves.toMatchObject({
      type: 'one_work',
      aweme_id: '7578099589354425613',
      resolvedUrl: 'https://www.douyin.com/video/7578099589354425613',
      typeHint: 'video'
    })
    await expect(getDouyinID({} as any, 'https://live.douyin.com/717267717594')).resolves.toEqual({
      type: 'live_room_detail',
      room_id: '717267717594'
    })

    expect(state.axiosGet).not.toHaveBeenCalled()
  })

  it('still resolves Douyin short links through redirects', async () => {
    state.axiosGet.mockResolvedValue({
      request: {
        res: {
          responseUrl: 'https://www.douyin.com/video/7578099589354425613'
        }
      }
    })

    await expect(getDouyinID({} as any, 'https://v.douyin.com/abc/')).resolves.toMatchObject({
      type: 'one_work',
      aweme_id: '7578099589354425613',
      resolvedUrl: 'https://www.douyin.com/video/7578099589354425613',
      typeHint: 'video'
    })
    expect(state.axiosGet).toHaveBeenCalledOnce()
  })

  it('parses direct Xiaohongshu note links with xsec token without resolving redirects', async () => {
    await expect(getXiaohongshuID('https://www.xiaohongshu.com/explore/65abc123?xsec_token=xhs-token')).resolves.toEqual({
      type: 'note',
      note_id: '65abc123',
      xsec_token: 'xhs-token'
    })

    expect(state.axiosGet).not.toHaveBeenCalled()
  })

  it('parses direct Xiaohongshu note links on allowed subdomains', async () => {
    await expect(getXiaohongshuID('https://creator.xiaohongshu.com/explore/65abc123?xsec_token=xhs-token')).resolves.toEqual({
      type: 'note',
      note_id: '65abc123',
      xsec_token: 'xhs-token'
    })

    expect(state.networkGetLongLink).not.toHaveBeenCalled()
  })

  it('keeps resolving Xiaohongshu links without xsec token for compatibility', async () => {
    state.networkGetLongLink.mockResolvedValue('https://www.xiaohongshu.com/explore/65abc123?xsec_token=redirect-token')

    await expect(getXiaohongshuID('https://www.xiaohongshu.com/explore/65abc123')).resolves.toEqual({
      type: 'note',
      note_id: '65abc123',
      xsec_token: 'redirect-token'
    })
    expect(state.networkGetLongLink).toHaveBeenCalledOnce()
    expect(state.axiosGet).not.toHaveBeenCalled()
  })

  it('rejects Xiaohongshu links when redirect still does not provide xsec token', async () => {
    state.networkGetLongLink.mockResolvedValue('https://www.xiaohongshu.com/explore/65abc123')

    await expect(getXiaohongshuID('https://www.xiaohongshu.com/explore/65abc123')).rejects.toThrow(
      '无法从链接中提取有效的小红书 xsec_token'
    )
    expect(state.networkGetLongLink).toHaveBeenCalledOnce()
    expect(state.axiosGet).not.toHaveBeenCalled()
  })

  it('parses direct Kuaishou short-video links without resolving redirects', async () => {
    await expect(getKuaishouID('https://www.kuaishou.com/short-video/3x8s2qmteama6ha')).resolves.toEqual({
      type: 'one_work',
      photoId: '3x8s2qmteama6ha'
    })

    expect(state.networkGetLongLink).not.toHaveBeenCalled()
    expect(state.axiosGet).not.toHaveBeenCalled()
  })

  it('resolves new Xiaohongshu xhslink.cn short links through redirect guard', async () => {
    state.networkGetLongLink.mockResolvedValue('https://www.xiaohongshu.com/discovery/item/6a7df5b50000000025000cb6?xsec_token=redirect-token%3D')

    await expect(getXiaohongshuID('http://xhslink.cn/o/1wPOQ9a9RyI')).resolves.toEqual({
      type: 'note',
      note_id: '6a7df5b50000000025000cb6',
      xsec_token: 'redirect-token='
    })

    expect(state.networkGetLongLink).toHaveBeenCalledOnce()
    expect(state.axiosGet).not.toHaveBeenCalled()
  })

  it('still resolves Xiaohongshu short links on allowed xhslink subdomains', async () => {
    state.networkGetLongLink.mockResolvedValue('https://www.xiaohongshu.com/explore/65abc123?xsec_token=redirect-token')

    await expect(getXiaohongshuID('https://share.xhslink.com/o/2fKOpvaOc9C')).resolves.toEqual({
      type: 'note',
      note_id: '65abc123',
      xsec_token: 'redirect-token'
    })

    expect(state.networkGetLongLink).toHaveBeenCalledOnce()

    state.networkGetLongLink.mockClear()
    await expect(getXiaohongshuID('http://share.xhslink.cn/o/1wPOQ9a9RyI')).resolves.toEqual({
      type: 'note',
      note_id: '65abc123',
      xsec_token: 'redirect-token'
    })
    expect(state.networkGetLongLink).toHaveBeenCalledOnce()
  })

  it('parses Xiaohongshu explore redirects that carry target_note_id in the query', () => {
    expect(parseXiaohongshuLongLink(
      'https://www.xiaohongshu.com/explore?xsec_token=redirect-token&target_note_id=6a5decd0000000000101eb97'
    )).toEqual({
      type: 'note',
      note_id: '6a5decd0000000000101eb97',
      xsec_token: 'redirect-token'
    })
  })

  it('parses Xiaohongshu target_note_id links without a protocol', () => {
    expect(parseXiaohongshuLongLink(
      'www.xiaohongshu.com/explore?target_note_id=6a5decd0000000000101eb97&xsec_token=redirect-token'
    )).toEqual({
      type: 'note',
      note_id: '6a5decd0000000000101eb97',
      xsec_token: 'redirect-token'
    })
  })

  it('does not accept target_note_id from non-Xiaohongshu hosts', () => {
    expect(parseXiaohongshuLongLink(
      'https://example.com/explore?target_note_id=6a5decd0000000000101eb97&xsec_token=redirect-token'
    )).toEqual({ type: 'unknown' })
  })

  it('rejects Xiaohongshu domains that only occur outside the hostname', async () => {
    const invalidLinks = [
      'https://evil.example/xiaohongshu.com/explore/65abc123?xsec_token=xhs-token',
      'https://evil.example/?next=https://www.xiaohongshu.com/explore/65abc123&xsec_token=xhs-token',
      'https://xiaohongshu.com@evil.example/explore/65abc123?xsec_token=xhs-token',
      'https://www.xiaohongshu.com.evil.example/explore/65abc123?xsec_token=xhs-token',
      'https://evilxiaohongshu.com/explore/65abc123?xsec_token=xhs-token',
      'https://invalid..xiaohongshu.com/explore/65abc123?xsec_token=xhs-token',
      'https://xhslink.com.evil.example/o/2fKOpvaOc9C',
      'http://xhslink.cn.evil.example/o/1wPOQ9a9RyI'
    ]

    for (const link of invalidLinks) {
      expect(parseXiaohongshuLongLink(link), link).toEqual({ type: 'unknown' })
      await expect(getXiaohongshuID(link, false), link).rejects.toThrow('无法从链接中提取小红书笔记ID')
    }

    expect(state.networkGetLongLink).not.toHaveBeenCalled()
  })

  it('resolves Xiaohongshu xhslink short links after explore redirects drop the path id', async () => {
    state.networkGetLongLink.mockResolvedValue(
      'https://www.xiaohongshu.com/explore?xsec_token=redirect-token&target_note_id=6a5decd0000000000101eb97'
    )

    await expect(getXiaohongshuID('http://xhslink.com/o/9nPpqdXq2j2', false)).resolves.toEqual({
      type: 'note',
      note_id: '6a5decd0000000000101eb97',
      xsec_token: 'redirect-token'
    })

    expect(state.networkGetLongLink).toHaveBeenCalledOnce()
    expect(state.axiosGet).not.toHaveBeenCalled()
  })

  it('restores xsec token from nested redirectPath Xiaohongshu links', async () => {
    await expect(getXiaohongshuID(
      'https://www.xiaohongshu.com/404?redirectPath='
      + encodeURIComponent('/discovery/item/69f1eb8b000000003601c580?xsec_token=redirect-token')
    )).resolves.toEqual({
      type: 'note',
      note_id: '69f1eb8b000000003601c580',
      xsec_token: 'redirect-token'
    })

    expect(state.networkGetLongLink).not.toHaveBeenCalled()
  })

  it('parses direct Heybox links without resolving redirects', async () => {
    await expect(getHeyboxID('https://www.xiaoheihe.cn/app/bbs/link/4a9471857e40')).resolves.toEqual({
      type: 'link',
      link_id: '4a9471857e40',
      url: 'https://www.xiaoheihe.cn/app/bbs/link/4a9471857e40'
    })

    expect(state.axiosGet).not.toHaveBeenCalled()
  })

  it('parses direct Zhihu answer links without resolving redirects', async () => {
    await expect(getZhihuID('https://www.zhihu.com/question/19550283/answer/122329247')).resolves.toEqual({
      type: 'answer',
      url: 'https://www.zhihu.com/question/19550283/answer/122329247',
      questionId: '19550283',
      answerId: '122329247'
    })

    expect(state.axiosGet).not.toHaveBeenCalled()
  })

  it('parses direct Tieba post links without resolving redirects', async () => {
    await expect(getTiebaID('https://tieba.baidu.com/p/1234567890?pid=998&cid=776')).resolves.toEqual({
      type: 'post',
      tid: '1234567890',
      pid: '998',
      cid: '776',
      url: 'https://tieba.baidu.com/p/1234567890?pid=998&cid=776'
    })

    expect(state.axiosGet).not.toHaveBeenCalled()
  })

  it('parses direct Weibo post links without resolving redirects', async () => {
    await expect(getWeiboID('https://m.weibo.cn/status/Q0KtXh6z2')).resolves.toEqual({
      type: 'status',
      statusId: 'Q0KtXh6z2',
      url: 'https://m.weibo.cn/status/Q0KtXh6z2'
    })

    expect(state.axiosGet).not.toHaveBeenCalled()
  })

  it('parses direct desktop Weibo uid/bid links without resolving redirects', async () => {
    await expect(getWeiboID('https://weibo.com/5955106173/R2YQog7Pb')).resolves.toEqual({
      type: 'status',
      statusId: 'R2YQog7Pb',
      url: 'https://weibo.com/5955106173/R2YQog7Pb'
    })

    expect(state.axiosGet).not.toHaveBeenCalled()
  })

  it('parses direct Weibo show links without resolving redirects', async () => {
    await expect(getWeiboID('https://video.weibo.com/show?fid=1034:5145615399845897')).resolves.toEqual({
      type: 'video_show',
      fid: '1034:5145615399845897',
      url: 'https://video.weibo.com/show?fid=1034:5145615399845897'
    })

    expect(state.axiosGet).not.toHaveBeenCalled()
  })

  it('parses direct X status links without resolving redirects', async () => {
    await expect(getXID('https://x.com/cakedochi/status/2050564108114899179')).resolves.toEqual({
      type: 'status',
      statusId: '2050564108114899179',
      screenName: 'cakedochi',
      url: 'https://x.com/cakedochi/status/2050564108114899179'
    })

    await expect(getXID('https://twitter.com/cakedochi/status/2050564108114899179/video/1')).resolves.toEqual({
      type: 'status',
      statusId: '2050564108114899179',
      screenName: 'cakedochi',
      url: 'https://twitter.com/cakedochi/status/2050564108114899179/video/1'
    })

    expect(state.axiosGet).not.toHaveBeenCalled()
  })
})
