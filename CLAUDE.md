# Sovlo — Dropshipping E-Commerce Platform

## Project Overview
Sovlo is a full-stack dropshipping e-commerce platform. It has two sections: a customer-facing storefront and an admin dashboard. Built as a 6-week MVP — scope is fixed, no extensions beyond Week 6.

## Repository Structure
```
sovlo/
├── web-app/     # Next.js 14 App Router — pages, components, auth, API routes
└── api/         # Express + Prisma — database layer, business logic, Stripe webhooks
```

## Tech Stack
| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| State | Zustand (cart), React Server Components (server data) |
| Charts | Recharts |
| Backend | Express, Prisma ORM |
| Database | PostgreSQL via Neon (free tier) |
| Auth | NextAuth.js (CredentialsProvider + GoogleProvider) |
| Payments | Stripe Checkout + Webhooks |
| Storage | UploadThing (product images) |
| Testing | Jest + React Testing Library |
| Deploy | Vercel |

## Dev Servers
- `web-app`: http://localhost:3000
- `api`: http://localhost:4000

Run both concurrently during development.

## Environment Variables — Critical Rules
- **NEVER** prefix secret keys with `NEXT_PUBLIC_`. Only public/safe values go there.
- **NEVER** commit `.env` or `.env.local`. Use `.env.example` with placeholder values.
- Neon `DATABASE_URL` must include `?pgbouncer=true&connection_limit=1` for serverless environments.
- Keep `NEXTAUTH_SECRET`, `DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` server-only.

## Security Rules (Non-Negotiable)
1. Middleware protects routes UI-level only. **Every API route and Server Action must call `getServerSession()` and verify role independently.** A crafted `fetch()` bypasses middleware.
2. **Never trust client-sent prices.** Always re-fetch product prices from DB in `/api/checkout-session`.
3. Stripe webhook: use `stripe.webhooks.constructEvent()` with raw body (not parsed JSON). Disable `bodyParser` in route config.
4. Webhook idempotency: check if `Order` with `stripeSessionId` already exists before creating.
5. Stock decrement: use a DB transaction, check `stock >= qty` inside the transaction.

## Data Conventions
- All prices: `Decimal(10,2)` in DB. Convert with `Number(x)` or `.toFixed(2)` before sending to client components (Prisma Decimal doesn't auto-serialize to JSON).
- Soft-delete products with `deletedAt: DateTime?`. Never hard-delete products that appear in `OrderItem`. Filter `deletedAt: null` on all public queries.
- Use `slug` (not `id`) in product URLs. Auto-generate with `slugify` on create. Check uniqueness excluding current record on update.
- Use `cuid()` for all primary keys.

## Database Schema (Source of Truth)
Defined once in `api/prisma/schema.prisma`. Never restructure — use nullable fields for future dropshipping extensions (`supplier`, `supplierSku`).

Core models: `User`, `Product`, `Category`, `Cart`, `CartItem`, `Order`, `OrderItem`, `Address`
Enums: `Role { CUSTOMER ADMIN }`, `OrderStatus { PENDING PAID PROCESSING SHIPPED DELIVERED CANCELLED }`

## Build Plan (6 Weeks)
- **Week 1** — Auth (NextAuth, bcrypt, roles), middleware, Vercel deploy
- **Week 2** — Product listing, filtering, detail pages, seed script (20 products)
- **Week 3** — Cart (Zustand + localStorage), Stripe checkout flow, orders
- **Week 4** — Admin CRUD (products + orders), image upload (UploadThing)
- **Week 5** — Dashboard charts (Recharts), KPI cards, error boundaries, Lighthouse ≥ 85
- **Week 6** — Tests, rate limiting, env validation, README, production checklist

## Cut List (Out of Scope — No Exceptions)
- Supplier API integration (AliExpress, CJ Dropshipping)
- Email notifications
- Discount codes / coupons
- Customer reviews & ratings
- Wishlist / save for later
- Multi-vendor / marketplace
- Real-time chat
- Mobile app

## Design System
- **Shop** — minimal, product-first, light mode, lots of whitespace. Customer-facing.
- **Admin** — dark sidebar (~220px, near-black), light content area. SaaS tool feel.
- Status badge colors: Pending=grey, Paid=blue, Processing=amber, Shipped=purple, Delivered=green, Cancelled=red.
- All charts use Recharts wrapped in `ResponsiveContainer width='100%'`.
