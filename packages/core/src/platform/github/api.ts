import axios from 'node-karin/axios'
import { markdown as renderMarkdownHtml } from '@karinjs/md-html'

import { baseHeaders, buildConfiguredRequestOptions } from '@/module'
import { Config } from '@/module/utils/Config'
import { executeSafeAxiosRequest } from '@/module/utils/OutboundRequest'

import type {
  GithubReadmeDetail,
  GithubRepositoryApiDetail,
  GithubRepositoryDetail,
  GithubRepositoryHtmlFallback,
  GithubRepositoryIdData
} from './types'

const GITHUB_API_ORIGIN = 'https://api.github.com'
const GITHUB_WEB_ORIGIN = 'https://github.com'
const GITHUB_WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'

type GithubApiRepositoryResponse = {
  full_name?: string
  html_url?: string
  name?: string
  description?: string | null
  homepage?: string | null
  language?: string | null
  default_branch?: string | null
  archived?: boolean
  topics?: string[]
  stargazers_count?: number
  forks_count?: number
  watchers_count?: number
  subscribers_count?: number
  open_issues_count?: number
  created_at?: string
  updated_at?: string
  pushed_at?: string
  owner?: {
    login?: string
    avatar_url?: string
    html_url?: string
    type?: string
  }
  license?: {
    spdx_id?: string | null
    name?: string | null
  } | null
  organization?: {
    avatar_url?: string
  }
}

type GithubApiReadmeResponse = {
  name?: string
  path?: string
  html_url?: string
  download_url?: string
  content?: string
  encoding?: string
  size?: number
}

const buildGithubConfiguredRequestOptions = (outboundProfile: 'github-api' | 'github-page') => buildConfiguredRequestOptions({
  ...Config.request,
  proxy: Config.github?.proxy
}, {
  maxRedirects: 5,
  userAgentFallback: GITHUB_WEB_UA,
  outboundProfile
})

const getGithubToken = (): string => String((Config as { github?: { token?: string } }).github?.token ?? '').trim()

const createGithubApiHeaders = (): Record<string, string> => {
  const token = getGithubToken()
  return {
    ...baseHeaders,
    Accept: 'application/vnd.github+json',
    'User-Agent': GITHUB_WEB_UA,
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  } as Record<string, string>
}

const createGithubPageHeaders = (): Record<string, string> => ({
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  Referer: GITHUB_WEB_ORIGIN,
  'User-Agent': GITHUB_WEB_UA
})

const toTrimmed = (value: unknown): string => String(value ?? '').trim()

const toOptionalTrimmed = (value: unknown): string | undefined => {
  const normalized = toTrimmed(value)
  return normalized || undefined
}

const toNumber = (value: unknown): number | undefined => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const decodeHtmlEntities = (value: string): string => {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
}

const decodeBase64Utf8 = (value: string): string => {
  return Buffer.from(value.replace(/\s+/g, ''), 'base64').toString('utf8')
}

