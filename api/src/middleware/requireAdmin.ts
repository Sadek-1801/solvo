import { Request, Response, NextFunction } from 'express'

// Must be used after requireAuth middleware.
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ error: 'Forbidden: admin only' })
    return
  }
  next()
}
