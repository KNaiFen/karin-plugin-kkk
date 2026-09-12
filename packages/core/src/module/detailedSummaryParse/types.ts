import type { detailedSummaryParseConfig } from '@/types/config/app'

import type { SummaryInput, SummaryResolvedLink, SummaryTaskProgressContext } from '../summaryParse/types'

export type DetailedSummaryRuntimeContext = {
  trigger: {
    keyword: string
    rest: string
  }
  shareContext: string
  links: SummaryResolvedLink[]
}

export type DetailedSummarySource = {
  title?: string
  url: string
  domain: string
}

export type DetailedSummaryResult = {
  inputs: SummaryInput[]
  summaryText: string
  sources: DetailedSummarySource[]
  taskId?: string
  totalLinks?: number
}

export type DetailedSummaryResponsesResult = {
  text: string
  sources: DetailedSummarySource[]
}

export type DetailedSummaryExecutionOptions = {
  config: detailedSummaryParseConfig
}

export type DetailedSummaryTaskProgressContext = SummaryTaskProgressContext

export type DetailedSummaryInput = SummaryInput