const normalizeMarkdown = (value: string): string => {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .trim()
}

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const extractMarkdownImage = (markdown: string): string | undefined => {
  for (const match of markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const candidate = match[1]?.trim()
    if (!candidate || candidate.startsWith('#')) continue
    if (/^https?:\/\//i.test(candidate)) return candidate
  }
  return undefined
}

const normalizeGithubRelativeUrl = (value: string, idData: GithubRepositoryIdData): string => {
  const source = String(value ?? '').trim()
  if (!source || source.startsWith('#')) return source
  if (/^(?:https?:)?\/\//i.test(source)) return source.startsWith('//') ? `https:${source}` : source
  if (/^(?:mailto|tel|data|javascript):/i.test(source)) return source
  if (source.startsWith('/')) return new URL(source, GITHUB_WEB_ORIGIN).toString()
  if (idData.type === 'repository' && idData.owner && idData.repo) {
    const branch = idData.branch || 'main'
    if (source.startsWith('./') || source.startsWith('../') || !source.startsWith('/')) {
      return `${GITHUB_WEB_ORIGIN}/${encodeURIComponent(idData.owner)}/${encodeURIComponent(idData.repo)}/blob/${encodeURIComponent(branch)}/${source.replace(/^\.?\//, '')}`
    }
  }
  return source
}

const normalizeGithubReadmeHtmlUrls = (html: string, idData: GithubRepositoryIdData): string => {
  let normalized = String(html ?? '')
  normalized = normalized.replace(/\b(href|src)\s*=\s*(["'])(.*?)\2/gi, (_full, attr: string, quote: string, value: string) => {
    const nextValue = normalizeGithubRelativeUrl(value, idData)
    return `${attr}=${quote}${nextValue}${quote}`
  })
  return normalized
}

export const extractGithubReadmeBodyHtml = (html: string): string => {
  const match = html.match(/<article[^>]*class=["'][^"']*markdown-body[^"']*["'][^>]*>([\s\S]*?)<\/article>/i)
  return String(match?.[1] ?? '').trim()
}

const extractGithubReadmeImage = (html: string): string | undefined => {
  for (const match of html.matchAll(/<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi)) {
    const candidate = String(match[2] ?? '').trim()
    if (!candidate) continue
    if (/^https?:\/\//i.test(candidate)) return candidate
    if (candidate.startsWith('//')) return `https:${candidate}`
  }
  return undefined
}

export const buildGithubReadmeRenderContent = (
  readme: GithubReadmeDetail | undefined,
  options?: {
    idData?: GithubRepositoryIdData
  }
): {
    html: string
    image?: string
  } => {
  if (!readme?.content) return { html: '' }
  const normalizedMarkdown = normalizeMarkdown(readme.content)
  const rendered = renderMarkdownHtml(normalizedMarkdown, {
    katex: {
      output: 'htmlAndMathml',
      throwOnError: false
    }
  })
  const bodyHtml = extractGithubReadmeBodyHtml(rendered)
  const normalizedHtml = options?.idData ? normalizeGithubReadmeHtmlUrls(bodyHtml, options.idData) : bodyHtml

  return {
    html: normalizedHtml,
    image: extractGithubReadmeImage(normalizedHtml) || extractMarkdownImage(normalizedMarkdown)
  }
}

const extractMetaContent = (html: string, key: string, attr: 'property' | 'name' = 'property'): string | undefined => {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`<meta[^>]+${attr}=["']${escapedKey}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${escapedKey}["'][^>]*>`, 'i')
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return decodeHtmlEntities(match[1]).trim()
  }
  return undefined
}

const extractCanonicalUrl = (html: string): string | undefined => {
  const match = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i)
  return match?.[1]?.trim()
}

const extractTitle = (html: string): string | undefined => {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i)
  return match?.[1] ? decodeHtmlEntities(match[1]).replace(/\s+/g, ' ').trim() : undefined
}

const extractRepoStatsFromHtml = (html: string): Array<{ label: string, value: string }> => {
  const result: Array<{ label: string, value: string }> = []
  const patterns: Array<{ label: string, regex: RegExp }> = [
    { label: 'Star', regex: /"stargazerCount":\s*(\d+)/i },
    { label: 'Fork', regex: /"forkCount":\s*(\d+)/i },
    { label: 'Watcher', regex: /"watchingCount":\s*(\d+)/i }
  ]

  for (const item of patterns) {
    const match = html.match(item.regex)
    if (match?.[1]) result.push({ label: item.label, value: match[1] })
  }

  return result
}

const createRepositoryApiDetail = (payload: GithubApiRepositoryResponse): GithubRepositoryApiDetail => {
  const ownerLogin = toTrimmed(payload.owner?.login)
  return {
    fullName: toTrimmed(payload.full_name) || `${ownerLogin}/${toTrimmed(payload.name)}`,
    owner: {
      login: ownerLogin,
      avatarUrl: toOptionalTrimmed(payload.owner?.avatar_url),
      htmlUrl: toOptionalTrimmed(payload.owner?.html_url),
      type: toOptionalTrimmed(payload.owner?.type)
    },
    name: toTrimmed(payload.name),
    description: toOptionalTrimmed(payload.description),
    homepage: toOptionalTrimmed(payload.homepage),
    language: toOptionalTrimmed(payload.language),
    defaultBranch: toOptionalTrimmed(payload.default_branch),
    archived: Boolean(payload.archived),
    topics: Array.isArray(payload.topics) ? payload.topics.map(item => toTrimmed(item)).filter(Boolean) : [],
    stargazersCount: toNumber(payload.stargazers_count),
    forksCount: toNumber(payload.forks_count),
    watchersCount: toNumber(payload.watchers_count),
    subscribersCount: toNumber(payload.subscribers_count),
    openIssuesCount: toNumber(payload.open_issues_count),
    createdAt: toOptionalTrimmed(payload.created_at),
    updatedAt: toOptionalTrimmed(payload.updated_at),
    pushedAt: toOptionalTrimmed(payload.pushed_at),
    htmlUrl: toTrimmed(payload.html_url),
    license: toOptionalTrimmed(payload.license?.spdx_id) || toOptionalTrimmed(payload.license?.name),
    socialPreviewImage: toOptionalTrimmed(payload.organization?.avatar_url)
  }
}

export const fetchGithubRepositoryDetail = async (
  idData: GithubRepositoryIdData
): Promise<GithubRepositoryApiDetail> => {
  if (idData.type !== 'repository' || !idData.owner || !idData.repo) {
    throw new Error('暂不支持解析该 GitHub 链接')
  }

  const requestOptions = buildGithubConfiguredRequestOptions('github-api')

  const response = await axios.get<GithubApiRepositoryResponse>(
    `${GITHUB_API_ORIGIN}/repos/${encodeURIComponent(idData.owner)}/${encodeURIComponent(idData.repo)}`,
    {
      ...requestOptions,
      headers: {
        ...requestOptions.headers,
        ...createGithubApiHeaders()
      }
    }
  )

  return createRepositoryApiDetail(response.data ?? {})
}

export const fetchGithubReadme = async (
  idData: GithubRepositoryIdData
): Promise<GithubReadmeDetail> => {
  if (idData.type !== 'repository' || !idData.owner || !idData.repo) {
    throw new Error('暂不支持解析该 GitHub 链接')
  }

  const requestOptions = buildGithubConfiguredRequestOptions('github-api')

  const response = await axios.get<GithubApiReadmeResponse>(
    `${GITHUB_API_ORIGIN}/repos/${encodeURIComponent(idData.owner)}/${encodeURIComponent(idData.repo)}/readme`,
    {
      ...requestOptions,
      headers: {
        ...requestOptions.headers,
        ...createGithubApiHeaders()
      }
    }
  )

  const payload = response.data ?? {}
  const encoding = toOptionalTrimmed(payload.encoding)
  const rawContent = String(payload.content ?? '')
  const content = encoding === 'base64' ? decodeBase64Utf8(rawContent) : rawContent

  return {
    name: toOptionalTrimmed(payload.name),
    path: toOptionalTrimmed(payload.path),
    htmlUrl: toOptionalTrimmed(payload.html_url),
    downloadUrl: toOptionalTrimmed(payload.download_url),
    content: normalizeMarkdown(content),
    encoding,
    size: toNumber(payload.size)
  }
}

export const extractGithubRepositoryMetadataFromHtml = (
  html: string,
  fallbackUrl: string
): GithubRepositoryHtmlFallback => {
  const canonical = extractCanonicalUrl(html) || fallbackUrl
  const canonicalUrl = new URL(canonical, GITHUB_WEB_ORIGIN)
  const segments = canonicalUrl.pathname.split('/').filter(Boolean)
  const owner = segments[0] ?? ''
  const repo = segments[1] ?? ''
  const fullName = owner && repo ? `${owner}/${repo}` : toTrimmed(extractMetaContent(html, 'og:title')) || 'GitHub 仓库'
  const description = toOptionalTrimmed(extractMetaContent(html, 'og:description')) || toOptionalTrimmed(extractMetaContent(html, 'description', 'name'))
  const ogImage = toOptionalTrimmed(extractMetaContent(html, 'og:image'))

  return {
    url: owner && repo ? `${GITHUB_WEB_ORIGIN}/${owner}/${repo}` : canonicalUrl.toString(),
    title: extractTitle(html) || fullName,
    fullName,
    owner,
    repo,
    description,
    ogImage,
    stats: extractRepoStatsFromHtml(html),
    meta: [],
    authorAvatar: undefined
  }
}

export const fetchGithubRepositoryPage = async (
  idData: GithubRepositoryIdData
): Promise<GithubRepositoryHtmlFallback> => {
  if (idData.type !== 'repository' || !idData.owner || !idData.repo) {
    throw new Error('暂不支持解析该 GitHub 链接')
  }

  const requestOptions = buildGithubConfiguredRequestOptions('github-page')

  const { response } = await executeSafeAxiosRequest<string>({
    url: `${GITHUB_WEB_ORIGIN}/${encodeURIComponent(idData.owner)}/${encodeURIComponent(idData.repo)}`,
    method: 'GET',
    headers: {
      ...requestOptions.headers,
      ...createGithubPageHeaders()
    },
    timeout: requestOptions.timeout,
    proxy: requestOptions.proxy,
    responseType: 'text'
  }, {
    profile: 'github-page'
  })

  return extractGithubRepositoryMetadataFromHtml(String(response.data ?? ''), `${GITHUB_WEB_ORIGIN}/${idData.owner}/${idData.repo}`)
}

export const fetchGithubReadmeHtmlFromPage = async (
  idData: GithubRepositoryIdData
): Promise<string | undefined> => {
  if (idData.type !== 'repository' || !idData.owner || !idData.repo) return undefined

  const requestOptions = buildGithubConfiguredRequestOptions('github-page')

  const { response } = await executeSafeAxiosRequest<string>({
    url: `${GITHUB_WEB_ORIGIN}/${encodeURIComponent(idData.owner)}/${encodeURIComponent(idData.repo)}`,
    method: 'GET',
    headers: {
      ...requestOptions.headers,
      ...createGithubPageHeaders()
    },
    timeout: requestOptions.timeout,
    proxy: requestOptions.proxy,
    responseType: 'text'
  }, {
    profile: 'github-page'
  })

  const pageHtml = String(response.data ?? '')
  const rawReadmeHtml = extractGithubReadmeBodyHtml(pageHtml)
  if (!rawReadmeHtml) return undefined

  let normalized = normalizeGithubReadmeHtmlUrls(rawReadmeHtml, idData)

  if (idData.owner && idData.repo) {
    const owner = escapeRegex(idData.owner)
    const repo = escapeRegex(idData.repo)
    const repoPrefix = `https://github.com/${idData.owner}/${idData.repo}`
    normalized = normalized
      .replace(new RegExp(`href=(["'])/${owner}/${repo}/blob/`, 'gi'), `href=$1${repoPrefix}/blob/`)
      .replace(new RegExp(`href=(["'])/${owner}/${repo}/raw/`, 'gi'), `href=$1${repoPrefix}/raw/`)
      .replace(new RegExp(`src=(["'])/${owner}/${repo}/raw/`, 'gi'), `src=$1${repoPrefix}/raw/`)
  }

  return normalized
}

export const fetchGithubRepositoryCompositeDetail = async (
  idData: GithubRepositoryIdData
): Promise<GithubRepositoryDetail> => {
  const token = getGithubToken()
  let repository: GithubRepositoryApiDetail | GithubRepositoryHtmlFallback | null = null
  let readme: GithubReadmeDetail | undefined
  let readmeHtml: string | undefined
  let apiError: unknown

  if (token) {
    try {
      repository = await fetchGithubRepositoryDetail(idData)
      try {
        readme = await fetchGithubReadme(idData)
      } catch {
        readme = undefined
      }
      try {
        readmeHtml = await fetchGithubReadmeHtmlFromPage(idData)
        return {
          source: 'api',
          repository,
          readme,
          readmeHtml,
          readmeHtmlSource: 'page'
        }
      } catch {
        readmeHtml = buildGithubReadmeRenderContent(readme, { idData }).html || undefined
      }
      return {
        source: 'api',
        repository,
        readme,
        readmeHtml,
        readmeHtmlSource: readmeHtml ? 'rendered' : undefined
      }
    } catch (error) {
      apiError = error
    }
  }

  try {
    repository = await fetchGithubRepositoryPage(idData)
    try {
      readmeHtml = await fetchGithubReadmeHtmlFromPage(idData)
    } catch {
      readmeHtml = undefined
    }
    return {
      source: 'html',
      repository,
      readmeHtml,
      readmeHtmlSource: readmeHtml ? 'page' : undefined
    }
  } catch (htmlError) {
    if (apiError) {
      throw new Error(`GitHub API 与页面兜底都失败：${apiError instanceof Error ? apiError.message : String(apiError)}；${htmlError instanceof Error ? htmlError.message : String(htmlError)}`)
    }
    throw htmlError
  }
}
