import { useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { financialSummary, expensesInRange, salesByPaymentMethod, salesInRange } from '../../lib/analytics'
import { useStore as useStoreForData } from '../../lib/store'
import { compactMoney, formatDate, money, periodRange } from '../../lib/format'
import ReportShell from '../../components/ReportShell'
import { Badge, Card, EmptyState, SectionHeading, StatCard } from '../../components/ui'

const tooltipStyle = { border: '1px solid #E9E1D7', borderRadius: 12, fontSize: 12 }

export default function FinancialReport() {
  const { data } = useStoreForData()
  const [period, setPeriod] = useState('30d')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const range = useMemo(() => periodRange(period, custom), [period, custom])
  const summary = useMemo(() => financialSummary(data, range), [data, range])
  const sales = useMemo(() => salesInRange(data, range), [data, range])
  const expenses = useMemo(() => expensesInRange(data, range), [data, range])
  const paymentMethods = useMemo(() => salesByPaymentMethod(data, range), [data, range])

  const series = useMemo(() => {
    const map = new Map()
    sales.forEach((sale) => {
      const key = formatDate(sale.date, { day: 'numeric', month: 'short' })
      const entry = map.get(key) || { label: key, revenue: 0, cogs: 0, expenses: 0, profit: 0 }
      entry.revenue += sale.total
      entry.cogs += sale.cost || 0
      entry.profit += sale.total - (sale.cost || 0)
      map.set(key, entry)
    })
    expenses.forEach((expense) => {
      const key = formatDate(expense.date, { day: 'numeric', month: 'short' })
      const entry = map.get(key) || { label: key, revenue: 0, cogs: 0, expenses: 0, profit: 0 }
      entry.expenses += expense.amount
      entry.profit -= expense.amount
      map.set(key, entry)
    })
    return [...map.values()].slice(0, 30)
  }, [sales, expenses])

  const expenseByCategory = useMemo(() => {
    const map = new Map()
    expenses.forEach((expense) => map.set(expense.category, (map.get(expense.category) || 0) + expense.amount))
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [expenses])

  const monthly = useMemo(() => {
    const map = new Map()
    sales.forEach((sale) => {
      const key = formatDate(sale.date, { month: 'short', year: '2-digit' })
      map.set(key, (map.get(key) || 0) + sale.total)
    })
    return [...map.entries()].map(([name, value]) => ({ name, value: Math.round(value) })).slice(-8)
  }, [sales])

  const csvRows = [
    ...sales.map((sale) => ({
      Type: 'Sale', Reference: sale.reference, Date: new Date(sale.date).toLocaleString('en-KE'),
      Description: sale.items.map((line) => `${line.name} × ${line.quantity}`).join('; '),
      Payment: sale.paymentMethod, Revenue: sale.total, COGS: sale.cost || 0, Amount: sale.total,
    })),
    ...expenses.map((expense) => ({
      Type: 'Expense', Reference: expense.reference, Date: new Date(expense.date).toLocaleString('en-KE'),
      Description: `${expense.category} — ${expense.description}`, Payment: expense.paymentMethod,
      Revenue: 0, COGS: 0, Amount: -expense.amount,
    })),
  ]

  return (
    <ReportShell
      title="Financial Reports"
      subtitle="Revenue, cost of goods sold and operating profit from recorded transactions."
      period={period} onPeriodChange={setPeriod} custom={custom} onCustomChange={setCustom}
      rows={csvRows} filename="financial-report"
    >
      <div className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Total revenue" value={money(summary.revenue)} hint={`${summary.salesCount} valid sales`} icon={undefined} tone="leaf" />
          <StatCard label="Cost of goods sold" value={money(summary.cogs)} hint="Based on recorded product costs" tone="slate" />
          <StatCard label="Gross profit" value={money(summary.grossProfit)} hint={`${summary.grossMargin.toFixed(1)}% gross margin`} tone="bakery" />
          <StatCard label="Operating expenses" value={money(summary.operatingExpenses)} hint={`${summary.expenseCount} expenses`} tone="amber" />
          <StatCard label="Net operating profit" value={money(summary.netProfit)} hint={`${summary.netMargin.toFixed(1)}% net margin`} tone={summary.netProfit >= 0 ? 'leaf' : 'red'} />
          <Card className="flex flex-col justify-center p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Profit basis</p>
            <div className="mt-2"><Badge tone={summary.costComplete ? 'leaf' : 'amber'}>{summary.costComplete ? 'Costs configured' : 'Estimated'}</Badge></div>
            <p className="mt-2 text-xs text-muted">{summary.basis}. Purchases are not treated as expenses.</p>
          </Card>
        </div>

        <Card className="p-5">
          <SectionHeading title="Revenue, costs and profit" subtitle="Daily movement across the selected period" />
          <div className="h-80">
            {series.length ? <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                <defs>
                  <linearGradient id="finRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#B66D3F" stopOpacity={0.3} /><stop offset="100%" stopColor="#B66D3F" stopOpacity={0.01} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0EAE2" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#7A6F66' }} axisLine={false} tickLine={false} minTickGap={20} />
                <YAxis tick={{ fontSize: 11, fill: '#7A6F66' }} axisLine={false} tickLine={false} tickFormatter={compactMoney} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => money(value)} />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#B66D3F" strokeWidth={2.5} fill="url(#finRevenue)" />
                <Area type="monotone" dataKey="expenses" name="Operating expenses" stroke="#E3A008" strokeWidth={2} fill="transparent" />
                <Area type="monotone" dataKey="profit" name="Net profit" stroke="#2E8B62" strokeWidth={2} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer> : <EmptyState title="No financial activity in this period" />}
          </div>
        </Card>

        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="p-5">
            <SectionHeading title="Sales by payment method" />
            <div className="space-y-3">
              {paymentMethods.map((entry) => (
                <div key={entry.name} className="flex items-center justify-between text-sm"><span className="text-muted">{entry.name}</span><span className="num font-semibold">{money(entry.value)}</span></div>
              ))}
              {!paymentMethods.length && <p className="text-sm text-muted">No sales recorded.</p>}
            </div>
          </Card>
          <Card className="p-5">
            <SectionHeading title="Expenses by category" />
            <div className="space-y-3">
              {expenseByCategory.slice(0, 8).map((entry) => (
                <div key={entry.name} className="flex items-center justify-between text-sm"><span className="text-muted">{entry.name}</span><span className="num font-semibold">{money(entry.value)}</span></div>
              ))}
              {!expenseByCategory.length && <p className="text-sm text-muted">No expenses recorded.</p>}
            </div>
          </Card>
          <Card className="p-5">
            <SectionHeading title="Monthly revenue trend" />
            <div className="space-y-3">
              {monthly.map((entry) => (
                <div key={entry.name} className="flex items-center justify-between text-sm"><span className="text-muted">{entry.name}</span><span className="num font-semibold">{money(entry.value)}</span></div>
              ))}
              {!monthly.length && <p className="text-sm text-muted">No monthly data.</p>}
            </div>
          </Card>
        </div>
      </div>
    </ReportShell>
  )
}
