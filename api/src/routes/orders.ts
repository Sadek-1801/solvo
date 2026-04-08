import { Router } from 'express'
import { prisma } from '../db'
import { requireAuth } from '../middleware/auth'
import { requireAdmin } from '../middleware/requireAdmin'
import { z } from 'zod'

export const ordersRouter = Router()

// GET /orders — customer sees own orders; admin sees all
ordersRouter.get('/', requireAuth, async (req, res) => {
  try {
    const isAdmin = req.user!.role === 'ADMIN'
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = 10
    const skip = (page - 1) * limit

    const where = isAdmin ? {} : { userId: req.user!.id }

    const [orders, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        include: {
          items: { include: { product: { select: { name: true, images: true } } } },
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.order.count({ where }),
    ])

    res.json({
      orders: orders.map((o) => ({ ...o, total: Number(o.total) })),
      total,
      page,
      pageCount: Math.ceil(total / limit),
    })
  } catch {
    res.status(500).json({ error: 'Failed to fetch orders' })
  }
})

// GET /orders/:id — customer sees own order; admin sees any
ordersRouter.get('/:id', requireAuth, async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        items: {
          include: {
            product: { select: { name: true, images: true, slug: true } },
          },
        },
        user: { select: { name: true, email: true } },
      },
    })

    if (!order) {
      res.status(404).json({ error: 'Order not found' })
      return
    }

    const isAdmin = req.user!.role === 'ADMIN'
    if (!isAdmin && order.userId !== req.user!.id) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    res.json({ ...order, total: Number(order.total) })
  } catch {
    res.status(500).json({ error: 'Failed to fetch order' })
  }
})

// PUT /orders/:id/status — admin only
const statusSchema = z.object({
  status: z.enum(['PENDING', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
})

ordersRouter.put('/:id/status', requireAuth, requireAdmin, async (req, res) => {
  const parsed = statusSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  try {
    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: { status: parsed.data.status },
    })
    res.json({ ...order, total: Number(order.total) })
  } catch {
    res.status(500).json({ error: 'Failed to update order status' })
  }
})

// GET /orders/analytics/dashboard — admin only (KPIs + chart data)
ordersRouter.get('/analytics/dashboard', requireAuth, requireAdmin, async (req, res) => {
  try {
    const days = Math.min(90, Math.max(7, Number(req.query.days) || 30))
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const [totalRevenue, totalOrders, avgOrderValue, statusBreakdown, dailyRevenue, topProducts] =
      await Promise.all([
        // Total revenue (paid+ orders)
        prisma.order.aggregate({
          where: { status: { not: 'CANCELLED' }, createdAt: { gte: since } },
          _sum: { total: true },
        }),
        // Total orders
        prisma.order.count({ where: { createdAt: { gte: since } } }),
        // Avg order value
        prisma.order.aggregate({
          where: { status: { not: 'CANCELLED' }, createdAt: { gte: since } },
          _avg: { total: true },
        }),
        // Status breakdown
        prisma.order.groupBy({ by: ['status'], _count: true }),
        // Revenue by day — requires raw SQL for DATE_TRUNC
        prisma.$queryRaw<{ day: Date; revenue: number }[]>`
          SELECT DATE_TRUNC('day', "createdAt") AS day, SUM(total)::float AS revenue
          FROM "Order"
          WHERE "createdAt" >= ${since} AND status != 'CANCELLED'
          GROUP BY day
          ORDER BY day ASC
        `,
        // Top 5 products by units sold
        prisma.orderItem.groupBy({
          by: ['productId'],
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: 'desc' } },
          take: 5,
        }),
      ])

    res.json({
      totalRevenue: Number(totalRevenue._sum.total ?? 0),
      totalOrders,
      avgOrderValue: Number(avgOrderValue._avg.total ?? 0),
      statusBreakdown: statusBreakdown.map((s) => ({ status: s.status, count: Number(s._count) })),
      dailyRevenue,
      topProducts: topProducts.map((p) => ({
        productId: p.productId,
        unitsSold: Number(p._sum.quantity ?? 0),
      })),
    })
  } catch {
    res.status(500).json({ error: 'Failed to fetch analytics' })
  }
})
