import { Router } from 'express'
import { prisma } from '../db'
import { requireAuth } from '../middleware/auth'
import { z } from 'zod'

export const cartRouter = Router()

cartRouter.use(requireAuth)

const itemSchema = z.object({
  productId: z.string().cuid(),
  quantity: z.number().int().positive(),
})

// GET /cart — current user's server-side cart
cartRouter.get('/', async (req, res) => {
  try {
    const cart = await prisma.cart.findUnique({
      where: { userId: req.user!.id },
      include: {
        items: {
          include: { product: { select: { id: true, name: true, price: true, images: true, slug: true, inStock: true, stock: true } } },
        },
      },
    })
    res.json(cart ?? { items: [] })
  } catch {
    res.status(500).json({ error: 'Failed to fetch cart' })
  }
})

// POST /cart/items — add or update item
cartRouter.post('/items', async (req, res) => {
  const parsed = itemSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const { productId, quantity } = parsed.data

  try {
    const cart = await prisma.cart.upsert({
      where: { userId: req.user!.id },
      create: { userId: req.user!.id, items: { create: { productId, quantity } } },
      update: {
        items: {
          upsert: {
            where: { cartId_productId: { cartId: '', productId } }, // Prisma handles this
            create: { productId, quantity },
            update: { quantity },
          },
        },
      },
      include: { items: { include: { product: true } } },
    })
    res.json(cart)
  } catch {
    res.status(500).json({ error: 'Failed to update cart' })
  }
})

// DELETE /cart/items/:productId — remove item
cartRouter.delete('/items/:productId', async (req, res) => {
  try {
    const cart = await prisma.cart.findUnique({ where: { userId: req.user!.id } })
    if (!cart) {
      res.status(404).json({ error: 'Cart not found' })
      return
    }
    await prisma.cartItem.deleteMany({
      where: { cartId: cart.id, productId: req.params.productId },
    })
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: 'Failed to remove item' })
  }
})

// DELETE /cart — clear entire cart
cartRouter.delete('/', async (req, res) => {
  try {
    const cart = await prisma.cart.findUnique({ where: { userId: req.user!.id } })
    if (cart) {
      await prisma.cartItem.deleteMany({ where: { cartId: cart.id } })
    }
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: 'Failed to clear cart' })
  }
})
