import { describe, expect, it } from 'vitest'

import {
  buildDouyinHtmlWorkFromAwemeDetail,
  buildDouyinWorkResultFromHtmlWork,
  parseDouyinHtmlWork
} from '../src/platform/douyin/html'

describe('Douyin HTML parser', () => {
  it('parses router video pages', () => {
    const routerData = {
      loaderData: {
        'video_(id)/page': {
          videoInfoRes: {
            item_list: [{
              aweme_id: '7657916175708779685',
              aweme_type: 0,
              desc: '视频标题',
              preview_title: '视频标题',
              share_url: 'https://www.douyin.com/video/7657916175708779685',
              create_time: 1710000000,
              author: {
                nickname: '视频作者',
                sec_uid: 'sec_video',
                unique_id: 'video_user',
                short_id: '12345',
                avatar_thumb: {
                  url_list: ['https://example.com/avatar-video.jpg']
                }
              },
              statistics: {
                digg_count: 12,
                comment_count: 8,
                collect_count: 4,
                share_count: 2,
                play_count: 99
              },
              video: {
                duration: 12000,
                width: 720,
                height: 1280,
                ratio: '720:1280',
                bit_rate: [{
                  FPS: 25,
                  play_addr: {
                    url_list: ['https://example.com/video.mp4'],
                    width: 720,
                    height: 1280
                  }
                }],
                cover: {
                  url_list: ['https://example.com/video-cover.jpg']
                }
              }
            }]
          },
          commentListData: {
            comments: [{
              text: '第一条评论',
              create_time: 1710000001,
              digg_count: 6,
              reply_comment_total: 1,
              ip_label: '上海',
              user: {
                nickname: '评论用户',
                avatar_thumb: {
                  url_list: ['https://example.com/comment-avatar.jpg']
                }
              }
            }]
          }
        }
      }
    }
    const html = `
      <script>
        window._ROUTER_DATA = ${JSON.stringify(routerData)}
      </script>
    `

    const result = parseDouyinHtmlWork(html, {
      awemeId: '7657916175708779685',
      typeHint: 'video'
    })

    expect(result).toMatchObject({
      awemeId: '7657916175708779685',
      subtype: 'video',
      title: '视频标题',
      desc: '视频标题',
      author: {
        nickname: '视频作者'
      },
      video: {
        playUrl: 'https://example.com/video.mp4'
      }
    })
    expect(result.comments).toHaveLength(1)
    expect(result.comments[0]).toMatchObject({
      text: '第一条评论',
      user: {
        nickname: '评论用户'
      }
    })
  })

  it('parses router article pages', () => {
    const routerData = {
      loaderData: {
        'article_(id)/page': {
          videoInfoRes: {
            item_list: [{
              aweme_id: 'article-001',
              aweme_type: 163,
              desc: '文章正文摘要',
              preview_title: '文章预览标题',
              share_url: 'https://www.douyin.com/article/article-001',
              create_time: 1710000100,
              author: {
                nickname: '文章作者',
                sec_uid: 'sec_article',
                avatar_thumb: {
                  url_list: ['https://example.com/avatar-article.jpg']
                }
              },
              statistics: {
                digg_count: 1,
                comment_count: 2,
                collect_count: 3,
                share_count: 4
              },
              images: [{
                url_list: ['https://example.com/article-1.jpg'],
                download_url_list: ['https://example.com/article-1.jpg'],
                width: 1080,
                height: 1440
              }],
              article_info: {
                article_title: '文章真实标题',
                article_content: '# Markdown 正文',
                fe_data: '{"image_list":[{"url":"https://example.com/article-1.jpg"}]}'
              }
            }]
          }
        }
      }
    }
    const html = `
      <script>
        window._ROUTER_DATA = ${JSON.stringify(routerData)}
      </script>
    `

    const result = parseDouyinHtmlWork(html, {
      awemeId: 'article-001',
      typeHint: 'article'
    })

    expect(result).toMatchObject({
      awemeId: 'article-001',
      subtype: 'article',
      title: '文章真实标题',
      article: {
        title: '文章真实标题'
      },
      author: {
        nickname: '文章作者'
      }
    })
    expect(result.images[0]?.urlList[0]).toBe('https://example.com/article-1.jpg')
  })

  it('parses pace note pages', () => {
    const html = `
      <script>
        self.__pace_f.push([1,"7:null,{\\"awemeId\\":\\"note-001\\",\\"aweme\\":{\\"detail\\":{\\"desc\\":\\"图文标题\\",\\"createTime\\":1710000200,\\"authorInfo\\":{\\"uid\\":\\"note-user\\",\\"nickname\\":\\"图文作者\\",\\"avatarUri\\":\\"https://example.com/note-avatar.jpg\\"},\\"images\\":[{\\"urlList\\":[\\"https://example.com/note-1.jpg\\"],\\"livePhotoType\\":1,\\"video\\":{\\"duration\\":1500,\\"cover\\":\\"https://example.com/note-cover.jpg\\",\\"playAddr\\":[{\\"src\\":\\"https://example.com/note-live.mp4\\"}]}}],\\"music\\":{\\"playUrl\\":{\\"urlList\\":[\\"https://example.com/music.mp3\\"]}}},\\"stats\\":{\\"diggCount\\":9,\\"commentCount\\":7,\\"collectCount\\":5,\\"shareCount\\":3}},\\"comment\\":{\\"comments\\":[{\\"text\\":\\"图文评论\\",\\"createTime\\":1710000201,\\"diggCount\\":2,\\"replyTotal\\":0,\\"ipLabel\\":\\"北京\\",\\"user\\":{\\"nickname\\":\\"评论作者\\",\\"avatarUri\\":\\"https://example.com/comment-note.jpg\\"},\\"imageList\\":[{\\"originUrl\\":{\\"urlList\\":[\\"https://example.com/comment-image.jpg\\"]}}]}]}}"])
      </script>
    `

    const result = parseDouyinHtmlWork(html, {
      awemeId: 'note-001',
      typeHint: 'note'
    })

    expect(result).toMatchObject({
      awemeId: 'note-001',
      subtype: 'image',
      title: '图文标题',
      desc: '图文标题',
      author: {
        nickname: '图文作者'
      },
      music: {
        playUrl: 'https://example.com/music.mp3'
      }
    })
    expect(result.images[0]).toMatchObject({
      clipType: 5
    })
    expect(result.comments[0]).toMatchObject({
      text: '图文评论',
      user: {
        nickname: '评论作者'
      }
    })
  })

  it('extracts extensionless hidden audio urls from note html', () => {
    const audioUrl = 'https://sf6-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/note-audio'
    const routerData = {
      loaderData: {
        'note_(id)/page': {
          videoInfoRes: {
            item_list: [{
              aweme_id: 'note-hidden-audio-001',
              aweme_type: 68,
              desc: '图文隐藏配乐',
              share_url: 'https://www.douyin.com/note/note-hidden-audio-001',
              author: { nickname: '图文作者' },
              statistics: {},
              images: [{ url_list: ['https://example.com/note.jpg'] }],
              music: { title: '配乐标题' }
            }]
          }
        }
      }
    }
    const html = `
      <script>window._ROUTER_DATA = ${JSON.stringify(routerData)}</script>
      <audio class="hide" src="${audioUrl}?foo=1&amp;bar=2" loop></audio>
    `

    const result = parseDouyinHtmlWork(html, {
      awemeId: 'note-hidden-audio-001',
      typeHint: 'note'
    })

    expect(result.music).toMatchObject({
      title: '配乐标题',
      playUrl: `${audioUrl}?foo=1&bar=2`
    })
  })

  it('unwraps broken router note-video wrapper urls into direct playable urls', () => {
    const directUrl = 'https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/oA1uoDVLXAUIrBiszAxMNjNQBCWmwvfELEYBi3'
    const wrappedUrl = `${'https://aweme.snssdk.com/aweme/v1/playwm/?video_id='}${directUrl}&ratio=720p&line=0`
    const routerData = {
      loaderData: {
        'note_(id)/page': {
          videoInfoRes: {
            item_list: [{
              aweme_id: 'note-video-001',
              aweme_type: 0,
              desc: 'note 视频标题',
              preview_title: 'note 视频标题',
              share_url: 'https://www.douyin.com/note/note-video-001',
              create_time: 1710000250,
              author: {
                nickname: '视频作者',
                sec_uid: 'sec_note_video',
                avatar_thumb: {
                  url_list: ['https://example.com/avatar-note-video.jpg']
                }
              },
              statistics: {
                digg_count: 12,
                comment_count: 8,
                collect_count: 4,
                share_count: 2,
                play_count: 99
              },
              video: {
                duration: 12000,
                width: 720,
                height: 1280,
                ratio: '720:1280',
                play_addr: {
                  uri: directUrl,
                  url_list: [wrappedUrl],
                  width: 720,
                  height: 1280
                },
                cover: {
                  url_list: ['https://example.com/video-cover.jpg']
                }
              }
            }]
          }
        }
      }
    }
    const html = `
      <script>
        window._ROUTER_DATA = ${JSON.stringify(routerData)}
      </script>
    `

    const parsed = parseDouyinHtmlWork(html, {
      awemeId: 'note-video-001',
      typeHint: 'note'
    })

    expect(parsed).toMatchObject({
      awemeId: 'note-video-001',
      subtype: 'video',
      video: {
        playUrl: directUrl
      }
    })

    const result = buildDouyinWorkResultFromHtmlWork(parsed)
    expect(result.data.aweme_detail.video.play_addr.uri).toBe('')
    expect(result.data.aweme_detail.video.play_addr.url_list[0]).toBe(directUrl)
  })

  it('treats note pages with static images plus top-level video metadata as image works', () => {
    const routerData = {
      loaderData: {
        'note_(id)/page': {
          videoInfoRes: {
            item_list: [{
              aweme_id: 'note-static-001',
              aweme_type: 0,
              desc: '画了两张，喜欢哪边？',
              preview_title: '画了两张，喜欢哪边？',
              share_url: 'https://www.douyin.com/note/note-static-001',
              create_time: 1710000275,
              author: {
                nickname: '图文作者',
                sec_uid: 'sec_note_static',
                avatar_thumb: {
                  url_list: ['https://example.com/avatar-note-static.jpg']
                }
              },
              statistics: {
                digg_count: 18,
                comment_count: 9,
                collect_count: 6,
                share_count: 3,
                play_count: 108
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
                play_url: {
                  uri: 'https://example.com/note-static-bgm.mp3'
                }
              }
            }]
          }
        }
      }
    }
    const html = `
      <script>
        window._ROUTER_DATA = ${JSON.stringify(routerData)}
      </script>
    `

    const parsed = parseDouyinHtmlWork(html, {
      awemeId: 'note-static-001',
      typeHint: 'note',
      url: 'https://www.douyin.com/note/note-static-001'
    })

    expect(parsed).toMatchObject({
      awemeId: 'note-static-001',
      subtype: 'image',
      shareUrl: 'https://www.douyin.com/note/note-static-001',
      music: {
        playUrl: 'https://example.com/note-static-bgm.mp3'
      }
    })
    expect(parsed.images).toHaveLength(2)

    const result = buildDouyinWorkResultFromHtmlWork(parsed)
    expect(result.data.aweme_detail.aweme_type).toBe(68)
    expect(result.data.aweme_detail.images).toHaveLength(2)
  })

  it('prefers direct music urls over bare play_url ids in note-like router payloads', () => {
    const directMusicUrl = 'https://sf6-cdn-tos.douyinstatic.com/obj/ies-music/7634223845754407716.mp3?is_ssr=1'
    const routerData = {
      loaderData: {
        'note_(id)/page': {
          videoInfoRes: {
            item_list: [{
              aweme_id: 'note-music-001',
              aweme_type: 68,
              desc: '图文带配乐',
              preview_title: '图文带配乐',
              share_url: 'https://www.douyin.com/note/note-music-001',
              create_time: 1710000400,
              author: {
                nickname: '图文作者',
                sec_uid: 'sec_note_music',
                avatar_thumb: {
                  url_list: ['https://example.com/avatar-note-music.jpg']
                }
              },
              statistics: {},
              images: [{
                url_list: ['https://example.com/note-music-1.jpg']
              }],
              music: {
                play_url: {
                  uri: '7634223845754407716',
                  url_list: [directMusicUrl]
                },
                extra: JSON.stringify({
                  original_song_url: `${directMusicUrl}&fallback=1`
                })
              }
            }]
          }
        }
      }
    }
    const html = `
      <script>
        window._ROUTER_DATA = ${JSON.stringify(routerData)}
      </script>
    `

    const parsed = parseDouyinHtmlWork(html, {
      awemeId: 'note-music-001',
      typeHint: 'note',
      url: 'https://www.douyin.com/note/note-music-001'
    })

    expect(parsed.music).toMatchObject({
      playUrl: directMusicUrl
    })

    const result = buildDouyinWorkResultFromHtmlWork(parsed)
    expect(result.data.aweme_detail.music.play_url.uri).toBe(directMusicUrl)
    expect(result.data.aweme_detail.music.play_url.url_list).toEqual([
      directMusicUrl,
      `${directMusicUrl}&fallback=1`
    ])
  })

  it('falls back to music source tags when note html does not expose a direct music url in json', () => {
    const html = `
      <script>
        self.__pace_f = [];
        self.__pace_f.push([1,"7:null,{\\"awemeId\\":\\"note-music-html-001\\",\\"aweme\\":{\\"detail\\":{\\"desc\\":\\"图文标题\\",\\"createTime\\":1710000600,\\"authorInfo\\":{\\"uid\\":\\"note-user\\",\\"nickname\\":\\"图文作者\\",\\"avatarUri\\":\\"https://example.com/note-avatar.jpg\\"},\\"images\\":[{\\"urlList\\":[\\"https://example.com/note-1.jpg\\"]}],\\"music\\":{\\"playUrl\\":{\\"uri\\":\\"7634223845754407716\\"}}},\\"stats\\":{\\"diggCount\\":9,\\"commentCount\\":7,\\"collectCount\\":5,\\"shareCount\\":3}}}"]);
      </script>
      <video>
        <source src="https://sf6-cdn-tos.douyinstatic.com/obj/ies-music/7634223845754407716.mp3?is_ssr=1" type="">
      </video>
    `

    const parsed = parseDouyinHtmlWork(html, {
      awemeId: 'note-music-html-001',
      typeHint: 'note',
      url: 'https://www.douyin.com/note/note-music-html-001'
    })

    expect(parsed.music).toMatchObject({
      playUrl: 'https://sf6-cdn-tos.douyinstatic.com/obj/ies-music/7634223845754407716.mp3?is_ssr=1'
    })
  })

  it('builds article-like html work directly from aweme detail responses', () => {
    const result = buildDouyinHtmlWorkFromAwemeDetail({
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
      statistics: {
        digg_count: 1,
        comment_count: 2,
        collect_count: 3,
        share_count: 4
      },
      article_info: {
        article_title: '纪念 #马克思',
        article_content: '正文内容',
        fe_data: JSON.stringify({
          image_list: [{ url: 'https://example.com/article-fe-image-1.jpg' }]
        })
      },
      music: {
        play_url: {
          uri: '7634223845754407716',
          url_list: ['https://sf6-cdn-tos.douyinstatic.com/obj/ies-music/7634223845754407716.mp3?is_ssr=1']
        }
      },
      images: [{
        url_list: ['https://example.com/article-image-1.jpg']
      }]
    }, {
      awemeId: '7636333515160484072',
      typeHint: 'article',
      url: 'https://www.douyin.com/article/7636333515160484072'
    })

    expect(result).toMatchObject({
      awemeId: '7636333515160484072',
      subtype: 'article',
      shareUrl: 'https://www.douyin.com/article/7636333515160484072',
      article: {
        title: '纪念 #马克思'
      },
      images: [{ urlList: ['https://example.com/article-image-1.jpg'] }],
      music: {
        playUrl: 'https://sf6-cdn-tos.douyinstatic.com/obj/ies-music/7634223845754407716.mp3?is_ssr=1'
      },
      raw: {
        source: 'detail'
      }
    })
    expect(result?.article?.images).toEqual([{ url: 'https://example.com/article-fe-image-1.jpg' }])
  })

  it('preserves structured article markdown instead of passing raw article json through to render payloads', () => {
    const rawMarkdown = '# 一级标题\n\n第一段正文\n\n第二段正文\n\n![配图](https://example.com/article-md-image.jpg width=1080 height=1440)'
    const rawArticleContent = JSON.stringify({
      markdown: rawMarkdown,
      text: '这是不该被优先选中的纯文本兜底'
    })

    const htmlWork = buildDouyinHtmlWorkFromAwemeDetail({
      aweme_id: 'article-structured-001',
      aweme_type: 163,
      desc: '文章摘要',
      preview_title: '文章标题',
      share_url: 'https://www.douyin.com/article/article-structured-001',
      create_time: 1710000600,
      author: {
        nickname: '文章作者',
        sec_uid: 'sec_article_structured',
        avatar_thumb: {
          url_list: ['https://example.com/article-avatar.jpg']
        }
      },
      statistics: {},
      article_info: {
        article_title: '文章标题',
        article_content: rawArticleContent,
        fe_data: JSON.stringify({
          image_list: [{ url: 'https://example.com/article-fe-image-1.jpg' }]
        })
      },
      images: [{
        url_list: ['https://example.com/article-image-1.jpg']
      }]
    }, {
      awemeId: 'article-structured-001',
      typeHint: 'article',
      url: 'https://www.douyin.com/article/article-structured-001'
    })

    expect(htmlWork?.article?.markdown).toBe(rawMarkdown)
    expect(htmlWork?.article?.markdown).not.toBe(rawArticleContent)

    const workData = buildDouyinWorkResultFromHtmlWork(htmlWork!)
    const parsedArticleContent = JSON.parse(workData.data.aweme_detail.article_info.article_content)

    expect(parsedArticleContent.markdown).toBe(rawMarkdown)
    expect(parsedArticleContent.markdown).not.toBe(rawArticleContent)
  })

  it('appends __vid to article detail music source urls when only bare tos sources are available', () => {
    const result = buildDouyinHtmlWorkFromAwemeDetail({
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
    }, {
      awemeId: '7636333515160484072',
      typeHint: 'article',
      url: 'https://www.douyin.com/article/7636333515160484072'
    })

    expect(result).toMatchObject({
      music: {
        playUrl: 'https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/ocDDUEfNEdvgY0FgpoIChSCfzWwZBhtsgQARAQ?__vid=7636333515160484072'
      },
      article: {
        images: [{ url: 'https://example.com/article-head-poster.jpg' }]
      }
    })
  })

  it('uses article head poster and source url fallbacks for article-like html pages', () => {
    const html = `
      <script>
        window._ROUTER_DATA = ${JSON.stringify({
          loaderData: {
            'article_(id)/page': {
              videoInfoRes: {
                item_list: [{
                  aweme_id: 'article-fallback-001',
                  aweme_type: 163,
                  desc: '文章摘要',
                  preview_title: '文章标题',
                  share_url: 'https://www.douyin.com/article/article-fallback-001',
                  create_time: 1710000700,
                  author: {
                    nickname: '文章作者',
                    sec_uid: 'sec_article_fallback',
                    avatar_thumb: {
                      url_list: ['https://example.com/article-avatar-fallback.jpg']
                    }
                  },
                  statistics: {},
                  article_info: {
                    article_title: '文章标题',
                    article_content: '正文内容',
                    fe_data: JSON.stringify({
                      image_list: [],
                      head_poster_list: {
                        url_list: ['https://example.com/article-head-poster.jpg']
                      },
                      pre_cover: 'https://example.com/article-pre-cover.jpg'
                    })
                  },
                  music: {
                    play_url: {
                      uri: 'https://sf6-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/ocDDUEfNEdvgY0FgpoIChSCfzWwZBhtsgQARAQ',
                      url_list: ['https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/ocDDUEfNEdvgY0FgpoIChSCfzWwZBhtsgQARAQ']
                    }
                  },
                  video: {
                    play_addr: {
                      uri: 'https://sf6-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/ocDDUEfNEdvgY0FgpoIChSCfzWwZBhtsgQARAQ',
                      url_list: ['https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/ocDDUEfNEdvgY0FgpoIChSCfzWwZBhtsgQARAQ']
                    },
                    cover: {
                      url_list: ['https://example.com/article-cover-fallback.jpg']
                    }
                  }
                }]
              }
            }
          }
        })}
      </script>
      <video>
        <source src="https://sf6-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/ocDDUEfNEdvgY0FgpoIChSCfzWwZBhtsgQARAQ?__vid=article-fallback-001" type="">
      </video>
    `

    const parsed = parseDouyinHtmlWork(html, {
      awemeId: 'article-fallback-001',
      typeHint: 'article',
      url: 'https://www.douyin.com/article/article-fallback-001'
    })

    expect(parsed.music).toMatchObject({
      playUrl: 'https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/ocDDUEfNEdvgY0FgpoIChSCfzWwZBhtsgQARAQ?__vid=article-fallback-001'
    })
    expect(parsed.article?.images).toEqual([{ url: 'https://example.com/article-head-poster.jpg' }])
  })

  it('normalizes note video builder uri when html-first only has direct cdn urls', () => {
    const result = buildDouyinWorkResultFromHtmlWork({
      awemeId: 'note-video-001',
      subtype: 'video',
      shareUrl: 'https://www.douyin.com/note/note-video-001',
      title: 'note 视频标题',
      desc: 'note 视频标题',
      previewTitle: 'note 视频标题',
      createTime: 1710000300,
      isSlides: false,
      author: {
        nickname: '视频作者',
        avatar: 'https://example.com/avatar-video.jpg',
        secUid: 'sec_video',
        uniqueId: 'video_user',
        shortId: '12345',
        followerCount: 0,
        followingCount: 0,
        totalFavorited: 0
      },
      stats: {
        diggCount: 12,
        commentCount: 8,
        collectCount: 4,
        shareCount: 2,
        playCount: 99,
        recommendCount: 0
      },
      images: [],
      comments: [],
      textExtra: [],
      video: {
        uri: 'https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/test-video',
        playUrl: 'https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/test-video?is_ssr=1&temp=1',
        backupUrls: ['https://sf6-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/test-video?is_ssr=1&temp=1'],
        coverUrl: 'https://example.com/video-cover.jpg',
        dynamicCoverUrl: 'https://example.com/video-cover-dynamic.jpg',
        duration: 12000,
        width: 720,
        height: 1280,
        ratio: '720:1280',
        fps: 25
      },
      raw: {
        source: 'pace',
        payload: {}
      }
    })

    expect(result.data.aweme_detail.video.play_addr.uri).toBe('')
    expect(result.data.aweme_detail.video.play_addr.url_list[0]).toBe(
      'https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/test-video?is_ssr=1&temp=1'
    )
  })

  it('normalizes embedded image-video uri when html-first only has direct cdn urls', () => {
    const result = buildDouyinWorkResultFromHtmlWork({
      awemeId: 'note-live-001',
      subtype: 'image',
      shareUrl: 'https://www.douyin.com/note/note-live-001',
      title: '实况图标题',
      desc: '实况图标题',
      previewTitle: '实况图标题',
      createTime: 1710000400,
      isSlides: false,
      author: {
        nickname: '图文作者',
        avatar: 'https://example.com/avatar-note.jpg',
        secUid: 'sec_note',
        uniqueId: 'note_user',
        shortId: '12345',
        followerCount: 0,
        followingCount: 0,
        totalFavorited: 0
      },
      stats: {
        diggCount: 9,
        commentCount: 7,
        collectCount: 5,
        shareCount: 3,
        playCount: 0,
        recommendCount: 0
      },
      images: [{
        urlList: ['https://example.com/note-cover.jpg'],
        downloadUrlList: ['https://example.com/note-cover.jpg'],
        width: 1080,
        height: 1440,
        clipType: 5,
        video: {
          uri: 'https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/test-live-photo',
          playUrl: 'https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/test-live-photo?is_ssr=1&temp=1',
          backupUrls: ['https://sf6-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/test-live-photo?is_ssr=1&temp=1'],
          coverUrl: 'https://example.com/note-cover.jpg',
          duration: 1500,
          width: 720,
          height: 1280,
          ratio: '720:1280'
        }
      }],
      comments: [],
      textExtra: [],
      raw: {
        source: 'pace',
        payload: {}
      }
    })

    expect(result.data.aweme_detail.images[0].video.play_addr.uri).toBe('')
    expect(result.data.aweme_detail.images[0].video.play_addr_h264.url_list[0]).toBe(
      'https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/test-live-photo?is_ssr=1&temp=1'
    )
  })
})
