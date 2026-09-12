import type { transcriptOriginalConfig } from '@/types/config/app'

import type { SummaryInput, SummaryResolvedLink, SummaryTaskProgressContext } from '../summaryParse/types'

export type TranscriptOriginalRuntimeContext = {
  trigger: {
    keyword: string
    rest: string
  }
  shareContext: string
  links: SummaryResolvedLink[]
}

export type TranscriptOriginalResult = {
  inputs: SummaryInput[]
  transcriptText: string
  taskId?: string
  totalLinks?: number
}

export type TranscriptOriginalResponsesResult = {
  text: string
}

export type TranscriptOriginalExecutionOptions = {
  config: transcriptOriginalConfig
}

export type TranscriptOriginalTaskProgressContext = SummaryTaskProgressContext

export type TranscriptOriginalInput = SummaryInput
