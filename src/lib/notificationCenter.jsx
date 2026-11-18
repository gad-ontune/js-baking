import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { safeInternalPath } from './security'

const STORAGE_KEY = 'js-baking-house-notifications-v1'
const MAX_NOTIFICATIONS = 100
const NotificationContext = createContext(null)

function loadNotifications() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed)
      ? parsed
        .filter((item) => item?.id && item?.title && typeof item?.createdAt === 'string')
        .map((item) => ({ ...item, to: safeInternalPath(item.to) || '/notifications' }))
      : []
  } catch {
    return []
  }
}

const newId = () => `note_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`

const destinationFor = (alert) => {
  if (alert.status === 'expiring' || alert.status === 'expired' || alert.status === 'warning') return '/inventory/expiry'
  return '/inventory/low-stock'
}

/**
 * Shared notification inbox. Business alerts are synchronised from live data,
 * so read state survives reloads while open alerts stay up to date.
 */
export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState(loadNotifications)
  const notificationsRef = useRef(notifications)

  const commit = useCallback((next) => {
    notificationsRef.current = next
    setNotifications(next)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications))
    } catch {
      // Storage may be unavailable; the inbox still works for this session.
    }
  }, [notifications])

  /**
   * Reconcile live business alerts with the saved inbox and return only the
   * newly created ones, so the caller can deliver them to the device.
   */
  const syncAlerts = useCallback(
    (alerts) => {
      if (!Array.isArray(alerts)) return []

      const now = new Date().toISOString()
      const existing = notificationsRef.current
      const byId = new Map(existing.map((item) => [item.id, item]))
      const activeIds = new Set()
      const fresh = []

      const synced = alerts.map((alert) => {
        const id = `inventory:${alert.id}:${alert.status}`
        activeIds.add(id)
        const title = alert.item ? `${alert.title}: ${alert.item.name}` : alert.title
        const current = byId.get(id)

        if (current) {
          return {
            ...current,
            title,
            detail: alert.detail,
            severity: alert.severity,
            to: destinationFor(alert),
            resolved: false,
          }
        }

        const item = {
          id,
          type: 'inventory',
          title,
          detail: alert.detail,
          severity: alert.severity,
          to: destinationFor(alert),
          itemId: alert.itemId,
          createdAt: now,
          read: false,
          resolved: false,
        }
        fresh.push(item)
        return item
      })

      const inactive = existing
        .filter((item) => !activeIds.has(item.id))
        .map((item) => (item.type === 'inventory' && !item.resolved ? { ...item, resolved: true } : item))

      const next = [...synced, ...inactive]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, MAX_NOTIFICATIONS)

      if (JSON.stringify(next) !== JSON.stringify(existing)) commit(next)
      return fresh
    },
    [commit],
  )

  const addNotification = useCallback(
    ({ title, detail, severity = 'info', to = '/notifications', type = 'system' }) => {
      const item = {
        id: newId(),
        type,
        title,
        detail,
        severity,
        to,
        createdAt: new Date().toISOString(),
        read: false,
        resolved: false,
      }
      commit([item, ...notificationsRef.current].slice(0, MAX_NOTIFICATIONS))
      return item
    },
    [commit],
  )

  const markRead = useCallback(
    (id) => {
      commit(notificationsRef.current.map((item) => (item.id === id ? { ...item, read: true } : item)))
    },
    [commit],
  )

  const markUnread = useCallback(
    (id) => {
      commit(notificationsRef.current.map((item) => (item.id === id ? { ...item, read: false } : item)))
    },
    [commit],
  )

  const markAllRead = useCallback(() => {
    commit(notificationsRef.current.map((item) => ({ ...item, read: true })))
  }, [commit])

  const dismissNotification = useCallback(
    (id) => {
      commit(notificationsRef.current.filter((item) => item.id !== id))
    },
    [commit],
  )

  const clearRead = useCallback(() => {
    commit(notificationsRef.current.filter((item) => !item.read))
  }, [commit])

  const clearAll = useCallback(() => commit([]), [commit])

  const active = useMemo(() => notifications.filter((item) => !item.resolved), [notifications])
  const unreadCount = active.filter((item) => !item.read).length
  const criticalCount = active.filter((item) => item.severity === 'critical').length

  const value = useMemo(
    () => ({
      notifications,
      active,
      unreadCount,
      criticalCount,
      syncAlerts,
      addNotification,
      markRead,
      markUnread,
      markAllRead,
      dismissNotification,
      clearRead,
      clearAll,
    }),
    [
      notifications,
      active,
      unreadCount,
      criticalCount,
      syncAlerts,
      addNotification,
      markRead,
      markUnread,
      markAllRead,
      dismissNotification,
      clearRead,
      clearAll,
    ],
  )

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) throw new Error('useNotifications must be used inside NotificationProvider')
  return context
}
