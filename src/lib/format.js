export const uid = (prefix = 'id') =>
  `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`

export const today = () => new Date().toISOString().slice(0, 10)

export const dateOnly = (value) => {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

export const formatDate = (value, options = { day: 'numeric', month: 'short', year: 'numeric' }) => {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('en-KE', options).format(d)
}

export const formatDateTime = (value) =>
  formatDate(value, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export const formatTime = (value) => formatDate(value, { hour: '2-digit', minute: '2-digit' })

export const relativeTime = (value) => {
  if (!value) return '—'
  const then = new Date(value).getTime()
  const diff = Date.now() - then
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(value, { day: 'numeric', month: 'short' })
}

export const money = (amount, currency = 'KES') => {
  const value = Number(amount) || 0
  try {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency,
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value)
  } catch {
    return `${currency} ${value.toLocaleString('en-KE')}`
  }
}

export const compactMoney = (amount, currency = 'KES') => {
  const value = Number(amount) || 0
  const symbol = currency === 'KES' ? 'KSh' : `${currency} `
  if (Math.abs(value) >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}m`
  if (Math.abs(value) >= 1_000) return `${symbol}${(value / 1_000).toFixed(1)}k`
  return `${symbol}${value.toFixed(0)}`
}

export const number = (value, digits = 0) =>
  new Intl.NumberFormat('en-KE', { maximumFractionDigits: digits }).format(Number(value) || 0)

export const percent = (value, digits = 1) => `${(Number(value) || 0).toFixed(digits)}%`

export const addDays = (date, days) => {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export const startOfDay = (date) => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export const endOfDay = (date) => {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

export const periodRange = (period, custom = {}) => {
  const now = new Date()
  const end = endOfDay(now)
  let start = startOfDay(now)

  switch (period) {
    case 'today':
      break
    case 'yesterday':
      start = startOfDay(addDays(now, -1))
      end.setTime(endOfDay(addDays(now, -1)).getTime())
      break
    case '7d':
      start = startOfDay(addDays(now, -6))
      break
    case '30d':
      start = startOfDay(addDays(now, -29))
      break
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      break
    case 'lastMonth':
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      end.setTime(endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)).getTime())
      break
    case 'custom':
      start = custom.from ? startOfDay(custom.from) : start
      if (custom.to) end.setTime(endOfDay(custom.to).getTime())
      break
    default:
      start = startOfDay(addDays(now, -29))
  }

  return { start, end }
}

export const inRange = (value, range) => {
  const t = new Date(value).getTime()
  return t >= range.start.getTime() && t <= range.end.getTime()
}

export const daysUntil = (value) => {
  if (!value) return null
  const expiry = startOfDay(value)
  const todayStart = startOfDay(new Date())
  return Math.round((expiry - todayStart) / 86400000)
}

export const itemStatus = (item, warningDays = 14) => {
  if (item.archived) return 'archived'
  if (Number(item.quantity) <= 0) return 'out'
  const expiryIn = daysUntil(item.expiryDate)
  if (expiryIn !== null && expiryIn < 0) return 'expired'
  if (Number(item.quantity) <= Number(item.minQuantity || 0)) return 'low'
  if (expiryIn !== null && expiryIn <= warningDays) return 'expiring'
  return 'healthy'
}

export const statusLabel = {
  healthy: 'In stock',
  low: 'Low stock',
  out: 'Out of stock',
  expiring: 'Expiring soon',
  expired: 'Expired',
  archived: 'Archived',
}

/** Neutralise spreadsheet formula injection and control characters in CSV cells. */
export const csvCell = (value) => {
  let raw = String(value ?? '').replace(/\r|\n|\t/g, ' ')
  while (raw.length && raw.charCodeAt(0) < 32) raw = raw.slice(1)
  const formulaLike = /^[=+@]/.test(raw) || (/^-/.test(raw) && !/^-?\d+(\.\d+)?$/.test(raw))
  const safe = formulaLike ? `'${raw}` : raw
  return `"${safe.replace(/"/g, '""')}"`
}

export const downloadCSV = (filename, rows) => {
  if (!rows?.length) return
  const headers = Object.keys(rows[0])
  const content = [headers.map(csvCell).join(','), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(','))].join('\n')
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
