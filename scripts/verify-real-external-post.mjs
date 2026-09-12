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
const OUTPUT_ROOT = `/private/tmp/kkk-verify-cross-platform-${RUN_ID}`
const OUTPUT_NODE_MODULES = path.join(OUTPUT_ROOT, 'node_modules')
const RUNTIME_ROOT = path.join(OUTPUT_ROOT, 'runtime')
const RUNTIME_NODE_MODULES = path.join(RUNTIME_ROOT, 'node_modules')
const HTML_ROOT = path.join(RUNTIME_ROOT, '@karinjs', 'temp', 'html')
const PUPPETEER_PLUGIN_CONFIG = path.join(RUNTIME_ROOT, '@karinjs', '@karinjs-plugin-puppeteer', 'config', 'config.json')
const REPORT_PATH = path.join(OUTPUT_ROOT, 'report.json')
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
const BROWSER_CANDIDATES = [
  process.env.KKK_CHROME_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  path.join(homedir(), '.local/share/playwright-shared/chromium.app/Contents/MacOS/Google Chrome for Testing')
].filter(Boolean)

const resolveBrowserExecutablePath = () => {
  for (const candidate of BROWSER_CANDIDATES) {
    if (candidate && fs.existsSync(candidate)) return candidate
  }
  return BROWSER_CANDIDATES.at(-1)
}

const RENDER_BROWSER_EXECUTABLE = resolveBrowserExecutablePath()

const CASES = [
  {
    id: 'weibo',
    platform: 'weibo',
    url: 'https://weibo.com/5177612153/R34sAiuo6'
  },
  {
    id: 'zhihu',
    platform: 'zhihu',
    url: 'https://zhuanlan.zhihu.com/p/2010754233901737586'
  },
  {
    id: 'tieba',
    platform: 'tieba',
    url: 'https://tieba.baidu.com/p/10772909650?see_lz=0'
  },
  {
    id: 'heybox',
    platform: 'heybox',
    url: 'https://api.xiaoheihe.cn/v3/bbs/app/api/web/share?link_id=77f871fa97e9'
  }
]

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

const makeEvent = (message, caseDir) => {
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
    }
  }

  return { event, replies, forwardReplies }
}

