import { Router } from 'express'
import { prisma } from '../db'
import { requireAuth } from '../middleware/auth'
import { requireAdmin } from '../middleware/requireAdmin'
import { z } from 'zod'
import slugify from 'slugify'

export const productsRouter = Router()

const productSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  price: z.number().positive(),
  categoryId: z.string().cuid(),
  images: z.array(z.string().url()).min(1),
  stock: z.number().int().min(0),
  supplier: z.string().optional(),
  supplierSku: z.string().optional(),
})

// GET /products — public, paginated, filterable
productsRouter.get('/', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 12))
    const skip = (page - 1) * limit
    const category = req.query.category as string | undefined
    const minPrice = req.query.minPrice ? Number(req.query.minPrice) : undefined
    const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : undefined

    const where = {
      deletedAt: null,
      inStock: true,
      ...(category && { category: { slug: category } }),
      ...(minPrice !== undefined || maxPrice !== undefined
        ? { price: { gte: minPrice, lte: maxPrice } }
        : {}),
    }

    const [products, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        include: { category: true },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.product.count({ where }),
    ])

    res.json({
      products: products.map((p) => ({ ...p, price: Number(p.price) })),
      total,
      page,
      pageCount: Math.ceil(total / limit),
    })
  } catch {
    res.status(500).json({ error: 'Failed to fetch products' })
  }
})

// GET /products/:slug — public
productsRouter.get('/:slug', async (req, res) => {
  try {
    const product = await prisma.product.findFirst({
      where: { slug: req.params.slug, deletedAt: null },
      include: { category: true },
    })

    if (!product) {
      res.status(404).json({ error: 'Product not found' })
      return
    }

    res.json({ ...product, price: Number(product.price) })
  } catch {
    res.status(500).json({ error: 'Failed to fetch product' })
  }
})

// POST /products — admin only
productsRouter.post('/', requireAuth, requireAdmin, async (req, res) => {
  const parsed = productSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const { name, ...rest } = parsed.data
  const baseSlug = slugify(name, { lower: true, strict: true })

  // Ensure slug uniqueness
  let slug = baseSlug
  let counter = 1
  while (await prisma.product.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${counter++}`
  }

  try {
    const product = await prisma.product.create({
      data: { name, slug, ...rest, inStock: rest.stock > 0 },
      include: { category: true },
    })
    res.status(201).json({ ...product, price: Number(product.price) })
  } catch {
    res.status(500).json({ error: 'Failed to create product' })
  }
})

// PUT /products/:id — admin only
productsRouter.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const parsed = productSchema.partial().safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const { name, ...rest } = parsed.data
  let slugData: { slug?: string } = {}

  if (name) {
    const baseSlug = slugify(name, { lower: true, strict: true })
    let slug = baseSlug
    let counter = 1
    // Exclude current product from uniqueness check
    while (
      await prisma.product.findFirst({ where: { slug, NOT: { id: req.params.id } } })
    ) {
      slug = `${baseSlug}-${counter++}`
    }
    slugData = { slug }
  }

  try {
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        ...(name ? { name } : {}),
        ...slugData,
        ...rest,
        ...(rest.stock !== undefined ? { inStock: rest.stock > 0 } : {}),
      },
      include: { category: true },
    })
    res.json({ ...product, price: Number(product.price) })
  } catch {
    res.status(500).json({ error: 'Failed to update product' })
  }
})

// DELETE /products/:id — admin only (soft delete)
productsRouter.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await prisma.product.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    })
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: 'Failed to delete product' })
  }
})
