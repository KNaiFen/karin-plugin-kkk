import axios from 'node-karin/axios'

import { Config } from '@/module/utils/Config'

import { getPbPageReqType, getPbPageResType } from './protobuf'

type UnknownRecord = Record<string, unknown>

export type TiebaContentPart =
  | { type: 'text', text: string }
  | { type: 'image', url: string }
  | { type: 'video', url: string, cover?: string, duration?: number }
  | { type: 'link', url: string, title?: string }
  | { type: 'sticker', url: string, desc?: string }

export interface TiebaAuthor {
  id?: string
  name: string
  avatar?: string
  location?: string
}

export interface TiebaComment {
  id?: string
  floor?: number
  author: TiebaAuthor
  content: TiebaContentPart[]
  stats: {
    like?: number
    reply?: number
  }
  timestamp?: number
  replies: TiebaComment[]
}

export interface TiebaDetail {
  tid: string
  url: string
  title: string
  forum: {
    id?: string
    name?: string
  }
  author: TiebaAuthor
  stats: {
    view?: number
    like?: number
    comment?: number
    share?: number
  }
  timestamp?: number
  content: TiebaContentPart[]
  comments: TiebaComment[]
}

const TIEBA_API = 'http://tiebac.baidu.com/c/f/pb/page'
const TIEBA_REFERER = 'https://tieba.baidu.com/'

const asRecord = (value: unknown): UnknownRecord => {
  return value && typeof value === 'object' ? value as UnknownRecord : {}
}

const field = (source: unknown, ...names: string[]): unknown => {
  const record = asRecord(source)
  for (const name of names) {
    if (record[name] !== undefined && record[name] !== null) return record[name]
  }
  return undefined
}

const stringField = (source: unknown, ...names: string[]): string => {
  const value = field(source, ...names)
  if (value === undefined || value === null) return ''
  return String(value)
}

const numberField = (source: unknown, ...names: string[]): number => {
  const value = field(source, ...names)
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string' && value.trim()) return Number(value)
  return 0
}

const arrayField = (source: unknown, ...names: string[]): unknown[] => {
  const value = field(source, ...names)
  return Array.isArray(value) ? value : []
}

const firstNonEmpty = (...values: Array<string | undefined>): string => {
  return values.find(value => value && value.trim().length > 0) ?? ''
}

const makeTiebaHeaders = (cookie = ''): Record<string, string> => ({
  x_bd_data_type: 'protobuf',
  Connection: 'keep-alive',
  'Accept-Encoding': 'gzip',
  'User-Agent': 'miku/39',
  Host: 'tiebac.baidu.com',
  Referer: TIEBA_REFERER,
  ...(cookie ? { Cookie: cookie } : {})
})

const packReq = (data: Uint8Array): Buffer => {
  const boundary = '-*_r1999'
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="data"; filename="file"\r\n\r\n`),
    Buffer.from(data),
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ])
}

const makeReq = (tid: string, pid?: string): Uint8Array => {
  const PbPageReqIdl = getPbPageReqType()
  const message = PbPageReqIdl.create({
    data: {
      common: {
        _client_type: 2,
        _client_version: '12.64.1.1'
      },
      kz: tid,
      pn: 1,
      rn: 30,
      r: 0,
      lz: 0,
      pid: pid ? Number(pid) : 0,
      with_floor: 1,
      floor_sort_type: 1,
      floor_rn: 4
    }
  })
  return PbPageReqIdl.encode(message).finish()
}

const decodeRes = (data: Buffer): UnknownRecord => {
  const PbPageResIdl = getPbPageResType()
  const decoded = asRecord(PbPageResIdl.decode(data))
  const error = asRecord(field(decoded, 'error'))
  const errorNo = numberField(error, 'errorno', 'errorNo')
  if (errorNo) {
    throw new Error(stringField(error, 'errmsg', 'errMsg') || `贴吧接口返回错误: ${errorNo}`)
  }
  return asRecord(field(decoded, 'data'))
}

const userAvatar = (portrait: string): string | undefined => {
  const cleanPortrait = portrait.includes('?') ? portrait.slice(0, portrait.indexOf('?')) : portrait
  return cleanPortrait ? `http://tb.himg.baidu.com/sys/portraith/item/${cleanPortrait}` : undefined
}

const parseAuthor = (user: unknown, fallbackId?: string): TiebaAuthor => {
  const id = stringField(user, 'id') || fallbackId
  const portrait = stringField(user, 'portrait')
  return {
    id,
    name: firstNonEmpty(stringField(user, 'name_show', 'nameShow'), stringField(user, 'name'), id, '未知用户'),
    avatar: userAvatar(portrait),
    location: stringField(user, 'ip_address', 'ipAddress') || undefined
  }
}

