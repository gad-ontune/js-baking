import { useState } from 'react'
import { KeyRound, Pencil, Plus, ShieldCheck, UserCog, Users as UsersIcon } from 'lucide-react'
import { useStore } from '../../lib/store'
import { formatDate, uid } from '../../lib/format'
import { isValidEmail, passwordPolicyError } from '../../lib/security'
import { Avatar, Badge, Button, Card, EmptyState, Field, IconButton, Modal, PageHeader, SectionHeading, Select, StatCard } from '../../components/ui'

const ROLE_DESCRIPTIONS = {
  owner: 'Full access to every module, settings, users and reports.',
  staff: 'Record daily transactions and view operational information. Restricted from sensitive settings.',
}

const PERMISSION_ROWS = [
  ['Dashboard', 'dashboard.view', true, true],
  ['Inventory', 'inventory.manage', true, true],
  ['Purchases & suppliers', 'purchases.view', true, true],
  ['Production', 'production.manage', true, true],
  ['Sales & expenses', 'sales.manage', true, true],
  ['Full financial reports', 'reports.full', true, false],
  ['Users & settings', 'settings.view', true, false],
  ['Audit history', 'settings.view', true, false],
]

const blankUser = { name: '', username: '', password: '', email: '', role: 'staff', active: true }

export default function Users() {
  const { data, currentUser, mutate, addAudit, notify } = useStore()
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)

  const save = (form) => {
    const duplicate = data.users.some(
      (candidate) => candidate.id !== editing?.id && candidate.username.toLowerCase() === form.username.toLowerCase(),
    )
    if (duplicate) return notify('That username is already in use.', 'error')
    if (editing) {
      mutate((draft) => {
        Object.assign(draft.users.find((user) => user.id === editing.id), form)
        const changes = []
        if (editing.role !== form.role) changes.push('role changed')
        if (editing.active !== form.active) changes.push('status changed')
        if (editing.password !== form.password) changes.push('password changed')
        addAudit(draft, 'USER_UPDATED', 'User', `${form.name} account updated${changes.length ? `: ${changes.join(', ')}` : ''}`)
      })
      notify('User account updated.')
      setEditing(null)
    } else {
      mutate((draft) => {
        draft.users.push({ ...form, id: uid('user'), createdAt: new Date().toISOString() })
        addAudit(draft, 'USER_CREATED', 'User', `${form.name} account created as ${form.role}`)
      })
      notify('User account created.')
      setCreating(false)
    }
  }

  const toggleActive = (user) => {
    if (user.role === 'owner' && user.active && data.users.filter((candidate) => candidate.role === 'owner' && candidate.active).length <= 1) {
      return notify('At least one owner must remain active.', 'error')
    }
    if (user.id === currentUser?.id) return notify('You cannot deactivate your own account.', 'error')
    mutate((draft) => {
      const target = draft.users.find((candidate) => candidate.id === user.id)
      target.active = !target.active
      addAudit(draft, 'USER_STATUS', 'User', `${target.name} ${target.active ? 'activated' : 'deactivated'}`)
    })
    notify(`${user.name} ${user.active ? 'deactivated' : 'activated'}.`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Access control"
        title="Users & Permissions"
        subtitle="Manage who can access the bakery's records and settings."
        actions={<Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Add user</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total users" value={data.users.length} icon={UsersIcon} tone="bakery" />
        <StatCard label="Active users" value={data.users.filter((user) => user.active).length} icon={ShieldCheck} tone="leaf" />
        <StatCard label="Owner accounts" value={data.users.filter((user) => user.role === 'owner').length} icon={UserCog} tone="slate" />
      </div>

      <Card>
        <div className="border-b border-line px-5 py-4"><h2 className="font-display text-lg font-semibold">User accounts</h2><p className="text-xs text-muted">Role-based access protects financial and administrative records.</p></div>
        {data.users.length ? (
          <div className="table-wrap m-4">
            <table className="data-table">
              <thead><tr><th>User</th><th>Username</th><th>Role</th><th>Status</th><th>Registered</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {data.users.map((user) => (
                  <tr key={user.id}>
                    <td><div className="flex items-center gap-3"><Avatar name={user.name} size="sm" /><div><p className="font-semibold">{user.name}{user.id === currentUser?.id && <span className="ml-2 text-xs text-bakery-600">(you)</span>}</p><p className="text-xs text-muted">{user.email}</p></div></div></td>
                    <td className="font-mono text-xs">{user.username}</td>
                    <td><Badge tone={user.role === 'owner' ? 'bakery' : 'slate'}>{user.role === 'owner' ? 'Owner / Admin' : 'Staff'}</Badge></td>
                    <td><Badge tone={user.active ? 'leaf' : 'red'}>{user.active ? 'Active' : 'Inactive'}</Badge></td>
                    <td className="text-xs text-muted">{formatDate(user.createdAt)}</td>
                    <td><div className="flex justify-end gap-1"><IconButton icon={Pencil} label="Edit user" onClick={() => setEditing(user)} /><IconButton icon={KeyRound} label={user.active ? 'Deactivate user' : 'Activate user'} onClick={() => toggleActive(user)} disabled={user.id === currentUser?.id} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState icon={UsersIcon} title="No users" />}
      </Card>

      <Card className="p-5">
        <SectionHeading title="Permission matrix" subtitle="Configured roles determine which areas each user can access." />
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Area</th><th>Owner / Admin</th><th>Staff</th></tr></thead>
            <tbody>
              {PERMISSION_ROWS.map(([label, , owner, staff]) => (
                <tr key={label}>
                  <td className="font-semibold">{label}</td>
                  <td>{owner ? <Badge tone="leaf">Allowed</Badge> : <Badge tone="red">Blocked</Badge>}</td>
                  <td>{staff ? <Badge tone="leaf">Allowed</Badge> : <Badge tone="red">Blocked</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {Object.entries(ROLE_DESCRIPTIONS).map(([role, description]) => (
            <div key={role} className="rounded-xl border border-line p-4"><p className="text-sm font-bold capitalize">{role}</p><p className="mt-1 text-xs text-muted">{description}</p></div>
          ))}
        </div>
      </Card>

      {(creating || editing) && <UserForm user={editing} users={data.users} currentUser={currentUser} onClose={() => { setCreating(false); setEditing(null) }} onSave={save} />}
    </div>
  )
}

function UserForm({ user, users, currentUser, onClose, onSave }) {
  const [form, setForm] = useState(() => user ? { ...user, password: '' } : blankUser)
  const [error, setError] = useState('')
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const submit = () => {
    if (!form.name.trim() || !form.username.trim()) return setError('Name and username are required.')
    if (!isValidEmail(form.email)) return setError('Enter a valid email address.')
    const username = form.username.trim()
    if (users.some((candidate) => candidate.id !== user?.id && candidate.username.toLowerCase() === username.toLowerCase())) {
      return setError('That username is already in use.')
    }
    if ((!user || form.password) && passwordPolicyError(form.password)) return setError(passwordPolicyError(form.password))
    const ownerCount = users.filter((candidate) => candidate.role === 'owner' && candidate.active).length
    if (user?.role === 'owner' && form.role !== 'owner' && ownerCount <= 1) return setError('At least one owner must remain.')
    if (user?.id === currentUser?.id && (form.role !== 'owner' || !form.active)) {
      return setError('You cannot demote or deactivate your own account.')
    }
    onSave({
      ...form,
      name: form.name.trim(),
      username,
      password: user && !form.password ? user.password : form.password,
    })
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={user ? 'Edit user' : 'Add user'}
      size="md"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Save user</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" className="sm:col-span-2" error={error}><input className="input" value={form.name} onChange={(event) => set('name', event.target.value)} autoFocus /></Field>
        <Field label="Username"><input className="input" value={form.username} onChange={(event) => set('username', event.target.value)} /></Field>
        <Field label="Role"><Select value={form.role} onChange={(event) => set('role', event.target.value)}><option value="owner">Owner / Admin</option><option value="staff">Staff</option></Select></Field>
        <Field label="Email" className="sm:col-span-2"><input type="email" className="input" value={form.email} onChange={(event) => set('email', event.target.value)} /></Field>
        <Field label={user ? 'New password (leave blank to keep)' : 'Password'} hint="Minimum 12 characters" className="sm:col-span-2"><input className="input" type="password" minLength="12" autoComplete="new-password" value={form.password} onChange={(event) => set('password', event.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm text-muted sm:col-span-2"><input type="checkbox" checked={form.active} onChange={(event) => set('active', event.target.checked)} className="accent-bakery-600" /> Account active</label>
      </div>
    </Modal>
  )
}
