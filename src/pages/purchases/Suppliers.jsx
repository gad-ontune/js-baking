import { useMemo, useState } from 'react'
import { Archive, Building2, Eye, Mail, MapPin, Pencil, Phone, Plus, Search, Truck } from 'lucide-react'
import { useStore } from '../../lib/store'
import { supplierBalances } from '../../lib/analytics'
import { formatDate, money, number } from '../../lib/format'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, IconButton, Modal, PageHeader, SearchInput, Select, StatCard, StatusPill } from '../../components/ui'

const blankSupplier = { name: '', businessName: '', phone: '', email: '', location: '', description: '', status: 'Active' }

export default function Suppliers() {
  const { data, businessWrite, notify } = useStore()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const [viewing, setViewing] = useState(null)
  const [archiving, setArchiving] = useState(null)

  const balances = useMemo(() => supplierBalances(data), [data])
  const filtered = useMemo(() => balances.filter(({ supplier }) => {
    if (status !== 'all' && supplier.status !== status) return false
    return `${supplier.name} ${supplier.businessName} ${supplier.phone} ${supplier.location}`.toLowerCase().includes(search.toLowerCase())
  }), [balances, search, status])

  const totals = useMemo(() => ({
    suppliers: data.suppliers.length,
    active: data.suppliers.filter((supplier) => supplier.status === 'Active').length,
    spend: balances.reduce((sum, entry) => sum + entry.total, 0),
    balance: balances.reduce((sum, entry) => sum + entry.balance, 0),
  }), [data.suppliers, balances])

  const save = async (form) => {
    if (!form.name.trim()) return notify('Supplier name is required.', 'error')
    const payload = {
      name: form.name.trim(),
      businessName: form.businessName,
      phone: form.phone,
      email: form.email,
      location: form.location,
      description: form.description,
    }
    if (editing) {
      const result = await businessWrite(
        (api) => api.updateBusinessRecord('supplier', editing.id, payload),
        'Supplier updated.',
      )
      if (result.ok) setEditing(null)
    } else {
      const result = await businessWrite(
        (api) => api.createBusinessRecord('supplier', payload),
        'Supplier added.',
      )
      if (result.ok) setCreating(false)
    }
  }

  const toggleArchive = async () => {
    const nextStatus = archiving.status === 'Active' ? 'Inactive' : 'Active'
    const result = await businessWrite(
      (api) => api.updateBusinessRecord('supplier', archiving.id, { status: nextStatus }),
      'Supplier status updated.',
    )
    if (result.ok) setArchiving(null)
  }

  const supplierForm = (editing || creating) && (
    <SupplierForm
      supplier={editing}
      onClose={() => { setEditing(null); setCreating(false) }}
      onSave={save}
    />
  )

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Supplier management"
        title="Suppliers"
        subtitle="Keep supplier contacts, purchase history and balances together."
        actions={<Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Add supplier</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total suppliers" value={number(totals.suppliers)} icon={Truck} tone="bakery" />
        <StatCard label="Active suppliers" value={number(totals.active)} icon={Building2} tone="leaf" />
        <StatCard label="Total spend" value={money(totals.spend)} icon={Truck} tone="slate" />
        <StatCard label="Outstanding" value={money(totals.balance)} icon={Phone} tone="red" />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <SearchInput value={search} onChange={setSearch} placeholder="Search suppliers…" />
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option><option>Active</option><option>Inactive</option>
          </Select>
        </div>
      </Card>

      <Card>
        <div className="border-b border-line px-5 py-4"><h2 className="font-display text-lg font-semibold">Supplier directory</h2><p className="text-xs text-muted">{filtered.length} suppliers</p></div>
        {filtered.length ? (
          <div className="table-wrap m-4">
            <table className="data-table">
              <thead><tr><th>Supplier</th><th>Contact</th><th>Location</th><th>Purchases</th><th>Total spend</th><th>Balance</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {filtered.map(({ supplier, purchases: count, total, balance }) => (
                  <tr key={supplier.id}>
                    <td><p className="font-semibold">{supplier.name}</p><p className="text-xs text-muted">{supplier.businessName || '—'}</p></td>
                    <td><p className="text-xs">{supplier.phone}</p><p className="text-xs text-muted">{supplier.email || '—'}</p></td>
                    <td className="max-w-[180px] truncate text-xs text-muted">{supplier.location || '—'}</td>
                    <td className="text-muted">{count}</td>
                    <td className="num font-semibold">{money(total)}</td>
                    <td className={`num font-semibold ${balance > 0 ? 'text-red-600' : 'text-muted'}`}>{money(balance)}</td>
                    <td><StatusPill status={supplier.status} /></td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <IconButton icon={Eye} label="View details" onClick={() => setViewing(supplier)} />
                        <IconButton icon={Pencil} label="Edit supplier" onClick={() => setEditing(supplier)} />
                        <IconButton icon={Archive} label={supplier.status === 'Active' ? 'Deactivate' : 'Reactivate'} onClick={() => setArchiving(supplier)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState icon={Search} title="No suppliers found" description="Try changing your search or filters." />}
      </Card>

      {supplierForm}
      {viewing && <SupplierDetails supplier={viewing} data={data} onClose={() => setViewing(null)} />}
      {archiving && (
        <ConfirmDialog
          open
          onClose={() => setArchiving(null)}
          onConfirm={toggleArchive}
          title={archiving.status === 'Active' ? 'Deactivate this supplier?' : 'Reactivate this supplier?'}
          description="Existing purchase history will always remain available."
          confirmLabel={archiving.status === 'Active' ? 'Deactivate' : 'Reactivate'}
        />
      )}
    </div>
  )
}

function SupplierForm({ supplier, onClose, onSave }) {
  const [form, setForm] = useState(supplier || blankSupplier)
  const [error, setError] = useState('')
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const submit = () => {
    if (!form.name.trim()) return setError('Supplier name is required.')
    onSave(form)
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={supplier ? 'Edit supplier' : 'Add supplier'}
      size="md"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Save supplier</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact person" className="sm:col-span-2" error={error}><input className="input" value={form.name} onChange={(event) => set('name', event.target.value)} autoFocus /></Field>
        <Field label="Business name"><input className="input" value={form.businessName} onChange={(event) => set('businessName', event.target.value)} /></Field>
        <Field label="Phone number"><input className="input" value={form.phone} onChange={(event) => set('phone', event.target.value)} /></Field>
        <Field label="Email address"><input type="email" className="input" value={form.email} onChange={(event) => set('email', event.target.value)} /></Field>
        <Field label="Physical location"><input className="input" value={form.location} onChange={(event) => set('location', event.target.value)} /></Field>
        <Field label="Status"><Select value={form.status} onChange={(event) => set('status', event.target.value)}><option>Active</option><option>Inactive</option></Select></Field>
        <Field label="Description" className="sm:col-span-2"><textarea className="input min-h-20" value={form.description} onChange={(event) => set('description', event.target.value)} /></Field>
      </div>
    </Modal>
  )
}

function SupplierDetails({ supplier, data, onClose }) {
  const purchases = data.purchases.filter((purchase) => purchase.supplierId === supplier.id)
  const total = purchases.reduce((sum, purchase) => sum + purchase.total, 0)
  const balance = purchases.reduce((sum, purchase) => sum + purchase.balance, 0)
  return (
    <Modal open onClose={onClose} title={supplier.name} description={supplier.businessName || 'Supplier details'} size="lg" footer={<Button onClick={onClose}>Close</Button>}>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line p-3"><p className="label mb-1">Purchases</p><p className="font-display text-xl font-semibold">{purchases.length}</p></div>
        <div className="rounded-xl border border-line p-3"><p className="label mb-1">Total spend</p><p className="font-display text-xl font-semibold">{money(total)}</p></div>
        <div className="rounded-xl border border-line p-3"><p className="label mb-1">Balance</p><p className="font-display text-xl font-semibold text-red-600">{money(balance)}</p></div>
      </div>
      <div className="mb-5 grid gap-3 text-sm text-muted sm:grid-cols-2">
        <p className="flex items-center gap-2"><Phone size={15} /> {supplier.phone || '—'}</p>
        <p className="flex items-center gap-2"><Mail size={15} /> {supplier.email || '—'}</p>
        <p className="flex items-center gap-2"><MapPin size={15} /> {supplier.location || '—'}</p>
        <p className="flex items-center gap-2"><Badge tone="slate">Registered {formatDate(supplier.createdAt)}</Badge></p>
      </div>
      {supplier.description && <p className="mb-5 rounded-xl bg-bakery-50 p-3 text-sm text-bakery-900">{supplier.description}</p>}
      <p className="label">Purchase history</p>
      {purchases.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Reference</th><th>Date</th><th>Total</th><th>Balance</th><th>Status</th></tr></thead>
            <tbody>
              {purchases.map((purchase) => <tr key={purchase.id}><td className="font-semibold">{purchase.reference}</td><td className="text-xs text-muted">{formatDate(purchase.date)}</td><td className="num">{money(purchase.total)}</td><td className="num text-red-600">{money(purchase.balance)}</td><td><StatusPill status={purchase.voided ? 'Voided' : purchase.status} /></td></tr>)}
            </tbody>
          </table>
        </div>
      ) : <EmptyState icon={Truck} title="No purchases yet" description="Purchases for this supplier will appear here." />}
    </Modal>
  )
}
