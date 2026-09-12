/**
 * 应用配置 Schema
 */
import os from 'node:os'

import type { SectionSchema } from './schema'
import { $ne, $not, $var } from './schema'

export const appConfigSchema: SectionSchema = {
  key: 'app',
  title: '插件应用相关',
  subtitle: '此处用于管理插件的基本设置',
  fields: [
    { type: 'divider', title: '缓存设置' },
    {
      key: 'removeCache',
      type: 'switch',
      label: '缓存删除',
      description: '下载的视频缓存自动删除，非必要不修改！'
    },
    {
      key: 'sharedCacheTtlHours',
      type: 'input',
      inputType: 'number',
      label: '共享缓存过期时间',
      description: '可复用共享缓存保留时长，单位小时',
      rules: [{ min: 1, max: 168 }]
    },
    { type: 'divider', title: '解析优先级设置' },
    {
      key: 'videoTool',
      type: 'switch',
      label: '默认解析',
      description: '即识别最高优先级，修改后重启生效'
    },
    {
      key: 'priority',
      type: 'input',
      inputType: 'number',
      label: '自定义优先级',
      description: '自定义优先级，「默认解析」关闭后才会生效。修改后重启生效',
      disabled: $var('videoTool')
    },
    { type: 'divider', title: '渲染配置' },
    {
      key: 'renderScale',
      type: 'input',
      inputType: 'number',
      label: '渲染精度',
      description: '可选值50~200，建议100。设置高精度会提高图片的精细度，过高可能会影响渲染与发送速度',
      rules: [{ min: 50, max: 200 }]
    },
    {
      key: 'Theme',
      type: 'radio',
      label: '渲染图片的主题色',
      orientation: 'horizontal',
      options: [
        { label: '自动', value: 0, description: '06:00-18:00为浅色，18:00-06:00为深色' },
        { label: '浅色', value: 1 },
        { label: '深色', value: 2 }
      ]
    },
    {
      key: 'RemoveWatermark',
      type: 'switch',
      label: '移除版本信息',
      description: '渲染的图片是否移除底部版本信息'
    },
    {
      key: 'RenderWaitTime',
      type: 'input',
      inputType: 'number',
      label: '渲染图片的等待时间',
      description: os.platform() === 'linux' ? '单位：秒，Linux系统下不能为0' : '单位：秒，传递 0 可禁用',
      rules: [
        os.platform() === 'linux'
          ? { min: 1, error: 'Linux系统下渲染等待时间不能为0' }
          : { min: 0 }
      ]
    },
    {
      key: 'multiPageRender',
      type: 'switch',
      label: '智能分页渲染',
      description: '将超长渲染图按安全位置拆成多页图片，避免一张长图过高'
    },
    {
      key: 'multiPageTriggerAspectRatio',
      type: 'input',
      inputType: 'number',
      label: '分页触发比例',
      description: '当渲染图的高宽比超过该值时开始分页，默认 3',
      disabled: $not('multiPageRender'),
      rules: [{ min: 1.2, max: 10, error: '请输入一个范围在 1.2 到 10 之间的数字' }]
    },
    {
      key: 'multiPageMaxAspectRatio',
      type: 'input',
      inputType: 'number',
      label: '分页后单页比例',
      description: '分页后每一页允许的最大高宽比，默认 2.2',
      disabled: $not('multiPageRender'),
      rules: [{ min: 1.1, max: 10, error: '请输入一个范围在 1.1 到 10 之间的数字' }]
    },
    {
      key: 'renderImageFormat',
      type: 'radio',
      label: '渲染图输出格式',
      description: 'auto 使用内置推荐；JPG 体积更小；PNG 更清晰但更大',
      orientation: 'horizontal',
      options: [
        { label: '自动', value: 'auto', description: '按模板使用内置推荐格式' },
        { label: 'JPG', value: 'jpeg', description: '优先减小体积' },
        { label: 'PNG', value: 'png', description: '保留无损输出' }
      ]
    },
    {
      key: 'renderImageQuality',
      type: 'input',
      inputType: 'number',
      label: 'JPG 压缩质量',
      description: '1-100，数值越高画质越高、体积越大；PNG 输出时忽略',
      disabled: $not($ne('renderImageFormat', 'png')),
      rules: [{ min: 1, max: 100, error: '请输入一个范围在 1 到 100 之间的数字' }]
    },
    { type: 'divider', title: 'Live Photo 兼容设置' },
    {
      key: 'livePhotoMode',
      type: 'radio',
      label: 'Live Photo 处理和发送方式',
      description: '解析遇到实况图时的处理和发送方式。注意：生成视频性能开销大，2C2G 服务器单张约需 20 秒',
      orientation: 'horizontal',
      options: [
        { label: '视频 + 实况图', value: 'video_and_livephoto', description: '生成并发送仿 iPhone Live Photo 播放效果的视频（播放三次）+ 对应系统的实况图' },
        { label: '仅视频', value: 'video_only', description: '仅生成并发送仿 iPhone Live Photo 播放效果的视频（播放三次）' },
        { label: '仅实况图', value: 'livephoto_only', description: '仅生成并发送对应系统的实况图，性能开销小' }
      ]
    },
    {
      key: 'livePhotoSystem',
      type: 'radio',
      label: 'Live Photo 静态图兼容系统',
      description: '当解析到作品/动态包含 Live Photo 时，合并转发里发送的 Live Photo 静态图按所选系统生成。推荐 OPPO，兼容性最广',
      orientation: 'horizontal',
      disabled: $ne('livePhotoMode', 'livephoto_only'),
      options: [
        { label: 'Google', value: 'google', description: 'Google Motion Photo 格式' },
        { label: '小米（HyperOS）', value: 'xiaomi', description: '兼容小米（任何版本）和 Google，但无法被 OPPO 识别' },
        { label: 'OPPO（ColorOS）', value: 'oppo', description: '推荐，兼容 OPPO、小米（较新版本）和 Google' },
        { label: '华为/荣耀（HarmonyOS/MagicOS）', value: 'huawei_honor', description: '理论可行但未实测' }
      ]
    },
    { type: 'divider', title: '交互与认证设置' },
    {
      key: 'EmojiReply',
      type: 'switch',
      label: '表情回应',
      description: '在解析任务开始时添加表情回应，若适配器不支持需要关闭'
    },
    {
      key: 'parseTip',
      type: 'switch',
      label: '解析提示',
      description: '发送提示信息："检测到xxx链接，开始解析"'
    },
    {
      key: 'fakeForward',
      type: 'switch',
      label: '伪造合并转发消息',
      description: '开启后合并转发将使用触发者身份展示；关闭后使用机器人身份展示'
    },
    {
      key: 'autoUpdate',
      type: 'switch',
      label: '自动更新',
      description: '关闭后，定时检查、提醒回复触发和手动更新命令都不会生效'
    },
    {
      key: 'autoRestartOnInstalledUpdate',
      type: 'switch',
      label: '已安装新版本后自动重启',
      description: '检测到磁盘上已安装比当前运行版本更高的新版本后，自动重启插件进程使其生效'
    },
    {
      key: 'longTaskCompletionNotify',
      type: 'switch',
      label: '长任务完成提醒',
      description: '解析、总结、详细总结、转写任务耗时达到阈值后，回复结果消息提醒触发者'
    },
    {
      key: 'longTaskCompletionNotifyThresholdMs',
      type: 'input',
      inputType: 'number',
      label: '长任务提醒阈值（毫秒）',
      description: '耗时达到该阈值后才发送完成提醒，默认 300000',
      disabled: $not('longTaskCompletionNotify'),
      rules: [{ min: 0, max: 86400000, error: '请输入一个范围在 0 到 86400000 之间的数字' }]
    },
    {
      key: 'errorLogSendTo',
      type: 'checkbox',
      label: '错误日志',
      description: '遇到错误时谁会收到错误日志。注：推送任务只可发送给主人。「第一个主人」与「所有主人」互斥。',
      orientation: 'horizontal',
      options: [
        { label: '第一个主人', value: 'master' },
        { label: '所有主人', value: 'allMasters' },
        { label: '触发者的群聊', value: 'trigger' }
      ]
    },
    { type: 'divider', title: '我的小玩具配置' },
    {
      key: 'qrLoginAddrType',
      type: 'radio',
      label: '扫码登录地址类型',
      description: '生成登录二维码时使用的服务器地址',
      orientation: 'horizontal',
      options: [
        { label: '局域网', value: 'lan', description: '适用于手机和服务器在同一局域网' },
        { label: '外部地址', value: 'external', description: '适用于远程访问，需手动配置' }
      ]
    },
    {
      key: 'qrLoginExternalAddr',
      type: 'input',
      inputType: 'text',
      label: '外部访问地址',
      description: '公网 IP 或域名，如：123.45.67.89 或 example.com',
      placeholder: '请输入公网 IP 或域名',
      disabled: $ne('qrLoginAddrType', 'external')
    }
  ]
}
