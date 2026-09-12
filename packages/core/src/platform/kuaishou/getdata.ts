import { type KuaishouDataOptionsMap } from '@ikenxuan/amagi'

import { kuaishouFetcher } from '@/module/utils/amagiClient'
import { resolveSharedJsonCache } from '@/module/utils/sharedCache'
import { KuaishouDataTypes } from '@/types'

type UnknownRecord = Record<string, unknown>

const isRecord = (value: unknown): value is UnknownRecord => {
  return typeof value === 'object' && value !== null
}

const isStrictSuccess = (value: unknown): value is UnknownRecord & { success: true, data: UnknownRecord } => {
  return isRecord(value) && value.success === true && isRecord(value.data)
}

const isValidVideoData = (value: unknown): boolean => {
  if (!isStrictSuccess(value)) return false
  const data = value.data.data
  if (!isRecord(data)) return false
  const detail = data.visionVideoDetail
  if (!isRecord(detail) || detail.status !== 1) return false
  const photo = detail.photo
  return isRecord(photo) && typeof photo.photoUrl === 'string' && photo.photoUrl.trim().length > 0
}

const isValidCommentsData = (value: unknown): boolean => {
  if (!isStrictSuccess(value)) return false
  const data = value.data.data
  if (!isRecord(data)) return false
  const comments = data.visionCommentList
  return isRecord(comments) && Array.isArray(comments.rootComments)
}

const isValidEmojiData = (value: unknown): boolean => {
  if (!isStrictSuccess(value)) return false
  const data = value.data.data
  if (!isRecord(data)) return false
  const emoticons = data.visionBaseEmoticons
  return isRecord(emoticons) && isRecord(emoticons.iconUrls) && Object.keys(emoticons.iconUrls).length > 0
}

const isCacheableBundle = (
  VideoData: unknown,
  CommentsData: unknown,
  EmojiData: unknown
): boolean => isValidVideoData(VideoData) && isValidCommentsData(CommentsData) && isValidEmojiData(EmojiData)

export const fetchKuaishouData = async <T extends keyof KuaishouDataTypes> (
  type: T,
  opt?: any
) => {
  switch (type) {
    case 'one_work': {
      const photoId = String((opt as KuaishouDataOptionsMap['videoWork']['opt']).photoId ?? '').trim()
      const { value } = await resolveSharedJsonCache({
        scope: 'work-bundle',
        key: `kuaishou:one_work:${photoId}`
      }, async () => {
        const [VideoData, CommentsData, EmojiData] = await Promise.all([
          kuaishouFetcher.fetchVideoWork({
            photoId,
            typeMode: 'strict'
          }),
          kuaishouFetcher.fetchWorkComments({
            photoId,
            typeMode: 'strict'
          }),
          kuaishouFetcher.fetchEmojiList({ typeMode: 'strict' })
        ])
        return { VideoData, CommentsData, EmojiData }
      }, {
        shouldPersist: ({ VideoData, CommentsData, EmojiData }) => {
          return isCacheableBundle(VideoData, CommentsData, EmojiData)
        }
      })
      return value
    }
    case 'work_comments': {
      const CommentsData = await kuaishouFetcher.fetchWorkComments({
        photoId: (opt as KuaishouDataOptionsMap['comments']['opt']).photoId,
        typeMode: 'strict'
      })
      return CommentsData.data
    }
    case 'emoji_list': {
      const EmojiData = await kuaishouFetcher.fetchEmojiList({ typeMode: 'strict' })
      return EmojiData
    }
    default: {
      break
    }
  }
}
