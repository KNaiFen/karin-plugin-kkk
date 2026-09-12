import pathModule from 'node:path'
import { pathToFileURL } from 'node:url'

import type {
  DataTypeMap,
  DynamicRenderPath,
  ExtractDataTypeFromPath,
  TypedRenderRequest
} from '@kkk/template-contracts'
import jpeg from 'jpeg-js'
import type { ElementTypes, ImageElement, Message } from 'node-karin'
import { common, db, karinPathHtml, logger, render, segment } from 'node-karin'
import { PNG } from 'pngjs'
import reactServerRender from 'template/server'

import { Common, Root } from '@/module'
import { getBrowserLaunchOptions } from '@/module/utils/BrowserRuntime'
import { Config } from '@/module/utils/Config'

import {
  recordLongTaskCompletionAnchor,
  replyAndRecordLongTaskCompletionAnchor
} from '../LongTaskCompletionNotify'
import { isSemverGreater } from '../semver'
import { createPosterPalettePlugin, createQrCodePlugin } from './plugins'
import { embedWatermark } from './wm'

type ImageMetadata = {
  width?: number
  height?: number
}

type RenderImageType = 'png' | 'jpeg'

type RenderImageOptions = {
  type: RenderImageType
  quality?: number
  omitBackground: boolean
}

type RenderNavigationOptions = {
  waitUntil: 'load' | 'domcontentloaded'
  timeout: number
}

type ImageBufferFormat = RenderImageType | 'unknown'

type DecodedImageBuffer = {
  width: number
  height: number
  data: Buffer
  format: RenderImageType
}

type ImageSlice = {
  buffer: Buffer
  format: RenderImageType
}

type RgbaColor = [number, number, number, number]

type VectorPoint = [number, number]

type VectorGlyphDefinition = {
  width: number
  strokes: VectorPoint[][]
}

type PaginationOptions = {
  enabled: boolean
  triggerAspectRatio: number
  maxAspectRatio: number
}

type DomPaginationBlock = {
  top: number
  bottom: number
  avoidSplit: boolean
  explicit: boolean
}

type DomPaginationSnapshot = {
  x: number
  y: number
  width: number
  height: number
  blocks: DomPaginationBlock[]
}

type PageSegment = {
  top: number
  height: number
}

type DomPaginationPage = {
  waitForSelector: (selector: string, options?: { timeout?: number }) => Promise<unknown>
  evaluate: (pageFunction: string) => Promise<unknown>
}

type ReplyRenderedImagesOptions = {
  forwardThreshold?: number
  source?: string
  summary?: string
  prompt?: string
  news?: Array<{ text: string }>
}

type ForwardIdentity = {
  id: string | number
  name: string
}

type SendRenderedImagesDirect<T = unknown> = (images: ElementTypes[]) => Promise<T>

const jpegRenderTemplateTypes = new Set(['bilibili', 'douyin', 'xiaohongshu'])
const jpegRenderPaths = new Set(['other/external-post'])
const DEFAULT_PAGE_TRIGGER_ASPECT_RATIO = 3
const DEFAULT_PAGE_MAX_ASPECT_RATIO = 2.2
const DEFAULT_JPEG_QUALITY = 95
const DOM_PAGINATION_VIEWPORT_WIDTH = 3200
const DOM_PAGINATION_VIEWPORT_HEIGHT = 2200
const DOM_PAGINATION_ASSET_WAIT_MS = 6_000

const DOM_PAGINATION_SNAPSHOT_SCRIPT = `(() => {
  const container = document.querySelector('#container');
  if (!container) return null;

  const containerRect = container.getBoundingClientRect();
  if (!containerRect.width || !containerRect.height) return null;

  const atomicTags = new Set(['img', 'figure', 'video', 'canvas', 'svg', 'pre', 'table', 'blockquote']);
  const textTags = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li']);
  const semanticTags = new Set(['section', 'article']);
  const blocks = [];
  const elements = Array.from(container.querySelectorAll('*'));

  for (const element of elements) {
    const style = window.getComputedStyle(element);
    if (
      style.display === 'none' ||
      style.display === 'inline' ||
      style.display === 'contents' ||
      style.visibility === 'hidden'
    ) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    if (rect.height < 8 || rect.width < containerRect.width * 0.35) continue;

    const tag = element.tagName.toLowerCase();
    const explicit = element.hasAttribute('data-page-block') || element.hasAttribute('data-page-avoid-split');
    const avoidSplit = element.hasAttribute('data-page-avoid-split') || atomicTags.has(tag);
    const blockLike = atomicTags.has(tag) || textTags.has(tag) || semanticTags.has(tag);

    if (!explicit && !blockLike && element.childElementCount > 0) {
      const hasLargeChild = Array.from(element.children).some(child => {
        const childRect = child.getBoundingClientRect();
        return childRect.height >= rect.height * 0.65 && childRect.width >= rect.width * 0.65;
      });
      if (hasLargeChild) continue;
    }

    if (!explicit && !blockLike && element.childElementCount === 0 && rect.height < 18) continue;

    blocks.push({
      top: rect.top - containerRect.top,
      bottom: rect.bottom - containerRect.top,
      avoidSplit,
      explicit
    });
  }

  return {
    x: containerRect.left,
    y: containerRect.top,
    width: containerRect.width,
    height: containerRect.height,
    blocks
  };
})()`

type SnapkaBrowser = Awaited<ReturnType<typeof import('@snapka/puppeteer')['snapka']['launch']>>

let sharedDomPaginationBrowserPromise: Promise<SnapkaBrowser> | null = null

