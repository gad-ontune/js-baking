import test from 'node:test'
import assert from 'node:assert/strict'
import { ApiError, createApiClient, mapAudit, mapUser, parseCookie } from '../src/lib/api.js'
import { hasPermission } from '../src/lib/permissions.js'

function mockFetch(response = { ok: true, status: 200, json: async () => ({}) }) {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    return response
  }
  return { calls, fetchImpl }
}

const jsonResponse = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
})

test('cookie parser reads the double-submit CSRF token', () => {
  assert.equal(parseCookie('other=1; jsbh_csrf=abc%20123; theme=dark', 'jsbh_csrf'), 'abc 123')
  assert.equal(parseCookie('', 'jsbh_csrf'), '')
  assert.equal(parseCookie('jsbh_csrf=token', 'missing'), '')
})

test('API requests always include cookies and never store them', async () => {
  const { calls, fetchImpl } = mockFetch(jsonResponse({ id: 'usr_1', username: 'amina', role: 'owner', active: true, created_at: '2026-01-01T00:00:00Z' }))
  const client = createApiClient({ baseUrl: '/api/v1', fetchImpl, getCookie: () => 'jsbh_csrf=should-not-be-sent' })

  await client.me()

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/api/v1/auth/me')
  assert.equal(calls[0].options.method, 'GET')
  assert.equal(calls[0].options.credentials, 'include')
  assert.equal(calls[0].options.headers['X-CSRF-Token'], undefined)
  assert.equal(JSON.stringify(calls[0].options).includes('should-not-be-sent'), false)
})

test('state-changing requests copy the CSRF cookie into a header', async () => {
  const { calls, fetchImpl } = mockFetch(jsonResponse({ id: 'usr_2', name: 'Brian', username: 'brian', role: 'staff', active: true, created_at: '2026-01-01T00:00:00Z' }))
  const client = createApiClient({
    baseUrl: 'https://bakery.test/api/v1',
    fetchImpl,
    getCookie: () => 'jsbh_session=opaque; jsbh_csrf=csrf-token-42',
  })

  await client.createUser({ name: 'Brian', username: 'brian', password: 'StrongDemoPass123' })

  assert.equal(calls[0].url, 'https://bakery.test/api/v1/users')
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(calls[0].options.credentials, 'include')
  assert.equal(calls[0].options.headers['X-CSRF-Token'], 'csrf-token-42')
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    name: 'Brian', username: 'brian', password: 'StrongDemoPass123',
  })
})

test('requests without a CSRF cookie do not invent a token', async () => {
  const { calls, fetchImpl } = mockFetch(jsonResponse(null, 204))
  const client = createApiClient({ fetchImpl, getCookie: () => '' })
  await client.logout()
  assert.equal(calls[0].options.headers['X-CSRF-Token'], undefined)
})

test('client methods use the expected routes and encode user ids', async () => {
  const { calls, fetchImpl } = mockFetch(jsonResponse([]))
  const client = createApiClient({ fetchImpl, getCookie: () => 'jsbh_csrf=token' })

  await client.listUsers()
  await client.updateRole('usr_1', 'manager')
  await client.updateStatus('usr_1', false)
  await client.revokeSessions('usr 1')
  await client.listAudit({ limit: 25, offset: 10 })

  assert.deepEqual(calls.map((call) => `${call.options.method} ${call.url}`), [
    'GET /api/v1/users',
    'PATCH /api/v1/users/usr_1/role',
    'PATCH /api/v1/users/usr_1/status',
    'POST /api/v1/users/usr%201/revoke-sessions',
    'GET /api/v1/audit?limit=25&offset=10',
  ])
})

