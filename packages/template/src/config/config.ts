/**
 * 统一组件配置文件
 * 所有组件的注册、导入、渲染逻辑都在这里统一管理
 */
import { PlatformType } from '@kkk/template-contracts'
import type React from 'react'

import BilibiliBangumi from '../components/platforms/bilibili/bangumi/bangumi'
// Bilibili components
import { BilibiliComment } from '../components/platforms/bilibili/Comment'
import { BilibiliArticleDynamic } from '../components/platforms/bilibili/dynamic/DYNAMIC_TYPE_ARTICLE'
import { BilibiliVideoDynamic } from '../components/platforms/bilibili/dynamic/DYNAMIC_TYPE_AV'
import { BilibiliDrawDynamic } from '../components/platforms/bilibili/dynamic/DYNAMIC_TYPE_DRAW'
import { BilibiliForwardDynamic } from '../components/platforms/bilibili/dynamic/DYNAMIC_TYPE_FORWARD'
import { BilibiliLiveDynamic } from '../components/platforms/bilibili/dynamic/DYNAMIC_TYPE_LIVE_RCMD'
import { BilibiliWordDynamic } from '../components/platforms/bilibili/dynamic/DYNAMIC_TYPE_WORD'
import { BilibiliQrcodeImg } from '../components/platforms/bilibili/qrcodeImg'
import BilibiliUserList from '../components/platforms/bilibili/UserList'
import { BilibiliVideoInfo } from '../components/platforms/bilibili/videoInfo'
import { DouyinArticleWork } from '../components/platforms/douyin/ArticleWork'
// Douyin components
import { DouyinComment } from '../components/platforms/douyin/Comment'
import { DouyinDynamic } from '../components/platforms/douyin/Dynamic'
import { DouyinFavoriteList } from '../components/platforms/douyin/FavoriteList'
import { DouyinImageWork } from '../components/platforms/douyin/ImageWork'
import { DouyinLive } from '../components/platforms/douyin/Live'
import { DouyinLongTextWork } from '../components/platforms/douyin/LongTextWork'
import { DouyinMusicInfo } from '../components/platforms/douyin/MusicInfo'
import { DouyinQrcodeImg } from '../components/platforms/douyin/qrcodeImg'
import { DouyinRecommendList } from '../components/platforms/douyin/RecommendList'
import DouyinUserList from '../components/platforms/douyin/UserList'
import { DouyinUserVideoList } from '../components/platforms/douyin/UserVideoList'
import { DouyinVideoInfo } from '../components/platforms/douyin/videoInfo'
import { DouyinVideoWork } from '../components/platforms/douyin/VideoWork'
// Kuaishou components
import { KuaishouComment } from '../components/platforms/kuaishou/Comment'
import { Changelog } from '../components/platforms/other/changelog'
import { ExternalPostCard } from '../components/platforms/other/ExternalPost'
import { GlobalStatistics } from '../components/platforms/other/GlobalStatistics'
// Statistics components
import { GroupStatistics } from '../components/platforms/other/GroupStatistics'
import { handlerError } from '../components/platforms/other/handlerError'
// Other components
import Help from '../components/platforms/other/Help'
import { LivePhotoTip } from '../components/platforms/other/LivePhotoTip'
import { QrLogin } from '../components/platforms/other/qrlogin'
import { VersionWarning } from '../components/platforms/other/VersionWarning'
import { XiaohongshuComment } from '../components/platforms/xiaohongshu/Comment'
// Xiaohongshu components
import { XiaohongshuNoteInfo } from '../components/platforms/xiaohongshu/noteInfo'
import { type BaseComponentConfig, baseComponentConfigs, type BasePlatformConfig } from './config-base'

type RenderComponent = React.ComponentType<never>

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const hasStringProperty = (value: unknown, property: string): boolean => {
  return isObject(value) && typeof value[property] === 'string'
}

const hasExternalPostPlatform = (value: unknown): boolean => {
  return hasStringProperty(value, 'key') &&
    hasStringProperty(value, 'label') &&
    hasStringProperty(value, 'accentColor')
}

/**
 * 组件配置接口（扩展基础配置）
 */
export interface ComponentConfig extends BaseComponentConfig {
  /** 数据验证函数 */
  validateData?: (data: unknown) => boolean
  /** 同步组件 */
  component?: RenderComponent
  /** 组件懒加载函数（已废弃，保留用于兼容） */
  lazyComponent?: () => Promise<{ default: React.ComponentType<any> }>
}

/**
 * 平台配置接口（扩展版）
 */
export interface ExtendedPlatformConfig extends BasePlatformConfig {
  /** 支持的组件列表 */
  components: ComponentConfig[]
}

