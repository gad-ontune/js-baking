import { useEffect } from 'react'
import { AlertTriangle, Check, ChevronDown, Info, Search, X } from 'lucide-react'
import { useStore } from '../lib/store'

export function Card({ children, className = '', ...props }) {
  return <div className={`card ${className}`} {...props}>{children}</div>
}

export function PageHeader({ title, subtitle, actions, eyebrow }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-bakery-600">{eyebrow}</p>}
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function SectionHeading({ title, subtitle, action }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

const toneStyles = {
  bakery: 'bg-bakery-50 text-bakery-700 ring-bakery-100',
  leaf: 'bg-leaf-50 text-leaf-700 ring-leaf-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  red: 'bg-red-50 text-red-700 ring-red-100',
  slate: 'bg-slate-50 text-slate-700 ring-slate-100',
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'bakery', trend, loading = false }) {
  return (
    <Card className="group p-5 transition-shadow hover:shadow-lift">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
          {loading ? (
            <div className="mt-3 h-8 w-24 animate-pulse rounded-lg bg-bakery-50" />
          ) : (
            <p className="num mt-2 font-display text-[1.7rem] font-semibold leading-tight tracking-tight text-ink">{value}</p>
          )}
          {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
        </div>
        {Icon && (
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${toneStyles[tone] || toneStyles.bakery}`}>
            <Icon size={20} strokeWidth={1.8} />
          </span>
        )}
      </div>
      {trend && (
        <div className="mt-4 flex items-center gap-2 border-t border-line/70 pt-3 text-xs">
          <span className={`font-bold ${trend.positive ? 'text-leaf-600' : 'text-red-600'}`}>{trend.label}</span>
          <span className="text-muted">{trend.caption}</span>
        </div>
      )}
    </Card>
  )
}

export function Button({ children, variant = 'secondary', size = 'md', className = '', icon: Icon, ...props }) {
  const variants = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    ghost: 'btn-ghost',
    danger: 'btn-danger',
  }
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: '',
  }
  return (
    <button className={`${variants[variant] || variants.secondary} ${sizes[size]} ${className}`} {...props}>
      {Icon && <Icon size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  )
}

export function IconButton({ icon: Icon, label, className = '', ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white text-muted transition hover:border-bakery-300 hover:bg-bakery-50 hover:text-ink ${className}`}
      {...props}
    >
      <Icon size={16} />
    </button>
  )
}

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="label">{label}</span>}
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  )
}

export function Select({ children, className = '', ...props }) {
  return (
    <div className="relative">
      <select className={`input appearance-none pr-9 ${className}`} {...props}>{children}</select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        className="input pl-9"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}

export function Badge({ children, tone = 'slate', className = '' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    bakery: 'bg-bakery-100 text-bakery-800',
    leaf: 'bg-leaf-100 text-leaf-700',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700',
  }
  return <span className={`badge ${tones[tone] || tones.slate} ${className}`}>{children}</span>
}

export function StatusPill({ status }) {
  const map = {
    healthy: ['In stock', 'leaf'],
    low: ['Low stock', 'amber'],
    out: ['Out of stock', 'red'],
    expiring: ['Expiring soon', 'amber'],
    expired: ['Expired', 'red'],
    archived: ['Archived', 'slate'],
    Paid: ['Paid', 'leaf'],
    'Partially paid': ['Partially paid', 'amber'],
    Unpaid: ['Unpaid', 'red'],
    Active: ['Active', 'leaf'],
    Inactive: ['Inactive', 'slate'],
    Completed: ['Completed', 'leaf'],
    Voided: ['Voided', 'red'],
  }
  const [label, tone] = map[status] || [status || '—', 'slate']
  return <Badge tone={tone}>{label}</Badge>
}

export function EmptyState({ icon: Icon = Info, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-bakery-50 text-bakery-600">
        <Icon size={24} />
      </span>
      <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

function useEscape(onClose) {
  useEffect(() => {
    const handler = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }) {
  useEscape(open ? onClose : null)
  if (!open) return null
  const widths = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`animate-fade-in flex max-h-[94vh] w-full ${widths[size]} flex-col overflow-hidden rounded-t-2xl bg-white shadow-lift sm:rounded-2xl`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-[#FCFAF7] px-6 py-4">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog({ open, onClose, onConfirm, title = 'Are you sure?', description, confirmLabel = 'Confirm', danger = false }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="flex gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${danger ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
          <AlertTriangle size={19} />
        </span>
        <p className="text-sm leading-relaxed text-muted">{description}</p>
      </div>
    </Modal>
  )
}

export function PeriodPicker({ period, onPeriodChange, custom, onCustomChange, showCustom = true }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={period} onChange={(event) => onPeriodChange(event.target.value)} className="w-auto min-w-[150px] py-2">
        <option value="today">Today</option>
        <option value="yesterday">Yesterday</option>
        <option value="7d">Last 7 days</option>
        <option value="30d">Last 30 days</option>
        <option value="month">This month</option>
        <option value="lastMonth">Previous month</option>
        {showCustom && <option value="custom">Custom range</option>}
      </Select>
      {period === 'custom' && (
        <div className="flex items-center gap-2">
          <input type="date" className="input w-auto py-2" value={custom.from} onChange={(event) => onCustomChange({ ...custom, from: event.target.value })} />
          <span className="text-muted">to</span>
          <input type="date" className="input w-auto py-2" value={custom.to} onChange={(event) => onCustomChange({ ...custom, to: event.target.value })} />
        </div>
      )}
    </div>
  )
}

export function ProgressBar({ value, tone = 'bakery' }) {
  const colors = { bakery: 'bg-bakery-500', leaf: 'bg-leaf-500', amber: 'bg-amber-500', red: 'bg-red-500' }
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-bakery-50">
      <div className={`h-full rounded-full ${colors[tone]} transition-all`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

export function Avatar({ name, size = 'md' }) {
  const initials = name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()
  const sizes = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-12 w-12 text-base' }
  return <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-bakery-100 font-bold text-bakery-800 ${sizes[size]}`}>{initials}</span>
}

export function ToastHost() {
  const { toasts, dismissToast } = useStore()
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[calc(100%-2.5rem)] max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto animate-fade-in flex items-start gap-3 rounded-xl border border-line bg-white px-4 py-3 shadow-lift"
        >
          <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${toast.type === 'error' ? 'bg-red-100 text-red-600' : 'bg-leaf-100 text-leaf-600'}`}>
            {toast.type === 'error' ? <AlertTriangle size={14} /> : <Check size={14} />}
          </span>
          <p className="flex-1 text-sm font-medium text-ink">{toast.message}</p>
          <button type="button" onClick={() => dismissToast(toast.id)} className="text-muted hover:text-ink" aria-label="Dismiss">
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  )
}
