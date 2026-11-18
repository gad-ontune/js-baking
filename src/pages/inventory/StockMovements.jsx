import { useMemo, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Boxes, History, Search } from 'lucide-react'
import { useStore } from '../../lib/store'
import { formatDate, number, periodRange, inRange } from '../../lib/format'
import { Badge, Card, EmptyState, PageHeader, SearchInput, Select, StatCard } from '../../components/ui'

export default function StockMovements() {
  const { data } = useStore()
  const [search, setSearch] = useState('')
  const [type, setType] = useState('all')
  const [period, setPeriod] = useState('30d')
  const range = useMemo(() => periodRange(period), [period])

  const itemName = (id) => data.inventory.find((item) => item.id === id)?.name || 'Unknown item'
  const userName = (id) => data.users.find((user) => user.id === id)?.name || 'System'

  const filtered = useMemo(() => data.movements.filter((movement) => {
    if (type !== 'all' && movement.type !== type) return false
    if (!inRange(movement.date, range)) return false
    const name = data.inventory.find((item) => item.id === movement.itemId)?.name || 'Unknown item'
    return `${name} ${movement.reason} ${movement.reference} ${movement.type}`.toLowerCase().includes(search.toLowerCase())
  }), [data.movements, data.inventory, search, type, range])

  const stats = useMemo(() => {
    const inMovements = filtered.filter((movement) => movement.quantity > 0)
    const outMovements = filtered.filter((movement) => movement.quantity < 0)
    return {
      total: filtered.length,
      incoming: inMovements.reduce((sum, movement) => sum + movement.quantity, 0),
      outgoing: Math.abs(outMovements.reduce((sum, movement) => sum + movement.quantity, 0)),
      adjustments: filtered.filter((movement) => ['Adjustment', 'Wastage'].includes(movement.type)).length,
    }
  }, [filtered])

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Audit trail" title="Stock Movements" subtitle="Every stock change is preserved with quantities, reasons and references." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Recorded movements" value={number(stats.total)} icon={History} tone="bakery" />
        <StatCard label="Stock in" value={number(stats.incoming, 2)} hint="Units received" icon={ArrowDownToLine} tone="leaf" />
        <StatCard label="Stock out" value={number(stats.outgoing, 2)} hint="Units issued or sold" icon={ArrowUpFromLine} tone="red" />
        <StatCard label="Adjustments & wastage" value={number(stats.adjustments)} icon={Boxes} tone="amber" />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search item, reason or reference…" />
          <Select value={type} onChange={(event) => setType(event.target.value)}>
            <option value="all">All movement types</option>
            {data.config.movementTypes.map((value) => <option key={value}>{value}</option>)}
          </Select>
          <Select value={period} onChange={(event) => setPeriod(event.target.value)}>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="month">This month</option>
            <option value="lastMonth">Previous month</option>
          </Select>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div><h2 className="font-display text-lg font-semibold">Movement history</h2><p className="text-xs text-muted">{filtered.length} records in view</p></div>
        </div>
        {filtered.length ? (
          <div className="table-wrap m-4">
            <table className="data-table">
              <thead><tr><th>Date & time</th><th>Item</th><th>Type</th><th>Movement</th><th>Previous → New</th><th>Recorded by</th><th>Reason</th><th>Reference</th></tr></thead>
              <tbody>
                {filtered.map((movement) => (
                  <tr key={movement.id}>
                    <td className="whitespace-nowrap text-xs text-muted">{formatDate(movement.date, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="font-semibold">{itemName(movement.itemId)}</td>
                    <td><Badge tone={movement.quantity >= 0 ? 'leaf' : 'amber'}>{movement.type}</Badge></td>
                    <td className={`num font-bold ${movement.quantity >= 0 ? 'text-leaf-600' : 'text-red-600'}`}>{movement.quantity > 0 ? '+' : ''}{number(movement.quantity, 2)}</td>
                    <td className="num whitespace-nowrap text-xs text-muted">{number(movement.previousQuantity, 2)} → {number(movement.newQuantity, 2)}</td>
                    <td className="text-xs text-muted">{userName(movement.userId)}</td>
                    <td className="max-w-[220px] truncate text-xs text-muted">{movement.reason}</td>
                    <td className="whitespace-nowrap text-xs text-muted">{movement.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState icon={Search} title="No movements found" description="Try a different search, type or period." />}
      </Card>
    </div>
  )
}
