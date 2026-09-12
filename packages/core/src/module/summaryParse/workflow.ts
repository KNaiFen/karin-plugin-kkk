import { buildSummaryInputFromParsedPost } from '@/platform/parsedPostAdapters'
import type { summaryParseConfig } from '@/types/config/app'

import { enrichSummaryInputWithAsr } from './asr'
import { resolveParsedPostWithCache } from './parsedPostCache'
import { buildSummaryInputProgressContext } from './progress'
import type {
  SummaryInput,
  SummaryResolvedLink,
  SummaryTaskProgressContext
} from './types'

type ResolveSummaryInputWorkflowOptions = {
  config: summaryParseConfig
  link: SummaryResolvedLink
  shareContext?: string
  taskProgress: SummaryTaskProgressContext
  linkIndex: number
  onParsedPostResolved?: (cacheHit: boolean) => void
}

export const resolveSummaryInputWithAsr = async (
  options: ResolveSummaryInputWorkflowOptions
): Promise<SummaryInput> => {
  const { parsedPost, cacheHit } = await resolveParsedPostWithCache(options.link)
  options.onParsedPostResolved?.(cacheHit)

  const input = buildSummaryInputFromParsedPost(parsedPost, options.shareContext)
  return await enrichSummaryInputWithAsr(
    options.config,
    input,
    undefined,
    buildSummaryInputProgressContext(options.taskProgress, input, options.linkIndex)
  )
}
