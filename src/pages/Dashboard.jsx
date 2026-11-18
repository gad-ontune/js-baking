import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Apple,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeAlert,
  Boxes,
  CircleDollarSign,
  ClipboardList,
  Factory,
  Package,
  Plus,
  ReceiptText,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { useStore } from '../lib/store'
import {
  dailySeries,
  expensesInRange,
  financialSummary,
  inventoryAlerts,
  inventoryByCategory,
  inventorySummary,
  periodLabel,
  recentActivity,
  salesByProduct,
} from '../lib/analytics'
import { compactMoney, formatDate, inRange, money, number, periodRange, relativeTime } from '../lib/format'
import { Badge, Button, Card, IconButton, PageHeader, PeriodPicker, SectionHeading, StatCard } from '../components/ui'

const CHART_COLORS = ['#B66D3F', '#DDA981', '#7F4328', '#2E8B62', '#A8B5A0', '#D9A44C']
const tooltipStyle = {
  border: '1px solid #E9E1D7',
  borderRadius: 12,
  boxShadow: '0 12px 32px rgba(36,30,26,0.10)',
  fontSize: 12,
  fontFamily: 'Plus Jakarta Sans, sans-serif',
}

function ActivityIcon({ type }) {
  const config = {
    purchase: [ShoppingCart, 'bg-bakery-50 text-bakery-700'],
    sale: [ReceiptText, 'bg-leaf-50 text-leaf-700'],
    expense: [Wallet, 'bg-red-50 text-red-600'],
    adjustment: [Boxes, 'bg-amber-50 text-amber-700'],
    production: [Factory, 'bg-blue-50 text-blue-700'],
  }
  const [Icon, tone] = config[type] || [ClipboardList, 'bg-slate-100 text-slate-700']
  return <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon size={17} /></span>
}

