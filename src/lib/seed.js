import { addDays } from './format'

/** Deterministic demo data so the client always sees a consistent, realistic business. */
const rng = (() => {
  let seed = 20261118
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
})()

const pick = (arr) => arr[Math.floor(rng() * arr.length)]
const between = (min, max) => Math.floor(rng() * (max - min + 1)) + min
const round = (n, d = 0) => Number(n.toFixed(d))

const daysAgo = (days, hour = 9, minute = 0) => {
  const d = addDays(new Date(), -days)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export const DEFAULT_CONFIG = {
  inventoryCategories: [
    'Baking Ingredients',
    'Fruits & Juice Ingredients',
    'Packaging Materials',
    'Finished Products',
    'Cleaning & Supplies',
  ],
  productCategories: ['Cakes', 'Cupcakes', 'Cake Slices', 'Fresh Juices', 'Bottled Juices', 'Other'],
  expenseCategories: [
    'Electricity',
    'Water',
    'Rent',
    'Salaries & Wages',
    'Transport',
    'Internet',
    'Cleaning Supplies',
    'Repairs & Maintenance',
    'Other',
  ],
  paymentMethods: ['Cash', 'M-Pesa', 'Bank Transfer', 'Other'],
  units: ['kg', 'g', 'L', 'ml', 'Pieces', 'Packets', 'Boxes', 'Bottles'],
  movementTypes: ['Purchase', 'Sale', 'Adjustment', 'Wastage', 'Opening Stock', 'Other'],
}

export function createSeedData() {
  const data = {
    business: {
      name: 'JS Baking House',
      tagline: 'Cakes, juices & everyday goodness',
      phone: '+254 712 345 678',
      email: 'hello@jsbakinghouse.co.ke',
      location: 'Westlands, Nairobi, Kenya',
      currency: 'KES',
      expiryWarningDays: 14,
      openingInfo: 'Open Monday to Saturday · 7:00 AM – 7:00 PM',
      logoText: 'JSBH',
    },
    config: structuredClone(DEFAULT_CONFIG),
    users: [
      {
        id: 'user_owner',
        name: 'Amina Otieno',
        username: 'amina',
        password: 'owner123',
        role: 'owner',
        email: 'amina@jsbakinghouse.co.ke',
        active: true,
        createdAt: daysAgo(210),
      },
      {
        id: 'user_staff',
        name: 'Brian Kiptoo',
        username: 'brian',
        password: 'staff123',
        role: 'staff',
        email: 'brian@jsbakinghouse.co.ke',
        active: true,
        createdAt: daysAgo(96),
      },
      {
        id: 'user_staff_2',
        name: 'Wanjiku Njeri',
        username: 'wanjiku',
        password: 'staff123',
        role: 'staff',
        email: 'wanjiku@jsbakinghouse.co.ke',
        active: true,
        createdAt: daysAgo(54),
      },
    ],
    sessionUserId: 'user_owner',
    inventory: [],
    movements: [],
    suppliers: [],
    purchases: [],
    products: [],
    sales: [],
    expenses: [],
    production: [],
    auditLogs: [],
  }

  const itemDefs = [
    ['Flour', 'Baking Ingredients', 'kg', 40, 12, 145, 0, 45],
    ['Sugar', 'Baking Ingredients', 'kg', 30, 10, 160, 0, 60],
    ['Eggs', 'Baking Ingredients', 'Pieces', 180, 40, 18, 0, 14],
    ['Butter', 'Baking Ingredients', 'kg', 8, 8, 520, 0, 20],
    ['Cooking oil', 'Baking Ingredients', 'L', 18, 6, 340, 0, 90],
    ['Baking powder', 'Baking Ingredients', 'kg', 5, 2, 380, 0, 120],
    ['Cocoa powder', 'Baking Ingredients', 'kg', 3, 3, 760, 0, 180],
    ['Milk', 'Baking Ingredients', 'L', 24, 8, 120, 0, 5],
    ['Cream', 'Baking Ingredients', 'L', 10, 4, 280, 0, 4],
    ['Chocolate', 'Baking Ingredients', 'kg', 7, 3, 820, 0, 150],
    ['Mangoes', 'Fruits & Juice Ingredients', 'kg', 26, 10, 180, 0, 3],
    ['Oranges', 'Fruits & Juice Ingredients', 'kg', 30, 10, 140, 0, 6],
    ['Passion fruits', 'Fruits & Juice Ingredients', 'kg', 5, 6, 320, 0, 2],
    ['Pineapples', 'Fruits & Juice Ingredients', 'Pieces', 18, 6, 120, 0, 8],
    ['Avocados', 'Fruits & Juice Ingredients', 'Pieces', 10, 5, 90, 0, -1],
    ['Cake boxes', 'Packaging Materials', 'Pieces', 90, 30, 45, 0, 180],
    ['Juice bottles', 'Packaging Materials', 'Bottles', 140, 50, 35, 0, 240],
    ['Cups', 'Packaging Materials', 'Pieces', 260, 80, 8, 0, 300],
    ['Straws', 'Packaging Materials', 'Packets', 18, 6, 120, 0, 260],
    ['Labels', 'Packaging Materials', 'Packets', 12, 4, 180, 0, 400],
    ['Cleaning detergent', 'Cleaning & Supplies', 'Bottles', 8, 3, 260, 0, 220],
    ['Cakes', 'Finished Products', 'Pieces', 120, 4, 1800, 3200, 2],
    ['Cupcakes', 'Finished Products', 'Pieces', 300, 12, 110, 260, 2],
    ['Cake slices', 'Finished Products', 'Pieces', 180, 8, 220, 450, 1],
    ['Fresh juices', 'Finished Products', 'L', 150, 6, 280, 620, 1],
    ['Bottled juices', 'Finished Products', 'Bottles', 400, 20, 120, 280, 12],
  ]

  const itemsByKey = {}
  itemDefs.forEach(([name, category, unit, qty, minQty, cost, price, expiryIn], index) => {
    const id = `inv-${slug(name)}`
    const item = {
      id,
      code: `INV-${String(index + 1).padStart(4, '0')}`,
      name,
      category,
      description: `${name} — ${category.toLowerCase()}`,
      unit,
      quantity: qty,
      minQuantity: minQty,
      purchaseCost: cost,
      sellingPrice: price || null,
      expiryDate: expiryIn === 0 ? '' : daysAgo(-expiryIn),
      archived: false,
      createdAt: daysAgo(60),
      updatedAt: daysAgo(1, 14),
    }
    data.inventory.push(item)
    itemsByKey[name] = item
    data.movements.push({
      id: `mov_open_${index}`,
      itemId: id,
      type: 'Opening Stock',
      quantity: qty,
      previousQuantity: 0,
      newQuantity: qty,
      date: daysAgo(45, 7, 30),
      userId: 'user_owner',
      reason: 'Opening stock recorded during system setup',
      reference: 'OPENING-001',
    })
  })

  const supplierDefs = [
    ['Kamau Agro Supplies', 'Kamau Agro Ltd', '0722 418 990', 'orders@kamauagro.co.ke', 'Kikuyu, Kiambu', 'Flour, sugar and baking ingredients'],
    ['Lakeview Produce', 'Lakeview Produce Co.', '0733 620 114', 'sales@lakeviewproduce.co.ke', 'Nakuru', 'Fresh fruits and juice ingredients'],
    ['PackRight Kenya', 'PackRight Solutions', '0711 882 430', 'hello@packright.co.ke', 'Industrial Area, Nairobi', 'Cake boxes, bottles and labels'],
    ['Mama Mboga Foods', 'Mama Mboga Enterprises', '0705 227 881', '', 'Kisumu', 'Dairy, eggs and fresh produce'],
    ['Sweet Treats Depot', 'Sweet Treats Depot', '0728 991 220', 'supply@sweettreats.co.ke', 'Eastleigh, Nairobi', 'Chocolate, cocoa and specialty items'],
    ['Clear Water Distributors', 'Clear Water Distributors', '0736 110 442', '', 'Ruai, Nairobi', 'Water and cleaning supplies'],
  ]
  supplierDefs.forEach(([name, businessName, phone, email, location, description], index) => {
    data.suppliers.push({
      id: `sup-${index + 1}`,
      name,
      businessName,
      phone,
      email,
      location,
      description,
      status: 'Active',
      createdAt: daysAgo(190 - index * 8),
    })
  })

  const productDefs = [
    ['Birthday Cake', 'Cakes', 'Cakes', 1800, 3200, 'Custom celebration cake, 8 inch'],
    ['Chocolate Cake', 'Cakes', 'Cakes', 2100, 3600, 'Rich chocolate sponge with ganache'],
    ['Cupcake', 'Cupcakes', 'Cupcakes', 110, 260, 'Vanilla or chocolate cupcake'],
    ['Cake Slice', 'Cake Slices', 'Cake slices', 220, 450, 'Single slice of our signature cake'],
    ['Mango Juice', 'Fresh Juices', 'Fresh juices', 280, 620, 'Freshly squeezed mango juice, 1L'],
    ['Passion Juice', 'Fresh Juices', 'Fresh juices', 320, 680, 'Tangy passion fruit juice, 1L'],
    ['Bottled Mango Juice', 'Bottled Juices', 'Bottled juices', 120, 280, 'Chilled mango juice, 500ml'],
    ['Bottled Passion Juice', 'Bottled Juices', 'Bottled juices', 135, 300, 'Chilled passion juice, 500ml'],
  ]
  productDefs.forEach(([name, category, inventoryName, cost, price, description], index) => {
    data.products.push({
      id: `prod-${index + 1}`,
      sku: `PRD-${String(index + 1).padStart(3, '0')}`,
      name,
      category,
      description,
      cost,
      price,
      trackedItemId: itemsByKey[inventoryName]?.id || null,
      archived: false,
      createdAt: daysAgo(120),
    })
  })

  const applyMovement = (itemId, type, quantity, date, reason, reference) => {
    const item = data.inventory.find((i) => i.id === itemId)
    if (!item) return
    const previous = item.quantity
    item.quantity = round(previous + quantity, 2)
    item.updatedAt = date
    data.movements.push({
      id: `mov_${data.movements.length + 1}`,
      itemId,
      type,
      quantity,
      previousQuantity: previous,
      newQuantity: item.quantity,
      date,
      userId: pick(data.users).id,
      reason,
      reference,
    })
  }

  const purchaseItemPool = data.inventory.filter((i) => i.category !== 'Finished Products' && i.category !== 'Cleaning & Supplies')
  for (let i = 0; i < 16; i += 1) {
    const date = daysAgo(44 - i * 2 - between(0, 1), between(8, 16), between(0, 59))
    const chosen = [...purchaseItemPool].sort(() => rng() - 0.5).slice(0, between(1, 4))
    const lines = chosen.map((item) => {
      const qty = item.unit === 'kg' || item.unit === 'L' ? between(4, 18) : between(8, 40)
      const unitCost = round(item.purchaseCost * (0.92 + rng() * 0.16), 0)
      return { itemId: item.id, name: item.name, unit: item.unit, quantity: qty, unitCost, subtotal: qty * unitCost }
    })
    const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0)
    const discount = rng() < 0.3 ? round(subtotal * 0.02, 0) : 0
    const charges = rng() < 0.4 ? between(200, 600) : 0
    const total = subtotal - discount + charges
    const statusRoll = rng()
    const status = statusRoll < 0.58 ? 'Paid' : statusRoll < 0.86 ? 'Partially paid' : 'Unpaid'
    const paidAmount = status === 'Paid' ? total : status === 'Partially paid' ? round(total * (0.25 + rng() * 0.5), 0) : 0
    const reference = `PUR-${24001 + i}`
    const supplier = data.suppliers[between(0, data.suppliers.length - 1)]
    const purchase = {
      id: `pur-${i + 1}`,
      reference,
      supplierId: supplier.id,
      date,
      items: lines,
      subtotal,
      discount,
      charges,
      total,
      status,
      paidAmount,
      balance: total - paidAmount,
      payments: paidAmount
        ? [
            {
              id: `pay-${i + 1}`,
              amount: paidAmount,
              date: daysAgo(Math.max(0, 44 - i * 2 - 1), 12),
              method: pick(data.config.paymentMethods),
              reference: `PAY-${String(i + 1).padStart(4, '0')}`,
            },
          ]
        : [],
      notes: rng() < 0.35 ? 'Delivery received in good condition.' : '',
      voided: false,
      createdBy: pick(data.users).id,
      createdAt: date,
    }
    data.purchases.push(purchase)
    lines.forEach((line) => applyMovement(line.itemId, 'Purchase', line.quantity, date, `Purchase ${reference} from ${supplier.name}`, reference))
  }

  const salePaymentMethods = ['Cash', 'M-Pesa', 'M-Pesa', 'Cash', 'Bank Transfer']
  for (let i = 0; i < 92; i += 1) {
    const dayOffset = 29 - Math.floor(i / 3.2)
    const date = daysAgo(Math.max(0, dayOffset), between(8, 18), between(0, 59))
    const chosen = [...data.products].sort(() => rng() - 0.5).slice(0, between(1, 3))
    const voided = rng() < 0.022
    const lines = chosen
      .map((product) => {
        const available = product.trackedItemId
          ? data.inventory.find((item) => item.id === product.trackedItemId)?.quantity || 0
          : 99
        const maxQty = product.category === 'Cupcakes' || product.category.includes('Juice') ? 6 : 3
        const qty = Math.min(available, between(1, maxQty))
        return qty > 0
          ? {
              productId: product.id,
              name: product.name,
              quantity: qty,
              unitPrice: product.price,
              unitCost: product.cost,
              subtotal: qty * product.price,
            }
          : null
      })
      .filter(Boolean)
    if (!lines.length) continue

    const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0)
    const discount = rng() < 0.18 ? round(subtotal * (0.03 + rng() * 0.05), 0) : 0
    const reference = `SAL-${25001 + i}`
    data.sales.push({
      id: `sal-${i + 1}`,
      reference,
      date,
      items: lines,
      subtotal,
      discount,
      total: subtotal - discount,
      cost: lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0),
      paymentMethod: pick(salePaymentMethods),
      notes: '',
      voided,
      createdBy: pick(data.users).id,
      createdAt: date,
    })

    if (!voided) {
      lines.forEach((line) => {
        const product = data.products.find((p) => p.id === line.productId)
        if (product?.trackedItemId) {
          applyMovement(product.trackedItemId, 'Sale', -line.quantity, date, `Sale ${reference} — ${product.name}`, reference)
        }
      })
    }
  }

  const expenseDefs = [
    ['Rent', 'Monthly bakery premises rent', 42000],
    ['Salaries & Wages', 'Staff wages — weekly', 28500],
    ['Electricity', 'KPLC electricity bill', 9400],
    ['Water', 'Water bill', 2600],
    ['Internet', 'Business fibre connection', 3500],
    ['Transport', 'Delivery and collection transport', 1800],
    ['Cleaning Supplies', 'Cleaning materials', 1400],
    ['Repairs & Maintenance', 'Oven servicing', 7500],
    ['Other', 'Miscellaneous operating cost', 900],
  ]
  for (let i = 0; i < 42; i += 1) {
    const [category, description, base] = expenseDefs[between(0, expenseDefs.length - 1)]
    const amount = round(base * (0.85 + rng() * 0.35), 0)
    data.expenses.push({
      id: `exp-${i + 1}`,
      reference: `EXP-${26001 + i}`,
      category,
      description,
      amount,
      date: daysAgo(between(0, 30), between(8, 17), between(0, 59)),
      paymentMethod: pick(data.config.paymentMethods),
      notes: '',
      recordedBy: pick(data.users).id,
      createdAt: daysAgo(between(0, 30)),
    })
  }

  const productionDefs = [
    ['Birthday Cake', 'Cakes', 3],
    ['Chocolate Cake', 'Cakes', 2],
    ['Cupcake', 'Cupcakes', 24],
    ['Cake Slice', 'Cake Slices', 12],
    ['Mango Juice', 'Fresh Juices', 18],
    ['Passion Juice', 'Fresh Juices', 14],
    ['Bottled Mango Juice', 'Bottled Juices', 36],
    ['Bottled Passion Juice', 'Bottled Juices', 30],
  ]
  for (let i = 0; i < 36; i += 1) {
    const [product, category, base] = productionDefs[between(0, productionDefs.length - 1)]
    data.production.push({
      id: `prd-${i + 1}`,
      productName: product,
      category,
      quantity: Math.max(1, Math.round(base * (0.6 + rng() * 0.9))),
      date: daysAgo(between(0, 29), between(6, 14), between(0, 59)),
      description: `${product} prepared for daily sales`,
      notes: '',
      recordedBy: pick(data.users).id,
      createdAt: daysAgo(between(0, 29)),
    })
  }

  // Controlled corrections create clear low-stock, out-of-stock and expiry alerts for the demo.
  const corrections = [
    ['Butter', 5, 'Cycle count correction — lower than expected'],
    ['Cocoa powder', 2, 'Cycle count correction'],
    ['Passion fruits', 3, 'Quality check removed damaged fruit'],
    ['Pineapples', 0, 'Sold out — awaiting next delivery'],
    ['Juice bottles', 42, 'Stock count correction after delivery'],
    ['Cakes', 3, 'End-of-day finished stock count'],
    ['Cupcakes', 9, 'End-of-day finished stock count'],
    ['Cake slices', 6, 'End-of-day finished stock count'],
    ['Fresh juices', 4, 'End-of-day finished stock count'],
    ['Bottled juices', 18, 'End-of-day finished stock count'],
  ]
  corrections.forEach(([name, target, reason], index) => {
    const item = itemsByKey[name]
    if (!item || item.quantity === target) return
    applyMovement(item.id, 'Adjustment', target - item.quantity, daysAgo(index, 16, 30), reason, `ADJ-${String(index + 1).padStart(3, '0')}`)
  })

  // A little recorded wastage keeps the movement history realistic.
  ;[
    ['Mangoes', 4, 'Overripe fruit discarded'],
    ['Cake slices', 2, 'Damaged during display change'],
    ['Milk', 3, 'Soured before use'],
  ].forEach(([name, qty, reason], index) => {
    applyMovement(itemsByKey[name].id, 'Wastage', -qty, daysAgo(index + 2, 17), reason, `WST-${String(index + 1).padStart(3, '0')}`)
  })

  data.movements.sort((a, b) => new Date(b.date) - new Date(a.date))
  data.purchases.sort((a, b) => new Date(b.date) - new Date(a.date))
  data.sales.sort((a, b) => new Date(b.date) - new Date(a.date))
  data.expenses.sort((a, b) => new Date(b.date) - new Date(a.date))
  data.production.sort((a, b) => new Date(b.date) - new Date(a.date))

  const auditDefs = [
    ['USER_LOGIN', 'User', 'Owner signed in'],
    ['PURCHASE_CREATED', 'Purchase', 'Purchase PUR-24016 confirmed'],
    ['SALE_RECORDED', 'Sale', 'Sale SAL-25092 recorded'],
    ['STOCK_ADJUSTED', 'Inventory', 'Cupcakes stock corrected'],
    ['EXPENSE_RECORDED', 'Expense', 'Electricity expense recorded'],
    ['SETTINGS_UPDATED', 'Settings', 'Expiry warning period updated to 14 days'],
    ['USER_CREATED', 'User', 'Staff account created for Wanjiku Njeri'],
  ]
  auditDefs.forEach(([action, entity, details], index) => {
    data.auditLogs.push({
      id: `audit-${index + 1}`,
      action,
      entity,
      details,
      userId: index === 6 ? 'user_owner' : pick(data.users).id,
      date: daysAgo(index * 2, 11, 15),
    })
  })

  return data
}
