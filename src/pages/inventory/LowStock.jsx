import { useMemo, useState } from 'react'
import { ArrowDownToLine, CircleAlert, PackageCheck, ShoppingCart } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useStore } from '../../lib/store'
import { itemStatus, money, number, uid } from '../../lib/format'
import { Badge, Button, Card, EmptyState, Field, Modal, PageHeader, ProgressBar, StatCard, StatusPill } from '../../components/ui'

export default function LowStock() {
  const { data, mutate, addAudit, notify } = useStore()
  const [receiving, setReceiving] = useState(null)
  const [quantity, setQuantity] = useState('')
  const [error, setError] = useState('')
  const warningDays = data.business.expiryWarningDays || 14

  const items = useMemo(() => data.inventory
    .filter((item) => !item.archived && ['low', 'out'].includes(itemStatus(item, warningDays)))
    .sort((a, b) => a.quantity / Math.max(a.minQuantity, 1) - b.quantity / Math.max(b.minQuantity, 1)), [data.inventory, warningDays])

  const outCount = items.filter((item) => item.quantity <= 0).length
  const estimatedCost = items.reduce((sum, item) => sum + Math.max(item.minQuantity - item.quantity, 0) * item.purchaseCost, 0)

  const receive = () => {
    const amount = Number(quantity)
    if (!Number.isFinite(amount) || amount <= 0) return setError('Enter a quantity greater than zero.')
    mutate((draft) => {
      const item = draft.inventory.find((candidate) => candidate.id === receiving.id)
      const previous = item.quantity
      item.quantity = previous + amount
      item.updatedAt = new Date().toISOString()
      draft.movements.unshift({
        id: uid('mov'), itemId: item.id, type: 'Purchase', quantity: amount, previousQuantity: previous,
        newQuantity: item.quantity, date: new Date().toISOString(), userId: draft.sessionUserId,
        reason: 'Quick stock receipt from low-stock alert', reference: uid('GRN').toUpperCase(),
      })
      addAudit(draft, 'STOCK_MOVEMENT', 'Inventory', `${amount} ${item.unit} of ${item.name} received`)
    })
    notify(`${receiving.name} stock increased by ${number(amount)} ${receiving.unit}.`)
    setReceiving(null)
    setQuantity('')
    setError('')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Replenishment"
        title="Low Stock"
        subtitle="Items that have reached or fallen below their minimum threshold."
        actions={<Link to="/purchases"><Button icon={ShoppingCart}>Create purchase</Button></Link>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Items needing attention" value={number(items.length)} icon={CircleAlert} tone="amber" />
        <StatCard label="Out of stock" value={number(outCount)} icon={PackageCheck} tone="red" />
        <StatCard label="Estimated replenishment cost" value={money(estimatedCost)} hint="To reach minimum thresholds" icon={ShoppingCart} tone="bakery" />
      </div>

      <Card>
        <div className="border-b border-line px-5 py-4"><h2 className="font-display text-lg font-semibold">Replenishment list</h2><p className="text-xs text-muted">Sorted by how far below threshold each item is</p></div>
        {items.length ? (
          <div className="table-wrap m-4">
            <table className="data-table">
              <thead><tr><th>Item</th><th>Category</th><th>Current stock</th><th>Minimum</th><th>Shortfall</th><th>Value at risk</th><th>Status</th><th className="text-right">Action</th></tr></thead>
              <tbody>
                {items.map((item) => {
                  const shortfall = Math.max(item.minQuantity - item.quantity, 0)
                  return (
                    <tr key={item.id}>
                      <td><p className="font-semibold">{item.name}</p><p className="text-xs text-muted">{item.code}</p></td>
                      <td className="text-xs text-muted">{item.category}</td>
                      <td className="min-w-[140px]">
                        <p className="num font-semibold">{number(item.quantity, 2)} {item.unit}</p>
                        <div className="mt-1"><ProgressBar value={(item.quantity / Math.max(item.minQuantity, 1)) * 100} tone={item.quantity <= 0 ? 'red' : 'amber'} /></div>
                      </td>
                      <td className="num text-muted">{number(item.minQuantity, 2)} {item.unit}</td>
                      <td className="num font-semibold text-red-600">{number(shortfall, 2)} {item.unit}</td>
                      <td className="num">{money(shortfall * item.purchaseCost)}</td>
                      <td><StatusPill status={itemStatus(item, warningDays)} /></td>
                      <td className="text-right"><Button size="sm" icon={ArrowDownToLine} onClick={() => { setReceiving(item); setQuantity(''); setError('') }}>Receive</Button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <EmptyState icon={PackageCheck} title="Everything is well stocked" description="No items are currently below their minimum threshold." />}
      </Card>

      {receiving && (
        <Modal
          open
          onClose={() => setReceiving(null)}
          title={`Receive ${receiving.name}`}
          description={`Current quantity: ${number(receiving.quantity)} ${receiving.unit}`}
          size="sm"
          footer={<><Button onClick={() => setReceiving(null)}>Cancel</Button><Button variant="primary" onClick={receive}>Record receipt</Button></>}
        >
          <div className="space-y-4">
            <Field label={`Quantity received (${receiving.unit})`} error={error}>
              <input type="number" min="0" step="0.01" className="input" value={quantity} onChange={(event) => setQuantity(event.target.value)} autoFocus />
            </Field>
            <div className="rounded-xl bg-bakery-50 p-3 text-xs text-bakery-800">A stock movement and audit record will be created automatically.</div>
          </div>
        </Modal>
      )}
    </div>
  )
}
