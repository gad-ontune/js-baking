import { addDays, daysUntil, inRange, itemStatus, periodRange, startOfDay } from './format'

const validSales = (data) => data.sales.filter((sale) => !sale.voided)
const validExpenses = (data) => data.expenses.filter((expense) => !expense.reversed)
const validPurchases = (data) => data.purchases.filter((purchase) => !purchase.voided)

export function salesInRange(data, range) {
  return validSales(data).filter((sale) => inRange(sale.date, range))
}

export function expensesInRange(data, range) {
  return validExpenses(data).filter((expense) => inRange(expense.date, range))
}

export function purchasesInRange(data, range) {
  return validPurchases(data).filter((purchase) => inRange(purchase.date, range))
}

export function financialSummary(data, range) {
  const sales = salesInRange(data, range)
  const expenses = expensesInRange(data, range)
  const revenue = sales.reduce((sum, sale) => sum + sale.total, 0)
  const cogs = sales.reduce((sum, sale) => sum + (sale.cost || 0), 0)
  const operatingExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0)
  const costCoverage = revenue > 0 ? cogs / revenue : 0
  const grossProfit = revenue - cogs
  const netProfit = grossProfit - operatingExpenses

  return {
    revenue,
    cogs,
    grossProfit,
    operatingExpenses,
    netProfit,
    grossMargin: revenue ? (grossProfit / revenue) * 100 : 0,
    netMargin: revenue ? (netProfit / revenue) * 100 : 0,
    salesCount: sales.length,
    expenseCount: expenses.length,
    costCoverage,
    costComplete: costCoverage > 0.05,
    basis: costCoverage > 0.05 ? 'Based on recorded product costs' : 'Estimated — product costs incomplete',
  }
}

export function salesByProduct(data, range) {
  const map = new Map()
  salesInRange(data, range).forEach((sale) => {
    sale.items.forEach((line) => {
      const entry = map.get(line.name) || { name: line.name, quantity: 0, revenue: 0, cost: 0, orders: 0 }
      entry.quantity += line.quantity
      entry.revenue += line.subtotal
      entry.cost += line.quantity * (line.unitCost || 0)
      entry.orders += 1
      map.set(line.name, entry)
    })
  })
  return [...map.values()].map((entry) => ({
    ...entry,
    profit: entry.revenue - entry.cost,
    margin: entry.revenue ? ((entry.revenue - entry.cost) / entry.revenue) * 100 : 0,
  })).sort((a, b) => b.revenue - a.revenue)
}

