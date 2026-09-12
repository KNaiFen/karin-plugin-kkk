import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  axiosGet: vi.fn(),
  axiosPost: vi.fn(),
  config: {
    cookies: {
      zhihu: ''
    },
    request: {
      'User-Agent': 'Unit Test UA',
      proxy: { switch: false },
      timeout: 10000,
      headers: {}
    }
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

const { fetchZhihuAnswerDetail, fetchZhihuArticleDetail } = await import('../src/platform/zhihu/api')

describe('Zhihu API parsing', () => {
  it('prefers answer api payload before html fallback', async () => {
    state.axiosGet.mockResolvedValue({
      data: {
        id: '122329247',
        content: '<p>回答正文</p><img src="https://pic.example.com/answer.jpg">',
        created_time: 1772421699,
        updated_time: 1772449760,
        comment_count: 28,
        voteup_count: 2472,
        ip_info: '北京',
        author: {
          name: '知乎答主',
          headline: '工程师',
          url_token: 'answer-author'
        },
        question: {
          id: '19550283',
          title: '什么是美联储？',
          answer_count: 321,
          follower_count: 1000
        }
      }
    })

    await expect(fetchZhihuAnswerDetail({
      type: 'answer',
      questionId: '19550283',
      answerId: '122329247',
      url: 'https://www.zhihu.com/question/19550283/answer/122329247'
    })).resolves.toMatchObject({
      type: 'answer',
      answer: {
        id: '122329247',
        author: {
          name: '知乎答主'
        },
        voteupCount: 2472,
        commentCount: 28,
        ipInfo: '北京'
      },
      question: {
        id: '19550283',
        title: '什么是美联储？'
      },
      richContent: {
        text: '回答正文',
        images: ['https://pic.example.com/answer.jpg']
      }
    })

    const [, requestConfig] = state.axiosGet.mock.calls[0] ?? []
    expect(requestConfig?.headers?.Referer).toBeUndefined()
    expect(requestConfig?.headers?.['X-Requested-With']).toBeUndefined()
  })

  it('falls back to js-initialData when answer api is unavailable', async () => {
    const initialData = {
      initialState: {
        entities: {
          questions: {
            '19550283': {
              id: '19550283',
              title: '什么是美联储？'
            }
          },
          answers: {
            '122329247': {
              id: '122329247',
              author: {
                name: '知乎答主'
              },
              content: '<p>回答正文</p>',
              created_time: 1772421699,
              updated_time: 1772449760,
              comment_count: 28,
              voteup_count: 2472,
              ip_info: '北京'
            }
          }
        }
      }
    }

    state.axiosGet
      .mockRejectedValueOnce(new Error('Request failed with status code 403'))
      .mockResolvedValueOnce({
        data: `<html><script id="js-initialData" type="text/json">${JSON.stringify(initialData)}</script></html>`
      })

    await expect(fetchZhihuAnswerDetail({
      type: 'answer',
      questionId: '19550283',
      answerId: '122329247',
      url: 'https://www.zhihu.com/question/19550283/answer/122329247'
    })).resolves.toMatchObject({
      type: 'answer',
      answer: {
        id: '122329247'
      },
      question: {
        id: '19550283',
        title: '什么是美联储？'
      }
    })
  })

  it('throws explicit blocked error when answer api and html fallback both fail', async () => {
    state.axiosGet
      .mockRejectedValueOnce(new Error('Request failed with status code 403'))
      .mockRejectedValueOnce(new Error('Request failed with status code 403'))

    await expect(fetchZhihuAnswerDetail({
      type: 'answer',
      questionId: '19550283',
      answerId: '122329247',
      url: 'https://www.zhihu.com/question/19550283/answer/122329247'
    })).rejects.toThrow('当前回答需要更强登录态或已被知乎拦截')
  })

  it('parses zhuanlan article detail from js-initialData', async () => {
    const initialData = {
      initialState: {
        entities: {
          articles: {
            '2010754233901737586': {
              id: '2010754233901737586',
              title: '双非二本怎么成为一个ai agent 工程师？',
              url: 'https://zhuanlan.zhihu.com/p/2010754233901737586',
              author: {
                name: '知乎作者',
                headline: '工程师',
                urlToken: 'author-token'
              },
              content: '<p>文章正文</p><img src="https://pic.example.com/a.jpg">',
              created: 1772421699,
              updated: 1772449760,
              commentCount: 28,
              voteupCount: 2472,
              ipInfo: '北京'
            }
          }
        }
      }
    }
    state.axiosGet.mockResolvedValue({
      data: `<html><script id="js-initialData" type="text/json">${JSON.stringify(initialData)}</script></html>`
    })

    await expect(fetchZhihuArticleDetail({
      type: 'article',
      articleId: '2010754233901737586',
      url: 'https://zhuanlan.zhihu.com/p/2010754233901737586'
    })).resolves.toMatchObject({
      type: 'article',
      url: 'https://zhuanlan.zhihu.com/p/2010754233901737586',
      article: {
        id: '2010754233901737586',
        title: '双非二本怎么成为一个ai agent 工程师？',
        author: {
          name: '知乎作者'
        },
        voteupCount: 2472,
        commentCount: 28,
        ipInfo: '北京'
      },
      richContent: {
        text: '文章正文',
        images: ['https://pic.example.com/a.jpg']
      }
    })
  })
})
