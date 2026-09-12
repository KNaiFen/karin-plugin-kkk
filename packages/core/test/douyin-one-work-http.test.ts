import { beforeEach, describe, expect, it, vi } from 'vitest'

const DOUYIN_HTML_IOS_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1 Edg/132.0.0.0'
const DESKTOP_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

const state = vi.hoisted(() => ({
  cacheRoot: `/tmp/douyin-one-work-http-${process.pid}-${Math.random().toString(16).slice(2)}`,
  douyinCookie: '',
  axiosGet: vi.fn(),
  fetchDouyinHtmlWorkByBrowser: vi.fn(),
  parseWork: vi.fn(),
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn()
  },
  recordFailureTraceStep: vi.fn(),
  persistFailureTrace: vi.fn()
}))

vi.mock('node-karin', () => ({
  logger: state.logger
}))

vi.mock('node-karin/axios', () => ({
  default: {
    get: (...args: unknown[]) => state.axiosGet(...args)
  }
}))

vi.mock('@/module/utils/Config', () => ({
  Config: {
    request: {
      timeout: 30000,
      'User-Agent': DESKTOP_USER_AGENT,
      proxy: { switch: false },
      headers: {}
    },
    cookies: {
      get douyin () {
        return state.douyinCookie
      }
    }
  }
}))

vi.mock('@/module/utils/Common', () => ({
  Common: {
    tempDri: {
      cache: {
        root: `${state.cacheRoot}/`,
        parsedPost: `${state.cacheRoot}/parsed-post/`,
        workBundle: `${state.cacheRoot}/work-bundle/`,
        media: `${state.cacheRoot}/media/`,
        renderAssets: `${state.cacheRoot}/render-assets/`,
        derived: `${state.cacheRoot}/derived/`
      }
    }
  }
}))

vi.mock('@/module/utils/ErrorTrace', () => ({
  recordFailureTraceStep: (...args: unknown[]) => state.recordFailureTraceStep(...args),
  persistFailureTrace: (...args: unknown[]) => state.persistFailureTrace(...args)
}))

vi.mock('@/module/utils/amagiClient', () => ({
  amagiClient: {
    douyin: {
      fetcher: {
        parseWork: (...args: unknown[]) => state.parseWork(...args)
      }
    }
  }
}))

vi.mock('@/module/utils/DouyinBrowserFallback', () => ({
  fetchDouyinHtmlWorkByBrowser: (...args: unknown[]) => state.fetchDouyinHtmlWorkByBrowser(...args)
}))

const { fetchDouyinOneWork } = await import('../src/platform/douyin/oneWork')

const html = `
  <script>
    window._ROUTER_DATA = {"loaderData":{"video_(id)/page":{"videoInfoRes":{"item_list":[{"aweme_id":"7657916175708779685","aweme_type":0,"desc":"测试视频","preview_title":"测试视频","share_url":"https://m.douyin.com/share/video/7657916175708779685","create_time":1,"author":{"nickname":"作者","sec_uid":"sec","avatar_thumb":{"url_list":["https://example.com/avatar.jpg"]}},"statistics":{"digg_count":1,"comment_count":2,"collect_count":3,"share_count":4},"video":{"duration":1000,"width":720,"height":1280,"ratio":"720:1280","bit_rate":[{"FPS":25,"play_addr":{"url_list":["https://example.com/video.mp4"],"width":720,"height":1280}}],"cover":{"url_list":["https://example.com/cover.jpg"]}}}]}}}}
  </script>
`

const incompleteHtml = `
  <script>
    window._ROUTER_DATA = {"loaderData":{"video_(id)/page":{"videoInfoRes":{"item_list":[{"aweme_id":"7657916175708779685","aweme_type":0,"desc":"测试视频","preview_title":"测试视频","share_url":"https://m.douyin.com/share/video/7657916175708779685","create_time":1,"author":{"nickname":"作者","sec_uid":"sec","avatar_thumb":{"url_list":["https://example.com/avatar.jpg"]}},"statistics":{"digg_count":1,"comment_count":2,"collect_count":3,"share_count":4},"video":{"duration":1000,"width":720,"height":1280,"ratio":"720:1280","bit_rate":[],"play_addr":{"url_list":[],"width":720,"height":1280},"cover":{"url_list":["https://example.com/cover.jpg"]}}}]}}}}
  </script>
`

