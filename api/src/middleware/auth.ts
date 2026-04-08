import { Request, Response, NextFunction } from 'express'
import { prisma } from '../db'

// Middleware: attach session user to req.user by reading the session token
// passed from web-app (NextAuth database sessions).
//
// Usage: router.use(requireAuth) then router.use(requireAdmin) for admin routes.

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; role: string }
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const sessionToken = req.headers['x-session-token'] as string | undefined

  if (!sessionToken) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: { user: { select: { id: true, email: true, role: true } } },
    })

    if (!session || session.expires < new Date()) {
      res.status(401).json({ error: 'Session expired' })
      return
    }

    req.user = session.user
    next()
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}
