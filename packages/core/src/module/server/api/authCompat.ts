import { authMiddleware } from 'node-karin'

export const createWriteAuthCompatibilityMiddleware = () => {
  return async (req: any, res: any, next: () => void) => {
    const method = String(req.method ?? '').toUpperCase()
    if (method !== 'PUT' && method !== 'PATCH') {
      return await authMiddleware(req, res, next)
    }

    const originalMethod = req.method
    try {
      req.originalMethod = originalMethod
      req.method = 'POST'
      await authMiddleware(req, res, () => {
        req.method = originalMethod
        next()
      })
    } catch (error) {
      req.method = originalMethod
      throw error
    }
  }
}

export const writeAuthCompatibilityMiddleware = createWriteAuthCompatibilityMiddleware()