export function expensesByCategory(data, range) {
  const map = new Map()
  expensesInRange(data, range).forEach((expense) => {
    map.set(expense.category, (map.get(expense.category) || 0) + expense.amount)
  })
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

export function salesByPaymentMethod(data, range) {
  const map = new Map()
  salesInRange(data, range).forEach((sale) => {
    map.set(sale.paymentMethod, (map.get(sale.paymentMethod) || 0) + sale.total)
  })
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

export function dailySeries(data, range) {
  const start = startOfDay(range.start)
  const end = startOfDay(range.end)
  const days = Math.round((end - start) / 86400000)
  const step = days > 45 ? Math.ceil(days / 30) : 1
  const buckets = new Map()

  const keyFor = (date) => {
    const d = startOfDay(date)
    const offset = Math.round((d - start) / 86400000)
    const bucketIndex = Math.max(0, Math.floor(offset / step))
    return bucketIndex
  }

  for (let index = 0; index <= days; index += step) {
    const date = addDays(start, index)
    buckets.set(index / step, {
      label: step === 1
        ? new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short' }).format(date)
        : new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short' }).format(date),
      date: date.toISOString(),
      revenue: 0,
      expenses: 0,
      profit: 0,
      sales: 0,
    })
  }

  salesInRange(data, range).forEach((sale) => {
    const bucket = buckets.get(keyFor(sale.date))
    if (bucket) {
      bucket.revenue += sale.total
      bucket.profit += sale.total - (sale.cost || 0)
      bucket.sales += 1
    }
  })

  expensesInRange(data, range).forEach((expense) => {
    const bucket = buckets.get(keyFor(expense.date))
    if (bucket) {
      bucket.expenses += expense.amount
      bucket.profit -= expense.amount
    }
  })

  return [...buckets.values()].map((bucket) => ({
    ...bucket,
    revenue: Math.round(bucket.revenue),
    expenses: Math.round(bucket.expenses),
    profit: Math.round(bucket.profit),
  }))
}

export function inventorySummary(data) {
  const active = data.inventory.filter((item) => !item.archived)
  const warningDays = data.business.expiryWarningDays || 14
  const statuses = active.map((item) => itemStatus(item, warningDays))
  return {
    total: active.length,
    low: statuses.filter((status) => status === 'low').length,
    out: statuses.filter((status) => status === 'out').length,
    expiring: statuses.filter((status) => status === 'expiring').length,
    expired: statuses.filter((status) => status === 'expired').length,
    value: active.reduce((sum, item) => sum + item.quantity * item.purchaseCost, 0),
    active,
  }
}

export function inventoryAlerts(data) {
  const warningDays = data.business.expiryWarningDays || 14
  return data.inventory
    .filter((item) => !item.archived)
    .map((item) => {
      const status = itemStatus(item, warningDays)
      const expiryIn = daysUntil(item.expiryDate)
      let severity = 'info'
      let title = ''
      let detail = ''

      if (status === 'out') {
        severity = 'critical'
        title = 'Out of stock'
        detail = `${item.name} has no available stock.`
      } else if (status === 'expired') {
        severity = 'critical'
        title = 'Expired item'
        detail = `${item.name} expired ${Math.abs(expiryIn)} day${Math.abs(expiryIn) === 1 ? '' : 's'} ago.`
      } else if (status === 'low') {
        severity = 'warning'
        title = 'Low stock'
        detail = `${item.name} is at ${item.quantity} ${item.unit} (minimum ${item.minQuantity}).`
      } else if (status === 'expiring') {
        severity = 'warning'
        title = 'Expiring soon'
        detail = `${item.name} expires in ${expiryIn} day${expiryIn === 1 ? '' : 's'}.`
      }
      return title ? { id: item.id, itemId: item.id, severity, title, detail, status, item } : null
    })
    .filter(Boolean)
    .sort((a, b) => (a.severity === 'critical' ? -1 : 1) - (b.severity === 'critical' ? -1 : 1))
}

export function inventoryByCategory(data) {
  const map = new Map()
  data.inventory.filter((item) => !item.archived).forEach((item) => {
    const value = item.quantity * item.purchaseCost
    map.set(item.category, (map.get(item.category) || 0) + value)
  })
  return [...map.entries()].map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value)
}

export function recentActivity(data, limit = 8) {
  const activities = []
  data.purchases.forEach((purchase) => activities.push({
    id: `purchase-${purchase.id}`,
    type: 'purchase',
    title: `Purchase ${purchase.reference}`,
    subtitle: data.suppliers.find((s) => s.id === purchase.supplierId)?.name || 'Supplier',
    amount: purchase.total,
    date: purchase.date,
  }))
  data.sales.filter((sale) => !sale.voided).forEach((sale) => activities.push({
    id: `sale-${sale.id}`,
    type: 'sale',
    title: `Sale ${sale.reference}`,
    subtitle: `${sale.items.length} item${sale.items.length === 1 ? '' : 's'} · ${sale.paymentMethod}`,
    amount: sale.total,
    date: sale.date,
  }))
  data.expenses.forEach((expense) => activities.push({
    id: `expense-${expense.id}`,
    type: 'expense',
    title: expense.description,
    subtitle: expense.category,
    amount: -expense.amount,
    date: expense.date,
  }))
  data.movements.filter((m) => ['Adjustment', 'Wastage'].includes(m.type)).forEach((movement) => activities.push({
    id: `movement-${movement.id}`,
    type: 'adjustment',
    title: `${movement.type} — ${data.inventory.find((i) => i.id === movement.itemId)?.name || 'Item'}`,
    subtitle: movement.reason,
    amount: null,
    date: movement.date,
  }))
  data.production.forEach((record) => activities.push({
    id: `production-${record.id}`,
    type: 'production',
    title: `${record.quantity} × ${record.productName}`,
    subtitle: 'Production recorded',
    amount: null,
    date: record.date,
  }))
  return activities.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, limit)
}

export function supplierBalances(data) {
  return data.suppliers.map((supplier) => {
    const purchases = data.purchases.filter((p) => p.supplierId === supplier.id && !p.voided)
    const total = purchases.reduce((sum, p) => sum + p.total, 0)
    const paid = purchases.reduce((sum, p) => sum + p.paidAmount, 0)
    return {
      supplier,
      purchases: purchases.length,
      total,
      paid,
      balance: total - paid,
    }
  }).sort((a, b) => b.balance - a.balance)
}

export function productionSummary(data, range) {
  const records = data.production.filter((record) => !record.reversed && inRange(record.date, range))
  const byProduct = new Map()
  records.forEach((record) => {
    const entry = byProduct.get(record.productName) || { name: record.productName, quantity: 0, records: 0 }
    entry.quantity += record.quantity
    entry.records += 1
    byProduct.set(record.productName, entry)
  })
  return {
    totalUnits: records.reduce((sum, record) => sum + record.quantity, 0),
    recordCount: records.length,
    byProduct: [...byProduct.values()].sort((a, b) => b.quantity - a.quantity),
    records,
  }
}

export function periodLabel(period, custom = {}) {
  const range = periodRange(period, custom)
  const format = (date) => new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
  if (period === 'today') return `Today · ${format(range.start)}`
  if (period === 'yesterday') return `Yesterday · ${format(range.start)}`
  if (period === 'custom') return `${format(range.start)} – ${format(range.end)}`
  return `${format(range.start)} – ${format(range.end)}`
}
