import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Factory, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useStore } from '../../lib/store'
import { productionSummary } from '../../lib/analytics'
import { formatDate, inRange, number, periodRange, uid } from '../../lib/format'
import { isFiniteNumber, isValidDateValue } from '../../lib/security'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, IconButton, Modal, PageHeader, PeriodPicker, SearchInput, Select, StatCard } from '../../components/ui'

const blankRecord = () => ({
  productName: '', category: 'Cakes', quantity: 1, date: new Date().toISOString().slice(0, 10),
  description: '', notes: '',
})

export default function Production() {
  const { data, mutate, addAudit, notify } = useStore()
  const [period, setPeriod] = useState('30d')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [search, setSearch] = useState('')
  const [productFilter, setProductFilter] = useState('all')
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [reversalReason, setReversalReason] = useState('')

  const range = useMemo(() => periodRange(period, custom), [period, custom])
  const summary = useMemo(() => productionSummary(data, range), [data, range])
  const filtered = useMemo(() => summary.records.filter((record) => {
    if (productFilter !== 'all' && record.productName !== productFilter) return false
    return `${record.productName} ${record.category} ${record.description}`.toLowerCase().includes(search.toLowerCase())
  }), [summary.records, productFilter, search])

  const productNames = useMemo(() => [...new Set(data.production.map((record) => record.productName))].sort(), [data.production])
  const userName = (id) => data.users.find((user) => user.id === id)?.name || 'System'

  const save = (form) => {
    if (!String(form.productName || '').trim()) return notify('Product name is required.', 'error')
    if (!isFiniteNumber(form.quantity) || Number(form.quantity) <= 0) return notify('Enter a valid quantity greater than zero.', 'error')
    if (!isValidDateValue(form.date)) return notify('Enter a valid date.', 'error')
    if (editing) {
      mutate((draft) => {
        Object.assign(draft.production.find((record) => record.id === editing.id), form, { date: new Date(form.date).toISOString() })
        addAudit(draft, 'PRODUCTION_UPDATED', 'Production', `${form.quantity} × ${form.productName} record corrected`)
      })
      notify('Production record updated.')
      setEditing(null)
    } else {
      mutate((draft) => {
        draft.production.unshift({
          ...form, id: uid('prd'), date: new Date(form.date).toISOString(),
          recordedBy: draft.sessionUserId, createdAt: new Date().toISOString(),
        })
        addAudit(draft, 'PRODUCTION_CREATED', 'Production', `${form.quantity} × ${form.productName} recorded`)
      })
      notify('Production record added.')
      setCreating(false)
    }
  }

  const reverse = () => {
    if (!reversalReason.trim()) return notify('A reversal reason is required.', 'error')
    mutate((draft) => {
      const target = draft.production.find((record) => record.id === deleting.id)
      target.reversed = true
      target.reversalReason = reversalReason.trim()
      target.reversedAt = new Date().toISOString()
      target.reversedBy = draft.sessionUserId
      addAudit(draft, 'PRODUCTION_REVERSED', 'Production', `${deleting.productName} record reversed: ${reversalReason.trim()}`)
    })
    notify('Production record reversed and preserved in history.')
    setDeleting(null)
    setReversalReason('')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Kitchen records"
        title="Production"
        subtitle="A simple history of what the bakery prepared each day."
        actions={<Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Add production record</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Units produced" value={number(summary.totalUnits)} hint="In selected period" icon={Factory} tone="bakery" />
        <StatCard label="Production records" value={number(summary.recordCount)} icon={Factory} tone="slate" />
        <StatCard label="Top product" value={summary.byProduct[0]?.name || '—'} hint={summary.byProduct[0] ? `${number(summary.byProduct[0].quantity)} units` : ''} icon={Factory} tone="leaf" />
        <StatCard label="Products recorded" value={number(summary.byProduct.length)} icon={Factory} tone="amber" />
      </div>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-display text-lg font-semibold">Production by product</h2><p className="text-xs text-muted">Units recorded in the selected period</p></div>
          <PeriodPicker period={period} onPeriodChange={setPeriod} custom={custom} onCustomChange={setCustom} />
        </div>
        <div className="h-64">
          {summary.byProduct.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.byProduct.slice(0, 8)} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0EAE2" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#7A6F66' }} axisLine={false} tickLine={false} interval={0} angle={-18} textAnchor="end" height={52} />
                <YAxis tick={{ fontSize: 11, fill: '#7A6F66' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ border: '1px solid #E9E1D7', borderRadius: 12, fontSize: 12 }} formatter={(value) => [`${value} units`, 'Produced']} cursor={{ fill: '#FBF5EE' }} />
                <Bar dataKey="quantity" fill="#CB8659" radius={[5, 5, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState icon={Factory} title="No production in this period" description="Add a record to see production summaries." />}
        </div>
      </Card>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search production records…" />
          <Select value={productFilter} onChange={(event) => setProductFilter(event.target.value)}>
            <option value="all">All products</option>
            {productNames.map((name) => <option key={name}>{name}</option>)}
          </Select>
          <div className="rounded-xl border border-line bg-bakery-50 px-3 py-2.5 text-xs text-bakery-900">Production records do not change ingredient stock automatically.</div>
        </div>
      </Card>

      <Card>
        <div className="border-b border-line px-5 py-4"><h2 className="font-display text-lg font-semibold">Production history</h2><p className="text-xs text-muted">{filtered.length} records</p></div>
        {filtered.length ? (
          <div className="table-wrap m-4">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Product</th><th>Category</th><th>Quantity</th><th>Description</th><th>Recorded by</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {filtered.map((record) => (
                  <tr key={record.id}>
                    <td className="whitespace-nowrap text-xs text-muted">{formatDate(record.date)}</td>
                    <td className="font-semibold">{record.productName}</td>
                    <td><Badge tone="bakery">{record.category}</Badge></td>
                    <td className="num font-bold">{number(record.quantity)}</td>
                    <td className="max-w-[260px] truncate text-xs text-muted">{record.description || '—'}</td>
                    <td className="text-xs text-muted">{userName(record.recordedBy)}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <IconButton icon={Pencil} label="Edit record" onClick={() => setEditing(record)} />
                        <IconButton icon={Trash2} label="Reverse record" onClick={() => { setDeleting(record); setReversalReason('') }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState icon={Search} title="No matching records" description="Try changing the product filter or search term." />}
      </Card>

      {(creating || editing) && <ProductionForm record={editing} config={data.config} onClose={() => { setCreating(false); setEditing(null) }} onSave={save} />}
      {deleting && (
        <ConfirmDialog
          open
          onClose={() => setDeleting(null)}
          onConfirm={reverse}
          danger
          title="Reverse this production record?"
          description={`The record for ${number(deleting.quantity)} × ${deleting.productName} will be excluded from totals but preserved in the audit trail.`}
          confirmLabel="Reverse record"
        >
          <div className="w-full"><Field label="Reason for reversal"><input className="input" value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} autoFocus /></Field></div>
        </ConfirmDialog>
      )}
    </div>
  )
}

function ProductionForm({ record, config, onClose, onSave }) {
  const [form, setForm] = useState(() => record ? { ...record, date: record.date.slice(0, 10) } : blankRecord())
  const [error, setError] = useState('')
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const submit = () => {
    if (!form.productName.trim()) return setError('Product name is required.')
    if (!isFiniteNumber(form.quantity) || Number(form.quantity) <= 0) return setError('Quantity must be greater than zero.')
    onSave({ ...form, productName: form.productName.trim(), quantity: Number(form.quantity) })
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={record ? 'Edit production record' : 'Add production record'}
      description="Record what was prepared — ingredient stock is not affected."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Save record</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Product name" className="sm:col-span-2" error={error}><input className="input" value={form.productName} onChange={(event) => set('productName', event.target.value)} placeholder="e.g. Birthday Cake" autoFocus /></Field>
        <Field label="Product category">
          <Select value={form.category} onChange={(event) => set('category', event.target.value)}>
            {config.productCategories.map((category) => <option key={category}>{category}</option>)}
          </Select>
        </Field>
        <Field label="Quantity produced"><input type="number" min="1" className="input" value={form.quantity} onChange={(event) => set('quantity', event.target.value)} /></Field>
        <Field label="Production date" className="sm:col-span-2"><input type="date" className="input" value={form.date} onChange={(event) => set('date', event.target.value)} /></Field>
        <Field label="Description" className="sm:col-span-2"><input className="input" value={form.description} onChange={(event) => set('description', event.target.value)} placeholder="e.g. Prepared for weekend orders" /></Field>
        <Field label="Notes" className="sm:col-span-2"><textarea className="input min-h-20" value={form.notes} onChange={(event) => set('notes', event.target.value)} /></Field>
      </div>
    </Modal>
  )
}
