import fs from 'node:fs'
import path from 'node:path'

import { markdown as renderMarkdownHtml } from '@karinjs/md-html'
import { render } from 'node-karin'
import { karinPathHtml } from 'node-karin/root'

import {
  clampNumber,
  DEFAULT_PAGE_MAX_ASPECT_RATIO,
  DEFAULT_PAGE_TRIGGER_ASPECT_RATIO,
  normalizeRenderedImageBuffer,
  paginateRenderedImageBuffer,
  type PaginationOptions,
  type RenderImageOptions
} from '@/module/utils/Render/pagination'
import { Root } from '@/root'

const MARKDOWN_RENDER_DIRNAME = 'detailed-summary-markdown'
const MARKDOWN_RENDER_VIEWPORT_WIDTH = 980
const MARKDOWN_RENDER_DEVICE_SCALE_FACTOR = 3
const MARKDOWN_BODY_CLASS = 'markdown-body'

export type DetailedSummaryMarkdownRenderOptions = {
  fontSizePx?: number
  multiPageEnabled?: boolean
  multiPageTriggerAspectRatio?: number
  multiPageMaxAspectRatio?: number
}

const normalizeMarkdownText = (markdownText: string): string => {
  return String(markdownText ?? '').replace(/\u0000/g, '').trim()
}

const injectMarkdownRenderOverrides = (html: string, fontSizePx: number): string => {
  const styleBlock = [
    '<style>',
    `.${MARKDOWN_BODY_CLASS} {`,
    `  font-size: ${fontSizePx}px;`,
    '  color: #101828;',
    '  background: #f5f7fb;',
    '  line-height: 1.72;',
    '  font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;',
    '  -webkit-font-smoothing: antialiased;',
    '}',
    `.${MARKDOWN_BODY_CLASS} strong, .${MARKDOWN_BODY_CLASS} b {`,
    '  font-weight: 700 !important;',
    '}',
    `.${MARKDOWN_BODY_CLASS} em, .${MARKDOWN_BODY_CLASS} i {`,
    '  font-style: italic;',
    '}',
    `.${MARKDOWN_BODY_CLASS} h1, .${MARKDOWN_BODY_CLASS} h2, .${MARKDOWN_BODY_CLASS} h3, .${MARKDOWN_BODY_CLASS} h4, .${MARKDOWN_BODY_CLASS} h5, .${MARKDOWN_BODY_CLASS} h6 {`,
    '  line-height: 1.25;',
    '}',
    `.${MARKDOWN_BODY_CLASS} code, .${MARKDOWN_BODY_CLASS} pre {`,
    '  white-space: pre-wrap;',
    '  word-break: break-word;',
    '}',
    '</style>'
  ].join('\n')

  if (html.includes('</head>')) {
    return html.replace('</head>', `${styleBlock}\n</head>`)
  }

  return [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    styleBlock,
    '</head>',
    html,
    '</html>'
  ].join('\n')
}

export const buildDetailedSummaryMarkdownRenderHtml = (
  markdownText: string,
  options: DetailedSummaryMarkdownRenderOptions = {}
): string => {
  const fontSizePx = clampNumber(Number(options.fontSizePx ?? 16), 16, 12, 24)
  const content = renderMarkdownHtml(normalizeMarkdownText(markdownText), {
    katex: {
      output: 'htmlAndMathml',
      throwOnError: false
    }
  })

  return injectMarkdownRenderOverrides(content, fontSizePx)
}