const summarizeZhihu = (detail) => ({
  type: detail.type,
  title: detail.type === 'article' ? detail.article.title : detail.question.title,
  author: detail.type === 'article' ? detail.article.author.name : detail.answer.author.name,
  imageCount: detail.richContent.images.length,
  videoCount: detail.richContent.videos.length,
  textLength: detail.richContent.text.length
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

const main = async () => {
  ensureDir(OUTPUT_ROOT)
  ensureDir(RUNTIME_ROOT)
  ensureTempNodeModules()
  ensureRuntimeNodeModules()
  ensureSourceAliasPackages()
  fs.writeFileSync(LOG_PATH, '')
  process.chdir(RUNTIME_ROOT)

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

  const tools = await import(path.join(REPO_CORE, 'src/apps/tools.ts'))
  const linkExtractors = await import(path.join(REPO_CORE, 'src/apps/linkExtractors.ts'))
  const { Config } = await import(path.join(REPO_CORE, 'src/module/utils/Config.ts'))
  const { guestCookieManager } = await import(path.join(REPO_CORE, 'src/module/utils/GuestCookieManager.ts'))
  const zhihuGetId = await import(path.join(REPO_CORE, 'src/platform/zhihu/getID.ts'))
  const zhihuApi = await import(path.join(REPO_CORE, 'src/platform/zhihu/api.ts'))
  const tiebaGetId = await import(path.join(REPO_CORE, 'src/platform/tieba/getID.ts'))
  const tiebaApi = await import(path.join(REPO_CORE, 'src/platform/tieba/api.ts'))
  const heyboxGetId = await import(path.join(REPO_CORE, 'src/platform/heybox/getID.ts'))
  const heyboxApi = await import(path.join(REPO_CORE, 'src/platform/heybox/api.ts'))
  const weiboGetId = await import(path.join(REPO_CORE, 'src/platform/weibo/getID.ts'))
  const weiboApi = await import(path.join(REPO_CORE, 'src/platform/weibo/api.ts'))

  Config.app.parseTip = false
  Config.app.multiPageRender = true
  Config.app.multiPageTriggerAspectRatio = 3.5
  Config.app.multiPageMaxAspectRatio = 2.2
  Config.app.renderImageFormat = 'jpeg'
  Config.app.renderImageQuality = 95
  Config.zhihu.renderCard = { enable: true, includeImages: true }
  Config.tieba.renderCard = { enable: true, includeImages: true }
  Config.heybox.renderCard = { enable: true, includeImages: true }
  Config.weibo.renderCard = { enable: true, includeImages: true }
  Config.zhihu.sendContent = ['info', 'image']
  Config.tieba.sendContent = ['info', 'image']
  Config.heybox.sendContent = ['info', 'image', 'comment']
  Config.weibo.sendContent = ['info', 'image']

  const envSummary = {
    cwd: process.cwd(),
    rendererBoot,
    browserExecutablePath: RENDER_BROWSER_EXECUTABLE,
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
    zhihu: {
      extractor: linkExtractors.extractZhihuMessageUrl,
      app: tools.zhihuAPP,
      getId: (url) => zhihuGetId.getZhihuID(url, true),
      ensureCookie: async () => await guestCookieManager.ensureFreshCookie('zhihu', { waitForStale: true }),
      fetchDetail: zhihuApi.fetchZhihuDetail,
      summarizeDetail: summarizeZhihu
    },
    tieba: {
      extractor: linkExtractors.extractTiebaMessageUrl,
      app: tools.tiebaAPP,
      getId: (url) => tiebaGetId.getTiebaID(url, true),
      fetchDetail: async (id) => await tiebaApi.getTiebaPostDetail(id.tid, id.pid),
      summarizeDetail: (detail) => summarizeTieba(detail, tiebaApi.getTiebaContentText)
    },
    heybox: {
      extractor: linkExtractors.extractHeyBoxMessageUrl,
      app: tools.heyboxAPP,
      getId: (url) => heyboxGetId.getHeyboxID(url, true),
      ensureCookie: async () => await guestCookieManager.ensureFreshCookie('heybox', { waitForStale: true }),
      fetchDetail: async (id) => await heyboxApi.fetchHeyboxDetail({
        linkId: id.link_id,
        cookie: Config.cookies.heybox
      }),
      summarizeDetail: summarizeHeybox
    },
    weibo: {
      extractor: linkExtractors.extractWeiboMessageUrl,
      app: tools.weiboAPP,
      getId: (url) => weiboGetId.getWeiboID(url, true),
      ensureCookie: async () => await guestCookieManager.ensureFreshCookie('weibo', { waitForStale: true }),
      fetchDetail: weiboApi.fetchWeiboDetail,
      summarizeDetail: summarizeWeibo
    }
  }

  const results = []

  for (const item of CASES) {
    const caseDir = path.join(OUTPUT_ROOT, item.id)
    ensureDir(path.join(caseDir, 'images'))
    const platformRuntime = runtimeCases[item.platform]

    const result = {
      platform: item.platform,
      url: item.url,
      extractor: { ok: false },
      id: { ok: false },
      cookie: null,
      fetch: { ok: false },
      command: { ok: false },
      replies: [],
      forwardReplies: [],
      renderHtml: [],
      notes: []
    }

    logLine(`[${item.platform}] start`)

    let idValue
    try {
      const extracted = platformRuntime.extractor(item.url)
      result.extractor = { ok: true, value: extracted }
      writeJson(path.join(caseDir, 'extractor.json'), extracted)
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
    }

    try {
      idValue = await platformRuntime.getId(item.url)
      result.id = { ok: true, value: idValue }
      writeJson(path.join(caseDir, 'id.json'), idValue)
    } catch (error) {
      result.id = { ok: false, error: normalizeError(error) }
    }

    if (result.id.ok) {
      try {
        const detail = await platformRuntime.fetchDetail(idValue)
        const summary = platformRuntime.summarizeDetail(detail)
        result.fetch = { ok: true, value: summary }
        writeJson(path.join(caseDir, 'detail-summary.json'), summary)
      } catch (error) {
        result.fetch = { ok: false, error: normalizeError(error) }
      }
    }

    const beforeHtml = listHtmlArtifacts()
    const { event, replies, forwardReplies } = makeEvent(item.url, caseDir)

    try {
      await platformRuntime.app.fnc(event)
      result.command = { ok: true, value: 'resolved' }
    } catch (error) {
      result.command = { ok: false, error: normalizeError(error) }
    }

    const afterHtml = listHtmlArtifacts()
    result.renderHtml = diffHtmlArtifacts(beforeHtml, afterHtml)
    result.replies = replies
    result.forwardReplies = forwardReplies

    const renderedBase64Images = result.replies.filter(reply => reply.kind === 'image' && reply.source === 'base64')
    const externalImages = result.replies.filter(reply => reply.kind === 'image' && reply.source === 'external')
    result.notes.push(`rendered_base64_images=${renderedBase64Images.length}`)
    result.notes.push(`external_images=${externalImages.length}`)
    result.notes.push(`render_html=${result.renderHtml.length}`)

    writeJson(path.join(caseDir, 'command-result.json'), {
      command: result.command,
      replies: result.replies,
      forwardReplies: result.forwardReplies,
      renderHtml: result.renderHtml
    })

    logLine(`[${item.platform}] done command_ok=${result.command.ok} rendered_images=${renderedBase64Images.length} external_images=${externalImages.length}`)
    results.push(result)
  }

  writeJson(REPORT_PATH, {
    runId: RUN_ID,
    outputRoot: OUTPUT_ROOT,
    htmlRoot: HTML_ROOT,
    results
  })

  logLine(`[done] output=${OUTPUT_ROOT}`)
}

await main().catch((error) => {
  const payload = normalizeError(error)
  ensureDir(OUTPUT_ROOT)
  fs.writeFileSync(path.join(OUTPUT_ROOT, 'fatal-error.json'), JSON.stringify(payload, null, 2))
  console.error(error)
  process.exitCode = 1
})
