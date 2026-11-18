import { useMemo, useState } from 'react'
import { Banknote, Eye, FilePlus2, PackagePlus, Plus, Receipt, RotateCcw, Search, Truck } from 'lucide-react'
import { useStore } from '../lib/store'
import { expensesByCategory } from '../../lib/analytics'
import { formatDate, inRange, money, number, periodRange, uid } from '../../lib/format'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Modal,
  PageHeader,
  PeriodPicker,
  SearchInput,
  Select,
  StatCard,
  StatusPill,
} from '../../components/ui'

const blankLine = () => ({ itemId: '', quantity: 1, unitCost: 0 })

function PurchaseForm({ data, onClose, onSave }) {
  const purchasable = data.inventory.filter((item) => !item.archived && item.category !== 'Finished Products')
  const [form, setForm] = useState({
    supplierId: data.suppliers[0]?.id || '',
    date: new Date().toISOString().slice(0, 10),
    lines: [blankLine()],
    discount: 0,
    charges: 0,
    notes: '',
  })
  const [error, setError] = useState('')

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const setLine = (index, key, value) => setForm((current) => ({
    ...current,
    lines: current.lines.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line),
  }))

  const subtotal = form.lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitCost || 0), 0)
  const total = subtotal - Number(form.discount || 0) + Number(form.charges || 0)

  const submit = () => {
    if (!form.supplierId) return setError('Choose a supplier.')
    const validLines = form.lines.filter((line) => line.itemId && Number(line.quantity) > 0)
    if (!validLines.length) return setError('Add at least one purchased item.')
    if (validLines.some((line) => Number(line.unitCost) < 0)) return setError('Unit costs cannot be negative.')
    if (total < 0) return setError('Discounts cannot exceed the subtotal.')
    onSave({
      ...form,
      lines: validLines.map((line) => {
        const item = data.inventory.find((candidate) => candidate.id === line.itemId)
        const quantity = Number(line.quantity)
        const unitCost = Number(line.unitCost)
        return { itemId: line.itemId, name: item.name, unit: item.unit, quantity, unitCost, subtotal: quantity * unitCost }
      }),
      discount: Number(form.discount || 0),
      charges: Number(form.charges || 0),
      subtotal,
      total,
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Record a purchase"
      description="Purchases increase inventory and supplier balances."
      size="lg"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit} icon={PackagePlus}>Confirm purchase</Button></>}
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Supplier">
            <Select value={form.supplierId} onChange={(event) => set('supplierId', event.target.value)}>
              <option value="">Select supplier…</option>
              {data.suppliers.filter((supplier) => supplier.status === 'Active').map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </Select>
          </Field>
          <Field label="Purchase date">
            <input type="date" className="input" value={form.date} onChange={(event) => set('date', event.target.value)} />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="label mb-0">Purchased items</p>
            <Button size="sm" icon={Plus} onClick={() => set('lines', [...form.lines, blankLine()])}>Add line</Button>
          </div>
          <div className="space-y-2">
            {form.lines.map((line, index) => (
              <div key={index} className="grid gap-2 rounded-xl border border-line bg-[#FCFAF7] p-2 sm:grid-cols-[1.6fr_0.8fr_0.9fr_auto]">
                <Select value={line.itemId} onChange={(event) => setLine(index, 'itemId', event.target.value)}>
                  <option value="">Select item…</option>
                  {purchasable.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}
                </Select>
                <input type="number" min="0" step="0.01" className="input" placeholder="Qty" value={line.quantity} onChange={(event) => setLine(index, 'quantity', event.target.value)} />
                <input type="number" min="0" step="0.01" className="input" placeholder="Unit cost" value={line.unitCost} onChange={(event) => setLine(index, 'unitCost', event.target.value)} />
                <div className="flex items-center gap-2">
                  <span className="num min-w-[70px] text-right text-sm font-semibold">{money(line.quantity * line.unitCost)}</span>
                  <IconButton icon={RotateCcw} label="Remove line" onClick={() => set('lines', form.lines.filter((_, lineIndex) => lineIndex !== index))} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Discount (KES)"><input type="number" min="0" className="input" value={form.discount} onChange={(event) => set('discount', event.target.value)} /></Field>
          <Field label="Additional charges (KES)"><input type="number" min="0" className="input" value={form.charges} onChange={(event) => set('charges', event.target.value)} /></Field>
          <Field label="Notes"><input className="input" value={form.notes} onChange={(event) => set('notes', event.target.value)} placeholder="Optional" /></Field>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-bakery-50 px-4 py-3">
          <span className="text-sm font-semibold text-bakery-900">Purchase total</span>
          <span className="num font-display text-2xl font-semibold text-bakery-900">{money(total)}</span>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}

function PurchaseDetails({ purchase, data, onClose, onPay, onVoid, onEditNotes }) {
  const supplier = data.suppliers.find((entry) => entry.id === purchase.supplierId)
  const userName = (id) => data.users.find((user) => user.id === id)?.name || 'System'
  return (
    <Modal
      open
      onClose={onClose}
      title={`Purchase ${purchase.reference}`}
      description={`${formatDate(purchase.date)} · ${supplier?.name || 'Supplier'}`}
      size="lg"
      footer={
        <>
          {onEditNotes && <Button onClick={() => onEditNotes(purchase)}>Edit notes</Button>}
          {!purchase.voided && <Button variant="danger" icon={RotateCcw} onClick={() => onVoid(purchase)}>Void purchase</Button>}
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      {purchase.voided && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">This purchase has been voided. Its inventory and financial effects were reversed.</div>}
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        {[
          ['Status', <StatusPill key="status" status={purchase.voided ? 'Voided' : purchase.status} />],
          ['Total', money(purchase.total)],
          ['Paid', money(purchase.paidAmount)],
          ['Balance', money(purchase.balance)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-line p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>
        ))}
      </div>
      <div className="table-wrap mb-5">
        <table className="data-table">
          <thead><tr><th>Item</th><th>Quantity</th><th>Unit cost</th><th>Subtotal</th></tr></thead>
          <tbody>
            {purchase.items.map((line, index) => <tr key={index}><td className="font-semibold">{line.name}</td><td className="num">{number(line.quantity, 2)} {line.unit}</td><td className="num">{money(line.unitCost)}</td><td className="num font-semibold">{money(line.subtotal)}</td></tr>)}
          </tbody>
          <tfoot>
            <tr><td colSpan="3" className="text-right text-xs text-muted">Subtotal / discount / charges</td><td className="num text-xs">{money(purchase.subtotal)} / −{money(purchase.discount)} / +{money(purchase.charges)}</td></tr>
          </tfoot>
        </table>
      </div>
      <div className="mb-5">
        <p className="label">Payment history</p>
        {purchase.payments.length ? (
          <div className="space-y-2">
            {purchase.payments.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm">
                <span>{formatDate(payment.date)} · {payment.method}</span>
                <span className="num font-semibold text-leaf-600">{money(payment.amount)}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted">No payments recorded yet.</p>}
        {!purchase.voided && purchase.balance > 0 && <Button size="sm" className="mt-3" icon={Banknote} onClick={() => onPay(purchase)}>Record payment</Button>}
      </div>
      <div className="grid gap-3 border-t border-line pt-4 text-xs text-muted sm:grid-cols-2">
        <p>Recorded by: <span className="font-semibold text-ink">{userName(purchase.createdBy)}</span></p>
        <p>Notes: <span className="text-ink">{purchase.notes || '—'}</span></p>
      </div>
    </Modal>
  )
}

function PaymentDialog({ purchase, onClose }) {
  const { mutate, addAudit, notify } = useStore()
  const [amount, setAmount] = useState(String(purchase.balance))
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState('Cash')
  const [error, setError] = useState('')

  const submit = () => {
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) return setError('Enter a valid payment amount.')
    if (value > purchase.balance) return setError('Payment cannot exceed the outstanding balance.')
    mutate((draft) => {
      const target = draft.purchases.find((entry) => entry.id === purchase.id)
      target.paidAmount += value
      target.balance = target.total - target.paidAmount
      target.status = target.balance <= 0 ? 'Paid' : target.paidAmount > 0 ? 'Partially paid' : 'Unpaid'
      target.payments.push({ id: uid('pay'), amount: value, date: new Date(date).toISOString(), method, reference: uid('PAY').toUpperCase() })
      addAudit(draft, 'SUPPLIER_PAYMENT', 'Purchase', `${money(value)} paid toward ${purchase.reference}`)
    })
    notify('Supplier payment recorded.')
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Record supplier payment"
      description={`${purchase.reference} · Outstanding ${money(purchase.balance)}`}
      size="sm"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Record payment</Button></>}
    >
      <div className="space-y-4">
        <Field label="Amount (KES)" error={error}><input type="number" min="0" step="0.01" className="input" value={amount} onChange={(event) => setAmount(event.target.value)} autoFocus /></Field>
        <Field label="Payment date"><input type="date" className="input" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        <Field label="Payment method">
          <Select value={method} onChange={(event) => setMethod(event.target.value)}>{['Cash', 'M-Pesa', 'Bank Transfer', 'Other'].map((value) => <option key={value}>{value}</option>)}</Select>
        </Field>
      </div>
    </Modal>
  )
}

export default function Purchases() {
  const { data, mutate, addAudit, notify } = useStore()
  const [period, setPeriod] = useState('30d')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [details, setDetails] = useState(null)
  const [paying, setPaying] = useState(null)
  const [voiding, setVoiding] = useState(null)
  const [editingNotes, setEditingNotes] = useState(null)
  const [notes, setNotes] = useState('')

  const range = useMemo(() => periodRange(period, custom), [period, custom])
  const filtered = useMemo(() => data.purchases.filter((purchase) => {
    if (!inRange(purchase.date, range)) return false
    if (supplierFilter !== 'all' && purchase.supplierId !== supplierFilter) return false
    if (!purchase.voided && statusFilter !== 'all' && purchase.status !== statusFilter) return false
    const supplier = data.suppliers.find((entry) => entry.id === purchase.supplierId)
    return `${purchase.reference} ${supplier?.name || ''} ${purchase.notes}`.toLowerCase().includes(search.toLowerCase())
  }), [data.purchases, data.suppliers, range, supplierFilter, statusFilter, search])

  const stats = useMemo(() => {
    const active = filtered.filter((purchase) => !purchase.voided)
    return {
      total: active.reduce((sum, purchase) => sum + purchase.total, 0),
      paid: active.reduce((sum, purchase) => sum + purchase.paidAmount, 0),
      balance: active.reduce((sum, purchase) => sum + purchase.balance, 0),
      count: active.length,
    }
  }, [filtered])

  const createPurchase = (form) => {
    const reference = `PUR-${new Date().getFullYear()}-${String(data.purchases.length + 1).padStart(3, '0')}`
    const date = new Date(form.date).toISOString()
    mutate((draft) => {
      const purchase = {
        id: uid('pur'), reference, supplierId: form.supplierId, date,
        items: form.lines, subtotal: form.subtotal, discount: form.discount, charges: form.charges,
        total: form.total, status: 'Unpaid', paidAmount: 0, balance: form.total,
        payments: [], notes: form.notes, voided: false, createdBy: draft.sessionUserId, createdAt: new Date().toISOString(),
      }
      draft.purchases.unshift(purchase)
      form.lines.forEach((line) => {
        const item = draft.inventory.find((candidate) => candidate.id === line.itemId)
        const previous = item.quantity
        item.quantity = previous + line.quantity
        item.updatedAt = date
        draft.movements.unshift({
          id: uid('mov'), itemId: item.id, type: 'Purchase', quantity: line.quantity, previousQuantity: previous,
          newQuantity: item.quantity, date, userId: draft.sessionUserId,
          reason: `Purchase ${reference} — ${data.suppliers.find((s) => s.id === form.supplierId)?.name || 'supplier'}`, reference,
        })
      })
      addAudit(draft, 'PURCHASE_CREATED', 'Purchase', `${reference} confirmed for ${money(form.total)}`)
    })
    notify('Purchase confirmed. Inventory has been updated.')
    setCreating(false)
  }

  const voidPurchase = () => {
    mutate((draft) => {
      const purchase = draft.purchases.find((entry) => entry.id === voiding.id)
      purchase.voided = true
      purchase.status = 'Voided'
      purchase.items.forEach((line) => {
        const item = draft.inventory.find((candidate) => candidate.id === line.itemId)
        const previous = item.quantity
        item.quantity = previous - line.quantity
        item.updatedAt = new Date().toISOString()
        draft.movements.unshift({
          id: uid('mov'), itemId: item.id, type: 'Adjustment', quantity: -line.quantity, previousQuantity: previous,
          newQuantity: item.quantity, date: new Date().toISOString(), userId: draft.sessionUserId,
          reason: `Reversal of voided purchase ${purchase.reference}`, reference: `VOID-${purchase.reference}`,
        })
      })
      addAudit(draft, 'PURCHASE_VOIDED', 'Purchase', `${purchase.reference} voided and inventory reversed`)
    })
    notify('Purchase voided. Inventory and balances reversed.')
    setVoiding(null)
    setDetails(null)
  }

  const saveNotes = () => {
    mutate((draft) => {
      const purchase = draft.purchases.find((entry) => entry.id === editingNotes.id)
      purchase.notes = notes
      addAudit(draft, 'PURCHASE_UPDATED', 'Purchase', `Notes updated for ${purchase.reference}`)
    })
    notify('Purchase notes updated.')
    setEditingNotes(null)
  }

  const supplierName = (id) => data.suppliers.find((supplier) => supplier.id === id)?.name || '—'

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Purchasing"
        title="Purchases"
        subtitle="Record supplier purchases and see exactly what you owe."
        actions={<Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New purchase</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total purchases" value={money(stats.total)} hint={`${stats.count} purchases in period`} icon={Receipt} tone="bakery" />
        <StatCard label="Amount paid" value={money(stats.paid)} icon={Banknote} tone="leaf" />
        <StatCard label="Outstanding balance" value={money(stats.balance)} icon={Truck} tone="red" />
        <StatCard label="Suppliers used" value={number(new Set(filtered.map((purchase) => purchase.supplierId)).size)} icon={Truck} tone="slate" />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_170px_170px_auto]">
          <SearchInput value={search} onChange={setSearch} placeholder="Search reference or supplier…" />
          <PeriodPicker period={period} onPeriodChange={setPeriod} custom={custom} onCustomChange={setCustom} />
          <Select value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)}>
            <option value="all">All suppliers</option>
            {data.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </Select>
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option>Paid</option><option>Partially paid</option><option>Unpaid</option><option>Voided</option>
          </Select>
          {(search || supplierFilter !== 'all' || statusFilter !== 'all') && <Button onClick={() => { setSearch(''); setSupplierFilter('all'); setStatusFilter('all') }}>Clear</Button>}
        </div>
      </Card>

      <Card>
        <div className="border-b border-line px-5 py-4"><h2 className="font-display text-lg font-semibold">Purchase history</h2><p className="text-xs text-muted">{filtered.length} records</p></div>
        {filtered.length ? (
          <div className="table-wrap m-4">
            <table className="data-table">
              <thead><tr><th>Reference</th><th>Date</th><th>Supplier</th><th>Items</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {filtered.map((purchase) => (
                  <tr key={purchase.id}>
                    <td className="font-semibold">{purchase.reference}</td>
                    <td className="whitespace-nowrap text-xs text-muted">{formatDate(purchase.date)}</td>
                    <td>{supplierName(purchase.supplierId)}</td>
                    <td className="text-muted">{purchase.items.length}</td>
                    <td className="num font-semibold">{money(purchase.total)}</td>
                    <td className="num text-leaf-600">{money(purchase.paidAmount)}</td>
                    <td className={`num font-semibold ${purchase.balance > 0 ? 'text-red-600' : 'text-muted'}`}>{money(purchase.balance)}</td>
                    <td><StatusPill status={purchase.voided ? 'Voided' : purchase.status} /></td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <IconButton icon={Eye} label="View details" onClick={() => setDetails(purchase)} />
                        {!purchase.voided && purchase.balance > 0 && <IconButton icon={Banknote} label="Record payment" onClick={() => setPaying(purchase)} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState icon={Search} title="No purchases found" description="Try another period, supplier or status." />}
      </Card>

      {creating && <PurchaseForm data={data} onClose={() => setCreating(false)} onSave={createPurchase} />}
      {details && <PurchaseDetails purchase={details} data={data} onClose={() => setDetails(null)} onPay={setPaying} onVoid={setVoiding} onEditNotes={(purchase) => { setEditingNotes(purchase); setNotes(purchase.notes) }} />}
      {paying && <PaymentDialog purchase={paying} onClose={() => setPaying(null)} />}
      {voiding && <ConfirmDialog open onClose={() => setVoiding(null)} onConfirm={voidPurchase} danger title="Void this purchase?" description={`Voiding ${voiding.reference} will reverse its inventory effects and mark it as voided. The audit record is preserved.`} confirmLabel="Void purchase" />}
      {editingNotes && (
        <Modal open onClose={() => setEditingNotes(null)} title="Edit purchase notes" size="sm" footer={<><Button onClick={() => setEditingNotes(null)}>Cancel</Button><Button variant="primary" onClick={saveNotes}>Save notes</Button></>}>
          <Field label="Notes"><textarea className="input min-h-24" value={notes} onChange={(event) => setNotes(event.target.value)} autoFocus /></Field>
        </Modal>
      )}
    </div>
  )
}
