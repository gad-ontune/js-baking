import { useCallback, useEffect, useState } from 'react'
import { KeyRound, MailCheck, Pencil, Plus, RefreshCw, ShieldCheck, ShieldOff, Smartphone, UserCog, Users as UsersIcon } from 'lucide-react'
import { useStore } from '../../lib/store'
import { api } from '../../lib/api'
import { formatDate } from '../../lib/format'
import { isValidEmail, passwordPolicyError } from '../../lib/security'
import { Avatar, Badge, Button, Card, EmptyState, Field, IconButton, Modal, PageHeader, SectionHeading, Select, StatCard } from '../../components/ui'

const ROLE_DESCRIPTIONS = {
  owner: 'Full access to every module, settings, users, audit records and reports.',
  manager: 'Manages daily operations and basic reports. Cannot change users or audit records.',
  staff: 'Records daily transactions. Restricted from purchasing, settings and sensitive reports.',
}

const PERMISSION_ROWS = [
  ['Dashboard & inventory', true, true, true],
  ['Purchases & suppliers', false, true, false],
  ['Production, sales & expenses', true, true, true],
  ['Full financial reports', true, false, false],
  ['Users & settings', true, false, false],
  ['Audit history', true, false, false],
]

const blankUser = { name: '', username: '', password: '', email: '', role: 'staff', active: true }

