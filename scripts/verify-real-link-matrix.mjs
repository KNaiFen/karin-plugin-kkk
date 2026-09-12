import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const timestamp = () => {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join('') + '-' + [
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join('')
}

const RUN_ID = timestamp()
const OUTPUT_ROOT = `/private/tmp/kkk-verify-real-link-matrix-${RUN_ID}`
const OUTPUT_NODE_MODULES = path.join(OUTPUT_ROOT, 'node_modules')
const RUNTIME_ROOT = path.join(OUTPUT_ROOT, 'runtime')
const RUNTIME_NODE_MODULES = path.join(RUNTIME_ROOT, 'node_modules')
const HTML_ROOT = path.join(RUNTIME_ROOT, '@karinjs', 'temp', 'html')
const PUPPETEER_PLUGIN_CONFIG = path.join(RUNTIME_ROOT, '@karinjs', '@karinjs-plugin-puppeteer', 'config', 'config.json')
const KKK_TEMP_ROOT = path.join(RUNTIME_ROOT, '@karinjs', 'temp', 'karin-plugin-kkk')
const KKK_DOWNLOAD_VIDEO_ROOT = path.join(KKK_TEMP_ROOT, 'kkkdownload', 'video')
const KKK_DOWNLOAD_IMAGE_ROOT = path.join(KKK_TEMP_ROOT, 'kkkdownload', 'image')
const REPORT_PATH = path.join(OUTPUT_ROOT, 'report.json')
const REPORT_MARKDOWN_PATH = path.join(OUTPUT_ROOT, 'report.md')
const LOG_PATH = path.join(OUTPUT_ROOT, 'run.log')

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const REPO_CORE = path.join(REPO_ROOT, 'packages/core')
const REPO_CORE_SRC = path.join(REPO_CORE, 'src')
const REPO_CORE_ALIAS_SCOPE = path.join(REPO_CORE, 'node_modules', '@')
const PUPPETEER_PLUGIN_ENTRY = path.join(
  REPO_ROOT,
  'node_modules/.pnpm/@karinjs+plugin-puppeteer@2.3.1/node_modules/@karinjs/plugin-puppeteer/dist/index.js'
)
const HAPPY_DOM_ENTRY = path.join(
  REPO_ROOT,
  'node_modules/.pnpm/happy-dom@20.9.0/node_modules/happy-dom/lib/index.js'
)

const DEFAULT_BROWSER_CANDIDATES = [
  process.env.KKK_CHROME_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  path.join(homedir(), '.local/share/playwright-shared/chromium.app/Contents/MacOS/Google Chrome for Testing')
].filter(Boolean)

const resolveBrowserExecutablePath = () => {
  for (const candidate of DEFAULT_BROWSER_CANDIDATES) {
    if (candidate && fs.existsSync(candidate)) return candidate
  }
  return DEFAULT_BROWSER_CANDIDATES.at(-1)
}

const RENDER_BROWSER_EXECUTABLE = resolveBrowserExecutablePath()

const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true })
}

const writeJson = (file, data) => {
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const logLine = (message) => {
  const line = `[${new Date().toISOString()}] ${message}\n`
  fs.appendFileSync(LOG_PATH, line)
  console.log(message)
}

const normalizeError = (error) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    }
  }

  return {
    name: 'Error',
    message: String(error)
  }
}

const ensureTempNodeModules = () => {
  if (!fs.existsSync(OUTPUT_NODE_MODULES)) {
    fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), OUTPUT_NODE_MODULES, 'dir')
  }
}

const ensureRuntimeNodeModules = () => {
  if (!fs.existsSync(RUNTIME_NODE_MODULES)) {
    fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), RUNTIME_NODE_MODULES, 'dir')
  }

  const runtimePluginPackage = path.join(RUNTIME_NODE_MODULES, 'karin-plugin-kkk')
  if (!fs.existsSync(runtimePluginPackage)) {
    fs.symlinkSync(REPO_CORE, runtimePluginPackage, 'dir')
  }
}

const ensureSourceAliasPackages = () => {
  ensureDir(REPO_CORE_ALIAS_SCOPE)

  for (const entry of fs.readdirSync(REPO_CORE_SRC, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue

    const sourcePath = path.join(REPO_CORE_SRC, entry.name)
    const linkName = entry.isFile() && entry.name.endsWith('.ts')
      ? entry.name.slice(0, -3)
      : entry.name
    const targetPath = path.join(REPO_CORE_ALIAS_SCOPE, linkName)

    if (fs.existsSync(targetPath)) continue
    fs.symlinkSync(sourcePath, targetPath, entry.isDirectory() ? 'dir' : 'file')
  }
}

const ensureDomGlobals = async () => {
  const { Window } = await import(HAPPY_DOM_ENTRY)
  const window = new Window({
    url: 'https://codex.local/'
  })

  const mappings = {
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    HTMLImageElement: window.HTMLImageElement,
    HTMLCanvasElement: window.HTMLCanvasElement,
    SVGElement: window.SVGElement,
    Node: window.Node,
    DOMParser: window.DOMParser,
    MutationObserver: window.MutationObserver,
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window)
  }

  for (const [key, value] of Object.entries(mappings)) {
    if (!(key in globalThis)) {
      globalThis[key] = value
    }
  }
}

const listHtmlArtifacts = () => {
  if (!fs.existsSync(HTML_ROOT)) return []
  const stack = [HTML_ROOT]
  const files = []

  while (stack.length > 0) {
    const current = stack.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith('.html')) continue
      const stat = fs.statSync(fullPath)
      files.push({ path: fullPath, mtimeMs: stat.mtimeMs })
    }
  }

  files.sort((left, right) => left.path.localeCompare(right.path))
  return files
}

const diffHtmlArtifacts = (before, after) => {
  const beforeMap = new Map(before.map(item => [item.path, item.mtimeMs]))
  return after.filter(item => beforeMap.get(item.path) !== item.mtimeMs)
}

const captureBrowserProcesses = () => {
  try {
    const output = execFileSync('ps', ['-ax', '-o', 'pid=,command='], {
      encoding: 'utf8'
    })
    const lines = output
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .filter(line => line.includes('Google Chrome for Testing') || line.includes('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'))

    return {
      sharedExecutablePath: RENDER_BROWSER_EXECUTABLE,
      matched: lines,
      usedSharedChromium: Boolean(RENDER_BROWSER_EXECUTABLE) && lines.some(line => line.includes(RENDER_BROWSER_EXECUTABLE)),
      usedSystemChrome: lines.some(line => line.includes('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'))
    }
  } catch (error) {
    return {
      sharedExecutablePath: RENDER_BROWSER_EXECUTABLE,
      error: normalizeError(error)
    }
  }
}

