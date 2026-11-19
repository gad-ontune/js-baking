import { useMemo, useState } from 'react'
import { Banknote, Eye, Plus, ReceiptText, RotateCcw, Search, ShoppingBag } from 'lucide-react'
import { useStore } from '../../lib/store'
import { financialSummary, salesByPaymentMethod } from '../../lib/analytics'
import { formatDate, formatDateTime, inRange, money, number, periodRange } from '../../lib/format'
import { isFiniteNumber, isValidDateValue } from '../../lib/security'
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

const blankLine = () => ({ productId: '', productName: '', quantity: 1, unitPrice: 0 })

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
    lines: current.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, [key]: value } : line)),
  }))

  const findProduct = (line) =>
    data.products.find((product) => product.id === line.productId)
    || data.products.find((product) => product.name.toLowerCase() === line.productName?.trim().toLowerCase())

  const handleProductName = (index, value) => {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => {
        if (lineIndex !== index) return line
        const match = data.products.find((product) => product.name.toLowerCase() === value.trim().toLowerCase())
        return {
          ...line,
          productName: value,
          productId: match?.id || '',
          unitPrice: match ? match.price : line.unitPrice,
        }
      }),
    }))
  }

  const subtotal = form.lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0)
  const total = subtotal - Number(form.discount || 0)
  const cost = form.lines.reduce((sum, line) => sum + Number(line.quantity || 0) * (findProduct(line)?.cost || 0), 0)
  const newProductCount = form.lines.filter((line) => line.productName?.trim() && !findProduct(line)).length

  const submit = () => {
    if (!isValidDateValue(form.date)) return setError('Enter a valid sale date and time.')
    if (!isFiniteNumber(form.discount) || Number(form.discount) < 0) return setError('Enter a valid discount.')
    if (!form.lines.every((line) => isFiniteNumber(line.quantity) && isFiniteNumber(line.unitPrice))) {
      return setError('Enter a valid quantity and price for every sale line.')
    }
    const validLines = form.lines.filter((line) => line.productName?.trim() && Number(line.quantity) > 0)
    if (!validLines.length) return setError('Add at least one product to the sale.')
    if (validLines.some((line) => Number(line.unitPrice) <= 0)) return setError('Product prices must be greater than zero.')
    if (total < 0) return setError('Discount cannot exceed the sale total.')

    for (const line of validLines) {
      const product = findProduct(line)
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
        const product = findProduct(line)
        const name = product?.name || line.productName.trim()
        const quantity = Number(line.quantity)
        const unitPrice = Number(line.unitPrice)
        return {
          productId: product?.id || '',
          productName: name,
          name,
          quantity,
          unitPrice,
          unitCost: product?.cost || 0,
          subtotal: quantity * unitPrice,
        }
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
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="label mb-0">Products sold</p>
              <p className="mt-1 text-[11px] text-muted">Type a product name — choose an existing one or enter a new product.</p>
            </div>
            <Button size="sm" icon={Plus} onClick={() => set('lines', [...form.lines, blankLine()])}>Add product</Button>
          </div>
          <datalist id="sale-product-options">
            {activeProducts.map((item) => <option key={item.id} value={item.name} />)}
          </datalist>
          <div className="space-y-2">
            {form.lines.map((line, index) => {
              const product = findProduct(line)
              const available = product?.trackedItemId ? data.inventory.find((item) => item.id === product.trackedItemId)?.quantity : null
              const isNew = Boolean(line.productName?.trim()) && !product
              return (
                <div key={index} className="grid gap-2 rounded-xl border border-line bg-[#FCFAF7] p-2 sm:grid-cols-[1.5fr_0.7fr_0.9fr_auto]">
                  <div>
                    <input
                      list="sale-product-options"
                      className="input"
                      placeholder="Type or choose product…"
                      value={line.productName}
                      onChange={(event) => handleProductName(index, event.target.value)}
                    />
                    <div className="mt-1 flex items-center gap-2">
                      {isNew && <span className="text-[10px] font-bold uppercase tracking-wide text-bakery-700">New product</span>}
                      {available !== null && available !== undefined && <span className="text-[10px] text-muted">Stock: {number(available)}</span>}
                    </div>
                  </div>
                  <input type="number" min="1" step="1" className="input" placeholder="Qty" value={line.quantity} onChange={(event) => setLine(index, 'quantity', event.target.value)} />
                  <input type="number" min="0" step="0.01" className="input" placeholder="Unit price" value={line.unitPrice} onChange={(event) => setLine(index, 'unitPrice', event.target.value)} />
                  <div className="flex items-center gap-2">
                    <span className="num min-w-[70px] text-right text-sm font-semibold">{money(line.quantity * line.unitPrice)}</span>
                    <IconButton icon={RotateCcw} label="Remove line" onClick={() => set('lines', form.lines.filter((_, lineIndex) => lineIndex !== index))} />
                  </div>
                </div>
              )
            })}
          </div>
          {newProductCount > 0 && (
            <p className="mt-2 rounded-lg bg-bakery-50 px-3 py-2 text-[11px] text-bakery-800">
              {newProductCount} new product{newProductCount === 1 ? '' : 's'} will be added to your catalogue when this sale is completed.
            </p>
          )}
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
  const { data, businessWrite } = useStore()
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

  const createSale = async (form) => {
    const result = await businessWrite(
      (api) => api.createBusinessRecord('sale', {
        date: form.date,
        items: form.lines.map((line) => ({
          productId: line.productId || null,
          productName: line.productName || '',
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
        discount: form.discount,
        paymentMethod: form.paymentMethod,
        notes: form.notes,
      }),
      'Sale completed. Revenue and stock updated.',
    )
    if (result.ok) {
      setCreating(false)
      setFormError('')
    } else {
      setFormError(result.message)
    }
  }

  const voidSale = async () => {
    const result = await businessWrite(
      (api) => api.reverseBusinessRecord('sale', voiding.id, 'Sale voided by user'),
      'Sale voided. Stock and reports updated.',
    )
    if (result.ok) {
      setVoiding(null)
      setDetails(null)
    }
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
