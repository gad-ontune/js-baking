import { useMemo, useState } from 'react'
import { Banknote, Eye, Plus, ReceiptText, RotateCcw, Search, ShoppingBag } from 'lucide-react'
import { useStore } from '../lib/store'
import { financialSummary, salesByPaymentMethod } from '../../lib/analytics'
import { formatDate, formatDateTime, inRange, money, number, periodRange, uid } from '../../lib/format'
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

const blankLine = () => ({ productId: '', quantity: 1, unitPrice: 0 })

function SaleForm({ data, onClose, onSave, error: externalError }) {
  const activeProducts = data.products.filter((product) => !product.archived)
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 16),
    lines: [blankLine()],
    discount: 0,
    paymentMethod: 'Cash',
    notes: '',
  })
  const [error, setError] = useState('')

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const setLine = (index, key, value) => setForm((current) => ({
    ...current,
    lines: current.lines.map((line, lineIndex) => {
      if (lineIndex !== index) return line
      if (key === 'productId') {
        const product = data.products.find((candidate) => candidate.id === value)
        return { ...line, productId: value, unitPrice: product?.price || 0 }
      }
      return { ...line, [key]: value }
    }),
  }))

  const subtotal = form.lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0)
  const total = subtotal - Number(form.discount || 0)
  const cost = form.lines.reduce((sum, line) => {
    const product = data.products.find((candidate) => candidate.id === line.productId)
    return sum + Number(line.quantity || 0) * (product?.cost || 0)
  }, 0)

  const submit = () => {
    const validLines = form.lines.filter((line) => line.productId && Number(line.quantity) > 0)
    if (!validLines.length) return setError('Add at least one product to the sale.')
    if (Number(form.discount) < 0) return setError('Discount cannot be negative.')
    if (total < 0) return setError('Discount cannot exceed the sale total.')

    for (const line of validLines) {
      const product = data.products.find((candidate) => candidate.id === line.productId)
      if (product?.trackedItemId) {
        const item = data.inventory.find((candidate) => candidate.id === product.trackedItemId)
        if (item.quantity < Number(line.quantity)) {
          return setError(`Not enough ${item.name} stock. Available: ${number(item.quantity)} ${item.unit}.`)
        }
      }
    }

    onSave({
      ...form,
      lines: validLines.map((line) => {
        const product = data.products.find((candidate) => candidate.id === line.productId)
        const quantity = Number(line.quantity)
        const unitPrice = Number(line.unitPrice)
        return { productId: product.id, name: product.name, quantity, unitPrice, unitCost: product.cost, subtotal: quantity * unitPrice }
      }),
      discount: Number(form.discount || 0),
      subtotal,
      total,
      cost,
    })
  }

  const displayError = error || externalError

  return (
    <Modal
      open
      onClose={onClose}
      title="Record a sale"
      description="Completed sales update revenue and finished-product stock."
      size="lg"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={ReceiptText} onClick={submit}>Complete sale</Button></>}
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date and time"><input type="datetime-local" className="input" value={form.date} onChange={(event) => set('date', event.target.value)} /></Field>
          <Field label="Payment method">
            <Select value={form.paymentMethod} onChange={(event) => set('paymentMethod', event.target.value)}>
              {data.config.paymentMethods.map((method) => <option key={method}>{method}</option>)}
            </Select>
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="label mb-0">Products sold</p>
            <Button size="sm" icon={Plus} onClick={() => set('lines', [...form.lines, blankLine()])}>Add product</Button>
          </div>
          <div className="space-y-2">
            {form.lines.map((line, index) => {
              const product = data.products.find((candidate) => candidate.id === line.productId)
              const available = product?.trackedItemId ? data.inventory.find((item) => item.id === product.trackedItemId)?.quantity : null
              return (
                <div key={index} className="grid gap-2 rounded-xl border border-line bg-[#FCFAF7] p-2 sm:grid-cols-[1.5fr_0.7fr_0.9fr_auto]">
                  <Select value={line.productId} onChange={(event) => setLine(index, 'productId', event.target.value)}>
                    <option value="">Select product…</option>
                    {activeProducts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </Select>
                  <div>
                    <input type="number" min="1" step="1" className="input" placeholder="Qty" value={line.quantity} onChange={(event) => setLine(index, 'quantity', event.target.value)} />
                    {available !== null && available !== undefined && <p className="mt-1 text-[10px] text-muted">Stock: {number(available)}</p>}
                  </div>
                  <input type="number" min="0" step="0.01" className="input" placeholder="Unit price" value={line.unitPrice} onChange={(event) => setLine(index, 'unitPrice', event.target.value)} />
                  <div className="flex items-center gap-2">
                    <span className="num min-w-[70px] text-right text-sm font-semibold">{money(line.quantity * line.unitPrice)}</span>
                    <IconButton icon={RotateCcw} label="Remove line" onClick={() => set('lines', form.lines.filter((_, lineIndex) => lineIndex !== index))} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Discount (KES)"><input type="number" min="0" className="input" value={form.discount} onChange={(event) => set('discount', event.target.value)} /></Field>
          <Field label="Notes" className="sm:col-span-2"><input className="input" value={form.notes} onChange={(event) => set('notes', event.target.value)} placeholder="Optional" /></Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-[#FCFAF7] p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-muted">Subtotal</p><p className="num font-semibold">{money(subtotal)}</p></div>
          <div className="rounded-xl bg-leaf-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-leaf-700">Sale total</p><p className="num font-display text-xl font-semibold text-leaf-700">{money(total)}</p></div>
          <div className="rounded-xl bg-bakery-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-bakery-700">Recorded COGS</p><p className="num font-semibold text-bakery-800">{money(cost)}</p></div>
        </div>
        {displayError && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{displayError}</p>}
      </div>
    </Modal>
  )
}

function SaleDetails({ sale, data, onClose, onVoid }) {
  const userName = (id) => data.users.find((user) => user.id === id)?.name || 'System'
  return (
    <Modal
      open
      onClose={onClose}
      title={`Sale ${sale.reference}`}
      description={formatDateTime(sale.date)}
      size="md"
      footer={<>{!sale.voided && <Button variant="danger" icon={RotateCcw} onClick={() => onVoid(sale)}>Void sale</Button>}<Button onClick={onClose}>Close</Button></>}
    >
      {sale.voided && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">This sale is voided and excluded from revenue reports.</div>}
      <div className="table-wrap mb-4">
        <table className="data-table">
          <thead><tr><th>Product</th><th>Qty</th><th>Unit price</th><th>Subtotal</th></tr></thead>
          <tbody>{sale.items.map((line, index) => <tr key={index}><td className="font-semibold">{line.name}</td><td className="num">{line.quantity}</td><td className="num">{money(line.unitPrice)}</td><td className="num font-semibold">{money(line.subtotal)}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="space-y-2 rounded-xl bg-[#FCFAF7] p-4 text-sm">
        <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="num">{money(sale.subtotal)}</span></div>
        <div className="flex justify-between"><span className="text-muted">Discount</span><span className="num text-red-600">−{money(sale.discount)}</span></div>
        <div className="flex justify-between border-t border-line pt-2 font-bold"><span>Total</span><span className="num text-leaf-600">{money(sale.total)}</span></div>
        <div className="flex justify-between"><span className="text-muted">Recorded COGS</span><span className="num">{money(sale.cost || 0)}</span></div>
        <div className="flex justify-between"><span className="text-muted">Payment method</span><Badge tone="bakery">{sale.paymentMethod}</Badge></div>
        <div className="flex justify-between"><span className="text-muted">Recorded by</span><span>{userName(sale.createdBy)}</span></div>
      </div>
    </Modal>
  )
}

export default function Sales() {
  const { data, mutate, addAudit, notify } = useStore()
  const [period, setPeriod] = useState('30d')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [search, setSearch] = useState('')
  const [productFilter, setProductFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [showVoided, setShowVoided] = useState(false)
  const [creating, setCreating] = useState(false)
  const [details, setDetails] = useState(null)
  const [voiding, setVoiding] = useState(null)
  const [formError, setFormError] = useState('')

  const range = useMemo(() => periodRange(period, custom), [period, custom])
  const summary = useMemo(() => financialSummary(data, range), [data, range])
  const paymentBreakdown = useMemo(() => salesByPaymentMethod(data, range), [data, range])
  const filtered = useMemo(() => data.sales.filter((sale) => {
    if (!inRange(sale.date, range)) return false
    if (sale.voided && !showVoided) return false
    if (paymentFilter !== 'all' && sale.paymentMethod !== paymentFilter) return false
    if (productFilter !== 'all' && !sale.items.some((line) => line.productId === productFilter)) return false
    return `${sale.reference} ${sale.items.map((line) => line.name).join(' ')} ${sale.notes}`.toLowerCase().includes(search.toLowerCase())
  }), [data.sales, range, showVoided, paymentFilter, productFilter, search])

  const createSale = (form) => {
    const reference = `SAL-${new Date().getFullYear()}-${String(data.sales.length + 1).padStart(3, '0')}`
    const date = new Date(form.date).toISOString()
    mutate((draft) => {
      draft.sales.unshift({
        id: uid('sal'), reference, date, items: form.lines, subtotal: form.subtotal, discount: form.discount,
        total: form.total, cost: form.cost, paymentMethod: form.paymentMethod, notes: form.notes,
        voided: false, createdBy: draft.sessionUserId, createdAt: new Date().toISOString(),
      })
      form.lines.forEach((line) => {
        const product = draft.products.find((candidate) => candidate.id === line.productId)
        if (!product?.trackedItemId) return
        const item = draft.inventory.find((candidate) => candidate.id === product.trackedItemId)
        const previous = item.quantity
        item.quantity = previous - line.quantity
        item.updatedAt = date
        draft.movements.unshift({
          id: uid('mov'), itemId: item.id, type: 'Sale', quantity: -line.quantity, previousQuantity: previous,
          newQuantity: item.quantity, date, userId: draft.sessionUserId,
          reason: `Sale ${reference} — ${product.name}`, reference,
        })
      })
      addAudit(draft, 'SALE_RECORDED', 'Sale', `${reference} recorded for ${money(form.total)}`)
    })
    notify('Sale completed. Revenue and stock updated.')
    setCreating(false)
    setFormError('')
  }

  const voidSale = () => {
    mutate((draft) => {
      const sale = draft.sales.find((entry) => entry.id === voiding.id)
      sale.voided = true
      sale.items.forEach((line) => {
        const product = draft.products.find((candidate) => candidate.id === line.productId)
        if (!product?.trackedItemId) return
        const item = draft.inventory.find((candidate) => candidate.id === product.trackedItemId)
        const previous = item.quantity
        item.quantity = previous + line.quantity
        item.updatedAt = new Date().toISOString()
        draft.movements.unshift({
          id: uid('mov'), itemId: item.id, type: 'Adjustment', quantity: line.quantity, previousQuantity: previous,
          newQuantity: item.quantity, date: new Date().toISOString(), userId: draft.sessionUserId,
          reason: `Reversal of voided sale ${sale.reference}`, reference: `VOID-${sale.reference}`,
        })
      })
      addAudit(draft, 'SALE_VOIDED', 'Sale', `${sale.reference} voided and stock restored`)
    })
    notify('Sale voided. Stock and reports updated.')
    setVoiding(null)
    setDetails(null)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Revenue"
        title="Sales"
        subtitle="Record daily sales and keep finished-product stock in sync."
        actions={<Button variant="primary" icon={Plus} onClick={() => { setCreating(true); setFormError('') }}>Record sale</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sales revenue" value={money(summary.revenue)} hint={`${summary.salesCount} valid transactions`} icon={Banknote} tone="leaf" />
        <StatCard label="Average sale" value={money(summary.salesCount ? summary.revenue / summary.salesCount : 0)} icon={ShoppingBag} tone="bakery" />
        <StatCard label="Recorded COGS" value={money(summary.cogs)} hint="From configured product costs" icon={ReceiptText} tone="slate" />
        <StatCard label="Gross profit" value={money(summary.grossProfit)} hint={`${summary.grossMargin.toFixed(1)}% margin`} icon={Banknote} tone="leaf" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Search sale reference or product…" />
            <PeriodPicker period={period} onPeriodChange={setPeriod} custom={custom} onCustomChange={setCustom} />
            <Select value={productFilter} onChange={(event) => setProductFilter(event.target.value)}>
              <option value="all">All products</option>
              {data.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </Select>
            <Select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}>
              <option value="all">All payment methods</option>
              {data.config.paymentMethods.map((method) => <option key={method}>{method}</option>)}
            </Select>
          </div>
        </Card>
        <Card className="p-4">
          <p className="label">Revenue by payment method</p>
          <div className="space-y-2">
            {paymentBreakdown.map((entry) => (
              <div key={entry.name} className="flex items-center justify-between text-xs">
                <span className="text-muted">{entry.name}</span>
                <span className="num font-semibold">{money(entry.value)}</span>
              </div>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-xs text-muted">
            <input type="checkbox" checked={showVoided} onChange={(event) => setShowVoided(event.target.checked)} className="accent-bakery-600" />
            Show voided sales
          </label>
        </Card>
      </div>

      <Card>
        <div className="border-b border-line px-5 py-4"><h2 className="font-display text-lg font-semibold">Sales history</h2><p className="text-xs text-muted">{filtered.length} transactions</p></div>
        {filtered.length ? (
          <div className="table-wrap m-4">
            <table className="data-table">
              <thead><tr><th>Reference</th><th>Date & time</th><th>Products</th><th>Items</th><th>Payment</th><th>Total</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {filtered.map((sale) => (
                  <tr key={sale.id}>
                    <td className="font-semibold">{sale.reference}</td>
                    <td className="whitespace-nowrap text-xs text-muted">{formatDateTime(sale.date)}</td>
                    <td className="max-w-[220px] truncate text-xs">{sale.items.map((line) => line.name).join(', ')}</td>
                    <td className="text-muted">{sale.items.reduce((sum, line) => sum + line.quantity, 0)}</td>
                    <td><Badge tone="bakery">{sale.paymentMethod}</Badge></td>
                    <td className="num font-bold text-leaf-600">{money(sale.total)}</td>
                    <td><StatusPill status={sale.voided ? 'Voided' : 'Completed'} /></td>
                    <td><div className="flex justify-end gap-1"><IconButton icon={Eye} label="View sale" onClick={() => setDetails(sale)} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState icon={Search} title="No sales found" description="Try another period, product or payment method." />}
      </Card>

      {creating && <SaleForm data={data} onClose={() => setCreating(false)} onSave={createSale} error={formError} />}
      {details && <SaleDetails sale={details} data={data} onClose={() => setDetails(null)} onVoid={setVoiding} />}
      {voiding && <ConfirmDialog open onClose={() => setVoiding(null)} onConfirm={voidSale} danger title="Void this sale?" description={`Voiding ${voiding.reference} will remove it from revenue reports and restore finished-product stock. The audit record is preserved.`} confirmLabel="Void sale" />}
    </div>
  )
}