const diffBrowserProcesses = (before, after) => {
  if (before?.error || after?.error) {
    return { before, after }
  }

  const beforePidSet = new Set(
    before.matched
      .map(line => line.match(/^(\d+)\s+/)?.[1])
      .filter(Boolean)
  )

  const added = after.matched.filter(line => {
    const pid = line.match(/^(\d+)\s+/)?.[1]
    return pid ? !beforePidSet.has(pid) : true
  })

  const sharedMainProcesses = RENDER_BROWSER_EXECUTABLE
    ? added.filter(line => line.includes(RENDER_BROWSER_EXECUTABLE))
    : []
  const systemMainProcesses = added.filter(line => line.includes('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'))

  return {
    before,
    after,
    added,
    sharedMainProcesses,
    systemMainProcesses,
    newlyStartedSharedChromium: sharedMainProcesses.length > 0,
    newlyStartedSystemChrome: systemMainProcesses.length > 0
  }
}

const ensureRendererConfig = () => {
  const config = {
    protocol: 'cdp',
    headless: true,
    debug: false,
    findBrowser: false,
    executablePath: RENDER_BROWSER_EXECUTABLE,
    slowMo: 0,
    maxOpenPages: 10,
    pageMode: 'reuse',
    pageIdleTimeout: 60_000,
    defaultViewport: {
      width: 1280,
      height: 720
    },
    download: {
      enable: false,
      browser: 'chrome',
      version: 'latest'
    },
    args: [
      '--window-size=1280,720',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--no-zygote',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-notifications',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-translate',
      '--password-store=basic',
      '--use-mock-keychain',
      '--hide-scrollbars',
      '--ignore-certificate-errors'
    ]
  }

  ensureDir(path.dirname(PUPPETEER_PLUGIN_CONFIG))
  writeJson(PUPPETEER_PLUGIN_CONFIG, config)
  return config
}

const ensureKkkTempDirs = () => {
  ensureDir(KKK_TEMP_ROOT)
  ensureDir(KKK_DOWNLOAD_VIDEO_ROOT)
  ensureDir(KKK_DOWNLOAD_IMAGE_ROOT)
}

const waitForRendererReady = async (karin, timeoutMs = 30_000) => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const count = karin.getRenderCount()
    if (count > 0) {
      return {
        ok: true,
        waitMs: Date.now() - start,
        count,
        list: karin.getRenderList()
      }
    }
    await sleep(250)
  }

  return {
    ok: false,
    waitMs: Date.now() - start,
    count: karin.getRenderCount(),
    list: karin.getRenderList()
  }
}

const toElements = (input) => {
  if (Array.isArray(input)) return input
  return [input]
}