/**
 * 创建扩展组件配置的辅助函数
 * @param baseConfig 基础组件配置
 * @param extensions 扩展配置
 * @returns 完整的组件配置
 */
function createComponentConfig (
  baseConfig: BaseComponentConfig,
  extensions: Partial<Pick<ComponentConfig, 'validateData' | 'component' | 'lazyComponent'>> = {}
): ComponentConfig {
  return {
    ...baseConfig,
    ...extensions
  }
}

/**
 * 统一组件配置
 */
export const componentConfigs: ExtendedPlatformConfig[] = baseComponentConfigs.map(basePlatform => {
  const platform: ExtendedPlatformConfig = {
    ...basePlatform,
    components: []
  }

  // 根据平台类型添加组件和验证逻辑
  switch (basePlatform.type) {
    case PlatformType.DOUYIN:
      platform.components = basePlatform.components.map(baseComponent => {
        switch (baseComponent.id) {
          case 'comment':
            return createComponentConfig(baseComponent, {
              validateData: data => hasStringProperty(data, 'share_url'),
              component: DouyinComment
            })
          case 'dynamic':
            return createComponentConfig(baseComponent, {
              validateData: data => hasStringProperty(data, 'share_url'),
              component: DouyinDynamic
            })
          case 'video-work':
            return createComponentConfig(baseComponent, {
              validateData: data => hasStringProperty(data, 'share_url'),
              component: DouyinVideoWork
            })
          case 'image-work':
            return createComponentConfig(baseComponent, {
              validateData: data => hasStringProperty(data, 'share_url'),
              component: DouyinImageWork
            })
          case 'article-work':
            return createComponentConfig(baseComponent, {
              validateData: data => hasStringProperty(data, 'share_url'),
              component: DouyinArticleWork
            })
          case 'long-text-work':
            return createComponentConfig(baseComponent, {
              validateData: data => hasStringProperty(data, 'share_url') && hasStringProperty(data, 'text'),
              component: DouyinLongTextWork
            })
          case 'favorite-list':
            return createComponentConfig(baseComponent, {
              validateData: data => hasStringProperty(data, 'share_url'),
              component: DouyinFavoriteList
            })
          case 'recommend-list':
            return createComponentConfig(baseComponent, {
              validateData: data => hasStringProperty(data, 'share_url'),
              component: DouyinRecommendList
            })
          case 'live':
            return createComponentConfig(baseComponent, {
              validateData: data => hasStringProperty(data, 'share_url'),
              component: DouyinLive
            })
          case 'musicinfo':
            return createComponentConfig(baseComponent, {
              validateData: data => hasStringProperty(data, 'share_url'),
              component: DouyinMusicInfo
            })
          case 'user_profile':
            return createComponentConfig(baseComponent, {
              component: DouyinUserVideoList
            })
          case 'userlist':
            return createComponentConfig(baseComponent, {
              validateData: (data) => {
                return typeof data === 'object' && data !== null && 'renderOpt' in data && Array.isArray(data.renderOpt)
              },
              component: DouyinUserList
            })
          case 'videoInfo':
            return createComponentConfig(baseComponent, {
              component: DouyinVideoInfo
            })
          case 'qrcodeImg':
            return createComponentConfig(baseComponent, {
              component: DouyinQrcodeImg
            })
          default:
            return createComponentConfig(baseComponent)
        }
      })
      break

    case PlatformType.BILIBILI:
      platform.components = basePlatform.components.map(baseComponent => {
        switch (baseComponent.id) {
          case 'comment':
            return createComponentConfig(baseComponent, {
              validateData: data => hasStringProperty(data, 'share_url'),
              component: BilibiliComment
            })
          case 'userlist':
            return createComponentConfig(baseComponent, {
              validateData: (data) => {
                return typeof data === 'object' && data !== null && 'renderOpt' in data && Array.isArray(data.renderOpt)
              },
              component: BilibiliUserList
            })
          case 'bangumi':
            return createComponentConfig(baseComponent, {
              component: BilibiliBangumi
            })
          case 'dynamic/DYNAMIC_TYPE_DRAW':
            return createComponentConfig(baseComponent, {
              validateData: data => hasStringProperty(data, 'share_url'),
              component: BilibiliDrawDynamic
            })
          case 'dynamic/DYNAMIC_TYPE_WORD':
            return createComponentConfig(baseComponent, {
              validateData: data => hasStringProperty(data, 'share_url'),
              component: BilibiliWordDynamic
            })
          case 'dynamic/DYNAMIC_TYPE_AV':
            return createComponentConfig(baseComponent, {
              validateData: data => hasStringProperty(data, 'share_url'),
              component: BilibiliVideoDynamic
            })
          case 'dynamic/DYNAMIC_TYPE_FORWARD':
            return createComponentConfig(baseComponent, {
              validateData: data => hasStringProperty(data, 'share_url'),
              component: BilibiliForwardDynamic
            })
          case 'dynamic/DYNAMIC_TYPE_LIVE_RCMD':
            return createComponentConfig(baseComponent, {
              validateData: data => hasStringProperty(data, 'share_url'),
              component: BilibiliLiveDynamic
            })
          case 'dynamic/DYNAMIC_TYPE_ARTICLE':
            return createComponentConfig(baseComponent, {
              component: BilibiliArticleDynamic
            })
          case 'videoInfo':
            return createComponentConfig(baseComponent, {
              validateData: data => hasStringProperty(data, 'share_url'),
              component: BilibiliVideoInfo
            })
          case 'qrcodeImg':
            return createComponentConfig(baseComponent, {
              validateData: data => hasStringProperty(data, 'share_url'),
              component: BilibiliQrcodeImg
            })
          default:
            return createComponentConfig(baseComponent)
        }
      })
      break

    case PlatformType.KUAISHOU:
      platform.components = basePlatform.components.map(baseComponent => {
        switch (baseComponent.id) {
          case 'comment':
            return createComponentConfig(baseComponent, {
              validateData: data => hasStringProperty(data, 'share_url'),
              component: KuaishouComment
            })
          default:
            return createComponentConfig(baseComponent)
        }
      })
      break

    case PlatformType.XIAOHONGSHU:
      platform.components = basePlatform.components.map(baseComponent => {
        switch (baseComponent.id) {
          case 'noteInfo':
            return createComponentConfig(baseComponent, {
              component: XiaohongshuNoteInfo
            })
          case 'comment':
            return createComponentConfig(baseComponent, {
              component: XiaohongshuComment
            })
          default:
            return createComponentConfig(baseComponent)
        }
      })
      break

    case PlatformType.OTHER:
      platform.components = basePlatform.components.map(baseComponent => {
        switch (baseComponent.id) {
          case 'help':
            return createComponentConfig(baseComponent, {
              component: Help
            })
          case 'handlerError':
            return createComponentConfig(baseComponent, {
              component: handlerError
            })
          case 'changelog':
            return createComponentConfig(baseComponent, {
              component: Changelog
            })
          case 'version_warning':
            return createComponentConfig(baseComponent, {
              component: VersionWarning
            })
          case 'qrlogin':
            return createComponentConfig(baseComponent, {
              component: QrLogin
            })
          case 'live-photo-tip':
            return createComponentConfig(baseComponent, {
              component: LivePhotoTip
            })
          case 'external-post':
            return createComponentConfig(baseComponent, {
              validateData: data => isObject(data) &&
                hasStringProperty(data, 'title') &&
                hasExternalPostPlatform(data.platform),
              component: ExternalPostCard
            })
          default:
            return createComponentConfig(baseComponent)
        }
      })
      break

    case PlatformType.STATISTICS:
      platform.components = basePlatform.components.map(baseComponent => {
        switch (baseComponent.id) {
          case 'group':
            return createComponentConfig(baseComponent, {
              component: GroupStatistics
            })
          case 'global':
            return createComponentConfig(baseComponent, {
              component: GlobalStatistics
            })
          default:
            return createComponentConfig(baseComponent)
        }
      })
      break

    default:
      platform.components = basePlatform.components.map(baseComponent =>
        createComponentConfig(baseComponent)
      )
  }

  return platform
})