const resolveCheckedUrl = (url: string): string => {
  try {
    const parsed = new URL(url)
    return parsed.pathname === '/mo/q/checkurl'
      ? parsed.searchParams.get('url') ?? url
      : url
  } catch {
    return url
  }
}

const parseContentParts = (contents: unknown[]): TiebaContentPart[] => {
  const parts: TiebaContentPart[] = []

  for (const content of contents) {
    const type = numberField(content, 'type')
    if ([0, 9, 18, 27, 40].includes(type)) {
      const text = stringField(content, 'text')
      if (text) parts.push({ type: 'text', text })
      continue
    }
    if ([2, 11].includes(type)) {
      const id = stringField(content, 'text')
      if (id) {
        parts.push({
          type: 'sticker',
          url: `https://emoji.awkchan.top/assets/tieba/${id}.webp`,
          desc: stringField(content, 'c') || undefined
        })
      }
      continue
    }
    if ([3, 20].includes(type)) {
      const url = firstNonEmpty(
        stringField(content, 'origin_src', 'originSrc'),
        stringField(content, 'big_cdn_src', 'bigCdnSrc'),
        stringField(content, 'cdn_src', 'cdnSrc'),
        stringField(content, 'src')
      )
      if (url) parts.push({ type: 'image', url })
      continue
    }
    if (type === 4) {
      const text = stringField(content, 'text')
      if (text) parts.push({ type: 'text', text: `@${text.replace(/^@/, '')} ` })
      continue
    }
    if (type === 1) {
      const rawUrl = stringField(content, 'link')
      const url = resolveCheckedUrl(rawUrl)
      if (url) parts.push({ type: 'link', url, title: stringField(content, 'text') || undefined })
      continue
    }
    if (type === 5) {
      const url = firstNonEmpty(stringField(content, 'video_url', 'videoUrl'), stringField(content, 'src'))
      if (url) {
        parts.push({
          type: 'video',
          url,
          cover: firstNonEmpty(stringField(content, 'thumbnail_url', 'thumbnailUrl'), stringField(content, 'cdn_src', 'cdnSrc')) || undefined,
          duration: numberField(content, 'video_duration', 'videoDuration', 'during_time', 'duringTime') || undefined
        })
      }
      continue
    }
    if ([35, 36, 37].includes(type)) {
      const plusInfo = field(content, 'tiebaplus_info', 'tiebaplusInfo')
      const desc = stringField(plusInfo, 'desc')
      const url = stringField(plusInfo, 'jump_url', 'jumpUrl')
      if (desc) parts.push({ type: 'text', text: desc })
      if (url) parts.push({ type: 'link', url })
    }
  }

  return mergeAdjacentText(parts)
}

const mergeAdjacentText = (parts: TiebaContentPart[]): TiebaContentPart[] => {
  const merged: TiebaContentPart[] = []
  for (const part of parts) {
    const last = merged[merged.length - 1]
    if (part.type === 'text' && last?.type === 'text') {
      last.text += part.text
    } else {
      merged.push(part)
    }
  }
  return merged
}

const parseThreadVideo = (thread: unknown): TiebaContentPart[] => {
  const video = field(thread, 'video_info', 'videoInfo')
  const url = stringField(video, 'video_url', 'videoUrl')
  if (!url) return []
  return [{
    type: 'video',
    url,
    cover: stringField(video, 'thumbnail_url', 'thumbnailUrl') || undefined,
    duration: numberField(video, 'video_duration', 'videoDuration') || undefined
  }]
}

const postIsBot = (post: unknown): boolean => {
  const chatContent = field(post, 'chat_content', 'chatContent')
  return Boolean(stringField(chatContent, 'bot_uk', 'botUk'))
}

const buildUserMap = (users: unknown[]): Map<string, TiebaAuthor> => {
  const map = new Map<string, TiebaAuthor>()
  for (const user of users) {
    const author = parseAuthor(user)
    if (author.id) map.set(author.id, author)
  }
  return map
}

const authorForPost = (post: unknown, users: Map<string, TiebaAuthor>): TiebaAuthor => {
  const authorId = stringField(post, 'author_id', 'authorId')
  return users.get(authorId) ?? parseAuthor(field(post, 'author'), authorId)
}

