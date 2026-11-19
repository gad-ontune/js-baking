import { safeInternalPath } from './security.js'

export const NOTIFICATION_STORAGE_PREFIX = 'js-baking-house-notifications-v1'
export const LEGACY_STORAGE_KEY = 'js-baking-house-notifications-v1'
export const MAX_NOTIFICATIONS = 100

const SEVERITIES = new Set(['critical', 'warning', 'info'])

export const storageKeyFor = (userId) => `${NOTIFICATION_STORAGE_PREFIX}:${userId || 'anonymous'}`

export const newNotificationId = () =>
  `note_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`

/** Normalise persisted inbox entries and strip unsafe navigation targets. */
export function sanitizeNotifications(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => item && typeof item.id === 'string' && item.id && typeof item.title === 'string' && item.title && typeof item.createdAt === 'string')
    .map((item) => ({
      id: item.id,
      title: item.title,
      detail: typeof item.detail === 'string' ? item.detail : '',
      severity: SEVERITIES.has(item.severity) ? item.severity : 'info',
      type: item.type === 'inventory' ? 'inventory' : 'system',
      to: safeInternalPath(item.to) || '/notifications',
      itemId: typeof item.itemId === 'string' ? item.itemId : null,
      createdAt: item.createdAt,
      read: Boolean(item.read),
      resolved: Boolean(item.resolved),
    }))
}

export function loadNotifications(userId) {
  try {
    const key = storageKeyFor(userId)
    const raw = localStorage.getItem(key)
    if (raw === null && !userId) {
      // Migrate the pre-authentication demo inbox once; authenticated users
      // never inherit another account's read/resolved state.
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
      return sanitizeNotifications(legacy ? JSON.parse(legacy) : null)
    }
    return sanitizeNotifications(raw ? JSON.parse(raw) : null)
  } catch {
    return []
  }
}

export function persistNotifications(userId, items) {
  try {
    localStorage.setItem(storageKeyFor(userId), JSON.stringify(sanitizeNotifications(items)))
  } catch {
    // Storage may be unavailable; the in-memory inbox still works.
  }
}

export const destinationFor = (alert) => {
  if (alert?.status === 'expiring' || alert?.status === 'expired' || alert?.status === 'warning') return '/inventory/expiry'
  return '/inventory/low-stock'
}

export const alertId = (alert) => `inventory:${alert.id}:${alert.status}`

/**
 * Reconcile live inventory alerts with the saved inbox.
 *
 * Matching alerts keep their read/resolved history and are reopened when the
 * stock problem returns. Alerts that disappeared are marked resolved rather
 * than deleted, so the Resolved tab still explains what changed.
 */
export function reconcileAlerts(existing, alerts, now = new Date().toISOString()) {
  const current = sanitizeNotifications(existing)
  if (!Array.isArray(alerts)) return { items: current, fresh: [], changed: false }

  const byId = new Map(current.map((item) => [item.id, item]))
  const activeIds = new Set()
  const fresh = []

  const synced = alerts.map((alert) => {
    if (!alert || alert.id === undefined || alert.id === null) return null
    const id = alertId(alert)
    activeIds.add(id)
    const title = alert.item ? `${alert.title}: ${alert.item.name}` : alert.title
    const currentItem = byId.get(id)
    const shared = {
      title,
      detail: typeof alert.detail === 'string' ? alert.detail : '',
      severity: SEVERITIES.has(alert.severity) ? alert.severity : 'info',
      to: destinationFor(alert),
      resolved: false,
    }

    if (currentItem) return { ...currentItem, ...shared }

    const item = {
      id,
      type: 'inventory',
      ...shared,
      itemId: alert.itemId ?? alert.id,
      createdAt: now,
      read: false,
    }
    fresh.push(item)
    return item
  }).filter(Boolean)

  const inactive = current
    .filter((item) => !activeIds.has(item.id))
    .map((item) => (item.type === 'inventory' && !item.resolved ? { ...item, resolved: true } : item))

  const items = [...synced, ...inactive]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, MAX_NOTIFICATIONS)

  return { items, fresh, changed: JSON.stringify(items) !== JSON.stringify(current) }
}

/** Shared filter used by the bell summary and the notification centre page. */
export function filterNotifications(items, { tab = 'all', severity = 'all', query = '' } = {}) {
  let list = Array.isArray(items) ? items : []
  if (tab === 'resolved') list = list.filter((item) => item.resolved)
  else if (tab === 'unread') list = list.filter((item) => !item.read && !item.resolved)
  else if (tab === 'read') list = list.filter((item) => item.read && !item.resolved)
  else list = list.filter((item) => !item.resolved)

  if (severity !== 'all') list = list.filter((item) => item.severity === severity)
  const term = String(query || '').trim().toLowerCase()
  if (term) list = list.filter((item) => `${item.title} ${item.detail}`.toLowerCase().includes(term))
  return list
}
