import { useMemo, useState } from 'react'
import { supplierBalances } from '../../lib/analytics'
import { useStore } from '../../lib/store'
import { formatDate, inRange, money, number, periodRange } from '../../lib/format'
import ReportShell from '../../components/ReportShell'
import { Badge, Card, SectionHeading, StatCard, StatusPill } from '../../components/ui'

export default function PurchaseReport() {
  const { data } = useStore()
  const [period, setPeriod] = useState('30d')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [supplier, setSupplier] = useState('all')
  const range = useMemo(() => periodRange(period, custom), [period, custom])
  const balances = useMemo(() => supplierBalances(data), [data])
  const purchases = useMemo(() => data.purchases.filter((purchase) => inRange(purchase.date, range) && (supplier === 'all' || purchase.supplierId === supplier)), [data.purchases, range, supplier])
  const active = purchases.filter((purchase) => !purchase.voided)

  const totals = useMemo(() => ({
    total: active.reduce((sum, purchase) => sum + purchase.total, 0),
    paid: active.reduce((sum, purchase) => sum + purchase.paidAmount, 0),
    balance: active.reduce((sum, purchase) => sum + purchase.balance, 0),
  }), [active])

  const supplierName = (id) => data.suppliers.find((entry) => entry.id === id)?.name || '—'

  const csvRows = purchases.map((purchase) => ({
    Reference: purchase.reference, Date: new Date(purchase.date).toLocaleDateString('en-KE'),
    Supplier: supplierName(purchase.supplierId), Items: purchase.items.map((line) => `${line.name} × ${line.quantity}`).join('; '),
    Subtotal: purchase.subtotal, Discount: purchase.discount, Charges: purchase.charges,
    Total: purchase.total, Paid: purchase.paidAmount, Balance: purchase.balance, Status: purchase.status,
  }))

  return (
    <ReportShell
      title="Purchase Reports"
      subtitle="Supplier spending, payment progress and purchase history."
      period={period} onPeriodChange={setPeriod} custom={custom} onCustomChange={setCustom}
      filters={
        <select className="input w-auto py-2" value={supplier} onChange={(event) => setSupplier(event.target.value)}>
          <option value="all">All suppliers</option>
          {data.suppliers.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      }
      rows={csvRows} filename="purchase-report"
    >
      <div className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total purchases" value={money(totals.total)} hint={`${active.length} purchases`} tone="bakery" />
          <StatCard label="Paid" value={money(totals.paid)} tone="leaf" />
          <StatCard label="Outstanding" value={money(totals.balance)} tone="red" />
          <StatCard label="Suppliers" value={number(new Set(purchases.map((purchase) => purchase.supplierId)).size)} tone="slate" />
        </div>

        <Card className="p-5">
          <SectionHeading title="Supplier spend and balances" subtitle="Across all recorded purchases" />
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Supplier</th><th>Purchases</th><th>Total spend</th><th>Paid</th><th>Balance</th></tr></thead>
              <tbody>
                {balances.map(({ supplier: entry, purchases: count, total, paid, balance }) => (
                  <tr key={entry.id}>
                    <td className="font-semibold">{entry.name}</td>
                    <td className="text-muted">{count}</td>
                    <td className="num">{money(total)}</td>
                    <td className="num text-leaf-600">{money(paid)}</td>
                    <td className={`num font-semibold ${balance > 0 ? 'text-red-600' : ''}`}>{money(balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <div className="border-b border-line px-5 py-4"><h2 className="font-display text-lg font-semibold">Purchase history</h2><p className="text-xs text-muted">{purchases.length} records</p></div>
          <div className="table-wrap m-4">
            <table className="data-table">
              <thead><tr><th>Reference</th><th>Date</th><th>Supplier</th><th>Items</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
              <tbody>
                {purchases.map((purchase) => (
                  <tr key={purchase.id}>
                    <td className="font-semibold">{purchase.reference}</td>
                    <td className="whitespace-nowrap text-xs text-muted">{formatDate(purchase.date)}</td>
                    <td>{supplierName(purchase.supplierId)}</td>
                    <td className="text-muted">{purchase.items.length}</td>
                    <td className="num font-semibold">{money(purchase.total)}</td>
                    <td className="num text-leaf-600">{money(purchase.paidAmount)}</td>
                    <td className="num text-red-600">{money(purchase.balance)}</td>
                    <td><StatusPill status={purchase.voided ? 'Voided' : purchase.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeading title="Expenditure notes" />
          <p className="text-sm leading-relaxed text-muted">
            Purchase totals are recorded as inventory acquisitions, not operating expenses. This keeps profit calculations accurate: goods bought in a period are not automatically treated as goods consumed in that same period.
          </p>
          <Badge tone="leaf" className="mt-3">Cost accounting rule applied</Badge>
        </Card>
      </div>
    </ReportShell>
  )
}
