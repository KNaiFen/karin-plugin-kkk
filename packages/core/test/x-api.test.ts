import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  axiosPost: vi.fn(),
  config: {
    request: {
      'User-Agent': 'Unit Test UA',
      proxy: {
        switch: true,
        host: 'global-proxy.local',
        port: 7899,
        protocol: 'http',
        auth: {
          username: 'global-user',
          password: 'global-pass'
        }
      },
      timeout: 10000,
      headers: {}
    },
    x: {
      proxy: {
        switch: true,
        host: '127.0.0.1',
        port: 7890,
        protocol: 'http',
        auth: {
          username: 'x-user',
          password: 'x-pass'
        }
      }
    }
  }
}))

vi.mock('node-karin/axios', () => ({
  default: {
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
  buildConfiguredRequestOptions: (request: { timeout?: number, proxy?: any }) => ({
    timeout: request.timeout ?? 10000,
    proxy: request.proxy?.switch
      ? {
          host: request.proxy.host,
          port: request.proxy.port,
          protocol: request.proxy.protocol,
          auth: request.proxy.auth
        }
      : false,
    headers: {}
  })
}))

vi.mock('@/module/utils/Config', () => ({
  Config: state.config
}))

const { fetchXDetail } = await import('../src/platform/x/api')

describe('X API parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses root, quoted and media-rich tweet payloads from easycomment', async () => {
    state.axiosPost.mockResolvedValue({
      data: {
        code: 100000,
        data: {
          data: {
            threaded_conversation_with_injections_v2: {
              instructions: [
                {
                  type: 'TimelineAddEntries',
                  entries: [
                    {
                      content: {
                        __typename: 'TimelineTimelineItem',
                        itemContent: {
                          __typename: 'TimelineTweet',
                          tweet_results: {
                            result: {
                              __typename: 'Tweet',
                              rest_id: '2050564108114899179',
                              core: {
                                user_results: {
                                  result: {
                                    __typename: 'User',
                                    avatar: {
                                      image_url: 'https://pbs.twimg.com/profile_images/root_normal.jpg'
                                    },
                                    core: {
                                      name: 'saki ❤︎',
                                      screen_name: 'cakedochi'
                                    },
                                    legacy: {
                                      description: 'バカは見る~♡'
                                    }
                                  }
                                }
                              },
                              views: {
                                count: '12345'
                              },
                              legacy: {
                                bookmark_count: 2144,
                                conversation_id_str: '2050564108114899179',
                                created_at: 'Sat May 02 13:12:35 +0000 2026',
                                display_text_range: [0, 4],
                                favorite_count: 88,
                                full_text: '主帖内容 https://t.co/demo',
                                quote_count: 4,
                                reply_count: 6,
                                retweet_count: 9,
                                possibly_sensitive: false,
                                extended_entities: {
                                  media: [
                                    {
                                      type: 'video',
                                      media_url_https: 'https://pbs.twimg.com/amplify_video_thumb/root-cover.jpg',
                                      video_info: {
                                        duration_millis: 6281,
                                        variants: [
                                          {
                                            bitrate: 432000,
                                            content_type: 'video/mp4',
                                            url: 'https://video.twimg.com/root-432.mp4'
                                          },
                                          {
                                            bitrate: 1280000,
                                            content_type: 'video/mp4',
                                            url: 'https://video.twimg.com/root-1280.mp4'
                                          }
                                        ]
                                      }
                                    }
                                  ]
                                }
                              },
                              quoted_status_result: {
                                result: {
                                  __typename: 'Tweet',
                                  rest_id: '2050797873684762975',
                                  core: {
                                    user_results: {
                                      result: {
                                        __typename: 'User',
                                        avatar: {
                                          image_url: 'https://pbs.twimg.com/profile_images/quoted_normal.jpg'
                                        },
                                        core: {
                                          name: 'みらつ',
                                          screen_name: 'miratsu169'
                                        },
                                        legacy: {
                                          description: 'quoted profile'
                                        }
                                      }
                                    }
                                  },
                                  views: {
                                    count: '456'
                                  },
                                  legacy: {
                                    bookmark_count: 1,
                                    conversation_id_str: '2050797873684762975',
                                    created_at: 'Sun May 03 05:00:00 +0000 2026',
                                    display_text_range: [0, 3],
                                    favorite_count: 20,
                                    full_text: '引用帖 https://t.co/img',
                                    quote_count: 0,
                                    reply_count: 2,
                                    retweet_count: 3,
                                    extended_entities: {
                                      media: [
                                        {
                                          type: 'photo',
                                          media_url_https: 'https://pbs.twimg.com/media/quoted.jpg'
                                        }
                                      ]
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  ]
                }
              ]
            }
          }
        }
      }
    })

    await expect(fetchXDetail({
      type: 'status',
      statusId: '2050564108114899179',
      screenName: 'cakedochi',
      url: 'https://x.com/cakedochi/status/2050564108114899179'
    })).resolves.toMatchObject({
      type: 'status',
      url: 'https://x.com/cakedochi/status/2050564108114899179',
      status: {
        id: '2050564108114899179',
        text: '主帖内容',
        sensitive: false,
        author: {
          name: 'saki ❤︎',
          screenName: 'cakedochi',
          avatar: 'https://pbs.twimg.com/profile_images/root_normal.jpg'
        },
        video: {
          url: 'https://video.twimg.com/root-1280.mp4',
          cover: 'https://pbs.twimg.com/amplify_video_thumb/root-cover.jpg',
          duration: 6
        },
        stats: {
          view: 12345,
          like: 88,
          comment: 6,
          bookmark: 2144,
          share: 13
        },
        quotedStatus: {
          id: '2050797873684762975',
          text: '引用帖',
          images: ['https://pbs.twimg.com/media/quoted.jpg:orig'],
          author: {
            name: 'みらつ',
            screenName: 'miratsu169'
          }
        }
      }
    })

    expect(state.axiosPost).toHaveBeenCalledWith(
      expect.any(String),
      { pid: '2050564108114899179' },
      expect.objectContaining({
        proxy: {
          host: '127.0.0.1',
          port: 7890,
          protocol: 'http',
          auth: {
            username: 'x-user',
            password: 'x-pass'
          }
        }
      })
    )
  })

  it('unwraps TweetWithVisibilityResults and marks sensitive content', async () => {
    state.axiosPost.mockResolvedValue({
      data: {
        code: 100000,
        data: {
          data: {
            threaded_conversation_with_injections_v2: {
              instructions: [
                {
                  type: 'TimelineAddEntries',
                  entries: [
                    {
                      content: {
                        __typename: 'TimelineTimelineItem',
                        itemContent: {
                          __typename: 'TimelineTweet',
                          tweet_results: {
                            result: {
                              __typename: 'TweetWithVisibilityResults',
                              mediaVisibilityResults: {
                                blurred_image_interstitial: {
                                  title: {
                                    text: 'Sensitive'
                                  }
                                }
                              },
                              tweet: {
                                rest_id: '2039914691196244152',
                                core: {
                                  user_results: {
                                    result: {
                                      __typename: 'User',
                                      core: {
                                        name: '本家',
                                        screen_name: 'Honke02'
                                      },
                                      legacy: {
                                        description: 'sensitive profile'
                                      }
                                    }
                                  }
                                },
                                views: {
                                  count: '99'
                                },
                                legacy: {
                                  bookmark_count: 0,
                                  created_at: 'Fri Apr 03 03:55:36 +0000 2026',
                                  display_text_range: [0, 4],
                                  favorite_count: 5,
                                  full_text: '敏感内容 https://t.co/media',
                                  quote_count: 0,
                                  reply_count: 1,
                                  retweet_count: 2,
                                  possibly_sensitive: true
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  ]
                }
              ]
            }
          }
        }
      }
    })

    await expect(fetchXDetail({
      type: 'status',
      statusId: '2039914691196244152',
      screenName: 'Honke02',
      url: 'https://x.com/Honke02/status/2039914691196244152'
    })).resolves.toMatchObject({
      status: {
        id: '2039914691196244152',
        text: '敏感内容',
        sensitive: true,
        author: {
          name: '本家',
          screenName: 'Honke02'
        }
      }
    })
  })
})
