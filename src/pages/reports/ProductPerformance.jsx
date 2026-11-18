import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { financialSummary, salesByProduct } from '../../lib/analytics'
import { useStore } from '../../lib/store'
import { compactMoney, money, number, periodRange } from '../../lib/format'
import ReportShell from '../../components/ReportShell'
import { Badge, Card, EmptyState, SectionHeading, StatCard } from '../../components/ui'

export default function ProductPerformance() {
  const { data } = useStore()
  const [period, setPeriod] = useState('30d')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const range = useMemo(() => periodRange(period, custom), [period, custom])
  const products = useMemo(() => salesByProduct(data, range), [data, range])
  const summary = useMemo(() => financialSummary(data, range), [data, range])
  const best = products.slice(0, 3)
  const least = [...products].sort((a, b) => a.revenue - b.revenue).slice(0, 3)

  const csvRows = products.map((product) => ({
    Product: product.name, 'Units sold': product.quantity, Orders: product.orders,
    Revenue: product.revenue, 'Recorded cost': product.cost, Profit: product.profit, 'Margin %': product.margin.toFixed(1),
  }))

  return (
    <ReportShell
      title="Product Performance"
      subtitle="Which products sell, earn and need attention."
      period={period} onPeriodChange={setPeriod} custom={custom} onCustomChange={setCustom}
      rows={csvRows} filename="product-performance"
    >
      <div className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Products sold" value={number(products.length)} tone="bakery" />
          <StatCard label="Units sold" value={number(products.reduce((sum, product) => sum + product.quantity, 0))} tone="leaf" />
          <StatCard label="Top product" value={best[0]?.name || '—'} hint={best[0] ? money(best[0].revenue) : ''} tone="amber" />
          <StatCard label="Product profit" value={money(products.reduce((sum, product) => sum + product.profit, 0))} hint={summary.basis} tone="leaf" />
        </div>

        <Card className="p-5">
          <SectionHeading title="Revenue by product" subtitle="Best sellers ranked by recorded revenue" />
          <div className="h-80">
            {products.length ? <ResponsiveContainer width="100%" height="100%">
              <BarChart data={products.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 18, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F0EAE2" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#7A6F66' }} axisLine={false} tickLine={false} tickFormatter={compactMoney} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: '#5C5149' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ border: '1px solid #E9E1D7', borderRadius: 12, fontSize: 12 }} formatter={(value) => money(value)} cursor={{ fill: '#FBF5EE' }} />
                <Bar dataKey="revenue" fill="#B66D3F" radius={[0, 5, 5, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer> : <EmptyState title="No product sales in this period" />}
          </div>
        </Card>

        <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
          <Card>
            <div className="border-b border-line px-5 py-4"><h2 className="font-display text-lg font-semibold">Detailed product performance</h2></div>
            <div className="table-wrap m-4">
              <table className="data-table">
                <thead><tr><th>Product</th><th>Units sold</th><th>Orders</th><th>Revenue</th><th>Recorded cost</th><th>Profit</th><th>Margin</th></tr></thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.name}>
                      <td className="font-semibold">{product.name}</td>
                      <td className="num">{number(product.quantity)}</td>
                      <td className="num text-muted">{number(product.orders)}</td>
                      <td className="num font-semibold">{money(product.revenue)}</td>
                      <td className="num">{money(product.cost)}</td>
                      <td className={`num font-semibold ${product.profit >= 0 ? 'text-leaf-600' : 'text-red-600'}`}>{money(product.profit)}</td>
                      <td><Badge tone={product.margin >= 30 ? 'leaf' : product.margin >= 15 ? 'amber' : 'red'}>{product.margin.toFixed(1)}%</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card className="p-5">
            <SectionHeading title="Quick insights" />
            <div className="space-y-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-leaf-700">Best sellers</p>
                <div className="mt-2 space-y-2">
                  {best.map((product, index) => <div key={product.name} className="flex items-center justify-between text-sm"><span className="text-muted">{index + 1}. {product.name}</span><span className="num font-semibold">{number(product.quantity)}</span></div>)}
                </div>
              </div>
              <div className="border-t border-line pt-4">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Least selling</p>
                <div className="mt-2 space-y-2">
                  {least.map((product) => <div key={product.name} className="flex items-center justify-between text-sm"><span className="text-muted">{product.name}</span><span className="num font-semibold">{number(product.quantity)}</span></div>)}
                </div>
              </div>
              <div className="rounded-xl bg-bakery-50 p-3 text-xs text-bakery-900">
                Profit per product uses each product's configured cost. Products without a recorded cost are flagged as estimates in the profit basis above.
              </div>
            </div>
          </Card>
        </div>
      </div>
    </ReportShell>
  )
}
