import { getGithubID } from '@/platform/github'
import {
  buildGithubReadmeRenderContent,
  fetchGithubRepositoryCompositeDetail
} from '@/platform/github/api'
import type { ParsedPost, ParsedPostBlock } from '@/platform/parsedPost'

import { buildAuthor, buildParsedPost, textBlock, toMeta, toStats } from '../shared'

export const resolveGithubParsedPost = async (url: string): Promise<ParsedPost> => {
  const idData = await getGithubID(url)
  const detail = await fetchGithubRepositoryCompositeDetail(idData)
  const readmeRender = detail.readmeHtml
    ? { html: detail.readmeHtml, image: undefined }
    : buildGithubReadmeRenderContent(detail.readme, { idData })

  if (detail.source === 'api') {
    const repository = detail.repository
    const summary = repository.description || `${repository.fullName} 仓库暂无可提取摘要`
    const images = [repository.socialPreviewImage, readmeRender.image]
      .filter((item): item is string => Boolean(item))
      .map(url => ({ url }))
    const contentBlocks: ParsedPostBlock[] = [
      ...textBlock(repository.description),
      ...(readmeRender.html
        ? [{
            type: 'html' as const,
            html: readmeRender.html
          }]
        : [])
    ]

    return buildParsedPost({
      platform: 'github',
      platformLabel: 'GitHub',
      subtype: 'article',
      title: repository.fullName,
      author: buildAuthor(repository.owner.login || 'GitHub', {
        avatar: repository.owner.avatarUrl,
        description: repository.owner.type
      }),
      summary,
      url: repository.htmlUrl,
      contentBlocks,
      images,
      videos: [],
      stats: toStats([
        ['Star', repository.stargazersCount],
        ['Fork', repository.forksCount],
        ['Watcher', repository.watchersCount],
        ['Subscriber', repository.subscribersCount],
        ['Issue', repository.openIssuesCount]
      ]),
      meta: toMeta([
        ['语言', repository.language],
        ['许可证', repository.license],
        ['默认分支', repository.defaultBranch],
        ['归档', repository.archived ? '是' : '否'],
        ['主页', repository.homepage],
        ['Topics', repository.topics.join(', ')],
        ['创建时间', repository.createdAt],
        ['更新时间', repository.updatedAt],
        ['推送时间', repository.pushedAt],
        ['分支', idData.branch]
      ]),
      raw: {
        accentColor: '#24292f',
        detail,
        idData,
        trustedRichTextPlatform: 'github',
        readmeHtmlSource: detail.readmeHtmlSource
      }
    })
  }

  const repository = detail.repository
  return buildParsedPost({
    platform: 'github',
    platformLabel: 'GitHub',
    subtype: 'article',
    title: repository.fullName || repository.title,
    author: repository.owner ? buildAuthor(repository.owner) : undefined,
    summary: repository.description || `${repository.fullName || repository.title} 仓库暂无可提取摘要`,
    url: repository.url,
    contentBlocks: [
      ...textBlock(repository.description),
      ...(readmeRender.html
        ? [{
            type: 'html' as const,
            html: readmeRender.html
          }]
        : [])
    ],
    images: [repository.ogImage, readmeRender.image].filter((item): item is string => Boolean(item)).map(url => ({ url })),
    videos: [],
    stats: repository.stats,
    meta: [
      ...repository.meta,
      ...(idData.branch ? [{ label: '分支', value: idData.branch }] : [])
    ],
    raw: {
      accentColor: '#24292f',
      detail,
      idData,
      trustedRichTextPlatform: 'github',
      readmeHtmlSource: detail.readmeHtmlSource
    }
  })
}
