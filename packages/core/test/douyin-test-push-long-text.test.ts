import { beforeEach, describe, expect, it, vi } from 'vitest'

type CapturedCommand = {
  pattern: RegExp
  handler: (event: { msg: string }) => Promise<unknown>
}

const state = vi.hoisted(() => ({
  commands: [] as CapturedCommand[],
  fetchUserProfile: vi.fn(),
  getDouyinID: vi.fn(),
  parseWork: vi.fn(),
  render: vi.fn(),
  replyRenderedImages: vi.fn(),
  config: {
    app: {},
    bilibili: {
      push: {
        switch: false,
        permission: 'master',
        cron: '*/10 * * * *',
        jitterSeconds: 0
      }
    },
    cookies: { bilibili: '' },
    douyin: {
      push: {
        switch: false,
        permission: 'master',
        cron: '*/10 * * * *',
        jitterSeconds: 0,
        shareType: 'douyin'
      }
    },
    pushlist: {
      bilibili: [],
      douyin: []
    },
    Modify: vi.fn()
  }
}))

vi.mock('node-karin', () => ({
  default: {
    command: (pattern: RegExp, handler: CapturedCommand['handler']) => {
      state.commands.push({ pattern, handler })
      return { pattern, handler }
    },
    task: vi.fn()
  },
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    mark: vi.fn(),
    warn: vi.fn()
  }
}))

vi.mock('@/module', () => ({
  Common: {
    count: (value: unknown) => String(value ?? '')
  },
  Networks: class {
    async getLocation () {
      return 'https://www.douyin.com/video/test-push-long'
    }
  },
  Render: (...args: unknown[]) => state.render(...args),
  replyRenderedImages: (...args: unknown[]) => state.replyRenderedImages(...args)
}))

vi.mock('@/module/db', () => ({
  bilibiliDB: {
    addDynamicCache: vi.fn(),
    updateGroupBotId: vi.fn()
  },
  douyinDB: {
    addAwemeCache: vi.fn(),
    updateGroupBotId: vi.fn()
  }
}))

vi.mock('@/module/utils/amagiClient', () => ({
  bilibiliFetcher: {
    fetchDynamicCard: vi.fn(),
    fetchUserCard: vi.fn()
  },
  douyinFetcher: {
    fetchUserProfile: (...args: unknown[]) => state.fetchUserProfile(...args),
    parseWork: (...args: unknown[]) => state.parseWork(...args),
    searchContent: vi.fn()
  }
}))

vi.mock('@/module/utils/Config', () => ({
  Config: state.config
}))

vi.mock('@/module/utils/ErrorHandler', () => ({
  wrapWithErrorHandler: (handler: unknown) => handler
}))

vi.mock('@/module/utils/PushTaskJitter', () => ({
  waitForPushJitter: vi.fn(async () => 0)
}))

vi.mock('@/platform', () => ({
  Bilibilipush: class {},
  DouYinpush: class {},
  getBilibiliID: vi.fn(),
  getDouyinID: (...args: unknown[]) => state.getDouyinID(...args)
}))

vi.mock('@/platform/bilibili/pushRiskCooldown', () => ({
  formatBilibiliPushRiskCooldownRemaining: vi.fn(),
  getBilibiliPushRiskCooldownState: vi.fn(async () => ({ inCooldown: false, remainingMs: 0 }))
}))

const loadTestPushCommand = async () => {
  vi.resetModules()
  state.commands.length = 0
  await import('../src/apps/push')

  const command = state.commands.find(item => item.pattern.test('#测试抖音推送 https://v.douyin.com/test/'))
  if (!command) throw new Error('Missing Douyin test push command')
  return command
}

describe('Douyin test push long text card', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.getDouyinID.mockResolvedValue({ type: 'one_work', aweme_id: 'test-push-long' })
    state.render.mockResolvedValue([{ file: 'long-card', type: 'image' }])
    state.replyRenderedImages.mockResolvedValue(true)
    state.fetchUserProfile.mockResolvedValue({
      data: {
        user: {
          nickname: '测试作者',
          unique_id: 'test-author',
          short_id: 'test-short',
          avatar_larger: { url_list: ['https://example.com/test-author.jpg'] },
          follower_count: 10,
          total_favorited: 20,
          following_count: 3
        }
      }
    })
  })

  it('renders long non-article works with the shared paragraph card', async () => {
    const longText = '测试推送里的抖音作品标题超过二十五个字以后，也必须切换成完整的全文段落卡片'
    state.fetchUserProfile.mockRejectedValueOnce(new Error('profile request failed'))
    state.parseWork.mockResolvedValue({
      data: {
        aweme_detail: {
          aweme_id: 'test-push-long',
          aweme_type: 0,
          desc: longText,
          preview_title: '测试推送预览标题',
          share_url: 'https://www.douyin.com/video/test-push-long',
          create_time: 1784995200,
          author: {
            nickname: '测试作者',
            sec_uid: 'test-author-sec',
            avatar_thumb: { url_list: ['https://example.com/test-author.jpg'] }
          },
          statistics: {
            digg_count: 1,
            comment_count: 2,
            collect_count: 3,
            share_count: 4
          },
          video: {
            duration: 60000,
            width: 1080,
            height: 1920,
            ratio: '1080p',
            cover: { url_list: ['https://example.com/test-cover.jpg'] }
          }
        }
      }
    })
    const event = {
      msg: '#测试抖音推送 https://v.douyin.com/test/',
      reply: vi.fn()
    }

    await expect((await loadTestPushCommand()).handler(event)).resolves.toBe(true)

    expect(state.render).toHaveBeenCalledWith(
      event,
      'douyin/long-text-work',
      expect.objectContaining({
        text: longText,
        work_type: '视频',
        author: expect.objectContaining({ name: '测试作者' }),
        dynamicTYPE: '测试推送',
        share_url: 'https://www.douyin.com/video/test-push-long'
      })
    )
    expect(state.fetchUserProfile).toHaveBeenCalledTimes(1)
    expect(state.replyRenderedImages).toHaveBeenCalledWith(event, [{ file: 'long-card', type: 'image' }])
  })
})