const createMarkdownRenderFilePath = (): string => {
  const outputDir = path.join(karinPathHtml, Root.pluginName, MARKDOWN_RENDER_DIRNAME)
  fs.mkdirSync(outputDir, { recursive: true })
  return path.join(outputDir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`)
}

const buildPaginationOptions = (options: DetailedSummaryMarkdownRenderOptions): PaginationOptions => {
  const triggerAspectRatio = clampNumber(
    Number(options.multiPageTriggerAspectRatio ?? DEFAULT_PAGE_TRIGGER_ASPECT_RATIO),
    DEFAULT_PAGE_TRIGGER_ASPECT_RATIO,
    1.2,
    10
  )
  const maxAspectRatio = clampNumber(
    Number(options.multiPageMaxAspectRatio ?? DEFAULT_PAGE_MAX_ASPECT_RATIO),
    DEFAULT_PAGE_MAX_ASPECT_RATIO,
    1.1,
    triggerAspectRatio
  )

  return {
    enabled: options.multiPageEnabled !== false,
    triggerAspectRatio,
    maxAspectRatio
  }
}

const toBase64Url = (value: string): string => {
  return `base64://${value}`
}

const normalizeRenderedImages = (
  rendered: string | string[],
  options: DetailedSummaryMarkdownRenderOptions
): string[] => {
  const imageBase64List = (Array.isArray(rendered) ? rendered : [rendered])
    .filter((item): item is string => typeof item === 'string' && item.length > 0)

  if (imageBase64List.length === 0) {
    throw new Error('Markdown 渲染结果为空')
  }

  const renderImageOptions: RenderImageOptions = {
    type: 'jpeg',
    quality: 95,
    omitBackground: false
  }
  const paginationOptions = buildPaginationOptions(options)

  return imageBase64List.flatMap(imageBase64 => {
    const normalized = normalizeRenderedImageBuffer(
      Buffer.from(imageBase64, 'base64'),
      renderImageOptions,
      'detailed-summary-markdown'
    )
    const format = normalized.format === 'unknown' ? renderImageOptions.type : normalized.format
    return paginateRenderedImageBuffer(
      normalized.buffer,
      format,
      renderImageOptions,
      paginationOptions
    ).map(slice => toBase64Url(slice.buffer.toString('base64')))
  })
}

export const stripMarkdownToPlainText = (markdownText: string): string => {
  const source = String(markdownText ?? '').replace(/\r\n?/g, '\n')
  const codeBlocks: string[] = []
  let working = source.replace(/```[\s\S]*?```/g, block => {
    const content = block
      .replace(/^```[^\n]*\n?/, '')
      .replace(/\n?```$/, '')
      .trim()
    codeBlocks.push(content)
    return `@@CODEBLOCK${codeBlocks.length - 1}@@`
  })

  working = working
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, url) => `${String(alt ?? '').trim() || '图片'}（${String(url ?? '').trim()}）`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, url) => `${String(text ?? '').trim()}（${String(url ?? '').trim()}）`)
    .replace(/`([^`]+)`/g, (_match, code) => String(code ?? '').trim())
    .replace(/^[\t ]{0,3}#{1,6}\s*/gm, '')
    .replace(/^[\t ]{0,3}>\s?/gm, '')
    .replace(/^[\t ]*[-*+]\s+/gm, '')
    .replace(/^[\t ]*\d+\.\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/^[\t ]*\|([\s\S]*?)\|[\t ]*$/gm, line => {
      const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
      if (/^[-:\s|]+$/.test(trimmed.replace(/\s+/g, ''))) return ''
      return trimmed
    })
    .replace(/^[\t ]*[-:]{3,}[\t ]*(\|[\t ]*[-:]{3,}[\t ]*)+$/gm, '')
    .replace(/<[^>]+>/g, '')
    .replace(/@@CODEBLOCK(\d+)@@/g, (_match, index) => codeBlocks[Number(index)] ?? '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')

  return working.trim()
}

export const renderDetailedSummaryMarkdownImages = async (
  markdownText: string,
  options: DetailedSummaryMarkdownRenderOptions = {}
): Promise<string[]> => {
  const htmlFile = createMarkdownRenderFilePath()
  fs.writeFileSync(htmlFile, buildDetailedSummaryMarkdownRenderHtml(markdownText, options), 'utf8')

  try {
    const rendered = await render.render({
      file: htmlFile,
      pageGotoParams: {
        waitUntil: 'networkidle2'
      },
      setViewport: {
        width: MARKDOWN_RENDER_VIEWPORT_WIDTH,
        deviceScaleFactor: MARKDOWN_RENDER_DEVICE_SCALE_FACTOR
      }
    })

    return normalizeRenderedImages(rendered as string | string[], options)
  } finally {
    try {
      fs.unlinkSync(htmlFile)
    } catch {}
  }
}
