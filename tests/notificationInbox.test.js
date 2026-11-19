import test from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../src/lib/format.js'
import { inventoryAlerts } from '../src/lib/analytics.js'
import {
  MAX_NOTIFICATIONS,
  alertId,
  filterNotifications,
  loadNotifications,
  persistNotifications,
  reconcileAlerts,
  sanitizeNotifications,
  storageKeyFor,
} from '../src/lib/notificationInbox.js'

const fixedNow = '2026-11-19T10:00:00.000Z'

const alert = (id, status, overrides = {}) => ({
  id,
  itemId: id,
  status,
  severity: 'warning',
  title: 'Low stock',
  detail: 'Flour is low.',
  item: { name: 'Flour' },
  ...overrides,
})

function withLocalStorage(fn) {
  const store = new Map()
  const previous = globalThis.localStorage
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  }
  try {
    return fn(store)
  } finally {
    if (previous === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previous
  }
}

test('reconcileAlerts creates inbox entries for live inventory alerts', () => {
  const result = reconcileAlerts([], [alert('inv-1', 'low')], fixedNow)
  assert.equal(result.changed, true)
  assert.equal(result.items.length, 1)
  assert.equal(result.fresh.length, 1)
  assert.equal(result.items[0].id, 'inventory:inv-1:low')
  assert.equal(result.items[0].title, 'Low stock: Flour')
  assert.equal(result.items[0].detail, 'Flour is low.')
  assert.equal(result.items[0].severity, 'warning')
  assert.equal(result.items[0].to, '/inventory/low-stock')
  assert.equal(result.items[0].read, false)
  assert.equal(result.items[0].resolved, false)
  assert.equal(result.items[0].createdAt, fixedNow)
})

test('expiry alerts link to the expiry page', () => {
  const result = reconcileAlerts([], [alert('inv-2', 'expiring', { title: 'Expiring soon' })], fixedNow)
  assert.equal(result.items[0].to, '/inventory/expiry')
  assert.equal(alertId({ id: 'inv-2', status: 'expiring' }), 'inventory:inv-2:expiring')
})

test('reconcileAlerts preserves read state and reopens a returning alert', () => {
  const existing = {
    id: 'inventory:inv-3:low',
    type: 'inventory',
    title: 'Low stock: Sugar',
    detail: 'Sugar is low.',
    severity: 'warning',
    to: '/inventory/low-stock',
    itemId: 'inv-3',
    createdAt: fixedNow,
    read: true,
    resolved: true,
  }
  const result = reconcileAlerts([existing], [alert('inv-3', 'low', { item: { name: 'Sugar' } })], fixedNow)
  assert.equal(result.fresh.length, 0)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].read, true)
  assert.equal(result.items[0].resolved, false)
})

test('reconcileAlerts resolves alerts that disappeared from inventory', () => {
  const existing = {
    id: 'inventory:inv-4:out',
    type: 'inventory',
    title: 'Out of stock: Bread',
    detail: 'Bread has no available stock.',
    severity: 'critical',
    to: '/inventory/low-stock',
    itemId: 'inv-4',
    createdAt: fixedNow,
    read: false,
    resolved: false,
  }
  const result = reconcileAlerts([existing], [], fixedNow)
  assert.equal(result.fresh.length, 0)
  assert.equal(result.items[0].resolved, true)
})

test('reconcileAlerts caps the inbox at 100 entries', () => {
  const alerts = Array.from({ length: 120 }, (_, index) => alert(`inv-${index}`, 'low'))
  const result = reconcileAlerts([], alerts, fixedNow)
  assert.equal(result.items.length, MAX_NOTIFICATIONS)
  assert.equal(result.fresh.length, 120)
})

test('persisted notifications are sanitised and stored per user', () => {
  withLocalStorage((store) => {
    const malicious = sanitizeNotifications([
      {
        id: 'note-1',
        title: 'Alert',
        detail: 'Details',
        severity: 'warning',
        to: 'https://evil.test/phish',
        createdAt: fixedNow,
        read: false,
        resolved: false,
      },
    ])
    assert.equal(malicious[0].to, '/notifications')

    persistNotifications('usr_amina', malicious)
    persistNotifications('usr_brian', [])
    assert.equal(store.has(storageKeyFor('usr_amina')), true)
    assert.equal(store.has(storageKeyFor('usr_brian')), true)
    assert.equal(loadNotifications('usr_amina')[0].id, 'note-1')
    assert.deepEqual(loadNotifications('usr_brian'), [])

    store.set('js-baking-house-notifications-v1', JSON.stringify(malicious))
    assert.deepEqual(loadNotifications(null), malicious)
    assert.deepEqual(loadNotifications('usr_new'), [])
  })
})

test('filterNotifications applies tabs, severity and search', () => {
  const items = [
    { id: 'a', title: 'Low stock: Flour', detail: 'Flour is low.', severity: 'warning', read: false, resolved: false },
    { id: 'b', title: 'Out of stock: Bread', detail: 'Bread is out.', severity: 'critical', read: true, resolved: false },
    { id: 'c', title: 'Expired: Butter', detail: 'Butter expired.', severity: 'critical', read: false, resolved: true },
  ]
  assert.deepEqual(filterNotifications(items).map((item) => item.id), ['a', 'b'])
  assert.deepEqual(filterNotifications(items, { tab: 'unread' }).map((item) => item.id), ['a'])
  assert.deepEqual(filterNotifications(items, { tab: 'read' }).map((item) => item.id), ['b'])
  assert.deepEqual(filterNotifications(items, { tab: 'resolved' }).map((item) => item.id), ['c'])
  assert.deepEqual(filterNotifications(items, { severity: 'critical' }).map((item) => item.id), ['b'])
  assert.deepEqual(filterNotifications(items, { query: 'butter' }).map((item) => item.id), [])
  assert.deepEqual(filterNotifications(items, { tab: 'resolved', query: 'butter' }).map((item) => item.id), ['c'])
})

test('inventoryAlerts derives all stock and expiry alert types from API data', () => {
  const soon = addDays(new Date(), 5).toISOString().slice(0, 10)
  const past = addDays(new Date(), -2).toISOString().slice(0, 10)
  const later = addDays(new Date(), 90).toISOString().slice(0, 10)
  const data = {
    business: { expiryWarningDays: 14 },
    inventory: [
      { id: 'a', name: 'Flour', quantity: 2, minQuantity: 5, expiryDate: later, archived: false },
      { id: 'b', name: 'Bread', quantity: 0, minQuantity: 5, expiryDate: later, archived: false },
      { id: 'c', name: 'Butter', quantity: 20, minQuantity: 5, expiryDate: past, archived: false },
      { id: 'd', name: 'Milk', quantity: 20, minQuantity: 5, expiryDate: soon, archived: false },
      { id: 'e', name: 'Sugar', quantity: 20, minQuantity: 5, expiryDate: later, archived: false },
      { id: 'f', name: 'Archived', quantity: 0, minQuantity: 5, expiryDate: past, archived: true },
    ],
  }
  assert.deepEqual(
    inventoryAlerts(data).map((item) => item.status),
    ['out', 'expired', 'low', 'expiring'],
  )
})
