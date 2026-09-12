export type GithubRepositoryIdData = {
  type: 'repository' | 'unknown'
  url: string
  owner?: string
  repo?: string
  branch?: string
}

export type GithubRepositoryApiDetail = {
  fullName: string
  owner: {
    login: string
    avatarUrl?: string
    htmlUrl?: string
    type?: string
  }
  name: string
  description?: string
  homepage?: string
  language?: string
  defaultBranch?: string
  archived?: boolean
  topics: string[]
  stargazersCount?: number
  forksCount?: number
  watchersCount?: number
  subscribersCount?: number
  openIssuesCount?: number
  createdAt?: string
  updatedAt?: string
  pushedAt?: string
  htmlUrl: string
  license?: string
  socialPreviewImage?: string
}

export type GithubReadmeDetail = {
  name?: string
  path?: string
  htmlUrl?: string
  downloadUrl?: string
  content: string
  encoding?: string
  size?: number
}

export type GithubRepositoryHtmlFallback = {
  url: string
  title: string
  fullName: string
  owner: string
  repo: string
  description?: string
  ogImage?: string
  stats: Array<{ label: string, value: string }>
  meta: Array<{ label: string, value: string }>
  authorAvatar?: string
}

export type GithubRepositoryDetail =
  | {
    source: 'api'
    repository: GithubRepositoryApiDetail
    readme?: GithubReadmeDetail
    readmeHtml?: string
    readmeHtmlSource?: 'page' | 'rendered'
  }
  | {
    source: 'html'
    repository: GithubRepositoryHtmlFallback
    readme?: GithubReadmeDetail
    readmeHtml?: string
    readmeHtmlSource?: 'page' | 'rendered'
  }
