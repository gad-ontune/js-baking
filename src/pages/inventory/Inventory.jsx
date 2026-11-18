import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  CircleAlert,
  History,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { inventorySummary, salesByProduct } from '../../lib/analytics'
import { compactMoney, formatDate, itemStatus, money, number, statusLabel, uid } from '../../lib/format'
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
  ProgressBar,
  SearchInput,
  Select,
  StatCard,
  StatusPill,
} from '../../components/ui'

const emptyForm = {
  name: '',
  code: '',
  category: 'Baking Ingredients',
  unit: 'kg',
  description: '',
  quantity: 0,
  minQuantity: 0,
  purchaseCost: 0,
  sellingPrice: '',
  expiryDate: '',
}

function ItemForm({ item, config, onSave, onClose }) {
  const [form, setForm] = useState(() => item ? { ...item, sellingPrice: item.sellingPrice ?? '' } : emptyForm)
  const [error, setError] = useState('')
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const submit = (event) => {
    event.preventDefault()
    if (!form.name.trim()) return setError('Item name is required.')
    if (Number(form.quantity) < 0) return setError('Quantity cannot be negative.')
    if (Number(form.minQuantity) < 0) return setError('Minimum threshold cannot be negative.')
    if (Number(form.purchaseCost) < 0) return setError('Purchase cost cannot be negative.')
    onSave({
      ...form,
      name: form.name.trim(),
      code: form.code.trim() || `INV-${Math.floor(1000 + Math.random() * 8999)}`,
      quantity: Number(form.quantity),
      minQuantity: Number(form.minQuantity),
      purchaseCost: Number(form.purchaseCost),
      sellingPrice: form.sellingPrice === '' ? null : Number(form.sellingPrice),
      expiryDate: form.expiryDate || '',
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={item ? 'Edit inventory item' : 'Add inventory item'}
      description={item ? 'Update item details and stock thresholds.' : 'Create a new stock item for the bakery.'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Save item</Button></>}
    >
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Item name" className="sm:col-span-2" error={error && !form.name ? error : ''}>
          <input className="input" value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="e.g. Mangoes" autoFocus />
        </Field>
        <Field label="Item code">
          <input className="input" value={form.code} onChange={(event) => set('code', event.target.value)} placeholder="Auto-generated" />
        </Field>
        <Field label="Category">
          <Select value={form.category} onChange={(event) => set('category', event.target.value)}>
            {config.inventoryCategories.map((category) => <option key={category}>{category}</option>)}
          </Select>
        </Field>
        <Field label="Unit of measurement">
          <Select value={form.unit} onChange={(event) => set('unit', event.target.value)}>
            {config.units.map((unit) => <option key={unit}>{unit}</option>)}
          </Select>
        </Field>
        <Field label="Expiry date" hint="Leave blank if not applicable">
          <input type="date" className="input" value={form.expiryDate} onChange={(event) => set('expiryDate', event.target.value)} />
        </Field>
        <Field label="Current quantity">
          <input type="number" min="0" step="0.01" className="input" value={form.quantity} onChange={(event) => set('quantity', event.target.value)} />
        </Field>
        <Field label="Minimum stock threshold">
          <input type="number" min="0" step="0.01" className="input" value={form.minQuantity} onChange={(event) => set('minQuantity', event.target.value)} />
        </Field>
        <Field label="Purchase cost per unit (KES)">
          <input type="number" min="0" step="0.01" className="input" value={form.purchaseCost} onChange={(event) => set('purchaseCost', event.target.value)} />
        </Field>
        <Field label="Selling price (KES)" hint="Optional, where applicable" className="sm:col-span-2">
          <input type="number" min="0" step="0.01" className="input" value={form.sellingPrice} onChange={(event) => set('sellingPrice', event.target.value)} placeholder="—" />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <textarea className="input min-h-20 resize-y" value={form.description} onChange={(event) => set('description', event.target.value)} placeholder="Optional notes about this item" />
        </Field>
        {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}

function MovementDialog({ item, onClose }) {
  const { mutate, addAudit, notify } = useStore()
  const [type, setType] = useState('Purchase')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [reference, setReference] = useState('')
  const [error, setError] = useState('')
  const warningDays = 14
  const status = itemStatus(item, warningDays)

  const submit = () => {
    const amount = Number(quantity)
    if (!Number.isFinite(amount) || amount < 0) return setError('Enter a valid quantity.')
    let delta = amount
    if (type === 'Adjustment') delta = amount - item.quantity
    else if (type !== 'Purchase') delta = -amount
    const nextQuantity = item.quantity + delta
    if (nextQuantity < 0) return setError('This movement would make stock negative. Use an adjustment to set the correct quantity.')

    mutate((draft) => {
      const target = draft.inventory.find((candidate) => candidate.id === item.id)
      const previous = target.quantity
      target.quantity = Number(nextQuantity.toFixed(2))
      target.updatedAt = new Date().toISOString()
      draft.movements.unshift({
        id: uid('mov'),
        itemId: item.id,
        type,
        quantity: Number(delta.toFixed(2)),
        previousQuantity: previous,
        newQuantity: target.quantity,
        date: new Date().toISOString(),
        userId: draft.sessionUserId,
        reason: reason.trim() || `${type} recorded from inventory`,
        reference: reference.trim() || uid('REF').toUpperCase(),
      })
      addAudit(draft, 'STOCK_MOVEMENT', 'Inventory', `${type} of ${item.name} (${delta > 0 ? '+' : ''}${delta} ${item.unit})`)
    })
    notify(`${item.name} stock updated successfully.`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Record stock movement`}
      description={`${item.name} · currently ${number(item.quantity)} ${item.unit}`}
      size="sm"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Record movement</Button></>}
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-line bg-[#FCFAF7] p-3 text-xs">
          <span className="text-muted">Current status: </span>
          <StatusPill status={status} />
        </div>
        <Field label="Movement type">
          <Select value={type} onChange={(event) => { setType(event.target.value); setQuantity('') }}>
            <option>Purchase</option>
            <option>Sale</option>
            <option>Wastage</option>
            <option>Adjustment</option>
            <option>Other</option>
          </Select>
        </Field>
        <Field label={type === 'Adjustment' ? 'New quantity' : 'Quantity'} hint={type === 'Adjustment' ? `Set the counted quantity. Current: ${number(item.quantity)} ${item.unit}` : `Number of ${item.unit} to ${type === 'Purchase' ? 'add' : 'remove'}`}>
          <input type="number" min="0" step="0.01" className="input" value={quantity} onChange={(event) => setQuantity(event.target.value)} autoFocus />
        </Field>
        <Field label="Reason / description">
          <textarea className="input min-h-20" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Delivery received, damaged goods, cycle count" />
        </Field>
        <Field label="Reference (optional)">
          <input className="input" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="e.g. ADJ-012" />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}

function MovementHistory({ item, movements, onClose }) {
  const history = movements.filter((movement) => movement.itemId === item.id)
  return (
    <Modal open onClose={onClose} title="Stock movement history" description={`${item.name} · ${item.code}`} size="lg" footer={<Button onClick={onClose}>Close</Button>}>
      {history.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Date</th><th>Type</th><th>Quantity</th><th>Previous</th><th>New</th><th>Reason</th><th>Reference</th></tr></thead>
            <tbody>
              {history.map((movement) => (
                <tr key={movement.id}>
                  <td className="whitespace-nowrap text-xs text-muted">{formatDate(movement.date, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td><Badge tone={movement.quantity >= 0 ? 'leaf' : 'amber'}>{movement.type}</Badge></td>
                  <td className={`num font-semibold ${movement.quantity >= 0 ? 'text-leaf-600' : 'text-red-600'}`}>{movement.quantity > 0 ? '+' : ''}{number(movement.quantity, 2)}</td>
                  <td className="num text-muted">{number(movement.previousQuantity, 2)}</td>
                  <td className="num font-semibold">{number(movement.newQuantity, 2)}</td>
                  <td className="max-w-[240px] truncate text-xs text-muted">{movement.reason}</td>
                  <td className="text-xs text-muted">{movement.reference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState icon={History} title="No movements yet" description="Stock changes will appear here once recorded." />}
    </Modal>
  )
}

export default function Inventory() {
  const { data, mutate, addAudit, notify } = useStore()
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState('all')
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const [movementItem, setMovementItem] = useState(null)
  const [historyItem, setHistoryItem] = useState(null)
  const [archiving, setArchiving] = useState(null)

  const stock = useMemo(() => inventorySummary(data), [data])
  const warningDays = data.business.expiryWarningDays || 14

  const filtered = useMemo(() => data.inventory.filter((item) => {
    if (!showArchived && item.archived) return false
    if (category !== 'all' && item.category !== category) return false
    const itemStatusValue = itemStatus(item, warningDays)
    if (status !== 'all' && itemStatusValue !== status) return false
    const haystack = `${item.name} ${item.code} ${item.category} ${item.description}`.toLowerCase()
    return haystack.includes(search.toLowerCase())
  }).sort((a, b) => a.name.localeCompare(b.name)), [data.inventory, search, category, status, showArchived, warningDays])

  const saveItem = (form) => {
    if (editing) {
      mutate((draft) => {
        const item = draft.inventory.find((candidate) => candidate.id === editing.id)
        Object.assign(item, form, { updatedAt: new Date().toISOString() })
        addAudit(draft, 'INVENTORY_UPDATED', 'Inventory', `${form.name} details updated`)
      })
      notify('Inventory item updated.')
      setEditing(null)
    } else {
      const id = uid('inv')
      mutate((draft) => {
        draft.inventory.unshift({ ...form, id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), archived: false })
        if (form.quantity > 0) {
          draft.movements.unshift({
            id: uid('mov'), itemId: id, type: 'Opening Stock', quantity: form.quantity,
            previousQuantity: 0, newQuantity: form.quantity, date: new Date().toISOString(),
            userId: draft.sessionUserId, reason: 'Opening stock entered with new item', reference: uid('REF').toUpperCase(),
          })
        }
        addAudit(draft, 'INVENTORY_CREATED', 'Inventory', `${form.name} added to inventory`)
      })
      notify('Inventory item added.')
      setCreating(false)
    }
  }

  const toggleArchive = () => {
    const item = archiving
    mutate((draft) => {
      const target = draft.inventory.find((candidate) => candidate.id === item.id)
      target.archived = !target.archived
      target.updatedAt = new Date().toISOString()
      addAudit(draft, target.archived ? 'INVENTORY_ARCHIVED' : 'INVENTORY_RESTORED', 'Inventory', `${item.name} ${target.archived ? 'archived' : 'restored'}`)
    })
    notify(`${item.name} ${item.archived ? 'restored' : 'archived'}.`)
    setArchiving(null)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Stock control"
        title="Inventory"
        subtitle="Manage ingredients, packaging and finished products in one place."
        actions={<Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Add item</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active items" value={number(stock.total)} hint="Currently tracked" icon={Package} tone="bakery" />
        <StatCard label="Low / out of stock" value={number(stock.low + stock.out)} hint="Need replenishment" icon={CircleAlert} tone="red" />
        <StatCard label="Expiry watch" value={number(stock.expiring + stock.expired)} hint={`Within ${warningDays} days or expired`} icon={Boxes} tone="amber" />
        <StatCard label="Inventory value" value={money(stock.value)} hint="At recorded purchase cost" icon={SlidersHorizontal} tone="leaf" />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_190px_170px_auto]">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name, code or category…" />
          <Select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">All categories</option>
            {data.config.inventoryCategories.map((value) => <option key={value}>{value}</option>)}
          </Select>
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="healthy">In stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
            <option value="expiring">Expiring soon</option>
            <option value="expired">Expired</option>
          </Select>
          <label className="flex items-center gap-2 whitespace-nowrap rounded-xl border border-line px-3 text-xs font-semibold text-muted">
            <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} className="accent-bakery-600" />
            Show archived
          </label>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold">All inventory items</h2>
            <p className="text-xs text-muted">Showing {filtered.length} of {data.inventory.length} items</p>
          </div>
          <Badge tone="bakery">{compactMoney(filtered.reduce((sum, item) => sum + item.quantity * item.purchaseCost, 0))} value</Badge>
        </div>
        {filtered.length ? (
          <div className="table-wrap m-4">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th><th>Category</th><th>Quantity</th><th>Unit cost</th><th>Value</th><th>Status</th><th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const statusValue = itemStatus(item, warningDays)
                  const ratio = item.minQuantity ? (item.quantity / item.minQuantity) * 100 : 100
                  return (
                    <tr key={item.id}>
                      <td>
                        <p className="font-semibold">{item.name}</p>
                        <p className="text-xs text-muted">{item.code} · {item.unit}</p>
                      </td>
                      <td className="text-xs text-muted">{item.category}</td>
                      <td className="min-w-[130px]">
                        <p className="num font-semibold">{number(item.quantity, 2)} <span className="text-xs font-normal text-muted">{item.unit}</span></p>
                        <div className="mt-1.5"><ProgressBar value={Math.min(ratio, 100)} tone={statusValue === 'low' || statusValue === 'out' ? 'red' : statusValue === 'expiring' ? 'amber' : 'leaf'} /></div>
                        <p className="mt-1 text-[10px] text-muted">Min {number(item.minQuantity, 2)}</p>
                      </td>
                      <td className="num">{money(item.purchaseCost)}</td>
                      <td className="num font-semibold">{compactMoney(item.quantity * item.purchaseCost)}</td>
                      <td><StatusPill status={statusValue} /></td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <IconButton icon={ArrowUpFromLine} label="Record movement" onClick={() => setMovementItem(item)} />
                          <IconButton icon={History} label="Movement history" onClick={() => setHistoryItem(item)} />
                          <IconButton icon={Pencil} label="Edit item" onClick={() => setEditing(item)} />
                          <IconButton icon={item.archived ? RotateCcw : Archive} label={item.archived ? 'Restore item' : 'Archive item'} onClick={() => setArchiving(item)} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Search} title="No items found" description="Try changing your search or filters." action={<Button onClick={() => { setSearch(''); setCategory('all'); setStatus('all') }}>Clear filters</Button>} />
        )}
      </Card>

      {(creating || editing) && <ItemForm item={editing} config={data.config} onSave={saveItem} onClose={() => { setCreating(false); setEditing(null) }} />}
      {movementItem && <MovementDialog item={movementItem} onClose={() => setMovementItem(null)} />}
      {historyItem && <MovementHistory item={historyItem} movements={data.movements} onClose={() => setHistoryItem(null)} />}
      {archiving && (
        <ConfirmDialog
          open
          onClose={() => setArchiving(null)}
          onConfirm={toggleArchive}
          danger={!archiving.archived}
          title={archiving.archived ? 'Restore this item?' : 'Archive this item?'}
          description={archiving.archived
            ? `${archiving.name} will become active again and appear in inventory reports.`
            : `${archiving.name} will be hidden from active inventory but kept in historical records.`}
          confirmLabel={archiving.archived ? 'Restore' : 'Archive'}
        />
      )}
    </div>
  )
}
