import { describe, expect, it } from 'vitest'

import {
  DOUYIN_MESSAGE_URL_REGEX,
  extractBilibiliMessageUrl,
  extractDouyinMessageUrl,
  extractGithubMessageUrl,
  extractHeyBoxMessageUrl,
  extractKuaishouMessageUrl,
  extractTiebaMessageUrl,
  extractTikTokMessageUrl,
  extractWechatMessageUrl,
  extractWeiboMessageUrl,
  extractXiaohongshuMessageUrl,
  extractXMessageUrl,
  extractZhihuMessageUrl,
  GITHUB_MESSAGE_URL_REGEX,
  HEYBOX_MESSAGE_URL_REGEX,
  isOnlyExtractedLinkMessage,
  KUAISHOU_MESSAGE_URL_REGEX,
  shouldReplyPlainVideoTitle,
  TIEBA_MESSAGE_URL_REGEX,
  TIKTOK_MESSAGE_URL_REGEX,
  WECHAT_MESSAGE_URL_REGEX,
  WEIBO_MESSAGE_URL_REGEX,
  X_MESSAGE_URL_REGEX,
  XIAOHONGSHU_MESSAGE_URL_REGEX,
  ZHIHU_MESSAGE_URL_REGEX
} from '../src/apps/linkExtractors'