export default function Dashboard() {
  const { data, currentUser } = useStore()
  const navigate = useNavigate()
  const [period, setPeriod] = useState('30d')
  const [custom, setCustom] = useState({ from: '', to: '' })

  const range = useMemo(() => periodRange(period, custom), [period, custom])
  const summary = useMemo(() => financialSummary(data, range), [data, range])
  const todaySummary = useMemo(() => financialSummary(data, periodRange('today')), [data])
  const monthSummary = useMemo(() => financialSummary(data, periodRange('month')), [data])
  const series = useMemo(() => dailySeries(data, range), [data, range])
  const topProducts = useMemo(() => salesByProduct(data, range).slice(0, 6), [data, range])
  const categoryData = useMemo(() => inventoryByCategory(data), [data])
  const stock = useMemo(() => inventorySummary(data), [data])
  const alerts = useMemo(() => inventoryAlerts(data), [data])
  const activity = useMemo(() => recentActivity(data, 7), [data])
  const highExpenses = useMemo(() => {
    const expenses = expensesInRange(data, range)
    if (!expenses.length) return []
    const average = expenses.reduce((sum, expense) => sum + expense.amount, 0) / expenses.length
    return expenses.filter((expense) => expense.amount > average * 2.4).slice(0, 2)
  }, [data, range])

  const greeting = (() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Business overview"
        title={`${greeting}, ${currentUser?.name.split(' ')[0] || 'there'} 👋`}
        subtitle="Here is how Crumb & Co. is performing right now."
        actions={
          <>
            <PeriodPicker period={period} onPeriodChange={setPeriod} custom={custom} onCustomChange={setCustom} />
            <Link to="/sales"><Button variant="primary" icon={Plus}>Record sale</Button></Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Today's sales" value={money(todaySummary.revenue)} hint={`${todaySummary.salesCount} transactions today`} icon={ReceiptText} tone="leaf" />
        <StatCard label="Today's expenses" value={money(todaySummary.operatingExpenses)} hint={`${todaySummary.expenseCount} expenses recorded`} icon={Wallet} tone="red" />
        <StatCard label="Today's estimated profit" value={money(todaySummary.netProfit)} hint={todaySummary.basis} icon={TrendingUp} tone="bakery" />
        <StatCard label="Monthly sales" value={money(monthSummary.revenue)} hint="Recorded this calendar month" icon={CircleDollarSign} tone="leaf" />
        <StatCard label="Monthly expenses" value={money(monthSummary.operatingExpenses)} hint="Operating costs this month" icon={BadgeAlert} tone="amber" />
        <StatCard label="Monthly estimated profit" value={money(monthSummary.netProfit)} hint={`${monthSummary.netMargin.toFixed(1)}% net margin`} icon={TrendingUp} tone="bakery" />
      </div>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SectionHeading title="Inventory at a glance" subtitle={`${stock.total} active items · valued at ${money(stock.value)}`} />
          <Link to="/inventory" className="text-sm font-semibold text-bakery-700 hover:underline">View all inventory →</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { label: 'Total items', value: number(stock.total), icon: Package, tone: 'text-bakery-600', to: '/inventory' },
            { label: 'Low stock', value: number(stock.low), icon: Boxes, tone: 'text-amber-600', to: '/inventory/low-stock' },
            { label: 'Out of stock', value: number(stock.out), icon: Boxes, tone: 'text-red-600', to: '/inventory/low-stock' },
            { label: 'Expiring soon', value: number(stock.expiring + stock.expired), icon: Apple, tone: 'text-amber-600', to: '/inventory/expiry' },
            { label: 'Stock value', value: compactMoney(stock.value), icon: CircleDollarSign, tone: 'text-leaf-600', to: '/reports/inventory' },
          ].map(({ label, value, icon: Icon, tone, to }) => (
            <Link key={label} to={to} className="group rounded-xl border border-line bg-[#FCFAF7] p-4 transition hover:border-bakery-300 hover:bg-bakery-50">
              <Icon size={18} className={tone} />
              <p className="num mt-3 font-display text-xl font-semibold text-ink">{value}</p>
              <p className="mt-0.5 text-xs text-muted">{label}</p>
            </Link>
          ))}
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <SectionHeading title="Sales performance" subtitle={`Revenue and profit · ${periodLabel(period, custom)}`} action={<Badge tone="leaf">{money(summary.revenue)} revenue</Badge>} />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#B66D3F" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="#B66D3F" stopOpacity={0.01} />
                  </linearGradient>
                  <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2E8B62" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#2E8B62" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0EAE2" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#7A6F66' }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 11, fill: '#7A6F66' }} axisLine={false} tickLine={false} tickFormatter={compactMoney} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => money(value)} />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#B66D3F" strokeWidth={2.5} fill="url(#revenueFill)" />
                <Area type="monotone" dataKey="profit" name="Net profit" stroke="#2E8B62" strokeWidth={2} fill="url(#profitFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeading title="Revenue vs expenses" subtitle="How much came in compared with what went out" action={<Badge tone={summary.netProfit >= 0 ? 'leaf' : 'red'}>{money(summary.netProfit)} net</Badge>} />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={3}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0EAE2" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#7A6F66' }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 11, fill: '#7A6F66' }} axisLine={false} tickLine={false} tickFormatter={compactMoney} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => money(value)} cursor={{ fill: '#FBF5EE' }} />
                <Bar dataKey="revenue" name="Revenue" fill="#B66D3F" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill="#E3C3A8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeading title="Inventory distribution" subtitle="Stock value by category" />
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="h-56 w-full sm:w-[46%]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={3} stroke="none">
                    {categoryData.map((entry, index) => <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => money(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full space-y-2.5">
              {categoryData.map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
                  <span className="flex-1 truncate text-muted">{entry.name}</span>
                  <span className="num font-semibold text-ink">{compactMoney(entry.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeading title="Best-selling products" subtitle={`By revenue · ${periodLabel(period, custom)}`} />
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProducts} layout="vertical" margin={{ top: 0, right: 16, left: 12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F0EAE2" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#7A6F66' }} axisLine={false} tickLine={false} tickFormatter={compactMoney} />
                <YAxis type="category" dataKey="name" width={112} tick={{ fontSize: 11, fill: '#5C5149' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => money(value)} cursor={{ fill: '#FBF5EE' }} />
                <Bar dataKey="revenue" name="Revenue" fill="#CB8659" radius={[0, 5, 5, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <SectionHeading title="Needs your attention" subtitle="Stock and expense alerts" />
            <Badge tone={alerts.length || highExpenses.length ? 'red' : 'leaf'}>{alerts.length + highExpenses.length} alerts</Badge>
          </div>
          <div className="max-h-[420px] divide-y divide-line overflow-y-auto">
            {highExpenses.map((expense) => (
              <div key={expense.id} className="flex gap-3 px-5 py-3.5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700"><ArrowUpRight size={16} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">Unusually high expense</p>
                  <p className="text-xs text-muted">{expense.description} · {money(expense.amount)} on {formatDate(expense.date, { day: 'numeric', month: 'short' })}</p>
                </div>
                <Badge tone="amber">Review</Badge>
              </div>
            ))}
            {alerts.slice(0, 7).map((alert) => (
              <Link key={alert.id} to={alert.status === 'expiring' || alert.status === 'expired' ? '/inventory/expiry' : '/inventory/low-stock'} className="flex gap-3 px-5 py-3.5 transition hover:bg-bakery-50">
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${alert.severity === 'critical' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
                  {alert.status === 'expiring' || alert.status === 'expired' ? <Apple size={16} /> : <Boxes size={16} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{alert.title}</p>
                  <p className="text-xs text-muted">{alert.detail}</p>
                </div>
                <Badge tone={alert.severity === 'critical' ? 'red' : 'amber'}>{alert.severity === 'critical' ? 'Critical' : 'Warning'}</Badge>
              </Link>
            ))}
            {!alerts.length && !highExpenses.length && <p className="px-5 py-10 text-center text-sm text-muted">Everything looks healthy right now.</p>}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <SectionHeading title="Recent activity" subtitle="Latest records across the business" />
            <IconButton icon={ArrowRight} label="View sales" onClick={() => navigate('/sales')} className="hidden sm:inline-flex" />
          </div>
          <div className="max-h-[420px] divide-y divide-line overflow-y-auto">
            {activity.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-5 py-3.5">
                <ActivityIcon type={item.type} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{item.title}</p>
                  <p className="truncate text-xs text-muted">{item.subtitle} · {relativeTime(item.date)}</p>
                </div>
                {item.amount !== null && (
                  <span className={`num shrink-0 text-sm font-bold ${item.amount >= 0 ? 'text-leaf-600' : 'text-red-600'}`}>
                    {item.amount >= 0 ? '+' : '−'}{money(Math.abs(item.amount))}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="flex flex-col gap-4 bg-bakery-50/70 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-lg font-semibold text-ink">Ready for today's records?</p>
          <p className="mt-1 text-sm text-muted">Capture sales, purchases and production in just a few clicks.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/purchases"><Button icon={ShoppingCart}>New purchase</Button></Link>
          <Link to="/production"><Button icon={Factory}>Production</Button></Link>
          <Link to="/expenses"><Button icon={Wallet}>Add expense</Button></Link>
        </div>
      </Card>

      {summary.costCoverage > 0 && (
        <p className="text-center text-xs text-muted">
          Profit figures use recorded product costs. Current cost coverage: {(summary.costCoverage * 100).toFixed(0)}% of revenue.
        </p>
      )}
    </div>
  )
}