const parseSubComments = (post: unknown, parentFloor?: number): TiebaComment[] => {
  const subPost = field(post, 'sub_post_list', 'subPostList')
  const rawComments = arrayField(subPost, 'sub_post_list', 'subPostList')
  return rawComments.slice(0, 3).map((comment): TiebaComment => ({
    id: stringField(comment, 'id'),
    floor: parentFloor,
    author: parseAuthor(field(comment, 'author'), stringField(comment, 'author_id', 'authorId')),
    content: parseContentParts(arrayField(comment, 'content')),
    stats: {
      like: numberField(field(comment, 'agree'), 'agree_num', 'agreeNum') || undefined
    },
    timestamp: numberField(comment, 'time') || undefined,
    replies: []
  }))
}

const parseComments = (posts: unknown[], users: Map<string, TiebaAuthor>, limit: number, threadAuthorId: string): TiebaComment[] => {
  const floorComments = posts.slice(1)
  const mainAuthorPosts = floorComments.filter(post => stringField(post, 'author_id', 'authorId') === threadAuthorId)
  const otherPosts = floorComments.filter(post => stringField(post, 'author_id', 'authorId') !== threadAuthorId)
  const selected = [...mainAuthorPosts, ...otherPosts].slice(0, Math.max(0, limit))

  return selected.map((post): TiebaComment => {
    const floor = numberField(post, 'floor') || undefined
    return {
      id: stringField(post, 'id'),
      floor,
      author: authorForPost(post, users),
      content: parseContentParts(arrayField(post, 'content')),
      stats: {
        like: numberField(field(post, 'agree'), 'agree_num', 'agreeNum') || undefined,
        reply: numberField(post, 'sub_post_number', 'subPostNumber') || undefined
      },
      timestamp: numberField(post, 'time') || undefined,
      replies: parseSubComments(post, floor)
    }
  })
}

const contentText = (parts: TiebaContentPart[]): string => {
  return parts
    .map(part => {
      if (part.type === 'text') return part.text
      if (part.type === 'link') return part.title ? `${part.title}: ${part.url}` : part.url
      if (part.type === 'sticker') return part.desc ? `[${part.desc}]` : '[表情]'
      return ''
    })
    .join('')
    .trim()
}

export const getTiebaPostDetail = async (tid: string, pid?: string): Promise<TiebaDetail> => {
  const cookie = Config.cookies.tieba || ''
  const body = packReq(makeReq(tid, pid))
  const response = await axios.post<ArrayBuffer>(TIEBA_API, body, {
    params: { cmd: 302001 },
    responseType: 'arraybuffer',
    headers: {
      ...makeTiebaHeaders(cookie),
      'Content-Type': 'multipart/form-data; boundary=-*_r1999'
    }
  })

  const data = decodeRes(Buffer.from(response.data))
  const forum = field(data, 'forum')
  const thread = field(data, 'thread')
  const posts = arrayField(data, 'post_list', 'postList').filter(post => !postIsBot(post))
  const users = buildUserMap(arrayField(data, 'user_list', 'userList'))
  const mainPost = posts[0]
  const threadAuthor = parseAuthor(field(thread, 'author'), stringField(thread, 'author_id', 'authorId'))
  const mainContent = parseContentParts(arrayField(mainPost, 'content'))
  const content = mainContent.length > 0
    ? mainContent
    : parseContentParts(arrayField(thread, 'first_post_content', 'firstPostContent'))
  const videoParts = parseThreadVideo(thread)
  const detailContent = [...content, ...videoParts]
  const threadAuthorId = threadAuthor.id ?? stringField(thread, 'author_id', 'authorId')

  return {
    tid,
    url: `https://tieba.baidu.com/p/${tid}`,
    title: stringField(thread, 'title') || contentText(detailContent).slice(0, 40) || `贴吧帖子 ${tid}`,
    forum: {
      id: stringField(forum, 'id') || undefined,
      name: stringField(forum, 'name') || undefined
    },
    author: threadAuthor,
    stats: {
      view: numberField(data, 'thread_freq_num', 'threadFreqNum') || numberField(thread, 'view_num', 'viewNum') || undefined,
      like: numberField(field(thread, 'agree'), 'agree_num', 'agreeNum') || undefined,
      comment: numberField(thread, 'reply_num', 'replyNum') || undefined,
      share: numberField(thread, 'share_num', 'shareNum') || undefined
    },
    timestamp: numberField(thread, 'create_time', 'createTime') || undefined,
    content: detailContent,
    comments: parseComments(posts, users, Config.tieba.numcomment ?? 5, threadAuthorId)
  }
}

export const getTiebaContentText = contentText
export const tiebaMediaHeaders = (cookie = Config.cookies.tieba || ''): Record<string, string> => ({
  Referer: TIEBA_REFERER,
  ...(cookie ? { Cookie: cookie } : {})
})