/**
 * 根据平台类型获取配置
 * @param platform 平台类型
 * @returns 平台配置
 */
export function getPlatformConfig (platform: PlatformType): ExtendedPlatformConfig | undefined {
  return componentConfigs.find(config => config.type === platform)
}

/**
 * 获取启用的组件列表
 * @param platform 平台类型
 * @returns 启用的组件配置列表
 */
export function getEnabledComponents (platform: PlatformType): ComponentConfig[] {
  const config = getPlatformConfig(platform)
  return config?.components.filter(component => component.enabled) || []
}

/**
 * 根据平台和组件ID获取组件配置
 * @param platform 平台类型
 * @param componentId 组件ID
 * @returns 组件配置
 */
export function getComponentConfig (platform: PlatformType, componentId: string): ComponentConfig | undefined {
  const platformConfig = getPlatformConfig(platform)
  return platformConfig?.components.find(component => component.id === componentId)
}

/**
 * 获取所有启用的组件配置（扁平化）
 * @returns 所有启用的组件配置
 */
export function getAllEnabledComponents (): Array<ComponentConfig & { platform: PlatformType }> {
  return componentConfigs.flatMap(platformConfig =>
    platformConfig.components
      .filter(component => component.enabled)
      .map(component => ({ ...component, platform: platformConfig.type }))
  )
}
