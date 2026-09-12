import type { ExternalPostCardProps, ExternalPostContentBlock } from '@kkk/template-contracts'
import { ExternalLink, Image as ImageIcon, MessageSquareText, UserRound } from 'lucide-react'
import React from 'react'

import { DefaultLayout } from '../../layouts/DefaultLayout'

const platformNameMap: Record<string, string> = {
  zhihu: 'ZH',
  tieba: 'TB',
  heybox: 'HX',
  weibo: 'WB',
  x: 'X',
  bilibili: 'BI',
  douyin: 'DY',
  xiaohongshu: 'XHS',
  tiktok: 'TT',
  kuaishou: 'KS'
}

const getHost = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

const getInitial = (name: string): string => {
  return name.trim().charAt(0).toUpperCase() || '?'
}

const ImageGrid: React.FC<{ images: string[], title: string, accentColor: string }> = ({ images, title, accentColor }) => {
  const visibleImages = images.filter(Boolean).slice(0, 6)
  if (visibleImages.length === 0) return null

  const extraCount = Math.max(0, images.length - visibleImages.length)
  const isSingle = visibleImages.length === 1
  const gridClass = isSingle ? 'grid-cols-1' : 'grid-cols-2'
  const imageHeight = isSingle ? 'h-[660px]' : 'h-[360px]'

  return (
    <div className='mt-12' data-page-block>
      <div className='flex gap-4 items-center mb-5 text-[34px] font-semibold text-foreground/70' data-page-block>
        <ImageIcon size={36} style={{ color: accentColor }} />
        <span>图片内容</span>
        <span className='text-foreground/45'>{images.length} 张</span>
      </div>
      <div className={`grid gap-5 ${gridClass}`}>
        {visibleImages.map((image, index) => (
          <div
            key={`${image}-${index}`}
            className={`relative overflow-hidden rounded-[8px] bg-surface border border-border ${imageHeight}`}
            data-page-avoid-split
          >
            <img
              src={image}
              alt={`${title} 图片 ${index + 1}`}
              className='object-cover w-full h-full'
            />
            {extraCount > 0 && index === visibleImages.length - 1 && (
              <div className='absolute inset-0 flex items-center justify-center bg-black/55 text-white text-[72px] font-bold'>
                +{extraCount}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const RichTextStyles: React.FC = () => (
  <style>{`
    .external-post-content-flow {
      --external-post-accent: #3f7cff;
      --external-post-link: #3f7cff;
    }

    .external-post-richtext,
    .external-post-text {
      font-size: 44px;
      line-height: 1.72;
      color: inherit;
      word-break: break-word;
    }

    .external-post-richtext p,
    .external-post-richtext div {
      margin: 0 0 1em;
    }

    .external-post-richtext p:last-child,
    .external-post-richtext div:last-child {
      margin-bottom: 0;
    }

    .external-post-richtext strong,
    .external-post-richtext b {
      font-weight: 850;
      color: currentColor;
    }

    .external-post-richtext em,
    .external-post-richtext i {
      font-style: italic;
    }

    .external-post-richtext ul,
    .external-post-richtext ol {
      margin: 0 0 1em 1.35em;
      padding: 0;
    }

    .external-post-richtext ul {
      list-style: disc;
    }

    .external-post-richtext ol {
      list-style: decimal;
    }

    .external-post-richtext li {
      margin: 0.28em 0;
      padding-left: 0.12em;
    }

    .external-post-richtext blockquote {
      margin: 1em 0;
      padding: 0.35em 0 0.35em 0.8em;
      border-left: 8px solid var(--external-post-accent);
      color: currentColor;
      background: color-mix(in srgb, currentColor 6%, transparent);
    }

    .external-post-richtext h1,
    .external-post-richtext h2,
    .external-post-richtext h3,
    .external-post-richtext h4,
    .external-post-richtext h5,
    .external-post-richtext h6 {
      margin: 0.9em 0 0.45em;
      font-weight: 850;
      line-height: 1.28;
      color: currentColor;
    }

    .external-post-richtext h1 { font-size: 1.36em; }
    .external-post-richtext h2 { font-size: 1.26em; }
    .external-post-richtext h3 { font-size: 1.16em; }

    .external-post-richtext a {
      color: var(--external-post-link);
      text-decoration: underline;
      text-underline-offset: 0.12em;
    }

    .external-post-richtext a img {
      display: inline-block;
      width: auto;
      max-width: 100%;
      height: auto;
      margin: 0 0.18em 0.12em 0;
      vertical-align: middle;
    }

    .external-post-richtext img {
      display: block;
      max-width: 100%;
      height: auto;
      margin: 0.75em auto;
      border-radius: 8px;
    }

    .external-post-richtext table {
      width: 100%;
      border-collapse: collapse;
      margin: 1em 0;
      overflow: hidden;
      border-radius: 8px;
      font-size: 0.88em;
    }

    .external-post-richtext thead {
      background: color-mix(in srgb, currentColor 10%, transparent);
    }

    .external-post-richtext th,
    .external-post-richtext td {
      padding: 0.5em 0.65em;
      border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
      text-align: left;
      vertical-align: top;
    }

    .external-post-richtext hr {
      margin: 1.2em 0;
      border: none;
      border-top: 2px solid color-mix(in srgb, currentColor 12%, transparent);
    }

    .external-post-richtext details {
      margin: 1em 0;
      padding: 0.6em 0.8em;
      border-radius: 8px;
      background: color-mix(in srgb, currentColor 5%, transparent);
    }

    .external-post-richtext summary {
      cursor: default;
      font-weight: 700;
    }

    .external-post-richtext kbd {
      display: inline-block;
      padding: 0.08em 0.3em;
      border-radius: 6px;
      border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
      background: color-mix(in srgb, currentColor 6%, transparent);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.85em;
    }

    .external-post-richtext code {
      padding: 0.08em 0.26em;
      border-radius: 6px;
      background: color-mix(in srgb, currentColor 9%, transparent);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.88em;
    }

    .external-post-richtext pre {
      margin: 1em 0;
      padding: 0.75em;
      overflow: hidden;
      border-radius: 8px;
      background: color-mix(in srgb, currentColor 9%, transparent);
      white-space: pre-wrap;
    }

    .external-post-richtext figcaption {
      margin-top: 0.45em;
      font-size: 0.86em;
      color: currentColor;
      opacity: 0.7;
    }

    .external-post-inline-image {
      margin: 0;
      width: 100%;
    }
  `}</style>
)

const hasContentBlockValue = (block: ExternalPostContentBlock): boolean => {
  if (block.type === 'html') return block.html.trim().length > 0
  if (block.type === 'text') return block.text.trim().length > 0
  return block.url.trim().length > 0
}

const ContentFlow: React.FC<{ blocks: ExternalPostContentBlock[], title: string, accentColor: string, linkColor: string }> = ({ blocks, title, accentColor, linkColor }) => {
  const visibleBlocks = blocks.filter(hasContentBlockValue).slice(0, 80)
  if (visibleBlocks.length === 0) return null

  return (
    <div
      className='external-post-content-flow mt-12 text-foreground/88'
      style={{
        '--external-post-accent': accentColor,
        '--external-post-link': linkColor
      } as React.CSSProperties}
      data-page-block
    >
      <div className='flex items-center gap-4 mb-7 px-1 text-[34px] font-semibold text-foreground/70' data-page-block>
        <MessageSquareText size={36} style={{ color: accentColor }} />
        <span>正文内容</span>
      </div>

      <div className='space-y-8'>
        {visibleBlocks.map((block, index) => {
          if (block.type === 'html') {
            return (
              <div
                key={`html-${index}`}
                className='external-post-richtext'
                data-page-block
                dangerouslySetInnerHTML={{ __html: block.html }}
              />
            )
          }

          if (block.type === 'text') {
            return (
              <p key={`text-${index}`} className='external-post-text whitespace-pre-wrap'>
                {block.text}
              </p>
            )
          }

          return (
            <figure
              key={`image-${block.url}-${index}`}
              className='external-post-inline-image overflow-hidden rounded-[8px] bg-surface border border-border'
              data-page-avoid-split
            >
              <img
                src={block.url}
                alt={block.alt || `${title} 图片 ${index + 1}`}
                className='block w-full h-auto'
              />
            </figure>
          )
        })}
      </div>
    </div>
  )
}

const StatRow: React.FC<{ items: ExternalPostCardProps['data']['stats'], accentColor: string }> = ({ items, accentColor }) => {
  if (items.length === 0) return null

  return (
    <div className='flex flex-wrap gap-4 mt-10' data-page-avoid-split>
      {items.map(item => (
        <div key={`${item.label}-${item.value}`} className='flex items-center gap-3 px-6 py-4 rounded-[8px] bg-surface border border-border'>
          <span className='text-[30px] text-foreground/55'>{item.label}</span>
          <span className='text-[34px] font-bold text-foreground' style={{ color: accentColor }}>{item.value}</span>
        </div>
      ))}
    </div>
  )
}

const MetaRow: React.FC<{ items: ExternalPostCardProps['data']['meta'] }> = ({ items }) => {
  if (items.length === 0) return null

  return (
    <div className='flex flex-wrap gap-x-8 gap-y-3 mt-8 text-[30px] text-foreground/55' data-page-avoid-split>
      {items.map(item => (
        <span key={`${item.label}-${item.value}`}>
          {item.label}: <span className='text-foreground/75'>{item.value}</span>
        </span>
      ))}
    </div>
  )
}

export const ExternalPostCard: React.FC<Omit<ExternalPostCardProps, 'templateType' | 'templateName'>> = React.memo((props) => {
  const { data } = props
  const accentColor = data.platform.accentColor || '#3f7cff'
  const linkColor = '#0969da'
  const platformShortName = platformNameMap[data.platform.key] ?? data.platform.label.slice(0, 2).toUpperCase()
  const contentBlocks = Array.isArray(data.content) ? data.content.filter(hasContentBlockValue) : []

  return (
    <DefaultLayout
      {...props}
      className='overflow-hidden'
      style={{ backgroundColor: '#ffffff' }}
    >
      <RichTextStyles />
      <div className='px-2 pt-2 pb-0'>
        <div className='overflow-hidden rounded-[6px] bg-background border border-border shadow-medium'>
          <div className='h-2' style={{ backgroundColor: accentColor }} />

          <div className='p-10'>
            <div className='flex items-center justify-between gap-8' data-page-avoid-split>
              <div className='flex items-center gap-5'>
                <div
                  className='flex items-center justify-center w-24 h-24 rounded-[8px] text-white text-[38px] font-black'
                  style={{ backgroundColor: accentColor }}
                >
                  {platformShortName}
                </div>
                <div>
                  <div className='text-[32px] font-semibold text-foreground/45'>内容来源</div>
                  <div className='text-[48px] font-bold text-foreground'>{data.platform.label}</div>
                </div>
              </div>

              <div className='flex items-center gap-3 max-w-[640px] text-[30px] text-foreground/55'>
                <ExternalLink size={34} style={{ color: accentColor }} />
                <span className='truncate'>{getHost(data.url)}</span>
              </div>
            </div>

            <h1 className='mt-10 text-[76px] leading-tight font-black text-foreground break-words' data-page-block>
              {data.title || '未命名内容'}
            </h1>

            <div className='flex items-center gap-6 mt-8' data-page-avoid-split>
              {data.author.avatar ? (
                <img
                  src={data.author.avatar}
                  alt={data.author.name}
                  className='object-cover w-24 h-24 rounded-full border-4'
                  style={{ borderColor: accentColor }}
                />
              ) : (
                <div
                  className='flex items-center justify-center w-24 h-24 rounded-full text-white text-[44px] font-bold'
                  style={{ backgroundColor: accentColor }}
                >
                  {getInitial(data.author.name)}
                </div>
              )}
              <div className='min-w-0'>
                <div className='flex items-center gap-3 text-[34px] text-foreground/55'>
                  <UserRound size={34} />
                  <span>作者</span>
                </div>
                <div className='max-w-[1050px] text-[48px] font-bold text-foreground truncate'>{data.author.name || '未知作者'}</div>
              </div>
            </div>

            {contentBlocks.length > 0 ? (
              <ContentFlow
                blocks={contentBlocks}
                title={data.title}
                accentColor={accentColor}
                linkColor={linkColor}
              />
            ) : data.summary && (
              <div className='mt-10 p-7 rounded-[8px] bg-surface border border-border' data-page-block>
                <div className='flex items-center gap-4 mb-5 text-[34px] font-semibold text-foreground/70' data-page-block>
                  <MessageSquareText size={36} style={{ color: accentColor }} />
                  <span>正文摘要</span>
                </div>
                <p className='whitespace-pre-wrap text-[44px] leading-relaxed text-foreground/88 break-words'>
                  {data.summary}
                </p>
              </div>
            )}

            {contentBlocks.length === 0 && <ImageGrid images={data.images} title={data.title} accentColor={accentColor} />}
            <StatRow items={data.stats} accentColor={accentColor} />
            <MetaRow items={data.meta} />
          </div>
        </div>
      </div>
    </DefaultLayout>
  )
})

ExternalPostCard.displayName = 'ExternalPostCard'

export default ExternalPostCard
