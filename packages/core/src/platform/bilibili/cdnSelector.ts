export type BilibiliCdnUrlCarrier = {
  url?: string
  base_url?: string
  baseUrl?: string
  backup_url?: string[] | null
  backupUrl?: string[] | null
}

const lowPriorityBilibiliCdnHosts = [
  'mcdn.bilivideo.cn',
  'pcdn.bilivideo.cn'
]

const lowPriorityBilibiliCdnSuffixes = lowPriorityBilibiliCdnHosts.map(host => `.${host}`)

export const isBilibiliLowPriorityCdnUrl = (url: string): boolean => {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return lowPriorityBilibiliCdnHosts.includes(hostname) ||
      lowPriorityBilibiliCdnSuffixes.some(suffix => hostname.endsWith(suffix))
  } catch {
    const normalized = url.toLowerCase()
    return lowPriorityBilibiliCdnHosts.some(host => normalized.includes(host)) ||
      lowPriorityBilibiliCdnSuffixes.some(suffix => normalized.includes(suffix))
  }
}

export const isBilibiliMcdnUrl = (url: string): boolean => {
  return isBilibiliLowPriorityCdnUrl(url)
}

const uniqueUrls = (urls: Array<string | undefined | null>): string[] => {
  const result: string[] = []
  for (const url of urls) {
    const normalized = url?.trim()
    if (normalized && !result.includes(normalized)) result.push(normalized)
  }
  return result
}

export const collectBilibiliCdnBackupUrls = (stream: BilibiliCdnUrlCarrier): string[] => {
  return uniqueUrls([
    ...(stream.backup_url ?? []),
    ...(stream.backupUrl ?? [])
  ])
}

export const preferBilibiliNonMcdnUrls = <T extends BilibiliCdnUrlCarrier>(stream: T): T => {
  const urls = uniqueUrls([
    stream.base_url,
    stream.baseUrl,
    ...(stream.backup_url ?? []),
    ...(stream.backupUrl ?? [])
  ])
  if (urls.length === 0) return stream

  const sorted = [
    ...urls.filter(url => !isBilibiliLowPriorityCdnUrl(url)),
    ...urls.filter(isBilibiliLowPriorityCdnUrl)
  ]
  const [primary, ...backup] = sorted

  return {
    ...stream,
    base_url: primary,
    baseUrl: primary,
    backup_url: backup,
    backupUrl: backup
  }
}

export const rewriteBilibiliCdnUrlCarrier = <T extends BilibiliCdnUrlCarrier>(stream: T): T => {
  const rewritten = preferBilibiliNonMcdnUrls(stream)
  if (!stream.url) return rewritten

  const urls = uniqueUrls([
    stream.url,
    ...(stream.backup_url ?? []),
    ...(stream.backupUrl ?? [])
  ])
  const sorted = [
    ...urls.filter(url => !isBilibiliLowPriorityCdnUrl(url)),
    ...urls.filter(isBilibiliLowPriorityCdnUrl)
  ]
  const [primary, ...backup] = sorted

  return {
    ...rewritten,
    url: primary,
    backup_url: backup,
    backupUrl: backup
  }
}
