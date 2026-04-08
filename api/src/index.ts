import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { productsRouter } from './routes/products'
import { categoriesRouter } from './routes/categories'
import { ordersRouter } from './routes/orders'
import { cartRouter } from './routes/cart'
import { webhooksRouter } from './routes/webhooks'

const app = express()
const PORT = process.env.PORT ?? 4000

// ─── Middleware ───────────────────────────────────────────────────────────────

// Stripe webhooks need raw body — mount before express.json()
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }))

app.use(express.json())
app.use(cors({ origin: process.env.WEB_APP_URL ?? 'http://localhost:3000' }))

// ─── Routes ──────────────────────────────────────────────────────────────────

app.use('/products', productsRouter)
app.use('/categories', categoriesRouter)
app.use('/orders', ordersRouter)
app.use('/cart', cartRouter)
app.use('/webhooks', webhooksRouter)

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[api] Running on http://localhost:${PORT}`)
})
