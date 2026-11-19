import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowUpRight,
  Bell,
  BellRing,
  Check,
  CheckCheck,
  CircleAlert,
  Info,
  RefreshCw,
  Send,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { useNotifications } from '../lib/notificationCenter'
import { filterNotifications } from '../lib/notificationInbox'
import {
  fireDeviceNotification,
  notificationPermission,
  notificationsSupported,
  requestNotificationPermission,
  sendTestDeviceNotification,
} from '../lib/deviceNotifications'
import { formatDateTime, relativeTime } from '../lib/format'
import { safeInternalPath } from '../lib/security'
import { Badge, Button, Card, EmptyState, IconButton, PageHeader, SearchInput, Select, StatCard } from '../components/ui'

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'read', label: 'Read' },
  { id: 'resolved', label: 'Resolved' },
]

const severityTone = { critical: 'red', warning: 'amber', info: 'bakery' }

function NotificationIcon({ item }) {
  if (item.severity === 'critical') return CircleAlert
  if (item.severity === 'warning') return TriangleAlert
  if (item.type === 'system') return BellRing
  return Info
}

export default function Notifications() {
  const { data, notify } = useStore()
  const navigate = useNavigate()
  const {
    notifications,
    active,
    unreadCount,
    criticalCount,
    addNotification,
    markRead,
    markUnread,
    markAllRead,
    refreshAlerts,
    dismissNotification,
    clearRead,
    clearAll,
  } = useNotifications()

  const [tab, setTab] = useState('all')
  const [severity, setSeverity] = useState('all')
  const [query, setQuery] = useState('')
  const [permission, setPermission] = useState(notificationPermission)
  const [requesting, setRequesting] = useState(false)

  const visible = useMemo(
    () => filterNotifications(notifications, { tab, severity, query }),
    [notifications, tab, severity, query],
  )

  const enableDevice = async () => {
    setRequesting(true)
    const result = await requestNotificationPermission()
    setPermission(result)
    setRequesting(false)
    notify(
      result === 'granted'
        ? 'Device notifications enabled for this app.'
        : 'Notification permission was not granted. You can enable it in your browser settings.',
      result === 'granted' ? 'success' : 'error',
    )
  }

  const sendTest = async () => {
    addNotification({
      title: 'Test notification',
      detail: 'This is a sample inbox entry. Device alerts open this notification centre when clicked.',
      severity: 'info',
      type: 'system',
    })
    if (permission === 'granted') await sendTestDeviceNotification(data.business.name)
    notify(
      permission === 'granted'
        ? 'Test notification sent to this device.'
        : 'Test notification added to your inbox.',
    )
  }

  const openItem = (item) => {
    if (!item.read) markRead(item.id)
    const destination = safeInternalPath(item.to, window.location.origin)
    if (destination) navigate(destination)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Alerts & updates"
        title="Notification centre"
        subtitle="Review stock alerts, track what you have read, and control how JS Baking House reaches you on this device."
        actions={
          <>
            {permission === 'default' && notificationsSupported() && (
              <Button variant="primary" icon={BellRing} onClick={enableDevice} disabled={requesting}>
                {requesting ? 'Enabling…' : 'Enable device alerts'}
              </Button>
            )}
            <Button icon={Send} onClick={sendTest}>Send test</Button>
          </>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Unread" value={unreadCount} hint="Waiting for review" icon={Bell} tone="bakery" />
        <StatCard label="Open alerts" value={active.length} hint="Including read items" icon={BellRing} tone="leaf" />
        <StatCard label="Critical" value={criticalCount} hint="Needs urgent action" icon={CircleAlert} tone="red" />
        <StatCard
          label="Device delivery"
          value={permission === 'granted' ? 'Enabled' : permission === 'denied' ? 'Blocked' : 'Not enabled'}
          hint={permission === 'granted' ? 'Alerts appear in your system tray' : 'In-app alerts still work'}
          icon={Check}
          tone={permission === 'granted' ? 'leaf' : 'amber'}
        />
      </div>

      <Card className="mb-5 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-1 rounded-xl bg-bakery-50 p-1">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm ${
                  tab === entry.id ? 'bg-white text-bakery-800 shadow-sm' : 'text-bakery-800/70 hover:text-ink'
                }`}
              >
                {entry.label}
                {entry.id === 'unread' && unreadCount > 0 && <span className="ml-1.5 rounded-full bg-red-500 px-1.5 text-[10px] text-white">{unreadCount}</span>}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <SearchInput value={query} onChange={setQuery} placeholder="Search notifications…" className="w-full sm:w-56" />
            <Select value={severity} onChange={(event) => setSeverity(event.target.value)} className="w-full py-2 sm:w-auto">
              <option value="all">All severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Information</option>
            </Select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button size="sm" icon={CheckCheck} onClick={markAllRead} disabled={!unreadCount}>Mark all as read</Button>
          <Button size="sm" icon={Trash2} onClick={clearRead} disabled={!notifications.some((item) => item.read)}>Clear read</Button>
          <Button size="sm" icon={RefreshCw} onClick={refreshAlerts}>Refresh from inventory</Button>
          <Button size="sm" variant="ghost" icon={X} onClick={clearAll} disabled={!notifications.length}>Clear all</Button>
          {permission === 'denied' && (
            <p className="w-full text-xs text-amber-700">Device alerts are blocked. Allow notifications for this site in your browser or device settings.</p>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        {visible.length ? (
          <ul className="divide-y divide-line">
            {visible.map((item) => {
              const Icon = NotificationIcon(item)
              return (
                <li key={item.id} className={`flex gap-3 p-4 transition sm:gap-4 sm:p-5 ${item.read ? 'bg-white' : 'bg-bakery-50/40'}`}>
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${severityTone[item.severity] === 'red' ? 'bg-red-100 text-red-600' : severityTone[item.severity] === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-bakery-100 text-bakery-700'}`}>
                    <Icon size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => openItem(item)} className="text-left text-sm font-semibold text-ink hover:text-bakery-700 sm:text-base">
                        {item.title}
                      </button>
                      {!item.read && !item.resolved && <Badge tone="bakery">New</Badge>}
                      {item.resolved && <Badge tone="slate">Resolved</Badge>}
                      <Badge tone={severityTone[item.severity]}>{item.severity}</Badge>
                    </div>
                    <p className="mt-1 break-words text-sm leading-relaxed text-muted">{item.detail}</p>
                    <p className="mt-2 text-xs text-muted">
                      {relativeTime(item.createdAt)} · {formatDateTime(item.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-start gap-2">
                    <IconButton
                      icon={item.read ? Bell : Check}
                      label={item.read ? 'Mark as unread' : 'Mark as read'}
                      onClick={() => (item.read ? markUnread(item.id) : markRead(item.id))}
                    />
                    <IconButton icon={ArrowUpRight} label="Open related page" onClick={() => openItem(item)} />
                    <IconButton icon={X} label="Dismiss notification" onClick={() => dismissNotification(item.id)} />
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <EmptyState
            icon={Bell}
            title="Nothing here yet"
            description={
              notifications.length
                ? 'Try another filter. Open stock alerts are hidden from the Resolved tab.'
                : 'Stock alerts appear here automatically when inventory changes. Refresh to sync the latest alerts from your current data.'
            }
            action={
              notifications.length ? null : (
                <Button icon={RefreshCw} onClick={refreshAlerts}>Refresh alerts</Button>
              )
            }
          />
        )}
      </Card>

      <p className="mt-4 text-center text-xs text-muted">
        Tip: install this app to your device home screen to receive alerts in the device notification centre.
        {' '}Device delivery uses{' '}
        <button type="button" className="font-semibold text-bakery-700 underline" onClick={() => fireDeviceNotification({
          title: `JS Baking House is ready — ${data.business.name}`,
          body: 'You will receive low-stock and expiry alerts on this device.',
          url: '/notifications',
        })}>
          the built-in notification system
        </button>.
      </p>
    </div>
  )
}
