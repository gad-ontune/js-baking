import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from './store'
import { inventoryAlerts } from './analytics'
import { fireDeviceNotification } from './deviceNotifications'
import {
  MAX_NOTIFICATIONS,
  loadNotifications,
  newNotificationId,
  persistNotifications,
  reconcileAlerts,
} from './notificationInbox'

const NotificationContext = createContext(null)

const createInbox = (userId) => ({ userId, items: loadNotifications(userId) })

/**
 * Shared notification inbox. Alerts are derived from the authoritative business
 * snapshot by the provider itself, so the bell and the dedicated page always
 * see the same live data. Read/dismiss state is stored per signed-in user.
 */
export function NotificationProvider({ children }) {
  const { currentUser, data, hydrated } = useStore()
  const userId = currentUser?.id || 'anonymous'
  const [inbox, setInbox] = useState(() => createInbox(userId))
  const notificationsRef = useRef(inbox.items)
  const devicePrimedRef = useRef(false)

  // Switching accounts must not leak one user's read/resolved state to another.
  useEffect(() => {
    setInbox((previous) => {
      if (previous.userId === userId) return previous
      const next = createInbox(userId)
      notificationsRef.current = next.items
      devicePrimedRef.current = false
      return next
    })
  }, [userId])

  useEffect(() => {
    persistNotifications(inbox.userId, inbox.items)
  }, [inbox])

  const commit = useCallback((next) => {
    const items = typeof next === 'function' ? next(notificationsRef.current) : next
    notificationsRef.current = items
    setInbox((previous) => ({ ...previous, items }))
  }, [])

  /**
   * Reconcile live business alerts with the saved inbox and return only the
   * newly created ones, so the caller can deliver them to the device.
   */
  const syncAlerts = useCallback(
    (alerts) => {
      const result = reconcileAlerts(notificationsRef.current, alerts)
      if (result.changed) commit(result.items)
      return result.fresh
    },
    [commit],
  )

  const addNotification = useCallback(
    ({ title, detail, severity = 'info', to = '/notifications', type = 'system' }) => {
      const item = {
        id: newNotificationId(),
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

  const alerts = useMemo(() => inventoryAlerts(data), [data])
  const refreshAlerts = useCallback(() => syncAlerts(inventoryAlerts(data)), [data, syncAlerts])

  // Keep the inbox in step with live inventory alerts. Device delivery is
  // suppressed until the first server snapshot has been applied, so signing in
  // never floods the device with historical demo alerts.
  useEffect(() => {
    const fresh = syncAlerts(alerts)
    if (!hydrated) return
    if (!devicePrimedRef.current) {
      devicePrimedRef.current = true
      return
    }
    if (!fresh.length) return

    fresh.slice(0, 3).forEach((item) => {
      fireDeviceNotification({
        title: `${item.title} — ${data.business?.name || 'JS Baking House'}`,
        body: item.detail,
        tag: `alert-${item.id}`,
        url: item.to,
      })
    })
    if (fresh.length > 3) {
      fireDeviceNotification({
        title: `${fresh.length - 3} more alerts — ${data.business?.name || 'JS Baking House'}`,
        body: 'Open the notification centre to review all open alerts.',
        tag: 'alerts-summary',
        url: '/notifications',
      })
    }
  }, [alerts, data.business?.name, hydrated, syncAlerts, userId])

  const notifications = inbox.items
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
      refreshAlerts,
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
      refreshAlerts,
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
