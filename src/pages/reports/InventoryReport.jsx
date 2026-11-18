import { useMemo, useState } from 'react'
import { inventoryByCategory, inventorySummary } from '../../lib/analytics'
import { useStore } from '../../lib/store'
import { daysUntil, formatDate, inRange, itemStatus, money, number, periodRange } from '../../lib/format'
import ReportShell from '../../components/ReportShell'
import { Badge, Card, EmptyState, SectionHeading, StatCard, StatusPill } from '../../components/ui'

export default function InventoryReport() {
  const { data } = useStore()
  const [period, setPeriod] = useState('30d')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [category, setCategory] = useState('all')
  const range = useMemo(() => periodRange(period, custom), [period, custom])
  const summary = useMemo(() => inventorySummary(data), [data])
  const categoryData = useMemo(() => inventoryByCategory(data), [data])
  const warningDays = data.business.expiryWarningDays || 14

  const items = useMemo(() => data.inventory.filter((item) => !item.archived && (category === 'all' || item.category === category)), [data.inventory, category])
  const movements = useMemo(() => data.movements.filter((movement) => inRange(movement.date, range)), [data.movements, range])
  const nameOf = (id) => data.inventory.find((item) => item.id === id)?.name || 'Unknown'

  const csvRows = [
    ...items.map((item) => ({
      Section: 'Current stock', Code: item.code, Item: item.name, Category: item.category,
      Quantity: item.quantity, Unit: item.unit, 'Unit cost': item.purchaseCost,
      Value: item.quantity * item.purchaseCost, Status: itemStatus(item, warningDays), 'Expiry date': item.expiryDate || '',
    })),
    ...movements.map((movement) => ({
      Section: 'Movement', Code: movement.reference, Item: nameOf(movement.itemId), Category: '',
      Quantity: movement.quantity, Unit: '', 'Unit cost': '', Value: '', Status: movement.type,
      'Expiry date': new Date(movement.date).toLocaleString('en-KE'),
    })),
  ]

  return (
    <ReportShell
      title="Inventory Reports"
      subtitle="Current stock levels, valuation and every recorded movement."
      period={period} onPeriodChange={setPeriod} custom={custom} onCustomChange={setCustom}
      filters={
        <select className="input w-auto py-2" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="all">All categories</option>
          {data.config.inventoryCategories.map((value) => <option key={value}>{value}</option>)}
        </select>
      }
      rows={csvRows} filename="inventory-report"
    >
      <div className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Active items" value={number(summary.total)} tone="bakery" />
          <StatCard label="Inventory value" value={money(summary.value)} tone="leaf" />
          <StatCard label="Low stock" value={number(summary.low)} tone="amber" />
          <StatCard label="Out of stock" value={number(summary.out)} tone="red" />
          <StatCard label="Expiry watch" value={number(summary.expiring + summary.expired)} tone="amber" />
        </div>

        <Card className="p-5">
          <SectionHeading title="Stock value by category" />
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Category</th><th>Value</th><th>Share</th></tr></thead>
              <tbody>
                {categoryData.map((entry) => (
                  <tr key={entry.name}><td className="font-semibold">{entry.name}</td><td className="num">{money(entry.value)}</td><td className="num text-muted">{summary.value ? ((entry.value / summary.value) * 100).toFixed(1) : 0}%</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <div className="border-b border-line px-5 py-4"><h2 className="font-display text-lg font-semibold">Current inventory levels</h2><p className="text-xs text-muted">{items.length} items</p></div>
          <div className="table-wrap m-4">
            <table className="data-table">
              <thead><tr><th>Code</th><th>Item</th><th>Category</th><th>Quantity</th><th>Unit cost</th><th>Value</th><th>Expiry</th><th>Status</th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="text-xs text-muted">{item.code}</td>
                    <td className="font-semibold">{item.name}</td>
                    <td className="text-xs text-muted">{item.category}</td>
                    <td className="num">{number(item.quantity, 2)} {item.unit}</td>
                    <td className="num">{money(item.purchaseCost)}</td>
                    <td className="num font-semibold">{money(item.quantity * item.purchaseCost)}</td>
                    <td className="whitespace-nowrap text-xs text-muted">{item.expiryDate ? `${formatDate(item.expiryDate)} (${daysUntil(item.expiryDate)}d)` : '—'}</td>
                    <td><StatusPill status={itemStatus(item, warningDays)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <div className="border-b border-line px-5 py-4"><h2 className="font-display text-lg font-semibold">Stock movements</h2><p className="text-xs text-muted">{movements.length} records in selected period</p></div>
          {movements.length ? (
            <div className="table-wrap m-4">
              <table className="data-table">
                <thead><tr><th>Date</th><th>Item</th><th>Type</th><th>Quantity</th><th>Previous</th><th>New</th><th>Reason</th></tr></thead>
                <tbody>
                  {movements.slice(0, 80).map((movement) => (
                    <tr key={movement.id}>
                      <td className="whitespace-nowrap text-xs text-muted">{formatDate(movement.date, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="font-semibold">{nameOf(movement.itemId)}</td>
                      <td><Badge tone={movement.quantity >= 0 ? 'leaf' : 'amber'}>{movement.type}</Badge></td>
                      <td className="num font-semibold">{movement.quantity > 0 ? '+' : ''}{number(movement.quantity, 2)}</td>
                      <td className="num text-muted">{number(movement.previousQuantity, 2)}</td>
                      <td className="num">{number(movement.newQuantity, 2)}</td>
                      <td className="max-w-[220px] truncate text-xs text-muted">{movement.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="No movements in this period" />}
        </Card>
      </div>
    </ReportShell>
  )
}
