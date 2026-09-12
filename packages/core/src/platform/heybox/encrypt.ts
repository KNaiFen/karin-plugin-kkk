import { createHash } from 'node:crypto'

export const HEYBOX_API_HOST = 'api.xiaoheihe.cn'
export const HEYBOX_LINK_TREE_PATH = '/bbs/app/link/tree'

const HKEY_CHARS = 'AB45STUVWZEFGJ6CH01D237IXYPQRKLMN89'

const md5 = (value: string): string => createHash('md5').update(value, 'utf8').digest('hex')

export const getNonce = (time: number): string => md5(String(time)).toUpperCase()

const vm = (value: number): number => (value & 0x80) ? ((value << 1) & 0xFF) ^ 27 : (value << 1) & 0xFF
const qm = (value: number): number => vm(value) ^ value
const mm = (value: number): number => qm(vm(value))
const ym = (value: number): number => mm(qm(vm(value)))
const gm = (value: number): number => ym(value) ^ mm(value) ^ qm(value)

const km = (values: number[]): number[] => {
  const t0 = gm(values[0]) ^ ym(values[1]) ^ mm(values[2]) ^ qm(values[3])
  const t1 = qm(values[0]) ^ gm(values[1]) ^ ym(values[2]) ^ mm(values[3])
  const t2 = mm(values[0]) ^ qm(values[1]) ^ gm(values[2]) ^ ym(values[3])
  const t3 = ym(values[0]) ^ mm(values[1]) ^ qm(values[2]) ^ gm(values[3])
  values[0] = t0
  values[1] = t1
  values[2] = t2
  values[3] = t3
  return values
}

const av = (source: string, table: string, end: number): string => {
  const sliced = table.slice(0, end)
  if (!sliced) return ''
  return Array.from(source, char => sliced.charAt(char.charCodeAt(0) % sliced.length)).join('')
}

const sv = (source: string, table: string): string => {
  if (!table) return ''
  return Array.from(source, char => table.charAt(char.charCodeAt(0) % table.length)).join('')
}

const interleave = (items: string[]): string => {
  const maxLength = Math.max(...items.map(item => item.length), 0)
  let result = ''
  for (let index = 0; index < maxLength; index++) {
    for (const item of items) {
      if (index < item.length) result += item[index]
    }
  }
  return result
}

export const getHkey = (time: number, path = HEYBOX_LINK_TREE_PATH): string => {
  const normalizedPath = `/${path.split('/').filter(Boolean).join('/')}/`
  const nonce = getNonce(time)
  const interleaved = interleave([
    av(String(time + 1), HKEY_CHARS, -2),
    sv(normalizedPath, HKEY_CHARS),
    sv(nonce, HKEY_CHARS)
  ]).slice(0, 20)
  const hashed = md5(interleaved)
  const mixed = km(Array.from(hashed.slice(-6), char => char.charCodeAt(0)))
  const suffix = String(mixed.reduce((sum, value) => sum + value, 0) % 100).padStart(2, '0')
  return `${av(hashed.slice(0, 5), HKEY_CHARS, -4)}${suffix}`
}

export type BuildHeyboxUrlOptions = {
  linkId: string
  nowSeconds?: number
}

export const buildHeyboxUrl = ({ linkId, nowSeconds = Math.floor(Date.now() / 1000) }: BuildHeyboxUrlOptions): string => {
  const params = new URLSearchParams({
    os_type: 'web',
    app: 'heybox',
    client_type: 'web',
    version: '999.0.4',
    _time: String(nowSeconds),
    nonce: getNonce(nowSeconds),
    hkey: getHkey(nowSeconds),
    link_id: linkId,
    page: '1',
    index: '1',
    limit: '5',
    x_client_type: 'weboutapp',
    x_app: 'heybox_website',
    x_os_type: 'Windows',
    web_version: '2.5'
  })

  return `https://${HEYBOX_API_HOST}${HEYBOX_LINK_TREE_PATH}?${params.toString()}`
}
