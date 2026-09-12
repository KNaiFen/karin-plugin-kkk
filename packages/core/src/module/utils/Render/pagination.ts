import jpeg from 'jpeg-js'
import { logger } from 'node-karin'
import { PNG } from 'pngjs'

export type ImageMetadata = {
  width?: number
  height?: number
}

export type RenderImageType = 'png' | 'jpeg'

export type RenderImageOptions = {
  type: RenderImageType
  quality?: number
  omitBackground: boolean
}

export type ImageBufferFormat = RenderImageType | 'unknown'

type DecodedImageBuffer = {
  width: number
  height: number
  data: Buffer
  format: RenderImageType
}

export type ImageSlice = {
  buffer: Buffer
  format: RenderImageType
}

type RgbaColor = [number, number, number, number]
type VectorPoint = [number, number]

type VectorGlyphDefinition = {
  width: number
  strokes: VectorPoint[][]
}

export type PaginationOptions = {
  enabled: boolean
  triggerAspectRatio: number
  maxAspectRatio: number
}

export const DEFAULT_PAGE_TRIGGER_ASPECT_RATIO = 3
export const DEFAULT_PAGE_MAX_ASPECT_RATIO = 2.2

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

export const clampNumber = (
  value: number,
  fallback: number,
  min: number,
  max: number
): number => {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

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

export const normalizeRenderedImageBuffer = (
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

export const paginateRenderedImageBuffer = (
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

export const getImageMetadata = (buffer: Buffer): ImageMetadata => {
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
