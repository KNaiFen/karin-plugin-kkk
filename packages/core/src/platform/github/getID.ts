import { logger } from 'node-karin'

import { Networks } from '@/module/utils/Networks'
import { normalizeAxiosProxy } from '@/module/utils/RequestConfig'
import { Config } from '@/module/utils/Config'

import type { GithubRepositoryIdData } from './types'

const GITHUB_HOSTS = new Set(['github.com', 'www.github.com'])
const DISALLOWED_SEGMENTS = new Set(['issues', 'pull', 'pulls', 'blob', 'commit', 'commits', 'releases', 'actions', 'wiki', 'projects', 'security', 'network', 'stargazers', 'watchers', 'forks', 'discussions', 'packages', 'tags', 'compare', 'milestones'])

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const normalizeRepositoryUrl = (url: URL): string => {
  return `https://github.com/${url.pathname.split('/').filter(Boolean).slice(0, 2).join('/')}`
}

export const parseGithubLongLink = (rawUrl: string): GithubRepositoryIdData => {
  const normalized = safeDecode(rawUrl.trim())
  let url: URL

  try {
    url = new URL(normalized)
  } catch {
    return { type: 'unknown', url: rawUrl }
  }

  if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) {
    return { type: 'unknown', url: normalized }
  }

  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length < 2) {
    return { type: 'unknown', url: normalized }
  }

  const [owner, repo, third, fourth] = segments
  if (!owner || !repo) {
    return { type: 'unknown', url: normalized }
  }

  if (segments.length > 2) {
    if (third === 'tree' && fourth) {
      return {
        type: 'repository',
        owner,
        repo,
        branch: safeDecode(segments.slice(3).join('/')),
        url: normalizeRepositoryUrl(url)
      }
    }

    if (DISALLOWED_SEGMENTS.has(third)) {
      return { type: 'unknown', url: normalized }
    }

    return { type: 'unknown', url: normalized }
  }

  return {
    type: 'repository',
    owner,
    repo,
    url: normalizeRepositoryUrl(url)
  }
}

export const getGithubID = async (url: string, log = true): Promise<GithubRepositoryIdData> => {
  const direct = parseGithubLongLink(url)
  if (direct.type !== 'unknown') {
    log && logger.info(`[GitHub] 链接解析结果：${JSON.stringify(direct)}`)
    return direct
  }

  const longLink = await new Networks({
    url,
    networkOptions: {
      proxy: normalizeAxiosProxy(Config.github?.proxy)
    },
    outboundProfile: 'github-redirect'
  }).getLongLink()
  const result = parseGithubLongLink(longLink)
  if (result.type === 'unknown') {
    throw new Error('无法从链接中提取 GitHub 仓库信息')
  }

  log && logger.info(`[GitHub] 链接解析结果：${JSON.stringify(result)}`)
  return result
}
