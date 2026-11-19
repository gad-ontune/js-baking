import { useMemo, useState } from 'react'
import { Apple, CalendarClock, TriangleAlert } from 'lucide-react'
import { useStore } from '../../lib/store'
import { daysUntil, formatDate, number } from '../../lib/format'
import { Badge, Button, Card, EmptyState, Field, Modal, PageHeader, StatCard, StatusPill } from '../../components/ui'

export default function ExpiryTracking() {
  const { data, businessWrite } = useStore()
  const [wasting, setWasting] = useState(null)
  const [quantity, setQuantity] = useState('')
  const [error, setError] = useState('')
  const warningDays = data.business.expiryWarningDays || 14

  const groups = useMemo(() => {
    const active = data.inventory.filter((item) => !item.archived && item.expiryDate)
    return {
      expired: active.filter((item) => daysUntil(item.expiryDate) < 0).sort((a, b) => daysUntil(a.expiryDate) - daysUntil(b.expiryDate)),
      expiring: active.filter((item) => {
        const days = daysUntil(item.expiryDate)
        return days >= 0 && days <= warningDays
      }).sort((a, b) => daysUntil(a.expiryDate) - daysUntil(b.expiryDate)),
      upcoming: active.filter((item) => daysUntil(item.expiryDate) > warningDays).sort((a, b) => daysUntil(a.expiryDate) - daysUntil(b.expiryDate)),
    }
  }, [data.inventory, warningDays])

  const recordWastage = async () => {
    const amount = Number(quantity)
    if (!Number.isFinite(amount) || amount <= 0) return setError('Enter a quantity greater than zero.')
    const result = await businessWrite(
      (api) => api.recordStockMovement(wasting.id, {
        type: 'Wastage',
        quantity: amount,
        reason: 'Expired or spoiled stock written off',
      }),
      'Wastage recorded and stock updated.',
    )
    if (result.ok) {
      setWasting(null)
      setQuantity('')
      setError('')
    } else {
      setError(result.message)
    }
  }

  const section = (title, items, tone, note) => (
    <Card key={title}>
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div><h2 className="font-display text-lg font-semibold">{title}</h2><p className="text-xs text-muted">{note}</p></div>
        <Badge tone={tone}>{items.length} items</Badge>
      </div>
      {items.length ? (
        <div className="table-wrap m-4">
          <table className="data-table">
            <thead><tr><th>Item</th><th>Category</th><th>Expiry date</th><th>Days remaining</th><th>Quantity</th><th>Value at risk</th><th>Status</th><th className="text-right">Action</th></tr></thead>
            <tbody>
              {items.map((item) => {
                const days = daysUntil(item.expiryDate)
                return (
                  <tr key={item.id}>
                    <td><p className="font-semibold">{item.name}</p><p className="text-xs text-muted">{item.code}</p></td>
                    <td className="text-xs text-muted">{item.category}</td>
                    <td className="whitespace-nowrap">{formatDate(item.expiryDate)}</td>
                    <td><span className={`num font-semibold ${days < 0 ? 'text-red-600' : days <= warningDays ? 'text-amber-600' : 'text-leaf-600'}`}>{days < 0 ? `${Math.abs(days)} overdue` : `${days} days`}</span></td>
                    <td className="num">{number(item.quantity, 2)} {item.unit}</td>
                    <td className="num">{number(item.quantity * item.purchaseCost).toLocaleString('en-KE')} KES</td>
                    <td><StatusPill status={days < 0 ? 'expired' : days <= warningDays ? 'expiring' : 'healthy'} /></td>
                    <td className="text-right">
                      {days <= warningDays && item.quantity > 0 && <Button size="sm" variant="danger" onClick={() => { setWasting(item); setQuantity(''); setError('') }}>Write off</Button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : <EmptyState icon={Apple} title="Nothing in this group" description="Items will appear here as expiry dates are recorded." />}
    </Card>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Freshness control"
        title="Expiry Tracking"
        subtitle={`Items are flagged ${warningDays} days before expiry. Adjust this in Settings.`}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Expired" value={number(groups.expired.length)} icon={TriangleAlert} tone="red" />
        <StatCard label="Expiring soon" value={number(groups.expiring.length)} icon={CalendarClock} tone="amber" />
        <StatCard label="Tracked with expiry" value={number(groups.expired.length + groups.expiring.length + groups.upcoming.length)} icon={Apple} tone="leaf" />
      </div>

      {section('Expired items', groups.expired, 'red', 'Past their recorded expiry date')}
      {section('Expiring soon', groups.expiring, 'amber', `Within the next ${warningDays} days`)}
      {section('Upcoming expiry', groups.upcoming, 'leaf', 'More than the warning period away')}

      {wasting && (
        <Modal
          open
          onClose={() => setWasting(null)}
          title={`Write off ${wasting.name}`}
          description={`Current stock: ${number(wasting.quantity)} ${wasting.unit}`}
          size="sm"
          footer={<><Button onClick={() => setWasting(null)}>Cancel</Button><Button variant="danger" onClick={recordWastage}>Record wastage</Button></>}
        >
          <Field label={`Quantity to write off (${wasting.unit})`} error={error}>
            <input type="number" min="0" max={wasting.quantity} step="0.01" className="input" value={quantity} onChange={(event) => setQuantity(event.target.value)} autoFocus />
          </Field>
        </Modal>
      )}
    </div>
  )
}
