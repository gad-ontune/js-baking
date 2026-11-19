/**
 * Browser API client for the JS Baking House security backend.
 *
 * Authentication is handled by the server with HttpOnly cookies. This client
 * never reads, stores or forwards the session cookie; it only copies the
 * non-HttpOnly double-submit CSRF token into the X-CSRF-Token header.
 */

const DEFAULT_BASE_URL = '/api/v1'

export class ApiError extends Error {
  constructor(message, { status = 0, network = false, errors = [] } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.network = network
    this.errors = errors
  }
}

function browserCookieText() {
  if (typeof document === 'undefined') return ''
  return document.cookie || ''
}

export function parseCookie(cookieText, name) {
  if (!cookieText || typeof name !== 'string') return ''
  for (const part of String(cookieText).split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    if (part.slice(0, separator).trim() === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim())
      } catch {
        return part.slice(separator + 1).trim()
      }
    }
  }
  return ''
}

export function mapUser(user = {}) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email || '',
    role: user.role,
    active: Boolean(user.active),
    mfaEnabled: Boolean(user.mfa_enabled),
    createdAt: user.created_at,
  }
}

export function mapAudit(entry = {}) {
  return {
    id: entry.id,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entity_id || null,
    details: entry.details || entry.outcome || '',
    outcome: entry.outcome,
    userId: entry.user_id || null,
    date: entry.created_at,
  }
}

function resolvedBaseUrl() {
  const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined
  return (env && env.VITE_API_BASE_URL) || DEFAULT_BASE_URL
}

/**
 * Create a client. `fetchImpl` and `getCookie` are injectable so the security
 * behaviour can be unit tested without a browser.
 */
export function createApiClient({
  baseUrl = resolvedBaseUrl(),
  fetchImpl = (...args) => globalThis.fetch(...args),
  getCookie = browserCookieText,
} = {}) {
  const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

  async function request(path, { method = 'GET', body, signal } = {}) {
    const normalizedMethod = method.toUpperCase()
    const url = /^https?:\/\//i.test(path) ? path : `${baseUrl.replace(/\/$/, '')}/${String(path).replace(/^\//, '')}`

    const headers = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (!SAFE_METHODS.has(normalizedMethod)) {
      const cookieValue = typeof getCookie === 'function' ? getCookie() : getCookie
      const csrfToken = parseCookie(cookieValue, 'jsbh_csrf')
      if (csrfToken) headers['X-CSRF-Token'] = csrfToken
    }

    let response
    try {
      response = await fetchImpl(url, {
        method: normalizedMethod,
        headers,
        credentials: 'include',
        signal,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      })
    } catch (error) {
      throw new ApiError('The security API is unavailable. Check that the backend is running.', {
        network: true,
      })
    }

    if (response.status === 204) return null

    let payload = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }

    if (!response.ok) {
      const detail = payload && typeof payload.detail === 'string'
        ? payload.detail
        : 'The request could not be completed.'
      throw new ApiError(detail, {
        status: response.status,
        errors: Array.isArray(payload?.errors) ? payload.errors : [],
      })
    }

    return payload
  }

  return {
    request,
    me: async () => mapUser(await request('/auth/me')),
    login: async (username, password) => {
      const payload = await request('/auth/login', {
        method: 'POST',
        body: { username, password },
      })
      return { user: mapUser(payload.user), csrfToken: payload.csrf_token, sessionExpiresAt: payload.session_expires_at }
    },
    logout: () => request('/auth/logout', { method: 'POST' }),
    changePassword: async (currentPassword, newPassword) => {
      const payload = await request('/auth/change-password', {
        method: 'POST',
        body: { current_password: currentPassword, new_password: newPassword },
      })
      return { user: mapUser(payload.user), csrfToken: payload.csrf_token }
    },
    listUsers: async () => (await request('/users')).map(mapUser),
    createUser: async (payload) => mapUser(await request('/users', { method: 'POST', body: payload })),
    updateRole: async (userId, role) =>
      mapUser(await request(`/users/${encodeURIComponent(userId)}/role`, { method: 'PATCH', body: { role } })),
    updateStatus: async (userId, active) =>
      mapUser(await request(`/users/${encodeURIComponent(userId)}/status`, { method: 'PATCH', body: { active } })),
    revokeSessions: (userId) =>
      request(`/users/${encodeURIComponent(userId)}/revoke-sessions`, { method: 'POST' }),
    listAudit: async ({ limit = 100, offset = 0 } = {}) =>
      (await request(`/audit?limit=${limit}&offset=${offset}`)).map(mapAudit),

    // Business records. The server owns ids, references, totals, stock levels
    // and reversal state; the client only sends the raw user inputs.
    businessSnapshot: () => request('/business/snapshot'),
    resetDemoBusiness: () => request('/business/demo/reset', { method: 'POST', body: {} }),
    listBusinessRecords: (kind) => request(`/business/${encodeURIComponent(kind)}`),
    createBusinessRecord: (kind, payload) =>
      request(`/business/${encodeURIComponent(kind)}`, { method: 'POST', body: payload }),
    updateBusinessRecord: (kind, recordId, payload) =>
      request(`/business/${encodeURIComponent(kind)}/${encodeURIComponent(recordId)}`, {
        method: 'PATCH',
        body: payload,
      }),
    reverseBusinessRecord: (kind, recordId, reason) =>
      request(`/business/${encodeURIComponent(kind)}/${encodeURIComponent(recordId)}/reverse`, {
        method: 'POST',
        body: { reason },
      }),
    recordStockMovement: (itemId, payload) =>
      request(`/business/inventory/${encodeURIComponent(itemId)}/movement`, {
        method: 'POST',
        body: payload,
      }),
    recordSupplierPayment: (purchaseId, payload) =>
      request(`/business/purchase/${encodeURIComponent(purchaseId)}/payment`, {
        method: 'POST',
        body: payload,
      }),
  }
}

export const api = createApiClient()
