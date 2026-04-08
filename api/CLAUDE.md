# Sovlo — api (Express + Prisma Backend)

## Purpose
Standalone backend service. Handles all database operations via Prisma, business logic, and Stripe webhook processing. The `web-app` calls this service for data. Auth (NextAuth) lives in `web-app` but uses the same database.

## Stack
- Node.js, Express, TypeScript
- Prisma ORM (PostgreSQL, Neon free tier)
- bcryptjs (password hashing)
- Stripe (webhook verification)
- Zod (request validation)

## Port
Runs on `http://localhost:4000` in development.

## Directory Structure
```
api/
├── prisma/
│   ├── schema.prisma       # Source of truth for all DB models
│   ├── migrations/         # Never edit manually — use prisma migrate dev
│   └── seed.ts             # Seeds 5 categories + 20 products + 1 admin user
├── src/
│   ├── index.ts            # Express app entry point
│   ├── db.ts               # Prisma client singleton
│   ├── middleware/
│   │   ├── auth.ts         # Verify session token from web-app requests
│   │   ├── requireAdmin.ts # Check role === ADMIN
│   │   └── validate.ts     # Zod request body validation middleware
│   └── routes/
│       ├── products.ts     # GET /products, POST, PUT, DELETE (admin)
│       ├── categories.ts   # GET /categories
│       ├── orders.ts       # GET /orders, PUT /orders/:id/status (admin)
│       ├── cart.ts         # GET, POST, PUT, DELETE /cart (server-side cart)
│       ├── upload.ts       # POST /upload (UploadThing proxy if needed)
│       └── webhooks.ts     # POST /webhooks/stripe
├── .env.example
├── package.json
└── tsconfig.json
```

## Prisma Schema — Complete Models

### User
```prisma
model User {
  id        String    @id @default(cuid())
  email     String    @unique
  password  String?   // null for OAuth users
  name      String?
  role      Role      @default(CUSTOMER)
  accounts  Account[]
  sessions  Session[]
  orders    Order[]
  addresses Address[]
  createdAt DateTime  @default(now())
}
enum Role { CUSTOMER ADMIN }
```

### Product
```prisma
model Product {
  id          String      @id @default(cuid())
  name        String
  slug        String      @unique
  description String
  price       Decimal     @db.Decimal(10,2)
  images      String[]    // array of URLs
  stock       Int         @default(0)
  inStock     Boolean     @default(true)
  categoryId  String
  category    Category    @relation(fields: [categoryId], references: [id])
  orderItems  OrderItem[]
  supplier    String?     // nullable — fill for dropshipping later
  supplierSku String?
  deletedAt   DateTime?   // soft delete — never hard-delete products in orders
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  @@index([categoryId])
  @@index([slug])
}
```

### Category
```prisma
model Category {
  id       String    @id @default(cuid())
  name     String    @unique
  slug     String    @unique
  products Product[]
}
```

### Cart + CartItem
```prisma
model Cart {
  id        String     @id @default(cuid())
  userId    String     @unique
  user      User       @relation(fields: [userId], references: [id])
  items     CartItem[]
  updatedAt DateTime   @updatedAt
}
model CartItem {
  id        String  @id @default(cuid())
  cartId    String
  cart      Cart    @relation(fields: [cartId], references: [id])
  productId String
  product   Product @relation(fields: [productId], references: [id])
  quantity  Int
  @@unique([cartId, productId])
}
```

### Order + OrderItem
```prisma
model Order {
  id              String      @id @default(cuid())
  userId          String
  user            User        @relation(fields: [userId], references: [id])
  items           OrderItem[]
  status          OrderStatus @default(PENDING)
  total           Decimal     @db.Decimal(10,2)
  stripeSessionId String      @unique  // idempotency key
  shippingAddress Json        // { name, line1, city, zip, country }
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
}
model OrderItem {
  id        String  @id @default(cuid())
  orderId   String
  order     Order   @relation(fields: [orderId], references: [id])
  productId String
  product   Product @relation(fields: [productId], references: [id])
  quantity  Int
  price     Decimal @db.Decimal(10,2) // price at time of purchase — snapshot
}
enum OrderStatus { PENDING PAID PROCESSING SHIPPED DELIVERED CANCELLED }
```

### Address
```prisma
model Address {
  id        String  @id @default(cuid())
  userId    String
  user      User    @relation(fields: [userId], references: [id])
  name      String
  line1     String
  line2     String?
  city      String
  zip       String
  country   String
  isDefault Boolean @default(false)
}
```

## Key Rules

### Pricing
- Always store prices as `Decimal(10,2)` in DB.
- Convert with `Number(price)` or `price.toFixed(2)` before returning to client (Prisma Decimal is not JSON-serializable).
- OrderItem stores `price` as a snapshot at purchase time — never recalculate from current product price.

### Soft Delete
- Products use `deletedAt: DateTime?`. Filter with `WHERE deletedAt IS NULL` on all public routes.
- To delete: `prisma.product.update({ where: { id }, data: { deletedAt: new Date() } })`.
- Hard-delete only when no OrderItem references the product (rare).

### Stock Management
- Decrement stock inside a Prisma transaction:
  ```ts
  await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id } });
    if (!product || product.stock < qty) throw new Error('Insufficient stock');
    await tx.product.update({ where: { id }, data: { stock: { decrement: qty } } });
  });
  ```

### Stripe Webhook
- Route must receive raw body — do NOT use `express.json()` on the webhook route.
- Verify with: `stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET)`.
- Handle `checkout.session.completed`: create Order + OrderItems, decrement stock, mark order PAID.
- Idempotency: `prisma.order.findUnique({ where: { stripeSessionId } })` before creating.

### Password Hashing
- Hash with `bcrypt.hash(password, 12)` on registration.
- Verify with `bcrypt.compare(plain, hashed)` on login.
- `password` field is nullable — OAuth users have no password.

### Slug Generation
- Use `slugify(name, { lower: true, strict: true })` on product create.
- On update: regenerate slug from new name, check uniqueness excluding current product ID.

### N+1 Prevention
- Always use Prisma `include` for relations: `include: { category: true, items: { include: { product: true } } }`.
- Never loop and query inside a loop.

### Date Aggregation
- Use `prisma.$queryRaw` with `DATE_TRUNC('day', created_at)` for revenue-by-day charts.
- Prisma fluent API doesn't support `DATE_TRUNC`. Cast `COUNT` results: `Number(BigInt)`.
- All dates stored/grouped in UTC. Document this limitation.

## Seed Script
Run: `npx ts-node prisma/seed.ts`
Seeds:
- 5 categories (Shoes, Clothing, Accessories, Electronics, Home)
- 20 products with Unsplash image URLs, real-looking names, prices, stock
- 1 admin user: `admin@sovlo.com` / `Admin1234!` (bcrypt hashed)

## Migration Workflow
```bash
npx prisma migrate dev --name <migration-name>   # dev — auto-applies + generates client
npx prisma migrate deploy                         # production — applies pending migrations
npx prisma generate                               # regenerate client after schema changes
npx prisma studio                                 # visual DB browser (dev only)
```

## Environment Variables
```env
DATABASE_URL=postgresql://user:pass@host/sovlo?pgbouncer=true&connection_limit=1
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
JWT_SECRET=...          # if using JWT for inter-service auth
PORT=4000
```
