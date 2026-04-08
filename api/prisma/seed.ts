import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import slugify from 'slugify'

const prisma = new PrismaClient()

const categories = [
  { name: 'Shoes', slug: 'shoes' },
  { name: 'Clothing', slug: 'clothing' },
  { name: 'Accessories', slug: 'accessories' },
  { name: 'Electronics', slug: 'electronics' },
  { name: 'Home', slug: 'home' },
]

const products = [
  { name: 'Classic White Sneakers', category: 'shoes', price: 89.99, stock: 45, description: 'Timeless white canvas sneakers with rubber sole. Perfect for everyday wear.' },
  { name: 'Running Pro X500', category: 'shoes', price: 129.99, stock: 30, description: 'Lightweight mesh running shoes with responsive cushioning for long-distance runs.' },
  { name: 'Leather Chelsea Boots', category: 'shoes', price: 219.99, stock: 15, description: 'Genuine leather Chelsea boots with elastic side panels and stacked heel.' },
  { name: 'Slip-On Canvas Shoes', category: 'shoes', price: 59.99, stock: 60, description: 'Effortless slip-on shoes with durable canvas upper and cushioned insole.' },
  { name: 'Oversized Cotton Hoodie', category: 'clothing', price: 74.99, stock: 80, description: '100% organic cotton hoodie with kangaroo pocket and adjustable drawstring.' },
  { name: 'Slim Fit Chinos', category: 'clothing', price: 64.99, stock: 50, description: 'Stretch cotton chino trousers in a modern slim fit. Machine washable.' },
  { name: 'Linen Summer Shirt', category: 'clothing', price: 54.99, stock: 40, description: 'Breathable 100% linen shirt with button-down collar. Ideal for warm weather.' },
  { name: 'Ribbed Knit Sweater', category: 'clothing', price: 89.99, stock: 35, description: 'Soft ribbed knit sweater in merino wool blend. Relaxed fit with crew neck.' },
  { name: 'Leather Minimalist Wallet', category: 'accessories', price: 49.99, stock: 100, description: 'Ultra-slim genuine leather bifold wallet. Holds 6 cards and cash.' },
  { name: 'Canvas Tote Bag', category: 'accessories', price: 34.99, stock: 75, description: 'Heavy-duty canvas tote with reinforced handles and interior zip pocket.' },
  { name: 'Stainless Steel Watch', category: 'accessories', price: 199.99, stock: 20, description: 'Minimalist stainless steel watch with Japanese quartz movement. 5ATM water resistant.' },
  { name: 'Polarized Sunglasses', category: 'accessories', price: 79.99, stock: 55, description: 'UV400 polarized lenses in lightweight acetate frames. Includes hard case.' },
  { name: 'Wireless Earbuds Pro', category: 'electronics', price: 149.99, stock: 40, description: 'True wireless earbuds with active noise cancellation. 24hr battery with case.' },
  { name: 'Portable Charger 20000mAh', category: 'electronics', price: 59.99, stock: 60, description: 'High-capacity power bank with dual USB-A and USB-C ports. Fast charging.' },
  { name: 'Mechanical Keyboard TKL', category: 'electronics', price: 129.99, stock: 25, description: 'Tenkeyless mechanical keyboard with tactile switches and RGB backlighting.' },
  { name: 'Laptop Stand Adjustable', category: 'electronics', price: 44.99, stock: 70, description: 'Aluminum adjustable laptop stand. Compatible with 10–17 inch laptops.' },
  { name: 'Scented Soy Candle Set', category: 'home', price: 39.99, stock: 90, description: 'Set of 3 hand-poured soy wax candles in amber glass jars. 40hr burn time each.' },
  { name: 'Bamboo Cutting Board', category: 'home', price: 29.99, stock: 65, description: 'Extra-large bamboo cutting board with juice groove and non-slip feet.' },
  { name: 'Ceramic Pour-Over Set', category: 'home', price: 54.99, stock: 35, description: 'Hand-crafted ceramic pour-over coffee dripper with matching mug. 400ml capacity.' },
  { name: 'Linen Throw Pillow Covers', category: 'home', price: 24.99, stock: 120, description: 'Set of 2 washed linen pillow covers in natural beige. 50x50cm. Zipper closure.' },
]

// Unsplash image URLs by category
const imagesByCategory: Record<string, string[]> = {
  shoes: [
    'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800',
    'https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=800',
    'https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=800',
    'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=800',
  ],
  clothing: [
    'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=800',
    'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=800',
    'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=800',
    'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800',
  ],
  accessories: [
    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800',
    'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800',
    'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=800',
    'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800',
  ],
  electronics: [
    'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800',
    'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=800',
    'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800',
    'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=800',
  ],
  home: [
    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800',
    'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800',
    'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800',
  ],
}

async function main() {
  console.log('Seeding database...')

  // Seed categories
  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    })
  }
  console.log(`Seeded ${categories.length} categories`)

  // Seed products
  const categoryMap = await prisma.category.findMany()
  const catBySlug = Object.fromEntries(categoryMap.map((c) => [c.slug, c]))

  for (const p of products) {
    const slug = slugify(p.name, { lower: true, strict: true })
    const category = catBySlug[p.category]
    const images = imagesByCategory[p.category] ?? []

    await prisma.product.upsert({
      where: { slug },
      update: {},
      create: {
        name: p.name,
        slug,
        description: p.description,
        price: p.price,
        images,
        stock: p.stock,
        inStock: p.stock > 0,
        categoryId: category.id,
      },
    })
  }
  console.log(`Seeded ${products.length} products`)

  // Seed admin user
  const adminEmail = 'admin@sovlo.com'
  const hashedPassword = await bcrypt.hash('Admin1234!', 12)

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      password: hashedPassword,
      name: 'Sovlo Admin',
      role: 'ADMIN',
    },
  })
  console.log(`Seeded admin user: ${adminEmail}`)

  console.log('Done.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
