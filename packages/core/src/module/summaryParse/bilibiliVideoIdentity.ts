const asRecord = (value: unknown): Record<string, unknown> | null => {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

const toPositiveNumber = (value: unknown): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export const resolveBilibiliVideoPage = (idData: unknown): number => {
  const record = asRecord(idData)
  const page = toPositiveNumber(record?.p)
  return page > 1 ? page : 1
}

export const resolveBilibiliVideoAid = (raw: {
  idData?: unknown
  detail?: unknown
} | null | undefined): number => {
  if (!raw) return 0

  const idDataRecord = asRecord(raw.idData)
  const directAid = toPositiveNumber(idDataRecord?.aid)
  if (directAid > 0) return directAid

  const detailRecord = asRecord(raw.detail)
  const firstData = asRecord(detailRecord?.data)
  const secondData = asRecord(firstData?.data)
  const payload = secondData ?? firstData ?? detailRecord

  const payloadAid = toPositiveNumber(payload?.aid)
  if (payloadAid > 0) return payloadAid

  const firstDataAid = toPositiveNumber(firstData?.aid)
  if (firstDataAid > 0) return firstDataAid

  const detailAid = toPositiveNumber(detailRecord?.aid)
  if (detailAid > 0) return detailAid

  const item = asRecord(firstData?.item ?? detailRecord?.item)
  const modules = asRecord(item?.modules)
  const moduleDynamic = asRecord(modules?.module_dynamic)
  const major = asRecord(moduleDynamic?.major)
  const archive = asRecord(major?.archive)

  return toPositiveNumber(archive?.aid)
}

export const resolveBilibiliVideoCid = (raw: {
  idData?: unknown
  detail?: unknown
  selectedCid?: unknown
} | null | undefined): number => {
  if (!raw) return 0

  const selectedCid = toPositiveNumber(raw.selectedCid)
  if (selectedCid > 0) return selectedCid

  const page = resolveBilibiliVideoPage(raw.idData)
  const detailRecord = asRecord(raw.detail)
  const firstData = asRecord(detailRecord?.data)
  const secondData = asRecord(firstData?.data)
  const payload = secondData ?? firstData ?? detailRecord

  const pages = Array.isArray(payload?.pages) ? payload.pages : []
  if (pages.length > 0) {
    const pageEntry = asRecord(pages[Math.max(0, page - 1)])
    const pageCid = toPositiveNumber(pageEntry?.cid)
    if (pageCid > 0) return pageCid
  }

  return (
    toPositiveNumber(payload?.cid) ||
    toPositiveNumber(firstData?.cid) ||
    toPositiveNumber(detailRecord?.cid)
  )
}
