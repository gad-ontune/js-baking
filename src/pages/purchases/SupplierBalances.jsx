import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Banknote, Building2, Scale, Wallet } from 'lucide-react'
import { useStore } from '../lib/store'
import { supplierBalances } from '../../lib/analytics'
import { money, number } from '../../lib/format'
import { Badge, Button, Card, EmptyState, PageHeader, ProgressBar, StatCard } from '../../components/ui'

export default function SupplierBalances() {
  const { data } = useStore()
  const balances = useMemo(() => supplierBalances(data).filter((entry) => entry.total > 0), [data])
  const totalOutstanding = balances.reduce((sum, entry) => sum + entry.balance, 0)
  const dueSoon = balances.filter((entry) => entry.balance > 0).length

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Payables"
        title="Supplier Balances"
        subtitle="Outstanding amounts calculated from recorded purchases and payments."
        actions={<Link to="/purchases"><Button icon={Banknote}>Go to purchases</Button></Link>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total outstanding" value={money(totalOutstanding)} hint="Across all suppliers" icon={Wallet} tone="red" />
        <StatCard label="Suppliers with balances" value={number(dueSoon)} icon={Building2} tone="amber" />
        <StatCard label="Total paid to date" value={money(balances.reduce((sum, entry) => sum + entry.paid, 0))} icon={Scale} tone="leaf" />
      </div>

      {balances.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {balances.map(({ supplier, purchases, total, paid, balance }) => (
            <Card key={supplier.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-semibold">{supplier.name}</h3>
                  <p className="text-xs text-muted">{supplier.businessName || supplier.phone || 'Supplier'}</p>
                </div>
                {balance > 0 ? <Badge tone="amber">Balance due</Badge> : <Badge tone="leaf">Settled</Badge>}
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                <div><p className="text-[10px] font-bold uppercase tracking-wider text-muted">Purchases</p><p className="num mt-1 font-semibold">{purchases}</p></div>
                <div><p className="text-[10px] font-bold uppercase tracking-wider text-muted">Total</p><p className="num mt-1 font-semibold">{money(total)}</p></div>
                <div><p className="text-[10px] font-bold uppercase tracking-wider text-muted">Paid</p><p className="num mt-1 font-semibold text-leaf-600">{money(paid)}</p></div>
              </div>
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-xs"><span className="text-muted">Payment progress</span><span className="font-semibold">{total ? Math.round((paid / total) * 100) : 0}%</span></div>
                <ProgressBar value={total ? (paid / total) * 100 : 0} tone={balance > 0 ? 'amber' : 'leaf'} />
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
                <div><p className="text-[10px] font-bold uppercase tracking-wider text-muted">Outstanding balance</p><p className={`num font-display text-xl font-semibold ${balance > 0 ? 'text-red-600' : 'text-leaf-600'}`}>{money(balance)}</p></div>
                <Link to="/purchases"><Button size="sm">View purchases</Button></Link>
              </div>
            </Card>
          ))}
        </div>
      ) : <Card><EmptyState icon={Wallet} title="No supplier balances" description="Outstanding purchase balances will appear here." /></Card>}
    </div>
  )
}
