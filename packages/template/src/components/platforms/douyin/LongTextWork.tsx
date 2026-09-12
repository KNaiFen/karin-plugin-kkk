import type { DouyinLongTextWorkProps } from '@kkk/template-contracts'
import {
  Bookmark,
  Clock3,
  Heart,
  Image as ImageIcon,
  MessageCircle,
  Music2,
  Play,
  Share2,
  Users
} from 'lucide-react'
import React from 'react'

import { DefaultLayout } from '../../layouts/DefaultLayout'

const formatNumber = (value: number): string => {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}亿`
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`
  return value.toLocaleString('zh-CN')
}

const formatDuration = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

const WorkTypeIcon: React.FC<{ workType: string }> = ({ workType }) => {
  return workType === '视频'
    ? <Play className='w-9 h-9' />
    : <ImageIcon className='w-9 h-9' />
}

const StatItem: React.FC<{
  icon: React.ReactNode
  label: string
  value: number
}> = ({ icon, label, value }) => (
  <div className='flex items-center gap-3'>
    <span className='text-foreground/55'>{icon}</span>
    <span className='text-[32px] text-foreground/55'>{label}</span>
    <span className='text-[36px] font-bold text-foreground'>{formatNumber(value)}</span>
  </div>
)

const DouyinHeader: React.FC<{ useDarkTheme?: boolean }> = ({ useDarkTheme }) => (
  <header className='flex items-center justify-between gap-10 px-16 pt-16 pb-10' data-page-avoid-split>
    <img
      src={useDarkTheme ? '/image/douyin/dylogo-light.svg' : '/image/douyin/dylogo-dark.svg'}
      alt='抖音'
      className='object-contain w-[390px] h-24'
    />
    <span className='text-[36px] text-foreground/55'>记录美好生活</span>
  </header>
)

const ContentSection: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')

  return (
    <article className='px-16 py-10 border-y border-border/70'>
      <div className='flex flex-col gap-7'>
        {lines.map((line, index) => line.trim()
          ? (
            <p
              key={`${index}-${line.slice(0, 16)}`}
              className='text-[48px] leading-[1.72] text-foreground/90 whitespace-pre-wrap break-words'
              data-page-block
            >
              {line}
            </p>
          )
          : <div key={`blank-${index}`} className='h-4' aria-hidden='true' />)}
      </div>
    </article>
  )
}

const CooperationSection: React.FC<{
  cooperationInfo: NonNullable<DouyinLongTextWorkProps['data']['cooperation_info']>
}> = ({ cooperationInfo }) => {
  const creators = cooperationInfo.co_creators.slice(0, 8)
  const hiddenCount = Math.max(0, cooperationInfo.co_creator_nums - creators.length)

  return (
    <section className='px-16 py-10 border-t border-border/70' data-page-avoid-split>
      <div className='flex items-center gap-3 mb-7 text-[34px] text-foreground/65'>
        <Users className='w-9 h-9' />
        <span>{cooperationInfo.co_creator_nums} 人共创</span>
        {cooperationInfo.subscriber_role && (
          <span className='px-3 py-1 ml-2 rounded-[8px] bg-surface text-[30px] text-foreground/70'>
            {cooperationInfo.subscriber_role}
          </span>
        )}
      </div>
      <div className='flex items-start gap-8'>
        {creators.map((creator, index) => (
          <div key={`${creator.nickname}-${index}`} className='flex flex-col items-center w-32 gap-3'>
            {creator.avatar_url
              ? (
                <img
                  src={creator.avatar_url}
                  alt={creator.nickname}
                  className='object-cover w-24 h-24 rounded-full border border-border'
                />
              )
              : (
                <div className='flex items-center justify-center w-24 h-24 rounded-full bg-surface text-[38px] font-bold'>
                  {creator.nickname.slice(0, 1)}
                </div>
              )}
            <span className='w-full text-[28px] font-semibold text-center truncate'>{creator.nickname}</span>
            <span className='w-full text-[25px] text-center text-foreground/55 truncate'>{creator.role_title}</span>
          </div>
        ))}
        {hiddenCount > 0 && (
          <div className='flex items-center justify-center w-24 h-24 rounded-full bg-surface text-[30px] text-foreground/65'>
            +{hiddenCount}
          </div>
        )}
      </div>
    </section>
  )
}