const clampNumber = (
  value: number,
  fallback: number,
  min: number,
  max: number
): number => {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

const getConfiguredPaginationOptions = (): PaginationOptions => {
  const triggerAspectRatio = clampNumber(
    Number(Config.app.multiPageTriggerAspectRatio),
    DEFAULT_PAGE_TRIGGER_ASPECT_RATIO,
    1.2,
    10
  )
  const maxAspectRatio = clampNumber(
    Number(Config.app.multiPageMaxAspectRatio),
    DEFAULT_PAGE_MAX_ASPECT_RATIO,
    1.1,
    triggerAspectRatio
  )

  return {
    enabled: Config.app.multiPageRender !== false,
    triggerAspectRatio,
    maxAspectRatio
  }
}

const getConfiguredJpegQuality = (): number => {
  return clampNumber(
    Number(Config.app.renderImageQuality),
    DEFAULT_JPEG_QUALITY,
    1,
    100
  )
}

const getConfiguredRenderImageFormat = (): 'auto' | RenderImageType => {
  const format = Config.app.renderImageFormat
  if (format === 'png' || format === 'jpeg') return format
  return 'auto'
}

const shouldUseDomAwarePagination = (): boolean => {
  return process.env.VITEST !== 'true'
}

const getDomPaginationBrowser = async (protocolTimeout: number): Promise<SnapkaBrowser> => {
  if (!sharedDomPaginationBrowserPromise) {
    sharedDomPaginationBrowserPromise = import('@snapka/puppeteer')
      .then(({ snapka }) => snapka.launch(getBrowserLaunchOptions(protocolTimeout)))
      .catch(error => {
        sharedDomPaginationBrowserPromise = null
        throw error
      })
  }

  return await sharedDomPaginationBrowserPromise
}

export const getRenderImageOptions = (path: DynamicRenderPath | string): RenderImageOptions => {
  const templateType = path.split('/')[0]
  const defaultOptions: RenderImageOptions = (jpegRenderTemplateTypes.has(templateType) || jpegRenderPaths.has(path))
    ? {
      type: 'jpeg',
      quality: getConfiguredJpegQuality(),
      omitBackground: false
    }
    : {
      type: 'png',
      omitBackground: true
    }

  const configuredFormat = getConfiguredRenderImageFormat()
  if (configuredFormat === 'auto') {
    return defaultOptions
  }

  if (configuredFormat === 'jpeg') {
    return {
      ...defaultOptions,
      type: 'jpeg',
      quality: getConfiguredJpegQuality()
    }
  }

  const { quality: _quality, ...pngOptions } = defaultOptions
  return {
    ...pngOptions,
    type: 'png'
  }
}

export const getRenderNavigationOptions = (path: DynamicRenderPath | string): RenderNavigationOptions => {
  if (path === 'other/external-post') {
    return {
      waitUntil: 'domcontentloaded',
      timeout: Config.app.RenderWaitTime * 1000
    }
  }

  return {
    waitUntil: 'load',
    timeout: Config.app.RenderWaitTime * 1000
  }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

const detectImageBufferFormat = (buffer: Buffer): ImageBufferFormat => {
  if (buffer.length >= PNG_SIGNATURE.length && buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return 'png'
  }

  if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'jpeg'
  }

  return 'unknown'
}

const convertPngBufferToJpeg = (buffer: Buffer, quality: number = 95): Buffer => {
  const png = PNG.sync.read(buffer)
  const rgba = Buffer.from(png.data)

  for (let i = 0; i < rgba.length; i += 4) {
    const alpha = rgba[i + 3] / 255
    rgba[i] = Math.round((rgba[i] * alpha) + (255 * (1 - alpha)))
    rgba[i + 1] = Math.round((rgba[i + 1] * alpha) + (255 * (1 - alpha)))
    rgba[i + 2] = Math.round((rgba[i + 2] * alpha) + (255 * (1 - alpha)))
    rgba[i + 3] = 255
  }

  return Buffer.from(jpeg.encode({
    data: rgba,
    width: png.width,
    height: png.height
  }, quality).data)
}

const normalizeRenderedImageBuffer = (
  buffer: Buffer,
  options: RenderImageOptions,
  renderPath: string
): { buffer: Buffer, format: ImageBufferFormat } => {
  const format = detectImageBufferFormat(buffer)

  if (options.type !== 'jpeg' || format === 'jpeg') {
    return { buffer, format }
  }

  if (format === 'png') {
    try {
      const normalized = convertPngBufferToJpeg(buffer, options.quality ?? 95)
      return { buffer: normalized, format: 'jpeg' }
    } catch (error) {
      logger.warn(`[Render] ${renderPath} PNG -> JPEG 转换失败，保留原始 PNG`, error)
      return { buffer, format }
    }
  }

  logger.warn(`[Render] ${renderPath} 预期 JPEG 输出，但收到未知图片格式，保留原始数据`)
  return { buffer, format }
}

const applyWatermarkAndNormalizeImageBuffer = (
  buffer: Buffer,
  options: RenderImageOptions,
  renderPath: string,
  watermarkText: string
): { buffer: Buffer, format: ImageBufferFormat } => {
  const watermarked = embedWatermark(buffer, watermarkText) ?? buffer
  return normalizeRenderedImageBuffer(watermarked, options, renderPath)
}

const getRenderedImageExt = (format: ImageBufferFormat): 'jpg' | 'png' => {
  return format === 'jpeg' ? 'jpg' : 'png'
}

const getRenderedImageName = (
  path: string,
  index: number,
  format: ImageBufferFormat
): string => {
  const safePath = path.replace(/[^\w-]+/g, '_')
  return `${safePath}_${Date.now()}_${index + 1}.${getRenderedImageExt(format)}`
}

const decodeImageBuffer = (buffer: Buffer, format: RenderImageType): DecodedImageBuffer | null => {
  try {
    if (format === 'png') {
      const png = PNG.sync.read(buffer)
      return {
        width: png.width,
        height: png.height,
        data: Buffer.from(png.data),
        format
      }
    }

    const decoded = jpeg.decode(buffer, { useTArray: true })
    return {
      width: decoded.width,
      height: decoded.height,
      data: Buffer.from(decoded.data),
      format
    }
  } catch (error) {
    logger.warn(`[Render] 图片解码失败，无法执行安全分页: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

const encodeImageBuffer = (
  decoded: DecodedImageBuffer,
  quality: number | undefined
): Buffer => {
  if (decoded.format === 'png') {
    const png = new PNG({ width: decoded.width, height: decoded.height })
    decoded.data.copy(png.data)
    return PNG.sync.write(png)
  }

  return Buffer.from(jpeg.encode({
    data: decoded.data,
    width: decoded.width,
    height: decoded.height
  }, quality ?? 95).data)
}

const cropDecodedImage = (
  decoded: DecodedImageBuffer,
  startY: number,
  endY: number
): DecodedImageBuffer => {
  const safeStart = Math.max(0, Math.min(startY, decoded.height))
  const safeEnd = Math.max(safeStart + 1, Math.min(endY, decoded.height))
  const height = safeEnd - safeStart
  const rowBytes = decoded.width * 4
  const data = Buffer.alloc(rowBytes * height)

  for (let y = 0; y < height; y++) {
    const sourceStart = ((safeStart + y) * decoded.width) * 4
    decoded.data.copy(data, y * rowBytes, sourceStart, sourceStart + rowBytes)
  }

  return {
    width: decoded.width,
    height,
    data,
    format: decoded.format
  }
}

const annotateImageSlicePageBadge = (
  slice: ImageSlice,
  quality: number | undefined,
  pageIndex: number,
  pageCount: number
): ImageSlice => {
  const decoded = decodeImageBuffer(slice.buffer, slice.format)
  if (!decoded) return slice

  annotatePageBadge(decoded, pageIndex, pageCount)
  return {
    buffer: encodeImageBuffer(decoded, quality),
    format: slice.format
  }
}

const PAGE_BADGE_GLYPHS: Record<string, VectorGlyphDefinition> = {
  '0': {
    width: 92,
    strokes: [[
      [46, 10], [66, 14], [81, 30], [87, 52], [87, 88], [81, 110], [66, 126], [46, 130],
      [26, 126], [11, 110], [5, 88], [5, 52], [11, 30], [26, 14], [46, 10]
    ]]
  },
  '1': {
    width: 70,
    strokes: [
      [[22, 36], [40, 12], [40, 130]],
      [[18, 130], [60, 130]]
    ]
  },
  '2': {
    width: 92,
    strokes: [[
      [12, 30], [30, 12], [60, 10], [80, 24], [82, 48], [68, 68], [22, 110], [12, 130], [82, 130]
    ]]
  },
  '3': {
    width: 92,
    strokes: [
      [[14, 24], [34, 10], [62, 10], [80, 24], [68, 54], [46, 70]],
      [[46, 70], [70, 86], [82, 108], [68, 126], [40, 130], [16, 118]]
    ]
  },
  '4': {
    width: 92,
    strokes: [
      [[72, 10], [72, 130]],
      [[12, 88], [80, 88]],
      [[12, 88], [58, 10]]
    ]
  },
  '5': {
    width: 92,
    strokes: [[
      [78, 10], [22, 10], [18, 62], [58, 62], [80, 80], [78, 112], [58, 130], [26, 126], [12, 112]
    ]]
  },
  '6': {
    width: 92,
    strokes: [[
      [74, 16], [54, 10], [26, 22], [10, 56], [12, 100], [28, 124], [56, 130], [78, 114], [72, 84],
      [54, 68], [22, 72]
    ]]
  },
  '7': {
    width: 92,
    strokes: [[
      [10, 12], [82, 12], [38, 130]
    ]]
  },
  '8': {
    width: 92,
    strokes: [
      [[46, 10], [66, 14], [80, 30], [80, 48], [66, 62], [46, 66], [26, 62], [12, 48], [12, 30], [26, 14], [46, 10]],
      [[46, 74], [68, 78], [82, 94], [82, 112], [68, 126], [46, 130], [24, 126], [10, 112], [10, 94], [24, 78], [46, 74]]
    ]
  },
  '9': {
    width: 92,
    strokes: [[
      [18, 120], [38, 130], [66, 126], [82, 92], [80, 48], [64, 16], [38, 10], [18, 24], [18, 54], [36, 70], [68, 66]
    ]]
  },
  '/': {
    width: 58,
    strokes: [[
      [12, 130], [46, 10]
    ]]
  }
}

const PAGE_BADGE_FONT_HEIGHT = 140

const blendPixel = (
  decoded: DecodedImageBuffer,
  x: number,
  y: number,
  color: RgbaColor
): void => {
  if (x < 0 || y < 0 || x >= decoded.width || y >= decoded.height) return

  const idx = ((y * decoded.width) + x) * 4
  const sourceAlpha = color[3] / 255
  if (sourceAlpha <= 0) return

  const destAlpha = decoded.data[idx + 3] / 255
  const outAlpha = sourceAlpha + (destAlpha * (1 - sourceAlpha))
  if (outAlpha <= 0) return

  const blendChannel = (source: number, dest: number): number => {
    return Math.round(((source * sourceAlpha) + (dest * destAlpha * (1 - sourceAlpha))) / outAlpha)
  }

  decoded.data[idx] = blendChannel(color[0], decoded.data[idx])
  decoded.data[idx + 1] = blendChannel(color[1], decoded.data[idx + 1])
  decoded.data[idx + 2] = blendChannel(color[2], decoded.data[idx + 2])
  decoded.data[idx + 3] = Math.round(outAlpha * 255)
}

const drawFilledCircle = (
  decoded: DecodedImageBuffer,
  centerX: number,
  centerY: number,
  radius: number,
  color: RgbaColor
): void => {
  if (radius <= 0) return

  const minX = Math.max(0, Math.floor(centerX - radius))
  const maxX = Math.min(decoded.width - 1, Math.ceil(centerX + radius))
  const minY = Math.max(0, Math.floor(centerY - radius))
  const maxY = Math.min(decoded.height - 1, Math.ceil(centerY + radius))
  const radiusSquared = radius * radius

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = (x + 0.5) - centerX
      const dy = (y + 0.5) - centerY
      if ((dx * dx) + (dy * dy) > radiusSquared) continue
      blendPixel(decoded, x, y, color)
    }
  }
}

const drawThickLine = (
  decoded: DecodedImageBuffer,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  thickness: number,
  color: RgbaColor
): void => {
  const dx = endX - startX
  const dy = endY - startY
  const distance = Math.hypot(dx, dy)
  const steps = Math.max(1, Math.ceil(distance * 1.5))
  const radius = Math.max(0.75, thickness / 2)

  for (let step = 0; step <= steps; step++) {
    const progress = step / steps
    drawFilledCircle(
      decoded,
      startX + (dx * progress),
      startY + (dy * progress),
      radius,
      color
    )
  }
}

const drawRoundedRect = (
  decoded: DecodedImageBuffer,
  left: number,
  top: number,
  width: number,
  height: number,
  radius: number,
  color: RgbaColor
): void => {
  const safeRadius = Math.max(0, Math.min(radius, Math.floor(Math.min(width, height) / 2)))

  for (let y = top; y < top + height; y++) {
    for (let x = left; x < left + width; x++) {
      let dx = 0
      let dy = 0

      if (x < left + safeRadius) dx = (left + safeRadius) - x
      else if (x >= left + width - safeRadius) dx = x - (left + width - safeRadius - 1)

      if (y < top + safeRadius) dy = (top + safeRadius) - y
      else if (y >= top + height - safeRadius) dy = y - (top + height - safeRadius - 1)

      if ((dx * dx) + (dy * dy) > safeRadius * safeRadius) continue
      blendPixel(decoded, x, y, color)
    }
  }
}

const drawGlyph = (
  decoded: DecodedImageBuffer,
  left: number,
  top: number,
  char: string,
  fontSize: number,
  color: RgbaColor
): number => {
  const glyph = PAGE_BADGE_GLYPHS[char]
  if (!glyph) return 0

  const scale = fontSize / PAGE_BADGE_FONT_HEIGHT
  const thickness = Math.max(1, fontSize * 0.12)

  for (const stroke of glyph.strokes) {
    for (let index = 0; index < stroke.length - 1; index++) {
      const [startX, startY] = stroke[index]
      const [endX, endY] = stroke[index + 1]
      drawThickLine(
        decoded,
        left + (startX * scale),
        top + (startY * scale),
        left + (endX * scale),
        top + (endY * scale),
        thickness,
        color
      )
    }
  }

  return glyph.width * scale
}

const annotatePageBadge = (
  decoded: DecodedImageBuffer,
  pageIndex: number,
  pageCount: number
): void => {
  if (pageCount <= 1) return

  const label = `${pageIndex}/${pageCount}`
  const fontSize = Math.max(10, Math.min(24, Math.round(decoded.width * 0.019)))
  const gap = Math.max(3, Math.round(fontSize * 0.28))
  const paddingX = Math.max(7, Math.round(fontSize * 0.82))
  const paddingY = Math.max(5, Math.round(fontSize * 0.56))
  const margin = Math.max(7, Math.round(fontSize * 0.74))
  const textWidth = label.split('').reduce((total, char, index) => {
    const glyphWidth = ((PAGE_BADGE_GLYPHS[char]?.width ?? 0) * fontSize) / PAGE_BADGE_FONT_HEIGHT
    return total + glyphWidth + (index === label.length - 1 ? 0 : gap)
  }, 0)
  const textHeight = fontSize
  const badgeWidth = Math.ceil(textWidth + (paddingX * 2))
  const badgeHeight = Math.ceil(textHeight + (paddingY * 2))
  const left = Math.max(0, Math.floor(decoded.width - badgeWidth - margin))
  const top = Math.max(0, Math.floor(decoded.height - badgeHeight - margin))
  const radius = Math.max(6, Math.round(fontSize * 0.96))
  const shadowOffsetY = Math.max(1, Math.round(fontSize * 0.16))
  const shadowExpand = Math.max(1, Math.round(fontSize * 0.16))

  drawRoundedRect(
    decoded,
    left - shadowExpand,
    top - shadowExpand + shadowOffsetY,
    badgeWidth + (shadowExpand * 2),
    badgeHeight + (shadowExpand * 2),
    radius + shadowExpand,
    [0, 0, 0, 72]
  )
  drawRoundedRect(decoded, left, top, badgeWidth, badgeHeight, radius, [12, 18, 28, 188])

  let cursorX = left + paddingX
  const textTop = top + paddingY
  for (const char of label) {
    const glyphWidth = drawGlyph(decoded, Math.round(cursorX), Math.round(textTop), char, fontSize, [255, 255, 255, 228])
    cursorX = Math.round(cursorX + glyphWidth + gap)
  }
}

const getRowInkScores = (decoded: DecodedImageBuffer): number[] => {
  const scores = new Array<number>(decoded.height).fill(0)

  for (let y = 0; y < decoded.height; y++) {
    let score = 0
    for (let x = 0; x < decoded.width; x++) {
      const idx = ((y * decoded.width) + x) * 4
      const r = decoded.data[idx]
      const g = decoded.data[idx + 1]
      const b = decoded.data[idx + 2]
      const alpha = decoded.data[idx + 3]

      if (alpha <= 24) continue
      if (r >= 245 && g >= 245 && b >= 245) continue

      score += 1
    }
    scores[y] = score
  }

  return scores
}

type PageBreakCandidate = {
  boundary: number
  score: number
  distance: number
}

type SparseBandCandidate = {
  start: number
  end: number
  boundary: number
  distance: number
}

const getBoundaryScore = (rowScores: number[], boundary: number, radius: number = 3): number => {
  let score = 0
  let count = 0

  for (let offset = -radius; offset <= radius; offset++) {
    const row = boundary + offset
    if (row < 0 || row >= rowScores.length) continue
    score += rowScores[row]
    count += 1
  }

  return count > 0 ? score / count : rowScores[boundary] ?? 0
}

const getBestPageBreakCandidate = (
  rowScores: number[],
  searchStart: number,
  searchEnd: number,
  targetEndY: number
): PageBreakCandidate | null => {
  if (searchStart > searchEnd) return null

  let bestCandidate: PageBreakCandidate | null = null

  for (let boundary = searchStart; boundary <= searchEnd; boundary++) {
    const score = getBoundaryScore(rowScores, boundary)
    const distance = Math.abs(targetEndY - boundary)

    if (
      !bestCandidate ||
      score < bestCandidate.score ||
      (score === bestCandidate.score && distance < bestCandidate.distance) ||
      (score === bestCandidate.score && distance === bestCandidate.distance && boundary > bestCandidate.boundary)
    ) {
      bestCandidate = {
        boundary,
        score,
        distance
      }
    }
  }

  return bestCandidate
}

const findSparseBandCandidate = (
  rowScores: number[],
  searchStart: number,
  searchEnd: number,
  targetEndY: number,
  width: number
): SparseBandCandidate | null => {
  if (searchStart > searchEnd) return null

  const sparseThreshold = Math.max(6, Math.floor(width * 0.03))
  const minBandHeight = Math.max(6, Math.floor(width * 0.012))
  let bandStart = -1
  let bestCandidate: SparseBandCandidate | null = null

  const finalizeBand = (start: number, end: number) => {
    const height = end - start + 1
    if (height < minBandHeight) return

    const boundary = Math.min(end, Math.max(start, targetEndY))
    const distance = Math.abs(targetEndY - boundary)

    if (
      !bestCandidate ||
      distance < bestCandidate.distance ||
      (distance === bestCandidate.distance && height > (bestCandidate.end - bestCandidate.start + 1))
    ) {
      bestCandidate = {
        start,
        end,
        boundary,
        distance
      }
    }
  }

  for (let boundary = searchStart; boundary <= searchEnd; boundary++) {
    const score = getBoundaryScore(rowScores, boundary)
    if (score <= sparseThreshold) {
      if (bandStart === -1) bandStart = boundary
      continue
    }

    if (bandStart !== -1) {
      finalizeBand(bandStart, boundary - 1)
      bandStart = -1
    }
  }

  if (bandStart !== -1) {
    finalizeBand(bandStart, searchEnd)
  }

  return bestCandidate
}

const findSafePageBreak = (
  rowScores: number[],
  startY: number,
  targetEndY: number,
  width: number
): number => {
  const minPageHeight = Math.max(80, Math.floor(width * 1.2))
  const minBoundary = Math.max(startY + 1, Math.min(targetEndY - 1, startY + minPageHeight))
  const preferredBackward = Math.max(24, Math.min(360, Math.floor(width * 0.36)))
  const preferredStart = Math.max(minBoundary, targetEndY - preferredBackward)
  const preferredEnd = Math.max(preferredStart, Math.min(rowScores.length - 1, targetEndY - 1))

  const sparseBandCandidate = findSparseBandCandidate(rowScores, preferredStart, preferredEnd, targetEndY, width)
  if (sparseBandCandidate) {
    return Math.max(startY + 1, Math.min(sparseBandCandidate.boundary, preferredEnd))
  }

  const preferredFallbackCandidate = getBestPageBreakCandidate(
    rowScores,
    preferredStart,
    preferredEnd,
    targetEndY
  )

  const bestBoundary = preferredFallbackCandidate?.boundary ?? targetEndY
  return Math.max(startY + 1, Math.min(bestBoundary, preferredEnd))
}

const paginateRenderedImageBuffer = (
  buffer: Buffer,
  format: RenderImageType,
  options: RenderImageOptions,
  paginationOptions: PaginationOptions
): ImageSlice[] => {
  if (!paginationOptions.enabled) {
    return [{ buffer, format }]
  }

  const decoded = decodeImageBuffer(buffer, format)
  if (!decoded || decoded.width <= 0 || decoded.height <= 0) {
    return [{ buffer, format }]
  }

  if ((decoded.height / decoded.width) <= paginationOptions.triggerAspectRatio) {
    return [{ buffer, format }]
  }

  const maxPageHeight = Math.max(1, Math.floor(decoded.width * paginationOptions.maxAspectRatio))
  if (decoded.height <= maxPageHeight) {
    return [{ buffer, format }]
  }

  const rowScores = getRowInkScores(decoded)
  const pages: DecodedImageBuffer[] = []
  let startY = 0

  while (startY < decoded.height) {
    const remaining = decoded.height - startY
    if (remaining <= maxPageHeight) {
      pages.push(cropDecodedImage(decoded, startY, decoded.height))
      break
    }

    const targetEndY = Math.min(decoded.height, startY + maxPageHeight)
    const pageEndY = findSafePageBreak(rowScores, startY, targetEndY, decoded.width)
    pages.push(cropDecodedImage(decoded, startY, pageEndY))

    startY = pageEndY
  }

  if (pages.length > 1) {
    pages.forEach((page, index) => annotatePageBadge(page, index + 1, pages.length))
  }

  logger.debug(`[Render] 安全分页完成: ${decoded.width}x${decoded.height} -> ${pages.length} 页`)
  return pages.map(page => ({
    buffer: encodeImageBuffer(page, options.quality),
    format
  }))
}

const normalizeDomPaginationBlocks = (
  blocks: DomPaginationBlock[],
  height: number
): DomPaginationBlock[] => {
  const normalized = blocks
    .map(block => ({
      top: Math.max(0, Math.min(height, Math.round(block.top))),
      bottom: Math.max(0, Math.min(height, Math.round(block.bottom))),
      avoidSplit: Boolean(block.avoidSplit),
      explicit: Boolean(block.explicit)
    }))
    .filter(block => block.bottom - block.top >= 6)
    .sort((left, right) => {
      if (left.top !== right.top) return left.top - right.top
      if (left.bottom !== right.bottom) return left.bottom - right.bottom
      if (left.avoidSplit !== right.avoidSplit) return Number(right.avoidSplit) - Number(left.avoidSplit)
      return Number(right.explicit) - Number(left.explicit)
    })

  const deduped: DomPaginationBlock[] = []

  for (const block of normalized) {
    const previous = deduped[deduped.length - 1]
    if (
      previous &&
      previous.top === block.top &&
      previous.bottom === block.bottom
    ) {
      previous.avoidSplit = previous.avoidSplit || block.avoidSplit
      previous.explicit = previous.explicit || block.explicit
      continue
    }
    deduped.push(block)
  }

  return deduped
}

const collectPageBreakCandidates = (
  blocks: DomPaginationBlock[],
  startY: number,
  width: number,
  height: number
): number[] => {
  const gapThreshold = Math.max(10, Math.round(width * 0.012))
  const candidates = new Set<number>()
  let previousBottom = startY

  for (const block of blocks) {
    if (block.bottom <= startY + 1) continue

    if (block.top > startY + 1) {
      candidates.add(block.top)
    }

    candidates.add(block.bottom)

    const gap = block.top - previousBottom
    if (gap >= gapThreshold) {
      candidates.add(Math.round(previousBottom + (gap / 2)))
    }

    previousBottom = Math.max(previousBottom, block.bottom)
  }

  if (height - previousBottom >= gapThreshold) {
    candidates.add(Math.round(previousBottom + ((height - previousBottom) / 2)))
  }

  return Array.from(candidates)
    .map(value => Math.max(startY + 1, Math.min(height, value)))
    .filter(value => value > startY + 1 && value < height)
    .filter(value => !blocks.some(block => block.avoidSplit && block.top < value && value < block.bottom))
    .sort((left, right) => left - right)
}

const chooseDomAwarePageEnd = (
  snapshot: DomPaginationSnapshot,
  blocks: DomPaginationBlock[],
  startY: number,
  paginationOptions: PaginationOptions
): number => {
  const targetEndY = Math.min(snapshot.height, startY + Math.max(1, Math.floor(snapshot.width * paginationOptions.maxAspectRatio)))
  const minPageHeight = Math.max(80, Math.floor(snapshot.width * 1.2))
  const minBoundary = Math.max(startY + 1, Math.min(snapshot.height, startY + minPageHeight))
  const overflowAllowance = Math.max(40, Math.floor(snapshot.width * 0.36))
  const maxOverflowBoundary = Math.min(snapshot.height, targetEndY + overflowAllowance)
  const candidates = collectPageBreakCandidates(blocks, startY, snapshot.width, snapshot.height)

  const beforeTarget = candidates.filter(candidate => candidate >= minBoundary && candidate <= targetEndY)
  if (beforeTarget.length > 0) {
    return beforeTarget[beforeTarget.length - 1]
  }

  const afterTarget = candidates.find(candidate => candidate > targetEndY && candidate <= maxOverflowBoundary)
  if (afterTarget) {
    return afterTarget
  }

  return Math.max(startY + 1, Math.min(snapshot.height, targetEndY))
}

export const planDomPaginationPages = (
  snapshot: DomPaginationSnapshot,
  paginationOptions: PaginationOptions
): PageSegment[] => {
  if (snapshot.width <= 0 || snapshot.height <= 0) {
    return []
  }

  if ((snapshot.height / snapshot.width) <= paginationOptions.triggerAspectRatio) {
    return [{ top: 0, height: snapshot.height }]
  }

  const maxPageHeight = Math.max(1, Math.floor(snapshot.width * paginationOptions.maxAspectRatio))
  if (snapshot.height <= maxPageHeight) {
    return [{ top: 0, height: snapshot.height }]
  }

  const blocks = normalizeDomPaginationBlocks(snapshot.blocks, snapshot.height)
  const pages: PageSegment[] = []
  let startY = 0
  let guard = 0

  while (startY < snapshot.height && guard < 100) {
    guard += 1
    const remaining = snapshot.height - startY
    if (remaining <= maxPageHeight) {
      pages.push({ top: startY, height: remaining })
      break
    }

    const endY = chooseDomAwarePageEnd(snapshot, blocks, startY, paginationOptions)
    if (endY <= startY + 1) {
      pages.push({ top: startY, height: remaining })
      break
    }

    pages.push({
      top: startY,
      height: endY - startY
    })
    startY = endY
  }

  return pages.filter(page => page.height > 0)
}

const captureDomPaginationSnapshot = async (
  page: Pick<DomPaginationPage, 'evaluate'>
): Promise<DomPaginationSnapshot | null> => {
  return await page.evaluate(DOM_PAGINATION_SNAPSHOT_SCRIPT) as DomPaginationSnapshot | null
}

const waitForDomPaginationAssets = async (
  page: DomPaginationPage,
  timeoutMs: number
): Promise<void> => {
  await page.waitForSelector('#container', { timeout: timeoutMs }).catch(() => {})
  const waitMs = Math.min(timeoutMs, DOM_PAGINATION_ASSET_WAIT_MS)
  await page.evaluate(`(async () => {
    const container = document.querySelector('#container');
    if (!container) return;

    const maxWaitMs = Math.max(500, Math.min(${JSON.stringify(waitMs)}, 6000));
    const images = Array.from(container.querySelectorAll('img'));

    await Promise.race([
      Promise.all(images.map(image => {
        if (image.complete) return Promise.resolve();
        return new Promise(resolve => {
          image.addEventListener('load', () => resolve(), { once: true });
          image.addEventListener('error', () => resolve(), { once: true });
        });
      })),
      new Promise(resolve => setTimeout(resolve, maxWaitMs))
    ]);

    if ('fonts' in document && document.fonts && document.fonts.ready) {
      await Promise.race([
        document.fonts.ready.catch(() => undefined),
        new Promise(resolve => setTimeout(resolve, Math.min(2000, maxWaitMs)))
      ]);
    }

    await new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  })()`)
}

const captureDomPaginatedImageBuffers = async (
  htmlPath: string,
  imageOptions: RenderImageOptions,
  navigationOptions: RenderNavigationOptions,
  paginationOptions: PaginationOptions
): Promise<ImageSlice[] | null> => {
  if (!shouldUseDomAwarePagination() || !paginationOptions.enabled) {
    return null
  }

  const fileUrl = pathToFileURL(htmlPath).href

  try {
    const browserHandle = await getDomPaginationBrowser(Math.max(navigationOptions.timeout, 60_000))
    const page = await browserHandle.browser.newPage()

    try {
      await page.setViewport({
        width: DOM_PAGINATION_VIEWPORT_WIDTH,
        height: DOM_PAGINATION_VIEWPORT_HEIGHT,
        deviceScaleFactor: 1
      })

      await page.goto(fileUrl, {
        waitUntil: navigationOptions.waitUntil,
        timeout: navigationOptions.timeout
      })

      await waitForDomPaginationAssets(page, navigationOptions.timeout)
      const snapshot = await captureDomPaginationSnapshot(page)
      if (!snapshot) return null

      const pageSegments = planDomPaginationPages(snapshot, paginationOptions)
      if (pageSegments.length === 0) return null

      const slices: ImageSlice[] = []
      for (const segment of pageSegments) {
        const clipTop = Math.max(0, Math.floor(snapshot.y + segment.top))
        const clipBottom = Math.max(clipTop + 1, Math.ceil(snapshot.y + segment.top + segment.height))
        const clipHeight = Math.max(1, clipBottom - clipTop)
        const buffer = await page.screenshot({
          type: imageOptions.type,
          ...(imageOptions.quality === undefined ? {} : { quality: imageOptions.quality }),
          omitBackground: imageOptions.omitBackground,
          captureBeyondViewport: true,
          clip: {
            x: Math.max(0, Math.floor(snapshot.x)),
            y: clipTop,
            width: Math.max(1, Math.ceil(snapshot.width)),
            height: clipHeight
          }
        })

        slices.push({
          buffer: Buffer.from(buffer),
          format: imageOptions.type
        })
      }

      if (slices.length > 1) {
        return slices.map((slice, index) => annotateImageSlicePageBadge(
          slice,
          imageOptions.quality,
          index + 1,
          slices.length
        ))
      }

      return slices
    } finally {
      await page.close().catch(() => {})
    }
  } catch (error) {
    logger.warn(`[Render] DOM 感知分页截图失败，回退像素分页: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

const getReplyForwardIdentity = (event: Message): { id: string | number, name: string } => {
  if (Config.app.fakeForward && event.sender?.userId && event.sender?.nick) {
    return {
      id: event.sender.userId,
      name: event.sender.nick
    }
  }

  return {
    id: event.bot.account.selfId,
    name: event.bot.account.name
  }
}

const sendRenderedImagesSequentially = async <T> (
  sendDirect: SendRenderedImagesDirect<T>,
  images: ElementTypes[],
  logPrefix: string
): Promise<T> => {
  let lastResult: T | undefined
  let lastError: unknown
  let sentAny = false

  for (const image of images) {
    try {
      lastResult = await sendDirect([image])
      sentAny = true
    } catch (error) {
      lastError = error
      logger.warn(`[Render] ${logPrefix} 逐张图片发送失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (sentAny && lastResult !== undefined) {
    return lastResult
  }

  throw lastError ?? new Error(`${logPrefix} 逐张图片发送失败`)
}

const sendRenderedImagesDirectly = async <T> (
  sendDirect: SendRenderedImagesDirect<T>,
  images: ElementTypes[],
  logPrefix: string
): Promise<T> => {
  try {
    return await sendDirect(images)
  } catch (error) {
    if (images.length <= 1) throw error
    logger.warn(`[Render] ${logPrefix} 批量图片发送失败，回退逐张发送: ${error instanceof Error ? error.message : String(error)}`)
    return await sendRenderedImagesSequentially(sendDirect, images, logPrefix)
  }
}

export const replyRenderedImages = async (
  event: Message,
  images: ElementTypes[],
  options?: ReplyRenderedImagesOptions
): Promise<boolean> => {
  if (images.length === 0) return false

  const forwardThreshold = options?.forwardThreshold ?? 3
  if (images.length <= forwardThreshold) {
    await sendRenderedImagesDirectly(
      async payload => await replyAndRecordLongTaskCompletionAnchor(event, payload),
      images,
      '普通图片发送'
    )
    return true
  }

  const identity = getReplyForwardIdentity(event)
  const forwardMsg = common.makeForward(images, String(identity.id), identity.name)

  try {
    const result = await event.bot.sendForwardMsg(event.contact, forwardMsg, {
      source: options?.source ?? '图片合集',
      summary: options?.summary ?? `查看${images.length}张图片消息`,
      prompt: options?.prompt ?? '解析结果',
      news: options?.news ?? [{ text: '点击查看解析结果' }]
    })
    recordLongTaskCompletionAnchor(event, result)
    return true
  } catch (error) {
    logger.warn(`[Render] 合并转发发送失败，回退普通图片发送: ${error instanceof Error ? error.message : String(error)}`)
    await sendRenderedImagesDirectly(
      async payload => await replyAndRecordLongTaskCompletionAnchor(event, payload),
      images,
      '普通图片发送'
    )
    return true
  }
}

export const sendRenderedImagesToContact = async (
  event: Pick<Message, 'bot' | 'contact'>,
  images: ElementTypes[],
  options: ReplyRenderedImagesOptions & {
    forwardIdentity?: ForwardIdentity
    sendDirect: (images: ElementTypes[]) => Promise<unknown>
  }
): Promise<unknown> => {
  if (images.length === 0) return false

  const forwardThreshold = options?.forwardThreshold ?? 3
  if (images.length <= forwardThreshold) {
    return await sendRenderedImagesDirectly(
      options.sendDirect,
      images,
      '联系人普通图片发送'
    )
  }

  const identity = options?.forwardIdentity ?? {
    id: event.bot.account.selfId,
    name: event.bot.account.name
  }
  const forwardMsg = common.makeForward(images, String(identity.id), identity.name)

  try {
    const result = await event.bot.sendForwardMsg(event.contact, forwardMsg, {
      source: options?.source ?? '图片合集',
      summary: options?.summary ?? `查看${images.length}张图片消息`,
      prompt: options?.prompt ?? '解析结果',
      news: options?.news ?? [{ text: '点击查看解析结果' }]
    })

    if (result && typeof result === 'object' && 'messageId' in (result as Record<string, unknown>) && !('message_id' in (result as Record<string, unknown>))) {
      return {
        ...(result as Record<string, unknown>),
        message_id: (result as Record<string, unknown>).messageId
      }
    }

    return result
  } catch (error) {
    logger.warn(`[Render] 联系人合并转发发送失败，回退普通图片发送: ${error instanceof Error ? error.message : String(error)}`)
    return await sendRenderedImagesDirectly(
      options.sendDirect,
      images,
      '联系人普通图片发送'
    )
  }
}

/**
 * 渲染函数
 * 将指定路径的模板渲染为图片元素数组
 * 
 * @param event 消息事件对象，用于获取机器人账号信息
 * @template P 渲染路径，必须是有效的动态路径
 * @param path 渲染路径，格式为 "平台/组件ID" 或 "平台/分类/组件ID"
 * @param data 渲染数据，类型根据路径自动推断
 * @options 渲染选项
 * @returns 渲染结果图片元素数组的 Promise
 */
export const Render = async <P extends DynamicRenderPath> (
  event: Message,
  path: P,
  data?: ExtractDataTypeFromPath<P>,
  options?: {
    /**
     * 是否跳过水印嵌入
     */
    skipWatermark?: boolean
    /**
     * 单次渲染的智能分页设置。传 false 可避免长卡片被拆成多张图。
     */
    multiPage?: boolean | number
  }
): Promise<ImageElement[]> => {
  const pathParts = path.split('/')
  let templateType: string
  let templateName: string

  if (pathParts.length === 2) {
    // 二级路径：platform/templateName
    [templateType, templateName] = pathParts
  } else if (pathParts.length === 3) {
    // 三级路径：platform/category/templateName
    templateType = pathParts[0]
    templateName = `${pathParts[1]}/${pathParts[2]}`
  } else {
    throw new Error(`不支持的路径格式: ${path}`)
  }

  const outputDir = pathModule.join(karinPathHtml, Root.pluginName, templateType)

  // 检查是否有可用更新
  let hasUpdate = false
  if (!Config.app.RemoveWatermark && Config.app.autoUpdate === true) {
    try {
      const UPDATE_LOCK_KEY = 'kkk:update:lock'
      const lockedVersion = await db.get(UPDATE_LOCK_KEY)
      if (typeof lockedVersion === 'string' && lockedVersion.length > 0) {
        // 锁定版本必须严格大于当前版本才认为有可用更新
        hasUpdate = isSemverGreater(lockedVersion, Root.pluginVersion)
      }
    } catch {
      // 忽略错误，默认无更新
    }
  }

  const watermarkText = JSON.stringify({
    a: Date.now(),
    b: `Generated by karin-plugin-kkk v${Root.pluginVersion}, with source code open-sourced under the GPL-3.0 license`,
    c: `Sent by ${event?.bot?.account.selfId ?? 'unknown'}|${event?.bot?.account.name ?? 'unknown'}`
  })

  const watermarkTextBitSize = Buffer.byteLength(watermarkText, 'utf8') * 8
  const useDarkTheme = path === 'other/external-post' ? false : Common.useDarkTheme()

  const renderRequest: TypedRenderRequest<keyof DataTypeMap> = {
    templateType: templateType as TypedRenderRequest<keyof DataTypeMap>['templateType'],
    templateName,
    scale: Math.min(2, Math.max(0.5, Number(Config.app.renderScale) / 100)),
    useDarkTheme,
    version: Config.app.RemoveWatermark ? undefined : {
      plugin: 'karin-plugin',
      pluginName: 'kkk',
      pluginVersion: Root.pluginVersion,
      releaseType: /^\d+\.\d+\.\d+$/.test(Root.pluginVersion) ? 'Stable' : 'Preview',
      poweredBy: 'Karin',
      frameworkVersion: Root.karinVersion,
      hasUpdate
    },
    watermarkTextBitSize,
    data: {
      ...data,
      useDarkTheme
    }
  }

  // 调用 SSR 渲染，生成 HTML 文件
  const result = await reactServerRender({
    request: renderRequest,
    outputDir,
    resourcePaths: {
      cssDir: pathModule.join(Root.pluginPath, 'lib'),
      imageDir: pathModule.join(Root.pluginPath, 'resources', 'image')
    },
    plugins: [
      createQrCodePlugin(),
      createPosterPalettePlugin()
    ]
  }).then((res: Awaited<ReturnType<typeof reactServerRender>>) => {
    if (!res.success || !res.htmlPath) {
      throw new Error(res.error)
    }
    return res
  }).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : '未知错误'
    throw new Error(`SSR渲染失败: ${message}`)
  })

  const imageOptions = getRenderImageOptions(path)
  const navigationOptions = getRenderNavigationOptions(path)
  const paginationOptions = getConfiguredPaginationOptions()
  if (options?.multiPage === false) {
    paginationOptions.enabled = false
  }

  const ret: ImageElement[] = []
  const renderOptions = {
    name: `${Root.pluginName}/${templateType}`,
    file: result.htmlPath,
    multiPage: false,
    selector: '#container',
    fullPage: false,
    type: imageOptions.type,
    ...(imageOptions.quality === undefined ? {} : { quality: imageOptions.quality }),
    pageGotoParams: navigationOptions,
    omitBackground: imageOptions.omitBackground
  }

  const domPaginatedImages = await captureDomPaginatedImageBuffers(
    result.htmlPath,
    imageOptions,
    navigationOptions,
    paginationOptions
  )

  const imageSlices = domPaginatedImages ?? (() => {
    const fallbackPromise = render.render(renderOptions)
    return Promise.resolve(fallbackPromise).then(renderResult => {
      const images = Array.isArray(renderResult) ? renderResult : [renderResult]
      return images.flatMap(image => {
        const imageBuffer = Buffer.from(image, 'base64')
        const normalizedImage = normalizeRenderedImageBuffer(imageBuffer, imageOptions, path)
        return paginateRenderedImageBuffer(
          normalizedImage.buffer,
          normalizedImage.format === 'unknown' ? imageOptions.type : normalizedImage.format,
          imageOptions,
          paginationOptions
        )
      })
    })
  })()

  const resolvedImageSlices = await Promise.resolve(imageSlices)
  const imageStats: Array<{ index: number, type: RenderImageType, sizeMb: string, dimensions: string }> = []

  for (const pageBuffer of resolvedImageSlices) {
    let finalImageBuffer = pageBuffer.buffer
    let finalFormat: ImageBufferFormat = pageBuffer.format
    if (!options?.skipWatermark) {
      const normalizedAfterWatermark = applyWatermarkAndNormalizeImageBuffer(
        finalImageBuffer,
        imageOptions,
        path,
        watermarkText
      )
      finalImageBuffer = normalizedAfterWatermark.buffer
      finalFormat = normalizedAfterWatermark.format
    }

    const metadata = getImageMetadata(finalImageBuffer)
    const dimensions = metadata.width && metadata.height
      ? `${metadata.width}x${metadata.height}`
      : 'unknown'

    imageStats.push({
      index: ret.length,
      type: finalFormat === 'unknown' ? imageOptions.type : finalFormat,
      sizeMb: (finalImageBuffer.length / (1024 * 1024)).toFixed(3),
      dimensions
    })

    ret.push(
      segment.image(
        'base64://' + finalImageBuffer.toString('base64'),
        {
          name: getRenderedImageName(
            path,
            ret.length,
            finalFormat === 'unknown' ? imageOptions.type : finalFormat
          ),
          size: finalImageBuffer.length,
          width: metadata.width,
          height: metadata.height
        }
      )
    )
  }

  const statsText = imageStats.map((stat, i) => `  [${i + 1}] 类型: ${stat.type}, 大小: ${stat.sizeMb}MB, 尺寸: ${stat.dimensions}`).join('\n')
  logger.debug(`[Render] 图片处理完成，准备入队发送:\n共 ${imageStats.length} 张图片:\n${statsText}`)
  return ret
}

/**
 * 从图片缓冲区中提取元数据
 * @param buffer 图片缓冲区
 * @returns 图片元数据对象
 */
const getImageMetadata = (buffer: Buffer): ImageMetadata => {
  if (buffer.length >= 24 && buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20)
    }
  }

  if (buffer.length >= 4 && buffer[0] === 0xFF && buffer[1] === 0xD8) {
    let offset = 2

    while (offset + 8 < buffer.length) {
      if (buffer[offset] !== 0xFF) {
        offset += 1
        continue
      }

      const marker = buffer[offset + 1]
      if (marker === 0xD8 || marker === 0x01) {
        offset += 2
        continue
      }

      if (marker === 0xD9 || marker === 0xDA) {
        break
      }

      const length = buffer.readUInt16BE(offset + 2)
      if (length < 2 || offset + 2 + length > buffer.length) {
        break
      }

      const isSofMarker = (
        (marker >= 0xC0 && marker <= 0xC3) ||
        (marker >= 0xC5 && marker <= 0xC7) ||
        (marker >= 0xC9 && marker <= 0xCB) ||
        (marker >= 0xCD && marker <= 0xCF)
      )

      if (isSofMarker) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7)
        }
      }

      offset += 2 + length
    }
  }

  return {}
}

/**
 * 对已渲染的图片元素数组应用水印
 * 用于推送场景：渲染一次，按目标群逐个嵌入不同 bot 的水印
 */
export const applyWatermarkToImages = (
  images: ImageElement[],
  event: Message
): ImageElement[] => {
  if (Config.app.RemoveWatermark) return images

  const watermarkText = JSON.stringify({
    a: Date.now(),
    b: `Generated by karin-plugin-kkk v${Root.pluginVersion}, with source code open-sourced under the GPL-3.0 license`,
    c: `Sent by ${event?.bot?.account.selfId ?? 'unknown'}|${event?.bot?.account.name ?? 'unknown'}`
  })

  return images.map(img => {
    const base64Data = img.file.replace(/^base64:\/\//, '')
    const buffer = Buffer.from(base64Data, 'base64')
    const detectedFormat = detectImageBufferFormat(buffer)
    const normalized = applyWatermarkAndNormalizeImageBuffer(
      buffer,
      {
        type: detectedFormat === 'jpeg' ? 'jpeg' : 'png',
        quality: detectedFormat === 'jpeg' ? getConfiguredJpegQuality() : undefined,
        omitBackground: false
      },
      img.name ?? 'applyWatermarkToImages',
      watermarkText
    )
    const finalBuffer = normalized.buffer
    const format = normalized.format
    const metadata = getImageMetadata(finalBuffer)

    return segment.image('base64://' + finalBuffer.toString('base64'), {
      ...img,
      size: finalBuffer.length,
      width: metadata.width ?? img.width,
      height: metadata.height ?? img.height,
      name: img.name ?? `render.${getRenderedImageExt(format)}`
    })
  })
}