test('business helpers use server-authoritative routes and send CSRF on writes', async () => {
  const { calls, fetchImpl } = mockFetch(jsonResponse({ ok: true }))
  const client = createApiClient({ fetchImpl, getCookie: () => 'jsbh_csrf=csrf-token-42' })

  await client.businessSnapshot()
  await client.createBusinessRecord('sale', { date: '2026-01-01', items: [] })
  await client.updateBusinessRecord('expense', 'exp-1', { amount: 100 })
  await client.reverseBusinessRecord('sale', 'sal 1', 'customer return')
  await client.recordStockMovement('inv 1', { type: 'Purchase', quantity: 5 })
  await client.recordSupplierPayment('pur-1', { amount: 250, method: 'Cash' })

  assert.deepEqual(calls.map((call) => `${call.options.method} ${call.url}`), [
    'GET /api/v1/business/snapshot',
    'POST /api/v1/business/sale',
    'PATCH /api/v1/business/expense/exp-1',
    'POST /api/v1/business/sale/sal%201/reverse',
    'POST /api/v1/business/inventory/inv%201/movement',
    'POST /api/v1/business/purchase/pur-1/payment',
  ])
  // Reads carry no CSRF header; every write does.
  assert.equal(calls[0].options.headers['X-CSRF-Token'], undefined)
  for (const call of calls.slice(1)) {
    assert.equal(call.options.headers['X-CSRF-Token'], 'csrf-token-42')
  }
  assert.deepEqual(JSON.parse(calls[1].options.body), { date: '2026-01-01', items: [] })
  assert.deepEqual(JSON.parse(calls[3].options.body), { reason: 'customer return' })
})

test('API errors expose status and detail without echoing request secrets', async () => {
  const secret = 'SuperSecretPassword123'
  const fetchImpl = async () => jsonResponse({ detail: 'Incorrect username or password.' }, 401)
  const client = createApiClient({ fetchImpl })

  await assert.rejects(
    () => client.login('amina', secret),
    (error) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.status, 401)
      assert.equal(error.message, 'Incorrect username or password.')
      assert.equal(error.message.includes(secret), false)
      return true
    },
  )
})

test('network failures become user-safe ApiError instances', async () => {
  const fetchImpl = async () => { throw new TypeError('Failed to fetch') }
  const client = createApiClient({ fetchImpl })

  await assert.rejects(
    () => client.me(),
    (error) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.network, true)
      assert.equal(error.message.includes('Failed to fetch'), false)
      return true
    },
  )
})

test('mappers convert backend records into frontend shapes', () => {
  const user = mapUser({
    id: 'usr_1', name: 'Amina', username: 'amina', email: '', role: 'owner',
    active: true, mfa_enabled: false, created_at: '2026-01-01T00:00:00Z',
    password_hash: '$argon2id$secret',
  })
  assert.deepEqual(Object.keys(user).sort(), ['active', 'createdAt', 'email', 'id', 'mfaEnabled', 'name', 'role', 'username'])
  assert.equal(user.email, '')
  assert.equal(user.password_hash, undefined)

  const audit = mapAudit({
    id: 'audit_1', event_type: 'AUTH', action: 'LOGIN_SUCCESS', entity: 'User',
    entity_id: 'usr_1', user_id: 'usr_1', outcome: 'success', details: null,
    created_at: '2026-01-02T00:00:00Z',
  })
  assert.equal(audit.date, '2026-01-02T00:00:00Z')
  assert.equal(audit.details, 'success')
  assert.equal(audit.userId, 'usr_1')
})

test('frontend permissions mirror backend RBAC', () => {
  assert.equal(hasPermission('owner', 'users.manage'), true)
  assert.equal(hasPermission('owner', 'audit.view'), true)
  assert.equal(hasPermission('manager', 'inventory.manage'), true)
  assert.equal(hasPermission('manager', 'users.manage'), false)
  assert.equal(hasPermission('manager', 'audit.view'), false)
  assert.equal(hasPermission('staff', 'purchases.view'), false)
  assert.equal(hasPermission('staff', 'sales.manage'), true)
  assert.equal(hasPermission('staff', 'settings.view'), false)
  assert.equal(hasPermission('unknown', 'dashboard.view'), false)
})
