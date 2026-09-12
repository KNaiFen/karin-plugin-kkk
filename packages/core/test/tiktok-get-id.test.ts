import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  axiosGet: vi.fn(),
  config: {
    request: {
      'User-Agent': 'UnitTest UA',
      proxy: { switch: false },
      timeout: 10000
    },
    tiktok: {
      proxy: {
        switch: false,
        host: '',
        port: 0,
        protocol: 'http',
        auth: {
          username: '',
          password: ''
        }
      }
    }
  }
}))

vi.mock('node-karin/axios', () => ({
  default: {
    get: state.axiosGet
  }
}))

vi.mock('@/module/utils/Config', () => ({
  Config: state.config
}))

const {
  extractTikTokItemId,
  getTikTokID,
  parseTikTokLongLink,
  sanitizeTikTokIdDataForLog
} = await import('../src/platform/tiktok/getID')

describe('TikTok link id helpers', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('HTTPS_PROXY', '')
    vi.stubEnv('https_proxy', '')
    vi.stubEnv('HTTP_PROXY', '')
    vi.stubEnv('http_proxy', '')
    state.config.request.proxy = { switch: false }
    state.config.tiktok.proxy = {
      switch: false,
      host: '',
      port: 0,
      protocol: 'http',
      auth: {
        username: '',
        password: ''
      }
    }
  })

  it('extracts item id from long video links', () => {
    expect(extractTikTokItemId('https://www.tiktok.com/@good.ball21/video/7643493503778966797?_r=1')).toBe('7643493503778966797')
    expect(extractTikTokItemId('https://m.tiktok.com/v/7643493503778966797.html')).toBe('7643493503778966797')
  })

  it('parses long video links as one work', () => {
    expect(parseTikTokLongLink('https://www.tiktok.com/@good.ball21/video/7643493503778966797?_r=1')).toEqual({
      type: 'one_work',
      item_id: '7643493503778966797',
      url: 'https://www.tiktok.com/@good.ball21/video/7643493503778966797?_r=1'
    })
  })

  it('redacts cookies from log payloads', () => {
    expect(sanitizeTikTokIdDataForLog({
      type: 'one_work',
      item_id: '7643493503778966797',
      url: 'https://www.tiktok.com/@good.ball21/video/7643493503778966797',
      cookie: 'ttwid=page-ttwid; msToken=page-ms-token'
    })).toEqual({
      type: 'one_work',
      item_id: '7643493503778966797',
      url: 'https://www.tiktok.com/@good.ball21/video/7643493503778966797',
      cookie: '[len:39]'
    })
  })

  it('resolves vt.tiktok.com short links and keeps response cookies', async () => {
    state.axiosGet.mockResolvedValue({
      request: {
        res: {
          responseUrl: 'https://www.tiktok.com/@good.ball21/video/7643493503778966797?_r=1&_t=ZS-96imXVMosCO'
        }
      },
      headers: {
        'set-cookie': [
          'ttwid=page-ttwid; Path=/; Domain=.tiktok.com',
          'msToken=page-ms-token; Path=/; Domain=tiktok.com'
        ]
      }
    })

    await expect(getTikTokID('https://vt.tiktok.com/ZSxVY1Gos/')).resolves.toEqual({
      type: 'one_work',
      item_id: '7643493503778966797',
      url: 'https://www.tiktok.com/@good.ball21/video/7643493503778966797?_r=1&_t=ZS-96imXVMosCO',
      cookie: 'ttwid=page-ttwid; msToken=page-ms-token'
    })
  })

  it('follows vt.tiktok.com 301 redirects when resolving short links', async () => {
    const resolveLikeAxios = async (response: any, config?: { validateStatus?: (status: number) => boolean }) => {
      const validateStatus = config?.validateStatus ?? ((status: number) => status >= 200 && status < 300)
      if (!validateStatus(response.status)) {
        const error = Object.assign(new Error(`Request failed with status code ${response.status}`), {
          config,
          request: response.request,
          response,
          status: response.status
        })
        throw error
      }
      return response
    }

    state.axiosGet
      .mockImplementationOnce(async (_url: string, config: any) => await resolveLikeAxios({
        status: 301,
        headers: {
          location: 'https://www.tiktok.com/@whisper0174/video/7647897929167998240?_r=1&_t=ZS-97TKpHSo9jk'
        },
        config: {
          url: 'https://vt.tiktok.com/ZSCLNcnXD/'
        },
        request: {
          res: {
            responseUrl: 'https://vt.tiktok.com/ZSCLNcnXD/'
          }
        },
        data: '<a href="https://www.tiktok.com/@whisper0174/video/7647897929167998240?_r=1&_t=ZS-97TKpHSo9jk">Moved Permanently</a>.'
      }, config))
      .mockImplementationOnce(async (_url: string, config: any) => await resolveLikeAxios({
        status: 200,
        request: {
          res: {
            responseUrl: 'https://www.tiktok.com/@whisper0174/video/7647897929167998240?_r=1&_t=ZS-97TKpHSo9jk'
          }
        },
        headers: {
          'set-cookie': [
            'ttwid=page-ttwid; Path=/; Domain=.tiktok.com',
            'msToken=page-ms-token; Path=/; Domain=tiktok.com'
          ]
        }
      }, config))

    await expect(getTikTokID('https://vt.tiktok.com/ZSCLNcnXD/')).resolves.toEqual({
      type: 'one_work',
      item_id: '7647897929167998240',
      url: 'https://www.tiktok.com/@whisper0174/video/7647897929167998240?_r=1&_t=ZS-97TKpHSo9jk',
      cookie: 'ttwid=page-ttwid; msToken=page-ms-token'
    })
    expect(state.axiosGet).toHaveBeenCalledTimes(2)
  })

  it('still resolves vt.tiktok.com short links when axios throws a 301 error response', async () => {
    state.axiosGet
      .mockImplementationOnce(async () => {
        const response = {
          status: 301,
          headers: {
            location: 'https://www.tiktok.com/@whisper0174/video/7647897929167998240?_r=1&_t=ZS-97TKpHSo9jk'
          },
          config: {
            url: 'https://vt.tiktok.com/ZSCLNcnXD/'
          },
          request: {
            res: {
              responseUrl: 'https://vt.tiktok.com/ZSCLNcnXD/'
            }
          },
          data: '<a href="https://www.tiktok.com/@whisper0174/video/7647897929167998240?_r=1&_t=ZS-97TKpHSo9jk">Moved Permanently</a>.'
        }
        throw Object.assign(new Error('Request failed with status code 301'), {
          response,
          status: 301
        })
      })
      .mockResolvedValueOnce({
        status: 200,
        request: {
          res: {
            responseUrl: 'https://www.tiktok.com/@whisper0174/video/7647897929167998240?_r=1&_t=ZS-97TKpHSo9jk'
          }
        },
        headers: {
          'set-cookie': [
            'ttwid=page-ttwid; Path=/; Domain=.tiktok.com',
            'msToken=page-ms-token; Path=/; Domain=tiktok.com'
          ]
        }
      })

    await expect(getTikTokID('https://vt.tiktok.com/ZSCLNcnXD/')).resolves.toEqual({
      type: 'one_work',
      item_id: '7647897929167998240',
      url: 'https://www.tiktok.com/@whisper0174/video/7647897929167998240?_r=1&_t=ZS-97TKpHSo9jk',
      cookie: 'ttwid=page-ttwid; msToken=page-ms-token'
    })
    expect(state.axiosGet).toHaveBeenCalledTimes(2)
  })

  it('rejects short links that redirect to non-tiktok hosts', async () => {
    state.axiosGet.mockResolvedValue({
      request: {
        res: {
          responseUrl: 'https://evil.example/@good.ball21/video/7643493503778966797'
        }
      },
      headers: {
        'set-cookie': [
          'ttwid=page-ttwid; Path=/; Domain=.evil.example',
          'msToken=page-ms-token; Path=/; Domain=evil.example'
        ],
        'x-ms-token': 'header-ms-token'
      }
    })

    await expect(getTikTokID('https://vt.tiktok.com/ZSxVY1Gos/')).rejects.toThrow(/白名单|tiktok/i)
  })

  it('uses the TikTok-specific proxy when resolving short links', async () => {
    state.config.tiktok.proxy = {
      switch: true,
      host: '127.0.0.1',
      port: 7890,
      protocol: 'http',
      auth: {
        username: 'proxy-user',
        password: 'proxy-pass'
      }
    }
    state.axiosGet.mockResolvedValue({
      request: {
        res: {
          responseUrl: 'https://www.tiktok.com/@good.ball21/video/7643493503778966797'
        }
      },
      headers: {}
    })

    await getTikTokID('https://vt.tiktok.com/ZSxVY1Gos/')

    const requestConfig = state.axiosGet.mock.calls[0]?.[1]
    expect(requestConfig?.proxy).toBe(false)
    expect(requestConfig?.httpsAgent).toBeTruthy()
  })
})
