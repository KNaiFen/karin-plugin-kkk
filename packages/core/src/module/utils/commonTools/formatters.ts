import fs from 'node:fs'

export const chineseToArabic = (chineseNumber: string): number => {
  const chineseToArabicMap: Record<string, number> = {
    零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9
  }
  const units: Record<string, number> = {
    十: 10, 百: 100, 千: 1000, 万: 10000, 亿: 100000000
  }
  let result = 0
  let temp = 0
  let unit = 1

  for (let i = chineseNumber.length - 1; i >= 0; i--) {
    const char = chineseNumber[i]

    if (units[char] !== undefined) {
      unit = units[char]
      if (unit === 10000 || unit === 100000000) {
        result += temp * unit
        temp = 0
      }
    } else {
      const num = chineseToArabicMap[char]
      if (unit > 1) {
        temp += num * unit
      } else {
        temp += num
      }
      unit = 1
    }
  }
  return result + temp
}

export const formatCookies = (cookies: any[]): string => {
  return cookies.map(cookie => {
    const [nameValue] = cookie.split(';').map((part: string) => part.trim())
    const [name, value] = nameValue.split('=')

    return `${name}=${value}`
  }).join('; ')
}

export const calculateBitrate = (targetSizeMB: number, duration: number): number => {
  const targetSizeBytes = targetSizeMB * 1024 * 1024
  return (targetSizeBytes * 8) / duration / 1024
}

export const getVideoFileSize = async (filePath: string): Promise<number> => {
  try {
    const stats = await fs.promises.stat(filePath)
    const fileSizeInBytes = stats.size
    return fileSizeInBytes / (1024 * 1024)
  } catch (error) {
    console.error('获取文件大小时发生错误:', error)
    throw error
  }
}

export const count = (value: number): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '无法获取'
  }

  if (value >= 100000000) {
    return (value / 100000000).toFixed(1) + '亿'
  } else if (value >= 10000) {
    return (value / 10000).toFixed(1) + '万'
  } else {
    return value?.toString() ?? '无法获取'
  }
}

export const formatFileSize = (sizeInMB: number | string): string => {
  const size = typeof sizeInMB === 'string' ? parseFloat(sizeInMB) : sizeInMB

  if (size < 1024) {
    return `${size.toFixed(2)}MB`
  } else if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(2)}GB`
  } else {
    return `${(size / (1024 * 1024)).toFixed(2)}TB`
  }
}