export default function Users() {
  const { currentUser, notify, setDirectory, refreshUser } = useStore()
  const [users, setUsers] = useState([])
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [resetTarget, setResetTarget] = useState(null)
  const [resetResult, setResetResult] = useState(null)
  const [mfaDialog, setMfaDialog] = useState(null)
  const [mfaSetup, setMfaSetup] = useState(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaPassword, setMfaPassword] = useState('')
  const [mfaError, setMfaError] = useState('')
  const [mfaBusy, setMfaBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const list = await api.listUsers()
      setUsers(list)
      setDirectory(list)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [setDirectory])

  useEffect(() => { loadUsers() }, [loadUsers])

  const save = async (form) => {
    setBusy(true)
    try {
      if (editing) {
        if (form.role !== editing.role) await api.updateRole(editing.id, form.role)
        if (form.active !== editing.active) await api.updateStatus(editing.id, form.active)
        notify('User account updated.')
      } else {
        await api.createUser({
          name: form.name.trim(),
          username: form.username.trim(),
          email: form.email.trim() || null,
          password: form.password,
        })
        notify('User account created.')
      }
      setEditing(null)
      setCreating(false)
      await loadUsers()
    } catch (saveError) {
      notify(saveError.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async (user) => {
    setBusy(true)
    try {
      const updated = await api.updateStatus(user.id, !user.active)
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setDirectory([updated])
      notify(`${user.name} ${user.active ? 'deactivated' : 'activated'}.`)
    } catch (statusError) {
      notify(statusError.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const revokeSessions = async (user) => {
    setBusy(true)
    try {
      await api.revokeSessions(user.id)
      notify(`All sessions for ${user.name} were revoked.`)
    } catch (revokeError) {
      notify(revokeError.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const issueResetCode = async (user) => {
    setBusy(true)
    setResetResult(null)
    try {
      const result = await api.issueResetToken(user.id)
      setResetTarget(user)
      setResetResult(result)
      notify(result.message)
    } catch (tokenError) {
      notify(tokenError.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const sendVerification = async () => {
    setBusy(true)
    try {
      const result = await api.requestEmailVerification()
      notify(result.message)
      if (result.devToken) notify(`Development verification code: ${result.devToken}`)
    } catch (verificationError) {
      notify(verificationError.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const closeMfa = () => {
    setMfaDialog(null)
    setMfaSetup(null)
    setMfaCode('')
    setMfaPassword('')
    setMfaError('')
  }

  const startMfaSetup = async () => {
    setMfaError('')
    setMfaBusy(true)
    try {
      const setup = await api.setupMfa()
      setMfaSetup(setup)
      setMfaDialog('setup')
      notify('Scan the QR details with your authenticator app, then enter a code to confirm.')
    } catch (setupError) {
      notify(setupError.message, 'error')
    } finally {
      setMfaBusy(false)
    }
  }

  const confirmMfaEnable = async () => {
    setMfaError('')
    setMfaBusy(true)
    try {
      await api.enableMfa(mfaCode.trim())
      await refreshUser()
      notify('Multi-factor authentication is enabled.')
      closeMfa()
    } catch (enableError) {
      setMfaError(enableError.message)
    } finally {
      setMfaBusy(false)
    }
  }

  const confirmMfaDisable = async () => {
    setMfaError('')
    setMfaBusy(true)
    try {
      await api.disableMfa(mfaCode.trim(), mfaPassword)
      await refreshUser()
      notify('Multi-factor authentication is disabled.')
      closeMfa()
    } catch (disableError) {
      setMfaError(disableError.message)
    } finally {
      setMfaBusy(false)
    }
  }

  const savePassword = async ({ currentPassword, newPassword }) => {
    setBusy(true)
    try {
      const result = await api.changePassword(currentPassword, newPassword)
      setChangingPassword(false)
      setDirectory([result.user])
      notify('Your password was changed. Other devices were signed out.')
    } catch (passwordError) {
      notify(passwordError.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Access control"
        title="Users & Permissions"
        subtitle="Accounts are managed by the security API. Roles and status are enforced on the server."
        actions={
          <div className="flex flex-wrap gap-2">
            {!currentUser?.emailVerified && <Button icon={MailCheck} onClick={sendVerification} disabled={busy}>Verify my email</Button>}
            <Button icon={Smartphone} onClick={() => currentUser?.mfaEnabled ? setMfaDialog('disable') : startMfaSetup()} disabled={mfaBusy}>
              {currentUser?.mfaEnabled ? 'Disable MFA' : 'Set up MFA'}
            </Button>
            <Button icon={KeyRound} onClick={() => setChangingPassword(true)}>Change my password</Button>
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Add user</Button>
          </div>
        }
      />

      {error && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <Button onClick={loadUsers}>Retry</Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total users" value={users.length} icon={UsersIcon} tone="bakery" />
        <StatCard label="Active users" value={users.filter((user) => user.active).length} icon={ShieldCheck} tone="leaf" />
        <StatCard label="Owner accounts" value={users.filter((user) => user.role === 'owner').length} icon={UserCog} tone="slate" />
      </div>

      <Card>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold">User accounts</h2>
            <p className="text-xs text-muted">Role-based access protects financial and administrative records.</p>
          </div>
          <IconButton icon={RefreshCw} label="Reload users" onClick={loadUsers} disabled={loading} />
        </div>
        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-muted">Loading accounts…</p>
        ) : users.length ? (
          <div className="table-wrap m-4">
            <table className="data-table">
              <thead><tr><th>User</th><th>Username</th><th>Role</th><th>Status</th><th>Registered</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={user.name} size="sm" />
                        <div>
                          <p className="font-semibold">{user.name}{user.id === currentUser?.id && <span className="ml-2 text-xs text-bakery-600">(you)</span>}</p>
                          <p className="text-xs text-muted">
                            {user.email || '—'}
                            {user.email && (
                              <Badge tone={user.emailVerified ? 'leaf' : 'amber'} className="ml-2">
                                {user.emailVerified ? 'Verified' : 'Unverified'}
                              </Badge>
                            )}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="font-mono text-xs">{user.username}</td>
                    <td><Badge tone={user.role === 'owner' ? 'bakery' : user.role === 'manager' ? 'leaf' : 'slate'}>{user.role}</Badge></td>
                    <td><Badge tone={user.active ? 'leaf' : 'red'}>{user.active ? 'Active' : 'Inactive'}</Badge></td>
                    <td className="text-xs text-muted">{formatDate(user.createdAt)}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <IconButton icon={Pencil} label="Edit role" onClick={() => setEditing(user)} disabled={user.id === currentUser?.id || busy} />
                        <IconButton icon={KeyRound} label="Issue one-time reset code" onClick={() => issueResetCode(user)} disabled={!user.active || busy} />
                        <IconButton icon={ShieldCheck} label={user.active ? 'Deactivate user' : 'Activate user'} onClick={() => toggleActive(user)} disabled={user.id === currentUser?.id || busy} />
                        <IconButton icon={ShieldOff} label="Revoke all sessions" onClick={() => revokeSessions(user)} disabled={busy} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState icon={UsersIcon} title="No users" />}
      </Card>

      <Card className="p-5">
        <SectionHeading title="Permission matrix" subtitle="Roles are defined on the backend. UI checks only decide which screens to show." />
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Area</th><th>Owner</th><th>Manager</th><th>Staff</th></tr></thead>
            <tbody>
              {PERMISSION_ROWS.map(([label, owner, manager, staff]) => (
                <tr key={label}>
                  <td className="font-semibold">{label}</td>
                  <td>{owner ? <Badge tone="leaf">Allowed</Badge> : <Badge tone="red">Blocked</Badge>}</td>
                  <td>{manager ? <Badge tone="leaf">Allowed</Badge> : <Badge tone="red">Blocked</Badge>}</td>
                  <td>{staff ? <Badge tone="leaf">Allowed</Badge> : <Badge tone="red">Blocked</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {Object.entries(ROLE_DESCRIPTIONS).map(([role, description]) => (
            <div key={role} className="rounded-xl border border-line p-4"><p className="text-sm font-bold capitalize">{role}</p><p className="mt-1 text-xs text-muted">{description}</p></div>
          ))}
        </div>
      </Card>

      {(creating || editing) && (
        <UserForm
          user={editing}
          users={users}
          currentUser={currentUser}
          busy={busy}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSave={save}
        />
      )}

      {changingPassword && (
        <PasswordForm busy={busy} onClose={() => setChangingPassword(false)} onSave={savePassword} />
      )}

      {mfaDialog === 'setup' && mfaSetup && (
        <Modal
          open
          onClose={closeMfa}
          title="Set up two-factor authentication"
          description="Add this secret to your authenticator app, save the recovery codes somewhere safe, then enter a 6-digit code to finish."
          size="md"
          footer={<><Button onClick={closeMfa} disabled={mfaBusy}>Cancel</Button>
            <Button variant="primary" onClick={confirmMfaEnable} disabled={mfaBusy || !mfaCode.trim()}>{mfaBusy ? 'Saving…' : 'Enable MFA'}</Button></>}
        >
          <div className="grid gap-4">
            {mfaError && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{mfaError}</p>}
            <div className="rounded-xl border border-line bg-canvas p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">Authenticator secret</p>
              <code className="mt-1 block break-all font-mono text-sm">{mfaSetup.secret}</code>
              <p className="mt-2 text-xs text-muted">App link: <span className="break-all">{mfaSetup.provisioning_uri}</span></p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Recovery codes — shown once</p>
              <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs text-amber-900">
                {mfaSetup.recovery_codes.map((code) => <span key={code}>{code}</span>)}
              </div>
            </div>
            <Field label="6-digit code from your app"><input className="input font-mono" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} autoComplete="one-time-code" /></Field>
          </div>
        </Modal>
      )}

      {mfaDialog === 'disable' && (
        <Modal
          open
          onClose={closeMfa}
          title="Disable two-factor authentication"
          description="Confirm with your password and a current authenticator or recovery code."
          size="sm"
          footer={<><Button onClick={closeMfa} disabled={mfaBusy}>Cancel</Button>
            <Button variant="primary" onClick={confirmMfaDisable} disabled={mfaBusy || !mfaCode.trim() || !mfaPassword}>{mfaBusy ? 'Saving…' : 'Disable MFA'}</Button></>}
        >
          <div className="grid gap-4">
            {mfaError && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{mfaError}</p>}
            <Field label="Current password"><input className="input" type="password" value={mfaPassword} onChange={(event) => setMfaPassword(event.target.value)} autoComplete="current-password" /></Field>
            <Field label="Authenticator or recovery code"><input className="input font-mono" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} autoComplete="one-time-code" /></Field>
          </div>
        </Modal>
      )}

      {resetTarget && (
        <Modal
          open
          onClose={() => { setResetTarget(null); setResetResult(null) }}
          title={`Reset code for ${resetTarget.name}`}
          description="Passwords are stored as one-way hashes and cannot be displayed. Share this single-use code with the user through a private channel."
          size="md"
          footer={<Button variant="primary" onClick={() => { setResetTarget(null); setResetResult(null) }}>Done</Button>}
        >
          {resetResult ? (
            <div className="grid gap-3">
              <label className="block rounded-xl border border-leaf-200 bg-leaf-50 p-4">
                <span className="text-xs font-bold uppercase tracking-wider text-leaf-800">One-time code — shown only now</span>
                <code className="mt-2 block break-all rounded-lg bg-white p-3 font-mono text-sm text-ink">{resetResult.token}</code>
              </label>
              <p className="text-xs text-muted">Expires {formatDate(resetResult.expiresAt)}. {resetResult.emailSent ? 'The code was also emailed to the user.' : 'Email delivery is not configured; relay the code yourself.'}</p>
            </div>
          ) : <p className="text-sm text-muted">Generating a secure code…</p>}
        </Modal>
      )}
    </div>
  )
}

function UserForm({ user, users, currentUser, busy, onClose, onSave }) {
  const [form, setForm] = useState(() => user
    ? { name: user.name, username: user.username, email: user.email, role: user.role, active: user.active, password: '' }
    : blankUser)
  const [error, setError] = useState('')
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const submit = () => {
    if (!user && !form.name.trim()) return setError('Full name is required.')
    if (!form.username.trim()) return setError('Username is required.')
    if (!isValidEmail(form.email)) return setError('Enter a valid email address.')
    const username = form.username.trim().toLowerCase()
    if (users.some((candidate) => candidate.id !== user?.id && candidate.username.toLowerCase() === username)) {
      return setError('That username is already in use.')
    }
    if (!user) {
      const policyError = passwordPolicyError(form.password)
      if (policyError) return setError(policyError)
    }
    if (user) {
      const ownerCount = users.filter((candidate) => candidate.role === 'owner' && candidate.active).length
      if (user.role === 'owner' && form.role !== 'owner' && ownerCount <= 1) {
        return setError('At least one active owner must remain.')
      }
      if (user.id === currentUser?.id && (form.role !== 'owner' || !form.active)) {
        return setError('You cannot demote or deactivate your own account.')
      }
    }
    setError('')
    onSave(user ? { ...form, username } : { ...form, name: form.name.trim(), username, email: form.email.trim() })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={user ? 'Edit user role' : 'Add user'}
      size="md"
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save user'}</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" className="sm:col-span-2" error={error}>
          <input className="input" value={form.name} onChange={(event) => set('name', event.target.value)} disabled={Boolean(user)} autoFocus={!user} />
        </Field>
        <Field label="Username">
          <input className="input" value={form.username} onChange={(event) => set('username', event.target.value)} disabled={Boolean(user)} />
        </Field>
        <Field label="Role">
          <Select value={form.role} onChange={(event) => set('role', event.target.value)}>
            <option value="owner">Owner</option>
            <option value="manager">Manager</option>
            <option value="staff">Staff</option>
          </Select>
        </Field>
        <Field label="Email" className="sm:col-span-2">
          <input type="email" className="input" value={form.email || ''} onChange={(event) => set('email', event.target.value)} disabled={Boolean(user)} />
        </Field>
        <Field label="Password" hint="Minimum 12 characters" className="sm:col-span-2">
          <input className="input" type="password" minLength="12" autoComplete="new-password" value={form.password} onChange={(event) => set('password', event.target.value)} disabled={Boolean(user)} />
          {user && <p className="mt-1 text-xs text-muted">Passwords are changed from your own account using “Change my password”.</p>}
        </Field>
        <label className="flex items-center gap-2 text-sm text-muted sm:col-span-2">
          <input type="checkbox" checked={form.active} onChange={(event) => set('active', event.target.checked)} className="accent-bakery-600" /> Account active
        </label>
      </div>
    </Modal>
  )
}

function PasswordForm({ busy, onClose, onSave }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmation: '' })
  const [error, setError] = useState('')
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const submit = () => {
    const policyError = passwordPolicyError(form.newPassword)
    if (policyError) return setError(policyError)
    if (form.newPassword !== form.confirmation) return setError('The new passwords do not match.')
    setError('')
    onSave({ currentPassword: form.currentPassword, newPassword: form.newPassword })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Change my password"
      size="md"
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Change password'}</Button></>}
    >
      <div className="grid gap-4">
        <Field label="Current password" error={error}>
          <input className="input" type="password" autoComplete="current-password" value={form.currentPassword} onChange={(event) => set('currentPassword', event.target.value)} />
        </Field>
        <Field label="New password" hint="Minimum 12 characters">
          <input className="input" type="password" autoComplete="new-password" value={form.newPassword} onChange={(event) => set('newPassword', event.target.value)} />
        </Field>
        <Field label="Confirm new password">
          <input className="input" type="password" autoComplete="new-password" value={form.confirmation} onChange={(event) => set('confirmation', event.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
