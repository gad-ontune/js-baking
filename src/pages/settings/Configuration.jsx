import { useState } from 'react'
import { Pencil, Plus, Settings2, Tag, Trash2, X } from 'lucide-react'
import { useStore } from '../../lib/store'
import { money } from '../../lib/format'
import { isFiniteNumber } from '../../lib/security'
import { Badge, Button, Card, EmptyState, Field, IconButton, Modal, PageHeader, SectionHeading, Select } from '../../components/ui'

const CONFIG_SECTIONS = [
  { key: 'inventoryCategories', label: 'Inventory categories', hint: 'Used to group stock items' },
  { key: 'productCategories', label: 'Product categories', hint: 'Used for sales products and production' },
  { key: 'expenseCategories', label: 'Expense categories', hint: 'Used when recording operating costs' },
  { key: 'paymentMethods', label: 'Payment methods', hint: 'Cash, M-Pesa, bank transfer and more' },
  { key: 'units', label: 'Units of measurement', hint: 'kg, g, L, ml, pieces and others' },
  { key: 'movementTypes', label: 'Stock movement types', hint: 'Labels for inventory history' },
]

const blankProduct = () => ({ name: '', sku: '', category: 'Cakes', cost: 0, price: 0, description: '', trackedItemId: '' })

export default function Configuration() {
  const { data, mutate, addAudit, notify, businessWrite } = useStore()
  const [adding, setAdding] = useState({})
  const [newValues, setNewValues] = useState({})
  const [editingProduct, setEditingProduct] = useState(null)
  const [creatingProduct, setCreatingProduct] = useState(false)

  const addValue = (key) => {
    const value = (newValues[key] || '').trim()
    if (!value) return
    if (data.config[key].includes(value)) return notify('That value already exists.', 'error')
    mutate((draft) => {
      draft.config[key].push(value)
      addAudit(draft, 'CONFIG_UPDATED', 'Configuration', `${value} added to ${key}`)
    })
    setNewValues((current) => ({ ...current, [key]: '' }))
    setAdding((current) => ({ ...current, [key]: false }))
    notify('Configuration updated.')
  }

  const removeValue = (key, value) => {
    mutate((draft) => {
      draft.config[key] = draft.config[key].filter((entry) => entry !== value)
      addAudit(draft, 'CONFIG_UPDATED', 'Configuration', `${value} removed from ${key}`)
    })
    notify('Configuration updated.')
  }

  const saveProduct = async (form) => {
    const payload = {
      name: form.name.trim(),
      category: form.category,
      description: form.description,
      cost: Number(form.cost),
      price: Number(form.price),
      trackedItemId: form.trackedItemId || null,
    }
    if (editingProduct) {
      const result = await businessWrite(
        (api) => api.updateBusinessRecord('product', editingProduct.id, payload),
        'Product updated.',
      )
      if (result.ok) setEditingProduct(null)
    } else {
      const result = await businessWrite(
        (api) => api.createBusinessRecord('product', {
          ...payload,
          sku: form.sku || `PRD-${String(data.products.length + 1).padStart(3, '0')}`,
        }),
        'Product added.',
      )
      if (result.ok) setCreatingProduct(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Categories & Configuration"
        subtitle="Customise the lists and products used throughout the bakery."
      />

      <Card className="p-5">
        <SectionHeading title="System lists" subtitle="Add or remove values used in forms and filters." />
        <div className="grid gap-4 lg:grid-cols-2">
          {CONFIG_SECTIONS.map((section) => (
            <div key={section.key} className="rounded-xl border border-line p-4">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div><p className="font-semibold text-ink">{section.label}</p><p className="text-xs text-muted">{section.hint}</p></div>
                <Badge tone="slate">{data.config[section.key].length}</Badge>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {data.config[section.key].map((value) => (
                  <span key={value} className="inline-flex items-center gap-1 rounded-lg bg-bakery-50 px-2 py-1 text-xs font-medium text-bakery-800">
                    {value}
                    <button type="button" onClick={() => removeValue(section.key, value)} className="text-bakery-500 hover:text-red-600" aria-label={`Remove ${value}`}><X size={12} /></button>
                  </span>
                ))}
              </div>
              {adding[section.key] ? (
                <div className="mt-3 flex gap-2">
                  <input
                    className="input py-1.5 text-xs"
                    autoFocus
                    value={newValues[section.key] || ''}
                    onChange={(event) => setNewValues((current) => ({ ...current, [section.key]: event.target.value }))}
                    onKeyDown={(event) => { if (event.key === 'Enter') addValue(section.key) }}
                    placeholder="New value"
                  />
                  <Button size="sm" variant="primary" onClick={() => addValue(section.key)}>Add</Button>
                </div>
              ) : (
                <Button size="sm" icon={Plus} className="mt-3" onClick={() => setAdding((current) => ({ ...current, [section.key]: true }))}>Add value</Button>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div><h2 className="font-display text-lg font-semibold">Products</h2><p className="text-xs text-muted">Products sold, with costs used for profit calculations.</p></div>
          <Button variant="primary" icon={Plus} onClick={() => setCreatingProduct(true)}>Add product</Button>
        </div>
        {data.products.length ? (
          <div className="table-wrap m-4">
            <table className="data-table">
              <thead><tr><th>Product</th><th>Category</th><th>Cost</th><th>Price</th><th>Margin</th><th>Tracked stock</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {data.products.map((product) => {
                  const margin = product.price ? ((product.price - product.cost) / product.price) * 100 : 0
                  const tracked = data.inventory.find((item) => item.id === product.trackedItemId)
                  return (
                    <tr key={product.id}>
                      <td><p className="font-semibold">{product.name}</p><p className="text-xs text-muted">{product.sku}</p></td>
                      <td><Badge tone="bakery">{product.category}</Badge></td>
                      <td className="num">{money(product.cost)}</td>
                      <td className="num font-semibold">{money(product.price)}</td>
                      <td><Badge tone={margin >= 30 ? 'leaf' : margin >= 15 ? 'amber' : 'red'}>{margin.toFixed(0)}%</Badge></td>
                      <td className="text-xs text-muted">{tracked?.name || 'Not tracked'}</td>
                      <td><div className="flex justify-end gap-1"><IconButton icon={Pencil} label="Edit product" onClick={() => setEditingProduct(product)} /></div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <EmptyState icon={Tag} title="No products configured" description="Add products to record sales and calculate profit." />}
      </Card>

      {(creatingProduct || editingProduct) && (
        <ProductForm
          product={editingProduct}
          config={data.config}
          inventory={data.inventory}
          onClose={() => { setCreatingProduct(false); setEditingProduct(null) }}
          onSave={saveProduct}
        />
      )}
    </div>
  )
}

function ProductForm({ product, config, inventory, onClose, onSave }) {
  const [form, setForm] = useState(() => product || blankProduct())
  const [error, setError] = useState('')
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const submit = () => {
    if (!form.name.trim()) return setError('Product name is required.')
    if (!isFiniteNumber(form.cost) || !isFiniteNumber(form.price)) return setError('Enter valid cost and price amounts.')
    if (Number(form.cost) < 0 || Number(form.price) < 0) return setError('Amounts cannot be negative.')
    onSave({ ...form, name: form.name.trim(), cost: Number(form.cost), price: Number(form.price) })
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={product ? 'Edit product' : 'Add product'}
      description="Configure selling price and cost for accurate profit reports."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Save product</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Product name" className="sm:col-span-2" error={error}><input className="input" value={form.name} onChange={(event) => set('name', event.target.value)} autoFocus /></Field>
        <Field label="SKU"><input className="input" value={form.sku} onChange={(event) => set('sku', event.target.value)} placeholder="Auto-generated" /></Field>
        <Field label="Category"><Select value={form.category} onChange={(event) => set('category', event.target.value)}>{config.productCategories.map((value) => <option key={value}>{value}</option>)}</Select></Field>
        <Field label="Unit cost (KES)"><input type="number" min="0" step="0.01" className="input" value={form.cost} onChange={(event) => set('cost', event.target.value)} /></Field>
        <Field label="Selling price (KES)"><input type="number" min="0" step="0.01" className="input" value={form.price} onChange={(event) => set('price', event.target.value)} /></Field>
        <Field label="Tracked inventory item" hint="Optional — sales will deduct this stock" className="sm:col-span-2">
          <Select value={form.trackedItemId || ''} onChange={(event) => set('trackedItemId', event.target.value)}>
            <option value="">Not tracked</option>
            {inventory.filter((item) => !item.archived).map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}
          </Select>
        </Field>
        <Field label="Description" className="sm:col-span-2"><textarea className="input min-h-20" value={form.description} onChange={(event) => set('description', event.target.value)} /></Field>
      </div>
    </Modal>
  )
}
