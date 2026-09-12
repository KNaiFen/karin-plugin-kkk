import { createHash } from 'node:crypto'

const DEFAULT_TIKTOK_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'

export class TikTokXBogus {
  private readonly character = 'Dkdpgh4ZKsQB80/Mfvw36XI1R25-WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe='
  private readonly uaKey = Buffer.from([0x00, 0x01, 0x0c])
  private readonly userAgent: string

  constructor (userAgent = DEFAULT_TIKTOK_USER_AGENT) {
    this.userAgent = userAgent || DEFAULT_TIKTOK_USER_AGENT
  }

  getXBogus (urlPath: string): { params: string, xBogus: string, userAgent: string } {
    const array1 = this.md5StrToArray(
      this.md5(
        Buffer.from(this.rc4Encrypt(this.uaKey, Buffer.from(this.userAgent, 'latin1'))).toString('base64')
      )
    )
    const array2 = this.md5StrToArray(this.md5(this.md5StrToArray('d41d8cd98f00b204e9800998ecf8427e')))
    const urlPathArray = this.md5Encrypt(urlPath)
    const timer = Math.floor(Date.now() / 1000)
    const ct = 536919696
    const newArray = [
      64,
      0.00390625,
      1,
      12,
      urlPathArray[14],
      urlPathArray[15],
      array2[14],
      array2[15],
      array1[14],
      array1[15],
      (timer >> 24) & 255,
      (timer >> 16) & 255,
      (timer >> 8) & 255,
      timer & 255,
      (ct >> 24) & 255,
      (ct >> 16) & 255,
      (ct >> 8) & 255,
      ct & 255
    ]

    let xorResult = Number(newArray[0])
    for (let i = 1; i < newArray.length; i++) {
      xorResult ^= Math.trunc(Number(newArray[i]))
    }
    newArray.push(xorResult)

    const array3: number[] = []
    const array4: number[] = []
    for (let i = 0; i < newArray.length; i += 2) {
      array3.push(newArray[i])
      if (i + 1 < newArray.length) array4.push(newArray[i + 1])
    }

    const merged = [...array3, ...array4]
    const converted = this.encodingConversion(...merged as [
      number, number, number, number, number, number, number, number, number, number,
      number, number, number, number, number, number, number, number, number
    ])
    const encrypted = this.rc4Encrypt(Buffer.from('ÿ', 'latin1'), converted)
    const garbled = Buffer.from([2, 255, ...encrypted])
    let xBogus = ''

    for (let i = 0; i < garbled.length; i += 3) {
      xBogus += this.calculation(garbled[i], garbled[i + 1], garbled[i + 2])
    }

    return {
      params: `${urlPath}&X-Bogus=${xBogus}`,
      xBogus,
      userAgent: this.userAgent
    }
  }

  private md5Encrypt (urlPath: string): number[] {
    return this.md5StrToArray(this.md5(this.md5StrToArray(this.md5(urlPath))))
  }

  private md5 (input: string | number[]): string {
    const bytes = typeof input === 'string'
      ? Buffer.from(this.md5StrToArray(input))
      : Buffer.from(input)

    return createHash('md5').update(bytes).digest('hex')
  }

  private md5StrToArray (value: string): number[] {
    if (value.length > 32) {
      return Array.from(Buffer.from(value, 'latin1'))
    }

    const result: number[] = []
    for (let i = 0; i < value.length; i += 2) {
      result.push(Number.parseInt(value.slice(i, i + 2), 16))
    }
    return result
  }

  private encodingConversion (
    a: number,
    b: number,
    c: number,
    e: number,
    d: number,
    t: number,
    f: number,
    r: number,
    n: number,
    o: number,
    i: number,
    underscore: number,
    x: number,
    u: number,
    s: number,
    l: number,
    v: number,
    h: number,
    p: number
  ): Buffer {
    return Buffer.from([
      Math.trunc(a),
      Math.trunc(i),
      Math.trunc(b),
      Math.trunc(underscore),
      Math.trunc(c),
      Math.trunc(x),
      Math.trunc(e),
      Math.trunc(u),
      Math.trunc(d),
      Math.trunc(s),
      Math.trunc(t),
      Math.trunc(l),
      Math.trunc(f),
      Math.trunc(v),
      Math.trunc(r),
      Math.trunc(h),
      Math.trunc(n),
      Math.trunc(p),
      Math.trunc(o)
    ])
  }

  private rc4Encrypt (key: Buffer, data: Buffer): number[] {
    const s = Array.from({ length: 256 }, (_, index) => index)
    let j = 0
    const encrypted: number[] = []

    for (let i = 0; i < 256; i++) {
      j = (j + s[i] + key[i % key.length]) % 256
      const tmp = s[i]
      s[i] = s[j]
      s[j] = tmp
    }

    let i = 0
    j = 0
    for (const byte of data) {
      i = (i + 1) % 256
      j = (j + s[i]) % 256
      const tmp = s[i]
      s[i] = s[j]
      s[j] = tmp
      encrypted.push(byte ^ s[(s[i] + s[j]) % 256])
    }

    return encrypted
  }

  private calculation (a1: number, a2: number, a3: number): string {
    const x1 = (a1 & 255) << 16
    const x2 = (a2 & 255) << 8
    const x3 = x1 | x2 | (a3 & 255)

    return this.character[(x3 & 16515072) >> 18] +
      this.character[(x3 & 258048) >> 12] +
      this.character[(x3 & 4032) >> 6] +
      this.character[x3 & 63]
  }
}