describe('message link extractors', () => {
  it('extracts direct Bilibili live room links', () => {
    expect(extractBilibiliMessageUrl('https://live.bilibili.com/8139918')).toBe('https://live.bilibili.com/8139918')
  })

  it('keeps extracting regular Bilibili video links', () => {
    expect(extractBilibiliMessageUrl('看这个 https://www.bilibili.com/video/BV12uLq6dEdv?p=1')).toBe('https://www.bilibili.com/video/BV12uLq6dEdv?p=1')
  })

  it('matches direct Douyin live room links for command dispatch', () => {
    expect(DOUYIN_MESSAGE_URL_REGEX.test('https://live.douyin.com/717267717594')).toBe(true)
  })

  it('extracts direct Douyin live room links from messages', () => {
    expect(extractDouyinMessageUrl('开播了 https://live.douyin.com/717267717594')).toBe('https://live.douyin.com/717267717594')
  })

  it('matches TikTok links for command dispatch', () => {
    expect(TIKTOK_MESSAGE_URL_REGEX.test('https://vt.tiktok.com/ZSxVY1Gos/')).toBe(true)
    expect(TIKTOK_MESSAGE_URL_REGEX.test('https://www.tiktok.com/@good.ball21/video/7643493503778966797')).toBe(true)
  })

  it('extracts TikTok short and long links from messages', () => {
    expect(extractTikTokMessageUrl('TikTok https://vt.tiktok.com/ZSxVY1Gos/ 看这个')).toBe('https://vt.tiktok.com/ZSxVY1Gos/')
    expect(extractTikTokMessageUrl('https://www.tiktok.com/@good.ball21/video/7643493503778966797?_r=1')).toBe('https://www.tiktok.com/@good.ball21/video/7643493503778966797?_r=1')
  })

  it('matches and extracts Heybox links', () => {
    const link = 'https://www.xiaoheihe.cn/app/bbs/link/4a9471857e40'
    expect(HEYBOX_MESSAGE_URL_REGEX.test(link)).toBe(true)
    expect(extractHeyBoxMessageUrl(`看看 ${link}`)).toBe(link)
  })

  it('matches and extracts Kuaishou links', () => {
    const link = 'https://www.kuaishou.com/short-video/3x8s2qmteama6ha'
    expect(KUAISHOU_MESSAGE_URL_REGEX.test(link)).toBe(true)
    expect(extractKuaishouMessageUrl(`快手 ${link}`)).toBe(link)
  })

  it('matches and extracts Xiaohongshu links', () => {
    const link = 'http://xhslink.cn/o/1wPOQ9a9RyI'
    expect(XIAOHONGSHU_MESSAGE_URL_REGEX.test(link)).toBe(true)
    expect(XIAOHONGSHU_MESSAGE_URL_REGEX.test('看看 www.xiaohongshu.com/explore/abc123')).toBe(true)
    expect(XIAOHONGSHU_MESSAGE_URL_REGEX.test('https://evilxiaohongshu.com/explore/abc123')).toBe(false)
    expect(extractXiaohongshuMessageUrl(`小红书 ${link}`)).toBe(link)
  })

  it('extracts Xiaohongshu links from allowed root domains and subdomains', () => {
    const longLink = 'https://creator.xiaohongshu.com/explore/abc123?xsec_token=test-token'
    const shortLink = 'https://share.xhslink.com/o/2fKOpvaOc9C'
    const newShortLink = 'http://share.xhslink.cn/o/1wPOQ9a9RyI'

    expect(extractXiaohongshuMessageUrl(`分享文案 ${longLink} 复制后打开`)).toBe(longLink)
    expect(extractXiaohongshuMessageUrl(`短链 ${shortLink}`)).toBe(shortLink)
    expect(extractXiaohongshuMessageUrl(`新短链 ${newShortLink}`)).toBe(newShortLink)
  })

  it('rejects Xiaohongshu domains outside the URL hostname', () => {
    const invalidLinks = [
      'https://evil.example/path/xiaohongshu.com/explore/abc123',
      'https://evil.example/?next=https://www.xiaohongshu.com/explore/abc123',
      'https://xiaohongshu.com@evil.example/explore/abc123',
      'https://www.xiaohongshu.com.evil.example/explore/abc123',
      'https://evilxiaohongshu.com/explore/abc123',
      'https://invalid..xiaohongshu.com/explore/abc123',
      'https://xhslink.com.evil.example/o/2fKOpvaOc9C',
      'http://xhslink.cn.evil.example/o/1wPOQ9a9RyI'
    ]

    for (const link of invalidLinks) {
      expect(extractXiaohongshuMessageUrl(`小红书 ${link}`), link).toBeNull()
    }
  })

  it('matches and extracts Zhihu links', () => {
    const link = 'https://www.zhihu.com/question/19550283/answer/122329247'
    expect(ZHIHU_MESSAGE_URL_REGEX.test(link)).toBe(true)
    expect(extractZhihuMessageUrl(`知乎 ${link}`)).toBe(link)
  })

  it('matches and extracts Tieba links', () => {
    const link = 'https://tieba.baidu.com/p/1234567890?pid=123'
    expect(TIEBA_MESSAGE_URL_REGEX.test(link)).toBe(true)
    expect(extractTiebaMessageUrl(`贴吧 ${link}`)).toBe(link)
  })

  it('matches and extracts WeChat article links', () => {
    const shortLink = 'https://mp.weixin.qq.com/s/tAJ1B8ClOjQ41TWYJbIFTA'
    const queryLink = 'https://mp.weixin.qq.com/s?__biz=MzA3OTk1MjczNQ==&mid=2651234567&idx=1&sn=abcdef'

    expect(WECHAT_MESSAGE_URL_REGEX.test(shortLink)).toBe(true)
    expect(WECHAT_MESSAGE_URL_REGEX.test(queryLink)).toBe(true)
    expect(extractWechatMessageUrl(`公众号 ${shortLink}`)).toBe(shortLink)
    expect(extractWechatMessageUrl(`文章 ${queryLink}`)).toBe(queryLink)
  })

  it('prefers the full jump URL in WeChat QQ share cards', () => {
    const previewLink = 'https://mp.weixin.qq.com/s/qYm19SUiC4Cid'
    const jumpUrl = 'https://mp.weixin.qq.com/s/qYm19SUiC4CidTfI3gsurA'
    const shareCard = JSON.stringify({
      meta: {
        news: {
          desc: `${previewLink}…`,
          jumpUrl
        }
      }
    })

    expect(extractWechatMessageUrl(shareCard)).toBe(jumpUrl)
  })

  it('matches and extracts Weibo post links', () => {
    const link = 'https://weibo.com/1980237443/Qeq3Dpa2b'
    expect(WEIBO_MESSAGE_URL_REGEX.test(link)).toBe(true)
    expect(extractWeiboMessageUrl(`微博 ${link}`)).toBe(link)
  })

  it('matches and extracts Weibo video show links', () => {
    const link = 'https://video.weibo.com/show?fid=1034:5145615399845897'
    expect(WEIBO_MESSAGE_URL_REGEX.test(link)).toBe(true)
    expect(extractWeiboMessageUrl(`视频 ${link}`)).toBe(link)
  })

  it('matches and extracts X and Twitter status links', () => {
    const xLink = 'https://x.com/cakedochi/status/2050564108114899179'
    const twitterLink = 'https://twitter.com/cakedochi/status/2050564108114899179/video/1'

    expect(X_MESSAGE_URL_REGEX.test(xLink)).toBe(true)
    expect(X_MESSAGE_URL_REGEX.test(twitterLink)).toBe(true)
    expect(extractXMessageUrl(`X ${xLink}`)).toBe(xLink)
    expect(extractXMessageUrl(`Twitter ${twitterLink}`)).toBe(twitterLink)
  })

  it('matches and extracts GitHub repository links', () => {
    const repoLink = 'https://github.com/openai/openai-agents-python?tab=readme-ov-file'
    const treeLink = 'https://github.com/vercel/next.js/tree/canary'

    expect(GITHUB_MESSAGE_URL_REGEX.test(repoLink)).toBe(true)
    expect(GITHUB_MESSAGE_URL_REGEX.test(treeLink)).toBe(true)
    expect(extractGithubMessageUrl(`GitHub ${repoLink}`)).toBe(repoLink)
    expect(extractGithubMessageUrl(`Tree ${treeLink}`)).toBe(treeLink)
  })

  it('detects messages that contain only the extracted link', () => {
    expect(isOnlyExtractedLinkMessage(' https://live.bilibili.com/8139918 ', 'https://live.bilibili.com/8139918')).toBe(true)
    expect(isOnlyExtractedLinkMessage('\\https://v.douyin.com/Cj0KBMUoEg0/', 'https://v.douyin.com/Cj0KBMUoEg0/')).toBe(true)
    expect(isOnlyExtractedLinkMessage('\u200Bhttps://www.xiaohongshu.com/explore/abc123\u200B', 'https://www.xiaohongshu.com/explore/abc123')).toBe(true)
  })

  it('detects plain Bilibili BV and AV tokens as link-only messages', () => {
    expect(isOnlyExtractedLinkMessage('BV12uLq6dEdv', 'BV12uLq6dEdv')).toBe(true)
    expect(isOnlyExtractedLinkMessage(' av170001 ', 'av170001')).toBe(true)
  })

  it('does not treat share cards or user text as link-only messages', () => {
    expect(isOnlyExtractedLinkMessage('标题 https://live.bilibili.com/8139918', 'https://live.bilibili.com/8139918')).toBe(false)
    expect(isOnlyExtractedLinkMessage('看看这个 https://v.douyin.com/Cj0KBMUoEg0/', 'https://v.douyin.com/Cj0KBMUoEg0/')).toBe(false)
    expect(isOnlyExtractedLinkMessage('https://www.xiaohongshu.com/explore/abc123 真不错', 'https://www.xiaohongshu.com/explore/abc123')).toBe(false)
  })

  it('respects the plain title reply setting while keeping legacy configs enabled', () => {
    const link = 'https://www.tiktok.com/@good.ball21/video/7643493503778966797'

    expect(shouldReplyPlainVideoTitle(true, link, link)).toBe(true)
    expect(shouldReplyPlainVideoTitle(undefined, link, link)).toBe(true)
    expect(shouldReplyPlainVideoTitle(false, link, link)).toBe(false)
    expect(shouldReplyPlainVideoTitle(true, `看看 ${link}`, link)).toBe(false)
  })
})
