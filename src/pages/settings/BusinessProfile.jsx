import { useState } from 'react'
import { Building2, MapPin, Phone, RotateCcw, Save, Store } from 'lucide-react'
import { useStore } from '../../lib/store'
import { formatDate } from '../../lib/format'
import { isFiniteNumber, isValidEmail } from '../../lib/security'
import { Button, Card, ConfirmDialog, Field, PageHeader, SectionHeading } from '../../components/ui'

export default function BusinessProfile() {
  const { data, mutate, addAudit, notify, resetDemo } = useStore()
  const [form, setForm] = useState(data.business)
  const [resetting, setResetting] = useState(false)
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const save = () => {
    if (!form.name.trim()) return notify('Business name is required.', 'error')
    if (!isValidEmail(form.email)) return notify('Enter a valid email address.', 'error')
    if (!isFiniteNumber(form.expiryWarningDays) || form.expiryWarningDays < 1 || form.expiryWarningDays > 365) {
      return notify('Expiry warning period must be between 1 and 365 days.', 'error')
    }
    mutate((draft) => {
      draft.business = { ...form, name: form.name.trim() }
      addAudit(draft, 'SETTINGS_UPDATED', 'Business profile', 'Business information updated')
    })
    notify('Business profile saved. Changes appear across the app.')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Business Profile"
        subtitle="Configure the details shown across your workspace and reports."
        actions={<Button variant="primary" icon={Save} onClick={save}>Save changes</Button>}
      />

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card className="p-6">
          <SectionHeading title="Business information" subtitle="Used on reports, exports and the sign-in screen." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name" className="sm:col-span-2"><input className="input" value={form.name} onChange={(event) => set('name', event.target.value)} /></Field>
            <Field label="Tagline" className="sm:col-span-2"><input className="input" value={form.tagline} onChange={(event) => set('tagline', event.target.value)} /></Field>
            <Field label="Phone number"><input className="input" value={form.phone} onChange={(event) => set('phone', event.target.value)} /></Field>
            <Field label="Email address"><input type="email" className="input" value={form.email} onChange={(event) => set('email', event.target.value)} /></Field>
            <Field label="Physical location" className="sm:col-span-2"><input className="input" value={form.location} onChange={(event) => set('location', event.target.value)} /></Field>
            <Field label="Currency">
              <select className="input" value={form.currency} onChange={(event) => set('currency', event.target.value)}>
                <option value="KES">KES — Kenyan Shilling</option>
                <option value="USD">USD — US Dollar</option>
                <option value="EUR">EUR — Euro</option>
              </select>
            </Field>
            <Field label="Expiry warning period (days)"><input type="number" min="1" max="365" className="input" value={form.expiryWarningDays} onChange={(event) => set('expiryWarningDays', Number(event.target.value))} /></Field>
            <Field label="Opening information" className="sm:col-span-2"><input className="input" value={form.openingInfo} onChange={(event) => set('openingInfo', event.target.value)} /></Field>
            <Field label="Logo initials" hint="Shown in the sidebar and sign-in screen"><input className="input" maxLength="4" value={form.logoText} onChange={(event) => set('logoText', event.target.value)} /></Field>
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-6">
            <SectionHeading title="Live preview" subtitle="How your business appears in reports" />
            <div className="rounded-2xl border border-bakery-100 bg-bakery-50 p-5">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-bakery-600 font-display text-lg font-bold text-white">{form.logoText?.slice(0, 2) || 'C'}</span>
              <h3 className="mt-4 font-display text-xl font-semibold text-ink">{form.name || 'Your bakery'}</h3>
              <p className="mt-1 text-sm text-bakery-800">{form.tagline}</p>
              <div className="mt-4 space-y-2 text-xs text-bakery-800/80">
                <p className="flex items-center gap-2"><Phone size={14} /> {form.phone || '—'}</p>
                <p className="flex items-center gap-2"><MapPin size={14} /> {form.location || '—'}</p>
                <p className="flex items-center gap-2"><Store size={14} /> {form.openingInfo || '—'}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <SectionHeading title="Workspace data" subtitle="This demo stores records in your browser." />
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-line p-3 text-sm"><span className="text-muted">Inventory items</span><span className="num font-semibold">{data.inventory.length}</span></div>
              <div className="flex items-center justify-between rounded-xl border border-line p-3 text-sm"><span className="text-muted">Sales records</span><span className="num font-semibold">{data.sales.length}</span></div>
              <div className="flex items-center justify-between rounded-xl border border-line p-3 text-sm"><span className="text-muted">Audit events</span><span className="num font-semibold">{data.auditLogs.length}</span></div>
              <Button variant="danger" icon={RotateCcw} className="w-full" onClick={() => setResetting(true)}>Restore demo data</Button>
            </div>
          </Card>
        </div>
      </div>

      {resetting && <ConfirmDialog open onClose={() => setResetting(false)} onConfirm={() => { resetDemo(); setResetting(false); setForm(data.business) }} danger title="Restore original demo data?" description="All changes made during this session will be discarded and the seeded data will return." confirmLabel="Restore data" />}
    </div>
  )
}
