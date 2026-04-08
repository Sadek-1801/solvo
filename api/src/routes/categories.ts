import { Router } from 'express'
import { prisma } from '../db'

export const categoriesRouter = Router()

// GET /categories — public
categoriesRouter.get('/', async (_req, res) => {
  try {
    const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } })
    res.json(categories)
  } catch {
    res.status(500).json({ error: 'Failed to fetch categories' })
  }
})
