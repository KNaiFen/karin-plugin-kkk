import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  axiosGet: vi.fn(),
  axiosPost: vi.fn(),
  config: {
    cookies: {
      weibo: ''
    },
    request: {
      'User-Agent': 'Unit Test UA',
      proxy: { switch: false },
      timeout: 10000,
      headers: {}
    }
  }
}))

vi.mock('node:dns/promises', () => ({
  default: {
    lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }])
  }
}))

vi.mock('node-karin/axios', () => ({
  default: {
    get: state.axiosGet,
    post: state.axiosPost
  }
}))

vi.mock('node-karin', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  }
}))

vi.mock('@/module', () => ({
  baseHeaders: {
    'User-Agent': 'Unit Test UA'
  },
  buildConfiguredRequestOptions: () => ({
    timeout: 10000,
    headers: {}
  })
}))

vi.mock('@/module/utils/Config', () => ({
  Config: state.config
}))

vi.mock('@/module/utils/GuestCookieManager', () => ({
  guestCookieManager: {
    refreshPlatform: vi.fn(async () => false)
  }
}))

const { fetchWeiboDetail } = await import('../src/platform/weibo/api')

describe('Weibo API parsing', () => {
  it('keeps weibo cookies for page api hosts but strips them for sinaimg media hosts', async () => {
    const { buildWeiboCredentialHeaders } = await import('../src/platform/weibo/api')
    expect(buildWeiboCredentialHeaders('https://weibo.com/1980237443/Qeq3Dpa2b').Cookie).toBe('')
    state.config.cookies.weibo = 'SUB=abc; SUBP=def'

    expect(buildWeiboCredentialHeaders('https://weibo.com/1980237443/Qeq3Dpa2b').Cookie).toContain('SUB=abc')
    expect(buildWeiboCredentialHeaders('https://wx1.sinaimg.cn/large/a.jpg').Cookie).toBeUndefined()
    expect(buildWeiboCredentialHeaders('https://wx1.sinaimg.cn/large/a.jpg').Referer).toBe('https://weibo.com')
    expect(buildWeiboCredentialHeaders('https://m.weibo.cn/status/Qeq3Dpa2b').Referer).toBe('https://weibo.com')
  })

  it('keeps parsing legacy direct status payload with pics and page_pic cover', async () => {
    state.axiosGet.mockResolvedValue({
      data: {
        id: '5234367615996775',
        idstr: '5234367615996775',
        mblogid: 'Qeq3Dpa2b',
        created_at: 'Tue Nov 18 16:19:12 +0800 2025',
        source: '微博网页版',
        region_name: '发布于 河南',
        text: '主微博第一行<br />主微博第二行',
        text_raw: '主微博第一行\n主微博第二行',
        reposts_count: 30,
        comments_count: 2,
        attitudes_count: 21,
        user: {
          id: 1980237443,
          idstr: '1980237443',
          screen_name: '青冥童子',
          profile_image_url: 'https://example.com/author.jpg'
        },
        pics: [
          {
            large: {
              url: 'https://example.com/post-image.jpg'
            }
          }
        ],
        page_info: {
          page_title: '微博视频',
          page_pic: {
            url: 'https://example.com/post-cover.jpg'
          },
          media_info: {
            playback_list: [
              {
                play_info: {
                  url: 'https://example.com/post-video-720.mp4'
                }
              },
              {
                play_info: {
                  url: 'https://example.com/post-video-540.mp4'
                }
              }
            ]
          }
        }
      }
    })

    await expect(fetchWeiboDetail({
      type: 'status',
      statusId: 'Qeq3Dpa2b',
      url: 'https://weibo.com/1980237443/Qeq3Dpa2b'
    })).resolves.toMatchObject({
      type: 'status',
      status: {
        bid: 'Qeq3Dpa2b',
        text: '主微博第一行\n主微博第二行',
        images: ['https://example.com/post-image.jpg'],
        video: {
          url: 'https://example.com/post-video-720.mp4',
          cover: 'https://example.com/post-cover.jpg'
        }
      }
    })
  })

  it('parses wrapped status detail with pic_infos, mix media and repost content', async () => {
    state.axiosGet.mockResolvedValue({
      data: {
        ok: 1,
        data: {
          id: '5234367615996775',
          idstr: '5234367615996775',
          mblogid: 'Qeq3Dpa2b',
          created_at: 'Tue Nov 18 16:19:12 +0800 2025',
          source: '微博网页版',
          region_name: '发布于 河南',
          text: '主微博第一行<br />主微博第二行',
          longTextContent_raw: '主微博第一行\n主微博第二行\n长文补充',
          reposts_count: 30,
          comments_count: 2,
          attitudes_count: 21,
          user: {
            id: 1980237443,
            idstr: '1980237443',
            screen_name: '青冥童子',
            profile_image_url: 'https://example.com/author.jpg'
          },
          pic_infos: {
            pic1: {
              largest: {
                url: 'https://example.com/post-image.jpg'
              }
            }
          },
          mix_media_info: {
            items: [
              {
                type: 'pic',
                data: {
                  original: {
                    url: 'https://example.com/mix-image.jpg'
                  }
                }
              }
            ]
          },
          page_info: {
            page_title: '微博视频',
            pic_info: {
              pic_big: {
                url: 'https://example.com/post-cover.jpg'
              }
            },
            media_info: {
              playback_list: [
                {
                  play_info: {
                    url: 'https://example.com/post-video-720.mp4'
                  }
                },
                {
                  play_info: {
                    url: 'https://example.com/post-video-540.mp4'
                  }
                }
              ]
            }
          },
          retweeted_status: {
            id: '5234001406855704',
            idstr: '5234001406855704',
            mblogid: 'QegwYsLtS',
            created_at: 'Mon Nov 17 16:04:01 +0800 2025',
            text: '转发原文<br />第二行',
            text_raw: '转发原文\n第二行',
            reposts_count: 1670,
            comments_count: 386,
            attitudes_count: 9890,
            user: {
              id: 5819071204,
              idstr: '5819071204',
              screen_name: '野比大雄',
              profile_image_url: 'https://example.com/repost-author.jpg'
            },
            pic_infos: {
              repost1: {
                large: {
                  url: 'https://example.com/repost-image.jpg'
                }
              }
            }
          }
        }
      }
    })

    await expect(fetchWeiboDetail({
      type: 'status',
      statusId: 'Qeq3Dpa2b',
      url: 'https://weibo.com/1980237443/Qeq3Dpa2b'
    })).resolves.toMatchObject({
      type: 'status',
      url: 'https://weibo.com/1980237443/Qeq3Dpa2b',
      status: {
        id: '5234367615996775',
        bid: 'Qeq3Dpa2b',
        text: '主微博第一行\n主微博第二行\n长文补充',
        source: '微博网页版',
        regionName: '河南',
        author: {
          name: '青冥童子',
          avatar: 'https://example.com/author.jpg'
        },
        images: [
          'https://example.com/post-image.jpg',
          'https://example.com/mix-image.jpg'
        ],
        video: {
          url: 'https://example.com/post-video-720.mp4',
          cover: 'https://example.com/post-cover.jpg'
        },
        stats: {
          repost: 30,
          comment: 2,
          like: 21
        },
        repostedStatus: {
          bid: 'QegwYsLtS',
          text: '转发原文\n第二行',
          images: ['https://example.com/repost-image.jpg'],
          author: {
            name: '野比大雄'
          }
        }
      }
    })
  })

  it('parses mix media image variants by category or data shape', async () => {
    state.axiosGet.mockResolvedValue({
      data: {
        ok: 1,
        data: {
          id: '5234367615996775',
          idstr: '5234367615996775',
          mblogid: 'Qeq3Dpa2b',
          created_at: 'Tue Nov 18 16:19:12 +0800 2025',
          text_raw: '主微博第一行',
          user: {
            id: 1980237443,
            idstr: '1980237443',
            screen_name: '青冥童子'
          },
          mix_media_info: {
            items: [
              {
                category: 'image',
                data: {
                  pic_info: {
                    pic_big: {
                      url: 'https://example.com/category-image.jpg'
                    }
                  }
                }
              },
              {
                data: {
                  original: {
                    url: 'https://example.com/shape-image.jpg'
                  }
                }
              },
              {
                type: 'video',
                data: {
                  original: {
                    url: 'https://example.com/should-ignore.jpg'
                  }
                }
              }
            ]
          }
        }
      }
    })

    await expect(fetchWeiboDetail({
      type: 'status',
      statusId: 'Qeq3Dpa2b',
      url: 'https://weibo.com/1980237443/Qeq3Dpa2b'
    })).resolves.toMatchObject({
      type: 'status',
      status: {
        bid: 'Qeq3Dpa2b',
        images: [
          'https://example.com/category-image.jpg',
          'https://example.com/shape-image.jpg'
        ]
      }
    })
  })

  it('deduplicates repeated Weibo image variants from pics and pic_infos', async () => {
    state.axiosGet.mockResolvedValue({
      data: {
        ok: 1,
        data: {
          id: '5234367615996775',
          idstr: '5234367615996775',
          mblogid: 'Qeq3Dpa2b',
          created_at: 'Tue Nov 18 16:19:12 +0800 2025',
          text_raw: '主微博第一行',
          user: {
            id: 1980237443,
            idstr: '1980237443',
            screen_name: '青冥童子'
          },
          pics: [
            {
              url: 'https://wx1.sinaimg.cn/orj360/shared-image-a.jpg?foo=1',
              mw2000: {
                url: 'https://wx1.sinaimg.cn/mw2000/shared-image-a.jpg?foo=2'
              },
              large: {
                url: 'https://wx1.sinaimg.cn/large/shared-image-a.jpg?foo=3'
              },
              largest: {
                url: 'https://wx1.sinaimg.cn/large/shared-image-a.jpg?foo=4'
              }
            }
          ],
          pic_infos: {
            pic1: {
              original: {
                url: 'https://wx1.sinaimg.cn/original/shared-image-a.jpg?foo=5'
              },
              pic_big: {
                url: 'https://wx1.sinaimg.cn/large/shared-image-a.jpg?foo=6'
              }
            },
            pic2: {
              mw690: {
                url: 'https://wx2.sinaimg.cn/mw690/shared-image-b.jpg'
              },
              large: {
                url: 'https://wx2.sinaimg.cn/large/shared-image-b.jpg'
              }
            }
          }
        }
      }
    })

    await expect(fetchWeiboDetail({
      type: 'status',
      statusId: 'Qeq3Dpa2b',
      url: 'https://weibo.com/1980237443/Qeq3Dpa2b'
    })).resolves.toMatchObject({
      type: 'status',
      status: {
        bid: 'Qeq3Dpa2b',
        images: [
          'https://wx1.sinaimg.cn/original/shared-image-a.jpg?foo=5',
          'https://wx2.sinaimg.cn/large/shared-image-b.jpg'
        ]
      }
    })
  })

  it('throws explicit error when status api returns login payload', async () => {
    state.axiosGet.mockResolvedValue({
      data: {
        ok: -100,
        url: 'https://weibo.com/login.php?url=https%3A%2F%2Fweibo.com%2F5955106173%2FR2YQog7Pb'
      }
    })

    await expect(fetchWeiboDetail({
      type: 'status',
      statusId: 'R2YQog7Pb',
      url: 'https://weibo.com/5955106173/R2YQog7Pb'
    })).rejects.toThrow('微博详情接口要求登录')
  })

  it('normalizes mobile weibo urls to desktop status urls in fetched detail', async () => {
    state.axiosGet.mockResolvedValue({
      data: {
        ok: 1,
        data: {
          id: '5234367615996775',
          idstr: '5234367615996775',
          mblogid: 'R34sAiuo6',
          created_at: 'Tue Nov 18 16:19:12 +0800 2025',
          text_raw: '主微博第一行',
          user: {
            id: 5177612153,
            idstr: '5177612153',
            screen_name: '青冥童子'
          }
        }
      }
    })

    await expect(fetchWeiboDetail({
      type: 'status',
      statusId: 'R34sAiuo6',
      url: 'https://m.weibo.cn/status/R34sAiuo6'
    })).resolves.toMatchObject({
      type: 'status',
      url: 'https://weibo.com/5177612153/R34sAiuo6',
      status: {
        bid: 'R34sAiuo6'
      }
    })
  })

  it('parses video show detail', async () => {
    state.axiosPost.mockResolvedValue({
      data: {
        data: {
          Component_Play_Playinfo: {
            title: '微博视频标题',
            text: '微博视频简介',
            name: '微博视频作者',
            avatar: 'https://example.com/show-author.jpg',
            description: '视频作者简介',
            video_url: 'https://example.com/show-video.mp4',
            cover_url: 'https://example.com/show-cover.jpg',
            real_date: 1763453952
          }
        }
      }
    })

    await expect(fetchWeiboDetail({
      type: 'video_show',
      fid: '1034:5145615399845897',
      url: 'https://video.weibo.com/show?fid=1034:5145615399845897'
    })).resolves.toMatchObject({
      type: 'video_show',
      url: 'https://video.weibo.com/show?fid=1034:5145615399845897',
      show: {
        fid: '1034:5145615399845897',
        title: '微博视频标题',
        text: '微博视频简介',
        author: {
          name: '微博视频作者',
          avatar: 'https://example.com/show-author.jpg',
          description: '视频作者简介'
        },
        video: {
          url: 'https://example.com/show-video.mp4',
          cover: 'https://example.com/show-cover.jpg'
        }
      }
    })
  })
})