export const DouyinLongTextWork: React.FC<Omit<DouyinLongTextWorkProps, 'templateType' | 'templateName'>> = (props) => {
  const { data } = props
  const hasVideoMeta = Boolean(data.video && (data.video.duration > 0 || data.video.width > 0 || data.video.height > 0))

  return (
    <DefaultLayout {...props} className='overflow-hidden'>
      <DouyinHeader useDarkTheme={data.useDarkTheme} />

      <main>
        <section className='flex items-start justify-between gap-10 px-16 pb-12' data-page-avoid-split>
          <div className='flex items-center min-w-0 gap-7'>
            {data.author.avatar
              ? (
                <img
                  src={data.author.avatar}
                  alt={data.author.name}
                  className='object-cover w-28 h-28 rounded-full border-2 border-border shrink-0'
                />
              )
              : (
                <div className='flex items-center justify-center w-28 h-28 rounded-full bg-surface text-[46px] font-bold shrink-0'>
                  {data.author.name.slice(0, 1)}
                </div>
              )}
            <div className='min-w-0'>
              <div className='text-[52px] font-bold truncate'>@{data.author.name}</div>
              <div className='mt-2 text-[30px] text-foreground/55 truncate'>
                {data.author.douyin_id ? `抖音号 ${data.author.douyin_id}` : '抖音创作者'}
              </div>
            </div>
          </div>

          <div className='flex flex-col items-end gap-4 shrink-0'>
            <div className='flex items-center gap-3 px-5 py-3 rounded-[8px] bg-foreground text-background text-[34px] font-bold'>
              <WorkTypeIcon workType={data.work_type} />
              <span>{data.work_type}作品</span>
            </div>
            {data.dynamicTYPE && <span className='text-[28px] text-foreground/50'>{data.dynamicTYPE}</span>}
          </div>
        </section>

        <ContentSection text={data.text} />

        {data.image_url && (
          <figure className='px-16 py-12' data-page-avoid-split>
            <img
              src={data.image_url}
              alt={`${data.work_type}作品封面`}
              className='block object-contain w-full max-h-[1180px] rounded-[8px] bg-surface'
            />
          </figure>
        )}

        {(hasVideoMeta || data.music) && (
          <section className='flex items-center justify-between gap-8 px-16 py-9 border-y border-border/70' data-page-avoid-split>
            {hasVideoMeta && data.video
              ? (
                <div className='flex items-center gap-4 text-[32px] text-foreground/70'>
                  <Play className='w-10 h-10' />
                  {data.video.duration > 0 && <span>{formatDuration(data.video.duration)}</span>}
                  {data.video.width > 0 && data.video.height > 0 && (
                    <span>{data.video.width} x {data.video.height}</span>
                  )}
                </div>
              )
              : <div />}

            {data.music && (
              <div className='flex items-center min-w-0 gap-4'>
                {data.music.cover
                  ? <img src={data.music.cover} alt='' className='object-cover w-20 h-20 rounded-[8px]' />
                  : <Music2 className='w-11 h-11 text-foreground/55' />}
                <div className='min-w-0 text-right'>
                  <div className='max-w-[620px] text-[32px] font-semibold truncate'>{data.music.title}</div>
                  <div className='max-w-[620px] mt-1 text-[27px] text-foreground/55 truncate'>{data.music.author}</div>
                </div>
              </div>
            )}
          </section>
        )}

        <section className='flex flex-wrap items-center gap-x-10 gap-y-5 px-16 py-10' data-page-avoid-split>
          <StatItem icon={<Heart className='w-9 h-9' />} label='点赞' value={data.statistics.digg_count} />
          <StatItem icon={<MessageCircle className='w-9 h-9' />} label='评论' value={data.statistics.comment_count} />
          <StatItem icon={<Bookmark className='w-9 h-9' />} label='收藏' value={data.statistics.collect_count} />
          <StatItem icon={<Share2 className='w-9 h-9' />} label='分享' value={data.statistics.share_count} />
        </section>

        <section className='flex items-end justify-between gap-10 px-16 py-12 border-t border-border/70' data-page-avoid-split>
          <div>
            <div className='flex items-center gap-3 text-[31px] text-foreground/55'>
              <Clock3 className='w-9 h-9' />
              <span>发布于 {data.create_time}</span>
            </div>
            <div className='flex gap-10 mt-7 text-[30px] text-foreground/60'>
              <span>{formatNumber(data.author.follower_count ?? 0)} 粉丝</span>
              <span>{formatNumber(data.author.total_favorited ?? 0)} 获赞</span>
              <span>{formatNumber(data.author.following_count ?? 0)} 关注</span>
            </div>
          </div>

          {props.qrCodeDataUrl && (
            <img
              src={props.qrCodeDataUrl}
              alt='作品二维码'
              className='w-56 h-56 rounded-[8px] shrink-0'
            />
          )}
        </section>

        {data.cooperation_info && <CooperationSection cooperationInfo={data.cooperation_info} />}
      </main>
    </DefaultLayout>
  )
}

export default DouyinLongTextWork