describe('fetchDouyinOneWork HTTP html request', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.douyinCookie = ''
    state.parseWork.mockRejectedValue(new Error('skip enrichment'))
    state.axiosGet.mockResolvedValue({
      data: html,
      request: {
        res: {
          responseUrl: 'https://m.douyin.com/share/video/7657916175708779685'
        }
      }
    })
  })

  it('uses mobile safari headers for html-first requests instead of the generic desktop UA', async () => {
    const result = await fetchDouyinOneWork({
      type: 'one_work',
      aweme_id: '7657916175708779685',
      typeHint: 'video',
      resolvedUrl: 'https://www.douyin.com/video/7657916175708779685'
    })

    expect(result.source).toBe('html')
    expect(state.fetchDouyinHtmlWorkByBrowser).not.toHaveBeenCalled()
    expect(state.axiosGet).toHaveBeenCalled()

    const [requestUrl, requestConfig] = state.axiosGet.mock.calls[0] as [string, { headers?: Record<string, string> }]
    expect(requestUrl).toBe('https://m.douyin.com/share/video/7657916175708779685')
    expect(requestConfig.headers?.['User-Agent']).toBe(DOUYIN_HTML_IOS_USER_AGENT)
    expect(requestConfig.headers?.['User-Agent']).not.toBe(DESKTOP_USER_AGENT)
    expect(requestConfig.headers?.Referer).toBe('https://www.douyin.com/')
  })

  it('skips enrichment when html-first result already has complete video data', async () => {
    await fetchDouyinOneWork({
      type: 'one_work',
      aweme_id: '7657916175708779685',
      typeHint: 'video',
      resolvedUrl: 'https://www.douyin.com/video/7657916175708779685'
    })

    expect(state.parseWork).not.toHaveBeenCalled()
    expect(state.persistFailureTrace).not.toHaveBeenCalled()
  })

  it('persists a recovered trace when html-first data is incomplete and enrichment fails', async () => {
    const awemeId = '7657916175708779686'
    state.axiosGet.mockResolvedValueOnce({
      data: incompleteHtml.replaceAll('7657916175708779685', awemeId),
      request: {
        res: {
          responseUrl: `https://m.douyin.com/share/video/${awemeId}`
        }
      }
    })

    await fetchDouyinOneWork({
      type: 'one_work',
      aweme_id: awemeId,
      typeHint: 'video',
      resolvedUrl: `https://www.douyin.com/video/${awemeId}`
    })

    expect(state.persistFailureTrace).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'recovered',
      extra: expect.objectContaining({
        platform: 'douyin',
        stage: 'one_work',
        recoveryStage: 'html-enrichment-degraded',
        awemeId
      })
    }))
    expect(state.parseWork).toHaveBeenCalledTimes(1)
  })

  it('uses the hidden page audio for note bgm without requesting detail enrichment', async () => {
    const awemeId = '7657916175708779688'
    const audioUrl = 'https://sf6-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/note-audio'
    const noteData = {
      loaderData: {
        'note_(id)/page': {
          videoInfoRes: {
            item_list: [{
              aweme_id: awemeId,
              aweme_type: 0,
              desc: '测试图文隐藏配乐',
              preview_title: '测试图文隐藏配乐',
              share_url: `https://www.douyin.com/note/${awemeId}`,
              create_time: 1,
              author: {
                nickname: '作者',
                sec_uid: 'sec',
                avatar_thumb: { url_list: ['https://example.com/avatar.jpg'] }
              },
              statistics: { digg_count: 1 },
              images: [{
                url_list: ['https://example.com/note.jpg'],
                clip_type: 2
              }],
              music: {
                title: '配乐',
                mid: 'music-id',
                status: 1
              }
            }]
          }
        }
      }
    }
    state.axiosGet.mockResolvedValueOnce({
      data: `
        <script>window._ROUTER_DATA = ${JSON.stringify(noteData)}</script>
        <audio class="hide" src="${audioUrl}?foo=1&amp;bar=2" loop></audio>
      `,
      request: {
        res: {
          responseUrl: `https://m.douyin.com/share/note/${awemeId}`
        }
      }
    })

    const result = await fetchDouyinOneWork({
      type: 'one_work',
      aweme_id: awemeId,
      typeHint: 'note',
      resolvedUrl: `https://www.douyin.com/note/${awemeId}`
    })

    expect(result.source).toBe('html')
    expect(result.enrichment).toBeNull()
    expect(result.workData.data.aweme_detail.music.play_url.url_list).toEqual([
      `${audioUrl}?foo=1&bar=2`
    ])
    expect(state.parseWork).not.toHaveBeenCalled()
    expect(state.persistFailureTrace).not.toHaveBeenCalled()
  })

  it('keeps the enrichment Cookie aligned with the current guest config', async () => {
    const awemeId = '7657916175708779687'
    const noteData = {
      loaderData: {
        'note_(id)/page': {
          videoInfoRes: {
            item_list: [{
              aweme_id: awemeId,
              aweme_type: 0,
              desc: '测试图文',
              preview_title: '测试图文',
              share_url: `https://www.douyin.com/note/${awemeId}`,
              create_time: 1,
              author: {
                nickname: '作者',
                sec_uid: 'sec',
                avatar_thumb: { url_list: ['https://example.com/avatar.jpg'] }
              },
              statistics: { digg_count: 1 },
              images: [{
                url_list: ['https://example.com/note.jpg'],
                clip_type: 2
              }],
              music: {
                title: '配乐',
                mid: 'music-id',
                status: 1
              }
            }]
          }
        }
      }
    }
    state.douyinCookie = 'ttwid=config-old; s_v_web_id=verify-old'
    state.axiosGet.mockResolvedValueOnce({
      data: `<script>window._ROUTER_DATA = ${JSON.stringify(noteData)}</script>`,
      headers: {
        'set-cookie': ['ttwid=transient-old; Path=/', 'transient_only=1; Path=/']
      },
      request: {
        res: {
          responseUrl: `https://m.douyin.com/share/note/${awemeId}`
        }
      }
    })

    let requestHeaders: Record<string, string> | undefined
    state.parseWork.mockImplementationOnce((_args: unknown, requestConfig: { headers?: Record<string, string> }) => {
      requestHeaders = requestConfig.headers
      return Promise.reject(new Error('enrichment unavailable'))
    })

    const result = await fetchDouyinOneWork({
      type: 'one_work',
      aweme_id: awemeId,
      typeHint: 'note',
      resolvedUrl: `https://www.douyin.com/note/${awemeId}`
    })

    expect(result.enrichment).toBeNull()
    expect(result.htmlWork.images).toHaveLength(1)
    expect({ ...requestHeaders }.Cookie).toContain('ttwid=config-old')
    expect({ ...requestHeaders }.Cookie).toContain('transient_only=1')
    expect({ ...requestHeaders }.Cookie).not.toContain('ttwid=transient-old')

    state.douyinCookie = 'ttwid=config-fresh; s_v_web_id=verify-fresh'
    expect({ ...requestHeaders }.Cookie).toContain('ttwid=config-fresh')
    expect({ ...requestHeaders }.Cookie).toContain('s_v_web_id=verify-fresh')
    expect({ ...requestHeaders }.Cookie).not.toContain('ttwid=config-old')
  })

  it('falls back to aweme detail enrichment for article pages before browser html fallback', async () => {
    state.axiosGet
      .mockResolvedValueOnce({
        data: '',
        headers: {
          'set-cookie': ['ttwid=share-cookie; Path=/; HttpOnly']
        },
        request: {
          res: {
            responseUrl: 'https://m.douyin.com/share/article/7636333515160484072'
          }
        }
      })
      .mockRejectedValue(new Error('article html unavailable'))
    state.parseWork.mockResolvedValueOnce({
      data: {
        aweme_detail: {
          aweme_id: '7636333515160484072',
          aweme_type: 163,
          desc: '纪念 #马克思',
          preview_title: '纪念 #马克思',
          share_url: 'https://www.douyin.com/article/7636333515160484072',
          create_time: 1710000500,
          author: {
            nickname: '文章作者',
            sec_uid: 'sec_article',
            avatar_thumb: {
              url_list: ['https://example.com/article-avatar.jpg']
            }
          },
          statistics: {},
          article_info: {
            article_title: '纪念 #马克思',
            article_content: '正文内容',
            fe_data: JSON.stringify({
              image_list: [],
              head_poster_list: {
                url_list: ['https://example.com/article-head-poster.jpg']
              }
            })
          },
          music: {
            play_url: {
              uri: 'https://sf6-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/ocDDUEfNEdvgY0FgpoIChSCfzWwZBhtsgQARAQ',
              url_list: ['https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/ocDDUEfNEdvgY0FgpoIChSCfzWwZBhtsgQARAQ']
            }
          }
        }
      }
    })

    const result = await fetchDouyinOneWork({
      type: 'one_work',
      aweme_id: '7636333515160484072',
      typeHint: 'article',
      resolvedUrl: 'https://www.douyin.com/article/7636333515160484072'
    })

    expect(result.source).toBe('html')
    expect(state.parseWork).toHaveBeenCalledTimes(1)
    expect(state.parseWork).toHaveBeenCalledWith(expect.objectContaining({
      aweme_id: '7636333515160484072',
      typeMode: 'strict'
    }), expect.objectContaining({
      headers: expect.objectContaining({
        Cookie: expect.stringContaining('ttwid=share-cookie'),
        Referer: 'https://www.douyin.com/article/7636333515160484072'
      })
    }))
    expect(state.fetchDouyinHtmlWorkByBrowser).not.toHaveBeenCalled()
    expect(result.htmlWork).toMatchObject({
      subtype: 'article',
      music: {
        playUrl: 'https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/ocDDUEfNEdvgY0FgpoIChSCfzWwZBhtsgQARAQ?__vid=7636333515160484072'
      }
    })
    expect(result.workData.data.aweme_detail.music.play_url.uri).toBe(
      'https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/ocDDUEfNEdvgY0FgpoIChSCfzWwZBhtsgQARAQ?__vid=7636333515160484072'
    )
    expect(state.persistFailureTrace).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'recovered',
      extra: expect.objectContaining({
        platform: 'douyin',
        stage: 'one_work',
        recoveryStage: 'detail-aweme-fallback',
        awemeId: '7636333515160484072'
      })
    }))
  })

  it('enriches note works when html-first has music metadata but no playable bgm url', async () => {
    const awemeId = '7658665604254507365'
    const routerData = {
      loaderData: {
        'note_(id)/page': {
          videoInfoRes: {
            item_list: [{
              aweme_id: awemeId,
              aweme_type: 0,
              desc: '画了两张，喜欢哪边？',
              preview_title: '画了两张，喜欢哪边？',
              share_url: `https://www.douyin.com/note/${awemeId}`,
              create_time: 1710000275,
              author: {
                nickname: '图文作者',
                sec_uid: 'sec_note_static',
                avatar_thumb: {
                  url_list: ['https://example.com/avatar-note-static.jpg']
                }
              },
              statistics: {
                digg_count: 1,
                comment_count: 2,
                collect_count: 3,
                share_count: 4
              },
              images: [{
                url_list: [
                  'https://example.com/note-static-1.jpg',
                  'https://example.com/note-static-1@2x.jpg',
                  'https://example.com/note-static-1@3x.jpg'
                ],
                download_url_list: ['https://example.com/note-static-1.jpg'],
                width: 1080,
                height: 1440,
                clip_type: 2
              }, {
                url_list: [
                  'https://example.com/note-static-2.jpg',
                  'https://example.com/note-static-2@2x.jpg',
                  'https://example.com/note-static-2@3x.jpg'
                ],
                download_url_list: ['https://example.com/note-static-2.jpg'],
                width: 1080,
                height: 1440,
                clip_type: 2
              }],
              video: {
                duration: 12000,
                width: 720,
                height: 1280,
                ratio: '720:1280',
                play_addr: {
                  uri: 'https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/top-level-note-video',
                  url_list: ['https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/top-level-note-video?foo=1'],
                  width: 720,
                  height: 1280
                },
                cover: {
                  url_list: ['https://example.com/note-video-cover.jpg']
                }
              },
              music: {
                author: '配乐作者',
                title: '配乐标题',
                mid: '7498332865128057618',
                duration: 123830,
                status: 1,
                cover_hd: {
                  url_list: ['https://example.com/note-static-bgm-cover.jpg']
                }
              }
            }]
          }
        }
      }
    }
    state.axiosGet.mockResolvedValueOnce({
      data: `
        <script>
          window._ROUTER_DATA = ${JSON.stringify(routerData)}
        </script>
      `,
      request: {
        res: {
          responseUrl: `https://www.douyin.com/note/${awemeId}?previous_page=app_code_link`
        }
      }
    })
    state.parseWork.mockResolvedValueOnce({
      data: {
        aweme_detail: {
          aweme_id: awemeId,
          aweme_type: 68,
          desc: '画了两张，喜欢哪边？',
          preview_title: '画了两张，喜欢哪边？',
          share_url: `https://www.douyin.com/note/${awemeId}`,
          create_time: 1710000275,
          author: {
            nickname: '图文作者',
            sec_uid: 'sec_note_static',
            avatar_thumb: {
              url_list: ['https://example.com/avatar-note-static.jpg']
            }
          },
          statistics: {
            digg_count: 1,
            comment_count: 2,
            collect_count: 3,
            share_count: 4
          },
          images: routerData.loaderData['note_(id)/page'].videoInfoRes.item_list[0].images,
          music: {
            author: '配乐作者',
            title: '配乐标题',
            play_url: {
              uri: '7498332865128057618',
              url_list: ['https://example.com/note-static-bgm.mp3']
            }
          }
        }
      }
    })

    const result = await fetchDouyinOneWork({
      type: 'one_work',
      aweme_id: awemeId,
      typeHint: 'note',
      resolvedUrl: `https://www.douyin.com/note/${awemeId}`
    })

    expect(result.source).toBe('html')
    expect(result.htmlWork.subtype).toBe('image')
    expect(state.parseWork).toHaveBeenCalledTimes(1)
    expect(state.parseWork).toHaveBeenCalledWith(expect.objectContaining({
      aweme_id: awemeId,
      typeMode: 'strict'
    }), expect.objectContaining({
      headers: expect.objectContaining({
        Referer: `https://www.douyin.com/note/${awemeId}?previous_page=app_code_link`
      })
    }))
    expect(result.workData.data.aweme_detail.music.play_url.url_list).toEqual([
      'https://example.com/note-static-bgm.mp3'
    ])
  })
})