const saveBase64Image = (image, caseDir, index) => {
  const ext = image.name?.split('.').pop()?.toLowerCase() === 'jpg' ? 'jpg' : 'png'
  const fileName = image.name || `reply-image-${String(index + 1).padStart(2, '0')}.${ext}`
  const targetPath = path.join(caseDir, 'images', fileName)
  ensureDir(path.dirname(targetPath))
  const base64 = String(image.file).replace(/^base64:\/\//, '')
  fs.writeFileSync(targetPath, Buffer.from(base64, 'base64'))

  return {
    kind: 'image',
    source: 'base64',
    path: targetPath,
    file: image.file,
    meta: {
      name: image.name,
      width: image.width,
      height: image.height,
      size: image.size
    }
  }
}

const saveReplyArtifacts = (content, caseDir) => {
  const artifacts = []
  const elements = toElements(content)

  for (const [index, element] of elements.entries()) {
    if (typeof element === 'string') {
      artifacts.push({ kind: 'text', text: element })
      continue
    }

    if (!element || typeof element !== 'object') {
      artifacts.push({ kind: 'other', meta: { value: element } })
      continue
    }

    if (element.type === 'image' && typeof element.file === 'string') {
      if (element.file.startsWith('base64://')) {
        artifacts.push(saveBase64Image(element, caseDir, index))
      } else {
        artifacts.push({
          kind: 'image',
          source: element.file.startsWith('file://') ? 'file' : 'external',
          file: element.file,
          meta: element
        })
      }
      continue
    }

    if (element.type === 'video' && typeof element.file === 'string') {
      artifacts.push({
        kind: 'video',
        source: element.file.startsWith('file://') ? 'file' : 'external',
        file: element.file,
        meta: element
      })
      continue
    }

    if (element.type === 'text' && typeof element.text === 'string') {
      artifacts.push({
        kind: 'text',
        text: element.text
      })
      continue
    }

    if (element.type === 'node' && Array.isArray(element.message)) {
      artifacts.push({
        kind: 'forward-node',
        meta: {
          userId: element.userId,
          nickname: element.nickname,
          subType: element.subType
        }
      })
      artifacts.push(...saveReplyArtifacts(element.message, caseDir))
      continue
    }

    artifacts.push({ kind: 'other', meta: element })
  }

  return artifacts
}

const makeEvent = (message, caseDir, overrides = {}) => {
  const replies = []
  const forwardReplies = []
  let replyCounter = 0

  const event = {
    msg: message,
    rawMessage: message,
    alias: message,
    selfId: 'codex-test-bot',
    userId: 'codex-test-user',
    messageId: `msg-${Date.now()}`,
    messageSeq: Date.now(),
    isPrivate: true,
    isFriend: true,
    isGroup: false,
    isGuild: false,
    isDirect: false,
    isGroupTemp: false,
    sender: {
      userId: 'codex-test-user',
      nick: 'Codex Test'
    },
    contact: {
      scene: 'friend',
      peer: 'codex-test-user'
    },
    bot: {
      account: {
        selfId: 'codex-test-bot',
        name: 'CodexBot'
      },
      adapter: {
        platform: 'other',
        name: 'codex-test-adapter'
      },
      setMsgReaction: async () => true,
      sendForwardMsg: async (_contact, forward, meta) => {
        const artifacts = saveReplyArtifacts(forward, caseDir)
        forwardReplies.push({
          meta,
          artifacts
        })
        replies.push(...artifacts)
        replyCounter += 1
        return { messageId: `forward-${replyCounter}` }
      },
      uploadFile: async (_contact, file) => {
        replies.push({
          kind: 'video',
          source: String(file).startsWith('file://') ? 'file' : 'external',
          file
        })
        return true
      },
      getGroupInfo: async (groupId) => ({
        groupId,
        groupName: 'Codex Test Group'
      })
    },
    reply: async (content) => {
      replies.push(...saveReplyArtifacts(content, caseDir))
      replyCounter += 1
      return { messageId: `reply-${replyCounter}` }
    },
    ...overrides
  }

  return { event, replies, forwardReplies }
}

const summarizeZhihuDetail = (detail) => ({
  type: detail.type,
  title: detail.type === 'article' ? detail.article.title : detail.question.title,
  author: detail.type === 'article' ? detail.article.author.name : detail.answer.author.name,
  imageCount: detail.richContent.images.length,
  videoCount: detail.richContent.videos.length,
  textLength: detail.richContent.text.length
})

const summarizeZhihuResolved = (post) => ({
  subtype: post.subtype,
  title: post.title,
  author: post.author?.name,
  imageCount: post.images.length,
  videoCount: post.videos.length,
  hasPrimaryVideo: Boolean(post.primaryVideo?.url),
  summaryLength: String(post.summary ?? '').length
})

const summarizeTieba = (detail, getTiebaContentText) => ({
  title: detail.title,
  forum: detail.forum.name,
  author: detail.author.name,
  imageCount: detail.content.filter(item => item.type === 'image').length,
  videoCount: detail.content.filter(item => item.type === 'video').length,
  commentCount: detail.comments.length,
  textPreview: getTiebaContentText(detail.content).slice(0, 120)
})

const summarizeHeybox = (detail) => ({
  title: detail.title,
  author: detail.author.name,
  imageCount: detail.images.length,
  hasVideo: Boolean(detail.video?.url),
  commentCount: detail.comments.length,
  textPreview: detail.content
    .filter(item => item.type === 'text')
    .map(item => item.text)
    .join('\n')
    .slice(0, 120)
})

const summarizeWeibo = (detail) => {
  if (detail.type === 'status') {
    return {
      type: detail.type,
      title: detail.status.title,
      author: detail.status.author.name,
      imageCount: detail.status.images.length,
      hasVideo: Boolean(detail.status.video?.url),
      textLength: detail.status.text.length
    }
  }

  return {
    type: detail.type,
    title: detail.show.title,
    author: detail.show.author?.name,
    imageCount: detail.show.images.length,
    hasVideo: Boolean(detail.show.video?.url),
    textLength: detail.show.text.length
  }
}

const summarizeWechat = (detail) => ({
  title: detail.title,
  accountName: detail.accountName,
  imageCount: detail.images.length,
  contentBlockCount: detail.contentBlocks.length,
  summaryLength: String(detail.summary ?? '').length
})

const summarizeXDetail = (detail) => ({
  title: detail.status.text.slice(0, 80),
  author: detail.status.author.name,
  imageCount: detail.status.images.length,
  hasVideo: Boolean(detail.status.video?.url),
  textLength: detail.status.text.length
})

const summarizeXResolved = (post) => ({
  subtype: post.subtype,
  title: post.title,
  author: post.author?.name,
  imageCount: post.images.length,
  videoCount: post.videos.length,
  hasPrimaryVideo: Boolean(post.primaryVideo?.url),
  summaryLength: String(post.summary ?? '').length
})

const summarizeBilibiliResolved = (post) => ({
  subtype: post.subtype,
  title: post.title,
  author: post.author?.name,
  imageCount: post.images.length,
  videoCount: post.videos.length,
  hasPrimaryVideo: Boolean(post.primaryVideo?.url),
  summaryLength: String(post.summary ?? '').length
})

const summarizeDouyinResolved = (post) => ({
  subtype: post.subtype,
  title: post.title,
  author: post.author?.name,
  imageCount: post.images.length,
  videoCount: post.videos.length,
  hasPrimaryVideo: Boolean(post.primaryVideo?.url),
  summaryLength: String(post.summary ?? '').length
})

const summarizeTikTokResolved = (post) => ({
  subtype: post.subtype,
  title: post.title,
  author: post.author?.name,
  videoCount: post.videos.length,
  hasPrimaryVideo: Boolean(post.primaryVideo?.url),
  summaryLength: String(post.summary ?? '').length
})

const summarizeKuaishouResolved = (post) => ({
  subtype: post.subtype,
  title: post.title,
  author: post.author?.name,
  videoCount: post.videos.length,
  hasPrimaryVideo: Boolean(post.primaryVideo?.url),
  summaryLength: String(post.summary ?? '').length
})

const summarizeXhsResolved = (post) => ({
  subtype: post.subtype,
  title: post.title,
  author: post.author?.name,
  imageCount: post.images.length,
  videoCount: post.videos.length,
  hasPrimaryVideo: Boolean(post.primaryVideo?.url),
  summaryLength: String(post.summary ?? '').length
})

const formatMarkdownReport = (report) => {
  const lines = [
    '# 真实链接矩阵验证报告',
    '',
    `- 运行时间：${new Date().toISOString()}`,
    `- 运行目录：\`${report.outputRoot}\``,
    `- 用例总数：${report.results.length}`,
    ''
  ]

  for (const result of report.results) {
    const okFlags = [
      ['extractor', result.extractor?.ok],
      ['getId', result.id?.ok],
      ['resolve', result.resolve?.ok],
      ['handler', result.command?.ok]
    ]
    const passed = okFlags.filter(([, ok]) => ok).length
    lines.push(`## ${result.idLabel}`)
    lines.push('')
    lines.push(`- 平台：${result.platform}`)
    lines.push(`- 链接形态：${result.linkShape}`)
    lines.push(`- 原始消息：\`${result.inputMessage}\``)
    lines.push(`- 解析输入：\`${result.parseInput}\``)
    lines.push(`- 通过项：${passed}/${okFlags.length}`)
    lines.push(`- 渲染 HTML：${result.renderHtml.length}`)
    lines.push(`- 回复条目：${result.replies.length}`)
    if (result.notes.length > 0) {
      lines.push(`- 备注：${result.notes.join('；')}`)
    }
    if (!result.command?.ok && result.command?.error?.message) {
      lines.push(`- Handler 失败：${result.command.error.message}`)
    }
    if (!result.resolve?.ok && result.resolve?.error?.message) {
      lines.push(`- Resolve 失败：${result.resolve.error.message}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

const buildCases = () => ([
  {
    id: 'bilibili-b23',
    platform: 'bilibili',
    linkShape: '短链',
    inputMessage: 'https://b23.tv/EGrR7XL',
    parseInput: 'https://b23.tv/EGrR7XL'
  },
  {
    id: 'bilibili-web-p',
    platform: 'bilibili',
    linkShape: '长链-分P',
    inputMessage: 'https://www.bilibili.com/video/BV1YLVH6UEGa?p=2',
    parseInput: 'https://www.bilibili.com/video/BV1YLVH6UEGa?p=2'
  },
  {
    id: 'bilibili-bv-only',
    platform: 'bilibili',
    linkShape: '纯BV号',
    inputMessage: 'BV12uLq6dEdv',
    parseInput: 'BV12uLq6dEdv'
  },
  {
    id: 'bilibili-live-room',
    platform: 'bilibili',
    linkShape: '直播间长链',
    inputMessage: 'https://live.bilibili.com/8139918',
    parseInput: 'https://live.bilibili.com/8139918'
  },
  {
    id: 'douyin-short',
    platform: 'douyin',
    linkShape: '短链',
    inputMessage: 'https://v.douyin.com/pGDQzKiWtBM/',
    parseInput: 'https://v.douyin.com/pGDQzKiWtBM/'
  },
  {
    id: 'douyin-web-video',
    platform: 'douyin',
    linkShape: '长链',
    inputMessage: 'https://www.douyin.com/video/7653615515386072360',
    parseInput: 'https://www.douyin.com/video/7653615515386072360'
  },
  {
    id: 'douyin-share-text',
    platform: 'douyin',
    linkShape: '分享文案短链',
    inputMessage: '9.23 Dhb:/ m@D.hB :6pm 06/20 跨世纪大型回旋镖，带英沦为印度殖民地 # 全球深度看抖音 # 零基础看懂全球 # 全球创作者计划 https://v.douyin.com/Wdv0YPvpaYg/ 复制此链接，打开Dou音搜索，直接观看视频！',
    parseInput: 'https://v.douyin.com/Wdv0YPvpaYg/'
  },
  {
    id: 'douyin-live-room',
    platform: 'douyin',
    linkShape: '直播间长链',
    inputMessage: 'https://live.douyin.com/767768667211',
    parseInput: 'https://live.douyin.com/767768667211'
  },
  {
    id: 'tiktok-vt',
    platform: 'tiktok',
    linkShape: 'vt短链',
    inputMessage: 'https://vt.tiktok.com/ZSxVY1Gos/',
    parseInput: 'https://vt.tiktok.com/ZSxVY1Gos/'
  },
  {
    id: 'tiktok-web',
    platform: 'tiktok',
    linkShape: '长链',
    inputMessage: 'https://www.tiktok.com/@good.ball21/video/7643493503778966797?_r=1',
    parseInput: 'https://www.tiktok.com/@good.ball21/video/7643493503778966797?_r=1'
  },
  {
    id: 'kuaishou-short-video',
    platform: 'kuaishou',
    linkShape: 'short-video长链',
    inputMessage: 'https://www.kuaishou.com/short-video/3x8s2qmteama6ha',
    parseInput: 'https://www.kuaishou.com/short-video/3x8s2qmteama6ha'
  },
  {
    id: 'xiaohongshu-short',
    platform: 'xiaohongshu',
    linkShape: 'xhslink短链',
    inputMessage: 'http://xhslink.com/o/2fKOpvaOc9C',
    parseInput: 'http://xhslink.com/o/2fKOpvaOc9C'
  },
  {
    id: 'xiaohongshu-explore',
    platform: 'xiaohongshu',
    linkShape: 'explore长链',
    inputMessage: process.env.KKK_VERIFY_XHS_EXPLORE_URL ?? '',
    parseInput: process.env.KKK_VERIFY_XHS_EXPLORE_URL ?? ''
  },
  {
    id: 'xiaohongshu-discovery-item',
    platform: 'xiaohongshu',
    linkShape: 'discovery/item长链',
    inputMessage: process.env.KKK_VERIFY_XHS_DISCOVERY_URL ?? '',
    parseInput: process.env.KKK_VERIFY_XHS_DISCOVERY_URL ?? ''
  },
  {
    id: 'zhihu-article',
    platform: 'zhihu',
    linkShape: '专栏长链',
    inputMessage: 'https://zhuanlan.zhihu.com/p/2010754233901737586',
    parseInput: 'https://zhuanlan.zhihu.com/p/2010754233901737586'
  },
  {
    id: 'zhihu-link-article',
    platform: 'zhihu',
    linkShape: 'link.zhihu跳转-专栏',
    inputMessage: 'https://link.zhihu.com/?target=https%3A%2F%2Fzhuanlan.zhihu.com%2Fp%2F2010754233901737586',
    parseInput: 'https://link.zhihu.com/?target=https%3A%2F%2Fzhuanlan.zhihu.com%2Fp%2F2010754233901737586'
  },
  {
    id: 'zhihu-answer',
    platform: 'zhihu',
    linkShape: '问答长链',
    inputMessage: 'https://www.zhihu.com/question/19550283/answer/122329247',
    parseInput: 'https://www.zhihu.com/question/19550283/answer/122329247'
  },
  {
    id: 'zhihu-link-answer',
    platform: 'zhihu',
    linkShape: 'link.zhihu跳转-回答',
    inputMessage: 'https://link.zhihu.com/?target=https%3A%2F%2Fwww.zhihu.com%2Fquestion%2F19550283%2Fanswer%2F122329247',
    parseInput: 'https://link.zhihu.com/?target=https%3A%2F%2Fwww.zhihu.com%2Fquestion%2F19550283%2Fanswer%2F122329247'
  },
  {
    id: 'tieba-post',
    platform: 'tieba',
    linkShape: '帖子长链',
    inputMessage: 'https://tieba.baidu.com/p/10772909650?see_lz=0',
    parseInput: 'https://tieba.baidu.com/p/10772909650?see_lz=0'
  },
  {
    id: 'heybox-share-api',
    platform: 'heybox',
    linkShape: 'API分享长链',
    inputMessage: 'https://api.xiaoheihe.cn/v3/bbs/app/api/web/share?h_camp=link&h_src=YXBwX3NoYXJl&link_id=77f871fa97e9',
    parseInput: 'https://api.xiaoheihe.cn/v3/bbs/app/api/web/share?h_camp=link&h_src=YXBwX3NoYXJl&link_id=77f871fa97e9'
  },
  {
    id: 'wechat-article',
    platform: 'wechat',
    linkShape: '公众号文章',
    inputMessage: 'https://mp.weixin.qq.com/s/tAJ1B8ClOjQ41TWYJbIFTA',
    parseInput: 'https://mp.weixin.qq.com/s/tAJ1B8ClOjQ41TWYJbIFTA'
  },
  {
    id: 'weibo-status-r34',
    platform: 'weibo',
    linkShape: '微博正文链接',
    inputMessage: 'https://weibo.com/5177612153/R34sAiuo6',
    parseInput: 'https://weibo.com/5177612153/R34sAiuo6'
  },
  {
    id: 'weibo-status-r2y',
    platform: 'weibo',
    linkShape: '微博正文链接-备用样例',
    inputMessage: 'https://weibo.com/5955106173/R2YQog7Pb',
    parseInput: 'https://weibo.com/5955106173/R2YQog7Pb'
  },
  {
    id: 'weibo-mobile-status',
    platform: 'weibo',
    linkShape: '微博移动端status',
    inputMessage: 'https://m.weibo.cn/status/R34sAiuo6',
    parseInput: 'https://m.weibo.cn/status/R34sAiuo6'
  },
  {
    id: 'weibo-mobile-detail',
    platform: 'weibo',
    linkShape: '微博移动端detail',
    inputMessage: 'https://m.weibo.cn/detail/R2YQog7Pb',
    parseInput: 'https://m.weibo.cn/detail/R2YQog7Pb'
  },
  {
    id: 'x-status',
    platform: 'x',
    linkShape: 'X长链',
    inputMessage: 'https://x.com/cakedochi/status/2050564108114899179',
    parseInput: 'https://x.com/cakedochi/status/2050564108114899179'
  },
  {
    id: 'x-twitter-video-route',
    platform: 'x',
    linkShape: 'Twitter兼容长链',
    inputMessage: 'https://twitter.com/cakedochi/status/2050564108114899179/video/1',
    parseInput: 'https://twitter.com/cakedochi/status/2050564108114899179/video/1'
  }
])

const buildSelectedPlatforms = (raw) => {
  if (!raw) return null
  const set = new Set(
    String(raw)
      .split(',')
      .map(item => item.trim().toLowerCase())
      .filter(Boolean)
  )
  return set.size > 0 ? set : null
}

const shouldSkipCase = (item, selectedPlatforms, selectedCaseIds) => {
  if (selectedPlatforms && !selectedPlatforms.has(item.platform)) return true
  if (selectedCaseIds && !selectedCaseIds.has(item.id)) return true
  return false
}

const main = async () => {
  ensureDir(OUTPUT_ROOT)
  ensureDir(RUNTIME_ROOT)
  ensureTempNodeModules()
  ensureRuntimeNodeModules()
  ensureSourceAliasPackages()
  ensureKkkTempDirs()
  fs.writeFileSync(LOG_PATH, '')
  process.chdir(RUNTIME_ROOT)

  const selectedPlatforms = buildSelectedPlatforms(process.env.KKK_VERIFY_PLATFORMS)
  const selectedCaseIds = buildSelectedPlatforms(process.env.KKK_VERIFY_CASES)
  const skipHandlerPlatforms = buildSelectedPlatforms(process.env.KKK_SKIP_HANDLER_PLATFORMS)
  const includePendingSamples = process.env.KKK_INCLUDE_PENDING_SAMPLES === '1'

  const rendererBoot = {
    config: ensureRendererConfig()
  }

  let rendererBootError = null
  process.on('unhandledRejection', (error) => {
    const payload = normalizeError(error)
    rendererBootError = payload
    writeJson(path.join(OUTPUT_ROOT, 'renderer-unhandled-rejection.json'), payload)
    logLine(`[renderer] unhandled_rejection ${payload.message}`)
  })

  const karin = await import('node-karin')
  const { logger } = karin
  logger.level = 'debug'

  rendererBoot.beforeImport = {
    count: karin.getRenderCount(),
    list: karin.getRenderList()
  }
  rendererBoot.processesBeforeImport = captureBrowserProcesses()

  logLine('[renderer] importing @karinjs/plugin-puppeteer')
  await import(PUPPETEER_PLUGIN_ENTRY)

  rendererBoot.afterImport = {
    count: karin.getRenderCount(),
    list: karin.getRenderList()
  }

  rendererBoot.wait = await waitForRendererReady(karin)
  rendererBoot.processesAfterReady = captureBrowserProcesses()
  rendererBoot.processesDiff = diffBrowserProcesses(
    rendererBoot.processesBeforeImport,
    rendererBoot.processesAfterReady
  )
  rendererBoot.error = rendererBootError
  writeJson(path.join(OUTPUT_ROOT, 'renderer-boot.json'), rendererBoot)
  logLine(`[renderer] ready=${rendererBoot.wait.ok} count=${rendererBoot.wait.count} waitMs=${rendererBoot.wait.waitMs}`)

  await ensureDomGlobals()

  const linkExtractors = await import(path.join(REPO_CORE, 'src/apps/linkExtractors.ts'))
  const { Config } = await import(path.join(REPO_CORE, 'src/module/utils/Config.ts'))
  const { guestCookieManager } = await import(path.join(REPO_CORE, 'src/module/utils/GuestCookieManager.ts'))

  const bilibiliGetId = await import(path.join(REPO_CORE, 'src/platform/bilibili/getID.ts'))
  const douyinGetId = await import(path.join(REPO_CORE, 'src/platform/douyin/getID.ts'))
  const tiktokGetId = await import(path.join(REPO_CORE, 'src/platform/tiktok/getID.ts'))
  const kuaishouGetId = await import(path.join(REPO_CORE, 'src/platform/kuaishou/getID.ts'))
  const xiaohongshuGetId = await import(path.join(REPO_CORE, 'src/platform/xiaohongshu/getID.ts'))
  const zhihuGetId = await import(path.join(REPO_CORE, 'src/platform/zhihu/getID.ts'))
  const tiebaGetId = await import(path.join(REPO_CORE, 'src/platform/tieba/getID.ts'))
  const heyboxGetId = await import(path.join(REPO_CORE, 'src/platform/heybox/getID.ts'))
  const wechatGetId = await import(path.join(REPO_CORE, 'src/platform/wechat/getID.ts'))
  const weiboGetId = await import(path.join(REPO_CORE, 'src/platform/weibo/getID.ts'))
  const xGetId = await import(path.join(REPO_CORE, 'src/platform/x/getID.ts'))

  const zhihuApi = await import(path.join(REPO_CORE, 'src/platform/zhihu/api.ts'))
  const tiebaApi = await import(path.join(REPO_CORE, 'src/platform/tieba/api.ts'))
  const heyboxApi = await import(path.join(REPO_CORE, 'src/platform/heybox/api.ts'))
  const weiboApi = await import(path.join(REPO_CORE, 'src/platform/weibo/api.ts'))
  const wechatApi = await import(path.join(REPO_CORE, 'src/platform/wechat/api.ts'))
  const xApi = await import(path.join(REPO_CORE, 'src/platform/x/api.ts'))

  const resolveParsedPost = await import(path.join(REPO_CORE, 'src/platform/resolveParsedPost.ts'))
  const kuaishouData = await import(path.join(REPO_CORE, 'src/platform/kuaishou/getdata.ts'))
  const bilibiliModule = await import(path.join(REPO_CORE, 'src/platform/bilibili/bilibili.ts'))
  const douyinModule = await import(path.join(REPO_CORE, 'src/platform/douyin/douyin.ts'))
  const tiktokModule = await import(path.join(REPO_CORE, 'src/platform/tiktok/tiktok.ts'))
  const kuaishouModule = await import(path.join(REPO_CORE, 'src/platform/kuaishou/kuaishou.ts'))
  const xiaohongshuModule = await import(path.join(REPO_CORE, 'src/platform/xiaohongshu/xiaohongshu.ts'))
  const zhihuModule = await import(path.join(REPO_CORE, 'src/platform/zhihu/zhihu.ts'))
  const tiebaModule = await import(path.join(REPO_CORE, 'src/platform/tieba/tieba.ts'))
  const heyboxModule = await import(path.join(REPO_CORE, 'src/platform/heybox/heybox.ts'))
  const wechatModule = await import(path.join(REPO_CORE, 'src/platform/wechat/wechat.ts'))
  const weiboModule = await import(path.join(REPO_CORE, 'src/platform/weibo/weibo.ts'))
  const xModule = await import(path.join(REPO_CORE, 'src/platform/x/x.ts'))

  Config.app.parseTip = false
  Config.app.multiPageRender = true
  Config.app.multiPageTriggerAspectRatio = 3.5
  Config.app.multiPageMaxAspectRatio = 2.2
  Config.app.renderImageFormat = 'jpeg'
  Config.app.renderImageQuality = 95
  Config.app.removeCache = true

  Config.bilibili.renderCard = { enable: true, includeImages: true }
  Config.bilibili.sendContent = ['info']
  Config.bilibili.comment = false

  Config.douyin.renderScale = Config.douyin.renderScale ?? 1
  Config.douyin.sendContent = ['info']
  Config.douyin.comment = false

  Config.tiktok.videoTool = false
  Config.tiktok.plainTitleReply = false

  Config.kuaishou.comment = false

  Config.xiaohongshu.renderScale = Config.xiaohongshu.renderScale ?? 1
  Config.xiaohongshu.sendContent = ['info']
  Config.xiaohongshu.comment = false

  Config.zhihu.renderCard = { enable: true, includeImages: true }
  Config.zhihu.sendContent = ['info', 'image']

  Config.tieba.renderCard = { enable: true, includeImages: true }
  Config.tieba.sendContent = ['info', 'image']
  Config.tieba.comment = false

  Config.heybox.renderCard = { enable: true, includeImages: true }
  Config.heybox.sendContent = ['info', 'image']

  Config.wechat.renderCard = { enable: true, includeImages: true }
  Config.wechat.sendContent = ['info', 'image']

  Config.weibo.renderCard = { enable: true, includeImages: true }
  Config.weibo.sendContent = ['info', 'image']

  Config.x.renderCard = { enable: true, includeImages: true }
  Config.x.sendContent = ['info', 'image']

  const envSummary = {
    cwd: process.cwd(),
    rendererBoot,
    browserExecutablePath: RENDER_BROWSER_EXECUTABLE,
    filters: {
      selectedPlatforms: selectedPlatforms ? [...selectedPlatforms] : null,
      selectedCaseIds: selectedCaseIds ? [...selectedCaseIds] : null,
      skipHandlerPlatforms: skipHandlerPlatforms ? [...skipHandlerPlatforms] : null,
      includePendingSamples
    },
    app: {
      parseTip: Config.app.parseTip,
      renderScale: Config.app.renderScale,
      renderImageFormat: Config.app.renderImageFormat,
      renderImageQuality: Config.app.renderImageQuality,
      multiPageRender: Config.app.multiPageRender,
      multiPageTriggerAspectRatio: Config.app.multiPageTriggerAspectRatio,
      multiPageMaxAspectRatio: Config.app.multiPageMaxAspectRatio
    }
  }
  writeJson(path.join(OUTPUT_ROOT, 'env-summary.json'), envSummary)

  const runtimeCases = {
    bilibili: {
      extractor: linkExtractors.extractBilibiliMessageUrl,
      ensureCookie: async () => await guestCookieManager.ensureFreshCookie('bilibili', { waitForStale: true }),
      getId: (event, value) => bilibiliGetId.getBilibiliID(value),
      resolve: async (value) => await resolveParsedPost.resolveBilibiliParsedPost(value),
      summarizeResolved: summarizeBilibiliResolved,
      runHandler: async (event, id) => await new bilibiliModule.Bilibili(event, id, {}).BilibiliHandler(id)
    },
    douyin: {
      extractor: linkExtractors.extractDouyinMessageUrl,
      ensureCookie: async () => await guestCookieManager.ensureFreshCookie('douyin', { waitForStale: true }),
      getId: (event, value) => douyinGetId.getDouyinID(event, value, true),
      resolve: async (value) => await resolveParsedPost.resolveDouyinParsedPost(value),
      summarizeResolved: summarizeDouyinResolved,
      runHandler: async (event, id) => await new douyinModule.DouYin(event, id, {}).DouyinHandler(id)
    },
    tiktok: {
      extractor: linkExtractors.extractTikTokMessageUrl,
      ensureCookie: async () => await guestCookieManager.ensureFreshCookie('tiktok', { waitForStale: true }),
      getId: (event, value) => tiktokGetId.getTikTokID(event, value, true),
      resolve: async (value) => await resolveParsedPost.resolveTikTokParsedPost(value),
      summarizeResolved: summarizeTikTokResolved,
      runHandler: async (event, id) => await new tiktokModule.TikTok(event, id, {}).TikTokHandler()
    },
    kuaishou: {
      extractor: (message) => message.replace(/\\/g, '').match(/(https:\/\/v\.kuaishou\.com\/\w+|https:\/\/www\.kuaishou\.com\/f\/[a-zA-Z0-9]+|https:\/\/www\.kuaishou\.com\/short-video\/[a-zA-Z0-9_-]+)/g)?.[0] ?? null,
      getId: async (_event, value) => await kuaishouGetId.getKuaishouID(value, true),
      resolve: async (value) => await resolveParsedPost.resolveKuaishouParsedPost(value),
      summarizeResolved: summarizeKuaishouResolved,
      fetchDetail: async (id) => {
        const detail = await kuaishouData.fetchKuaishouData(id.type, id)
        return {
          type: id.type,
          hasVideoData: Boolean(detail?.VideoData),
          hasCommentsData: Boolean(detail?.CommentsData),
          hasEmojiData: Boolean(detail?.EmojiData)
        }
      },
      runHandler: async (event, id, _parseInput, fetchDetailResult) => {
        const detail = await kuaishouData.fetchKuaishouData(id.type, id)
        return await new kuaishouModule.Kuaishou(event, id, {}).KuaishouHandler(detail, id.url ?? fetchDetailResult?.url ?? _parseInput)
      }
    },
    xiaohongshu: {
      extractor: (message) => message.replace(/\\/g, '').match(/https?:\/\/[^\s"'<>]*(?:xiaohongshu\.com|xhslink\.com)[^\s"'<>]*/i)?.[0] ?? null,
      ensureCookie: async () => await guestCookieManager.ensureFreshCookie('xiaohongshu', { waitForStale: true }),
      getId: async (_event, value) => await xiaohongshuGetId.getXiaohongshuID(value, true),
      resolve: async (value) => await resolveParsedPost.resolveXiaohongshuParsedPost(value),
      summarizeResolved: summarizeXhsResolved,
      runHandler: async (event, id) => await new xiaohongshuModule.Xiaohongshu(event, id, {}).XiaohongshuHandler(id)
    },
    zhihu: {
      extractor: linkExtractors.extractZhihuMessageUrl,
      ensureCookie: async () => await guestCookieManager.ensureFreshCookie('zhihu', { waitForStale: true }),
      getId: async (_event, value) => await zhihuGetId.getZhihuID(value, true),
      fetchDetail: zhihuApi.fetchZhihuDetail,
      summarizeDetail: summarizeZhihuDetail,
      resolve: async (value) => await resolveParsedPost.resolveZhihuParsedPost(value),
      summarizeResolved: summarizeZhihuResolved,
      runHandler: async (event, id) => await new zhihuModule.Zhihu(event, id, {}).ZhihuHandler()
    },
    tieba: {
      extractor: linkExtractors.extractTiebaMessageUrl,
      getId: async (_event, value) => await tiebaGetId.getTiebaID(value, true),
      fetchDetail: async (id) => await tiebaApi.getTiebaPostDetail(id.tid, id.pid),
      summarizeDetail: (detail) => summarizeTieba(detail, tiebaApi.getTiebaContentText),
      resolve: async (value) => await resolveParsedPost.resolveTiebaParsedPost(value),
      summarizeResolved: (post) => ({
        title: post.title,
        author: post.author?.name,
        imageCount: post.images.length,
        videoCount: post.videos.length,
        summaryLength: String(post.summary ?? '').length
      }),
      runHandler: async (event, id) => await new tiebaModule.Tieba(event, id, {}).TiebaHandler(id)
    },
    heybox: {
      extractor: linkExtractors.extractHeyBoxMessageUrl,
      ensureCookie: async () => await guestCookieManager.ensureFreshCookie('heybox', { waitForStale: true }),
      getId: async (_event, value) => await heyboxGetId.getHeyboxID(value, true),
      fetchDetail: async (id) => await heyboxApi.fetchHeyboxDetail({
        linkId: id.link_id,
        cookie: Config.cookies.heybox
      }),
      summarizeDetail: summarizeHeybox,
      resolve: async (value) => await resolveParsedPost.resolveHeyboxParsedPost(value),
      summarizeResolved: (post) => ({
        title: post.title,
        author: post.author?.name,
        imageCount: post.images.length,
        videoCount: post.videos.length,
        summaryLength: String(post.summary ?? '').length
      }),
      runHandler: async (event, id) => await new heyboxModule.Heybox(event, id, {}).HeyboxHandler(id)
    },
    wechat: {
      extractor: linkExtractors.extractWechatMessageUrl,
      getId: async (_event, value) => await wechatGetId.getWechatID(value),
      fetchDetail: async (id) => await wechatApi.fetchWechatArticleDetail(id.url),
      summarizeDetail: summarizeWechat,
      resolve: async (value) => await resolveParsedPost.resolveWechatParsedPost(value),
      summarizeResolved: (post) => ({
        title: post.title,
        author: post.author?.name,
        imageCount: post.images.length,
        videoCount: post.videos.length,
        contentBlockCount: post.contentBlocks.length,
        summaryLength: String(post.summary ?? '').length
      }),
      runHandler: async (event, id) => await new wechatModule.Wechat(event, id, {}).WechatHandler(id)
    },
    weibo: {
      extractor: linkExtractors.extractWeiboMessageUrl,
      ensureCookie: async () => await guestCookieManager.ensureFreshCookie('weibo', { waitForStale: true }),
      getId: async (_event, value) => await weiboGetId.getWeiboID(value, true),
      fetchDetail: weiboApi.fetchWeiboDetail,
      summarizeDetail: summarizeWeibo,
      resolve: async (value) => await resolveParsedPost.resolveWeiboParsedPost(value),
      summarizeResolved: (post) => ({
        subtype: post.subtype,
        title: post.title,
        author: post.author?.name,
        imageCount: post.images.length,
        videoCount: post.videos.length,
        summaryLength: String(post.summary ?? '').length
      }),
      runHandler: async (event, id) => await new weiboModule.Weibo(event, id, {}).WeiboHandler()
    },
    x: {
      extractor: linkExtractors.extractXMessageUrl,
      getId: async (_event, value) => await xGetId.getXID(value, true),
      fetchDetail: xApi.fetchXDetail,
      summarizeDetail: summarizeXDetail,
      resolve: async (value) => await resolveParsedPost.resolveXParsedPost(value),
      summarizeResolved: summarizeXResolved,
      runHandler: async (event, id) => await new xModule.X(event, id, {}).XHandler()
    }
  }

  const results = []

  for (const item of buildCases()) {
    if (shouldSkipCase(item, selectedPlatforms, selectedCaseIds)) continue
    if (!includePendingSamples && !item.inputMessage) continue

    const caseDir = path.join(OUTPUT_ROOT, item.id)
    ensureDir(path.join(caseDir, 'images'))
    const platformRuntime = runtimeCases[item.platform]

    const result = {
      caseId: item.id,
      idLabel: `${item.platform}:${item.id}`,
      platform: item.platform,
      linkShape: item.linkShape,
      inputMessage: item.inputMessage,
      parseInput: item.parseInput,
      extractor: { ok: false },
      cookie: null,
      id: { ok: false },
      fetch: { ok: false, skipped: false },
      resolve: { ok: false, skipped: false },
      command: { ok: false, skipped: false },
      replies: [],
      forwardReplies: [],
      renderHtml: [],
      notes: []
    }

    if (!platformRuntime) {
      result.notes.push('平台未注册 runtimeCase')
      results.push(result)
      continue
    }

    if (!item.inputMessage || !item.parseInput) {
      result.fetch = { ok: false, skipped: true }
      result.resolve = { ok: false, skipped: true }
      result.command = { ok: false, skipped: true }
      result.notes.push('缺少公开真实样例链接')
      results.push(result)
      continue
    }

    logLine(`[${item.id}] start`)

    const beforeHtml = listHtmlArtifacts()
    const { event, replies, forwardReplies } = makeEvent(item.inputMessage, caseDir)

    let idValue
    try {
      const extracted = platformRuntime.extractor(item.inputMessage)
      result.extractor = { ok: true, value: extracted }
      writeJson(path.join(caseDir, 'extractor.json'), extracted)
      if (!extracted && item.parseInput) {
        result.notes.push('extractor 未命中，仍继续按 parseInput 执行')
      }
    } catch (error) {
      result.extractor = { ok: false, error: normalizeError(error) }
    }

    try {
      if (platformRuntime.ensureCookie) {
        await platformRuntime.ensureCookie()
        result.cookie = { ok: true }
      }
    } catch (error) {
      result.cookie = { ok: false, error: normalizeError(error) }
      result.notes.push('ensureCookie 失败，后续继续尝试真实链路')
    }

    try {
      idValue = await platformRuntime.getId(event, item.parseInput)
      result.id = { ok: true, value: idValue }
      writeJson(path.join(caseDir, 'id.json'), idValue)
    } catch (error) {
      result.id = { ok: false, error: normalizeError(error) }
    }

    if (result.id.ok && platformRuntime.fetchDetail) {
      try {
        const detail = await platformRuntime.fetchDetail(idValue)
        const summary = platformRuntime.summarizeDetail
          ? platformRuntime.summarizeDetail(detail)
          : detail
        result.fetch = { ok: true, value: summary }
        writeJson(path.join(caseDir, 'detail-summary.json'), summary)
      } catch (error) {
        result.fetch = { ok: false, error: normalizeError(error) }
      }
    } else {
      result.fetch = { ok: false, skipped: true }
    }

    if (platformRuntime.resolve) {
      try {
        const parsedPost = await platformRuntime.resolve(item.parseInput)
        const summary = platformRuntime.summarizeResolved
          ? platformRuntime.summarizeResolved(parsedPost)
          : parsedPost
        result.resolve = { ok: true, value: summary }
        writeJson(path.join(caseDir, 'resolved-post-summary.json'), summary)
      } catch (error) {
        result.resolve = { ok: false, error: normalizeError(error) }
      }
    } else {
      result.resolve = { ok: false, skipped: true }
    }

    if (!platformRuntime.runHandler) {
      result.command = { ok: false, skipped: true }
      result.notes.push('未注册 runHandler')
    } else if (skipHandlerPlatforms?.has(item.platform)) {
      result.command = { ok: false, skipped: true }
      result.notes.push('命中 KKK_SKIP_HANDLER_PLATFORMS，跳过 handler')
    } else {
      try {
        await platformRuntime.runHandler(event, idValue, item.parseInput, result.fetch?.value)
        result.command = { ok: true, value: 'resolved' }
      } catch (error) {
        result.command = { ok: false, error: normalizeError(error) }
      }
    }

    const afterHtml = listHtmlArtifacts()
    result.renderHtml = diffHtmlArtifacts(beforeHtml, afterHtml)
    result.replies = replies
    result.forwardReplies = forwardReplies

    const renderedBase64Images = result.replies.filter(reply => reply.kind === 'image' && reply.source === 'base64')
    const externalImages = result.replies.filter(reply => reply.kind === 'image' && reply.source === 'external')
    const fileVideos = result.replies.filter(reply => reply.kind === 'video' && reply.source === 'file')
    const externalVideos = result.replies.filter(reply => reply.kind === 'video' && reply.source === 'external')

    result.notes.push(`rendered_base64_images=${renderedBase64Images.length}`)
    result.notes.push(`external_images=${externalImages.length}`)
    result.notes.push(`file_videos=${fileVideos.length}`)
    result.notes.push(`external_videos=${externalVideos.length}`)
    result.notes.push(`render_html=${result.renderHtml.length}`)

    writeJson(path.join(caseDir, 'command-result.json'), {
      command: result.command,
      replies: result.replies,
      forwardReplies: result.forwardReplies,
      renderHtml: result.renderHtml
    })

    logLine(`[${item.id}] done id_ok=${result.id.ok} resolve_ok=${result.resolve.ok} command_ok=${result.command.ok}`)
    results.push(result)
  }

  const report = {
    runId: RUN_ID,
    outputRoot: OUTPUT_ROOT,
    htmlRoot: HTML_ROOT,
    envSummary,
    results
  }

  writeJson(REPORT_PATH, report)
  fs.writeFileSync(REPORT_MARKDOWN_PATH, formatMarkdownReport(report))
  logLine(`[done] output=${OUTPUT_ROOT}`)
}

await main().catch((error) => {
  const payload = normalizeError(error)
  ensureDir(OUTPUT_ROOT)
  fs.writeFileSync(path.join(OUTPUT_ROOT, 'fatal-error.json'), JSON.stringify(payload, null, 2))
  console.error(error)
  process.exitCode = 1
})
