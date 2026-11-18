import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { productionSummary } from '../../lib/analytics'
import { useStore } from '../../lib/store'
import { formatDate, inRange, number, periodRange } from '../../lib/format'
import ReportShell from '../../components/ReportShell'
import { Badge, Card, EmptyState, SectionHeading, StatCard } from '../../components/ui'

export default function ProductionReport() {
  const { data } = useStore()
  const [period, setPeriod] = useState('30d')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const range = useMemo(() => periodRange(period, custom), [period, custom])
  const summary = useMemo(() => productionSummary(data, range), [data, range])

  const byDate = useMemo(() => {
    const map = new Map()
    summary.records.forEach((record) => {
      const key = formatDate(record.date, { day: 'numeric', month: 'short' })
      map.set(key, (map.get(key) || 0) + record.quantity)
    })
    return [...map.entries()].map(([name, value]) => ({ name, value })).slice(0, 30)
  }, [summary.records])

  const csvRows = summary.records.map((record) => ({
    Date: new Date(record.date).toLocaleDateString('en-KE'), Product: record.productName,
    Category: record.category, Quantity: record.quantity, Description: record.description,
    'Recorded by': data.users.find((user) => user.id === record.recordedBy)?.name || 'System',
  }))

  return (
    <ReportShell
      title="Production Reports"
      subtitle="What the bakery prepared, by product and by date."
      period={period} onPeriodChange={setPeriod} custom={custom} onCustomChange={setCustom}
      rows={csvRows} filename="production-report"
    >
      <div className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total units produced" value={number(summary.totalUnits)} tone="bakery" />
          <StatCard label="Production records" value={number(summary.recordCount)} tone="slate" />
          <StatCard label="Products recorded" value={number(summary.byProduct.length)} tone="amber" />
          <StatCard label="Top product" value={summary.byProduct[0]?.name || '—'} hint={summary.byProduct[0] ? `${number(summary.byProduct[0].quantity)} units` : ''} tone="leaf" />
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <SectionHeading title="Production by product" />
            <div className="h-72">
              {summary.byProduct.length ? <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.byProduct.slice(0, 8)} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0EAE2" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#7A6F66' }} axisLine={false} tickLine={false} interval={0} angle={-18} textAnchor="end" height={52} />
                  <YAxis tick={{ fontSize: 11, fill: '#7A6F66' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ border: '1px solid #E9E1D7', borderRadius: 12, fontSize: 12 }} formatter={(value) => [`${value} units`, 'Produced']} cursor={{ fill: '#FBF5EE' }} />
                  <Bar dataKey="quantity" fill="#CB8659" radius={[5, 5, 0, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer> : <EmptyState title="No production data" />}
            </div>
          </Card>
          <Card className="p-5">
            <SectionHeading title="Production by date" />
            <div className="h-72">
              {byDate.length ? <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byDate} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0EAE2" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#7A6F66' }} axisLine={false} tickLine={false} minTickGap={16} />
                  <YAxis tick={{ fontSize: 11, fill: '#7A6F66' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ border: '1px solid #E9E1D7', borderRadius: 12, fontSize: 12 }} formatter={(value) => [`${value} units`, 'Produced']} cursor={{ fill: '#FBF5EE' }} />
                  <Bar dataKey="value" fill="#7F4328" radius={[5, 5, 0, 0]} barSize={22} />
                </BarChart>
              </ResponsiveContainer> : <EmptyState title="No production data" />}
            </div>
          </Card>
        </div>

        <Card>
          <div className="border-b border-line px-5 py-4"><h2 className="font-display text-lg font-semibold">Production records</h2><p className="text-xs text-muted">{summary.records.length} records</p></div>
          <div className="table-wrap m-4">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Product</th><th>Category</th><th>Quantity</th><th>Description</th><th>Recorded by</th></tr></thead>
              <tbody>
                {summary.records.map((record) => (
                  <tr key={record.id}>
                    <td className="whitespace-nowrap text-xs text-muted">{formatDate(record.date)}</td>
                    <td className="font-semibold">{record.productName}</td>
                    <td><Badge tone="bakery">{record.category}</Badge></td>
                    <td className="num font-semibold">{number(record.quantity)}</td>
                    <td className="max-w-[260px] truncate text-xs text-muted">{record.description || '—'}</td>
                    <td className="text-xs text-muted">{data.users.find((user) => user.id === record.recordedBy)?.name || 'System'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </ReportShell>
  )
}
