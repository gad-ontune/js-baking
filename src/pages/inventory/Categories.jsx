import { useMemo, useState } from 'react'
import { Boxes, Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { compactMoney, money, number } from '../../lib/format'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, IconButton, Modal, PageHeader, SectionHeading } from '../../components/ui'

export default function InventoryCategories() {
  const { data, mutate, addAudit, notify } = useStore()
  const [dialog, setDialog] = useState(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const categories = useMemo(() => data.config.inventoryCategories.map((category) => {
    const items = data.inventory.filter((item) => item.category === category && !item.archived)
    return {
      name: category,
      items: items.length,
      value: items.reduce((sum, item) => sum + item.quantity * item.purchaseCost, 0),
      alerts: items.filter((item) => item.quantity <= item.minQuantity || (item.expiryDate && new Date(item.expiryDate) <= new Date())).length,
    }
  }), [data])

  const openDialog = (mode, category = '') => {
    setDialog({ mode, category })
    setName(category)
    setError('')
  }

  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) return setError('Category name is required.')
    if (dialog.mode === 'add' && data.config.inventoryCategories.includes(trimmed)) return setError('This category already exists.')
    mutate((draft) => {
      if (dialog.mode === 'add') {
        draft.config.inventoryCategories.push(trimmed)
        addAudit(draft, 'CATEGORY_CREATED', 'Configuration', `Inventory category "${trimmed}" created`)
      } else {
        draft.config.inventoryCategories = draft.config.inventoryCategories.map((value) => value === dialog.category ? trimmed : value)
        draft.inventory.forEach((item) => { if (item.category === dialog.category) item.category = trimmed })
        addAudit(draft, 'CATEGORY_UPDATED', 'Configuration', `Inventory category renamed to "${trimmed}"`)
      }
    })
    notify(dialog.mode === 'add' ? 'Category added.' : 'Category updated.')
    setDialog(null)
  }

  const remove = () => {
    const inUse = data.inventory.filter((item) => item.category === dialog.category)
    mutate((draft) => {
      draft.config.inventoryCategories = draft.config.inventoryCategories.filter((value) => value !== dialog.category)
      inUse.forEach((item) => {
        const itemInDraft = draft.inventory.find((candidate) => candidate.id === item.id)
        itemInDraft.category = 'Other'
      })
      if (!draft.config.inventoryCategories.includes('Other')) draft.config.inventoryCategories.push('Other')
      addAudit(draft, 'CATEGORY_DELETED', 'Configuration', `Inventory category "${dialog.category}" removed`)
    })
    notify('Category removed. Items were moved to "Other".')
    setDialog(null)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inventory setup"
        title="Categories"
        subtitle="Organise stock into clear, configurable groups."
        actions={<Button variant="primary" icon={Plus} onClick={() => openDialog('add')}>Add category</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {categories.map((category, index) => (
          <Card key={category.name} className="group p-5 transition-shadow hover:shadow-lift">
            <div className="flex items-start justify-between">
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${['bg-bakery-50 text-bakery-700', 'bg-leaf-50 text-leaf-700', 'bg-amber-50 text-amber-700', 'bg-blue-50 text-blue-700'][index % 4]}`}>
                <Tags size={20} />
              </span>
              <div className="flex gap-1 opacity-70 transition group-hover:opacity-100">
                <IconButton icon={Pencil} label="Rename category" onClick={() => openDialog('edit', category.name)} />
                <IconButton icon={Trash2} label="Delete category" onClick={() => openDialog('delete', category.name)} />
              </div>
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold">{category.name}</h3>
            <div className="mt-3 flex items-center justify-between text-xs text-muted">
              <span>{number(category.items)} items</span>
              <span>{money(category.value)}</span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
              <span className="text-xs text-muted">Stock health</span>
              {category.alerts ? <Badge tone="amber">{category.alerts} need attention</Badge> : <Badge tone="leaf">All good</Badge>}
            </div>
          </Card>
        ))}
        {!categories.length && <Card className="sm:col-span-2 xl:col-span-3"><EmptyState icon={Tags} title="No categories" description="Add your first category to organise inventory." /></Card>}
      </div>

      <Card className="p-5">
        <SectionHeading title="How categories are used" subtitle="Categories power inventory filters, stock valuation and reports." />
        <div className="grid gap-3 text-sm text-muted sm:grid-cols-3">
          <div className="rounded-xl bg-bakery-50 p-4"><Boxes size={18} className="mb-2 text-bakery-600" /><p className="font-semibold text-ink">Inventory grouping</p><p className="mt-1 text-xs">Every item belongs to one category for fast filtering.</p></div>
          <div className="rounded-xl bg-leaf-50 p-4"><Tags size={18} className="mb-2 text-leaf-600" /><p className="font-semibold text-ink">Dashboard charts</p><p className="mt-1 text-xs">Stock value is broken down by category automatically.</p></div>
          <div className="rounded-xl bg-amber-50 p-4"><Boxes size={18} className="mb-2 text-amber-600" /><p className="font-semibold text-ink">Reports</p><p className="mt-1 text-xs">Inventory reports can be sliced by category.</p></div>
        </div>
      </Card>

      {dialog?.mode !== 'delete' && (
        <Modal
          open
          onClose={() => setDialog(null)}
          title={dialog.mode === 'add' ? 'Add category' : 'Rename category'}
          size="sm"
          footer={<><Button onClick={() => setDialog(null)}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}
        >
          <Field label="Category name" error={error}>
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </Field>
        </Modal>
      )}

      {dialog?.mode === 'delete' && (
        <ConfirmDialog
          open
          onClose={() => setDialog(null)}
          onConfirm={remove}
          danger
          title={`Remove "${dialog.category}"?`}
          description="Items in this category will be moved to 'Other'. Historical records remain intact."
          confirmLabel="Remove category"
        />
      )}
    </div>
  )
}
