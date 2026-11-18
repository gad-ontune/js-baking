import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CircleDollarSign, Pencil, Plus, ReceiptText, Search, Trash2 } from 'lucide-react'
import { useStore } from '../../lib/store'
import { expensesByCategory, expensesInRange } from '../../lib/analytics'
import { compactMoney, formatDate, inRange, money, number, periodRange, uid } from '../../lib/format'
import { isFiniteNumber, isValidDateValue } from '../../lib/security'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, IconButton, Modal, PageHeader, PeriodPicker, SearchInput, Select, StatCard } from '../../components/ui'

const blankExpense = () => ({
  category: 'Electricity', description: '', amount: '', date: new Date().toISOString().slice(0, 10),
  paymentMethod: 'Cash', notes: '',
})

export default function Expenses() {
  const { data, mutate, addAudit, notify } = useStore()
  const [period, setPeriod] = useState('30d')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [payment, setPayment] = useState('all')
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [reversalReason, setReversalReason] = useState('')

  const range = useMemo(() => periodRange(period, custom), [period, custom])
  const inPeriod = useMemo(() => expensesInRange(data, range), [data, range])
  const byCategory = useMemo(() => expensesByCategory(data, range), [data, range])
  const filtered = useMemo(() => inPeriod.filter((expense) => {
    if (category !== 'all' && expense.category !== category) return false
    if (payment !== 'all' && expense.paymentMethod !== payment) return false
    return `${expense.reference} ${expense.description} ${expense.category} ${expense.notes}`.toLowerCase().includes(search.toLowerCase())
  }), [inPeriod, category, payment, search])

  const total = inPeriod.reduce((sum, expense) => sum + expense.amount, 0)
  const average = inPeriod.length ? total / inPeriod.length : 0
  const userName = (id) => data.users.find((user) => user.id === id)?.name || 'System'

  const save = (form) => {
    if (!String(form.description || '').trim()) return notify('Description is required.', 'error')
    if (!isFiniteNumber(form.amount) || Number(form.amount) <= 0) return notify('Enter a valid amount greater than zero.', 'error')
    if (!isValidDateValue(form.date)) return notify('Enter a valid date.', 'error')
    if (editing) {
      mutate((draft) => {
        Object.assign(draft.expenses.find((expense) => expense.id === editing.id), form, { amount: Number(form.amount) })
        addAudit(draft, 'EXPENSE_UPDATED', 'Expense', `${editing.reference} corrected`)
      })
      notify('Expense updated.')
      setEditing(null)
    } else {
      mutate((draft) => {
        draft.expenses.unshift({
          ...form, id: uid('exp'), reference: `EXP-${new Date().getFullYear()}-${String(draft.expenses.length + 1).padStart(3, '0')}`,
          amount: Number(form.amount), recordedBy: draft.sessionUserId, createdAt: new Date().toISOString(),
        })
        addAudit(draft, 'EXPENSE_RECORDED', 'Expense', `${form.description} — ${money(Number(form.amount))}`)
      })
      notify('Expense recorded.')
      setCreating(false)
    }
  }

  const reverse = () => {
    if (!reversalReason.trim()) return notify('A reversal reason is required.', 'error')
    mutate((draft) => {
      const target = draft.expenses.find((expense) => expense.id === deleting.id)
      target.reversed = true
      target.reversalReason = reversalReason.trim()
      target.reversedAt = new Date().toISOString()
      target.reversedBy = draft.sessionUserId
      addAudit(draft, 'EXPENSE_REVERSED', 'Expense', `${deleting.reference} reversed: ${reversalReason.trim()}`)
    })
    notify('Expense reversed and preserved in history.')
    setDeleting(null)
    setReversalReason('')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operating costs"
        title="Expenses"
        subtitle="Track every business cost with category, payment method and date."
        actions={<Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Add expense</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total expenses" value={money(total)} hint="In selected period" icon={CircleDollarSign} tone="red" />
        <StatCard label="Transactions" value={number(inPeriod.length)} icon={ReceiptText} tone="bakery" />
        <StatCard label="Average expense" value={money(average)} icon={CircleDollarSign} tone="slate" />
        <StatCard label="Top category" value={byCategory[0]?.name || '—'} hint={byCategory[0] ? money(byCategory[0].value) : ''} icon={ReceiptText} tone="amber" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div><h2 className="font-display text-lg font-semibold">Expenses by category</h2><p className="text-xs text-muted">Where operating costs are going</p></div>
            <PeriodPicker period={period} onPeriodChange={setPeriod} custom={custom} onCustomChange={setCustom} />
          </div>
          <div className="h-64">
            {byCategory.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCategory.slice(0, 7)} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0EAE2" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#7A6F66' }} axisLine={false} tickLine={false} interval={0} angle={-18} textAnchor="end" height={52} />
                  <YAxis tick={{ fontSize: 11, fill: '#7A6F66' }} axisLine={false} tickLine={false} tickFormatter={compactMoney} />
                  <Tooltip contentStyle={{ border: '1px solid #E9E1D7', borderRadius: 12, fontSize: 12 }} formatter={(value) => money(value)} cursor={{ fill: '#FBF5EE' }} />
                  <Bar dataKey="value" fill="#D97706" radius={[5, 5, 0, 0]} barSize={30} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState icon={CircleDollarSign} title="No expenses in this period" />}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold">Category breakdown</h2>
          <p className="mb-4 text-xs text-muted">Share of total operating expenses</p>
          <div className="space-y-3">
            {byCategory.slice(0, 8).map((entry) => (
              <div key={entry.name}>
                <div className="mb-1 flex items-center justify-between text-xs"><span className="text-muted">{entry.name}</span><span className="num font-semibold">{money(entry.value)}</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-amber-50"><div className="h-full rounded-full bg-amber-500" style={{ width: `${total ? (entry.value / total) * 100 : 0}%` }} /></div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search expenses…" />
          <Select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">All categories</option>
            {data.config.expenseCategories.map((value) => <option key={value}>{value}</option>)}
          </Select>
          <Select value={payment} onChange={(event) => setPayment(event.target.value)}>
            <option value="all">All payment methods</option>
            {data.config.paymentMethods.map((value) => <option key={value}>{value}</option>)}
          </Select>
          <Button onClick={() => { setSearch(''); setCategory('all'); setPayment('all') }}>Clear filters</Button>
        </div>
      </Card>

      <Card>
        <div className="border-b border-line px-5 py-4"><h2 className="font-display text-lg font-semibold">Expense records</h2><p className="text-xs text-muted">{filtered.length} records</p></div>
        {filtered.length ? (
          <div className="table-wrap m-4">
            <table className="data-table">
              <thead><tr><th>Reference</th><th>Date</th><th>Category</th><th>Description</th><th>Payment</th><th>Amount</th><th>Recorded by</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {filtered.map((expense) => (
                  <tr key={expense.id}>
                    <td className="font-semibold">{expense.reference}</td>
                    <td className="whitespace-nowrap text-xs text-muted">{formatDate(expense.date)}</td>
                    <td><Badge tone="amber">{expense.category}</Badge></td>
                    <td className="max-w-[260px] truncate">{expense.description}</td>
                    <td className="text-xs text-muted">{expense.paymentMethod}</td>
                    <td className="num font-bold text-red-600">{money(expense.amount)}</td>
                    <td className="text-xs text-muted">{userName(expense.recordedBy)}</td>
                    <td><div className="flex justify-end gap-1"><IconButton icon={Pencil} label="Edit expense" onClick={() => setEditing(expense)} /><IconButton icon={Trash2} label="Reverse expense" onClick={() => { setDeleting(expense); setReversalReason('') }} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState icon={Search} title="No expenses found" description="Try changing the filters or period." />}
      </Card>

      {(creating || editing) && <ExpenseForm expense={editing} config={data.config} onClose={() => { setCreating(false); setEditing(null) }} onSave={save} />}
      {deleting && (
        <ConfirmDialog
          open
          onClose={() => setDeleting(null)}
          onConfirm={reverse}
          danger
          title="Reverse this expense?"
          description={`${deleting.description} (${money(deleting.amount)}) will be excluded from totals but preserved in the audit trail.`}
          confirmLabel="Reverse expense"
        >
          <div className="w-full"><Field label="Reason for reversal"><input className="input" value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} autoFocus /></Field></div>
        </ConfirmDialog>
      )}
    </div>
  )
}

function ExpenseForm({ expense, config, onClose, onSave }) {
  const [form, setForm] = useState(() => expense ? { ...expense, date: expense.date.slice(0, 10) } : blankExpense())
  const [error, setError] = useState('')
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const submit = () => {
    if (!form.description.trim()) return setError('Description is required.')
    if (!isFiniteNumber(form.amount) || Number(form.amount) <= 0) return setError('Amount must be greater than zero.')
    onSave({ ...form, description: form.description.trim(), amount: Number(form.amount) })
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={expense ? 'Edit expense' : 'Record an expense'}
      size="md"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Save expense</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          <Select value={form.category} onChange={(event) => set('category', event.target.value)}>
            {config.expenseCategories.map((category) => <option key={category}>{category}</option>)}
          </Select>
        </Field>
        <Field label="Amount (KES)" error={error}><input type="number" min="0" step="0.01" className="input" value={form.amount} onChange={(event) => set('amount', event.target.value)} /></Field>
        <Field label="Description" className="sm:col-span-2"><input className="input" value={form.description} onChange={(event) => set('description', event.target.value)} placeholder="e.g. Electricity bill for October" autoFocus /></Field>
        <Field label="Date"><input type="date" className="input" value={form.date} onChange={(event) => set('date', event.target.value)} /></Field>
        <Field label="Payment method">
          <Select value={form.paymentMethod} onChange={(event) => set('paymentMethod', event.target.value)}>
            {config.paymentMethods.map((method) => <option key={method}>{method}</option>)}
          </Select>
        </Field>
        <Field label="Notes" className="sm:col-span-2"><textarea className="input min-h-20" value={form.notes} onChange={(event) => set('notes', event.target.value)} /></Field>
      </div>
    </Modal>
  )
}
