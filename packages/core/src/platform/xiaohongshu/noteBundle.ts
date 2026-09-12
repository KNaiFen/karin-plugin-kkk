import { amagiClient } from '@/module/utils/amagiClient'
import { recordFailureTraceStep } from '@/module/utils/ErrorTrace'
import { getGuestCookieRecoveryStatus } from '@/module/utils/GuestCookieRecovery'
import { resolveSharedJsonCacheWithMerge } from '@/module/utils/sharedCache'

export class XiaohongshuNoteDetailEmptyError extends Error {
  readonly code = 'XIAOHONGSHU_NOTE_DETAIL_EMPTY'
  readonly retryable = true

  constructor () {
    super('小红书笔记详情为空，已跳过缓存，请稍后重试或刷新游客 Cookie')
    this.name = 'XiaohongshuNoteDetailEmptyError'
  }
}

const hasUsableNoteCard = (value: unknown): boolean => {
  return Boolean((value as any)?.data?.data?.items?.[0]?.note_card)
}

export const fetchXiaohongshuNoteBundle = async (idData: {
  note_id: string
  xsec_token: string
}): Promise<any> => {
  const { value } = await resolveSharedJsonCacheWithMerge({
    scope: 'work-bundle',
    key: `xiaohongshu:note:${String(idData.note_id ?? '').trim()}`
  }, {
    isComplete: hasUsableNoteCard,
    loadMissing: async (cached) => {
      const result = await amagiClient.xiaohongshu.fetcher.fetchNoteDetail({
        typeMode: 'strict',
        note_id: idData.note_id,
        xsec_token: idData.xsec_token
      })
      if (hasUsableNoteCard(result)) return result

      recordFailureTraceStep('xiaohongshu.note-bundle.empty', {
        cachedInvalidBundle: Boolean(cached),
        recovery: getGuestCookieRecoveryStatus('xiaohongshu')
      })
      throw new XiaohongshuNoteDetailEmptyError()
    },
    merge: (_cached, loaded) => loaded as any,
    shouldPersist: hasUsableNoteCard
  })
  return value
}
