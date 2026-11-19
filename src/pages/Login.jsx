import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, ChartNoAxesCombined, LockKeyhole, MailCheck, Package, ShieldCheck, Sparkles } from 'lucide-react'
import { api } from '../lib/api'
import { useStore } from '../lib/store'
import { passwordPolicyError, safeInternalPath } from '../lib/security'
import { DEMO_ACCOUNTS } from '../lib/demoCredentials'
import { Button, Field, Modal } from '../components/ui'

function AuthLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-bakery-100 border-t-bakery-600" />
        <p className="mt-4 text-sm text-muted">Checking your session…</p>
      </div>
    </div>
  )
}

export default function Login() {
  const { currentUser, authStatus, apiAvailable, signIn, completeMfa, notify, data } = useStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(0)
  const [searchParams] = useSearchParams()
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [recoveryStep, setRecoveryStep] = useState('request')
  const [recovery, setRecovery] = useState({ username: '', email: '', token: '', newPassword: '', confirmation: '' })
  const [recoveryResult, setRecoveryResult] = useState(null)
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [recoveryError, setRecoveryError] = useState('')
  const [mfaChallenge, setMfaChallenge] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [mfaError, setMfaError] = useState('')
  const [mfaBusy, setMfaBusy] = useState(false)

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) return
    setRecovery((current) => ({ ...current, token }))
    setRecoveryStep('reset')
    setRecoveryOpen(true)
  }, [searchParams])

  if (authStatus === 'loading') return <AuthLoading />
  if (currentUser) return <Navigate to="/dashboard" replace />

  const locked = Date.now() < lockedUntil

  const finishSignIn = (user) => {
    setFailedAttempts(0)
    setLockedUntil(0)
    notify(`Welcome back, ${user.name.split(' ')[0]}!`)
    const requested = location.state?.from
    const target = safeInternalPath(requested, window.location.origin) || '/dashboard'
    navigate(target, { replace: true })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (locked || loading) return
    setError('')
    setLoading(true)

    const result = await signIn(username, password)
    setLoading(false)

    if (!result.ok) {
      const attempts = failedAttempts + 1
      setFailedAttempts(attempts)
      if (attempts >= 5) {
        setLockedUntil(Date.now() + 30_000)
        setError('Too many failed attempts. Try again shortly.')
      } else {
        setError(result.message)
      }
      notify(result.message, 'error')
      return
    }

    if (result.mfaRequired) {
      setMfaChallenge(result.challengeToken)
      setMfaCode('')
      setMfaError('')
      return
    }
    finishSignIn(result.user)
  }

  const submitMfa = async () => {
    setMfaError('')
    setMfaBusy(true)
    const result = await completeMfa(mfaChallenge, mfaCode.trim())
    setMfaBusy(false)
    if (!result.ok) return setMfaError(result.message)
    setMfaChallenge('')
    finishSignIn(result.user)
  }

  const fillDemo = (user, pass) => {
    setUsername(user)
    setPassword(pass)
    setError('')
  }

  const setRecoveryField = (key, value) => setRecovery((current) => ({ ...current, [key]: value }))

  const openRecovery = () => {
    setRecovery((current) => ({ ...current, username, email: current.email || username }))
    setRecoveryStep('request')
    setRecoveryResult(null)
    setRecoveryError('')
    setRecoveryOpen(true)
  }

  const requestRecovery = async () => {
    setRecoveryError('')
    if (!recovery.username.trim() || !recovery.email.trim()) {
      return setRecoveryError('Enter your owner username and the email on the account.')
    }
    setRecoveryBusy(true)
    try {
      const result = await api.forgotPassword(recovery.username.trim(), recovery.email.trim())
      setRecoveryResult(result)
    } catch (requestError) {
      setRecoveryError(requestError.message)
    } finally {
      setRecoveryBusy(false)
    }
  }

  const completeRecovery = async () => {
    setRecoveryError('')
    const policyError = passwordPolicyError(recovery.newPassword)
    if (policyError) return setRecoveryError(policyError)
    if (recovery.newPassword !== recovery.confirmation) return setRecoveryError('The passwords do not match.')
    setRecoveryBusy(true)
    try {
      const result = await api.resetPassword(recovery.token.trim(), recovery.newPassword)
      notify(result.message)
      setRecoveryOpen(false)
      setRecovery({ username: '', email: '', token: '', newPassword: '', confirmation: '' })
      setRecoveryResult(null)
    } catch (resetError) {
      setRecoveryError(resetError.message)
    } finally {
      setRecoveryBusy(false)
    }
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

          {!apiAvailable && (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              The security API is unavailable. Start the backend server and reload this page.
            </p>
          )}

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

            <div className="flex justify-end">
              <button type="button" onClick={openRecovery} className="text-sm font-semibold text-bakery-700 hover:underline">
                Forgot your password?
              </button>
            </div>

            <Button type="submit" variant="primary" className="w-full py-3" disabled={loading || locked || !apiAvailable}>
              {locked ? 'Temporarily locked' : loading ? 'Signing in…' : 'Sign in'}
              {!loading && !locked && <ArrowRight size={16} />}
            </Button>
          </form>

          <div className="mt-8 rounded-2xl border border-line bg-white p-4">
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Demo accounts (dev only)</p>
            <p className="mb-3 text-xs text-muted">Seed these with <code className="font-mono">backend/scripts/seed_demo.py</code> before signing in.</p>
            <div className="grid gap-2">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.username}
                  type="button"
                  onClick={() => fillDemo(account.username, account.password)}
                  className="flex items-center justify-between rounded-xl border border-bakery-100 bg-bakery-50 px-3 py-2.5 text-left transition hover:border-bakery-300"
                >
                  <span>
                    <span className="block text-sm font-semibold text-ink">{account.role} account</span>
                    <span className="block text-xs text-muted">{account.username} · {account.access}</span>
                  </span>
                  <span className="badge bg-white text-bakery-700">{account.role}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {mfaChallenge && (
        <Modal
          open
          onClose={() => { setMfaChallenge(''); setMfaCode('') }}
          title="Two-factor verification"
          description="Enter the 6-digit code from your authenticator app, or one of your recovery codes."
          size="sm"
          footer={<><Button onClick={() => { setMfaChallenge(''); setMfaCode('') }} disabled={mfaBusy}>Cancel</Button>
            <Button variant="primary" onClick={submitMfa} disabled={mfaBusy || !mfaCode.trim()}>{mfaBusy ? 'Verifying…' : 'Verify'}</Button></>}
        >
          <Field label="Verification code" error={mfaError}>
            <input className="input font-mono" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} autoComplete="one-time-code" autoFocus />
          </Field>
        </Modal>
      )}

      {recoveryOpen && (
        <Modal
          open
          onClose={() => setRecoveryOpen(false)}
          title={recoveryStep === 'request' ? 'Recover owner access' : 'Set a new password'}
          description={recoveryStep === 'request'
            ? 'Owner accounts are verified using the username and registered email address. Staff accounts are reset by the owner in User Management.'
            : 'Enter the one-time code and choose a new password.'}
          size="md"
          footer={recoveryStep === 'request' ? (
            <><Button onClick={() => setRecoveryOpen(false)} disabled={recoveryBusy}>Cancel</Button>
              <Button variant="primary" onClick={requestRecovery} disabled={recoveryBusy || !apiAvailable}>
                {recoveryBusy ? 'Requesting…' : 'Send reset code'}
              </Button></>
          ) : (
            <><Button onClick={() => setRecoveryStep('request')} disabled={recoveryBusy}>Back</Button>
              <Button variant="primary" onClick={completeRecovery} disabled={recoveryBusy || !recovery.token.trim()}>
                {recoveryBusy ? 'Saving…' : 'Reset password'}
              </Button></>
          )}
        >
          <div className="grid gap-4">
            {recoveryError && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{recoveryError}</p>}
            {recoveryStep === 'request' ? (
              <>
                <Field label="Owner username"><input className="input" autoComplete="username" value={recovery.username} onChange={(event) => setRecoveryField('username', event.target.value)} /></Field>
                <Field label="Registered email"><input className="input" type="email" autoComplete="email" value={recovery.email} onChange={(event) => setRecoveryField('email', event.target.value)} /></Field>
                {recoveryResult && (
                  <div className="rounded-xl border border-leaf-200 bg-leaf-50 p-3 text-sm text-leaf-800">
                    <p className="font-semibold">{recoveryResult.message}</p>
                    {recoveryResult.emailSent && <p className="mt-1">A code has been emailed to the registered address.</p>}
                    {recoveryResult.devToken && (
                      <div className="mt-2">
                        <p className="text-xs">Development code (shown once):</p>
                        <code className="mt-1 block break-all rounded-lg bg-white p-2 font-mono text-xs">{recoveryResult.devToken}</code>
                      </div>
                    )}
                    <button type="button" className="mt-3 font-semibold underline" onClick={() => {
                      setRecovery((current) => ({ ...current, token: recoveryResult.devToken || current.token }))
                      setRecoveryStep('reset')
                    }}>
                      I have a code
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <Field label="One-time code"><input className="input font-mono" value={recovery.token} onChange={(event) => setRecoveryField('token', event.target.value)} autoFocus /></Field>
                <Field label="New password" hint="At least 12 characters"><input className="input" type="password" autoComplete="new-password" value={recovery.newPassword} onChange={(event) => setRecoveryField('newPassword', event.target.value)} /></Field>
                <Field label="Confirm new password"><input className="input" type="password" autoComplete="new-password" value={recovery.confirmation} onChange={(event) => setRecoveryField('confirmation', event.target.value)} /></Field>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

/** Landing page for verification links included in account emails. */
export function VerifyEmailPage() {
  const { authStatus, currentUser, notify } = useStore()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [state, setState] = useState({ status: 'working', message: '' })

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      setState({ status: 'error', message: 'This verification link is missing its code.' })
      return
    }
    api.verifyEmail(token)
      .then((result) => {
        setState({ status: 'done', message: result.message })
        notify('Email address verified.')
      })
      .catch((error) => setState({ status: 'error', message: error.message }))
  }, [searchParams, notify])

  if (authStatus === 'loading') return <AuthLoading />
  if (!currentUser) return <Navigate to="/login" replace />

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-5">
      <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 text-center">
        <MailCheck size={32} className="mx-auto text-bakery-600" />
        <h1 className="mt-4 font-display text-2xl font-semibold">Email verification</h1>
        <p className="mt-2 text-sm text-muted">{state.message || 'Verifying your address…'}</p>
        <Button variant="primary" className="mt-6" onClick={() => navigate('/dashboard')}>Back to dashboard</Button>
      </div>
    </div>
  )
}
