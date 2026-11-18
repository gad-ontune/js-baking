import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowRight, ChartNoAxesCombined, LockKeyhole, Package, ShieldCheck, Sparkles } from 'lucide-react'
import { useStore } from '../lib/store'
import { Button, Field } from '../components/ui'

export default function Login() {
  const { currentUser, signIn, notify, data } = useStore()
  const navigate = useNavigate()
  const [username, setUsername] = useState('amina')
  const [password, setPassword] = useState('owner123')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (currentUser) return <Navigate to="/dashboard" replace />

  const handleSubmit = (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    window.setTimeout(() => {
      const result = signIn(username, password)
      setLoading(false)
      if (!result.ok) {
        setError(result.message)
        notify(result.message, 'error')
        return
      }
      notify(`Welcome back, ${result.user.name.split(' ')[0]}!`)
      navigate('/dashboard')
    }, 350)
  }

  const fillDemo = (user, pass) => {
    setUsername(user)
    setPassword(pass)
    setError('')
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <div className="relative hidden w-[46%] overflow-hidden bg-bakery-800 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-10 top-16 h-64 w-64 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-bakery-700/60 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white font-display text-lg font-bold text-bakery-800">{data.business.logoText?.slice(0, 2) || 'C'}</span>
          <div>
            <p className="font-display text-lg font-bold leading-tight">{data.business.name}</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-bakery-200">Business Suite</p>
          </div>
        </div>

        <div className="relative max-w-lg">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-bakery-100">
            <Sparkles size={14} /> Built for the way your bakery works
          </div>
          <h1 className="font-display text-5xl font-semibold leading-[1.1] tracking-tight">
            Every cake, every juice, every shilling — all in one place.
          </h1>
          <p className="mt-6 max-w-md text-sm leading-relaxed text-bakery-100/90">
            Track stock, purchases, production, sales and profit with a calm, clear workspace designed for busy bakery owners.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-3">
            {[
              { icon: Package, label: 'Live inventory' },
              { icon: ChartNoAxesCombined, label: 'Clear profitability' },
              { icon: ShieldCheck, label: 'Role-based access' },
              { icon: Sparkles, label: 'Beautiful reports' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
                <Icon size={18} className="text-bakery-200" />
                <span className="text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-bakery-200/70">© {new Date().getFullYear()} {data.business.name} · Internal management system</p>
      </div>

      <div className="flex flex-1 items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-md animate-fade-in">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-bakery-600 font-display text-lg font-bold text-white">{data.business.logoText?.slice(0, 2) || 'C'}</span>
            <div>
              <p className="font-display text-lg font-bold leading-tight">{data.business.name}</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-bakery-600">Business Suite</p>
            </div>
          </div>

          <p className="text-xs font-bold uppercase tracking-[0.18em] text-bakery-600">Welcome back</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">Sign in to your workspace</h2>
          <p className="mt-2 text-sm text-muted">Use your account to continue managing the bakery.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <Field label="Username">
              <input
                className="input"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                placeholder="Enter your username"
                required
              />
            </Field>
            <Field label="Password">
              <div className="relative">
                <input
                  className="input pr-11"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                />
                <LockKeyhole size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
              </div>
            </Field>

            {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <Button type="submit" variant="primary" className="w-full py-3" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
              {!loading && <ArrowRight size={16} />}
            </Button>
          </form>

          <div className="mt-8 rounded-2xl border border-line bg-white p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">Demo accounts</p>
            <div className="grid gap-2">
              <button type="button" onClick={() => fillDemo('amina', 'owner123')} className="flex items-center justify-between rounded-xl border border-bakery-100 bg-bakery-50 px-3 py-2.5 text-left transition hover:border-bakery-300">
                <span>
                  <span className="block text-sm font-semibold text-ink">Owner account</span>
                  <span className="block text-xs text-muted">amina / owner123 · Full access</span>
                </span>
                <span className="badge bg-white text-bakery-700">Owner</span>
              </button>
              <button type="button" onClick={() => fillDemo('brian', 'staff123')} className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5 text-left transition hover:border-bakery-300">
                <span>
                  <span className="block text-sm font-semibold text-ink">Staff account</span>
                  <span className="block text-xs text-muted">brian / staff123 · Limited access</span>
                </span>
                <span className="badge bg-slate-100 text-slate-700">Staff</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
