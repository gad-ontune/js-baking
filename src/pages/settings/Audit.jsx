import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardList, History, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { useStore } from '../../lib/store'
import { api } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, SearchInput, Select, StatCard } from '../../components/ui'

export default function AuditHistory() {
  const { data } = useStore()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [userFilter, setUserFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')

  const loadAudit = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setLogs(await api.listAudit({ limit: 200 }))
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAudit() }, [loadAudit])

  const userName = useCallback(
    (id) => data.users.find((user) => user.id === id)?.name || (id ? 'Former user' : 'System'),
    [data.users],
  )

  const actions = useMemo(() => [...new Set(logs.map((log) => log.action))].sort(), [logs])
  const filtered = useMemo(() => logs.filter((log) => {
    if (userFilter !== 'all' && log.userId !== userFilter) return false
    if (actionFilter !== 'all' && log.action !== actionFilter) return false
    return `${log.action} ${log.entity} ${log.details} ${userName(log.userId)}`.toLowerCase().includes(search.toLowerCase())
  }), [logs, userName, userFilter, actionFilter, search])

  const toneFor = (action) => {
    if (action.includes('FAILED') || action.includes('FAILURE') || action.includes('REVOKE')) return 'red'
    if (action.includes('DELETE') || action.includes('VOID') || action.includes('LOGOUT')) return 'red'
    if (action.includes('CREATE') || action.includes('RECORDED') || action.includes('LOGIN_SUCCESS')) return 'leaf'
    if (action.includes('UPDATED') || action.includes('ADJUST') || action.includes('ROLE_CHANGED')) return 'amber'
    return 'slate'
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Security & compliance"
        title="Audit History"
        subtitle="Server-side activity records, fetched from the security API. These entries cannot be edited here."
        actions={<Button icon={RefreshCw} onClick={loadAudit} disabled={loading}>Refresh</Button>}
      />

      {error && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <Button onClick={loadAudit}>Retry</Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Recorded events" value={logs.length} icon={History} tone="bakery" />
        <StatCard label="Event types" value={actions.length} icon={ClipboardList} tone="slate" />
        <StatCard label="Active users" value={data.users.filter((user) => user.active).length} icon={ShieldCheck} tone="leaf" />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search audit events…" />
          <Select value={userFilter} onChange={(event) => setUserFilter(event.target.value)}>
            <option value="all">All users</option>
            {data.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </Select>
          <Select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
            <option value="all">All actions</option>
            {actions.map((action) => <option key={action}>{action}</option>)}
          </Select>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-lg font-semibold">Activity log</h2>
          <p className="text-xs text-muted">{filtered.length} events</p>
        </div>
        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-muted">Loading audit records…</p>
        ) : filtered.length ? (
          <div className="table-wrap m-4">
            <table className="data-table">
              <thead><tr><th>Date & time</th><th>User</th><th>Action</th><th>Area</th><th>Details</th></tr></thead>
              <tbody>
                {filtered.map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap text-xs text-muted">{formatDateTime(log.date)}</td>
                    <td><div className="flex items-center gap-2"><Avatar name={userName(log.userId)} size="sm" /><span className="text-xs font-semibold">{userName(log.userId)}</span></div></td>
                    <td><Badge tone={toneFor(log.action)}>{log.action.replaceAll('_', ' ')}</Badge></td>
                    <td className="text-xs text-muted">{log.entity}</td>
                    <td className="max-w-[360px] text-xs">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState icon={Search} title="No audit events found" description="Try changing your search or filters." />}
      </Card>
    </div>
  )
}
