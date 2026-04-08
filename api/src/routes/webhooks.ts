import { Router, Request, Response } from 'express'
import Stripe from 'stripe'
import { prisma } from '../db'

export const webhooksRouter = Router()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' })

// POST /webhooks/stripe
// Raw body required — express.raw() is mounted on this path in index.ts
webhooksRouter.post('/stripe', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err)
    res.status(400).json({ error: 'Webhook signature invalid' })
    return
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    // Idempotency check — Stripe may deliver the same event twice
    const existing = await prisma.order.findUnique({
      where: { stripeSessionId: session.id },
    })
    if (existing) {
      res.json({ received: true, duplicate: true })
      return
    }

    const metadata = session.metadata as {
      userId: string
      items: string // JSON stringified [{ productId, quantity }]
    }

    if (!metadata?.userId || !metadata?.items) {
      res.status(400).json({ error: 'Missing session metadata' })
      return
    }

    const cartItems: { productId: string; quantity: number }[] = JSON.parse(metadata.items)

    try {
      // Use transaction to safely decrement stock and create order atomically
      await prisma.$transaction(async (tx) => {
        const orderItems: { productId: string; quantity: number; price: number }[] = []

        for (const item of cartItems) {
          const product = await tx.product.findUnique({ where: { id: item.productId } })

          if (!product) throw new Error(`Product ${item.productId} not found`)
          if (product.stock < item.quantity) throw new Error(`Insufficient stock for ${product.name}`)

          await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: { decrement: item.quantity },
              inStock: product.stock - item.quantity > 0,
            },
          })

          orderItems.push({ productId: item.productId, quantity: item.quantity, price: Number(product.price) })
        }

        const total = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0)
        const shipping = session.shipping_details?.address

        await tx.order.create({
          data: {
            userId: metadata.userId,
            stripeSessionId: session.id,
            status: 'PAID',
            total,
            shippingAddress: {
              name: session.shipping_details?.name ?? '',
              line1: shipping?.line1 ?? '',
              line2: shipping?.line2 ?? '',
              city: shipping?.city ?? '',
              zip: shipping?.postal_code ?? '',
              country: shipping?.country ?? '',
            },
            items: {
              create: orderItems,
            },
          },
        })
      })

      res.json({ received: true })
    } catch (err) {
      console.error('[webhook] Order creation failed:', err)
      res.status(500).json({ error: 'Order creation failed' })
    }
  } else {
    // Acknowledge other event types
    res.json({ received: true })
  }
})
